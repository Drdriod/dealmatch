export default function TermsPage() {
  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="max-w-2xl mx-auto px-6">
        <h1 className="font-display font-black text-3xl mb-2" style={{ color: '#17211B' }}>Terms of Service</h1>
        <p className="text-xs mb-8" style={{ color: '#647068' }}>Last updated: {new Date().getFullYear()}</p>
        {[
          { title: '1. Acceptance', body: 'By using DealMatch you agree to these terms. If you do not agree, please do not use the platform.' },
          { title: '2. Platform Use', body: 'DealMatch matches people to a verified place or a verified person. We connect renters, hosts, and skilled professionals through an escrow-protected process. We do not take title to any property, act as a real estate agent, or employ any professional listed on the platform.' },
          { title: '3. Platform Service Fee', body: 'Listing on DealMatch is free. A platform service fee is charged only on completed deals: 1.5% for sales, 3% for rentals, 8% for hotel and short-let bookings, and a service fee on completed skilled-person bookings. The fee is due at deal completion, not before.' },
          { title: '4. Escrow Service', body: 'Our escrow service holds funds on behalf of parties to a transaction. Funds are released only after both parties confirm completion. DealMatch charges a facilitation fee of up to 3%.' },
          { title: '5. Verification', body: 'We verify users through photo upload and live face check. Verified badges indicate completed verification but do not guarantee identity. Always conduct due diligence before closing any deal.' },
          { title: '6. Liability', body: 'DealMatch is not liable for property disputes, title defects, or failed transactions. We provide a platform and matching service only.' },
          { title: '7. Contact', body: 'Questions? WhatsApp: +234 705 739 2060' },
        ].map(s => (
          <div key={s.title} className="mb-6">
            <h2 className="font-display font-black text-lg mb-2" style={{ color: '#17211B' }}>{s.title}</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#5C4A3A' }}>{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
