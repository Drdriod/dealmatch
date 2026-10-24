import React from 'react'
import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'

const POINTS = [
  'Places: ID plus proof of property, checked before anything goes live',
  'Skilled People: ID plus proof of work - artisans, tutors, daily services',
  'Your money stays protected until you confirm the deal',
]

// The visual half of the sign-in card. Every moving part is a CSS animation
// behind motion-safe, so it costs no JavaScript and stops for reduced motion.
export default function AuthBrandPanel() {
  return (
    <div className="relative hidden min-h-[560px] self-stretch overflow-hidden rounded-r-3xl bg-deep md:block">
      <img
        src="/home/hero-place-house.webp"
        alt=""
        loading="eager"
        decoding="async"
        className="motion-safe:animate-slow-zoom absolute inset-0 h-full w-full object-cover"
      />
      <div className="absolute inset-0 bg-deep/75" />
      <div
        className="motion-safe:animate-drift absolute -inset-10"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 30% 70%, rgba(200,95,45,0.35) 0%, transparent 65%)' }}
        aria-hidden="true"
      />

      <div className="relative z-10 flex h-full flex-col justify-between p-8 lg:p-10">
        <Link
          to="/"
          className="motion-safe:animate-rise-in flex items-center gap-2.5 font-display text-2xl text-white"
        >
          <img src="/brand/dealmatch-icon-transparent.png" alt="" className="h-8 w-auto" />
          <span>Deal<span className="text-terracotta">Match</span></span>
        </Link>

        <div>
          <h2 className="font-display text-3xl leading-tight text-white lg:text-4xl">
            <span className="motion-safe:animate-rise-in block" style={{ animationDelay: '0.15s' }}>
              Find a <em className="text-terracotta">verified place</em>
            </span>
            <span className="motion-safe:animate-rise-in block" style={{ animationDelay: '0.3s' }}>
              or a <em className="text-terracotta">verified person.</em>
            </span>
            <span className="motion-safe:animate-rise-in block" style={{ animationDelay: '0.45s' }}>
              Pay for protection first.
            </span>
          </h2>

          <ul className="mt-7 grid gap-3">
            {POINTS.map((text, i) => (
              <li
                key={text}
                className="motion-safe:animate-slide-in flex items-start gap-3"
                style={{ animationDelay: `${0.7 + i * 0.18}s` }}
              >
                <span
                  className="motion-safe:animate-pop mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/15"
                  style={{ animationDelay: `${0.85 + i * 0.18}s` }}
                  aria-hidden="true"
                >
                  <Check size={11} strokeWidth={3} className="text-white/80" />
                </span>
                <span className="text-sm text-white/75">{text}</span>
              </li>
            ))}
          </ul>
        </div>

        <p className="text-xs text-white/40">
          &copy; {new Date().getFullYear()} DealMatch Technology Limited
        </p>
      </div>
    </div>
  )
}
