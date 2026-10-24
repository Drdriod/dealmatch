// Display states come from the protected_transactions view (DB-3).
// The server decides the state. The client only labels it and picks the next action.

export const DISPLAY_STATES = {
  awaiting_payment: { label: 'Awaiting payment', tone: 'neutral', help: 'Payment has not been made yet.' },
  processing: { label: 'Processing payment', tone: 'progress', help: 'We are confirming your payment.' },
  in_progress: { label: 'In progress', tone: 'progress', help: 'Payment is held safely while the work is done.' },
  awaiting_completion: { label: 'Awaiting completion', tone: 'progress', help: 'One side has confirmed. The other side still needs to.' },
  release_pending: { label: 'Release pending', tone: 'progress', help: 'Both sides confirmed. Payment is being released.' },
  refund_pending: { label: 'Refund pending', tone: 'attention', help: 'A refund is being processed.' },
  completed: { label: 'Completed', tone: 'success', help: 'Both sides confirmed and payment was released.' },
  cancelled: { label: 'Cancelled', tone: 'muted', help: 'This transaction was cancelled.' },
  disputed: { label: 'Under review', tone: 'attention', help: 'A problem was reported. Release is paused while it is reviewed.' },
  decision_recorded: { label: 'Decision recorded', tone: 'attention', help: 'Staff decided the case. Any payment movement is handled by our team and you will be told.' },
  needs_attention: { label: 'Needs attention', tone: 'attention', help: 'Something needs a closer look. Contact support.' },
};

export function stateMeta(state) {
  return DISPLAY_STATES[state] || DISPLAY_STATES.needs_attention;
}

export const EVENT_LABELS = {
  created: 'Transaction created',
  status_open: 'Waiting for payment',
  status_pending: 'Payment being confirmed',
  status_funded: 'Payment received and held',
  status_completed: 'Completed',
  status_disputed: 'Problem reported',
  status_cancelled: 'Cancelled',
  buyer_confirmed: 'Customer confirmed the work',
  provider_confirmed: 'Provider confirmed the work',
  dispute_opened: 'Problem reported',
  dispute_decided: 'Decision recorded',
};

export function eventLabel(type) {
  return EVENT_LABELS[type] || 'Update';
}

// role: 'customer' | 'provider' | 'admin' | 'viewer'
// Returns the one thing this person can do next, or a plain description of what is being waited on.
export function nextActionFor({ state, role, buyerConfirmed, providerConfirmed }) {
  const confirmed = role === 'customer' ? buyerConfirmed : role === 'provider' ? providerConfirmed : true;
  const isParty = role === 'customer' || role === 'provider';

  if (state === 'in_progress' || state === 'awaiting_completion') {
    if (isParty && !confirmed) {
      return {
        id: 'confirm_completion',
        label: 'Confirm the work is done',
        description:
          role === 'customer'
            ? 'Confirm only when the work matches what was agreed. Payment is released after both sides confirm.'
            : 'Confirm once you have finished the work. Payment is released after both sides confirm.',
      };
    }
    if (isParty && confirmed) {
      return { id: 'wait', label: null, description: 'You have confirmed. Waiting for the other side.' };
    }
  }
  if (state === 'awaiting_payment') {
    return { id: 'wait', label: null, description: role === 'customer' ? 'Complete payment to start protection.' : 'Waiting for the customer to pay.' };
  }
  if (state === 'processing') return { id: 'wait', label: null, description: 'No action needed. This usually updates on its own.' };
  if (state === 'disputed') return { id: 'wait', label: null, description: 'Open the case to add information or evidence.' };
  return null;
}

export function canReportProblem(state, role) {
  return (role === 'customer' || role === 'provider') && ['in_progress', 'awaiting_completion', 'release_pending'].includes(state);
}

export function roleFor(tx, userId, isAdmin) {
  if (!tx) return 'viewer';
  if (userId && tx.buyer_id === userId) return 'customer';
  if (userId && tx.provider_id === userId) return 'provider';
  return isAdmin ? 'admin' : 'viewer';
}

export const ACTIVE_STATES = ['in_progress', 'awaiting_completion', 'release_pending'];
export const WAITING_STATES = ['awaiting_payment', 'processing'];
export const ATTENTION_STATES = ['disputed', 'decision_recorded', 'needs_attention', 'refund_pending'];
