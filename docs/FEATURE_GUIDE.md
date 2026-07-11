# DealMatch Feature Guide & Architecture

---

## 7. Agent Accounts — Internal Only

**How it works:**
- Only you (admin) can CREATE agent accounts — via Admin Panel → Agents tab
- Agents sign in at `/admin-login` with their normal email/password (same Supabase Auth)
- Once signed in, agents with `role = 'agent'` are automatically redirected to `/agent` (Agent Portal)
- The Agent Portal shows: assigned listings to verify, identity verification queue
- Agents CANNOT sign up themselves — their accounts are created internally

**To create an agent:**
1. Go to `/admin` → Agents tab
2. Fill in name, email, phone
3. Click "Create Agent" — this sends an invite email via Supabase
4. The agent receives email → sets password → signs in → lands on Agent Portal

---

## 8. Agent Workflow — What Can Be Automated

**Manual (agents must do):**
- Physical property visit & photo verification
- Face-to-face ID document check
- Approve/Reject identity submissions (reviewing photo + selfie)

**Automated:**
- Assignment: when a listing is submitted, auto-assign to the agent covering that state
- Notifications: agent gets email + in-app notification when assigned a new listing
- Escalation: if agent doesn't respond in 48hrs, listing is flagged for reassignment
- Status updates: when agent approves, property goes live automatically
- Lead routing: hot leads (score ≥ 70) auto-notified to seller via WhatsApp

**Automation SQL trigger (add to migration):**
```sql
CREATE OR REPLACE FUNCTION auto_assign_agent()
RETURNS trigger AS $$
DECLARE v_agent uuid;
BEGIN
  SELECT user_id INTO v_agent FROM public.agent_accounts
  WHERE is_active = true AND NEW.state = ANY(assigned_states)
  LIMIT 1;
  IF v_agent IS NOT NULL THEN
    NEW.assigned_agent_id := v_agent;
    NEW.status := 'under_verification';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_assign_agent
  BEFORE INSERT ON public.properties
  FOR EACH ROW EXECUTE FUNCTION auto_assign_agent();
```

---

## 10. Post-Swipe CTA — Lead Intelligence

**Flow:**
1. User swipes "Like" on a property
2. `PropertyInterestModal` opens immediately
3. User selects: Intent (Urgent buyer / Make offer / Schedule viewing / Get info)
4. User selects: Timeline (Immediately / 1 month / 3 months / etc.)
5. Optional: phone number + message
6. System calculates Lead Score (0–80)
7. Saved to `property_interest` table
8. Seller/Admin sees lead with score in Admin → Leads tab

**Lead Score Breakdown:**
| Signal | Score |
|---|---|
| Urgent buyer intent | 40 |
| Make offer intent | 35 |
| Schedule viewing | 25 |
| Immediate timeline | 30 |
| 1-month timeline | 20 |
| Phone provided | 10 |

**Lead Types:**
- 70–80: Immediate Buyer (hot — contact within 1 hour)
- 50–69: Decision Maker (warm — contact within 24 hours)
- 30–49: Interested Lead (contact within 48 hours)
- 15–29: Potential Buyer (nurture)
- 0–14: Browsing (low priority)

---

## 11. Professional Requests — Communication Flow

**Current flow:**
1. User visits `/professionals` → finds professional → clicks "Contact"
2. `ContactModal` opens → user fills name, phone, email, message
3. Saved to `professional_requests` table with status = 'pending'
4. **Missing piece:** Professional gets no notification (this needs to be added)

**Recommended complete flow:**
1. User submits request → saved to DB
2. Supabase Database Webhook → triggers Edge Function
3. Edge Function sends email to professional via Resend: "New client request from DealMatch"
4. Professional sees in-app notification badge (via Supabase Realtime)
5. Professional accepts → status → 'connected' → both get notified
6. Communication happens via DealMatch Messages (`/messages`)
7. When job done → Professional marks 'completed' → review request sent to client

**To enable email notifications:**
Add this in Supabase → Database → Webhooks:
- Table: `professional_requests`
- Event: INSERT
- URL: your Resend email Edge Function URL

---

## 12. Dashboard Verify Button Fix

**Fixed in v1.5:** The "Verify" button in Dashboard now correctly links to `/verify-identity` 
(the user identity submission page) instead of `/verify` (the agent property verification page).

---


---

## Setup: Creating Your First Agent

```sql
-- After agent signs up via invite:
UPDATE public.profiles 
SET role = 'agent' 
WHERE email = 'agent@dealmatch.com';

-- Add to agent_accounts table:
INSERT INTO public.agent_accounts (user_id, full_name, email, phone, badge_number, assigned_states)
SELECT id, full_name, email, phone, 'DM-001', ARRAY['Lagos','Ogun','Oyo']
FROM public.profiles WHERE email = 'agent@dealmatch.com';
```
