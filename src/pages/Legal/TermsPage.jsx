export default function TermsPage() {
  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="max-w-2xl mx-auto px-6">
        <h1 className="font-display font-black text-3xl mb-2" style={{ color: '#1A1210' }}>Terms of Service</h1>
        <p className="text-xs mb-8" style={{ color: '#8A7E78' }}>Last updated: {new Date().getFullYear()}</p>
        {[
          { title: '1. Acceptance', body: 'By using DealMatch you agree to these terms. If you do not agree, please do not use the platform.' },
          { title: '2. Platform Use', body: 'DealMatch is a property matching platform. We connect buyers, sellers, renters, and professionals. We do not take title to any property or act as a real estate agent ourselves.' },
          { title: '3. Platform Service Fee', body: 'Listing on DealMatch is free. Listing on DealMatch is free. A platform service fee is charged only on completed deals: 1.5% for sales, 3% for rentals, 8% for hotel and short-let bookings. The fee is due at deal completion.' },
          { title: '4. Escrow Service', body: 'Our escrow service holds funds on behalf of parties to a transaction. Funds are released only after both parties confirm completion. DealMatch charges a facilitation fee of up to 3%.' },
          { title: '5. Verification', body: 'We verify users through photo upload and live face check. Verified badges indicate completed verification but do not guarantee identity. Always conduct due diligence before closing any deal.' },
          { title: '6. Liability', body: 'DealMatch is not liable for property disputes, title defects, or failed transactions. We provide a platform and matching service only.' },
          { title: '7. Contact', body: 'Questions? WhatsApp: +234 705 739 2060' },
        ].map(s => (
          <div key={s.title} className="mb-6">
            <h2 className="font-display font-black text-lg mb-2" style={{ color: '#1A1210' }}>{s.title}</h2>
            <p className="text-sm leading-relaxed" style={{ color: '#5C4A3A' }}>{s.body}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
