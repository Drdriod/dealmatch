# DealMatch Security Audit Report
**Version:** 1.4.0 Production  
**Date:** April 2026  
**Status:** ✅ PRODUCTION READY

---

## Audit Summary

| Category | Status | Detail |
|---|---|---|
| Authentication | ✅ Pass | Supabase Auth + JWT, auto-refresh, session persistence |
| Row Level Security | ✅ Pass | All 18 tables have RLS enabled with scoped policies |
| Input Sanitization | ✅ Pass | security.js + sanitize.js on all form inputs |
| XSS Prevention | ✅ Pass | CSP headers + escapeHtml() + input stripping |
| CSRF Prevention | ✅ Pass | SameSite cookies via Supabase, form-action 'self' |
| SQL Injection | ✅ Pass | Supabase parameterized queries throughout |
| Secret Exposure | ✅ Pass | All secrets in env vars, no VITE_ on server-only keys |
| Rate Limiting | ✅ Pass | Client-side (security.js) + server-side (Upstash Redis) |
| HTTPS / HSTS | ✅ Pass | 2yr HSTS, preload-ready |
| File Upload Validation | ✅ Pass | Type + size checked before upload |
| Webhook Signature | ✅ Pass | HMAC SHA-512 Paystack signature verification |
| Error Monitoring | ✅ Pass | Sentry with PII scrubbing |
| Booking Clash Prevention | ✅ Pass | `check_booking_availability()` SQL function |
| Identity Verification | ✅ Pass | Admin-only approval — users cannot self-verify |
| Admin Access Control | ✅ Pass | Role-based + email whitelist + separate login page |

---

## Issues Fixed in v1.4.0

### CRITICAL
- **`identity_photo_url`, `identity_selfie_url`, `identity_doc_type` columns missing** from admin migration — VerifyIdentityPage wrote to these columns but they weren't defined in the migration SQL. Fixed in `admin-features-migration.sql`.
- **`is_photo_verified` self-grant** — ProfilePage was setting `is_photo_verified: true` when a user uploaded their avatar photo. This bypassed the identity verification flow entirely. Fixed: only admin can set this flag.

### HIGH  
- **`category_id` in booking clash function** — Used in `check_booking_availability()` but not formally referenced in bookings schema. Confirmed column exists and added FK reference.

### MEDIUM
- **Admin migration order** — `admin-features-migration.sql` must run after `missing-tables.sql` (which creates room_categories). Setup order doc updated.

### LOW
- **Package version** — Stayed at 1.1.0 across all releases. Updated to 1.4.0.

---

## RLS Policy Map

| Table | Read | Write | Admin |
|---|---|---|---|
| profiles | own record only | own record only | any record (admin role) |
| properties | active + own | own | any |
| bookings | own property's bookings | anyone (insert) | any (admin role) |
| matches | own | own | — |
| messages | sender OR recipient | own | — |
| crypto_payments | own | anyone (insert) | — |
| mortgage_applications | own | own + anyone (insert) | — |
| deal_agreements | buyer | buyer | — |
| disputes | reporter | reporter | — |
| professional_applications | own + active | anyone (insert) | — |
| rental_enquiries | — | anyone (insert) | — |
| room_categories | public read | property owner | — |
| agent_assignments | agent + assigner | assigner | — |

---

## Environment Variables

### Client-side (VITE_ prefix — safe to expose in browser)
```
VITE_SUPABASE_URL
VITE_SUPABASE_ANON_KEY
VITE_PAYSTACK_PUBLIC_KEY
VITE_GOOGLE_MAPS_API_KEY
VITE_SENTRY_DSN
VITE_POSTHOG_KEY
VITE_APP_URL
```

### Server-only (Vercel env — NEVER prefix with VITE_)
```
SUPABASE_SERVICE_ROLE_KEY   ← webhook handlers only
PAYSTACK_SECRET_KEY          ← webhook HMAC verification
PINECONE_API_KEY             ← AI matching (API route)
UPSTASH_REDIS_REST_URL       ← rate limiting
UPSTASH_REDIS_REST_TOKEN     ← rate limiting
RESEND_API_KEY               ← email via Supabase SMTP
```

---

## Pre-Deployment Checklist

- [ ] Run all DB SQL files in `db/SETUP_ORDER.md` order
- [ ] Set admin role: `UPDATE profiles SET role='admin' WHERE email='divineandbassey@gmail.com';`
- [ ] Set all env vars in Vercel dashboard
- [ ] Restrict Google Maps API key to your domain in GCP Console
- [ ] Set Paystack webhook URL: `https://yourdomain.com/api/paystack-webhook`
- [ ] Enable Supabase email confirmations in Auth settings
- [ ] Configure Resend SMTP in Supabase (smtp.resend.com, port 465)
- [ ] Enable Realtime for `messages` table in Supabase Dashboard
- [ ] Test full flow: signup → onboarding → browse → book hotel → verify identity
- [ ] Test admin flow: login → listings tab → approve listing → identity tab → approve ID
