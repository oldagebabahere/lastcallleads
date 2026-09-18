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
      title="Simple subscription rules."
      intro="Our goal is to resolve billing problems fairly while keeping monthly pricing predictable. Any mandatory rights under applicable law still apply."
    >
      <LegalSection title="Cancel anytime">
        <p>You can cancel future renewal through the checkout provider or by contacting <a className="text-amber" href={`mailto:${PUBLIC_CONFIG.contactEmail}`}>{PUBLIC_CONFIG.contactEmail}</a>. Cancellation normally takes effect at the end of the current paid period, and access may continue until then.</p>
      </LegalSection>
      <LegalSection title="Refunds we will review">
        <LegalList>
          <li>Duplicate charges.</li>
          <li>A mistaken renewal reported promptly, normally within seven calendar days, where the new period has seen little or no use.</li>
          <li>A verified extended service failure that prevented delivery of the paid service.</li>
          <li>Any refund required by applicable law or the Merchant of Record’s rules.</li>
        </LegalList>
      </LegalSection>
      <LegalSection title="Normally non-refundable">
        <p>Completed subscription periods, normal variations in filing volume, missed sales opportunities, dissatisfaction with a public source’s accuracy, or failure to use delivered alerts are normally not refundable. We do not promise a specific number of leads or sales.</p>
      </LegalSection>
      <LegalSection title="How to request help">
        <p>Email from the address used at checkout and include the charge date, amount and reason. Do not email full card or bank numbers. Payment providers may issue approved refunds to the original payment method and control the final processing time.</p>
      </LegalSection>
    </LegalPage>
  );
}
