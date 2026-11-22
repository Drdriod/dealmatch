# Commercial Audit Report

Date: 2026-11-22. Scope: how DealMatch earns, charges, splits and pays out money, read from the code on branch `feat/tax-and-referral` and from the staging database (`vogjbkgmqanjeaxnpzqs`). Production (`dijggrafwdznescbuypi`) was only counted, not changed.

Status words used: **Implemented**, **Tested**, **Partially implemented**, **Proposed**, **Awaiting founder approval**, **Requires external verification**.

## 1. Headline

Production has never taken a payment through escrow or jobs (0 escrows, 0 wallet ledger rows, 0 contracts, 0 commissions). So none of the problems below has cost real money yet. Every one of them should be settled before the first real escrow or job payment.

## 2. Where money moves (map)

| Stage | Where | Who earns what |
|---|---|---|
| Subscriptions, hostel listing, unlock packs | `paymentPurposes.js`, `platform_fees` | Whole amount is DealMatch income (VAT added on top) |
| Hotel booking | `paymentPurposes.js` | Fee only is income; room money goes to the hotel |
| Property rental/sale escrow | `start_property_escrow_payment`, `fn_calculate_revenue_split` | 3% total fee, split between buyer and seller halves |
| Jobs | `accept_bid`, `release_held_payment` | Commission locked at bid acceptance, held from provider payout |
| Referral rewards | `record_referral_rewards` (new engine) | Paid from DealMatch commission, max 18% of fee |

## 3. Findings

### CRITICAL

**C1. 72-hour auto-release will fail every time.** `fn_auto_release_expired_escrows` sets the escrow to `released`. That update fires the trigger `trg_post_release_split`, which already runs `fn_calculate_revenue_split` and sets `payout_locked = true`. The function then calls `fn_calculate_revenue_split` a second time, which raises "Payout already processed". The whole run rolls back, so no expired rental is ever auto-released. Found by reading the code; **not yet run** (no test escrow built). Fix: remove the explicit second call. Failure case: a tenant never confirms move-in, 72 hours pass, funds stay stuck.

**C2. Rental/sale escrow loses money at every deal size if the platform only keeps its 65% / 60% share.** See the table in section 4. The fee is split 65% platform / 25% agent / 10% referrer for rentals (60/30/10 for sales), and the gateway charges about 2% of everything collected. On a 3% total fee the platform share (1.95%) is below the gateway cost (about 2%). **Awaiting founder approval** on the fix: raise the fee, give the agent and referrer shares from a smaller slice, or have the payer cover the gateway cost.

### HIGH

**H1. Unpaid shares are left behind.** If an escrow has no agent, the 25% agent share is not paid to anyone and not given to the platform. Same for the referrer's 10% when the seller was not referred. The money stays in the escrow float, so it is neither revenue nor paid out. Fix: give the unused share to the platform (or refund it) explicitly.

**H2. Two referral systems can both pay.** The old split in `fn_calculate_revenue_split` pays 10% of the fee to the seller's `referred_by`. The new engine (`record_referral_rewards`) also pays referral rewards on escrow. A single escrow could pay referrers twice, past the 18% cap. Fix: retire the old referral line in the split (**Proposed**; needs approval because it changes who gets paid).

**H3. Hotel path hardcodes 10% platform and 2% referral**, while `platform_fees` says hotels are 8%. Two different numbers for the same service. Hotel bookings that go through the checkout code use 8%; any that go through the escrow split use 10%.

**H4. `trigger_initialize_escrow` hardcodes a 2.5% fee** when a contract is executed, and does not set `transaction_type` or `gross_amount`. That row would not match the split function. No contracts exist in production, so this path may be dead; **needs confirming** before launch, then either remove or make it read `platform_fees`.

### MEDIUM

**M1. Jobs earned ₦0 in production** because the `commissions` table was empty and `accept_bid` deliberately leaves the rate empty when none is configured. A 3% default row now exists in a migration (`20261120020000`). **Awaiting founder approval** before it goes to production; it affects new bids only.

**M2. Legacy rates in `chargePipeline.js` `TYPE_MAP`** (1.5%, 3%, 5%, 3%) differ from `platform_fees` (3% sale/rental, 8% hotel). They are not the source of truth for what is charged, but they drive some display and event values. Fix: read from `platform_fees`.

**M3. Seller-half VAT on escrow is not handled.** The buyer half carries VAT at checkout. The seller half is deducted at release, and no VAT is recorded on it. **Requires external verification** with an accountant, then a code change.

**M4. Escrow agent/referral columns are written by the split function but unused by the app.** Harmless, but confusing once the new referral engine is live.

### LOW

**L1.** Gateway cost rates are estimates from Flutterwave's public page (undated) and are not confirmed against DealMatch's own agreement. **Requires external verification.**

## 4. Unit economics: rental/sale escrow (3% total fee)

Assumptions (all editable in Admin > Finance): gateway 2% on money collected, no cap; payout fee ₦10 up to ₦5,000, ₦25 up to ₦50,000, ₦50 above, plus 7.5% VAT on that fee. Payer pays deal plus half the fee. These are estimates, not measured costs.

| Deal (₦) | Fee 3% | Collected | Gateway in (2%) | Payout out | Net after gateway | Net % of deal | Platform share if agent+referrer exist (65%) |
|---|---|---|---|---|---|---|---|
| 10,000 | 300 | 10,150 | 203 | 26.9 | 70 | 0.70% | -35 |
| 20,000 | 600 | 20,300 | 406 | 26.9 | 167 | 0.84% | -43 |
| 50,000 | 1,500 | 50,750 | 1,015 | 26.9 | 458 | 0.92% | -67 |
| 100,000 | 3,000 | 101,500 | 2,030 | 53.8 | 916 | 0.92% | -134 |
| 250,000 | 7,500 | 253,750 | 5,075 | 53.8 | 2,371 | 0.95% | -254 |
| 500,000 | 15,000 | 507,500 | 10,150 | 53.8 | 4,796 | 0.96% | -454 |
| 1,000,000 | 30,000 | 1,015,000 | 20,300 | 53.8 | 9,646 | 0.96% | -854 |
| 5,000,000 | 150,000 | 5,075,000 | 101,500 | 53.8 | 48,446 | 0.97% | -4,054 |

Reading it: even with the platform keeping the whole fee, the margin is under 1% of the deal. With agent and referrer shares paid, it is negative. Escrow on large deals is not profitable at a 3% fee unless the gateway charges less than the 2% assumed (large transfers may be negotiable) or the fee rises. Aggressive/balanced/profit-optimised pricing scenarios are **Proposed** for the strategy report and need your choice.

## 5. What works (checked)

- VAT added on DealMatch fees only, recorded in `tax_ledger` (Tested, staging; real payment with VAT on not yet tested).
- Tax readers separated from ordinary admins (Tested, staging).
- Referral engine with cap, hold, review queue, WHT at release (Tested, staging).
- Finance summary shows "Not recorded" rather than a false zero (Tested).
- `accept_bid` locks the commission rate at acceptance and refuses providers with no verified payout account.
- Escrow money columns are guarded against client edits (`fn_guard_escrow_money`).

## 6. Not yet done

Operating model, pricing architecture, unit economics for the other products, Nigerian tax readiness note, financial controls document, and the market strategy report. Refund and dispute payout paths (`mark_payment_refunded`, `decide_dispute`) have been listed but not yet read line by line.

## 7. Needs you

1. Decide the escrow fee and who pays the gateway cost (C2).
2. Approve retiring the old referral line in the escrow split (H2) and the 3% job commission default (M1).
3. Accountant to confirm VAT/WHT rates, small-company status and seller-half VAT (M3).
4. Confirm actual Flutterwave rates from your agreement (L1).
