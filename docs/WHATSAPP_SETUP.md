# DealMatch WhatsApp Gateway: setup and operations

People message the DealMatch WhatsApp number to find a mechanic, artisan or home.
Their number is registered on the first message (no account needed). Contacting a
provider needs a one-time identity check, done on the website through a single-use
link. Verified people are never asked again.

Trust ladder:

| Tier     | How you get there                                  | Can do from WhatsApp                          |
|----------|----------------------------------------------------|-----------------------------------------------|
| guest    | first message, after consent                       | search, masked results, up to 5 requests/day  |
| linked   | tapped the link, signed in, number bound to account| same, higher limits                           |
| verified | identity_verification_status = approved            | handed off to contact providers, 20/day       |

Provider phone numbers and payments never travel through WhatsApp.

## 1. Run the migration (Supabase SQL editor)

Run `supabase/migrations/20261004000000_whatsapp_gateway.sql`. It is additive only.
Check afterwards:

    select table_name from information_schema.tables
    where table_schema = 'public' and table_name like 'wa\_%';

Expect: wa_blocked_numbers, wa_contacts, wa_link_tokens, wa_message_log, wa_requests.

## 2. Vercel environment variables

| Name                           | Value                                                                   |
|--------------------------------|-------------------------------------------------------------------------|
| WHATSAPP_CLOUD_API_TOKEN       | permanent system-user token (step 3)                                    |
| WHATSAPP_PHONE_NUMBER_ID       | the Phone number ID from the Meta console (not the phone number)        |
| WHATSAPP_VERIFY_TOKEN          | any long random string you invent; same value goes into Meta (step 4)   |
| WHATSAPP_APP_SECRET            | Meta app > Settings > Basic > App secret                                |
| WHATSAPP_ALLOWED_COUNTRY_CODES | optional, default 234 (Nigeria). Comma list, or * to allow any country  |
| UPSTASH_REDIS_REST_URL / TOKEN | already listed as missing in missing_env_vars.md; add them             |

Redeploy after adding them. Without WHATSAPP_APP_SECRET every webhook call is rejected on purpose.

## 3. Meta console

1. Business number. The number you register on the Cloud API cannot also be
   logged in on a normal WhatsApp or WhatsApp Business app, unless you use Meta's
   coexistence feature. The support number hard-coded in
   src/components/ui/WhatsAppButton.jsx (and the link page) must be the number the
   bot answers on, or you must change that constant.
2. Permanent token. business.facebook.com > Business settings > Users > System
   users > add a system user > Assign assets (your app, full control) > Generate
   token with `whatsapp_business_messaging` and `whatsapp_business_management`.
   Choose "never expires". That is WHATSAPP_CLOUD_API_TOKEN. The temporary token on
   the API Setup page expires in 24 hours; do not use it.
3. Phone number ID. App dashboard > WhatsApp > API Setup. Copy the Phone number ID.

## 4. Point Meta at DealMatch

App dashboard > WhatsApp > Configuration > Webhook > Edit:

- Callback URL: `https://www.dealmatch.com.ng/api/whatsapp`
- Verify token: exactly the value of WHATSAPP_VERIFY_TOKEN

Click Verify and save, then under Webhook fields subscribe to **messages**.

Use the www address. Meta does not follow redirects, so if the bare domain
redirects to www, the handshake fails.

Test the handshake yourself first (should print 12345 and HTTP 200):

    curl -i "https://www.dealmatch.com.ng/api/whatsapp?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=12345"

A wrong token returns 403.

## 5. Test before going live

While the app is in development mode, add your own number under API Setup >
"To" recipients, then message the business number:

1. `hi` shows the consent buttons. Tap Agree and continue.
2. Send a first name. The menu appears.
3. Find a service > Mechanic > an area > SKIP. Three masked results arrive.
4. Tap Contact a provider. A "Verify on DealMatch" button arrives.
5. Open it, sign in or sign up, finish onboarding. You land on "WhatsApp linked"
   and get a confirmation in the chat.
6. Submit identity documents and approve them in the admin panel. Tap Contact a
   provider again: you are handed off and never asked to verify again.

Check what the bot stored:

    select wa_id, display_name, consent_at, profile_id, status, strikes from wa_contacts order by created_at desc;

## 6. Going live

- Complete Meta Business verification (needed to message beyond the test list).
- Get the display name approved.
- Switch the app from Development to Live mode.
- Add a payment method in WhatsApp Manager. Check Meta's current pricing page for
  what a service reply costs; replies inside the 24-hour window after a person's
  message are the cheapest case, and this bot only replies inside that window.

## 7. Operating it

Unsuspend a number after review:

    update wa_contacts set status = 'active', strikes = 0, status_reason = null where wa_id = '2348031234567';

Block a number permanently:

    insert into wa_blocked_numbers (wa_id, reason) values ('2348031234567', 'abuse') on conflict do nothing;

See who got suspended:

    select wa_id, strikes, status_reason, last_strike_at from wa_contacts where status <> 'active';

Free a number from a wrong account link (support request):

    update wa_contacts set profile_id = null, linked_at = null where wa_id = '2348031234567';

Retention: schedule `select public.wa_purge_old(90);` daily with Supabase pg_cron.

## 8. Message templates to create (needed for v2 notifications)

Outside the 24-hour window WhatsApp only delivers approved templates. Create these
in WhatsApp Manager > Message templates, category Utility:

- dm_identity_approved: "Hi {{1}}, your DealMatch identity check is approved. You can now contact providers from this chat."
- dm_identity_rejected: "Hi {{1}}, your DealMatch identity check needs another try. Open DealMatch to resubmit with clearer photos."
- dm_request_update: "Hi {{1}}, there is an update on your {{2}} request. Open DealMatch to see it."

## 9. Safety controls built in

- Webhook signature verified against the raw body (HMAC-SHA256, constant-time compare). Unsigned calls are rejected.
- Meta retries are ignored (unique message id), so nothing runs twice.
- Consent is required before anything beyond the number is stored; declining deletes the number.
- Link tokens: 256-bit random, only the hash is stored, single use, 20 minute life, bound to one chat, and a newer link cancels older ones. At most 5 links per number per hour.
- One WhatsApp number per account and one account per number (database unique constraint).
- Restricted, flagged or deactivated accounts cannot be linked or handed off.
- Per-number limits (messages per hour, requests per day) are counted in the database, so they still work if Redis is down.
- Illegal-content screening adds a strike; three strikes suspend the number. Phone numbers, links and emails in free text are refused without a strike.
- New contacts only from allowed country codes (default Nigeria).
- Results never include phone numbers or emails; the property query selects public columns only.

## 10. Known limits of v1

- Text and buttons only. Voice notes, photos and shared locations get a polite "text only" reply.
- Identity approval does not yet message the person on WhatsApp by itself. They see the status when they send VERIFY, and templates above are the fix.
- Requests are saved and answered instantly from live listings; they are not yet turned into jobs that providers can bid on.
- A SIM swap can move a number to a new owner. That is why money and contact unlocking are always finished on the website, signed in, never inside the chat.
