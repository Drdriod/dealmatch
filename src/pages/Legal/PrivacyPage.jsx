export default function PrivacyPage() {
  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="max-w-2xl mx-auto px-6">
        <h1 className="font-display font-black text-3xl mb-2" style={{ color: '#1A1210' }}>Privacy Policy</h1>
        <p className="text-xs mb-8" style={{ color: '#8A7E78' }}>Last updated: {new Date().getFullYear()}</p>
        {[
          { title: '1. Information We Collect', body: 'We collect information you provide directly, including name, email address, phone number, and property preferences. We also collect usage data to improve our service.' },
          { title: '2. How We Use Your Information', body: 'We use your information to match you with properties, connect you with professionals, process payments securely through Paystack, and send you relevant notifications via WhatsApp.' },
          { title: '3. Data Sharing', body: 'Contact details (phone, chat) stay locked and are never shown on public listing cards. They unlock only after an escrow payment is confirmed on both sides. We do not sell your personal data to third parties.' },
          { title: '4. Data Security', body: 'Your data is stored securely using Supabase with row-level security. Payments are processed by Paystack: we do not store card details.' },
          { title: '5. Your Rights', body: 'You may request deletion of your account and data at any time by contacting us on WhatsApp at +234 705 739 2060.' },
          { title: '6. Contact Us', body: 'For privacy concerns, contact DealMatch via WhatsApp: +234 705 739 2060 or email: info@dealmatch.com.ng' },
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
