import { BRAND } from "@/lib/brand";

export const PUBLIC_CONFIG = {
  contactEmail:
    process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "support@lastcallleads.com",
  legalName:
    process.env.NEXT_PUBLIC_BUSINESS_LEGAL_NAME?.trim() || BRAND.name,
  postalAddress:
    process.env.NEXT_PUBLIC_BUSINESS_POSTAL_ADDRESS?.trim() || "",
  effectiveDate: "September 5, 2026",
  // Where customers manage billing, cancel, and download invoices.
  // Dodo is the Merchant of Record, so their portal handles all of it —
  // the customer never has to email support to cancel.
  billingPortalUrl:
    process.env.NEXT_PUBLIC_BILLING_PORTAL_URL?.trim() ||
    "https://customer.dodopayments.com",
};
