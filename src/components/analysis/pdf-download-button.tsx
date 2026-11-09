"use client";

import { Download } from "lucide-react";

interface PdfDownloadButtonProps {
  downloadUrl: string;
  fileName: string;
  disabled?: boolean;
  expired?: boolean;
}

export default function PdfDownloadButton({
  downloadUrl,
  fileName,
  disabled = false,
  expired = false,
}: PdfDownloadButtonProps) {
  const handleDownload = () => {
    if (disabled || expired) {
      return;
    }

    const anchor = document.createElement("a");
    anchor.href = downloadUrl;
    anchor.download = fileName;
    anchor.target = "_blank";
    anchor.rel = "noopener noreferrer";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  };

  return (
    <button
      type="button"
      onClick={handleDownload}
      disabled={disabled || expired}
      className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-white px-4 py-2.5 text-sm font-semibold text-ink transition-colors hover:bg-cream-light disabled:cursor-not-allowed disabled:opacity-60"
    >
      <Download size={16} />
      {expired ? "Link Expired" : "Download PDF"}
    </button>
  );
}
