import type { Metadata } from "next";
import LegalPage, { LegalList, LegalSection } from "@/components/legal-page";
import { PUBLIC_CONFIG } from "@/lib/public-config";

export const metadata: Metadata = {
  title: "Cancellation and refund policy",
  description: "How subscriptions, cancellations, duplicate charges, service issues and refund requests are handled.",
};

export default function RefundsPage() {
  return (
    <LegalPage
      eyebrow="Cancellation & refunds"
      title="Cancellation & refund rules."
      intro="Clear, tight rules so the price stays low for everyone using the service honestly. Statutory rights always apply and are never waived."
    >
      <LegalSection title="Cancel anytime">
        <p>You can cancel future renewal through the checkout provider or by contacting <a className="text-amber" href={`mailto:${PUBLIC_CONFIG.contactEmail}`}>{PUBLIC_CONFIG.contactEmail}</a>. Cancellation normally takes effect at the end of the current paid period, and access may continue until then.</p>
      </LegalSection>
      <LegalSection title="You already tried it free">
        <p>Every plan starts with a <strong>7-day free trial, no card required</strong> — the full service, same-morning alerts, everything. Because you can evaluate the product completely before any payment, charges made after the trial are treated as final.</p>
      </LegalSection>
      <LegalSection title="The 48-hour first-charge window">
        <p>Refunds are considered only for a <strong>first subscription charge</strong>, requested within <strong>48 hours</strong> of that charge. Renewal charges are committed for their period once the period begins.</p>
      </LegalSection>
      <LegalSection title="Eligibility conditions">
        <LegalList>
          <li>The request arrives within 48 hours of the first charge, from the email address used at checkout.</li>
          <li>The account shows no meaningful use: no CSV export, no unlocked filing views, and at most one digest email received.</li>
          <li>The request states the charge date and amount.</li>
        </LegalList>
        <p>Once alerts have been delivered and used — digests opened, leads unlocked, CSV exported — the service has been delivered in full and the charge is not refundable.</p>
      </LegalSection>
      <LegalSection title="Always refundable">
        <LegalList>
          <li>Duplicate charges for the same period.</li>
          <li>Card/bank errors caused by our billing system.</li>
          <li>A verified multi-day total service outage that prevented delivery.</li>
          <li>Anything required by applicable law or the Merchant of Record’s rules — those rights always override this page.</li>
        </LegalList>
      </LegalSection>
      <LegalSection title="Not refundable">
        <p>Renewal charges, completed periods, normal variations in filing volume, missed sales opportunities, leads that were available but not worked, or dissatisfaction with lead volume in a chosen territory. We deliver the monitoring service — we do not guarantee sales outcomes.</p>
      </LegalSection>
      <LegalSection title="Service credit instead">
        <p>For borderline cases outside the 48-hour window we may, at our discretion, offer a service credit (extra months or added states) rather than a cash refund. Credits are final and carry no cash value.</p>
      </LegalSection>
      <LegalSection title="How to request">
        <p>Email <a className="text-amber" href={`mailto:${PUBLIC_CONFIG.contactEmail}`}>{PUBLIC_CONFIG.contactEmail}</a> from the checkout address with the charge date, amount and reason. Approved refunds go back to the original payment method; the payment provider controls processing time. Do not email card or bank numbers.</p>
      </LegalSection>
    </LegalPage>
  );
}
