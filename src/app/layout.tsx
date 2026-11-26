import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import ScrollProgress from "@/components/scroll-progress";
import { Analytics } from "@vercel/analytics/react";
import "./globals.css";

// Editorial Google Fonts loaded cleanly via stylesheet so Next.js 16 builds
// never fail on build-time Google Font scraper hiccups.
const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=EB+Garamond:ital,wght@0,400..600;1,400..600&family=Inter+Tight:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400..700;1,400..700&display=swap";

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "https://lastcallleads.com"
  ),
  title: {
    default: `${BRAND.name} — new bar & restaurant liquor filings, before they open`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    `${BRAND.name} monitors official US state liquor-license portals across 9 live markets (Texas, New York, California, Illinois (Chicago), Washington, Oregon, Colorado, Connecticut, and Missouri) every morning — delivering venue addresses, LLC entities, direct phones, beverage program fit, interactive territory maps & 1-click Google Maps routes before doors open.`,
  keywords: [
    "liquor license leads",
    "new bar filings",
    "TABC new applications",
    "NY SLA pending licenses",
    "California ABC filings",
    "bar opening leads",
    "distributor sales leads",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  alternates: {
    types: {
      "application/rss+xml": "https://lastcallleads.com/rss.xml",
      "text/plain": "https://lastcallleads.com/llms.txt",
    },
  },
  openGraph: {
    title: `${BRAND.name} — new liquor filings, before the doors open`,
    description:
      "Applications filed = buyers deciding in the next 60–90 days. Be the first call.",
    type: "website",
    siteName: BRAND.name,
  },
  twitter: {
    card: "summary_large_image",
    title: `${BRAND.name} — new liquor filings, before the doors open`,
    description:
      "Applications filed = buyers deciding in the next 60–90 days. Be the first call.",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0709",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link rel="stylesheet" href={GOOGLE_FONTS_HREF} />
      </head>
      <body className="grain">
        {/* theme bootstrap — runs before first paint so there is no flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(!t&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)t="dark";if(t==="dark")document.documentElement.dataset.theme="dark";}catch(e){}})();`,
          }}
        />
        <ScrollProgress />
        {process.env.VERCEL ? <Analytics /> : null}
        {children}
      </body>
    </html>
  );
}
