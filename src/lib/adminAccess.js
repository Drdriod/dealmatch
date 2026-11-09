// Who may do what in the admin area, decided by the account's ROLE in the database and nothing else.
// Before this, two personal email addresses were written into the website code and the admin
// server, so whoever controlled those inboxes kept admin power after their role was removed, and
// the addresses were visible to every visitor. Roles live in profiles.role and are changed only by
// the superadmin (see api/admin/[resource].js). The database applies the same rule through
// public.is_admin(), public.is_staff() and public.is_superadmin().

export const STAFF_ROLES = ['admin', 'superadmin', 'agent', 'verifier'] // may open the admin area and read
export const LOGIN_ROLES = ['admin', 'superadmin', 'agent']             // may sign in on the admin login page

export const isStaff = (role) => STAFF_ROLES.includes(role)
export const canSignInToAdmin = (role) => LOGIN_ROLES.includes(role)
export const isSuperadmin = (role) => role === 'superadmin'
// Changing users, testimonials and similar records.
export const canMutateAdmin = (role) => role === 'admin' || role === 'superadmin'
