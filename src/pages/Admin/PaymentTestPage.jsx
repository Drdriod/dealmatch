// Admin-only test page for the Flutterwave virtual-account payment flow.
// Reachable at /admin/payment-test (behind AdminRoute + MFA).
// Uses metadata type "payment_test": the webhook has no mapping for it, so
// it only marks the payment paid. It creates no subscription and no payout.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { initializeFlutterwavePayment } from '@/lib/flutterwave'

export default function PaymentTestPage() {
  const [email, setEmail] = useState('')
  const [amount, setAmount] = useState('100')
  const [busy, setBusy] = useState(false)
  const [log, setLog] = useState([])

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data?.session?.user?.email || '')
    })
  }, [])

  const addLog = (text) =>
    setLog((rows) => [`${new Date().toLocaleTimeString()}  ${text}`, ...rows])

  const start = async () => {
    // Must match the server's reference rule: letters, digits and dashes, 6-42 chars.
    const reference = `dm-test-${Date.now().toString(36)}`
    setBusy(true)
    addLog(`Starting test payment ₦${amount} (ref ${reference})`)
    try {
      await initializeFlutterwavePayment({
        email,
        amount: Number(amount),
        reference,
        metadata: { type: 'payment_test' },
        onSuccess: () => addLog(`PAID: ${reference}`),
        onClose: () => {
          setBusy(false)
          addLog(`Closed transfer screen: ${reference}`)
        },
      })
    } catch (err) {
      addLog(`Error: ${err.message || err}`)
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl p-4">
      <h1 className="mb-1 text-xl font-semibold">Flutterwave payment test</h1>
      <p className="mb-6 text-sm text-neutral-600">
        Creates a real sandbox virtual account for this amount. Use a sandbox
        transfer to pay it. Nothing is granted to any user.
      </p>

      <label className="mb-4 block">
        <span className="mb-1 block text-sm text-neutral-700">Payer email</span>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <label className="mb-6 block">
        <span className="mb-1 block text-sm text-neutral-700">Amount (₦)</span>
        <input
          type="number"
          min="1"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          className="w-full rounded border border-neutral-300 px-3 py-2"
        />
      </label>

      <button
        onClick={start}
        disabled={busy || !email || !(Number(amount) > 0)}
        className="w-full rounded bg-neutral-900 px-4 py-3 text-white disabled:opacity-50"
      >
        {busy ? 'Waiting for transfer…' : 'Start test payment'}
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
