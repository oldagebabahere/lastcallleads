import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

const AI_AND_SEARCH_BOTS = [
  "Googlebot",
  "Googlebot-Image",
  "Googlebot-News",
  "Google-Extended",
  "Bingbot",
  "bingbot",
  "MSNBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "GPTBot",
  "Claude-SearchBot",
  "Claude-User",
  "ClaudeBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Applebot",
  "Applebot-Extended",
  "DuckAssistBot",
  "Meta-ExternalAgent",
  "FacebookExternalHit",
  "CCBot",
  "cohere-ai",
];

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  return {
    rules: [
      {
        userAgent: AI_AND_SEARCH_BOTS,
        allow: "/",
        disallow: ["/api/", "/coverage-page"],
      },
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/coverage-page"],
      },
    ],
    sitemap: `${base}/sitemap.xml`,
    host: base,
  };
}
