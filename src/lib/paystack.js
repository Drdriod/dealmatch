// Paystack: Nigerian payment gateway
// Handles professional listing subscription fees + student hostel listing fees
// + escrow funding for marketplace transactions (ADR-009).

const PAYSTACK_PUBLIC_KEY = import.meta.env.VITE_PAYSTACK_PUBLIC_KEY

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

// ─── Load Paystack script once ─────────────────────────────
let paystackLoaded = false
function loadPaystackScript() {
  return new Promise((resolve) => {
    if (paystackLoaded || window.PaystackPop) { resolve(); return }
    const script = document.createElement('script')
    script.src = 'https://js.paystack.co/v1/inline.js'
    script.onload = () => { paystackLoaded = true; resolve() }
    script.onerror = () => resolve() // fail silently
    document.head.appendChild(script)
  })
}

// ─── Open payment popup ────────────────────────────────────
export const initializePaystackPayment = async ({
  email,
  amount,
  metadata = {},
  onSuccess,
  onClose,
  reference,
}) => {
  if (!PAYSTACK_PUBLIC_KEY) {
    console.warn('[DealMatch] VITE_PAYSTACK_PUBLIC_KEY is not set - payment skipped')
    return
  }
  await loadPaystackScript()
  if (!window.PaystackPop) { return }

  const handler = window.PaystackPop.setup({
    key:      PAYSTACK_PUBLIC_KEY,
    email,
    amount:   amount * 100, // kobo
    currency: 'NGN',
    ref:      reference || generateReference(),
    metadata: { ...metadata, platform: 'DealMatch' },
    callback: (response) => onSuccess?.(response),
    onClose:  () => onClose?.(),
  })
  handler.openIframe()
}

// ─── Subscribe professional ────────────────────────────────
// Called after the applicant's professional_applications row has
// already been created with status='pending'. On successful
// payment, the Paystack webhook flips status to 'active'.
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

  await initializePaystackPayment({
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
      await verifyPayment(response.reference)
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

  await initializePaystackPayment({
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
// IMPORTANT: this only opens the Paystack popup. It does NOT flip the
// transaction to FUNDED on the client -- same reasoning as
// subscribeProfessional above, that flip must happen in the Paystack
// webhook after real server-side verification, keyed off
// metadata.type === 'transaction_escrow'. See src/lib/events.js's
// escrow.funded handler for what fires once that webhook case exists
// (it doesn't yet -- see the note in JobPostingPage.jsx).
export const fundTransactionEscrow = async ({
  email,
  transactionId,
  amountCents,
  requesterId,
  onSuccess,
  onClose,
}) => {
  if (!amountCents) return
  const reference = generateReference()

  await initializePaystackPayment({
    email,
    amount:    amountCents / 100, // this function takes naira, not cents
    reference,
    metadata: {
      type:           'transaction_escrow', // matches webhook TYPE_MAP key -- add this case server-side
      transaction_id: transactionId,
      user_id:        requesterId,
    },
    onSuccess: async (response) => {
      await verifyPayment(response.reference)
      onSuccess?.(response)
    },
    onClose,
  })
}

// ─── Verify on server ──────────────────────────────────────
export const verifyPayment = async (reference) => {
  try {
    const res = await fetch('/api/payments/verify', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ reference }),
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
