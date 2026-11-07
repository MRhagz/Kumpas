import { supabaseAdmin } from "@/lib/supabase";
import { requireUser, unauthorizedResponse, notFoundResponse, userOwnsSession } from "@/lib/auth/api-auth";
import { readDraftPdf } from "@/lib/report/access";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });

export async function POST(request: Request, { params }: { params: Promise<{ sessionId: string }> }) {
  const user = await requireUser();
  if (!user) return unauthorizedResponse();
  const { sessionId } = await params;
  if (!(await userOwnsSession(sessionId, user.id))) return notFoundResponse();
  let body;
  try { body = await request.json(); } catch { return json({ error: "Invalid review request." }, 400); }
  if (!body || !Number.isSafeInteger(body.profileVersion) || body.profileVersion < 1 ||
    !Number.isSafeInteger(body.reportVersion) || body.reportVersion < 1 ||
    typeof body.runId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.runId) ||
    !["approved", "rejected", "regenerate", "correct"].includes(body.decision)) return json({ error: "Exact report, profile, run and decision are required." }, 400);
  try {
    // Unmarked legacy PDFs need regeneration before they can be approved.
    if (body.decision === "approved" && !(await readDraftPdf(sessionId, user.id, body.reportVersion))) {
      return json({ error: "This draft cannot be approved. Reload the report or regenerate it." }, 409);
    }
    const isDecision = body.decision === "approved" || body.decision === "rejected";
    const operation = isDecision ? "decide_report_version" : body.decision === "correct" ? "prepare_report_correction" : "regenerate_report_version";
    const { data, error } = await supabaseAdmin.rpc(operation, {
      p_session_id: sessionId, p_counselor_id: user.id, p_expected_version: body.profileVersion,
      p_report_version: body.reportVersion, p_run_id: body.runId,
      ...(isDecision ? { p_decision: body.decision } : {}),
    });
    if (error || !data) return json({ error: "This report changed or was already reviewed. Reload its current state." }, 409);
    if (body.decision === "correct") return json({ sessionId });
    return json(body.decision === "regenerate" ? { runId: data.run_id, profileVersion: data.approved_profile_version } : {
      reportVersion: data.report_version, approvedProfileVersion: data.approved_profile_version,
      reviewStatus: data.status, reviewedAt: data.reviewed_at, reviewedBy: data.reviewed_by,
    });
  } catch {
    return json({ error: "Report review could not be confirmed. Reload before trying again." }, 502);
  }
}
