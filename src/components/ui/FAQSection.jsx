import React, { useState } from 'react'
import { ChevronDown, Building2, ShieldCheck, Lock, Wallet, ShieldAlert, Bot, Award, MapPin } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { FadeUp, StaggerChildren, StaggerItem } from '@/components/ui/ScrollReveal'

// Content matches the actual live product (Places + People, Uyo-first) -
// deliberately doesn't claim categories or coverage that aren't real yet.
// The old copy here listed automotive, business services, logistics,
// events, and health as live categories, and implied national coverage
// with "strongest in major cities" - both were ahead of what's actually
// shipped. Fixed alongside the visual redesign since getting a redesign
// pass felt like the right moment to also stop overclaiming.
const FAQS = [
  {
    icon: Building2,
    q: 'Is DealMatch only for real estate?',
    a: 'No. DealMatch covers two things today: Places (shortlets and house rent) and People (artisans, tutors, and home services). Both share the same matching, verification, and protection system. More categories are planned as the platform grows.',
  },
  {
    icon: ShieldCheck,
    q: 'How does DealMatch verify listings and providers?',
    a: 'Every property listing is reviewed before it goes live. Every provider on the People side passes identity verification, and Skill Verified providers also have their work reviewed before they get a badge.',
  },
  {
    icon: Lock,
    q: 'How does the protection fee work?',
    a: 'When you pay through DealMatch, funds are held under DealMatch Protection and only released once you confirm the job is done or you\'ve moved in for a rental. The other side\'s contact info stays hidden until then, too.',
  },
  {
    icon: Wallet,
    q: 'Is DealMatch free to use?',
    a: 'Browsing, requesting, listing a place, and offering a skill are all free - no upfront listing fees, no monthly subscription. We only take a protection fee once a deal actually closes.',
  },
  {
    icon: ShieldAlert,
    q: 'What happens if a provider or landlord scams me?',
    a: 'Report it immediately through the listing or your dashboard. Our team investigates every complaint, and verified accounts found to be fraudulent are permanently banned. If you paid the protection fee, your funds stay protected until you confirm completion.',
  },
  {
    icon: Bot,
    q: 'How does the AI matching actually work?',
    a: 'You tell us what you need and where, and our system compares that against verified supply nearby to surface the closest matches - rather than making you scroll through everything manually.',
  },
  {
    icon: Award,
    q: 'Can I list on DealMatch or offer my services as a professional?',
    a: 'Yes. Sign up, then choose "List a place" or "Offer a skill", and complete verification. Once approved, your listing or profile becomes visible on the platform.',
  },
  {
    icon: MapPin,
    q: 'What areas in Nigeria does DealMatch cover?',
    a: 'We\'re launching in Uyo, Akwa Ibom first, on purpose - proving the platform works well in one city before expanding. If you\'re outside Uyo, you can still sign up; more cities are coming.',
  },
]

function FAQItem({ item, isOpen, onToggle }) {
  const Icon = item.icon
  return (
    <div
      className="rounded-2xl overflow-hidden transition-colors"
      style={{ backgroundColor: isOpen ? '#FFFFFF' : '#F7F4ED', border: `1px solid ${isOpen ? '#DEDDD6' : 'transparent'}` }}
    >
      <button
        onClick={onToggle}
        className="w-full py-4 px-4 sm:px-5 flex items-center gap-3.5 text-left"
      >
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(200,95,45,0.1)' }}>
          <Icon size={16} style={{ color: '#C85F2D' }} />
        </div>
        <span className="font-display font-bold text-[15px] sm:text-base flex-1" style={{ color: '#17211B' }}>
          {item.q}
        </span>
        <motion.span animate={{ rotate: isOpen ? 180 : 0 }} transition={{ duration: 0.2 }}
          className="flex-shrink-0">
          <ChevronDown size={18} style={{ color: '#C85F2D' }} />
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
            <p className="pb-5 px-4 sm:px-5 text-sm leading-relaxed" style={{ color: '#647068', marginLeft: '2.85rem' }}>
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
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#C85F2D' }}>Questions</p>
            <h2 className="font-display text-3xl sm:text-4xl font-black mb-4" style={{ color: '#17211B' }}>Frequently Asked Questions</h2>
            <p className="text-sm sm:text-base" style={{ color: '#647068' }}>Everything you need to know before you get started.</p>
          </div>
        </FadeUp>
        <StaggerChildren className="space-y-2.5" stagger={0.06}>
          {FAQS.map((item, i) => (
            <StaggerItem key={i}>
              <FAQItem
                item={item}
                isOpen={openIndex === i}
                onToggle={() => setOpenIndex(openIndex === i ? -1 : i)}
              />
            </StaggerItem>
          ))}
        </StaggerChildren>
      </div>
    </section>
  )
}
