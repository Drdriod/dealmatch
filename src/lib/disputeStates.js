export const CASE_STATES = {
  open: { label: 'Open', tone: 'attention' },
  awaiting_response: { label: 'Awaiting response', tone: 'progress' },
  under_review: { label: 'Under review', tone: 'progress' },
  escalated: { label: 'Escalated', tone: 'attention' },
  resolved: { label: 'Resolved', tone: 'success' },
};

export const REASONS = [
  'The work was not done',
  'The work is not what was agreed',
  'The other side is not responding',
  'There is a problem with the payment',
  'Something else',
];

export const DECISIONS = [
  { id: 'release_to_provider', label: 'Release to provider', help: 'The work was done as agreed.' },
  { id: 'refund_to_customer', label: 'Refund customer', help: 'The work was not done as agreed.' },
  { id: 'split', label: 'Split', help: 'Each side gets part. Record the split in the reason.' },
  { id: 'dismissed', label: 'Dismiss', help: 'No action. The transaction continues.' },
];

export const EVIDENCE_LIMITS = {
  maxFiles: 10,
  maxBytes: 10 * 1024 * 1024,
  types: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};
