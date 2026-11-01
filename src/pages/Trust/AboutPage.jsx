import TrustLayout, { Section } from '@/components/trust/TrustLayout';

export default function AboutPage() {
  return (
    <TrustLayout title="About DealMatch" subtitle="Making better deals possible.">
      <Section title="What we do">
        <p>DealMatch was created to make finding the right match and completing transactions easier.</p>
        <p>We believe that discovering an opportunity should not be unnecessarily difficult, and that trust should not be left out of the transaction process.</p>
        <p>Our marketplace brings discovery, structured connections and transaction protection together to help people move from looking to doing. Payments for protected deals are held until both sides confirm the work.</p>
        <p><span className="font-semibold">Our mission.</span> To make discovery and transactions more accessible, transparent and trustworthy.</p>
        <p><span className="font-semibold">Our vision.</span> To build a marketplace where finding what you need and making a deal can happen with confidence.</p>
      </Section>
      <Section title="Who runs it">
        <p>DealMatch is operated by DealMatch Technology Limited, a company registered in Nigeria (CAC 9655308).</p>
      </Section>
    </TrustLayout>
  );
}
