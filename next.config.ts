import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  /* config options here */
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // These packages use native bindings (.node files) or Web Workers that
  // Turbopack cannot bundle into ESM chunks. Marking them as external makes
  // Next.js require() them at runtime instead of trying to bundle them.
  serverExternalPackages: [
    '@napi-rs/canvas',
    'tesseract.js',
    'canvas',
  ],
};

export default nextConfig;
