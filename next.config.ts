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
    // Vercel's Linux functions need sharp's addon and its matching libvips.
    "/api/**": ["./node_modules/@img/sharp-linux-x64/**/*", "./node_modules/@img/sharp-libvips-linux-x64/**/*"],
    "/api/sessions/*/upload": pdfAssets,
    "/api/extract-document": pdfAssets,
  },
};

export default nextConfig;
