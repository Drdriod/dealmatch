import React from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'motion/react'
import { Award, Building2, X } from 'lucide-react'

const CHOICES = [
  { to: '/list-rental',  label: 'List a place',  desc: 'Shortlet or house rent',       icon: Building2 },
  { to: '/verify-skill', label: 'Offer a skill', desc: 'Artisan, tutor, home service',  icon: Award },
]

/**
 * "I have something to offer" is one card but two real destinations - this
 * is the desktop equivalent of the mobile tab bar's Post chooser sheet
 * (same two choices, same reasoning), just centered instead of a bottom
 * sheet, since desktop has no bottom tab bar to hang it off of.
 */
export default function PostChoiceModal({ open, onClose }) {
  const navigate = useNavigate()

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          onClick={onClose}
          className="fixed inset-0 z-[100] flex items-center justify-center px-4"
          style={{ backgroundColor: 'rgba(23,33,27,0.5)' }}
        >
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl p-6"
            style={{ backgroundColor: '#FFFFFF' }}
          >
            <div className="flex items-center justify-between mb-5">
              <span className="font-display font-black text-lg" style={{ color: '#17211B' }}>What do you want to post?</span>
              <button onClick={onClose} className="w-8 h-8 rounded-full flex items-center justify-center" style={{ backgroundColor: '#EEE9DE' }}>
                <X size={15} style={{ color: '#17211B' }} />
              </button>
            </div>
            <div className="space-y-2.5">
              {CHOICES.map(choice => {
                const Icon = choice.icon
                return (
                  <button key={choice.to} onClick={() => { onClose(); navigate(choice.to) }}
                    className="w-full flex items-center gap-3 p-3.5 rounded-2xl text-left transition-colors hover:bg-[#EEE9DE]"
                    style={{ border: '1px solid #DEDDD6' }}>
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ backgroundColor: 'rgba(200,95,45,0.1)' }}>
                      <Icon size={18} style={{ color: '#C85F2D' }} />
                    </div>
                    <div>
                      <p className="text-sm font-bold" style={{ color: '#17211B' }}>{choice.label}</p>
                      <p className="text-xs" style={{ color: '#647068' }}>{choice.desc}</p>
                    </div>
                  </button>
                )
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
