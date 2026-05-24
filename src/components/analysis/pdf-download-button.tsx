"use client";

import { Download } from "lucide-react";

interface PdfDownloadButtonProps {
  downloadUrl: string;
  fileName: string;
  disabled?: boolean;
  onDownloadStart?: () => void | Promise<void>;
}

export default function PdfDownloadButton({
  downloadUrl,
  fileName,
  disabled = false,
  onDownloadStart,
}: PdfDownloadButtonProps) {
  const handleDownload = async () => {
    if (disabled) {
      return;
    }

    try {
      await onDownloadStart?.();
    } catch (error) {
      console.warn("[PdfDownloadButton] Download status update failed.", error);
    }

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
      disabled={disabled}
      className="inline-flex items-center justify-center gap-2 rounded-lg bg-ink px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-forest disabled:cursor-not-allowed disabled:bg-muted-text disabled:opacity-70"
    >
      <Download size={16} />
      {disabled ? "Link Expired" : "Download PDF"}
    </button>
  );
}
