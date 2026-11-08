/** Platform failures can arrive as HTML/text before a route can return JSON. */
export function processingHttpError(status: number, stage: string): string {
  if ([502, 503, 504].includes(status)) {
    return `${stage} was interrupted by the hosting platform or an unavailable service (${status}). Your saved inputs remain available. Reload to check whether the draft finished. If analysis is still running, wait for its five-minute limit before retrying. Ask the deployment owner to verify Vercel Fluid compute, the 300-second function limit and provider availability.`;
  }
  return `${stage} failed (${status}). Reload the session and retry, or return to Confirm Information.`;
}
