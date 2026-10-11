# Find a Provider: Issues for Architecture and Engineering Review

Status: draft for review. As of 2026-10-11, `main` at `048f402`.
Scope: the ADR-008 vs product spec conflict on provider visibility, the proposed hybrid resolution, and the related code, data and security issues found while checking them against the repo.

Each issue has an ID, severity, the evidence in the repo, and a proposed direction. Severity: **High** blocks launch or risks money, safety or privacy. **Medium** causes wrong behaviour or rework. **Low** is cleanup or documentation.

---

## 1. Summary

1. **The conflict is real and already in the code.** `FindProviderPage.jsx` queries `verified_providers` with `.gte('level', 2)`, so Level 1 (identity verified) providers are hidden. The spec wants them shown.
2. **The hybrid proposal needs work before it is buildable.** Three of its parts have no code path today: the job value cap, the 100% escrow lock before dispatch, and the automatic promotion after 3 jobs at 4.5+.
3. **Some docs contradict the code.** The README says the "Within 5km" filter exists, but it is approximated by city name because `profiles` has no coordinates. The spec's filters (location, rating, price range, verification tier) do not match the filters built (available now, highest rated, within 5 km).
4. **One proposed design is unsafe.** Hashing NIN or BVN with unsalted SHA-256 can be reversed by brute force, because a NIN has 11 digits. See SEC-1.

---

## 2. The Policy Conflict

| | ADR-008 (as built) | Product spec |
|---|---|---|
| Level 1 (identity verified) in search | Hidden | Shown |
| Level 2+ in search | Shown | Shown |
| Goal | Brand trust. No artisan is discoverable before portfolio vetting. | Supply liquidity. Verified artisans earn while the portfolio queue runs. |
| Code | `.gte('level', 2)` in `FindProviderPage.jsx` (line 61) | Not implemented |

**Decision needed (owner: product, with the founder).** Which of these is the rule for launch?

- **Option A, hybrid (proposed):** show Level 1 with a lower rank and capped jobs. Needs the work in section 3.
- **Option B, keep ADR-008:** hide Level 1 until Level 2 is approved. Simplest. Cold-start risk stays.
- **Option C, separate lanes:** a "Verified, not yet portfolio-reviewed" section, shown only to clients who opt in. Keeps trust signals clear, no ranking games.

We recommend choosing A or C, and writing the decision into a new ADR that supersedes the relevant part of ADR-008. The ADR text lives in `README.md` and `CHANGELOG.md` and should be moved into `docs/adr/`.

---

## 3. Review of the Hybrid Proposal

| Part | Assessment | Gap |
|---|---|---|
| Show Level 1, rank below Level 2+ in Stage 2 scoring | Sound | The scoring function does not exist yet (see MATCH-1). Ranking alone does not stop a Level 1 provider appearing for a client who filters by "verified only". |
| Verification badges (`NIN Verified`, `Portfolio Verified`, `Licensed Expert`) | Good idea | Names differ from the built labels (`Identity Verified`, `Skill Verified`, `Trusted`). Pick one set and use it in the UI, the ADR and the database. |
| Job value cap for Level 1 at 50,000 NGN | Needs server enforcement | No cap exists. Job creation must check the level of the provider and the amount on the server. Clients can split one job into several small ones to get around the cap (see ABUSE-2). |
| 100% escrow lock before dispatch | Good, but check first | The webhook flow in `api/flutterwave-webhook.js` locks funds on `charge.completed`. Confirm that dispatch cannot happen before the lock row is `LOCKED`. |
| Auto-promote after 3 jobs with 4.5+ rating | Not built, and statistically weak | No promotion job exists. The promotion path today is a staff-reviewed queue (`submit_verification` and `review_verification_submission` RPCs). A 4.5 average over 3 jobs is noisy. See ABUSE-1. |

---

## 4. Issues

### Matching and search

| ID | Sev | Issue | Evidence | Proposed direction |
|---|---|---|---|---|
| MATCH-1 | High | Stage 2 scoring function does not exist. The ranking in the hybrid proposal has nothing to plug into. | `FindProviderPage.jsx` sorts by level, then rating (line 111). | Write one ranking function in `src/modules/matching` with unit tests. Input: level, rating (Bayesian average), distance, price fit. |
| MATCH-2 | High | "Within 5km" is approximated by city match. Providers have no coordinates. | `README.md` line 129: `profiles` has no lat/lng column. | Add `location` (PostGIS geography point) to the provider record. Index it. Use a radius query. |
| MATCH-3 | Medium | Filters built do not match the spec. Built: available now, highest rated, within 5 km. Spec: location, rating, price range, verification tier. | `FindProviderPage.jsx` filter chips; spec text in the product brief. | Agree the filter list with product. Add the missing two (price range, verification tier) as server-side filters, not client filters. |
| MATCH-4 | Medium | Filtering is done after fetching. The page fetches all Level 2+ rows and filters in the browser. | `FindProviderPage.jsx` lines 59 to 111. | Move filtering and sorting to a SQL RPC with `LIMIT` and `OFFSET`. Paging matters once the provider count grows. |
| MATCH-5 | Low | Pinecone is used for real estate only. Provider matching has no vector step. | `src/modules/matching`, `api/match.js`. | Not a blocker. Decide whether free-text skill matching is needed for artisans. |

### Verification and data

| ID | Sev | Issue | Evidence | Proposed direction |
|---|---|---|---|---|
| VER-1 | High | Level 1 (identity) write path is not confirmed. README says a staff-reviewed queue writes Level 2 through an RPC. The Level 1 write path is not clear from the repo. | `README.md` line 128; `SkillVerificationPage.jsx` calls `submit_verification(level=2)`. | Confirm which RPC or webhook sets Level 1 after NIN/BVN check. Add a test for it. |
| VER-2 | High | Level names differ across code, README and the proposal. | `LEVEL_LABEL` in `FindProviderPage.jsx`: Identity Verified, Skill Verified, Trusted. Proposal: NIN Verified, Portfolio Verified, Licensed Expert. | One enum in the database, one label map in `src/modules/catalog`. Update the ADR. |
| VER-3 | Medium | Demotion is possible (`demote_verification_level` RPC) but there is no rule for when to demote. | `README.md` line 128. | Define demotion triggers: dispute upheld, rating below threshold, document expiry. |
| VER-4 | Medium | Verification expiry is not modelled. NIN/BVN checks and licences go stale. | No expiry column found in the verification tables. | Add `expires_at` and a daily job that moves expired providers down a level. |

### Rating and promotion

| ID | Sev | Issue | Evidence | Proposed direction |
|---|---|---|---|---|
| RATE-1 | High | No rating aggregate is defined. "4.5+" could be a plain mean, a Bayesian average, or a value stored on the profile. | `provider_stats` joined in `FindProviderPage.jsx`; no formula in the repo. | Use a Bayesian average: `(C × m + Σratings) / (C + n)`, with prior mean `m` and weight `C` agreed by product. Store it, do not compute it in the browser. |
| RATE-2 | High | No promotion job exists. The hybrid's "3 jobs, 4.5+" rule has no implementation. | No promotion code found. | If adopted, make it a cron job in `api/platform.js` (`cron-promote-providers`) plus an admin override. Log each promotion. |
| RATE-3 | Medium | Ratings can be farmed. A client and provider can create fake jobs and rate each other. | No job-linkage check found in `reviews`. | Require a completed, escrow-released job per review. Block reviews between accounts with shared phone or bank details. |

### Escrow and job rules

| ID | Sev | Issue | Evidence | Proposed direction |
|---|---|---|---|---|
| ESC-1 | High | Job value cap for Level 1 has no enforcement point. | No cap in `api/` or `src/` for provider level. | Check level and amount in the job creation server function, not the browser. Return a clear error. |
| ESC-2 | High | Dispatch before escrow lock is not proven impossible. | Lock happens on webhook `charge.completed`. The dispatch path is not traced in this review. | Trace the dispatch path. Make dispatch require `escrow_transactions.status = 'LOCKED'` in the same database transaction. |
| ESC-3 | Medium | Job state machine is not one module. Transitions are spread across pages and functions. | `bookings`, `deal_agreements`, `contracts` each carry status. | One state machine module with allowed transitions and tests (see `docs/ARCHITECTURE.md` section 6). |
| ESC-4 | Medium | `FULL_CHAIN_THRESHOLD = 50000` already exists for referral commission. A second 50,000 threshold for provider caps invites confusion. | `src/lib/referral.js` line 34; `api/flutterwave-webhook.js` line 27. | Name the provider cap separately, for example `LEVEL1_JOB_CAP_KOBO`, and keep it in one config file. |

### Security and privacy

| ID | Sev | Issue | Evidence | Proposed direction |
|---|---|---|---|---|
| SEC-1 | High | Unsalted SHA-256 of NIN or BVN can be reversed. A NIN has 11 digits, so there are about 10^11 values. | The architecture pack stores `nin_bvn_hash` as SHA-256. | Do not hash NIN or BVN with unsalted SHA-256. Store the verification result and provider reference from the verification vendor. If a hash is needed for de-duplication, use HMAC with a server-side secret (keyed, not reversible without the key). Get legal review under the NDPC rules. |
| SEC-2 | High | Rate limiter fails open when Upstash is not configured. | `src/lib/redis.js`: returns `allowed: true` when no URL or token. | Fail closed for auth, payment and verification endpoints. Keep fail-open for read-only public routes only. |
| SEC-3 | High | Hostel listing fee is unlocked by the browser. | `src/pages/StudentHostels/ListHostelPage.jsx` writes `status: success` itself. | Move to the webhook. Remove the browser write. |
| SEC-4 | Medium | Flutterwave sandbox client secret was shared during setup. | Session notes. | Rotate it. Check that no secret is in logs, screenshots or the repo. |
| SEC-5 | Medium | Verification documents and IDs are personal data. Retention and access are not documented. | No retention rule found in `docs/`. | Write a retention schedule (for example, delete after verification plus 90 days). Restrict storage access to staff roles. Record in the NDPC register. |
| SEC-6 | Medium | Contact details are masked until escrow confirms, but the masking rule is not tested. | `contact_unlocks`, `unlock_credit_ledger` tables. | Add tests that a provider's phone never appears in a list response before unlock. |

### Abuse and marketplace integrity

| ID | Sev | Issue | Evidence | Proposed direction |
|---|---|---|---|---|
| ABUSE-1 | High | New Level 1 providers can get jobs before they have any rating. Cold-start is also a fraud risk. | Hybrid proposal. | Use the Bayesian average (RATE-1) so new providers start at the prior, not at 5 stars. |
| ABUSE-2 | High | Job splitting defeats the 50,000 NGN cap. | Hybrid proposal. | Cap the total per client per provider per 30 days, not per job. Flag repeat small jobs for review. |
| ABUSE-3 | Medium | Level 1 providers may pay to rank higher if any paid boost is added later. | Not built. | Keep ranking rules free of payment. Record this as a product principle in the ADR. |
| ABUSE-4 | Medium | Disputes against Level 1 providers need a faster route, but the dispute table has no provider level link. | `disputes` table. | Store the provider level on the dispute at open time, for reporting and for the cap decision. |

### Docs, process and tests

| ID | Sev | Issue | Evidence | Proposed direction |
|---|---|---|---|---|
| DOC-1 | Medium | `docs/PROJECT_STATUS.md` is out of date and was flagged as wrong. | Session notes. | Rewrite from `docs/ARCHITECTURE.md`. |
| DOC-2 | Medium | ADRs are inside the README and changelog, not in their own files. | `README.md`, `CHANGELOG.md`. | Move ADR-008 and the new decision to `docs/adr/`, one file each. |
| DOC-3 | Low | Docs say the Hostel fee is unlocked by the webhook. Code does not do that yet. | `CHANGELOG.md` vs `ListHostelPage.jsx`. | Correct the changelog wording when SEC-3 is fixed. |
| TEST-1 | High | No tests cover visibility rules (who can see whom), caps or ranking. | No matching or visibility tests found in review. | Add a test file for the visibility rule per level, the cap, and the ranking function before launch. |
| TEST-2 | Medium | No end-to-end test for the escrow path from lock to release. | Not found. | Add one test with the Flutterwave sandbox once the webhook round trip works. |

---

## 5. Open Questions for Product

1. Which option in section 2 do we choose for launch: A (hybrid), B (ADR-008 as built), or C (separate lanes)?
2. What is the Level 1 job cap, and is it per job or per client per provider per month?
3. What prior and weight should the Bayesian rating use? Proposed starting point: prior mean 4.0, weight 5.
4. Should Level 1 providers ever appear when a client filters to "verified only"?
5. Which filters are required at launch: location, rating, price range, verification tier, or a smaller set?
6. How long do verification records stay on file after a provider leaves?

## 6. Open Questions for Engineering

1. Which RPC or webhook sets `verified_providers.level = 1` after NIN or BVN checks?
2. Does dispatch read `escrow_transactions.status` in the same transaction as the job update?
3. Where is provider location stored, if anywhere, for radius search?
4. Is there a shared job and review table that links a review to a completed, paid job?

---

## 7. Suggested Order of Work

1. Decide the policy (section 2). Blocks everything else.
2. Fix SEC-1 before any NIN or BVN data is stored. Blocks VER-1.
3. Add the rating formula (RATE-1) and the visibility, cap and ranking tests (TEST-1).
4. Build the ranking function (MATCH-1) and the provider location (MATCH-2).
5. Enforce the cap on the server (ESC-1, ABUSE-2).
6. Add promotion, demotion and expiry jobs (RATE-2, VER-3, VER-4) if the policy keeps promotion.
7. Fix the rate limiter and hostel fee (SEC-2, SEC-3).
8. Rewrite the status doc and move ADRs (DOC-1, DOC-2).
