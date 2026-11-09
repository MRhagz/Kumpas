import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ProcessingBudget } from "@/lib/processing-budget";
import type { AgentOutput } from "@/lib/module3/types";
import type { ApprovedProfile } from "@/types";

const agents = vi.hoisted(() => ({ academic: vi.fn(), industry: vi.fn(), feasibility: vi.fn() }));
vi.mock("@/lib/module3/academic-auditor-agent", () => ({ academicAuditorAgent: { analyze: agents.academic } }));
vi.mock("@/lib/module3/industry-analyst-agent", () => ({ industryAnalystAgent: { analyze: agents.industry } }));
vi.mock("@/lib/module3/feasibility-strategist-agent", () => ({ feasibilityStrategistAgent: { analyze: agents.feasibility } }));
import { agentDispatcher } from "@/lib/module3/agent-dispatcher";

const profile: ApprovedProfile = { sessionId: "synthetic", sessionTimestamp: "2026-11-08T00:00:00Z", academicData: {},
  counselorNotes: { careerGoal: "Undecided", interests: "Science", financial: "", concerns: "", impression: "" } };
const success = (agentName: AgentOutput["agentName"]): AgentOutput => ({ agentName, status: "SUCCESS", analysis: "Synthetic supported result", retrievedChunks: [] });
beforeEach(() => {
  vi.useFakeTimers(); vi.clearAllMocks();
  agents.academic.mockResolvedValue(success("AcademicAuditor"));
  agents.industry.mockResolvedValue(success("IndustryAnalyst"));
  agents.feasibility.mockImplementation((_profile, _key, budget: ProcessingBudget) =>
    budget.run("FeasibilityStrategist analysis generation", () => new Promise(() => {})));
});
afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); });

it("a hung specialist preserves successful outputs and time for synthesis/PDF", async () => {
  const budget = new ProcessingBudget();
  let settled = false;
  const pending = agentDispatcher.dispatch({ sessionId: "synthetic", approvedProfile: profile }, budget);
  void pending.then(() => { settled = true; });
  await vi.advanceTimersByTimeAsync(180000);
  expect(settled).toBe(true);
  const outputs = await pending;
  expect(outputs.map(output => output.status)).toEqual(["SUCCESS", "SUCCESS", "FAILED"]);
  expect(outputs[2].error).toContain("processing allowance");
  expect(budget.deadlineAt - Date.now()).toBe(120000);
  expect(agents.academic).toHaveBeenCalledTimes(1);
  expect(agents.industry).toHaveBeenCalledTimes(1);
  expect(agents.feasibility).toHaveBeenCalledTimes(1);
});

it("an expired parent budget cannot become a successful partial analysis", async () => {
  const pending = agentDispatcher.dispatch({ sessionId: "synthetic", approvedProfile: profile }, new ProcessingBudget(Date.now() + 1000));
  const checked = expect(pending).rejects.toMatchObject({ code: "deadline" });
  await vi.advanceTimersByTimeAsync(1000); await checked;
});
