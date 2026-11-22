# Commercial Operating Model

Status: **Proposed**, except where marked Implemented. Pricing changes need founder approval; nothing here is applied to production.

## How DealMatch earns

| Product | Who pays | What DealMatch keeps | Status |
|---|---|---|---|
| Provider subscription | Provider | Whole plan price | Implemented |
| Hostel listing fee | Landlord | Whole fee | Implemented |
| Unlock packs (contact unlocks) | Seeker | Whole price | Implemented |
| Hotel booking | Guest | Fee only (8% in settings); room money goes to the hotel | Implemented (10% hardcoded in escrow split, see audit H3) |
| Property rental/sale escrow | Buyer half, seller half | 3% total fee | Implemented; loses money after gateway cost (audit C2) |
| Jobs | Provider (held from payout) | Commission locked at bid acceptance | Default 3% seeded on staging only, **Awaiting founder approval** |
| Referral rewards | DealMatch | Cost, max 18% of fee | Implemented |

## Principles

1. Every rate lives in a setting the founder edits in Admin (fees, commission, VAT, referral, gateway). No rate is hardcoded in code or SQL.
2. A rate change applies to new transactions only. Existing deals keep their locked rate.
3. DealMatch's own fee carries VAT on top, shown to the payer. VAT is not income.
4. Referral and agent payouts come out of DealMatch's fee, never out of the deal price.
5. Revenue is counted only when earned (escrow fees are held until release).
6. Unknowns are shown as "Not recorded", never as zero.

## Decisions the founder must make

1. Escrow fee level and who bears gateway cost (see UNIT_ECONOMICS.md).
2. Job commission default (3% proposed as placeholder).
3. Agent and referrer shares of the escrow fee.
4. Whether to retire the old escrow referral line.
