// Owner-only check of the real payment path. Reachable at /admin/payment-test
// (behind AdminRoute + MFA). It asks the server for a payment with purpose
// "payment_test": the server allows only a superadmin, fixes the price at 100 naira
// and, once the transfer lands, marks it paid without granting anything or adding
// to revenue. In live mode this is a real 100 naira transfer from your bank.

import { useState } from 'react'
import { initializeFlutterwavePayment } from '@/lib/flutterwave'

export default function PaymentTestPage() {
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])

  const addLog = (text) =>
    setLog((rows) => [`${new Date().toLocaleTimeString()}  ${text}`, ...rows])

  const start = async () => {
    // Must match the server's reference rule: letters, digits and dashes, 6-42 chars.
    const reference = `dm-test-${Date.now().toString(36)}`
    setBusy(true)
    addLog(`Starting the 100 naira test (ref ${reference})`)
    try {
      await initializeFlutterwavePayment({
        purpose: 'payment_test',
        reference,
        onSuccess: () => {
          addLog(`PAID: ${reference}. The webhook confirmed the transfer.`)
          setBusy(false)
        },
        onClose: () => {
          setBusy(false)
          addLog(`Closed the transfer screen (${reference})`)
        },
      })
    } catch (err) {
      addLog(`Error: ${err.message || err}`)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-1 text-xl font-semibold">Payment test</h1>
      <p className="mb-2 text-sm text-neutral-600">
        Creates a payment account for exactly ₦100. Transfer ₦100 to it from your bank app, then
        wait for the PAID line below. It proves the live payment path works end to end.
      </p>
      <p className="mb-6 text-sm text-neutral-600">
        Nothing is granted to anyone, and it adds nothing to revenue or referrals. If the site is
        still in Flutterwave test mode, the transfer is simulated.
      </p>

      <button
        onClick={start}
        disabled={busy}
        className="w-full rounded bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
      >
        {busy ? 'Waiting for the transfer…' : 'Start ₦100 test payment'}
      </button>

      <div className="mt-8">
        <h2 className="mb-2 text-sm font-medium text-neutral-700">Log</h2>
        {log.length === 0 ? (
          <p className="text-sm text-neutral-500">No activity yet.</p>
        ) : (
          <ul className="space-y-1 font-mono text-xs text-neutral-800">
            {log.map((row, i) => (
              <li key={i}>{row}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
