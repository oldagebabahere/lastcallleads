import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Playfair_Display, EB_Garamond, JetBrains_Mono } from "next/font/google";
import { BRAND } from "@/lib/brand";
import "./globals.css";

// Wine-bar / premium label feel: an elegant luxury serif for headlines,
// a warm readable serif for body (the kind you see on a tasting menu).
const display = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
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
  openGraph: {
    title: "PourWatch — new liquor filings, before the doors open",
    description:
      "Applications filed = buyers deciding in the next 60–90 days. Be the first call.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#140a0e",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${sans.variable} ${mono.variable}`}>
      <body className="grain">{children}</body>
    </html>
  );
}
