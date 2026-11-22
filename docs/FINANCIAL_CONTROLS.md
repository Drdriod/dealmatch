# Financial Controls

## In place (Implemented)

- Money columns on escrow cannot be changed by clients (`fn_guard_escrow_money`).
- Webhook payments are recorded once per reference; duplicate webhooks do not double-credit.
- A short payment is not treated as full payment.
- Tax rate changes, referral setting changes and gateway rate changes are written to history tables.
- Tax figures readable only through `can_read_tax()`; tax access granted only by the owner.
- Referral rewards: monthly cap per referrer, hold days before release, review queue, reversal on refund, release only to identity-approved referrers with a verified payout account.
- Finance summary lists what needs attention: refunds to return, payouts pending or failed, open disputes, paid-but-not-fulfilled, underpaid, referrals awaiting review.
- Production migrations are applied only after review; the PR is merged only by the owner.

## Gaps (to close)

| Gap | Risk | Priority |
|---|---|---|
| Auto-release double call | Funds stuck after 72h | Critical |
| No daily reconciliation of gateway settlements to the ledger | Differences go unseen | High |
| Unused escrow shares stay in float | Silent leakage | High |
| Old referral line in escrow split | Double referral payout | High |
| Refund and dispute payout paths not yet audited | Unknown | High |
| No second-person approval for large payouts | Single point of failure | Medium |
| Gateway fee rates unverified | Margin misstated | Medium |

## Proposed controls (Proposed)

1. Daily reconciliation: gateway settlement report against `payments` and the ledger; flag any difference.
2. Four-eyes approval for payouts above a limit the founder sets.
3. Alert when escrow float older than the release window has not been paid or refunded.
4. Weekly review of the Finance tab "needs attention" list.
5. Never change a live rate without a recorded reason in history.
