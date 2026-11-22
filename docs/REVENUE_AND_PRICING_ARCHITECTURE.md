# Revenue and Pricing Architecture

## Where each number lives today

| Number | Source of truth | Edited in |
|---|---|---|
| Flat fees, escrow fee, hotel fee | `platform_fees` via `get_platform_fee` | Admin > Fees |
| Job commission | `commissions` via `get_active_commission` | Admin > Commissions |
| VAT 7.5%, WHT 10% (both off) | `tax_settings` via `get_tax_rate` | Admin > Tax (owner only) |
| Referral levels, tiers, caps | `referral_settings` via `ref_setting` | Admin > Referral Settings |
| Gateway cost estimates | `gateway_fee_settings` | Admin > Finance (owner only) |

## Known places that bypass this (to remove)

- `chargePipeline.js` `TYPE_MAP` legacy rates (audit M2).
- `trigger_initialize_escrow` fixed 2.5% (audit H4).
- Hotel 10% / 2% inside `fn_calculate_revenue_split` (audit H3).
- Fixed 65/25/10 and 60/30/10 escrow fee splits (audit C2, H1, H2).

## Target design (Proposed)

One pricing function per product that returns: price, DealMatch fee, VAT, gateway cost estimate, referral cost, agent cost, net. Checkout, the payment window, the ledger and the Finance tab all call it, so they cannot disagree. Rates are locked on the transaction at creation. Tests assert that the amount quoted equals the amount collected equals the amount split.

## Order of work

1. Fix auto-release double call (audit C1) and test it.
2. Make escrow splits read settings; give unused agent/referrer shares to DealMatch.
3. Remove hardcoded hotel and trigger rates.
4. Add the single pricing function and tests.
Steps 2 to 4 change money rules, so they wait for founder approval of the numbers.
