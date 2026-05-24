import "server-only";

import { supabaseAdmin } from "@/lib/supabase";

export type ModuleProgressStatus =
  | "not_started"
  | "in_progress"
  | "complete"
  | "failed";

export type ReportStatus =
  | "not_started"
  | "generating"
  | "ready"
  | "downloaded"
  | "failed";

export interface ModuleStatus {
  intake: ModuleProgressStatus;
  profile: ModuleProgressStatus;
  analysis: ModuleProgressStatus;
  report: ModuleProgressStatus;
}

export const DEFAULT_MODULE_STATUS: ModuleStatus = {
  intake: "not_started",
  profile: "not_started",
  analysis: "not_started",
  report: "not_started",
};

export class SessionProgressTracker {
  async initializeSession(sessionId: string): Promise<void> {
    await this.updateSession(sessionId, {
      module_status: DEFAULT_MODULE_STATUS,
      report_status: "not_started",
      completed_at: null,
    });
  }

  async markIntakeInProgress(sessionId: string): Promise<void> {
    await this.patchModuleStatus(sessionId, { intake: "in_progress" });
  }

  async markProfileApproved(sessionId: string): Promise<void> {
    await this.patchModuleStatus(sessionId, {
      intake: "complete",
      profile: "complete",
    });
  }

  async markAnalysisInProgress(sessionId: string): Promise<void> {
    await this.patchModuleStatus(sessionId, { analysis: "in_progress" });
  }

  async markAnalysisComplete(sessionId: string): Promise<void> {
    await this.patchModuleStatus(sessionId, { analysis: "complete" });
  }

  async markAnalysisFailed(sessionId: string): Promise<void> {
    await this.patchModuleStatus(sessionId, { analysis: "failed" });
  }

  async markReportGenerating(sessionId: string): Promise<void> {
    await this.patchModuleStatus(sessionId, { report: "in_progress" }, "generating");
  }

  async markReportReady(sessionId: string): Promise<void> {
    await this.patchModuleStatus(sessionId, { report: "complete" }, "ready");
  }

  async markReportFailed(sessionId: string): Promise<void> {
    await this.patchModuleStatus(sessionId, { report: "failed" }, "failed");
  }

  async markReportDownloaded(sessionId: string): Promise<void> {
    await this.patchModuleStatus(sessionId, { report: "complete" }, "downloaded", {
      status: "completed",
      completed_at: new Date().toISOString(),
    });
  }

  private async patchModuleStatus(
    sessionId: string,
    patch: Partial<ModuleStatus>,
    reportStatus?: ReportStatus,
    extraUpdates: Record<string, unknown> = {},
  ): Promise<void> {
    const currentStatus = await this.getModuleStatus(sessionId);

    await this.updateSession(sessionId, {
      module_status: {
        ...currentStatus,
        ...patch,
      },
      ...(reportStatus ? { report_status: reportStatus } : {}),
      ...extraUpdates,
    });
  }

  private async getModuleStatus(sessionId: string): Promise<ModuleStatus> {
    const { data, error } = await supabaseAdmin
      .from("sessions")
      .select("module_status")
      .eq("id", sessionId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to load module progress: ${error.message}`);
    }

    return normalizeModuleStatus(data?.module_status);
  }

  private async updateSession(
    sessionId: string,
    updates: Record<string, unknown>,
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from("sessions")
      .update({
        ...updates,
        last_activity: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (error) {
      throw new Error(`Failed to update session progress: ${error.message}`);
    }
  }
}

export function normalizeModuleStatus(value: unknown): ModuleStatus {
  if (!isModuleStatusRecord(value)) {
    return DEFAULT_MODULE_STATUS;
  }

  return {
    intake: normalizeProgressStatus(value.intake),
    profile: normalizeProgressStatus(value.profile),
    analysis: normalizeProgressStatus(value.analysis),
    report: normalizeProgressStatus(value.report),
  };
}

function isModuleStatusRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeProgressStatus(value: unknown): ModuleProgressStatus {
  if (
    value === "not_started" ||
    value === "in_progress" ||
    value === "complete" ||
    value === "failed"
  ) {
    return value;
  }

  return "not_started";
}

export const sessionProgressTracker = new SessionProgressTracker();
