# Setting a User as a Lender

To allow a user to access the **Lender Dashboard** and manage mortgage applications, you must change their role to `lender`. Here are two ways to do it.

## Method 1: Via Supabase Dashboard (Recommended)

1.  Log in to your [Supabase Dashboard](https://app.supabase.com/).
2.  Go to the **Table Editor** (grid icon in the sidebar).
3.  Select the `profiles` table.
4.  Find the user you want to promote (you can search by their email).
5.  Double-click the `role` column for that user.
6.  Change the value from `buyer` (or whatever it is) to `lender`.
7.  Press **Enter** or click outside the cell to save.

## Method 2: Via SQL Editor

If you have the user's email address, you can run this single command in the **SQL Editor**:

```sql
UPDATE public.profiles
SET role = 'lender'
WHERE email = 'user@example.com';
```

*(Replace `user@example.com` with the actual email of the user.)*

---

## What Changes for the User?
Once the role is set to `lender`:
1.  A new **🏦 Lender Dashboard** link will appear in their navigation menu.
2.  They will gain access to the `/lender-dashboard` page.
3.  Database permissions (RLS) will automatically grant them access to view and update all mortgage applications.
