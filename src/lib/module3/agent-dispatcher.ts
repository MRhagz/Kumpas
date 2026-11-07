import { operationalEvent } from "@/lib/operational-log";
import { ProcessingBudget, ProcessingError } from "@/lib/processing-budget";
import { academicAuditorAgent } from "./academic-auditor-agent";
import { industryAnalystAgent } from "./industry-analyst-agent";
import { feasibilityStrategistAgent } from "./feasibility-strategist-agent";
import {
  getPublicErrorMessage,
} from "./agent-errors";
import type { AgentOutput, AnalysisInput } from "./types";

function createFailedOutput(
  agentName: AgentOutput["agentName"],
  error: unknown,
): AgentOutput {
  return {
    agentName,
    status: "FAILED",
    analysis: "",
    retrievedChunks: [],
    error: getPublicErrorMessage(error),
  };
}


export class AgentDispatcher {
  async dispatch(input: AnalysisInput, budget = new ProcessingBudget()): Promise<AgentOutput[]> {
    const { approvedProfile } = input;

    const academicAuditorKey =
      process.env.ACADEMIC_AUDITOR_API_KEY?.trim() ?? "";
    const industryAnalystKey =
      process.env.INDUSTRY_ANALYST_API_KEY?.trim() ?? "";
    const feasibilityStrategistKey =
      process.env.FEASIBILITY_STRATEGIST_API_KEY?.trim() ?? "";

    const runSpecialist = async (fn: () => Promise<AgentOutput>, name: AgentOutput["agentName"]) => {
      const stages = {
        AcademicAuditor: "academic_audit",
        IndustryAnalyst: "industry_analysis",
        FeasibilityStrategist: "feasibility_analysis",
      } as const;
      const stage = stages[name];
      const startedAt = Date.now();
      try {
        const result = await fn();
        operationalEvent(stage, result.status === "FAILED" ? "failure" : "success", startedAt,
          { id: budget.runId, ...(result.status === "FAILED" ? { code: "operation_failed" as const } : {}) });
        return result;
      } catch (error) {
        operationalEvent(stage, "failure", startedAt, { id: budget.runId, code: "operation_failed" });
        if (error instanceof ProcessingError && (error.code === "deadline" || error.code === "stale")) throw error;
        return createFailedOutput(name, error);
      }
    };
    const outputs = await Promise.all([
      runSpecialist(
        () => academicAuditorAgent.analyze(approvedProfile, academicAuditorKey, budget),
        "AcademicAuditor",
      ),
      runSpecialist(
        () => industryAnalystAgent.analyze(approvedProfile, industryAnalystKey, budget),
        "IndustryAnalyst",
      ),
      runSpecialist(
        () => feasibilityStrategistAgent.analyze(approvedProfile, feasibilityStrategistKey, budget),
        "FeasibilityStrategist",
      ),
    ]);

    budget.assert("specialist analysis");
    return outputs;
  }
}

export const agentDispatcher = new AgentDispatcher();
