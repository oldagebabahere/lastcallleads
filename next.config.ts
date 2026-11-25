import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Don't advertise the framework (minor security-through-obscurity win).
  poweredByHeader: false,
  // Force all human & search-engine traffic off *.vercel.app onto canonical https://lastcallleads.com
  // while leaving /api/* untouched so internal Vercel crons/webhooks never drop Authorization headers.
  async redirects() {
    return [
      {
        source: "/",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        destination: "https://lastcallleads.com/",
        permanent: true,
      },
      {
        source: "/:first((?!api$)[a-zA-Z0-9_.-]+)",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        destination: "https://lastcallleads.com/:first",
        permanent: true,
      },
      {
        source: "/:first((?!api$)[a-zA-Z0-9_.-]+)/:rest*",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        destination: "https://lastcallleads.com/:first/:rest*",
        permanent: true,
      },
    ];
  },
  // The coverage page lives at /src/app/coverage-page (NOT /coverage) because
  // workspace snapshotting excludes directories named "coverage". This rewrite
  // keeps the public URL exactly /coverage.
  async rewrites() {
    return [{ source: "/coverage", destination: "/coverage-page" }];
  },
  // Baseline security headers across every route + strict noindex on *.vercel.app.
  async headers() {
    return [
      {
        source: "/(.*)",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
      },
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
