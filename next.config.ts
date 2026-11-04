import type { NextConfig } from "next";

const pdfAssets = [
  "./node_modules/academic-pdfjs/legacy/build/*.mjs",
  "./node_modules/academic-pdfjs/standard_fonts/**/*",
  "./node_modules/academic-pdfjs/cmaps/**/*",
  "./node_modules/academic-pdfjs/wasm/**/*",
];

const nextConfig: NextConfig = {
  serverExternalPackages: ["academic-pdfjs", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/sessions/*/upload": pdfAssets,
    "/api/extract-document": pdfAssets,
  },
};

export default nextConfig;
