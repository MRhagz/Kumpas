import { afterEach, expect, it, vi } from "vitest";
import { ProcessingBudget, ProviderError } from "@/lib/processing-budget";
import { authorizeMaintenance } from "@/lib/auth/maintenance";
import { buildAgentPanels } from "@/lib/analysis-helpers";
import { AgentOperationError } from "@/lib/module3/agent-errors";
import { operationalEvent } from "@/lib/operational-log";

afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });
it("keeps bounded specialist diagnostics without logging provider messages", () => {
  const marker = "PRIVATE_student_prompt_api_key";
  const error = new AgentOperationError("FeasibilityStrategist", "analysis generation",
    Object.assign(new Error(`API key not valid ${marker}`), { status: 400 }));
  const warn = vi.fn();
  operationalEvent("feasibility_analysis", "failure", Date.now(), {
    log: { info: vi.fn(), warn }, code: "operation_failed",
    providerStatus: error.status, agentStage: error.stage, providerFailure: error.category,
  });
  expect(warn).toHaveBeenCalledWith("operational_event", expect.objectContaining({
    providerStatus: 400, agentStage: "analysis generation", providerFailure: "credential",
  }));
  expect(JSON.stringify(warn.mock.calls)).not.toContain(marker);
});
it("classifies malformed provider output separately from HTTP errors", () => {
  const error = new AgentOperationError("FeasibilityStrategist", "analysis generation", new SyntaxError("PRIVATE"));
  expect(error.category).toBe("invalid_response");
  expect(error.status).toBeUndefined();
});
it("S06 drops seeded content from provider failures, stage names and run IDs while keeping retry measurements", async () => {
  vi.useFakeTimers();
  const calls: unknown[] = [];
  vi.spyOn(console, "info").mockImplementation((...args) => { calls.push(args); });
  vi.spyOn(console, "warn").mockImplementation((...args) => { calls.push(args); });
  const marker = "PRIVATE_notes_model_upload_token_signed-url_secret";
  const budget = new ProcessingBudget(Date.now() + 10000, marker);
  const operation = vi.fn().mockRejectedValueOnce(new ProviderError(503, null, { content: marker }))
    .mockResolvedValue(marker);
  const result = budget.run(marker, operation);
  await vi.advanceTimersByTimeAsync(2000);
  expect(await result).toBe(marker);
  const logs = JSON.stringify(calls);
  expect(logs).not.toContain(marker);
  expect(logs).toContain("retry_scheduled");
  expect(logs).toContain("durationMs");
  expect(calls).toHaveLength(3);
});
it("S06 does not dump model output when building counselor panels", () => {
  const log = vi.spyOn(console, "log").mockImplementation(() => {});
  const output = { key_signals: [], supporting_data: [], summary: "PRIVATE" } as never;
  buildAgentPanels(output, output, output);
  expect(log).not.toHaveBeenCalled();
});
it("S11 treats counselor tokens and other maintenance credentials as insufficient", () => {
  const request = (headers = {}) => new Request("https://example.test", { headers });
  expect(authorizeMaintenance(request({ authorization: "Bearer counselor-jwt" }), "session-key", "x-session-cleanup-secret")).toBe(false);
  expect(authorizeMaintenance(request({ "x-report-retention-secret": "report-key" }), "session-key", "x-session-cleanup-secret")).toBe(false);
  expect(authorizeMaintenance(request({ "x-session-cleanup-secret": "session-key" }), undefined, "x-session-cleanup-secret")).toBe(false);
  expect(authorizeMaintenance(request({ authorization: "Bearer session-key" }), "session-key", "x-session-cleanup-secret")).toBe(true);
});
