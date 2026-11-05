import { expect, it } from "vitest";
import { unstable_doesMiddlewareMatch } from "next/experimental/testing/server";
import { config } from "@/proxy";
import nextConfig from "../next.config";

it("avoids Next body-clone truncation only on independently authorized academic upload routes", () => {
  for (const url of ["/api/extract-document", "/api/sessions/abc/upload", "/api/sessions/abc/upload?docType=nat", "/api/extract-notes", "/api/sessions/abc/approve"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(false);
  }
  for (const url of ["/input", "/analysis", "/login", "/auth/confirm"]) {
    expect(unstable_doesMiddlewareMatch({ config, nextConfig, url })).toBe(true);
  }
});
