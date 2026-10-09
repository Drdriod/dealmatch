// Flutterwave: payment gateway (replaces the previous gateway).
// Handles professional listing subscription fees, student hostel listing
// fees, escrow funding for marketplace transactions (ADR-009) and
// contact-unlock credit packs.
//
// Amounts in this module are NAIRA. Flutterwave takes naira; the database
// and the webhook work in kobo (amount x 100). The webhook is the only
// place that grants anything: the client callback below is for UX only.

const FLUTTERWAVE_PUBLIC_KEY = import.meta.env.VITE_FLUTTERWAVE_PUBLIC_KEY

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

// ─── Load Flutterwave inline checkout once ─────────────────
let flutterwaveLoaded = false
function loadFlutterwaveScript() {
  return new Promise((resolve) => {
    if (flutterwaveLoaded || window.FlutterwaveCheckout) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://checkout.flutterwave.com/v3.js'
    script.onload = () => { flutterwaveLoaded = true; resolve() }
    script.onerror = () => resolve() // fail silently
    document.head.appendChild(script)
  })
}

// ─── Open payment popup ────────────────────────────────────
// `amount` is in naira. `reference` becomes the Flutterwave tx_ref, which
// the webhook resolves transactions by (the same role the payment reference plays in the webhook).
export const initializeFlutterwavePayment = async ({
  email,
  amount,
  metadata = {},
  onSuccess,
  onClose,
  reference,
}) => {
  if (!FLUTTERWAVE_PUBLIC_KEY) {
    console.warn('[DealMatch] VITE_FLUTTERWAVE_PUBLIC_KEY is not set - payment skipped')
    return
  }
  await loadFlutterwaveScript()
  if (!window.FlutterwaveCheckout) { return }

  const txRef = reference || generateReference()
  window.FlutterwaveCheckout({
    public_key:      FLUTTERWAVE_PUBLIC_KEY,
    tx_ref:          txRef,
    amount:          Number(amount),
    currency:        'NGN',
    payment_options: 'card,banktransfer,ussd',
    customer:        { email },
    meta:            { ...metadata, platform: 'DealMatch', tx_ref: txRef },
    customizations:  { title: 'DealMatch', description: metadata.plan_name || metadata.property_title || 'DealMatch payment' },
    callback: (response) => {
      // Normalised so callers keep using response.reference.
      // Only a server verification (/api/payments/verify) or the webhook counts as paid.
      onSuccess?.({
        reference:     response.tx_ref || txRef,
        transactionId: response.transaction_id,
        status:        response.status,
      })
    },
    onclose: (incomplete) => { if (incomplete) onClose?.() },
  })
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

// ─── Verify on server ──────────────────────────────────────
export const verifyPayment = async (reference, transactionId) => {
  try {
    const res = await fetch('/api/payments/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reference, transactionId }),
    })
    if (!res.ok) throw new Error('Verification failed')
    return await res.json()
  } catch (error) {
    return { success: false, error: error.message }
  }
}

// ─── Utils ────────────────────────────────────────────────
export const generateReference = () =>
  'dm_' + Date.now() + '_' + Math.random().toString(36).substring(2, 9)

export const formatNaira = (amount) => {
  if (!amount && amount !== 0) return '₦0'
  return new Intl.NumberFormat('en-NG', {
    style:    'currency',
    currency: 'NGN',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount)

}
