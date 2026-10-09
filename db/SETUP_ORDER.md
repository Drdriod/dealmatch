# DealMatch Database Setup Order

Run SQL files in Supabase SQL Editor **in this exact order**:

## Fresh Install
1. `supabase-schema.sql`            - core tables
2. `profiles-migration.sql`         - adds missing profile/property columns  
3. `missing-tables.sql`             - matches, professionals view ⭐
4. `professional-schema.jsx`        - copy the SQL block inside
5. `crypto-schema.jsx`              - copy the SQL block inside
6. `agreements-schema.jsx`          - copy the SQL block inside
7. `availability-schema.jsx`        - copy the SQL block inside
8. `admin-features-migration.sql`   - hotel bookings admin, identity verification, clash-prevention ⭐ NEW
9. `security-hardening.sql`        - RLS policies tightening
10. `comprehensive-security-fix.sql` -  final security pass
11. `security-rls-fix.sql`          - additional RLS fixes
12. `pinecone-setup.sql`            - optional: only if using AI matching

## Existing Database (add new features only)
Run: `admin-features-migration.sql` + `missing-tables.sql`

## After running all SQL
1. Click "Reload Schema" in Supabase Table Editor
2. In Supabase Dashboard → Authentication → Confirm your admin email is in ADMIN_EMAILS in AdminPage.jsx
3. Founder accounts get the `superadmin` role from migration `20261009000000_security_audit_hardening.sql`, matched on the verified login email in `auth.users`. Do not set admin rights by `profiles.email`: users can edit that column, so it is not an authority. To grant a role to anyone else, a superadmin uses the admin UI, or run by user id: `UPDATE profiles SET role='admin' WHERE id = '<auth user uuid>';`

## Key Tables Added in v1.4
- `matches` - AI property matching results
- `bookings` - now has: category_id, user_id, checkin_at, checkout_at, admin_note
- `profiles` - now has: identity_photo_url, identity_selfie_url, identity_doc_type, identity_verification_status

## Clash Prevention
The `check_booking_availability()` SQL function prevents double-bookings.
Called automatically from HotelsPage before confirming any booking.
