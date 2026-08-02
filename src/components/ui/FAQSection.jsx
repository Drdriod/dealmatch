import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { FadeUp } from '@/components/ui/ScrollReveal'

const FAQS = [
  {
    q: 'Is DealMatch only for real estate?',
    a: 'No. Real estate is one category among many: skilled artisans, automotive, professional and business services, logistics, events, health and home care, and more. Every category shares the same matching, verification, and escrow system.',
  },
  {
    q: 'How does DealMatch verify listings and providers?',
    a: 'Every listing is reviewed by our team before it goes live, and providers go through identity verification. Fake or duplicate listings are removed as soon as they\'re flagged.',
  },
  {
    q: 'How does escrow protection work?',
    a: 'When you pay through DealMatch, funds are held securely and are not released to the other side until you confirm the job is done, or you\'ve moved in for a rental. If something goes wrong before then, your money stays protected.',
  },
  {
    q: 'Is DealMatch free to use?',
    a: 'Browsing and matching is free. Some services - like escrow-protected payments and select professional bookings - carry a small platform fee, shown upfront before you pay anything.',
  },
  {
    q: 'What happens if a provider or landlord scams me?',
    a: 'Report it immediately through the listing page or your dashboard. Our team investigates every complaint, and verified accounts found to be fraudulent are permanently banned. If you paid through our escrow system, your funds are protected until you confirm completion.',
  },
  {
    q: 'How does the AI matching actually work?',
    a: 'You tell us what you need, your location, and your preferences, and our system compares that against verified supply to surface the closest matches - rather than making you scroll through everything manually.',
  },
  {
    q: 'Can I list on DealMatch or offer my services as a professional?',
    a: 'Yes. Sign up, choose the relevant category, and complete verification. Once approved, your listing or profile becomes visible to matched users.',
  },
  {
    q: 'What areas in Nigeria does DealMatch cover?',
    a: 'We\'re actively expanding across Nigeria, with the strongest listing coverage in major cities. If your area isn\'t well covered yet, more listings are added regularly.',
  },
]

function FAQItem({ item, isOpen, onToggle }) {
  return (
    <div className="border-b" style={{ borderColor: '#E8DDD2' }}>
      <button
        onClick={onToggle}
        className="w-full py-5 flex items-center justify-between gap-4 text-left"
      >
        <span className="font-display font-bold text-base" style={{ color: '#1A1210' }}>
          {item.q}
        </span>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}
          className="flex-shrink-0">
          <ChevronDown size={18} style={{ color: '#C96A3A' }} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="pb-5 text-sm leading-relaxed" style={{ color: '#8A7E78' }}>
              {item.a}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState(0)

  return (
    <section className="py-24 px-6" style={{ backgroundColor: '#FFFFFF' }}>
      <div className="max-w-3xl mx-auto">
        <FadeUp>
          <div className="text-center mb-14">
            <p className="section-tag">Questions</p>
            <h2 className="section-title mb-4">Frequently Asked Questions</h2>
            <p className="section-sub mx-auto">Everything you need to know before you get started.</p>
          </div>
        </FadeUp>
        <FadeUp delay={0.1}>
          <div>
            {FAQS.map((item, i) => (
              <FAQItem
                key={i}
                item={item}
                isOpen={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
              />
            ))}
          </div>
        </FadeUp>
      </div>
    </section>
  )
}
