export default function ReportScore({
  score,
  label,
}: {
  score: number | null;
  label: string;
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
      <p className="text-2xl font-bold tabular-nums text-forest">
        {score.toFixed(2)}
        <span className="ml-1 text-sm font-normal text-muted-text">/ 100</span>
      </p>
      <div
        role="meter"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={score}
        aria-valuetext={`${score.toFixed(2)} points out of 100`}
        className="mt-2 h-2 overflow-hidden rounded-full bg-forest/10"
      >
        <div
          className="h-full rounded-full bg-forest"
          style={{ width: `${score}%` }}
        />
      </div>
    </div>
  );
}
