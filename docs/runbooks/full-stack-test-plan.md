# Full-stack test plan

Goal: prove every area of DealMatch works end to end before launch: both doors (Places and People), DealMatch Protection, verification, money, disputes, staff tools, security and mobile. Companion docs: `docs/SITEMAP.md` (what exists), `docs/runbooks/smoke-test.md` (short post-deploy check).

## People needed: 12 seats

10 testers, 1 staff helper, and you (superadmin). Fewer seats leaves areas untested; more only adds duplicate reports.

| Seat | Role to create | Side | Door | Main areas covered |
|---|---|---|---|---|
| T1 | Renter (role `renter`/`buyer`) | Demand | Places | Search, filters, listing detail, save, request, Protected payment, confirm move-in, review |
| T2 | Short-let or hotel guest | Demand | Places | `/hotels`, dates, availability, booking, cancellation and refund |
| T3 | Student | Demand | Places | `/student-hostels`, `/student-verify`, hostel enquiry, listing fee |
| T4 | Landlord or seller (role `landlord`) | Supply | Places | Sign up, verification, `/list`, `/list-rental`, photos, `/manage-listings`, `/availability`, `/landlord`, payout setup |
| T5 | Agent (role `agent`, set by you) | Supply | Places | `/agent` dashboard, assigned listings, agent flow |
| T6 | Service customer | Demand | People | `/providers`, `/request`, quotes and bids, counter-offer, accept, Protected payment |
| T7 | Professional (artisan or tutor) | Supply | People | `/apply-professional`, `/verify-skill`, `/provider` workspace, quotes, completion, earnings, withdrawal |
| T8 | Hostile tester (a developer friend) | Both | Both | Security and abuse (section C) |
| T9 | Low-end Android on mobile data | Both | Both | Speed, layout, forms, photo upload, keyboard, offline behaviour |
| T10 | Rewards and WhatsApp user | Demand | Both | Referral code, loyalty points, unlock credits, `/wa/link`, WhatsApp requests, `/forum`, `/messages`, `/matches` |
| S1 | Staff helper (role `verifier`, plus a staff invite) | Staff | Both | Staff invite, verifier queues, lender role |
| You | Superadmin | Staff | Both | Every admin tab, disputes decisions, refunds, payouts, fees |

## Supply first, then demand

A marketplace test only works if there is something to find. Run in three phases:

1. **Supply (first, about 1 hour):** T4 (landlord, with a hostel or short-let listing too), T7 (professional) and T5 (agent) create their listings, services and verification submissions, then **S1 and you** approve them (identity, skill, payout accounts, listings). Do not start phase 2 until at least 3 listings and 3 provider profiles are live.
2. **Demand (next, about 2 hours):** T1, T2, T3, T6 and T10 search, book, request and pay against that supply. T6 posts requests that T7 answers.
3. **Stress and review (last):** T8 and T9 attack and use the same data; then dispute decisions, refunds and payouts from the admin side.

Supply testers stay online during phase 2 to respond to requests and bookings.

Pairs that must run live together: T1 with T4 (rental payment and dispute), T6 with T7 (service quote and payment).
Recruit real people for T4, T5 and T7: a real landlord, a real agent and a real artisan find problems friends will not.

## Where to run it (decision needed)

Production data cannot be cleaned up by deleting a test user: in the current schema many tables block the delete (transactions, bids, contracts, professionals, reviews, wallet ledger) and others keep orphan rows (escrow, payments, bookings, messages, disputes, student hostels). Test listings would also be visible to real visitors. Preferred: run the whole test on a **separate test database and Preview URL**, then throw it away. Fallback: production with `[TEST]`-prefixed listings and a purpose-built cleanup script, which must be written and dry-run first.

## A. Setup before inviting anyone

1. Sandbox payments work on the Preview deployment: Vercel Preview has `FLUTTERWAVE_V4_CLIENT_ID`, `FLUTTERWAVE_V4_CLIENT_SECRET`, `FLUTTERWAVE_BASE_URL` (sandbox), `FLUTTERWAVE_SECRET_HASH`, `CRON_SECRET`; the sandbox webhook points at `<preview url>/api/payments/webhook`. Testers use sandbox test details only, never real cards or real money.
2. All migrations through 27 are applied (`docs/runbooks/production-migration.md`).
3. Demo content exists and is labelled as demo: at least 5 Places listings (2 rentals, 1 hotel or short-let, 1 hostel, 1 sale), 4 provider profiles, 2 categories each with a listing.
4. You set roles in Supabase for T5 (`agent`), S1 (`verifier`), and one lender account (`lender`, see `docs/LENDER_ROLE.md`). Everyone else signs up normally.
5. Create a shared report sheet (section E) and one 2-hour window when all seats are online.
6. Use a Preview or staging data set with demo accounts, never real customers or real money.

## B. Scripts per seat

Each step ends with what you should see. Report anything else, with a screenshot.

### T1 Renter (Places)
1. `/auth?tab=signup`: sign up with email, use the password popup, enter the 6-digit code. Expect: lands on `/onboarding`.
2. `/onboarding`: pick intent, finish profile. Expect: lands on a dashboard with a clear next step.
3. `/places`: search a location, apply price and bedroom filters, sort. Expect: results match filters; empty state suggests widening.
4. Open a listing (`/property/:id`). Expect: photos, price, trust label, cancellation and Protection explanation; no phone or email shown.
5. Save it, then message the landlord (`/messages`). Expect: saved item appears in the dashboard; message sends.
6. Start the protected payment. Expect: virtual bank account details; amount matches the listing.
7. Pay with sandbox details, then press "I have already paid" if the screen waits. Expect: status moves to funded within a minute or two, never stuck; no duplicate charge if you press twice.
8. `/transactions/:ref`. Expect: timeline, amount, parties, next action.
9. Confirm move-in. Expect: status moves toward release; contact details unlock only now (or per the published rule).
10. Leave a review. Expect: only possible after completion.

### T2 Short-let or hotel guest (Places)
1. `/hotels`: search dates and guests. Expect: only available rooms show.
2. Open a room, pick dates already booked. Expect: refused with a clear message.
3. Book and pay in the sandbox. Expect: booking and transaction both appear.
4. Cancel inside the rules. Expect: terms shown first; refund status shows pending, then refunded, as separate states.

### T3 Student (Places)
1. `/student-hostels`: filter by institution. Expect: hostel cards with price and trust labels.
2. `/student-verify`: submit student ID. Expect: status "pending", not "verified".
3. Send a hostel enquiry. Expect: confirmation; it appears for the hostel owner and in admin Student hostels.

### T4 Landlord or seller (Places)
1. Sign up as landlord; `/verify-identity` and `/verify`: submit documents. Expect: status goes unverified, submitted; never "Verified" before approval.
2. `/payout-setup`: add a bank account. Expect: pending until staff verify it.
3. `/list-rental` or `/list`: create a listing with 4 photos, price, location. Expect: preview, then moderation state; photos upload and show.
4. `/manage-listings`: edit price, pause, unpause. Expect: changes visible on the public page.
5. `/availability`: block dates. Expect: blocked dates cannot be booked by T2.
6. `/landlord`: view requests and payments from T1. Expect: funded amount shown separately from available payout.
7. `/list-hostel` (if hostel owner): submit and pay the listing fee. Expect: listing appears after fee and moderation.

### T5 Agent
1. Sign in; open `/agent`. Expect: only assigned work shows; no other agents' data.
2. Work an assigned listing through the agent flow. Expect: each action is logged (admin Agent scores).

### T6 Service customer (People)
1. `/providers`: search by service and area. Expect: cards show only true trust labels; no invented ratings.
2. `/provider/:id`: read profile, request a quote.
3. `/request`: post a job with budget, location, date. Expect: appears in `/jobs/:id`.
4. Receive quotes or bids. Expect: counter-offer works; accept locks the agreed amount and terms.
5. Pay through Protection. Expect: as T1 steps 6 to 8.
6. Confirm completion or report a problem (section dispute below).

### T7 Professional (People)
1. `/apply-professional`: submit an application. Expect: saved; shows pending; appears in admin Professionals.
2. `/verify-skill`: submit evidence. Expect: pending until staff approve.
3. `/provider` workspace: see T6's request, send a quote, accept the job. Expect: states are explicit.
4. Mark work complete. Expect: awaits T6's confirmation; funds are not "available" yet.
5. After release: `/wallet`, request a withdrawal. Expect: earnings and available balance separate; withdrawal needs a verified payout account.

### Dispute (T1 with T4, or T6 with T7)
1. On a funded transaction choose "Report a problem" (`/disputes/new`). Expect: reason list, narrative, evidence upload (image or PDF), dates.
2. Upload a valid file, then a wrong type and an oversized file. Expect: wrong type and oversize refused with a clear message.
3. Counterparty opens `/disputes/:id` and adds a note. Expect: sees the case, not the other party's private evidence.
4. You (admin Disputes tab) record a decision with a reason. Expect: both parties see "decision recorded"; note: money is moved by hand until the policy decision is made (open item).

### T10 Rewards and WhatsApp
1. Sign up using T1's referral code (`/referrals`). Expect: code saved on the new account; T1 sees a referred user.
2. `/wallet`: view loyalty points, redeem some; spend an unlock credit on a contact. Expect: balance and ledger agree; cannot go negative.
3. `/wa/link`: link a WhatsApp number, send a request by WhatsApp. Expect: reply arrives; the request appears in the app.
4. `/forum`: create a thread, reply, report a post. Expect: appears; report reaches admin Complaints.
5. `/matches`: swipe a few listings. Expect: matches saved.
6. Submit a story on the home page. Expect: "Thank you"; second attempt: "You already have a testimonial".

### S1 Staff helper
1. Accept a staff invite at `/staff/accept-invite` (you create it in admin Staff). Expect: role set; wrong or reused link refused.
2. As `verifier`, open `/admin`. Expect: only permitted tabs; cannot open Platform fees, Staff or Settings if not allowed.
3. Approve T4's identity and T7's skill verification; approve a payout account. Expect: each leaves an audit entry.
4. Lender account: open `/lender`. Expect: sees mortgage applications only; `/mortgage` public page is a coming-soon page.

### You: superadmin (`/staff-gate-7f3k`)
Walk every tab and record a pass or fail: Overview, Analytics, Users, Properties (approve and reject a listing), Professionals, Skill verification, Identity, Student verifications, Student hostels, Transactions, Disputes, Payouts, Platform fees (change a fee, confirm the new fee applies to a new transaction only), Monetisation, Pipeline, Mortgage, Complaints, Enquiries, Testimonials (approve T10's story and see it on Home), Announcements, Agent scores, Staff, Settings. Check the audit log records every sensitive action with actor, time, old and new value.

## C. Hostile tester (T8)

Try each; every one must fail safely and show a friendly message, never a stack trace or another person's data.
1. Open another user's `/transactions/:ref`, `/disputes/:id` and `/jobs/:id` by guessing or copying a link. Expect: denied.
2. Visit `/admin`, `/agent`, `/lender` and `/provider` as a normal user. Expect: redirected or denied.
3. Browser console: request `contact_phone` and `contact_email` on properties (see `smoke-test.md` section 1). Expect: permission denied.
4. Paste `<script>` and very long text into every text field (story, request, message, listing). Expect: stored as text, not run; length capped.
5. Double-click Pay, go Back mid-payment, refresh on the processing screen, pay twice. Expect: one charge, one transaction.
6. Change the price or amount in the browser before paying. Expect: server uses its own amount.
7. Ask for a seller's number before paying. Expect: not given.
8. Sign up 5 times quickly with the same phone or device. Expect: conflicts caught or rate-limited.
9. Upload an `.exe` renamed to `.jpg`. Expect: refused.
10. Try to submit a testimonial with status `approved`. Expect: refused.

## D. Mobile and low-end test (T9)

On a cheap Android over mobile data: Home loads in under 5 seconds on first visit; filters open as a drawer; keyboards do not hide the pay button; photo upload from the camera works; switching apps during payment and returning does not lose the payment; text is readable; no horizontal scroll.

## E. How testers report

One row per problem: seat, page URL, what you tried, what happened, what you expected, screenshot, device and browser, time. Severity: **S1** money wrong or data exposed (stop and tell the owner at once), **S2** a flow cannot finish, **S3** wrong text or layout. Testers say "pass" for each numbered step they completed with the expected result.

## F. Exit criteria (ready for a soft launch)

- All steps in sections B and D pass, or have an accepted S3 note.
- Every hostile test in section C fails safely.
- No S1 or S2 open.
- Every Protection payment test ends in the right state, and amounts reconcile between the transaction, the payment and the wallet.
- The audit log matches the actions taken.
- Run `docs/runbooks/smoke-test.md` once more after the last fix.
