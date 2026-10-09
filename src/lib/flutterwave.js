// Flutterwave V4: payment gateway.
// Handles professional listing subscription fees, student hostel listing
// fees, escrow funding for marketplace transactions (ADR-009) and
// contact-unlock credit packs.
//
// Amounts in this module are NAIRA. Flutterwave takes naira; the database
// and the webhook work in kobo (amount x 100). The webhook is the only
// place that grants anything: the client callback below is for UX only.

import { supabase } from '@/lib/supabase'

// ─── Professional Plans ────────────────────────────────────
// Flat N25,000/month for every professional type - finalized rate.
// (See README.md Revenue Model and OWNER_PRIVATE.md for the source of truth.)
const PROFESSIONAL_MONTHLY_FEE = 25000
const PROFESSIONAL_ANNUAL_FEE  = 270000 // ~10% discount vs paying monthly x12

export const PROFESSIONAL_PLANS = {
  surveyor: {
    name: 'Land Surveyor',
    monthlyFee: PROFESSIONAL_MONTHLY_FEE,
    annualFee:  PROFESSIONAL_ANNUAL_FEE,
    currency: 'NGN',
    features: [
      'Appear on matched land deals',
      'Buyer profile preview before contact',
      'Verified badge on your profile',
      'Up to 30 matched deal introductions/month',
      'Direct messaging with matched buyers',
    ],
  },
  inspector: {
    name: 'Property Inspector',
    monthlyFee: PROFESSIONAL_MONTHLY_FEE,
    annualFee:  PROFESSIONAL_ANNUAL_FEE,
    currency: 'NGN',
    features: [
      'Priority placement on all property types',
      'Direct chat with matched buyers',
      'Inspection report template kit',
      'Unlimited matched deal introductions',
      'Featured profile listing',
    ],
  },
  lawyer: {
    name: 'Real Estate Lawyer',
    monthlyFee: PROFESSIONAL_MONTHLY_FEE,
    annualFee:  PROFESSIONAL_ANNUAL_FEE,
    currency: 'NGN',
    features: [
      'Appear on deals needing legal review',
      'Direct chat with matched buyers and sellers',
      'Verified badge on your profile',
      'Unlimited matched deal introductions',
    ],
  },
  lender: {
    name: 'Mortgage Lender',
    monthlyFee: PROFESSIONAL_MONTHLY_FEE,
    annualFee:  PROFESSIONAL_ANNUAL_FEE,
    currency: 'NGN',
    features: [
      'Filter leads by loan amount range',
      'Buyer financial profile access',
      'Pre-qualification flow integration',
      'Co-branded deal flow reports',
      'Priority support & onboarding',
    ],
  },
}

// ─── Hostel Listing Plans (paid by hostel owners, free for students) ────────
export const HOSTEL_LISTING_PLANS = {
  semester: {
    name:     'Semester Plan',
    price:    5000,
    duration: '~6 months',
    badge:    'Popular',
    saving:   null,
    features: [
      'Listed on student hostels page',
      'Visible to all verified students near your school',
      'Enquiries via WhatsApp and in-app',
      'Edit or pause your listing anytime',
      'Verified badge after inspection',
    ],
  },
  annual: {
    name:     'Annual Plan',
    price:    8500,
    duration: '12 months',
    badge:    'Best Value',
    saving:   'Save ₦1,500 vs two semesters',
    features: [
      'Everything in Semester Plan',
      'Priority placement in search results',
      'Listed for the full academic year',
      'Renewal reminder before expiry',
    ],
  },
}

// ─── Pay by bank transfer (Flutterwave V4 dynamic virtual account) ──────
// The server issues this payer a DealMatch bank account number for one
// payment. The payer transfers from their bank app, and the Flutterwave
// webhook marks the payment paid. This screen only polls our status
// endpoint to update itself: nothing here grants anything.

const STATUS_POLL_MS = 5000

const authHeaders = async () => {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Please sign in to make a payment.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// Builds the transfer screen with DOM nodes (no innerHTML, so server values
// are never parsed as markup). Calls onPaid once the server reports paid.
function openTransferModal({ account, error, onPaid, onClose }) {
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.5)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', zIndex: '9999', padding: '16px',
  })

  const card = document.createElement('div')
  Object.assign(card.style, {
    background: '#fff', color: '#111', borderRadius: '12px', maxWidth: '420px', width: '100%',
    padding: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.25)', boxSizing: 'border-box',
    fontFamily: 'inherit', lineHeight: '1.4',
  })

  const line = (label, value, { big = false } = {}) => {
    const wrap = document.createElement('div')
    wrap.style.margin = '12px 0'
    const l = document.createElement('div')
    l.textContent = label
    Object.assign(l.style, { fontSize: '12px', color: '#666' })
    const v = document.createElement('div')
    v.textContent = value
    Object.assign(v.style, { fontSize: big ? '24px' : '16px', fontWeight: '600', letterSpacing: big ? '0.08em' : 'normal' })
    wrap.append(l, v)
    return { wrap, value: v }
  }

  const button = (text, primary) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    Object.assign(b.style, {
      padding: '10px 14px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px', fontWeight: '600',
      border: primary ? 'none' : '1px solid #ccc', background: primary ? '#111' : '#fff',
      color: primary ? '#fff' : '#111',
    })
    return b
  }

  const title = document.createElement('h2')
  title.textContent = error ? 'Payment unavailable' : 'Pay by bank transfer'
  Object.assign(title.style, { margin: '0 0 8px', fontSize: '20px' })
  card.appendChild(title)

  const status = document.createElement('p')
  Object.assign(status.style, { margin: '8px 0 0', fontSize: '14px' })
  const actions = document.createElement('div')
  Object.assign(actions.style, { display: 'flex', gap: '8px', marginTop: '16px', justifyContent: 'flex-end' })
  const closeBtn = button('Close', false)
  actions.appendChild(closeBtn)

  let timer = null
  let done = false
  const onKey = (e) => { if (e.key === 'Escape') dismiss() }
  const finish = () => {
    done = true
    clearInterval(timer)
    document.removeEventListener('keydown', onKey)
    overlay.remove()
  }
  const dismiss = () => {
    if (done) return
    finish()
    onClose?.()
  }

  if (error) {
    const msg = document.createElement('p')
    msg.textContent = error
    Object.assign(msg.style, { margin: '8px 0 0', fontSize: '14px' })
    card.append(title, msg, actions)
  } else {
    const intro = document.createElement('p')
    intro.textContent = `Send exactly ${formatNaira(account.amountNaira)} from your bank app to the account below.`
    Object.assign(intro.style, { margin: '0', fontSize: '14px' })

    const numberLine = line('Account number', account.accountNumber, { big: true })
    const copyBtn = button('Copy account number', false)
    copyBtn.style.marginTop = '4px'
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(account.accountNumber)
        copyBtn.textContent = 'Copied'
      } catch {
        copyBtn.textContent = 'Copy failed'
      }
    })

    const bankLine = line('Bank', account.bankName || 'Shown in your bank app')
    const amountLine = line('Amount', formatNaira(account.amountNaira))
    const expiryLine = line('Account valid until', account.expiresAt ? new Date(account.expiresAt).toLocaleString('en-NG', { dateStyle: 'medium', timeStyle: 'short' }) : 'See your payment')

    Object.assign(status.style, { color: '#444' })
    status.textContent = 'Waiting for your transfer. This updates automatically once it arrives.'

    const note = document.createElement('p')
    note.textContent = 'Only send from your own bank account. If you close this window after sending, the payment is still confirmed automatically.'
    Object.assign(note.style, { margin: '12px 0 0', fontSize: '12px', color: '#666' })

    card.append(title, intro, numberLine.wrap, copyBtn, bankLine.wrap, amountLine.wrap, expiryLine.wrap, status, note, actions)

    const expiresMs = account.expiresAt ? new Date(account.expiresAt).getTime() : Infinity
    const poll = async () => {
      if (done) return
      if (Date.now() > expiresMs) {
        clearInterval(timer)
        status.textContent = 'This account has expired. Start the payment again.'
        return
      }
      try {
        const r = await fetch(`/api/payments/status?reference=${encodeURIComponent(account.reference)}`, {
          headers: await authHeaders(),
        })
        const json = await r.json().catch(() => null)
        if (r.ok && json?.paid) {
          finish()
          onPaid?.({ reference: account.reference, status: 'paid' })
        }
      } catch {
        // Network blip: the next tick tries again.
      }
    }
    timer = setInterval(poll, STATUS_POLL_MS)
  }

  closeBtn.addEventListener('click', dismiss)
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss() })
  document.addEventListener('keydown', onKey)
  overlay.appendChild(card)
  document.body.appendChild(overlay)
}

// ─── Start a payment ───────────────────────────────────────
// `amount` is in naira. `reference` is the payment reference (hyphenated, see
// generateReference); the webhook resolves the payment by it.
export const initializeFlutterwavePayment = async ({
  email,
  amount,
  metadata = {},
  onSuccess,
  onClose,
  reference,
}) => {
  const ref = reference || generateReference()
  const amountNaira = Number(amount)
  if (!email || !(amountNaira > 0)) {
    openTransferModal({ error: 'Missing payment details. Please try again.', onClose })
    return
  }

  let account
  try {
    const r = await fetch('/api/payments/virtual-account', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ reference: ref, amountNaira, email, metadata }),
    })
    const json = await r.json().catch(() => null)
    if (!r.ok) throw new Error(json?.error || 'Could not start payment')
    account = json
  } catch (err) {
    openTransferModal({ error: err.message || 'Could not start payment. Please try again.', onClose })
    return
  }

  openTransferModal({ account, onPaid: onSuccess, onClose })
}

// ─── Contact-unlock credit packs (item 2) ──────────────────
// Small prepaid packs rather than a single fixed price - see
// src/components/ui/UnlockContactButton.jsx for where this is used, and
// supabase/migrations/20260915000003_contact_unlock_credits.sql for the
// server-side wallet + idempotent unlock logic. A credit is only ever
// granted by the webhook once Flutterwave confirms the charge, never here.
export const UNLOCK_CREDIT_PACKS = [
  { credits: 1, price: 500,  label: '1 unlock' },
  { credits: 5, price: 2000, label: '5 unlocks', badge: 'Best value' }, // 2000/5 = 400/unlock, a real discount over buying singly
]

export const buyUnlockCredits = async ({ pack, userId, email, onSuccess, onClose }) => {
  await initializeFlutterwavePayment({
    email,
    amount: pack.price,
    metadata: {
      type:    'contact_unlock_credits', // matches the webhook case that actually grants credits
      user_id: userId,
      credits: pack.credits,
    },
    onSuccess: async (response) => {
      await verifyPayment(response.reference, response.transactionId)
      onSuccess?.(response)
    },
    onClose,
  })
}

// Called after the applicant's professional_applications row has
// already been created with status='pending'. On successful
// payment, the Flutterwave webhook flips status to 'active'.
export const subscribeProfessional = async ({
  applicationId,
  userId,
  professionalType,
  email,
  planType = 'monthly',
  onSuccess,
  onClose,
}) => {
  const plan = PROFESSIONAL_PLANS[professionalType]
  if (!plan) return
  const amount = planType === 'annual' ? plan.annualFee : plan.monthlyFee

  await initializeFlutterwavePayment({
    email,
    amount,
    metadata: {
      type:               'professional_subscription', // matches webhook TYPE_MAP key
      user_id:            userId,                       // required for automatic referral payout
      application_id:     applicationId,
      professional_type:  professionalType,
      plan_type:          planType,
      plan_name:          plan.name,
    },
    onSuccess: async (response) => {
      await verifyPayment(response.reference, response.transactionId)
      onSuccess?.(response)
    },
    onClose,
  })
}

// ─── Pay hostel listing fee ────────────────────────────────
// Called from ListHostelPage after saving the hostel draft.
// On success, marks listing_paid = true in student_hostels table.
export const payHostelListingFee = async ({
  email,
  hostelId,
  plan = 'semester',   // 'semester' | 'annual'
  ownerName = '',
  onSuccess,
  onClose,
}) => {
  const planMeta = HOSTEL_LISTING_PLANS[plan]
  if (!planMeta) return

  const reference = generateReference()

  await initializeFlutterwavePayment({
    email,
    amount:    planMeta.price,
    reference,
    metadata: {
      hostel_id:    hostelId,
      plan,
      listing_type: 'student_hostel',
      owner_name:   ownerName,
    },
    onSuccess,
    onClose,
  })
}

// ─── Fund escrow on a marketplace transaction (ADR-009) ────
// Applies to any transaction model (NEAREST_AVAILABLE or
// MULTI_ATTRIBUTE_REVERSE) once it's in PENDING status (a bid was
// accepted / a direct request was accepted, awaiting payment).
//
// The reference passed in must already be bound to the transaction via
// the start_escrow_payment RPC (20260731000020) BEFORE this is called --
// see JobPostingPage.jsx's fundEscrow(). The webhook (flutterwave-webhook.js)
// resolves which transaction to mark FUNDED strictly by that reference,
// not by metadata.transaction_id, so a reference that was never bound
// server-side won't match anything and the payment will be logged but
// nothing will be marked funded.
export const fundTransactionEscrow = async ({
  email,
  transactionId,
  amountCents,
  requesterId,
  reference,
  onSuccess,
  onClose,
}) => {
  if (!amountCents) return
  const ref = reference || generateReference()

  await initializeFlutterwavePayment({
    email,
    amount:    amountCents / 100, // this function takes naira, not cents
    reference: ref,
    metadata: {
      type:           'transaction_escrow', // matches webhook TYPE_MAP key -- add this case server-side
      transaction_id: transactionId,
      user_id:        requesterId,
    },
    onSuccess: async (response) => {
      await verifyPayment(response.reference, response.transactionId)
      onSuccess?.(response)
    },
    onClose,
  })
}

// ─── Check payment status on the server ────────────────────
// Read-only: returns whether the payment row is paid. Only the webhook sets paid.
export const verifyPayment = async (reference) => {
  try {
    const res = await fetch(`/api/payments/status?reference=${encodeURIComponent(reference)}`, {
      headers: await authHeaders(),
    })
    if (!res.ok) throw new Error('Verification failed')
    const json = await res.json()
    return { success: json.paid === true, status: json.status, reference }
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ─── Utils ────────────────────────────────────────────────
// Hyphens and letters/digits only: Flutterwave references allow no underscores.
export const generateReference = () =>
  'dm-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9)

export const formatNaira = (amount) => {
  if (!amount && amount !== 0) return '₦0'
  return new Intl.NumberFormat('en-NG', {
    style:    'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)

}
