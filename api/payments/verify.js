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

  const { reference } = req.body || {}
  if (!reference || typeof reference !== 'string' || !/^[a-zA-Z0-9_-]{5,100}$/.test(reference)) {
    return res.status(400).json({ error: 'Invalid reference' })
  }
  if (!process.env.PAYSTACK_SECRET_KEY) {
    return res.status(500).json({ error: 'Payment service not configured' })
  }

  try {
    const pRes = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}` },
    })
    if (!pRes.ok) return res.status(502).json({ success: false, error: 'Gateway error' })
    const pData = await pRes.json()
    if (!pData.status || pData.data?.status !== 'success') {
      return res.status(400).json({ success: false, error: 'Payment not successful' })
    }

    const { metadata, amount, customer } = pData.data
    if (process.env.VITE_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { createClient } = await import('@supabase/supabase-js')
      const sb = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
      await sb.from('payments').upsert({
        reference, amount: amount / 100, currency: 'NGN',
        payment_type: metadata?.type || 'unknown', email: customer.email,
        status: 'success', verified_at: new Date().toISOString(),
      }, { onConflict: 'reference', ignoreDuplicates: true })
    }
    return res.status(200).json({ success: true, reference })
  } catch (err) {
    console.error('Verify error:', err)
    return res.status(500).json({ success: false, error: 'Verification failed' })
  }
}
