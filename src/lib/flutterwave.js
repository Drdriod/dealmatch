// Flutterwave V4: payment gateway.
// Handles professional listing subscription fees, student hostel listing
// fees, escrow funding for marketplace transactions (ADR-009) and
// contact-unlock credit packs.
//
// Amounts in this module are NAIRA. Flutterwave takes naira; the database
// and the webhook work in kobo (amount x 100). The webhook is the only
// place that grants anything: the client callback below is for UX only.

import { supabase } from '@/lib/supabase'
import { feeValue, formatPlatformFee } from '@/lib/platformFees'

// Every amount in this module comes from the platform_fees registry (the
// super admin Monetisation tab). The constants below hold names, features and
// badges only. Amounts are read with getFeeAmounts(fees), where `fees` is the
// map from usePlatformFees(). Nothing here hardcodes a price.

// ─── Professional Plans ────────────────────────────────────
// Keys: professional_monthly, professional_annual.
export const PROFESSIONAL_PLANS = {
  surveyor: {
    name: 'Land Surveyor',
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
// Keys: hostel_listing_semester, hostel_listing_annual.
export const HOSTEL_LISTING_PLANS = {
  semester: {
    name:     'Semester Plan',
    duration: '~6 months',
    badge:    'Popular',
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
    duration: '12 months',
    badge:    'Best Value',
    features: [
      'Everything in Semester Plan',
      'Priority placement in search results',
      'Listed for the full academic year',
      'Renewal reminder before expiry',
    ],
  },
}

// ─── Amounts from the platform fee registry ─────────────────
// Returns the same shapes as the constants above, with the amounts filled in
// from the registry. A value is null while `fees` is still loading, or when
// its channel is missing, switched off or zero. Callers must not charge or
// display a null amount: wait for fees, or disable the pay action.
export function getFeeAmounts(fees) {
  const naira = (key) => {
    const v = feeValue(fees, key)
    return v !== null && v > 0 ? v : null
  }
  const monthly      = naira('professional_monthly')
  const annual       = naira('professional_annual')
  const semester     = naira('hostel_listing_semester')
  const hostelAnnual = naira('hostel_listing_annual')

  // Annual saving against twelve monthly payments, e.g. 10.
  const annualSavingPercent = monthly && annual
    ? Math.round((1 - annual / (monthly * 12)) * 100)
    : null
  // Annual saving against two semesters, e.g. N1,500.
  const hostelSavingNaira = semester && hostelAnnual ? 2 * semester - hostelAnnual : null

  const professionalPlans = Object.fromEntries(
    Object.entries(PROFESSIONAL_PLANS).map(([key, plan]) => [key, {
      ...plan,
      monthlyFee: monthly,
      annualFee:  annual,
      annualSavingPercent,
    }])
  )

  const hostelPlans = {
    semester: { ...HOSTEL_LISTING_PLANS.semester, price: semester, saving: null },
    annual:   {
      ...HOSTEL_LISTING_PLANS.annual,
      price:  hostelAnnual,
      saving: hostelSavingNaira > 0
        ? `Save ${formatPlatformFee({ kind: 'naira', value: hostelSavingNaira })}`
        : null,
    },
  }

  const unlockPacks = UNLOCK_CREDIT_PACKS.map(pack => ({ ...pack, price: naira(pack.key) }))

  return {
    PROFESSIONAL_PLANS: professionalPlans,
    HOSTEL_LISTING_PLANS: hostelPlans,
    UNLOCK_CREDIT_PACKS: unlockPacks,
  }
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
          onPaid?.({ reference: account.reference, status: 'paid', bookingId: account.bookingId || null })
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
// The browser says WHAT it is paying for (purpose) and WHICH record (subject).
// It never sends an amount or metadata: the server prices the payment from the
// database and the platform fee registry (api/platform.js, resolvePayment).
export const initializeFlutterwavePayment = async ({
  purpose,
  subject = {},
  onSuccess,
  onClose,
  reference,
}) => {
  const ref = reference || generateReference()
  if (!purpose) {
    openTransferModal({ error: 'Missing payment details. Please try again.', onClose })
    return
  }

  let account
  try {
    const r = await fetch('/api/payments/virtual-account', {
      method: 'POST',
      headers: await authHeaders(),
      body: JSON.stringify({ reference: ref, purpose, subject }),
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
// Keys: unlock_credit_single, unlock_credit_pack_5. Prices come from getFeeAmounts(fees).
export const UNLOCK_CREDIT_PACKS = [
  { key: 'unlock_credit_single', credits: 1, label: '1 unlock' },
  { key: 'unlock_credit_pack_5', credits: 5, label: '5 unlocks', badge: 'Best value' },
]

export const buyUnlockCredits = async ({ pack, onSuccess, onClose }) => {
  if (!(pack?.price > 0)) throw new Error('Prices are still loading. Please try again in a moment.')
  await initializeFlutterwavePayment({
    purpose: 'contact_unlock_credits',
    subject: { pack: pack.key }, // the server prices this pack and sets the credits
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
  fees,
  applicationId,
  userId,
  professionalType,
  email,
  planType = 'monthly',
  onSuccess,
  onClose,
}) => {
  const plan = getFeeAmounts(fees).PROFESSIONAL_PLANS[professionalType]
  if (!plan) return
  const amount = planType === 'annual' ? plan.annualFee : plan.monthlyFee
  if (!(amount > 0)) throw new Error('Prices are still loading. Please try again in a moment.')

  await initializeFlutterwavePayment({
    // The server prices the plan and reads the professional type from the application.
    purpose: 'professional_subscription',
    subject: { application_id: applicationId, plan_type: planType },
    onSuccess: async (response) => {
      await verifyPayment(response.reference, response.transactionId)
      onSuccess?.(response)
    },
    onClose,
  })
}

// ─── Pay hostel listing fee ────────────────────────────────
// Called from ListHostelPage after saving the hostel draft.
// The browser never marks the listing paid. The Flutterwave webhook
// (api/flutterwave-webhook.js, hostel_listing_fee branch) sets listing_paid
// after verifying the charge server-side.
export const payHostelListingFee = async ({
  fees,
  email,
  hostelId,
  plan = 'semester',   // 'semester' | 'annual'
  ownerName = '',
  onSuccess,
  onClose,
}) => {
  const planMeta = getFeeAmounts(fees).HOSTEL_LISTING_PLANS[plan]
  if (!planMeta) return
  if (!(planMeta.price > 0)) throw new Error('Prices are still loading. Please try again in a moment.')

  const reference = generateReference()

  await initializeFlutterwavePayment({
    purpose: 'hostel_listing_fee',
    subject: { hostel_id: hostelId, plan },
    reference,
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
  if (!amountCents || !reference) return

  await initializeFlutterwavePayment({
    // The job's amount is read from the transaction on the server. The
    // reference must already be bound to this job (start_escrow_payment).
    purpose: 'transaction_escrow',
    subject: { transaction_id: transactionId },
    reference,
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
