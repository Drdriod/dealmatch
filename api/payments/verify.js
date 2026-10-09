// api/payments/verify.js: Vercel serverless
import { redisRateLimit } from '../../src/lib/redis.js'

export default async function handler(req, res) {
  const origin = process.env.VITE_APP_URL || 'https://www.dealmatch.com.ng'
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  res.setHeader('Vary', 'Origin')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  // ✅ SECURITY: Redis rate limit: 10 payment verifications/min per IP
  const rl = await redisRateLimit(req, 'pay_verify', 10, 60)
  if (!rl.allowed) return res.status(429).json({ error: 'Too many requests' })

  const { reference, transactionId } = req.body || {}
  if (!reference || typeof reference !== 'string' || !/^[a-zA-Z0-9_-]{5,100}$/.test(reference)) {
    return res.status(400).json({ error: 'Invalid reference' })
  }
  // Flutterwave verifies by its own transaction id (from the checkout
  // callback). The tx_ref in the response must match ours.
  if (!transactionId || !/^[0-9]{1,20}$/.test(String(transactionId))) {
    return res.status(400).json({ error: 'Invalid transaction id' })
  }
  if (!process.env.FLUTTERWAVE_SECRET_KEY) {
    return res.status(500).json({ error: 'Payment service not configured' })
  }

  try {
    const fRes = await fetch(`https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transactionId))}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLUTTERWAVE_SECRET_KEY}` },
    })
    if (!fRes.ok) return res.status(502).json({ success: false, error: 'Gateway error' })
    const fData = await fRes.json()
    const tx = fData?.data
    if (fData?.status !== 'success' || tx?.status !== 'successful' || tx?.tx_ref !== reference || tx?.currency !== 'NGN') {
      return res.status(400).json({ success: false, error: 'Payment not successful' })
    }

    const { meta, amount, customer } = tx
    if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await sb.from('payments').upsert({
        reference, amount: Number(amount), currency: 'NGN', // Flutterwave amounts are naira
        payment_type: meta?.type || 'unknown', email: customer?.email,
        status: 'success', verified_at: new Date().toISOString(),
      }, { onConflict: 'reference', ignoreDuplicates: true })
    }
    return res.status(200).json({ success: true, reference })
  } catch (err) {
    console.error('Verify error:', err)
    return res.status(500).json({ success: false, error: 'Verification failed' })
  }
}
