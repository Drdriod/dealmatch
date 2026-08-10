/**
 * ADR-010: Internal event backbone.
 *
 * One emitEvent(name, payload) call per state-changing action, fanning out
 * to synchronous in-process handlers. This is NOT a message broker or a
 * move to microservices -- it's a design pattern inside the one deployable,
 * same conclusion as the Phase 2 style review (data consistency ranked
 * above elasticity). The moment a handler genuinely needs to be async or
 * external (WhatsApp delivery is the first real candidate, see
 * src/lib/whatsapp.js), it becomes a consumer of the same event without
 * the emitting code changing -- that's the point of drawing this seam now.
 *
 * Usage at a call site, e.g. after a bid is inserted:
 *   import { emitEvent } from '@/lib/events'
 *   emitEvent('bid.placed', { requesterId, providerName, amountCents, link })
 */

import {
  notifyListingApproved,
  notifyBidReceived,
  notifyEscrowFunded,
  notifyJobCompleted,
  notifyDisputeOpened,
} from '@/lib/notifications'
import { sendWhatsAppNotification } from '@/lib/whatsapp'

const handlers = {
  // listing.created has no handlers yet -- this is where search-index
  // update / analytics logging (Architecture v3, Section 8: "Event
  // emission coverage" fitness function) attaches once those exist.
  // Registered as an empty array (not left out) so `emitEvent` doesn't
  // warn every time a listing is created before those consumers exist.
  'listing.created': [],

  'listing.approved': [
    (p) => notifyListingApproved(p.ownerId, p.title, p.link),
  ],

  'bid.placed': [
    (p) => notifyBidReceived(p.requesterId, p.providerName, p.amountCents, p.link),
  ],

  'escrow.funded': [
    (p) => notifyEscrowFunded(p.providerId, p.amountCents, p.link),
    // WhatsApp is the first real async candidate the ADR names explicitly --
    // contact details unlock at this event, so a WhatsApp ping matters more
    // here than email latency does.
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

/**
 * Fire an event. Never throws -- a failed handler (e.g. WhatsApp API down)
 * must never block the state-changing action that emitted it, same
 * never-block principle notifications.js already follows for payouts.
 */
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

/**
 * Register an additional handler for an existing event name (e.g. search
 * index update, analytics log) without touching this file's core map.
 */
export function registerHandler(name, handler) {
  if (!handlers[name]) handlers[name] = []
  handlers[name].push(handler)
}
