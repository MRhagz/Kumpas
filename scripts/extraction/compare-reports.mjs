import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export function compareReports(previous, candidate) {
  if (previous.execution !== "live_gemini_mocked_persistence" || candidate.execution !== previous.execution) throw new Error("Two live extraction reports are required");
  if (!previous.manifestSha256 || previous.manifestSha256 !== candidate.manifestSha256 ||
      previous.rows.length !== 30 || candidate.rows.length !== 30 ||
      previous.rows.some((row, i) => row.id !== candidate.rows[i].id || row.sha256 !== candidate.rows[i].sha256)) {
    throw new Error("Reports must use the identical frozen 30-document corpus in the same order");
  }
  const identity = report => ({ build: report.build, model: report.model, promptVersion: report.promptVersion, sourceHashes: report.sourceHashes });
  const keys = report => new Set(report.rows.flatMap(row => row.mismatches.map(mismatch => `${row.id}/${mismatch.field}`)));
  const before = keys(previous), after = keys(candidate);
  return { execution: "live_report_comparison", manifestSha256: previous.manifestSha256,
    previous: identity(previous), candidate: identity(candidate),
    counts: { previous: previous.overall, candidate: candidate.overall },
    newMismatches: [...after].filter(key => !before.has(key)),
    resolvedMismatches: [...before].filter(key => !after.has(key)),
    candidateFieldsRequiringInvestigation: candidate.fieldsRequiringInvestigation,
    releaseReady: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (process.argv.length !== 4) throw new Error("Usage: npm run extraction:compare -- previous.json candidate.json");
    console.log(JSON.stringify(compareReports(...process.argv.slice(2).map(path => JSON.parse(readFileSync(path, "utf8")))), null, 2));
  } catch {
    console.error("Comparison failed: supply two live reports from the identical frozen corpus. No live result was inferred.");
    process.exitCode = 1;
  }
}
