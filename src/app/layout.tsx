import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Playfair_Display, EB_Garamond, Inter_Tight, JetBrains_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import ScrollProgress from "@/components/scroll-progress";
import "./globals.css";

// Editorial mix: a light modern grotesque for headlines (the "premium animated
// site" look), Playfair italics for accent phrases (the bar-luxe brand voice),
// a warm readable serif for body, mono for registry/terminal details.
const display = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["300", "400", "500", "600", "700"],
});

const serifAccent = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-serif-accent",
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

const sans = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-sans-body",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const mono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-mono-code",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"
  ),
  title: {
    default: `${BRAND.name} — new bar & restaurant liquor filings, before they open`,
    template: `%s · ${BRAND.name}`,
  },
  description:
    `${BRAND.name} watches liquor-license records across ten US states every morning. The moment a new bar, restaurant or package store files, it lands in your inbox — weeks before the doors open.`,
  keywords: [
    "liquor license leads",
    "new bar filings",
    "TABC new applications",
    "NY SLA pending licenses",
    "California ABC filings",
    "bar opening leads",
    "distributor sales leads",
  ],
  alternates: {
    canonical: "/",
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
    <html
      lang="en"
      suppressHydrationWarning
      className={`${display.variable} ${serifAccent.variable} ${sans.variable} ${mono.variable}`}
    >
      <body className="grain">
        {/* theme bootstrap — runs before first paint so there is no flash */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(!t&&window.matchMedia&&matchMedia("(prefers-color-scheme: dark)").matches)t="dark";if(t==="dark")document.documentElement.dataset.theme="dark";}catch(e){}})();`,
          }}
        />
        <ScrollProgress />
        {children}
      </body>
    </html>
  );
}
