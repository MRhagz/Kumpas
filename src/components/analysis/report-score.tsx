export default function ReportScore({
  score,
  label,
  subtle = false,
}: {
  score: number | null;
  label: string;
  subtle?: boolean;
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
        className={`tabular-nums ${subtle ? "text-sm font-medium text-muted-text" : "text-2xl font-bold text-forest"}`}
      >
        {score.toFixed(2)}
        <span
          className={`ml-1 font-normal text-muted-text ${subtle ? "text-xs" : "text-sm"}`}
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
        className={`overflow-hidden rounded-full bg-forest/10 ${subtle ? "mt-1.5 h-1" : "mt-2 h-2"}`}
      >
        <div
          className={`h-full rounded-full ${subtle ? "bg-muted-text" : "bg-forest"}`}
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
