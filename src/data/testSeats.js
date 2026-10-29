// Test seats for the staging tester run (see docs/runbooks/full-stack-test-plan.md).
// Static content only: no database access. Used by /t and /t/:code, which exist
// only when VITE_TEST_MODE=true (a Preview deployment pointed at the staging database).
//
// Order matters. Supply is created first so demand testers have real things to find:
//   phase 1 SUPPLY  (T4 landlord, T7 professional, T5 agent, S1 staff)
//   phase 2 DEMAND  (T1 renter, T2 guest, T3 student, T6 customer, T10 rewards)
//   phase 3 STRESS  (T8 hostile, T9 low-end phone)

export const PHASES = {
  supply: {
    label: 'Phase 1: Supply',
    blurb: 'You create the things other testers will look for. Start first.',
  },
  demand: {
    label: 'Phase 2: Demand',
    blurb: 'You look for, request and pay for what supply testers created. Start only when the owner says supply is live.',
  },
  stress: {
    label: 'Phase 3: Stress',
    blurb: 'You try to break things and test on a weak phone. Start after phase 2 has run.',
  },
}

export const SEATS = [
  // ───────────────────────── SUPPLY ─────────────────────────
  {
    code: 'T4-LANDLORD-W5Z8',
    seat: 'T4',
    title: 'Landlord',
    door: 'Places',
    phase: 'supply',
    minutes: 45,
    signUpAs: 'a landlord or property owner',
    startWhen: 'Start now. You go first: other testers need your listing.',
    pairWith: 'T1 Renter (rental payment) and T2 Guest (short-let booking)',
    steps: [
      { to: '/auth?tab=signup', do: 'Sign up with your email. Use the password popup and enter the 6-digit code.', expect: 'You land on the onboarding screen.' },
      { to: '/onboarding', do: 'Choose that you list a place. Finish your profile.', expect: 'You reach a dashboard with a clear next step.' },
      { to: '/verify-identity', do: 'Submit identity details with a sample or blurred ID photo.', expect: 'Status says submitted or pending. It must never say Verified before the owner approves.' },
      { to: '/payout-setup', do: 'Add a test bank account.', expect: 'Status is pending until staff verify it.' },
      { to: '/list-rental', do: 'Create a rental listing with 4 photos, a price and a location. Make a second one as a short-let if you can.', expect: 'You see a preview, then a moderation state. Photos upload and show.' },
      { to: '/manage-listings', do: 'Edit the price, pause the listing, then unpause it.', expect: 'Changes show on the public listing page.' },
      { to: '/availability', do: 'Block some dates on the short-let.', expect: 'The T2 guest cannot book the blocked dates.' },
      { to: '/landlord', do: 'When the T1 renter pays, open your landlord dashboard.', expect: 'The funded amount is shown separately from money available to pay out.' },
    ],
  },
  {
    code: 'T7-PRO-D9U9',
    seat: 'T7',
    title: 'Professional (artisan or tutor)',
    door: 'People',
    phase: 'supply',
    minutes: 45,
    signUpAs: 'an artisan, tutor or home-service professional',
    startWhen: 'Start now. You go first: the T6 customer needs a provider to find.',
    pairWith: 'T6 Service customer (quote and payment)',
    steps: [
      { to: '/auth?tab=signup', do: 'Sign up with your email and confirm the 6-digit code.', expect: 'You land on the onboarding screen.' },
      { to: '/apply-professional', do: 'Submit a professional application: your trade, area, rates and a short bio.', expect: 'Saved, and shows as pending.' },
      { to: '/verify-skill', do: 'Submit skill evidence (a sample photo or document is fine).', expect: 'Pending until staff approve.' },
      { to: '/provider', do: 'Wait for the T6 customer, then open your workspace. Open their request and send a quote.', expect: 'Every state is explicit: quoted, countered, accepted.' },
      { to: '/provider', do: 'After the customer pays, mark the work complete.', expect: 'It waits for the customer to confirm. Your money is NOT yet available.' },
      { to: '/wallet', do: 'After release, look at your earnings and request a withdrawal.', expect: 'Earnings and available balance are separate. Withdrawal needs a verified payout account.' },
    ],
  },
  {
    code: 'T5-AGENT-HKQ9',
    seat: 'T5',
    title: 'Agent',
    door: 'Places',
    phase: 'supply',
    minutes: 30,
    signUpAs: 'a property agent (the owner switches your account to the agent role)',
    startWhen: 'Start after the owner tells you your agent account is ready.',
    pairWith: 'Works alone, using listings from T4',
    steps: [
      { to: '/auth', do: 'Sign in with the account the owner set up for you.', expect: 'You sign in without errors.' },
      { to: '/agent', do: 'Open the agent dashboard.', expect: 'Only your assigned work shows. You cannot see other agents\' data.' },
      { to: '/agent', do: 'Work one assigned listing through the agent steps.', expect: 'Each action is recorded. Tell the owner if the steps do not match how you really work.' },
    ],
  },
  {
    code: 'S1-STAFF-FYJP',
    seat: 'S1',
    title: 'Staff helper',
    door: 'Both',
    phase: 'supply',
    minutes: 40,
    signUpAs: 'a verifier (the owner sends you a staff invite)',
    startWhen: 'Start after supply testers have submitted verification. The owner will tell you.',
    pairWith: 'Approves T4 and T7 so phase 2 can begin',
    steps: [
      { to: '/staff/accept-invite', do: 'Open the staff invite link the owner sent you and accept it.', expect: 'Your role is set. A wrong or reused link is refused.' },
      { to: '/admin', do: 'Open the admin console as a verifier.', expect: 'You only see the tabs your role allows. Platform fees, Staff and Settings stay closed to you.' },
      { to: '/admin', do: 'Approve T4\'s identity, T7\'s skill verification and a payout account.', expect: 'Each approval leaves an entry in the audit log.' },
      { to: '/lender', do: 'If you also have a lender account, open the lender page.', expect: 'It shows mortgage applications only.' },
    ],
  },

  // ───────────────────────── DEMAND ─────────────────────────
  {
    code: 'T1-RENT-NWKV',
    seat: 'T1',
    title: 'Renter',
    door: 'Places',
    phase: 'demand',
    minutes: 30,
    signUpAs: 'someone looking to rent a home',
    startWhen: 'Start after the owner says supply is live. Be online at the same time as T4.',
    pairWith: 'T4 Landlord (live)',
    steps: [
      { to: '/auth?tab=signup', do: 'Sign up with your email and confirm the 6-digit code.', expect: 'You land on the onboarding screen.' },
      { to: '/onboarding', do: 'Pick what you are looking for and finish your profile.', expect: 'You reach a dashboard with a clear next step.' },
      { to: '/places', do: 'Search a location, apply price and bedroom filters, and sort.', expect: 'Results match your filters. If nothing matches, the page suggests widening the search.' },
      { to: '/places', do: 'Open the landlord\'s listing.', expect: 'Photos, price, trust label and how Protection works. No phone number or email is shown.' },
      { to: '/messages', do: 'Save the listing, then message the landlord.', expect: 'The saved item appears on your dashboard. Your message sends.' },
      { to: '/places', do: 'Start the protected payment on the listing.', expect: 'You get bank transfer details. The amount matches the listing.' },
      { to: '/places', do: 'Pay with the sandbox test details. If the screen waits, press "I have already paid".', expect: 'Status becomes funded within a minute or two, never stuck. Pressing twice must not charge twice.' },
      { to: '/dashboard', do: 'Open your transaction.', expect: 'A timeline with amount, parties and the next action.' },
      { to: '/dashboard', do: 'Confirm move-in, then leave a review.', expect: 'Contact details unlock only now. A review is only possible after completion.' },
    ],
  },
  {
    code: 'T2-STAY-TVV6',
    seat: 'T2',
    title: 'Short-let or hotel guest',
    door: 'Places',
    phase: 'demand',
    minutes: 30,
    signUpAs: 'a guest booking a short-let or hotel',
    startWhen: 'Start after the owner says supply is live.',
    pairWith: 'T4 Landlord (blocked dates)',
    steps: [
      { to: '/auth?tab=signup', do: 'Sign up and confirm your email code.', expect: 'You land on the onboarding screen.' },
      { to: '/hotels', do: 'Search with dates and number of guests.', expect: 'Only available rooms show.' },
      { to: '/hotels', do: 'Try to book dates the landlord blocked.', expect: 'It is refused with a clear message.' },
      { to: '/hotels', do: 'Book available dates and pay with the sandbox test details.', expect: 'Both the booking and the transaction appear.' },
      { to: '/dashboard', do: 'Cancel inside the rules.', expect: 'The terms show first. Refund status shows pending, then refunded, as separate states.' },
    ],
  },
  {
    code: 'T3-STUDENT-9SJ9',
    seat: 'T3',
    title: 'Student',
    door: 'Places',
    phase: 'demand',
    minutes: 20,
    signUpAs: 'a student looking for a hostel',
    startWhen: 'Start after the owner says supply is live.',
    pairWith: 'Works alone',
    steps: [
      { to: '/auth?tab=signup', do: 'Sign up and confirm your email code.', expect: 'You land on the onboarding screen.' },
      { to: '/student-hostels', do: 'Filter hostels by your school.', expect: 'Hostel cards show price and trust labels. Your school is in the list.' },
      { to: '/student-verify', do: 'Submit a student ID. A blurred or sample photo is fine.', expect: 'Status says pending, not verified.' },
      { to: '/student-hostels', do: 'Send a hostel enquiry.', expect: 'You get a confirmation.' },
    ],
  },
  {
    code: 'T6-CUSTOMER-GAQP',
    seat: 'T6',
    title: 'Service customer',
    door: 'People',
    phase: 'demand',
    minutes: 30,
    signUpAs: 'someone who needs a plumber, electrician or tutor',
    startWhen: 'Start after the owner says supply is live. Be online at the same time as T7.',
    pairWith: 'T7 Professional (live)',
    steps: [
      { to: '/auth?tab=signup', do: 'Sign up and confirm your email code.', expect: 'You land on the onboarding screen.' },
      { to: '/providers', do: 'Search by service and area.', expect: 'Cards show only true trust labels. No invented ratings.' },
      { to: '/providers', do: 'Open the professional\'s profile and ask for a quote.', expect: 'The request is sent.' },
      { to: '/request', do: 'Post a job with budget, location and date.', expect: 'It appears on your job page.' },
      { to: '/request', do: 'Receive the quote, try a counter-offer, then accept.', expect: 'Counter-offer works. Accepting locks the agreed amount and terms.' },
      { to: '/dashboard', do: 'Pay through DealMatch Protection with the sandbox test details.', expect: 'Same as the renter: transfer details, funded within a minute or two.' },
      { to: '/dashboard', do: 'Confirm the work is complete, or report a problem.', expect: 'Confirming moves the money toward release.' },
    ],
  },
  {
    code: 'T10-REWARDS-VKNU',
    seat: 'T10',
    title: 'Rewards and WhatsApp user',
    door: 'Both',
    phase: 'demand',
    minutes: 40,
    signUpAs: 'a regular user who invites friends and uses WhatsApp',
    startWhen: 'Start after the T1 renter has signed up, because you need their referral code.',
    pairWith: 'T1 Renter (referral code)',
    steps: [
      { to: '/auth?tab=signup', do: 'Sign up using the T1 renter\'s referral code.', expect: 'The code is saved on your account. T1 sees a referred user.' },
      { to: '/wallet', do: 'Look at loyalty points, redeem some, and spend an unlock credit on a contact.', expect: 'Balance and history agree. It can never go below zero.' },
      { to: '/wa/link', do: 'Link a WhatsApp number and send a request by WhatsApp.', expect: 'A reply arrives and the request shows in the app.' },
      { to: '/forum', do: 'Create a thread, reply, and report a post.', expect: 'They appear. The report reaches the owner.' },
      { to: '/matches', do: 'Swipe a few listings.', expect: 'Your matches are saved.' },
      { to: '/', do: 'Submit a story on the home page, then try a second one.', expect: 'First: "Thank you". Second: "You already have a testimonial".' },
    ],
  },

  // ───────────────────────── STRESS ─────────────────────────
  {
    code: 'T8-HOSTILE-H6FU',
    seat: 'T8',
    title: 'Hostile tester',
    door: 'Both',
    phase: 'stress',
    minutes: 60,
    signUpAs: 'a normal user, then try to misbehave',
    startWhen: 'Start after phase 2 has run, so there is real data to attack.',
    pairWith: 'Works alone',
    steps: [
      { to: '/auth?tab=signup', do: 'Sign up as an ordinary user.', expect: 'Normal signup.' },
      { to: '/dashboard', do: 'Open another user\'s transaction, dispute and job by guessing or copying their links.', expect: 'Denied every time.' },
      { to: '/admin', do: 'Visit /admin, /agent, /lender and /provider as a normal user.', expect: 'Redirected or denied.' },
      { to: '/places', do: 'In the browser console, ask for contact_phone and contact_email on properties.', expect: 'Permission denied.' },
      { to: '/request', do: 'Paste <script> tags and very long text into every text box (story, request, message, listing).', expect: 'Shown as plain text, never run. Length is capped.' },
      { to: '/dashboard', do: 'Double-click Pay, go Back mid-payment, refresh on the processing screen.', expect: 'One charge and one transaction only.' },
      { to: '/dashboard', do: 'Change the price in the browser before paying.', expect: 'The server uses its own amount.' },
      { to: '/places', do: 'Try to get a seller\'s number before paying.', expect: 'Not given.' },
      { to: '/auth?tab=signup', do: 'Sign up 5 times quickly with the same phone or device.', expect: 'Conflicts caught or rate limited.' },
      { to: '/list-rental', do: 'Upload an .exe renamed to .jpg.', expect: 'Refused.' },
      { to: '/', do: 'Try to submit a story with status "approved".', expect: 'Refused.' },
    ],
  },
  {
    code: 'T9-PHONE-CW3C',
    seat: 'T9',
    title: 'Low-end phone tester',
    door: 'Both',
    phase: 'stress',
    minutes: 30,
    signUpAs: 'a normal user on a cheap Android phone using mobile data (not Wi-Fi)',
    startWhen: 'Start after phase 2 has run.',
    pairWith: 'Works alone',
    steps: [
      { to: '/', do: 'Open the home page for the first time.', expect: 'It loads in under 5 seconds.' },
      { to: '/places', do: 'Open the filters.', expect: 'They open as a drawer that is easy to use.' },
      { to: '/list-rental', do: 'Upload a photo straight from the camera.', expect: 'It works.' },
      { to: '/dashboard', do: 'Open a payment screen with the keyboard up.', expect: 'The keyboard does not hide the pay button.' },
      { to: '/dashboard', do: 'Switch to another app in the middle of a payment, then come back.', expect: 'Nothing is lost.' },
      { to: '/', do: 'Scroll every page you visit.', expect: 'Text is readable and there is no sideways scrolling.' },
    ],
  },
]

export const normaliseCode = (value) => String(value || '').trim().toUpperCase()

export const findSeat = (value) => {
  const code = normaliseCode(value)
  return SEATS.find((seat) => seat.code === code) || null
}
