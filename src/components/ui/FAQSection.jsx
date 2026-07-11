import React, { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { FadeUp } from '@/components/ui/ScrollReveal'

const FAQS = [
  {
    q: 'How does DealMatch verify listings and users?',
    a: 'Every listing is reviewed by our team before it goes live, and landlords/agents go through identity verification. Fake or duplicate listings are removed as soon as they\'re flagged.',
  },
  {
    q: 'How does escrow protection work?',
    a: 'When you pay rent or a deposit through DealMatch, the funds are held securely and are not released to the landlord until you confirm you\'ve moved in. If something goes wrong before then, your money stays protected.',
  },
  {
    q: 'Is DealMatch free to use?',
    a: 'Browsing and matching with properties is free. Some services - like escrow-protected payments and select professional bookings - carry a small platform fee, shown upfront before you pay anything.',
  },
  {
    q: 'What happens if a landlord or agent scams me?',
    a: 'Report it immediately through the property page or your dashboard. Our team investigates every complaint, and verified accounts found to be fraudulent are permanently banned. If you paid through our escrow system, your funds are protected until move-in is confirmed.',
  },
  {
    q: 'How does the AI matching actually work?',
    a: 'You tell us your budget, location, and preferences, and our system compares that against available listings to surface the closest matches - rather than making you scroll through everything manually.',
  },
  {
    q: 'Can I list my property or connect as a professional (lawyer, surveyor, inspector)?',
    a: 'Yes. Sign up, choose the relevant role, and complete verification. Once approved, your listing or profile becomes visible to matched users.',
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
