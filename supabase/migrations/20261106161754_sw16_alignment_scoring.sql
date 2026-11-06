-- SW-16: nullable 0–100 scoring contract. Preserve legacy rows without relabeling them.
alter table public.ranked_recommendations
  alter column rank drop not null,
  alter column alignment_score drop not null,
  alter column aptitude_fit drop not null,
  alter column market_demand drop not null,
  alter column financial_feasibility drop not null,
  add column score_contract text not null default 'legacy-0-1',
  add column component_evidence jsonb,
  add column score_weights jsonb,
  add column approved_profile_version integer;

alter table public.ranked_recommendations
  add constraint ranked_recommendations_score_contract check (score_contract in ('legacy-0-1', '0-100-v1')),
  add constraint ranked_recommendations_supported_scores check (
    score_contract = 'legacy-0-1' or (
      (aptitude_fit is null or aptitude_fit between 0 and 100) and
      (market_demand is null or market_demand between 0 and 100) and
      (financial_feasibility is null or financial_feasibility between 0 and 100) and
      (aptitude_fit is not null or market_demand is not null or financial_feasibility is not null) and
      score_weights is not null and score_weights = '{"aptitude":0.35,"demand":0.40,"feasibility":0.25}'::jsonb and
      component_evidence is not null and
      case when aptitude_fit is null or market_demand is null or financial_feasibility is null
        then alignment_score is null and rank is null and status = 'incomplete' and nullif(btrim(incomplete_reason), '') is not null
        else alignment_score is not null and alignment_score between 0 and 100
          and rank is not null and rank > 0
          and alignment_score::numeric = round(((35 * aptitude_fit::numeric + 40 * market_demand::numeric + 25 * financial_feasibility::numeric) / 100), 2)
      end
    )
  );

comment on column public.ranked_recommendations.score_contract is
  'Legacy 0–1 rows require regeneration; 0-100-v1 uses 35/40/25 weights and nullable partial comparisons.';
