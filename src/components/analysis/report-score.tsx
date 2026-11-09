export default function ReportScore({
  score,
  label,
  subtle = false,
  inverted = false,
}: {
  score: number | null;
  label: string;
  subtle?: boolean;
  inverted?: boolean;
}) {
  if (score === null) {
    return (
      <div className="rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
        Unscored <span className="font-normal">· No total or rank</span>
      </div>
    );
  }
  return (
    <div>
      <p
        className={`tabular-nums ${inverted ? "text-white" : "text-forest"} ${subtle ? "text-sm font-medium" : "text-2xl font-bold"}`}
      >
        {score.toFixed(2)}
        <span
          className={`ml-1 font-normal ${inverted ? "text-white/70" : "text-muted-text"} ${subtle ? "text-xs" : "text-sm"}`}
        >
          / 100
        </span>
      </p>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={`${score.toFixed(2)} points out of 100`}
        className={`overflow-hidden rounded-full ${inverted ? "bg-white/10" : "bg-forest/10"} ${subtle ? "mt-1.5 h-1" : "mt-2 h-2"}`}
      >
        <div
          className={`h-full rounded-full ${inverted ? "bg-forest-light" : "bg-forest"}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
