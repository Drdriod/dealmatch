import TrustLayout, { Section } from '@/components/trust/TrustLayout';

export default function AboutPage() {
  return (
    <TrustLayout title="About DealMatch" subtitle="Find places and people you can trust.">
      <Section title="What we do">
        <p>DealMatch connects people with verified agents and providers for places (rentals, shortlets, property) and people (artisans, tutors, home services). Payments for protected deals are held until both sides confirm the work.</p>
      </Section>
      <Section title="Who runs it">
        <p>DealMatch is operated by DealMatch Technology Limited, a company registered in Nigeria (CAC 9655308).</p>
      </Section>
    </TrustLayout>
  );
}
