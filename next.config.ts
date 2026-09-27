import type { NextConfig } from "next";

/**
 * The whole village runs and persists in the browser, so the site is a
 * static export: no server, no API routes, no runtime network.
 */
const nextConfig: NextConfig = {
  output: "export",
  images: { unoptimized: true },
};

export default nextConfig;
