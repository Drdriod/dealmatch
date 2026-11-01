import { isTestMode } from '@/lib/testMode'

// Shown on every page of the tester deployment, never in production.
export default function TestBanner() {
  if (!isTestMode) return null
  return (
    <div
      role="status"
      className="w-full bg-[#B45309] text-white text-center text-xs sm:text-sm font-medium px-3 py-1.5"
    >
      Test environment: sandbox money only. Nothing here is real. Do not use real cards or real documents.
    </div>
  )
}
