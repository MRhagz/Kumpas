import { academicAuditorAgent } from "./academic-auditor-agent";
import { industryAnalystAgent } from "./industry-analyst-agent";
import { feasibilityStrategistAgent } from "./feasibility-strategist-agent";
import type { AgentOutput, AnalysisInput } from "./types";

async function runWithRetry(
  fn: () => Promise<AgentOutput>,
  agentName: AgentOutput["agentName"],
): Promise<AgentOutput> {
  try {
    return await fn();
  } catch (firstError) {
    console.warn(`[${agentName}] First attempt failed, retrying...`, firstError);
    try {
      return await fn();
    } catch (retryError) {
      console.error(`[${agentName}] Retry failed`, retryError);
      return {
        agentName,
        status: "FAILED",
        analysis: "",
        retrievedChunks: [],
        error: retryError instanceof Error ? retryError.message : String(retryError),
      };
    }
  }
}

export class AgentDispatcher {
  async dispatch(input: AnalysisInput): Promise<AgentOutput[]> {
    const { approvedProfile } = input;

    const academicAuditorKey = process.env.ACADEMIC_AUDITOR_API_KEY!;
    const industryAnalystKey = process.env.INDUSTRY_ANALYST_API_KEY!;
    const feasibilityStrategistKey = process.env.FEASIBILITY_STRATEGIST_API_KEY!;

    const outputs = await Promise.all([
      runWithRetry(
        () => academicAuditorAgent.analyze(approvedProfile, academicAuditorKey),
        "AcademicAuditor",
      ),
      runWithRetry(
        () => industryAnalystAgent.analyze(approvedProfile, industryAnalystKey),
        "IndustryAnalyst",
      ),
      runWithRetry(
        () => feasibilityStrategistAgent.analyze(approvedProfile, feasibilityStrategistKey),
        "FeasibilityStrategist",
      ),
    ]);

    return outputs;
  }
}

export const agentDispatcher = new AgentDispatcher();
