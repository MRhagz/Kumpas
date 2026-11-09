import { useState } from "react";
import ReportDownloadView from "@/components/analysis/report-download-view";
import { reportFixture } from "../../tests/fixtures/report-presentation";

export default function ReportPreview() {
  const [report, setReport] = useState(() =>
    reportFixture(
      new URLSearchParams(location.search).get("scenario") ?? "complete",
    ),
  );
  return (
    <main className="py-6">
      <ReportDownloadView
        report={report}
        onNewSession={() => {}}
        onReview={async (decision) => {
          if (decision === "approved" || decision === "rejected")
            setReport((current) => ({
              ...current,
              reviewStatus: decision,
              downloadUrl:
                decision === "approved" ? "/synthetic-approved.pdf" : null,
            }));
        }}
      />
    </main>
  );
}
