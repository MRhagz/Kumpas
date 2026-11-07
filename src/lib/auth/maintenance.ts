import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/** Each maintenance capability has its own server-only credential; counselor JWTs grant none. */
export function authorizeMaintenance(request: Request, secret: string | undefined, header: string): boolean {
  if (!secret?.trim()) return false;
  const bearer = request.headers.get("authorization");
  const provided = request.headers.get(header) ?? (bearer?.startsWith("Bearer ") ? bearer.slice(7).trim() : null);
  if (!provided) return false;
  const hash = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(hash(provided), hash(secret));
}
