# Open items

As of 2026-10-25. The live checklist with owners and ticks is the Notion page "DealMatch master checklist". This file is the in-repo copy of what is still open. Move a row to `design-patterns.md` or the runbook when it is done, and delete it here.

Kickoff of the Meta hackathon is **26 Oct**. Submissions are due 4 Nov, 9:00 PM ET (5 Nov 03:00 Lagos); internal target 4 Nov 18:00 Lagos. The plan is `docs/hackathon/muse-spark-agent-plan.md`. UI, UX and database gaps against the wireframe specification are in `docs/FULL_STACK_BACKLOG.md`.

## A. Only the owner can do these

| # | Item | Why it matters |
|---|---|---|
| A1 | Create the branch ruleset `Protect main` (require a pull request, require the `check` status check, block force pushes and deletion) | `check` exists on main now, so this can be switched on |
| A2 | Add GitHub secrets `CRON_SECRET` and `SITE_URL`, then run the "Reconcile payments" workflow once by hand | Until both exist the 10 minute payment reconcile job skips itself |
| A3 | Paste the migrations for the open pull requests (23 to 26 in the runbook) after merging each | Each says "paste as is" |
| A4 | Rotate the Flutterwave sandbox secret and the database passwords. Turn on leaked-password protection (Supabase, Auth, Passwords) | |
| A5 | Vercel: put `CRON_SECRET` in Preview and remove the Flutterwave keys from Preview | Preview deploys should not hold payment keys |
| A6 | Find out why the "Supabase Preview" check fails on main, or turn that integration off | It is red on every commit |
| A7 | Real listings. Production has none, 17 profiles | The demo and the "live database" claim depend on it |
| A8 | Paste the Official Rules of the hackathon | They may restrict work started before the event |
| A9 | Smoke test (`docs/runbooks/smoke-test.md`), including the new trust pages and the dispute flow | Never run in a browser against production yet |
| A10 | Decisions: home-page milestone numbers, Vercel plan, WhatsApp number for the demo, solo or team, money after a dispute decision, counsel questions in ADR-009, Terms fee wording (sections 3 and 4), Apple and Meta sign-in | |
| A11 | Flutterwave sandbox credentials, so the end-to-end payment test can run | |

## B. Claude or Dev 2 can do these

| # | Item | Notes |
|---|---|---|
| B4 | End-to-end sandbox payment test, including the reconcile job and the "I have already paid" button | Needs A11 |
| B8 | About 20 browser-side `select('*')` reads outside `properties` (messages, notifications, referral, lender, availability, professionals, and others) | Replace with named columns, one repository at a time. Server-side reads in the webhook and payout code are fine |
| B12 | Deferred advisor items | `universal_search` has no fixed search_path; slow-query hints (RLS re-evaluated per row on about 7 older tables, overlapping policies on 3 tables) matter only at scale. Reasons for everything left alone are in the Notion checklist, section 5 |
| B13 | Nothing writes `location_precision = 'precise'` for providers | Only the state-level trigger exists |
| B14 | Design brief for the "to create" pages. `ComingSoonPage` is still routed | |
| B15 | Dead code: `ProfessionalsPage`, `PropertyCarousel` (unrouted), `formatPrice` in `HotelsPage` | |
| B16 | The anonymous INSERT policy on `professional_applications` ("Self or anonymous applications") lets anyone insert ownerless rows; the app never does | Decide whether to close it |
| B17 | Referral payout has no unique key, so it runs only for the first run that records a payment; a database constraint is still open | `design-patterns.md` item 10 |

## C. Built, but not exercised, so not proven

- The dispute screens, transaction detail page and evidence upload against the real database (migration 20 is applied; the 42 behaviour checks ran as a rolled-back test, the screens were not opened in a browser).
- The reconcile job and `verify-payment` against the real Flutterwave sandbox.
- Publishing a listing with photos (`src/lib/listingWrite.js`). The code split is unit-tested; the live insert has not been run.
- Screens that changed to named property columns (landlord dashboard, Verification page, agent dashboard, home counts, admin overview).
- Staging replay of files 9 to 17. Staging is not schema-identical to production; use production rolled-back dry runs.
- Find a Provider, Level 1 cap, demotion cron, student-ID purge, admin NIN status, the escrow section: code is in, runtime not exercised.
- Admin write paths (fee registry, refunds) with a real admin account.

## D. Hackathon (from 26 Oct)

Everything in the plan's schedule. Nothing in `src/modules/assistant/` exists yet, on purpose: it waits for the Official Rules (A8).
