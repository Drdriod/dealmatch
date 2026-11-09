import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import React, { Suspense, useEffect } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { ConfirmProvider } from '@/components/ui/ConfirmDialog'
import A11yEffects from '@/components/ui/A11yEffects'


import { motion, AnimatePresence, MotionConfig } from 'motion/react'
import { Home } from 'lucide-react'

import IntentTracker from '@/components/routing/IntentTracker'
import ComingSoonPage from '@/pages/ComingSoonPage'
import { isTestMode } from '@/lib/testMode'

// Page components, error boundary, loaders, guards and the app shell live in src/routes/.
import { HomePage, AuthPage, OnboardingPage, VerifyIdentityPage, WhatsAppLinkPage, TestSeatPage, TestFeedPage, PayoutSetupPage, DashboardPage, BrowsePage, MatchesPage, PropertyPage, ApplyProfessionalPage, LandlordDashboardPage, ProfilePage, AdminPage, AcceptStaffInvitePage, AdminLoginPage, PaymentTestPage, AuthCallback, ResetPasswordPage, StudentHostelsPage, ListHostelPage, StudentVerifyPage, RentalsPage, CategoryPage, HotelsPage, ListRentalPage, EscrowPage, TenancyPage, ListPropertyPage, AvailabilityPage, PrivacyPage, TermsPage, DeleteAccountPage, ProtectionPage, HelpPage, RulesPage, ContactPage, AboutPage, TransactionDetailPage, DisputeNewPage, DisputeCasePage, ProviderWorkspacePage, MortgagePage, VerificationPage, MessagesPage, LenderDashboardPage, AgentDashboardPage, ReferralPage, ForumPage, MarketplacePage, SearchPage, JobPostingPage, FindProviderPage, ProviderProfilePage, WalletPage, ManageListingsPage, SkillVerificationPage, HowItWorksPage } from '@/routes/lazyPages'
import { ErrorBoundary, LoadingScreen, PageSkeleton, PageTransition, AppShell } from '@/routes/shell'
import { ProtectedRoute, AdminRoute, PublicOnlyRoute } from '@/routes/guards'

// ─── Animated routes ──────────────────────────────────────────────────────────
function AnimatedRoutes() {
  const location = useLocation()

  // Scroll to top on every route change
  useEffect(() => { window.scrollTo(0, 0) }, [location.pathname])

  return (
    <>
    <IntentTracker />
    <AnimatePresence mode="wait" initial={false}>
      <Routes location={location} key={location.pathname}>

        {/* ── Public ─────────────────────────────────── */}
        <Route path="/" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><HomePage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        {/* Legacy Provider-mimicking page (Agents/Surveyors/Inspectors/
            Valuers as the default set, N25,000/month banner) is retired
            per the engineering brief: property professionals are now only
            ever an Advanced filter inside /providers, never their own
            default page. Redirect instead of 404ing anything already
            linking here. */}
        <Route path="/professionals" element={<Navigate to="/providers" replace />} />

        <Route path="/marketplace/*" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><MarketplacePage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/forum/*" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><ForumPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/escrow" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><EscrowPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/tenancy" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><TenancyPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/mortgage" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition>
                <ComingSoonPage
                  title="Mortgages - Coming Soon"
                  message="We're researching the right mortgage partners for the Nigerian market before launching this feature properly."
                  icon={Home}
                />
              </PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/privacy" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><PrivacyPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/delete-account" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><DeleteAccountPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/terms" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><TermsPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        {/* ── Places (spec: Shortlet + House Rent, one door) ──────
            Canonical route is /places. /rentals kept alive for existing
            links/bookmarks; /properties is the dead route the audit found
            on the live homepage, now redirected instead of 404ing. */}
        <Route path="/category/:slug" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><CategoryPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />
        <Route path="/places" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><RentalsPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />
        <Route path="/rentals" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><RentalsPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />
        <Route path="/properties" element={<Navigate to="/places" replace />} />

        {/* ── Universal search (item 4/7-a of the fix request): federates
            category_listings (every people+places service) + properties +
            student_hostels + professionals via universal_search(), plus
            AI/location matching for category_listings. Replaces
            HeroSearch's old client-side "guess places vs providers"
            routing. ─────────────────────────────────────────────────── */}
        <Route path="/search" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><SearchPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/hotels" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><HotelsPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/list-rental" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><ListRentalPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        {/* ── How it works (spec: no dead footer links) ───────── */}
        <Route path="/how-it-works" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><HowItWorksPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        {/* ── Auth aliases (spec: /login, /signup must not 404) ── */}
        <Route path="/login"  element={<Navigate to="/auth" replace />} />
        <Route path="/signup" element={<Navigate to="/auth?tab=signup" replace />} />

        {/* ── Required post-signup path chooser (spec) ─────────
            Reuses the existing onboarding flow, which already implements
            this exact branching (Find a Place / Find a Provider / List a
            Place / Offer a Skill) as of the last onboarding rebuild. */}
        <Route path="/start" element={<Navigate to="/onboarding" replace />} />

        {/* ── Skilled People (spec: artisans/tutors/daily services,
            not the legacy ₦25k/mo surveyors product). /providers is now
            the primary door; /find-provider kept as an alias so nothing
            that already links there breaks. Property professionals now
            show up only inside /providers' own Advanced filter (see
            /professionals redirect above) - never as their own page,
            the homepage, or main nav. ─────────────────────────────── */}
        <Route path="/providers" element={
          <AppShell showFooter={false}>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><FindProviderPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        {/* Individual provider profile - this link target already existed
            (FindProviderPage's own "View" CTA, and now PersonCard, both
            navigate to /provider/:id), the page already existed fully
            built, but no route ever registered it, so it 404'd. */}
        <Route path="/provider/:id" element={
          <AppShell showFooter={false}>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><ProviderProfilePage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        {/* ── Post a Request (spec: "I need X" intent request) ── */}
        <Route path="/request" element={
          <AppShell showFooter={false}>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><JobPostingPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />
        <Route path="/jobs" element={<Navigate to="/request" replace />} />

        {/* ── Student Hostels ─────────────────────────── */}
        <Route path="/student-hostels" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><StudentHostelsPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/student-verify" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showFooter={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><StudentVerifyPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        <Route path="/list-hostel" element={
          <ProtectedRoute>
            <AppShell showFooter={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><ListHostelPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        <Route path="/property/:id" element={
          <AppShell showFooter={false}>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><PropertyPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        {/* ── Public discovery: guest browsing (spec 6.1) ─────
            Browse/Find Provider/Post-a-Job are all reachable without an
            account -- RLS already permits anonymous reads of active
            listings (the Home page's public discovery rail relies on the
            same thing), and each of these pages gates the *action* (book,
            request, post) behind GuestAuthModal's lightweight phone-OTP
            instead of a hard redirect to the full /auth signup.
            NOTE: /browse is the older "buy a home" AI-swipe experience -
            it predates the two-door spec (Places = rent/shortlet only)
            and is no longer the target of the homepage's "Find a Place"
            button. Left in place and reachable directly since it's a real,
            working feature; just no longer the primary door. Flag for a
            product decision on where it should live long-term. */}
        <Route path="/browse" element={
          <AppShell showFooter={false}>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><BrowsePage /></PageTransition>
            </Suspense>
          </AppShell>
        } />
        <Route path="/find-place" element={<Navigate to="/places" replace />} />

        <Route path="/find-provider" element={<Navigate to="/providers" replace />} />

        <Route path="/post-job" element={<Navigate to="/request" replace />} />

        <Route path="/jobs/:id" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showFooter={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><JobPostingPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        <Route path="/verify-skill" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showFooter={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><SkillVerificationPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        <Route path="/wallet" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showFooter={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><WalletPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        <Route path="/manage-listings" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showFooter={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><ManageListingsPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        {/* ── Trust and help (public) ───────────────── */}
        <Route path="/protection" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><ProtectionPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/help" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><HelpPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/rules" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><RulesPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/contact" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><ContactPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/about" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><AboutPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        {/* ── Protected transactions, disputes, provider workspace (signed in) ── */}
        <Route path="/transactions/:ref" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showFooter={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><TransactionDetailPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        <Route path="/disputes/new" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showFooter={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><DisputeNewPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        <Route path="/disputes/:id" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showFooter={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><DisputeCasePage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        <Route path="/provider" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showFooter={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><ProviderWorkspacePage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        {/* ── Auth ──────────────────────────────────── */}
        <Route path="/auth" element={
          <PublicOnlyRoute>
            <AppShell showNav={false} showFooter={false} showWhatsApp={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><AuthPage /></PageTransition>
              </Suspense>
            </AppShell>
          </PublicOnlyRoute>
        } />

        <Route path="/auth/callback" element={
          <Suspense fallback={<PageSkeleton />}>
            <PageTransition><AuthCallback /></PageTransition>
          </Suspense>
        } />

        <Route path="/auth/reset-password" element={
          <AppShell showNav={false} showFooter={false} showWhatsApp={false}>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><ResetPasswordPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        <Route path="/auth/reset" element={
          <AppShell showNav={false} showFooter={false} showWhatsApp={false}>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><ResetPasswordPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        {/* ── Onboarding + Verify ─────────────────────── */}
        <Route path="/onboarding" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showNav={false} showFooter={false} showWhatsApp={false} showTabBar={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><OnboardingPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        <Route path="/verify-identity" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showNav={false} showFooter={false} showWhatsApp={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><VerifyIdentityPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        {/* ── WhatsApp account linking (link sent by the DealMatch WhatsApp bot) ──
            Public on purpose: the page handles signed-out visitors itself and
            keeps the single-use token across sign-in / sign-up. */}
        <Route path="/wa/link" element={
          <AppShell showNav={false} showFooter={false} showWhatsApp={false}>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><WhatsAppLinkPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

        {/* ── Tester run (Preview + staging only): personal codes take each tester straight to their tasks ── */}
        {isTestMode && (
          <Route path="/t/feed" element={
            <AppShell showFooter={false} showWhatsApp={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><TestFeedPage /></PageTransition>
              </Suspense>
            </AppShell>
          } />
        )}
        {isTestMode && ['/t', '/t/:code'].map((path) => (
          <Route key={path} path={path} element={
            <AppShell showFooter={false} showWhatsApp={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><TestSeatPage /></PageTransition>
              </Suspense>
            </AppShell>
          } />
        ))}

        <Route path="/payout-setup" element={
          <ProtectedRoute requireOnboarding={false}>
            <AppShell showNav={false} showFooter={false} showWhatsApp={false}>
              <Suspense fallback={<PageSkeleton />}>
                <PageTransition><PayoutSetupPage /></PageTransition>
              </Suspense>
            </AppShell>
          </ProtectedRoute>
        } />

        {/* ── Protected ─────────────────────────────── */}
        {[
          ['/matches',      MatchesPage,             { showFooter:false }],
          ['/messages',     MessagesPage,            { showFooter:false }],
          ['/dashboard',    DashboardPage,           { showFooter:false }],
          ['/landlord',     LandlordDashboardPage,   { showFooter:false }],
          ['/lender',       LenderDashboardPage,     { showFooter:false }],
          ['/list',         ListPropertyPage,        { showFooter:false }],
          ['/profile',      ProfilePage,             {}],
          ['/availability', AvailabilityPage,        {}],
          ['/verify',       VerificationPage,        { showFooter:false }],
          ['/referrals',    ReferralPage,            {}],
          ['/referral',     ReferralPage,            {}],
          ['/apply-professional', ApplyProfessionalPage, {}],
        ].map(([path, Page, shellProps]) => (
          <Route key={path} path={path} element={
            <ProtectedRoute>
              <AppShell {...shellProps}>
                <Suspense fallback={<PageSkeleton />}>
                  <PageTransition><Page /></PageTransition>
                </Suspense>
              </AppShell>
            </ProtectedRoute>
          } />
        ))}

        {/* ── Admin ─────────────────────────────────── */}
        {/* Obscure, unguessable entry path (spec: "hard-to-guess path").
            Bookmark this - it's the only way in now. The old, guessable
            /admin-login redirects home instead of revealing anything. */}
        <Route path="/staff-gate-7f3k" element={
          <Suspense fallback={<LoadingScreen />}>
            <PageTransition><AdminLoginPage /></PageTransition>
          </Suspense>
        } />
        <Route path="/admin-login" element={<Navigate to="/" replace />} />

        <Route path="/staff/accept-invite" element={
          <Suspense fallback={<LoadingScreen />}>
            <PageTransition><AcceptStaffInvitePage /></PageTransition>
          </Suspense>
        } />

        <Route path="/admin/payment-test" element={
          <AdminRoute>
            <Suspense fallback={<LoadingScreen />}>
              <PageTransition><PaymentTestPage /></PageTransition>
            </Suspense>
          </AdminRoute>
        } />

        <Route path="/admin/*" element={
          <AdminRoute>
            <Suspense fallback={<LoadingScreen />}>
              <PageTransition><AdminPage /></PageTransition>
            </Suspense>
          </AdminRoute>
        } />

        <Route path="/agent" element={
          <AdminRoute>
            <Suspense fallback={<LoadingScreen />}>
              <PageTransition><AgentDashboardPage /></PageTransition>
            </Suspense>
          </AdminRoute>
        } />

        {/* ── 404 ─────────────────────────────────── */}
        <Route path="*" element={
          <AppShell>
            <PageTransition>
              <div className="min-h-screen flex items-center justify-center flex-col gap-5 pt-20">
                <div className="text-6xl"><Home size={24} className="text-terracotta" /></div>
                <h1 className="font-display text-3xl font-black" style={{ color:'var(--dm-deep)' }}>Page not found</h1>
                <p className="text-sm" style={{ color:'var(--dm-warm)' }}>Every match is a connection</p>
                <a href="/" className="btn-primary text-sm px-6 py-3">Go home</a>
              </div>
            </PageTransition>
          </AppShell>
        } />

      </Routes>
    </AnimatePresence>
    </>
  )
}

// ─── WhatsApp link resume ─────────────────────────────────────────────────────
// The "Verify on DealMatch" link from WhatsApp carries a single-use token that
// WhatsAppLinkPage parks in localStorage while the person signs in or signs up
// (AuthPage and onboarding do not know about it). Once they are signed in and
// onboarded, bring them back to finish linking. Renders nothing.
const WaLinkResume = () => {
  const { isAuthenticated, hasCompletedOnboarding, loading } = useAuth()
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    if (loading || !isAuthenticated || !hasCompletedOnboarding) return
    if (location.pathname.startsWith('/wa/link')) return
    try {
      const v = JSON.parse(localStorage.getItem('dm_wa_link_token') || 'null')
      if (v?.t && v.exp > Date.now()) navigate('/wa/link', { replace: true })
      else if (v) localStorage.removeItem('dm_wa_link_token')
    } catch { /* storage unavailable */ }
  }, [loading, isAuthenticated, hasCompletedOnboarding, location.pathname, navigate])
  return null
}

// ─── Root ─────────────────────────────────────────────────────────────────────
const basename = import.meta.env.BASE_URL

export default function App() {
  return (
    <ErrorBoundary>
      {/* One app-wide motion setting: honours the OS "reduce motion" preference
          by switching transform animations off, so every page respects it. */}
      <MotionConfig reducedMotion="user">
      <BrowserRouter basename={basename}>
        <ThemeProvider>
          <AuthProvider>
            <Toaster
              position="bottom-center"
              toastOptions={{
                style:{
                  background:'#17211B', color:'#F7F4ED',
                  borderRadius:'16px', padding:'14px 18px', maxWidth:'440px',
                  boxShadow:'0 18px 40px -12px rgba(23,33,27,0.45)',
                  fontSize:'14px', lineHeight:'1.45', fontFamily:"'DM Sans',sans-serif", fontWeight:'500',
                },
                success: { iconTheme:{ primary:'#7A9E7E', secondary:'#F7F4ED' } },
                error:   { iconTheme:{ primary:'#B8511E', secondary:'#F7F4ED' } },
              }}
            />
            <ConfirmProvider>
              <A11yEffects />
              <WaLinkResume />
              <AnimatedRoutes />
            </ConfirmProvider>
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  )
}
