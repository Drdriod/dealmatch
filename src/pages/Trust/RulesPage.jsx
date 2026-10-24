import TrustLayout, { Section } from '@/components/trust/TrustLayout';

// Reports moderation (UX-20) enforces this page. Keep both in step.
export default function RulesPage() {
  return (
    <TrustLayout title="Marketplace rules" subtitle="What listings and providers may not do on DealMatch.">
      <Section title="Listings">
        <ul className="list-disc space-y-1 pl-5">
          <li>No listing for a property or service you do not have the right to offer.</li>
          <li>Photos and details must show the real property or work.</li>
          <li>No contact details in titles, descriptions or photos.</li>
        </ul>
      </Section>
      <Section title="Providers and agents">
        <ul className="list-disc space-y-1 pl-5">
          <li>Use your own identity and complete verification when asked.</li>
          <li>Do not ask a customer to pay outside DealMatch.</li>
          <li>Do not confirm work as done when it is not.</li>
        </ul>
      </Section>
      <Section title="Everyone">
        <ul className="list-disc space-y-1 pl-5">
          <li>Keep payment and conversation on DealMatch.</li>
          <li>Report listings and people that break these rules using the report option.</li>
        </ul>
        <p>Reports are reviewed by DealMatch staff. Breaking these rules can lead to a listing being removed or an account being restricted.</p>
      </Section>
    </TrustLayout>
  );
}
