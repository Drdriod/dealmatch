# Backlog batch 1: wiring, assumptions, open items

Covers UX-1, UX-2, UX-3, UX-7, UX-8 (links), UX-9 (component), UX-10, UX-15, UX-17, UX-19 and DB-3, DB-5, DB-6.
One pull request per item is the rule. This batch is staged as one delta so you can split it.

## 1. Brand
Merge `tailwind.brand.cjs` into `theme.extend.colors`. Ink, gold, cream and sand are the production wallet palette.
Terracotta (`#A8452A`, dark `#843420`, tint `#F4E1D8`) is a starting value: replace with the brand asset values.

## 2. Imports to confirm (the only guesses in the front end)
| File imports | Expected |
|---|---|
| `../lib/supabase` | named export `supabase` |
| `./useLoader` (in hooks) | `useLoader(fn, deps)` returning `{ data, error, loading, reload }` |
| `../components/LoadNotice` | default export taking `{ error, onRetry }` |
| `../hooks/useAuth` | returns `{ user, isAdmin }` |

## 3. Routes (App.jsx, lazy)
/protection /help /rules /contact /about (public)
/transactions/:ref /disputes/new /disputes/:id /provider (signed in)
Admin: add a Disputes tab rendering `<AdminDisputesTab isAdmin userId />` from the permission map (UX-24).
Footer (UX-3): add links to /protection, /help, /rules, /contact, /about and /delete-account.
Link rows in `my_requests` on /dashboard to `/transactions/${encodeURIComponent(ref)}` (UX-8).

## 4. Env
`VITE_SUPPORT_WHATSAPP` (digits, international format), `VITE_SUPPORT_EMAIL`.

## 5. Migration 20 assumptions (verify with \d, then dry run with ROLLBACK)
- `transactions`: buyer_id, provider_id, buyer_confirmed_at, provider_confirmed_at, amount_cents, updated_at.
- `is_admin()` exists. `disputes.id` is uuid. Legacy NOT NULL columns on `disputes` (for example property_id) will break `open_dispute`; relax them in the migration.
- The view covers `transactions` only. Add UNION ALL branches for `escrow_transactions` and `bookings` once their party and status columns are confirmed. The front end does not change.
- `platform_fees` column names in `feesRepository.js` (`fee_key, label, amount_kobo`).
- RPC `confirm_transaction_buyer/provider` parameter `p_transaction_id`.

## 6. Open items this batch does not close
1. **Money after a dispute decision.** `decide_dispute` records the decision and a reason in an append-only log. It does not refund or release. Connect `refund_to_customer` to `payment_refunds` and `release_to_provider` to the payout path, server side, in a follow-up.
2. **Audit log (DB-8).** Decisions are audited in `dispute_events`. Mirror into `admin_audit_log` after DB-8.
3. **Checkout wiring (UX-9).** `CheckoutPanel` is the single UI. Wrap it from `PropertyReserveModal` and `EscrowPage` by passing `startPayment` (existing `flutterwave.js` bank transfer) and `getPaymentStatus`. Lines and totals must come from the server quote and fee registry.
4. **Cancel and refund (UX-11)** needs a written cancellation policy first.
5. **Counsel review** of `ProtectionPage.jsx` and `HelpPage.jsx` copy.
6. Not included: UX-6 settings and security (later tier), UX-26 and UX-27 roll-outs.

## 7. Design decisions taken from the sample code
- Card number, expiry and CVC fields from the samples were dropped. Collecting card data in the browser is a PCI risk. Card and USSD show as not available until Flutterwave V4 handles them.
- Invented claims were removed (24 hour release, 100% protection, 2 hour response, fake ratings, fake patient and Preline content).
- Sample state was local mock data. Everything now reads server state through repositories and hooks. Pages never call the database.
- No em dashes, no emojis, Lucide icons only, status always has text.

## 8. Push (delta zip: overlay, never force push)
cd ~ && rm -rf dm-overlay && git clone https://github.com/Drdriod/dealmatch dm-overlay && unzip -o ~/storage/downloads/dealmatch-backlog-batch1.zip -d dm-overlay && cd dm-overlay && git add -A && git commit -m "UX-1,2,3,7,9,10,15,19 DB-3,5,6 batch 1" && git push origin main
