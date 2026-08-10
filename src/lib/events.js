/**
 * ADR-010: Internal event backbone.
 *
 * One emitEvent(name, payload) call per state-changing action, fanning out
 * to synchronous in-process handlers. This is NOT a message broker or a
 * move to microservices -- it's a design pattern inside the one deployable.
 * The moment a handler genuinely needs to be async or external (WhatsApp
 * delivery is the first real candidate), it becomes a consumer of the same
 * event without the emitting code changing.
 *
 * Bug fix (2026-08-10): 'bid.accepted' added, and JobPostingPage now fires
 * this (not 'bid.placed') when a bid is accepted -- see the migration
 * comment in 20260731000017 for why the previous version was wrong.
 */

import {
  notifyListingApproved,
  notifyBidReceived,
  notifyBidAccepted,
  notifyEscrowFunded,
  notifyJobCompleted,
  notifyDisputeOpened,
} from '@/lib/notifications'
import { sendWhatsAppNotification } from '@/lib/whatsapp'

const handlers = {
  'listing.created': [],

  'listing.approved': [
    (p) => notifyListingApproved(p.ownerId, p.title, p.link),
  ],

  // Fires when a provider submits a NEW bid, notifying the requester.
  // Not yet called anywhere -- no provider-side "submit a bid" UI exists
  // yet. Registered and ready for when that's built.
  'bid.placed': [
    (p) => notifyBidReceived(p.requesterId, p.providerName, p.amountCents, p.link),
  ],

  // Fires when the requester accepts a bid, notifying the PROVIDER whose
  // bid won. This is what JobPostingPage's acceptBid() actually calls.
  'bid.accepted': [
    (p) => notifyBidAccepted(p.providerId, p.amountCents, p.link),
  ],

  'escrow.funded': [
    (p) => notifyEscrowFunded(p.providerId, p.amountCents, p.link),
    (p) => sendWhatsAppNotification(p.providerPhone, `Escrow funded: ₦${(p.amountCents / 100).toLocaleString()} is now held. You can proceed.`),
  ],

  'job.completed': [
    (p) => notifyJobCompleted(p.requesterId, p.link),
    (p) => notifyJobCompleted(p.providerId, p.link),
  ],

  'dispute.opened': [
    (p) => notifyDisputeOpened(p.requesterId, p.link),
    (p) => notifyDisputeOpened(p.providerId, p.link),
  ],
}

export function emitEvent(name, payload) {
  const list = handlers[name]
  if (!list) {
    console.warn(`emitEvent: "${name}" is not a registered event name`)
    return
  }
  for (const handler of list) {
    try {
      handler(payload)
    } catch (err) {
      console.error(`emitEvent handler error for "${name}":`, err?.message || err)
    }
  }
}

export function registerHandler(name, handler) {
  if (!handlers[name]) handlers[name] = []
  handlers[name].push(handler)
}
