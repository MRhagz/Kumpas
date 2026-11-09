import { isAlignmentScore } from "@/lib/report/types";

const comparisonLabels = {
  Aptitude: "Aptitude fit",
  "Work-opportunity": "Work opportunities",
  "Practical-requirements": "Practical requirements",
};

export default function ReportScoreStatement({ text }: { text: string }) {
  // Stored student summaries use these two server-authored sentence formats.
  // Split them for display only; preserve all other wording verbatim.
  const comparison = text.match(
    /^(Aptitude|Work-opportunity|Practical-requirements) comparison: (\d+(?:\.\d+)?) out of 100, (.+)$/,
  );
  const tradeOff = text.match(
    /^Lowest component score: (.+) \((\d+(?:\.\d+)?)\/100\)\. (.+)$/,
  );
  const match = comparison ?? tradeOff;
  const score = match ? Number(match[2]) : null;
  if (!match || !isAlignmentScore(score)) return <p>{text}</p>;

  const label = comparison
    ? comparisonLabels[comparison[1] as keyof typeof comparisonLabels]
    : `Lowest component: ${match[1]}`;
  const explanation = match[3][0].toUpperCase() + match[3].slice(1);
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-xs font-semibold">{label}</p>
        <p className="shrink-0 text-lg font-bold tabular-nums">
          {score.toFixed(2)}
          <span className="ml-1 text-xs font-normal">/ 100</span>
        </p>
      </div>
      <p className="mt-1 text-sm leading-relaxed">{explanation}</p>
    </div>
  );
}
