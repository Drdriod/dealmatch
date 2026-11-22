# Nigerian Tax Readiness

This document says what the system can do. It does **not** state what the law requires. Every rate, threshold and registration question is **Requires external verification** by a qualified Nigerian accountant or tax adviser.

## What is built (Implemented, Tested on staging)

- VAT rate setting (placeholder 7.5%, OFF). When ON, VAT is added to DealMatch's own fees at checkout and shown to the payer.
- VAT on the job commission held from provider payouts at release (staging only).
- Withholding tax setting (placeholder 10%, OFF) applied to referral cash at release, shown to the referrer.
- `tax_ledger`: one row per reference and kind, with base, rate, amount, status (owed, remitted).
- Owner can mark amounts as remitted. Every rate change is kept in history.
- Tax figures readable only by the owner and by accounts the owner adds (for example the accountant). Ordinary admins cannot read them.

## What is not built or not known

- Real payment with VAT ON has not been tested.
- VAT on the seller's half of escrow is not handled (audit M3).
- Invoices/receipts with a tax identification number are not generated.
- Whether DealMatch must register for VAT, its filing dates, and whether any thresholds or exemptions apply: unknown.
- Whether the withholding rate for referral payments is correct, and whether referrers must be treated as individuals or businesses: unknown.
- Company income tax, PAYE and e-invoicing: not touched.
- Whether VAT applies to amounts held for others (escrow principal) at all: assume no, confirm.

## Questions for the accountant

1. Must DealMatch charge VAT now, and from what date?
2. Which of our fees are VAT-able (subscriptions, listing fees, escrow fee, job commission)?
3. Is VAT on the buyer half and seller half treated alike?
4. Correct withholding rate and remittance schedule for referral rewards.
5. What records and receipts must be issued to payers?
6. Treatment of gateway fees (VAT on those) as a cost.

## Before turning VAT on

Confirm rates with the accountant, run a staging payment with VAT on, then switch on in Admin > Tax. It applies to new payments only.
