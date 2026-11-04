import "server-only";
import { notFound, redirect } from "next/navigation";
import { requireUser, userOwnsSession } from "@/lib/auth/api-auth";

export async function requireWorkflowAccess(path: string, sessionId?: string) {
  const user = await requireUser();
  if (!user) {
    const next = path + (sessionId ? `?session=${encodeURIComponent(sessionId)}` : "");
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }
  if (sessionId && !(await userOwnsSession(sessionId, user.id))) notFound();
  return user;
}
