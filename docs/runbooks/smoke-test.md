# Smoke test after a deploy or a database change

Run these on the live site. Each takes a minute or less.

## 1. Seller phone and email are private (migration 18)

Open https://www.dealmatch.com.ng in Chrome, press F12, open the Console tab, paste this and press Enter.
The key below is the public browser key (it is already inside the site's JavaScript); it is not a secret.

```js
const base = 'https://dijggrafwdznescbuypi.supabase.co/rest/v1/properties'
const h = { apikey: 'sb_publishable_fJO_E_HfoKhVhtyRQIvzCw_fIJdec1c' }
const ask = async (q) => { const r = await fetch(base + q, { headers: h }); return r.status + ' ' + (await r.text()).slice(0, 140) }
console.log('phone (want 401 or 403, permission denied):', await ask('?select=contact_phone&limit=1'))
console.log('email (want 401 or 403, permission denied):', await ask('?select=contact_email&limit=1'))
console.log('public columns (want 200):', await ask('?select=id,title,price&limit=1'))
```

Pass: the first two lines say permission denied, the third says 200 (an empty list `[]` is fine while there are no listings).
Fail: either of the first two returns 200. Stop and tell Claude.

Checked from the database on 2026-10-24 as the `anon` and `authenticated` roles: contact_phone and contact_email are refused, public columns read fine.

## 2. Pages

1. Home page loads. No platform numbers show until the milestone in `src/lib/homeStats.js` is reached; the four trust badges show instead.
2. Browse opens. It is empty until real listings exist (production has none), which is expected, not a fault.
3. Sign up with a test email: the password popup shows while the password field is focused, the referral code box accepts a code, the 6-digit code arrives, you land on onboarding.
4. A sandbox payment completes.

If any page shows "permission denied" or an unexpected empty list, note which page and tell Claude.
