import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework (minor security-through-obscurity win).
  poweredByHeader: false,
  // The coverage page lives at /src/app/coverage-page (NOT /coverage) because
  // workspace snapshotting excludes directories named "coverage". This rewrite
  // keeps the public URL exactly /coverage.
  async rewrites() {
    return [{ source: "/coverage", destination: "/coverage-page" }];
  },
  // Baseline security headers across every route.
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
