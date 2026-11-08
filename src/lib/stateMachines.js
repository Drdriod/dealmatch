// One place that names every status column in the app, the values it may hold, and, where the code
// shows them, the moves between values. Before this, the legal values lived in database CHECK
// constraints and the moves lived in pages, API handlers and triggers, so a new feature had to read
// all three to learn what "paused" or "funded" may follow.
//
// This file DESCRIBES behaviour. It does not enforce anything and nothing at runtime depends on it,
// so adding it cannot change how the app behaves. Enforcement stays where it is (see `enforcedBy`).
// Tests keep the entries internally consistent, and docs/STATE_MACHINES.md is generated from here
// (`npm run docs:states`).
//
// Two levels of detail, on purpose:
//   modelled   `transitions` is a table checked against the code that writes the column.
//   catalogued `transitions` is null: the values are listed (from the database CHECK constraints,
//              read 8 Nov 2026) but nobody has yet written down which moves are legal. Do that
//              when you next change the feature, then flip it to a table.
//
// `unwritten` lists states the database allows but no code ever writes, so they have no way in.
//
// `enforcedBy`: 'transition-trigger' (database rejects illegal moves), 'conditional-update' (code
// writes `.eq(status, from)`), 'check-constraint' (only the value is checked), 'none'.

import { PAYOUT_TRANSITIONS } from './payoutStates.js'

const s = (...names) => Object.fromEntries(names.map((n) => [n, {}]))

export const MACHINES = {
  // ── Modelled ─────────────────────────────────────────────────────────────────────────────────
  payout_queue: {
    table: 'payout_queue', column: 'status', initial: 'pending',
    states: s('pending', 'processing', 'paid', 'failed'),
    transitions: PAYOUT_TRANSITIONS, // single source: lib/payoutStates.js, mirrored by trigger trg_guard_payout_transition
    enforcedBy: ['transition-trigger', 'conditional-update'],
    owner: 'src/lib/payoutStates.js',
  },
  escrow: {
    table: 'escrow_transactions', column: 'status', initial: 'awaiting_payment',
    states: s('awaiting_payment', 'funded', 'released', 'refunded'),
    transitions: { awaiting_payment: ['funded'], funded: ['released', 'refunded'], released: [], refunded: [] },
    enforcedBy: ['conditional-update'],
    owner: 'src/data/escrowRepository.js',
    notes: 'The column default in the database is "pending", but the code starts rows at "awaiting_payment". No CHECK constraint exists, so any text is accepted.',
  },
  property: {
    table: 'properties', column: 'status', initial: 'pending_review',
    states: s('pending_review', 'under_verification', 'active', 'rejected', 'paused', 'removed', 'inactive', 'rented', 'sold'),
    transitions: {
      pending_review: ['under_verification', 'active', 'rejected'], // agent claims it, or verifier/admin decides
      under_verification: ['active', 'rejected'],
      active: ['paused', 'removed', 'rented', 'sold'],
      paused: ['active', 'removed'],
      removed: ['active'], // ManageListings "restore"
      rejected: [],
      inactive: [],
      rented: [],
      sold: [],
    },
    unwritten: ['inactive'], // allowed by the database, never written by the code
    enforcedBy: ['check-constraint'],
    owner: 'src/data/manageListingsRepository.js',
    notes: 'Owners pause with "paused" and delete with "removed" (from migration 20261108000000, PR #63). Before it, the database refused "paused" from an owner, so Manage listings paused with "removed" and the landlord dashboard pause button failed. Old "removed" rows still show as paused and can be restored. "inactive" is in the CHECK list but nothing writes it. The database default is "active", while new listings are inserted as "pending_review".',
  },
  staff_invite: {
    table: 'staff_invites', column: 'status', initial: 'pending',
    states: s('pending', 'accepted', 'revoked', 'expired'),
    transitions: { pending: ['accepted', 'revoked', 'expired'], accepted: [], revoked: [], expired: [] },
    enforcedBy: ['check-constraint'],
    owner: 'supabase/migrations/20260828000004_staff_invite_flow.sql',
  },

  // ── Catalogued (values only) ─────────────────────────────────────────────────────────────────
  dispute_case: { table: 'disputes', column: 'case_state', initial: 'open', states: s('open', 'awaiting_response', 'under_review', 'escalated', 'resolved'), transitions: null, enforcedBy: ['transition-trigger'], owner: 'src/lib/disputeStates.js', notes: 'trg_guard_dispute_client_write limits what a client may write. A resolved case with a transaction must carry a decision, reason and time (CHECK).' },
  dispute_status: { table: 'disputes', column: 'status', initial: 'open', states: s('open', 'investigating', 'resolved', 'dismissed'), transitions: null, enforcedBy: ['check-constraint'] },
  student_hostel: { table: 'student_hostels', column: 'status', initial: 'pending_review', states: s('pending_review', 'active', 'paused', 'rejected', 'filled'), transitions: null, enforcedBy: ['check-constraint'], notes: 'Admin tab: active <-> paused, approve/reject from pending_review.' },
  booking: { table: 'bookings', column: 'status', initial: 'confirmed', states: s('pending', 'confirmed', 'cancelled', 'completed'), transitions: null, enforcedBy: ['check-constraint'] },
  transaction_payout: { table: 'transactions', column: 'payout_status', initial: 'not_queued', states: s('not_queued', 'queued', 'paid', 'failed'), transitions: null, enforcedBy: ['check-constraint'] },
  identity_verification: { table: 'profiles', column: 'identity_verification_status', initial: 'unverified', states: s('unverified', 'submitted', 'approved', 'rejected'), transitions: null, enforcedBy: ['transition-trigger'], notes: 'trg_guard_profile_identity and trg_lock_sensitive_profile_columns restrict client writes.' },
  account: { table: 'profiles', column: 'account_status', initial: 'active', states: s('active', 'suspended', 'deleted'), transitions: null, enforcedBy: ['none'], notes: 'No CHECK constraint. Values seen in code: active, suspended, deleted.' },
  professional_application: { table: 'professional_applications', column: 'status', initial: 'pending', states: s('pending', 'approved', 'rejected', 'paused'), transitions: null, enforcedBy: ['check-constraint'] },
  professional_request: { table: 'professional_requests', column: 'status', initial: 'pending', states: s('pending', 'connected', 'completed', 'cancelled'), transitions: null, enforcedBy: ['check-constraint'] },
  student_verification: { table: 'student_verifications', column: 'status', initial: 'pending', states: s('pending', 'approved', 'rejected'), transitions: null, enforcedBy: ['check-constraint'] },
  verification_submission: { table: 'verification_submissions', column: 'status', initial: 'pending', states: s('pending', 'approved', 'rejected'), transitions: null, enforcedBy: ['check-constraint'] },
  verification_session: { table: 'verification_sessions', column: 'status', initial: 'active', states: s('active', 'consumed', 'expired', 'rejected'), transitions: null, enforcedBy: ['check-constraint'] },
  hostel_payment: { table: 'hostel_payments', column: 'status', initial: 'pending', states: s('pending', 'success', 'failed'), transitions: null, enforcedBy: ['check-constraint'] },
  virtual_account: { table: 'payment_virtual_accounts', column: 'status', initial: 'pending', states: s('pending', 'paid', 'underpaid', 'expired'), transitions: null, enforcedBy: ['check-constraint'] },
  payment_refund: { table: 'payment_refunds', column: 'status', initial: 'to_refund', states: s('to_refund', 'refunded', 'resolved'), transitions: null, enforcedBy: ['check-constraint'] },
  wallet_ledger: { table: 'wallet_ledger', column: 'status', initial: 'pending', states: s('pending', 'processing', 'paid', 'failed'), transitions: null, enforcedBy: ['check-constraint'] },
  complaint: { table: 'complaints', column: 'status', initial: 'open', states: s('open', 'under_review', 'upheld', 'dismissed', 'escalated'), transitions: null, enforcedBy: ['check-constraint'], notes: 'trg_process_complaint_resolution runs side effects when a complaint is decided.' },
  report: { table: 'reports', column: 'status', initial: 'open', states: s('open', 'investigating', 'resolved', 'dismissed'), transitions: null, enforcedBy: ['check-constraint'] },
  contract: { table: 'contracts', column: 'status', initial: 'draft', states: s('draft', 'signed', 'executed', 'cancelled'), transitions: null, enforcedBy: ['check-constraint'], notes: 'trg_initialize_escrow runs when a contract changes.' },
  deal_agreement: { table: 'deal_agreements', column: 'status', initial: 'buyer_signed', states: s('buyer_signed', 'lister_signed', 'completed', 'cancelled'), transitions: null, enforcedBy: ['check-constraint'] },
  bid: { table: 'bids', column: 'status', initial: 'PENDING', states: s('PENDING', 'ACCEPTED', 'DECLINED', 'WITHDRAWN'), transitions: null, enforcedBy: ['check-constraint'] },
  category_listing: { table: 'category_listings', column: 'status', initial: 'ACTIVE', states: s('ACTIVE', 'MATCHED', 'SUSPENDED', 'CLOSED'), transitions: null, enforcedBy: ['check-constraint'] },
  forum_thread: { table: 'forum_threads', column: 'status', initial: 'OPEN', states: s('OPEN', 'CLOSED', 'HIDDEN'), transitions: null, enforcedBy: ['check-constraint'], notes: 'HIDDEN = moderated; the URL stays live and returns 404 to crawlers.' },
  property_inspection: { table: 'property_inspections', column: 'status', initial: 'pending', states: s('pending', 'scheduled', 'confirmed', 'completed', 'cancelled'), transitions: null, enforcedBy: ['check-constraint'] },
  property_interest: { table: 'property_interest', column: 'status', initial: 'new', states: s('new', 'contacted', 'qualified', 'closed', 'junk'), transitions: null, enforcedBy: ['check-constraint'] },
  hostel_enquiry: { table: 'hostel_enquiries', column: 'status', initial: 'pending', states: s('pending', 'contacted', 'converted', 'closed'), transitions: null, enforcedBy: ['check-constraint'] },
  referral_transaction: { table: 'referral_transactions', column: 'status', initial: 'pending', states: s('pending', 'confirmed', 'paid_out', 'cancelled'), transitions: null, enforcedBy: ['check-constraint'] },
  mortgage_application: { table: 'mortgage_applications', column: 'status', initial: 'pending', states: s('pending', 'processing', 'reviewing', 'approved', 'declined', 'finished', 'on_hold'), transitions: null, enforcedBy: ['check-constraint'], notes: 'trg_audit_mortgage_status writes an audit row on change.' },
  agent_assignment: { table: 'agent_assignments', column: 'status', initial: 'assigned', states: s('assigned', 'in_progress', 'completed', 'failed'), transitions: null, enforcedBy: ['check-constraint'] },
  agent_payment: { table: 'agent_payments', column: 'status', initial: 'pending', states: s('pending', 'paid', 'cancelled'), transitions: null, enforcedBy: ['check-constraint'] },
  agent_score: { table: 'agent_scores', column: 'status', initial: 'active', states: s('active', 'under_review', 'suspended', 'banned'), transitions: null, enforcedBy: ['check-constraint'] },
  crypto_payment: { table: 'crypto_payments', column: 'status', initial: 'pending', states: s('pending', 'confirmed', 'failed'), transitions: null, enforcedBy: ['check-constraint'] },
  testimonial: { table: 'testimonials', column: 'status', initial: 'pending', states: s('pending', 'approved', 'rejected'), transitions: null, enforcedBy: ['check-constraint'] },
  whatsapp_contact: { table: 'wa_contacts', column: 'status', initial: 'active', states: s('active', 'suspended', 'blocked'), transitions: null, enforcedBy: ['check-constraint'] },
  whatsapp_request: { table: 'wa_requests', column: 'status', initial: 'open', states: s('open', 'matched', 'closed', 'flagged'), transitions: null, enforcedBy: ['check-constraint'] },
  commission: { table: 'commissions', column: 'status', initial: 'DRAFT', states: s('DRAFT', 'SCHEDULED', 'ACTIVE', 'EXPIRED', 'ARCHIVED'), transitions: null, enforcedBy: ['check-constraint'], notes: 'Postgres enum commission_status. trg_notify_commission_activated fires when it becomes ACTIVE.' },
  payout_account: { table: 'payout_accounts', column: 'status', initial: 'pending', states: s('pending', 'verified', 'rejected'), transitions: null, enforcedBy: ['check-constraint'], notes: 'Postgres enum payout_account_status.' },
  subscription: { table: 'subscriptions', column: 'status', initial: 'active', states: s('active', 'cancelled', 'expired'), transitions: null, enforcedBy: ['check-constraint'], notes: 'Postgres enum subscription_status.' },
  transaction: { table: 'transactions', column: 'status', initial: 'OPEN', states: s('OPEN', 'PENDING', 'FUNDED', 'COMPLETED', 'DISPUTED', 'CANCELLED'), transitions: null, enforcedBy: ['check-constraint'], notes: 'Postgres enum transaction_status. Triggers log every change and block commission edits.' },
  withdrawal_request: { table: 'withdrawal_requests', column: 'status', initial: 'pending', states: s('pending', 'paid', 'rejected'), transitions: null, enforcedBy: ['check-constraint'], notes: 'Postgres enum withdrawal_status.' },
}

// Status columns that exist but accept any text and whose values nobody has listed yet.
// Read the code that writes them before adding an entry above.
export const UNCATALOGUED = [
  'payments.status', 'rental_enquiries.status', 'pro_activation_requests.status', 'outbound_message_log.status',
]

export const isModelled = (name) => !!MACHINES[name]?.transitions

export function getMachine(name) {
  const m = MACHINES[name]
  if (!m) throw new Error(`Unknown state machine: ${name}`)
  return m
}

export const isKnownState = (name, state) => Object.hasOwn(getMachine(name).states, state)

// true / false for a modelled machine; null when the machine only lists values, so callers cannot
// mistake "not modelled yet" for "not allowed".
export function canMove(name, from, to) {
  const m = getMachine(name)
  if (!m.transitions) return null
  return (m.transitions[from] || []).includes(to)
}

// Mermaid source for one modelled machine (used by the generated doc).
export function toMermaid(name) {
  const m = getMachine(name)
  if (!m.transitions) return null
  const lines = ['stateDiagram-v2', `  [*] --> ${m.initial}`]
  for (const [from, tos] of Object.entries(m.transitions)) for (const to of tos) lines.push(`  ${from} --> ${to}`)
  for (const [st, tos] of Object.entries(m.transitions)) if (!tos.length) lines.push(`  ${st} --> [*]`)
  return lines.join('\n')
}
