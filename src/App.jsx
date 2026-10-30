import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import React, { Suspense, Component, useEffect, useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { lazyWithRetry } from '@/lib/lazyLoad'
import { captureRenderError } from '@/lib/sentry'
import { motion, AnimatePresence, MotionConfig } from 'motion/react'
import { Home } from 'lucide-react'

import Navbar    from '@/components/layout/Navbar'
import MobileTabBar from '@/components/layout/MobileTabBar'
import IntentTracker from '@/components/routing/IntentTracker'
import Footer    from '@/components/layout/Footer'
import WhatsAppButton from '@/components/ui/WhatsAppButton'
import InstallPrompt  from '@/components/ui/InstallPrompt'
import MfaGate        from '@/components/Admin/MfaGate'
import ComingSoonPage from '@/pages/ComingSoonPage'

// ─── Route code-splitting ──────────────────────────────────────────────────────
const HomePage              = lazyWithRetry(() => import('@/pages/Home/HomePage'))
const AuthPage              = lazyWithRetry(() => import('@/pages/Auth/AuthPage'))
const OnboardingPage        = lazyWithRetry(() => import('@/pages/Onboarding/OnboardingPage'))
const VerifyIdentityPage    = lazyWithRetry(() => import('@/pages/PostVerification/VerifyIdentityPage'))
const WhatsAppLinkPage      = lazyWithRetry(() => import('@/pages/WhatsApp/WhatsAppLinkPage'))
const PayoutSetupPage       = lazyWithRetry(() => import('@/pages/Payouts/PayoutSetupPage'))
const DashboardPage         = lazyWithRetry(() => import('@/pages/Dashboard/DashboardPage'))
const BrowsePage            = lazyWithRetry(() => import('@/pages/Browse/BrowsePage'))
const MatchesPage           = lazyWithRetry(() => import('@/pages/Matches/MatchesPage'))
const PropertyPage          = lazyWithRetry(() => import('@/pages/Property/PropertyPage'))
// NOTE: the legacy ProfessionalsPage (Agents/Surveyors/Inspectors/Valuers browse,
// with the retired N25,000/month banner) was removed; /professionals redirects -
// see the /professionals redirect below. Property professionals now only
// ever appear as an Advanced filter inside /providers, never as their own
// default-set page. ApplyProfessionalPage stays routed: it's still the
// legitimate application form for that separate paid vertical, reachable
// directly and from the Marketplace "professionals" catalog category.
const ApplyProfessionalPage = lazyWithRetry(() => import('@/pages/Professionals/ApplyProfessionalPage'))
const LandlordDashboardPage = lazyWithRetry(() => import('@/pages/LandlordDashboard/LandlordDashboardPage'))
const ProfilePage           = lazyWithRetry(() => import('@/pages/Profile/ProfilePage'))
const AdminPage             = lazyWithRetry(() => import('@/pages/Admin/AdminPage'))
const AcceptStaffInvitePage = lazyWithRetry(() => import('@/pages/Admin/AcceptStaffInvitePage'))
const AdminLoginPage        = lazyWithRetry(() => import('@/pages/Admin/AdminLoginPage'))
const PaymentTestPage       = lazyWithRetry(() => import('@/pages/Admin/PaymentTestPage'))
const AuthCallback          = lazyWithRetry(() => import('@/pages/Auth/AuthCallback'))
const ResetPasswordPage     = lazyWithRetry(() => import('@/pages/Auth/ResetPasswordPage'))
const StudentHostelsPage    = lazyWithRetry(() => import('@/pages/StudentHostels/StudentHostelsPage'))
const ListHostelPage        = lazyWithRetry(() => import('@/pages/StudentHostels/ListHostelPage'))
const StudentVerifyPage     = lazyWithRetry(() => import('@/pages/StudentHostels/StudentVerifyPage'))
const RentalsPage           = lazyWithRetry(() => import('@/pages/Rentals/RentalsPage'))
const CategoryPage          = lazyWithRetry(() => import('@/pages/Category/CategoryPage'))
const HotelsPage            = lazyWithRetry(() => import('@/pages/Hotels/HotelsPage'))
const ListRentalPage        = lazyWithRetry(() => import('@/pages/Rentals/ListRentalPage'))
const EscrowPage            = lazyWithRetry(() => import('@/pages/Escrow/EscrowPage'))
const TenancyPage           = lazyWithRetry(() => import('@/pages/Tenancy/TenancyPage'))
const ListPropertyPage      = lazyWithRetry(() => import('@/pages/List/ListPropertyPage'))
const AvailabilityPage      = lazyWithRetry(() => import('@/pages/Availability/AvailabilityPage'))
const PrivacyPage           = lazyWithRetry(() => import('@/pages/Legal/PrivacyPage'))
const TermsPage             = lazyWithRetry(() => import('@/pages/Legal/TermsPage'))
const DeleteAccountPage     = lazyWithRetry(() => import('@/pages/Account/DeleteAccountPage'))
const ProtectionPage         = lazyWithRetry(() => import('@/pages/Trust/ProtectionPage'))
const HelpPage               = lazyWithRetry(() => import('@/pages/Trust/HelpPage'))
const RulesPage              = lazyWithRetry(() => import('@/pages/Trust/RulesPage'))
const ContactPage            = lazyWithRetry(() => import('@/pages/Trust/ContactPage'))
const AboutPage              = lazyWithRetry(() => import('@/pages/Trust/AboutPage'))
const TransactionDetailPage  = lazyWithRetry(() => import('@/pages/TransactionDetailPage'))
const DisputeNewPage         = lazyWithRetry(() => import('@/pages/DisputeNewPage'))
const DisputeCasePage        = lazyWithRetry(() => import('@/pages/DisputeCasePage'))
const ProviderWorkspacePage  = lazyWithRetry(() => import('@/pages/Provider/ProviderWorkspacePage'))
const MortgagePage          = lazyWithRetry(() => import('@/pages/Mortgage/MortgagePage'))
const VerificationPage      = lazyWithRetry(() => import('@/pages/Verification/VerificationPage'))
const MessagesPage          = lazyWithRetry(() => import('@/pages/Messages/MessagesPage'))
const LenderDashboardPage   = lazyWithRetry(() => import('@/pages/LenderDashboard/LenderDashboardPage'))
const AgentDashboardPage    = lazyWithRetry(() => import('@/pages/Agent/AgentDashboardPage'))
const ReferralPage          = lazyWithRetry(() => import('@/pages/Referral/ReferralPage'))
const ForumPage              = lazyWithRetry(() => import('@/pages/Forum/ForumPage'))
const MarketplacePage        = lazyWithRetry(() => import('@/pages/Marketplace/MarketplacePage'))
const SearchPage              = lazyWithRetry(() => import('@/pages/Search/SearchPage'))
const JobPostingPage         = lazyWithRetry(() => import('@/pages/Jobs/JobPostingPage'))
const FindProviderPage       = lazyWithRetry(() => import('@/pages/Provider/FindProviderPage'))
const ProviderProfilePage    = lazyWithRetry(() => import('@/pages/Provider/ProviderProfilePage'))
const WalletPage             = lazyWithRetry(() => import('@/pages/Wallet/WalletPage'))
const ManageListingsPage     = lazyWithRetry(() => import('@/pages/ManageListings/ManageListingsPage'))
const SkillVerificationPage  = lazyWithRetry(() => import('@/pages/Verification/SkillVerificationPage'))
const HowItWorksPage         = lazyWithRetry(() => import('@/pages/HowItWorks/HowItWorksPage'))

// ─── Error Boundary ────────────────────────────────────────────────────────────
class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, info) {
    captureRenderError(error, info?.componentStack)
    console.error('[DealMatch ErrorBoundary]', error, info)
  }
  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div style={{
        minHeight:'100vh', display:'flex', flexDirection:'column',
        alignItems:'center', justifyContent:'center',
        background:'#FFFAF5', padding:'24px', textAlign:'center', gap:'16px',
      }}>
        <div style={{ fontSize:56 }}><Home size={24} className="text-terracotta" /></div>
        <h1 style={{ fontWeight:900, fontSize:26, color:'#17211B', margin:0 }}>
          Something went wrong
        </h1>
        <p style={{ color:'#647068', fontSize:14, maxWidth:320, lineHeight:1.6, margin:0 }}>
          DealMatch hit an unexpected error. Our team has been notified. Please try refreshing or{' '}
          <a href="/" style={{ color:'#C85F2D', fontWeight:600 }}>return home</a>.
        </p>
        <button
          onClick={() => { this.setState({ hasError:false, error:null }); window.location.href = '/' }}
          style={{
            marginTop:8, padding:'12px 28px', borderRadius:100,
            backgroundColor:'#C85F2D', color:'#fff',
            fontWeight:700, fontSize:14, border:'none', cursor:'pointer',
          }}>
          Go home
        </button>
        {import.meta.env.DEV && this.state.error && (
          <pre style={{
            marginTop:16, background:'#fff3f0', border:'1px solid #f5c6bc',
            borderRadius:8, padding:'12px 16px', fontSize:11, color:'#c0392b',
            textAlign:'left', maxWidth:480, overflowX:'auto',
            whiteSpace:'pre-wrap', wordBreak:'break-word',
          }}>
            {this.state.error.toString()}{'\n\n'}{this.state.error.stack}
          </pre>
        )}
      </div>
    )
  }
}

// ─── Full-screen loader (auth init only) ──────────────────────────────────────
const LoadingScreen = () => (
  <div style={{
    minHeight:'100vh', display:'flex', flexDirection:'column',
    alignItems:'center', justifyContent:'center',
    background:'linear-gradient(145deg,#0f0f0f 0%,#17211B 50%,#0f0f0f 100%)',
    position:'relative', overflow:'hidden',
  }}>
    <style>{`
      @keyframes dm-spin{to{transform:rotate(360deg)}}
      @keyframes dm-pulse-ring{0%{transform:scale(0.8);opacity:0.8}100%{transform:scale(1.6);opacity:0}}
      @keyframes dm-fade-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      @keyframes dm-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
      @keyframes dm-float{0%,100%{transform:translateY(0);opacity:0.3}50%{transform:translateY(-8px);opacity:1}}
      @keyframes dm-glow{0%,100%{opacity:0.15}50%{opacity:0.35}}
      @keyframes dm-logo-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}
      .dm-logo{font-family:'DM Sans',sans-serif;font-size:28px;font-weight:700;background:linear-gradient(90deg,#c9a96e,#f0d4a0,#c9a96e);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:dm-shimmer 2.5s linear infinite,dm-fade-up 0.6s ease forwards}
      .dm-sub{font-family:'DM Sans',sans-serif;font-size:12px;color:rgba(255,255,255,0.35);letter-spacing:2.5px;text-transform:uppercase;animation:dm-fade-up 0.6s ease 0.2s both}
      .dm-tag{font-family:'DM Sans',sans-serif;font-size:11px;color:rgba(200,95,45,0.7);letter-spacing:1px;animation:dm-fade-up 0.6s ease 0.35s both}
      .dm-ring{width:64px;height:64px;border-radius:50%;border:2px solid rgba(201,169,110,0.15);border-top:2px solid #c9a96e;animation:dm-spin 1s cubic-bezier(0.4,0,0.2,1) infinite}
      .dm-pulse{position:absolute;width:64px;height:64px;border-radius:50%;border:1px solid rgba(201,169,110,0.5);animation:dm-pulse-ring 1.5s ease-out infinite}
      .dm-dot{width:5px;height:5px;border-radius:50%;background:#c9a96e}
      .dm-dot:nth-child(1){animation:dm-float 1.4s ease-in-out 0s infinite}
      .dm-dot:nth-child(2){animation:dm-float 1.4s ease-in-out 0.2s infinite}
      .dm-dot:nth-child(3){animation:dm-float 1.4s ease-in-out 0.4s infinite}
      .dm-glow{position:absolute;border-radius:50%;filter:blur(80px);animation:dm-glow 3s ease-in-out infinite;pointer-events:none}
      .dm-logo-mark{width:34px;height:auto;position:absolute;animation:dm-logo-breathe 1.8s ease-in-out infinite,dm-fade-up 0.5s ease 0.3s both}
    `}</style>
    <div className="dm-glow" style={{ width:300,height:300,background:'#c9a96e',top:'-80px',right:'-80px' }} />
    <div className="dm-glow" style={{ width:250,height:250,background:'#7A9E7E',bottom:'-60px',left:'-60px',animationDelay:'1.5s' }} />
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:28,zIndex:1 }}>
      <div style={{ position:'relative',display:'flex',alignItems:'center',justifyContent:'center' }}>
        <div className="dm-pulse" /><div className="dm-ring" />
        <img src="/brand/dealmatch-icon-transparent.png" alt="" className="dm-logo-mark" />
      </div>
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:6 }}>
        <span className="dm-logo">DealMatch</span>
        <span className="dm-sub">Nigerian Marketplace Matching Platform</span>
        <span className="dm-tag">Every match is a connection</span>
      </div>
      <div style={{ display:'flex',gap:6 }}>
        <div className="dm-dot" /><div className="dm-dot" /><div className="dm-dot" />
      </div>
    </div>
  </div>
)

// ─── Lightweight page skeleton (shown during route transitions) ────────────────
const PageSkeleton = () => (
  <div style={{
    minHeight:'60vh', display:'flex', alignItems:'center',
    justifyContent:'center', background:'#FFFAF5',
  }}>
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
      <div style={{ position:'relative', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{
          position:'absolute', width:44, height:44, borderRadius:'50%',
          border:'2.5px solid #DEDDD6', borderTopColor:'#C85F2D',
          animation:'dm-spin 0.8s linear infinite',
        }} />
        <img src="/brand/dealmatch-icon-transparent.png" alt="" style={{ width:22, height:'auto', animation:'dm-skel-breathe 1.6s ease-in-out infinite' }} />
      </div>
      <style>{`
        @keyframes dm-spin{to{transform:rotate(360deg)}}
        @keyframes dm-skel-breathe{0%,100%{opacity:0.7;transform:scale(1)}50%{opacity:1;transform:scale(1.1)}}
      `}</style>
      <p style={{ fontSize:13, color:'#647068', fontWeight:500 }}>Loading…</p>
    </div>
  </div>
)

// ─── Animated page wrapper ────────────────────────────────────────────────────
const PageTransition = ({ children }) => (
  <motion.div
    initial={{ opacity:0, y:8 }}
    animate={{ opacity:1, y:0 }}
    exit={{ opacity:0, y:-8 }}
    transition={{ duration:0.18, ease:'easeOut' }}
  >
    {children}
  </motion.div>
)

// ─── Route guards ─────────────────────────────────────────────────────────────
// NOTE: these use PageSkeleton (small spinner), not LoadingScreen (the
// full-screen animated dark splash) -- loading here fires on EVERY
// navigation to a protected/admin/public-only route while AuthContext
// re-checks the session, which can be near-instant on a warm session.
// LoadingScreen showing here made ordinary navigation (e.g. opening
// /dashboard) feel like a slow, theatrical cold-boot every time. It's
// still used for the initial Suspense fallback on route chunks that
// haven't loaded yet at all (first visit to a given page), and for the
// admin-only areas below, where a heavier themed loader is less
// disruptive on a low-traffic, staff-only surface.
const ProtectedRoute = ({ children, requireOnboarding = true }) => {
  const { isAuthenticated, hasCompletedOnboarding, loading } = useAuth()
  if (loading) return <PageSkeleton />
  if (!isAuthenticated) return <Navigate to="/auth" replace />
  if (requireOnboarding && !hasCompletedOnboarding) return <Navigate to="/onboarding" replace />
  return children
}

const ADMIN_ALLOWED_EMAILS = ['divineandbassey@gmail.com', 'prosperwithbassey@gmail.com']
const AdminRoute = ({ children }) => {
  const { user, profile, loading } = useAuth()
  if (loading) return <PageSkeleton />
  // Don't reveal that an admin area exists to an unauthenticated visitor -
  // bounce home instead of to a discoverable /admin-login. Staff use the
  // obscure entry path directly (see /staff-gate-7f3k below).
  if (!user) return <Navigate to="/" replace />
  const isAdmin = ADMIN_ALLOWED_EMAILS.includes(user.email) || ['admin','superadmin','agent','verifier'].includes(profile?.role)
  if (!isAdmin) return <Navigate to="/" replace />
  // Every path that reaches this point is a staff or admin account -
  // gate all of them behind a second factor, enrolling on first arrival
  // if none exists yet. Ordinary users never render this component at all.
  return <MfaGate>{children}</MfaGate>
}

const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, hasCompletedOnboarding, loading } = useAuth()
  if (loading) return <PageSkeleton />
  if (isAuthenticated) return <Navigate to={hasCompletedOnboarding ? '/browse' : '/onboarding'} replace />
  return children
}

// ─── App shell ────────────────────────────────────────────────────────────────
const AppShell = ({ children, showNav=true, showFooter=true, showWhatsApp=true, showTabBar=true }) => (
  <div className="min-h-screen flex flex-col">
    {showNav && <Navbar />}
    <main className="flex-1 pb-16 md:pb-0">{children}</main>
    {showFooter && <Footer />}
    {showWhatsApp && <WhatsAppButton />}
    <InstallPrompt />
    {showTabBar && <MobileTabBar />}
  </div>
)

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
                <h1 className="font-display text-3xl font-black" style={{ color:'#17211B' }}>Page not found</h1>
                <p className="text-sm" style={{ color:'#647068' }}>Every match is a connection</p>
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
                error:   { iconTheme:{ primary:'#C85F2D', secondary:'#F7F4ED' } },
              }}
            />
            <WaLinkResume />
            <AnimatedRoutes />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
      </MotionConfig>
    </ErrorBoundary>
  )
}
