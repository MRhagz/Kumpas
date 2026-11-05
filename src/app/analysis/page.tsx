import AnalysisPage from "@/components/analysis/analysis-page";
import WorkflowBoundary from "@/components/auth/workflow-boundary";
import { requireWorkflowAccess } from "@/lib/auth/workflow-access";

export default async function Page({
  searchParams,
}: { searchParams: Promise<{ session?: string }> }) {
  const { session } = await searchParams;
  const user = await requireWorkflowAccess("/analysis", session);
  return <WorkflowBoundary userId={user.id}><AnalysisPage /></WorkflowBoundary>;
}
