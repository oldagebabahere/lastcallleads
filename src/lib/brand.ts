// Single source of truth for the brand. Change the name for the ENTIRE
// site by setting one environment variable — no code edits:
//   NEXT_PUBLIC_BRAND_NAME = "whatever you pick"
import { siteUrl } from "@/lib/site";

export const BRAND = {
  name: (process.env.NEXT_PUBLIC_BRAND_NAME ?? "").trim() || "Last Call Leads",
  tagline: "New liquor-license filings, before the doors open",
  get url() {
    return siteUrl();
  },
};
