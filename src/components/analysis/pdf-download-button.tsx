"use client";

import { Download } from "lucide-react";

interface PdfDownloadButtonProps {
  downloadUrl: string;
  fileName: string;
}

export default function PdfDownloadButton({
  downloadUrl,
  fileName,
}: PdfDownloadButtonProps) {
  const handleDownload = () => {
    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = fileName;
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-forest"
    >
      <Download size={16} />
      Download PDF
    </button>
  );
}
