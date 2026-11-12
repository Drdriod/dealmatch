# DealMatch full-stack audit report: 12 November 2026

## A. Executive summary

The platform is in reasonable shape for a closed launch. Payments are priced and checked on the server, webhooks verify signatures and re-fetch each charge from Flutterwave, secrets are not in the code, rate limiting exists on money and login paths, and no money-moving database function is callable without an identity check. The audit found 19 issues: 4 high, 5 medium, 10 low. All high and medium issues are fixed (code in open PRs, database changes live in production). Three items remain for the owner (section D).

**Verdict: READY WITH CONDITIONS** (section F). Not "fully secure": this audit was a code and configuration review plus local tests, not a live penetration test.

## B. Findings register

| ID | Sev | Area | Finding | Status |
|----|-----|------|---------|--------|
| F-001 | HIGH | Referral payouts | The same payment could pay referrers twice (check-then-insert race, no unique key) | Fixed: PR #70, unique index live in production |
| F-002 | HIGH | Referral payouts | The referral insert omitted required columns and used a text reference in a uuid column, so it always failed (0 rows in production) while loyalty points were still granted before it | Fixed: PR #70 (insert is now the gate; test added) |
| F-004 | HIGH | Admin login | Anyone with the public key could call `record_admin_login_attempt` and lock any admin out | Fixed: function revoked in production; PR #69 |
| F-006 | HIGH | MFA | Two-step sign-in was enforced only in the browser; the database and admin API accepted a password-only session | Fixed: role helpers and /api/admin require aal2; live in production; PR #72 |
| F-003 | MED | send-email / send-whatsapp | Any signed-in user could send free text to any user id | Fixed in PR #71 (only self, staff, or a real dealing) |
| F-005 | MED | Admin login | The admin page signed in directly with Supabase; the rate-limited server login was unused | Fixed in PR #69 (stacked on #64) |
| F-007 | MED | Database | `spatial_ref_sys` had row security off and write rights for the public key | Fixed: revoked in production |
| F-008 | LOW | Storage | property-images accepted uploads anywhere in the bucket; public buckets accepted any file type; identity-docs had no size or type limit | Fix ready: PR #73; migration on staging only, production awaits go-ahead |
| F-009 | LOW | Storage | Duplicate avatar policies | Same PR #73 |
| F-010 | LOW | Escrow webhook | Signature computed over re-serialised JSON, not raw bytes; no amount check | Open (see D) |
| F-011 | LOW | Headers | X-XSS-Protection 1; no CSP frame-ancestors | Fix in PR #73 |
| F-012 | LOW | Webhook | In-memory duplicate guard (database gate still protects) | Open, informational |
| F-013 | LOW | Database speed | 9 policies re-evaluate auth functions per row; 141 unused indexes (normal at this traffic); no missing foreign-key indexes | Open |
| F-014 | LOW | Extensions | postgis and pg_net live in the public schema | Open |
| F-015 | LOW | Performance | Home page layout shift 0.245 (mobile) / 0.297 (desktop), over the 0.1 target | Fixed: PR #74, measured 0 |
| F-016 | LOW | Accessibility | Unnamed WhatsApp button (critical) on every page, plus 7 other unnamed icon buttons; muted grey text at 4.3:1 (needs 4.5) across the app; text at 40-50% opacity (2.4-3.2:1) in about 20 places; brand terracotta on tint 4.2:1 | Buttons and muted grey fixed in PRs #75 and #78; opacity text and terracotta tint need a design decision |
| F-017 | MED | AI search index | /api/index-property indexed whatever price, location and title the browser sent, so an owner could make search show figures different from the saved listing | Fixed: PR #77 (reads the saved row) |
| F-018 | MED | Agent verification | The signing key for site-visit evidence is handed to the agent's own device, and the mock-location flag is self-reported, so a dishonest assigned agent could fabricate GPS evidence. Everything else on that endpoint is sound (assigned-agent check, one-time sessions, distance check) | Open: design limitation, mitigated by admin review; consider server-side photo EXIF/GPS cross-checks |
| F-019 | LOW | Dependencies | npm audit: 1 high (vite dev server), 3 moderate (esbuild, react-router). Dev-server only or not reachable: the redirect target comes from in-app state, not the URL | Open: upgrade vite and react-router-dom together |

Also noted, not rated: signup lookups (`check_phone_exists`, `check_username_exists`, `check_signup_conflicts`, `check_device_exists`) are open to the public so anyone can test whether a phone or username is registered (accepted for signup UX).

## C. Remediation

PRs (all open, none merged by me): #69 admin sign-in, #70 referral payouts, #71 messaging, #72 MFA, #73 storage and headers, #74 layout shift, #75 and #78 accessibility, #77 search index and agent rate limit. #69 is stacked on #64, so merge #64 first.

Production database changes made today (all additive or revoking): revoke public access to two admin-lockout functions; revoke public writes on PostGIS reference tables; unique index on referral_transactions; is_admin / is_staff / is_admin_staff / is_superadmin now require an MFA-verified session. Staging got the same changes first; MFA behaviour was tested on staging (password-only session denied, MFA session allowed).

## D. Outstanding

1. Merge and deploy PRs #64, #69-#75. Until #69 deploys, the live admin login page still calls the revoked lockout functions: sign-in still works, but it records no failed attempts.
2. Apply the storage migration (PR #73) to production after your go-ahead.
3. Owner actions outside the code: turn on leaked-password protection in Supabase Auth; restrict the Google Maps key to your domains.
4. F-010 (escrow webhook raw-body signature): left as is because no sender is known to use it; switch it when escrow webhooks are actually connected.
5. Not done: internals of every database function that checks `auth.uid()`; the CI pipeline; hands-on injection testing against running forms; session expiry and logout behaviour; end-to-end sandbox payment; load testing; per-page speed beyond the home page.
6. Design decision: 5 brand-colour contrast pairs (terracotta on cream, 4.2:1 vs 4.5:1 needed).

## E. Test results

- `npm run check` (lint, types, architecture rules, unit tests): 232 of 232 pass on each PR branch.
- New tests: referral payout happens once with required columns; messaging allowed only between related accounts.
- Database: staging simulation of password-only versus MFA sessions; grants verified after migrations on staging.
- Production catalog queries: no policy or function used aal before the fix; 1 of 1 staff account has a verified MFA factor.
- Performance (local build, 390px, 4x CPU, slow 4G): FCP about 4.1 s, LCP about 4.8 s, CLS 0 after fix. Desktop: FCP 0.37 s, LCP 0.51 s, CLS 0. Local server has no compression, so transfer sizes overstate real use. Bundle: first-load JavaScript is roughly 200 KB gzipped; the PostHog bundle (68 KB gz) and the 227 KB logo PNG are the main savings left.
- Accessibility (axe-core, WCAG 2.1 AA, 390px, 15 public pages): the unnamed WhatsApp button appears on all of them; muted grey and footer text miss 4.5:1 on most. CORRECTION: my first run reported four pages as clean because my test server returned 404 pages for them; the numbers above are from the re-run with a proper single-page-app server.
- Dependencies: `npm audit` run (see F-019).
- Endpoints reviewed: agent, index-property, validate-invite, match (all authenticate, rate limit or check ownership; see F-017, F-018).
- Not done: live header probes (the sandbox cannot reach dealmatch.com.ng), a real Flutterwave end-to-end payment, load testing, browser testing beyond Chromium.

## F. Production readiness: READY WITH CONDITIONS

Ready for a closed or soft launch once the PRs are merged and deployed, the storage migration is applied, and the owner actions in D.3 are done. Before open public launch: run a full payment in the Flutterwave sandbox from signup to payout, probe the live headers, and commission an external penetration test.
