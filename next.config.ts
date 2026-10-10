import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The dev badge sits on top of the sidebar's brokerage card; errors still show without it.
  devIndicators: false,
  // The Claude setup page zips these folders on request, so a hosted build has to carry them.
  outputFileTracingIncludes: { "/api/download": ["./extension/**/*", "./claude-skill/**/*"] },
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
