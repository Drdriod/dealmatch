# Open items

As of 2026-10-22. Built from a read of the session transcript (which starts at the 18 Oct compaction, so
older requests come from the summaries and the excerpt files you uploaded) and checked against the repo.
Move a row to `design-patterns.md` or the runbook when it is done, and delete it here.

Kickoff of the Meta hackathon is **26 Oct**. The plan is `docs/hackathon/muse-spark-agent-plan.md`.
The UI, UX and database gaps against your wireframe specification are in `docs/FULL_STACK_BACKLOG.md`, with how to solve each and who to source it from.

## A. Only the owner can do these

| # | Item | Why it matters |
|---|---|---|
| A1 | **Apply migrations 18 and 19 for real.** You ran both on 22 Oct inside a transaction and they rolled back (production is unchanged, checked). PR #18 was merged on 21 Oct (merge commit `4e5c151`) and its Vercel deploy succeeded, so applying them is now safe. Open a new SQL-editor tab, paste the file exactly as it is in the repo (no `BEGIN;` before it and no `ROLLBACK;` after it, which are what made your runs roll back), and run it. 18 first, then 19. Then the checks in section 7 of the runbook | Until 18 is committed, anyone can read `contact_phone` and `contact_email` on `properties` through the API. Until 19 is committed, the verification flow cannot set `under_verification` |
| A2 | Rotate the Flutterwave sandbox secret and the database passwords. Turn on leaked-password protection | Runbook lines 29 and 32 still say "action needed" |
| A3 | Vercel settings: put `CRON_SECRET` in Preview, remove the Flutterwave keys from Preview | Preview deploys should not hold live payment keys |
| A4 | **Get real listings in.** Production has none, 17 profiles | The demo, the Impact score and the "live database" claim all depend on it. Do this after migration 18 is applied (A1) |
| A5 | Read the Official Rules when published (before 26 Oct) and paste them | They may restrict work started before the event |
| A6 | Smoke test production after migrations 18 and 19 are committed: home page counts, Browse, one property page, sign up, a sandbox payment. Steps in runbook section 7 | The runbook lists it. No result is recorded anywhere |
| A7 | Decide: Vercel plan (the function cap), WhatsApp number for the demo, solo or team | Needed before day 4 of the hackathon |
| A8 | Counsel questions in ADR-009 (retention, NDPA, impact assessment). Terms page: which fee wording is right | Open since the legal review |
| A9 | Turn on branch protection for `main` and mark the `check` job as required (GitHub: Settings, Branches, Add rule). The workflow in `.github/workflows/check.yml` runs on every pull request but cannot block a merge until you do | Without this, a red check is only a warning |

## B. I can do these

### High

| # | Item | Evidence |
|---|---|---|
| B2 | **Apply the unapplied-money rule to the other purposes.** Only transaction escrow got it. Property escrow (`escrowPayment`, no amount check), hostel fee, unlock credits and hotel booking can still log `success` for money that was not applied | `chargePurposes.js` |
| B3 | **Virtual-account payments are not retry-safe.** The account is marked paid before the handler runs, so a failed handler followed by a retry sends the whole transfer to the refund list instead of granting the item | design-patterns item 10 |
| B4 | End-to-end sandbox payment test. No local Supabase config, the Docker install failed earlier | Needs sandbox credentials from you |

### Medium

| # | Item | Evidence |
|---|---|---|
| B5 | Stale docs: ARCHITECTURE.md says migration 17 is pending and the baseline is 256 (it is `{}`); design-patterns item 9 says 3 violations (cleared); the runbook's migration table was out of order (fixed), and its advisor and action lines are stale; CHANGELOG and README have nothing since 9 Oct; ISSUES.md lists fixed items as open; ADR-009 still says "Proposed" | Files named |
| B6 | The parked taxonomy migration `20261011010000_place_people_taxonomy.sql` is still in `supabase/migrations/`, and the README says to run every file in order. It re-parents live listings and is superseded by file 9 | Move it out of the folder |
| B7 | Category pages are empty: nothing writes `properties.category_id` (the list form sets only the old `category`) | `ListPropertyPage.jsx`, `categoryFeed.js` |
| B8 | About 30 `select('*')` reads remain outside `properties` | `supabase.js:87`, `messagesRepository`, `jobPostingRepository`, `referralRepository`, `notificationsRepository`, catalog and forum services |
| B10 | Sentry `setUser` sends the user's email, which contradicts the scrubbing comment | `sentry.js:35` |
| B11 | Terms page section 3 reads as a second fee next to section 4's 1.5% per side. "Last updated" prints the current year | `TermsPage.jsx` |
| B12 | Deferred Supabase advisor items: 313 overlapping permissive policies (about 10 on `properties` alone), 10 `auth_rls_initplan`, about 58 callable SECURITY DEFINER functions, extensions in `public` | Runbook lines 29 and 30 |

### Low

| # | Item |
|---|---|
| B13 | Nothing writes `location_precision = 'precise'` for providers. Only the state-level trigger exists |
| B14 | Design brief for the "to create" pages. `ComingSoonPage` is still routed |
| B15 | Dead code: `ProfessionalsPage`, `PropertyCarousel` (unrouted), `formatPrice` in `HotelsPage` |

## C. Built, but not exercised, so not proven

- Publishing a listing with photos (`src/lib/listingWrite.js`). The code split is unit-tested; the live insert has not been run. Both forms were sending `images` inside the `properties` insert, which the database refuses, so this may never have worked.
- The screens that changed to named property columns (landlord dashboard, Verification page, agent dashboard, home counts, admin overview). Build and tests pass; none was opened in a browser, and migration 18 is not applied yet.
- Migration 19 has not had a dry run.
- Staging replay of files 9 to 17 and the `is_superadmin` policy check. Not recorded as done.
- `transactions.listing_id` is UUID on production. No result in the applied log.
- RATE-3 ("verify in staging before closing"): no record.
- Find a Provider, Level 1 cap, demotion cron, student-ID purge, admin NIN status, the escrow section: code is in, runtime not exercised.
- Admin write paths (fee registry, refunds) have not been run with a real admin account.
- Migration 17's illegal-move error was not re-run on production (no row to test with). The dry run passed 13 of 13.

## D. Hackathon (from 26 Oct)

Everything in the plan's schedule. Nothing in `src/modules/assistant/` exists yet, on purpose. See the plan, section 9.
