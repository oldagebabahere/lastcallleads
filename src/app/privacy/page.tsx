import type { Metadata } from "next";
import LegalPage, { LegalList, LegalSection } from "@/components/legal-page";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How Last Call Leads collects, uses, stores and protects customer and website data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Privacy policy"
      title="Privacy, without mystery."
      intro="This policy explains what information we collect, why we use it, which service providers process it, and how you can exercise your choices."
    >
      <LegalSection title="1. Who controls the data">
        <p>{PUBLIC_CONFIG.legalName} operates this service. Contact: <a className="text-amber" href={`mailto:${PUBLIC_CONFIG.contactEmail}`}>{PUBLIC_CONFIG.contactEmail}</a>.</p>
        {PUBLIC_CONFIG.postalAddress && <p>Mailing address: {PUBLIC_CONFIG.postalAddress}.</p>}
      </LegalSection>
      <LegalSection title="2. Information we collect">
        <LegalList>
          <li>Account and subscription details: name, email, plan, selected states, billing status and email preferences.</li>
          <li>Messages you submit through the contact form, including company and message content.</li>
          <li>Basic operational logs needed to secure, diagnose and run the service.</li>
          <li>Public government records, including licensee/applicant names, business addresses, license types and filing dates.</li>
          <li>Payment providers process card/bank details. We do not store full payment-card numbers.</li>
        </LegalList>
      </LegalSection>
      <LegalSection title="3. How we use information">
        <LegalList>
          <li>Deliver selected filing alerts and operate subscriptions.</li>
          <li>Answer support, correction, sales and press inquiries.</li>
          <li>Detect abuse, maintain security, measure system health and improve the product.</li>
          <li>Meet legal, accounting, tax and payment obligations.</li>
        </LegalList>
      </LegalSection>
      <LegalSection title="4. Service providers and transfers">
        <p>We use infrastructure and processors that may include Vercel or Netlify (hosting), Neon (PostgreSQL), GitHub (code automation), Resend (email), and Dodo Payments (payment processing, as Merchant of Record). These providers may process data in the United States or other countries under their own security and privacy terms.</p>
      </LegalSection>
      <LegalSection title="5. Cookies and analytics">
        <p>The core site does not currently require advertising cookies. Hosting and payment providers may set essential security or checkout cookies. If optional analytics or advertising tools are added, this policy and any required consent controls will be updated first.</p>
      </LegalSection>
      <LegalSection title="6. Retention">
        <p>Subscription and transaction records are retained while needed to provide the service and satisfy legal/accounting duties. Contact messages are retained for support history. Operational logs are periodically trimmed. Public-license history may be retained to provide historical comparisons and corrections.</p>
      </LegalSection>
      <LegalSection title="7. Your choices and rights">
        <p>You may ask to access, correct or delete information you submitted, subject to legal retention requirements. Every digest includes an email opt-out. Opting out of alerts does not automatically cancel a paid subscription; contact support or use the payment provider to cancel billing.</p>
      </LegalSection>
      <LegalSection title="8. Public records">
        <p>Liquor-license information originates from government sources and is presented for business intelligence and public-interest research. If a source record is corrected, send us the official URL so we can review our copy.</p>
      </LegalSection>
      <LegalSection title="9. Security and children">
        <p>We use reasonable technical and organizational safeguards, but no online system is guaranteed perfectly secure. The service is intended for business users and is not directed to children under 18.</p>
      </LegalSection>
      <LegalSection title="10. Changes">
        <p>We may update this policy when the product or providers change. The effective date above will be revised. Material changes may also be communicated to active customers.</p>
      </LegalSection>
    </LegalPage>
  );
}
