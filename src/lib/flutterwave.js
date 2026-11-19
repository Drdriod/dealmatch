// Flutterwave V4: payment gateway.
// Handles professional listing subscription fees, student hostel listing
// fees, escrow funding for marketplace transactions (ADR-009) and
// contact-unlock credit packs.
//
// Amounts in this module are NAIRA. Flutterwave takes naira; the database
// and the webhook work in kobo (amount x 100). The webhook is the only
// place that grants anything: the client callback below is for UX only.

import { describeCheck, MESSAGES as TRANSFER_CHECK_MESSAGES } from './transferCheck.js'
import { supabase } from '@/lib/supabase'
import { feeValue, formatPlatformFee } from '@/lib/platformFees'
import { captureMessage } from '@/lib/sentry'

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
// Every Nth tick also asks the server to look for the transfer itself, so a slow or
// failing webhook does not leave the payer waiting. The server limits this to one
// look-up per 15 seconds, and only its answer is believed.
const VERIFY_EVERY_TICKS = 3

const authHeaders = async () => {
  const { data } = await supabase.auth.getSession()
  const token = data?.session?.access_token
  if (!token) throw new Error('Please sign in to make a payment.')
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// Builds the transfer screen with DOM nodes (no innerHTML, so server values
// are never parsed as markup). Calls onPaid once the server reports paid.
/** @param {{ account?: any, error?: string, onPaid?: (...args: any[]) => any, onClose?: (...args: any[]) => any }} opts */
function openTransferModal({ account, error, onPaid, onClose }) {
  const overlay = document.createElement('div')
  overlay.setAttribute('role', 'dialog')
  overlay.setAttribute('aria-modal', 'true')
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
    zIndex: '9999', padding: '16px', overflowY: 'auto',
    // Soft brand-coloured light behind the glass so the blur has something to frost.
    background: 'radial-gradient(circle at 20% 15%, rgba(243,201,106,0.45), transparent 45%), radial-gradient(circle at 85% 85%, rgba(184,81,30,0.40), transparent 50%), rgba(23,52,40,0.55)',
    backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)',
  })

  const card = document.createElement('div')
  Object.assign(card.style, {
    position: 'relative', overflow: 'hidden', maxWidth: '440px', width: '100%', margin: 'auto',
    padding: '28px 24px 24px', boxSizing: 'border-box', color: '#17211B', lineHeight: '1.45',
    fontFamily: "'Plus Jakarta Sans', system-ui, sans-serif",
    // Frosted glass with a water-drop shape: three round corners and one tight one.
    background: 'rgba(255,255,255,0.78)', border: '1px solid rgba(255,255,255,0.75)',
    borderRadius: '40px 40px 40px 12px',
    backdropFilter: 'blur(24px) saturate(160%)', WebkitBackdropFilter: 'blur(24px) saturate(160%)',
    boxShadow: '0 24px 70px rgba(23,33,27,0.30), inset 0 1px 0 rgba(255,255,255,0.9)',
  })
  // Two decorative drops (a circle with one pointed corner, turned) in the brand colours.
  const drop = (size, top, right, bottom, left, colour) => {
    const d = document.createElement('div')
    d.setAttribute('aria-hidden', 'true')
    Object.assign(d.style, {
      position: 'absolute', width: size + 'px', height: size + 'px', pointerEvents: 'none',
      borderRadius: '50% 50% 50% 6%', transform: 'rotate(-45deg)', background: colour, filter: 'blur(1px)',
      ...(top != null ? { top: top + 'px' } : {}), ...(right != null ? { right: right + 'px' } : {}),
      ...(bottom != null ? { bottom: bottom + 'px' } : {}), ...(left != null ? { left: left + 'px' } : {}),
    })
    return d
  }
  const decor = [
    drop(120, -40, -30, null, null, 'linear-gradient(135deg, rgba(243,201,106,0.75), rgba(184,81,30,0.35))'),
    drop(90, null, null, -34, -26, 'linear-gradient(135deg, rgba(122,158,126,0.55), rgba(35,76,58,0.25))'),
  ]

  const line = (label, value, { big = false } = {}) => {
    const wrap = document.createElement('div')
    wrap.style.margin = '12px 0'
    const l = document.createElement('div')
    l.textContent = label
    Object.assign(l.style, { fontSize: '12px', color: '#5C665F', fontWeight: '600', letterSpacing: '0.04em', textTransform: 'uppercase' })
    const v = document.createElement('div')
    v.textContent = value
    Object.assign(v.style, { fontSize: big ? '30px' : '16px', fontWeight: '700', letterSpacing: big ? '0.1em' : 'normal', color: big ? '#fff' : '#17211B' })
    wrap.append(l, v)
    return { wrap, value: v }
  }

  const button = (text, primary) => {
    const b = document.createElement('button')
    b.type = 'button'
    b.textContent = text
    Object.assign(b.style, {
      padding: '11px 18px', borderRadius: '999px 999px 999px 8px', cursor: 'pointer', fontSize: '14px', fontWeight: '700',
      fontFamily: 'inherit',
      border: primary ? 'none' : '1px solid rgba(23,33,27,0.25)',
      background: primary ? '#B8511E' : 'rgba(255,255,255,0.6)',
      color: primary ? '#fff' : '#17211B',
      boxShadow: primary ? '0 8px 24px rgba(200,95,45,0.35)' : 'none',
    })
    return b
  }

  const title = document.createElement('h2')
  title.textContent = error ? 'Payment unavailable' : 'Pay by bank transfer'
  Object.assign(title.style, { margin: '0 0 8px', fontSize: '26px', fontWeight: '400', fontFamily: "'DM Serif Display', Georgia, serif", color: '#173428' })
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
    numberLine.wrap.querySelector('div').style.color = 'rgba(255,255,255,0.8)'
    const copyBtn = button('Copy account number', true)
    copyBtn.style.marginTop = '10px'
    copyBtn.style.padding = '9px 16px'
    copyBtn.style.fontSize = '13px'
    numberLine.wrap.append(copyBtn)
    Object.assign(numberLine.wrap.style, {
      margin: '16px 0', padding: '16px 18px', borderRadius: '28px 28px 28px 8px',
      background: 'linear-gradient(135deg, rgba(35,76,58,0.95), rgba(23,52,40,0.95))',
      boxShadow: '0 12px 32px rgba(23,52,40,0.35)',
    })
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

    Object.assign(status.style, { color: '#17211B', fontWeight: '600' })
    status.textContent = 'Waiting for your transfer. This updates automatically once it arrives.'

    const note = document.createElement('p')
    note.textContent = 'Only send from your own bank account. If you close this window after sending, the payment is still confirmed automatically.'
    Object.assign(note.style, { margin: '12px 0 0', fontSize: '12px', color: '#5C665F' })

    // "I have already paid": asks the server to look for the transfer now, so the payer does not
    // have to wait for the bank's notification. Only the server's answer is believed.
    const checkBtn = button('I have already paid', true)
    checkBtn.addEventListener('click', async () => {
      if (done || checkBtn.disabled) return
      checkBtn.disabled = true
      checkBtn.style.opacity = '0.6'
      status.textContent = 'Checking for your transfer...'
      try {
        const r = await fetch('/api/payments/verify', {
          method: 'POST',
          headers: await authHeaders(),
          body: JSON.stringify({ reference: account.reference }),
        })
        const json = await r.json().catch(() => null)
        const result = describeCheck(r.status, json)
        if (result.paid) {
          finish()
          onPaid?.({ reference: account.reference, status: 'paid', bookingId: account.bookingId || null })
          return
        }
        status.textContent = result.message
      } catch {
        status.textContent = TRANSFER_CHECK_MESSAGES.error
      }
      setTimeout(() => { checkBtn.disabled = false; checkBtn.style.opacity = '1' }, 15000)
    })
    actions.insertBefore(checkBtn, closeBtn)

    card.append(title, intro, numberLine.wrap, bankLine.wrap, amountLine.wrap, expiryLine.wrap, status, note, actions)

    const expiresMs = account.expiresAt ? new Date(account.expiresAt).getTime() : Infinity
    let tick = 0
    const poll = async () => {
      if (done) return
      tick += 1
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
          return
        }
        if (tick % VERIFY_EVERY_TICKS === 0 && !done) {
          const vr = await fetch('/api/payments/verify', {
            method: 'POST',
            headers: await authHeaders(),
            body: JSON.stringify({ reference: account.reference }),
          })
          const vjson = await vr.json().catch(() => null)
          if (!done && describeCheck(vr.status, vjson).paid) {
            finish()
            onPaid?.({ reference: account.reference, status: 'paid', bookingId: account.bookingId || null })
          }
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
  // Content sits above the decorative drops.
  const content = document.createElement('div')
  content.style.position = 'relative'
  content.append(...card.childNodes)
  card.append(...decor, content)
  overlay.appendChild(card)
  document.body.appendChild(overlay)
}

// ─── Start a payment ───────────────────────────────────────
// `amount` is in naira. `reference` is the payment reference (hyphenated, see
// generateReference); the webhook resolves the payment by it.
// The browser says WHAT it is paying for (purpose) and WHICH record (subject).
// It never sends an amount or metadata: the server prices the payment from the
// database and the platform fee registry (api/platform.js, resolvePayment).
/** @param {{ purpose?: string, subject?: Record<string, any>, onSuccess?: (...args: any[]) => any, onClose?: (...args: any[]) => any, reference?: string }} options */
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
    if (!r.ok) {
      if (json?.code === 'rate_limit_unavailable') captureMessage('Payment rate limiter (Redis) is unavailable', 'error')
      throw new Error(json?.error || 'Could not start payment')
    }
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
/** @param {string} reference @param {any} [_transactionId] ignored; older callers still pass it */
export const verifyPayment = async (reference, _transactionId) => {
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
