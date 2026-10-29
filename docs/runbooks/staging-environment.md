# Staging environment for the tester run

Testers never touch production. They use a Vercel **Preview** deployment pointed at the separate **staging** Supabase project, with Flutterwave **sandbox** money. When the run is over, the staging data can be wiped without touching a real customer.

| | Production | Staging |
|---|---|---|
| Supabase project | `dijggrafwdznescbuypi` | `vogjbkgmqanjeaxnpzqs` ("dealmatch - staging") |
| URL | (production) | `https://vogjbkgmqanjeaxnpzqs.supabase.co` |
| Browser key (publishable, safe in the browser) | (production) | `sb_publishable_OlSk2CyZLi_EieHCJPwj0g_9hEtNbEZ` |
| Payments | live | Flutterwave sandbox |

## Parity with production (checked 2026-10-29)

Staging was compared with production object by object and now matches on: functions (134), policies (219), triggers (59), indexes (343), columns (1145), constraints (368), views (9), row-level security on every table (87), function permissions (94), table permissions, signup triggers on `auth.users`, storage buckets and policies (22), and reference data (fees, 71 active categories, institutions, platform settings).

Known and accepted differences:
- Staging's inactive (hidden) categories use different ID numbers. The 71 active categories are identical. The app never uses category ID numbers.
- Staging has one extra forum category, "Real Estate & Housing".
- The three PostGIS system tables (`spatial_ref_sys`, `geometry_columns`, `geography_columns`) are not exposed to the public roles on staging. That is stricter than production.
- `pg_cron` is not installed on staging. Staging runs no scheduled jobs; the payment reconcile job is triggered from GitHub (`CRON_SECRET`, `SITE_URL`).
- Production objects that exist in no migration file (the `reviews` rules, `accept_direct_request`, `decline_direct_request`, three `profiles` columns) were copied from production. Add a migration so the repo matches (see `docs/OPEN_ITEMS.md`).

Safety checks run on staging (rolled back, nothing kept): a signed-in user can submit one pending story; a second live story, a self-approved story and a story as someone else are all refused; another user cannot read a person's phone or email; the public cannot read `contact_phone` or `contact_email` on properties, nor anyone's profile phone/email, nor stories that are not approved. Signup creates a profile and an earnings row.

## Vercel Preview settings

Use a dedicated branch (for example `staging-test`) so the settings apply to Preview only and never to Production.

| Variable | Value |
|---|---|
| `VITE_TEST_MODE` | `true` (turns on `/t/:code` and the test banner) |
| `VITE_SUPABASE_URL` | `https://vogjbkgmqanjeaxnpzqs.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | the staging publishable key above |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | the staging project's values (Supabase, Settings, API) |
| `FLUTTERWAVE_V4_CLIENT_ID`, `FLUTTERWAVE_V4_CLIENT_SECRET` | sandbox credentials |
| `FLUTTERWAVE_BASE_URL` | `https://developersandbox-api.flutterwave.com` |
| `FLUTTERWAVE_SECRET_HASH` | the sandbox webhook secret hash |
| `CRON_SECRET` | any long random string |
| `VITE_TEST_REPORT_URL` | optional: link to the shared report sheet |

Then in the Flutterwave sandbox dashboard set the webhook to `<preview url>/api/payments/webhook`. In Supabase staging, Authentication, URL configuration: add the Preview URL as the site URL and a redirect URL.

Rotate the Flutterwave sandbox secret first (it appeared in screenshots).

## After the run

Staging holds only test data. To reset it, delete the test users in Supabase staging (Authentication, Users) and clear the test rows; this is safe because nothing on staging is real. Production is not affected.
