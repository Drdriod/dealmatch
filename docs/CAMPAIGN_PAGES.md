# Campaign pages

Reusable landing pages for ads and outreach, created and edited in Admin, Campaigns. No code change is needed for a new page.

- Public address: `/l/<slug>`. Add `?src=<tag>` to any link (for example `?src=email1` or `?src=fb-ad`) to see visits and enquiries per source in Admin.
- Templates: Property for sale, Platform sign-up. Both use the same page; only the headings differ.
- Enquiries go through `/api/platform?resource=campaign-lead` (rate limited, spam trap field). They are saved with the consent wording the person saw, shown in Admin, Campaigns, and emailed to the page's "Email enquiries to" address.
- Draft and archived pages are never public. Private fields (notify email, creator) are never returned to the public.
- A page that mentions "escrow", "verified" or "guarantee" cannot be published until "trust claims approved" is ticked. Escrow funding is off, so only tick it when the claim is true.
- Link previews: crawlers (WhatsApp, Facebook, Google) get plain HTML with the page title and cover photo from `/api/platform?render=campaign`.
- Database: `supabase/migrations/20261126100000_campaign_pages.sql`. Test: `supabase/tests/campaign_pages.sql` (staging only, rolls back).
- Rollback: set a page to Draft (instant). To remove the feature, drop `campaign_visits`, `campaign_leads`, `campaign_pages`, the four functions and the `campaign-images` bucket.
- Cold email is a separate decision: do not send bulk mail from the sender that carries payment and sign-up emails, and keep consent and an opt-out in every message.
