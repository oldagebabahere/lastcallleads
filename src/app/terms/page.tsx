import type { Metadata } from "next";
import LegalPage, { LegalList, LegalSection } from "@/components/legal-page";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "Terms governing use of Last Call Leads public data pages and paid filing-alert subscriptions.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Terms of service"
      title="Terms built for a clear deal."
      intro="By using the site or purchasing a subscription, you agree to these terms. If you use the service for a company, you confirm that you can accept them for that company."
    >
      <LegalSection title="1. The service">
        <p>{PUBLIC_CONFIG.legalName} monitors selected public liquor-license sources, normalizes records, publishes research pages and delivers alerts. Coverage, fields and refresh timing vary by state. We are not affiliated with any government agency.</p>
      </LegalSection>
      <LegalSection title="2. Eligibility and accounts">
        <p>You must be at least 18 and legally able to enter a contract. Provide accurate billing/contact information and protect any private links or credentials. Notify us promptly of suspected unauthorized use.</p>
      </LegalSection>
      <LegalSection title="3. Subscriptions and renewal">
        <p>Paid plans renew automatically at the displayed billing interval until canceled. Prices and included features are shown at checkout. Taxes may be calculated by the Merchant of Record/payment provider. We may change future pricing with advance notice; existing paid periods are not retroactively repriced.</p>
      </LegalSection>
      <LegalSection title="4. Cancellation and email preferences">
        <p>You may cancel future renewal through the payment provider or by contacting support. Cancellation normally remains effective through the paid period. Stopping alert emails is separate from canceling billing.</p>
      </LegalSection>
      <LegalSection title="5. Acceptable use">
        <LegalList>
          <li>Use the service for lawful business research, prospecting and internal analysis.</li>
          <li>Do not attack, overload, reverse engineer, resell, mirror or systematically extract the service.</li>
          <li>Do not use data for harassment, discrimination, deception, unlawful surveillance or illegal marketing.</li>
          <li>Comply with CAN-SPAM and other laws when contacting prospects; the official nature of this data does not remove your compliance duties.</li>
        </LegalList>
      </LegalSection>
      <LegalSection title="6. Data accuracy and corrections">
        <p>Government feeds may be delayed, incomplete, changed or wrong. Alerts are intelligence signals, not legal or licensing advice. Verify important facts with the linked government source before acting. We welcome documented correction requests.</p>
      </LegalSection>
      <LegalSection title="7. Intellectual property">
        <p>The software, design, normalization, analysis, branding and original editorial material belong to the operator or licensors. Government source records remain subject to applicable public-record rules. Limited quotations from public reports are allowed with attribution and a link.</p>
      </LegalSection>
      <LegalSection title="8. Availability and changes">
        <p>We aim for reliable operation but do not promise uninterrupted availability or permanent coverage of any portal. State systems, third-party infrastructure and laws change. We may repair, replace, pause or discontinue features when reasonably necessary.</p>
      </LegalSection>
      <LegalSection title="9. Disclaimer and liability">
        <p>To the maximum extent allowed by law, the service is provided “as is” without implied warranties. We are not liable for indirect, incidental, special or consequential losses, lost opportunities or decisions based on a record. Our aggregate liability for a claim will not exceed the amount you paid for the service during the three months before that claim.</p>
      </LegalSection>
      <LegalSection title="10. Suspension and termination">
        <p>We may suspend access for payment failure, security risk, unlawful use or material breach. You remain responsible for charges incurred before termination.</p>
      </LegalSection>
      <LegalSection title="11. Contact and disputes">
        <p>Contact <a className="text-amber" href={`mailto:${PUBLIC_CONFIG.contactEmail}`}>{PUBLIC_CONFIG.contactEmail}</a> first so we can try to resolve a concern informally. Applicable mandatory consumer or local laws are not waived by these terms. The operator should obtain local counsel before launch to select governing-law and dispute clauses appropriate to its registered location.</p>
      </LegalSection>
    </LegalPage>
  );
}
