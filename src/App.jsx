import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import React, { Suspense, Component, useEffect, useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import { AuthProvider, useAuth } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { lazyWithRetry } from '@/lib/lazyLoad'
import { motion, AnimatePresence } from 'framer-motion'
import { Home } from 'lucide-react'

import Navbar    from '@/components/layout/Navbar'
import MobileTabBar from '@/components/layout/MobileTabBar'
import Footer    from '@/components/layout/Footer'
import WhatsAppButton from '@/components/ui/WhatsAppButton'
import InstallPrompt  from '@/components/ui/InstallPrompt'
import ComingSoonPage from '@/pages/ComingSoonPage'

// ─── Route code-splitting ──────────────────────────────────────────────────────
const HomePage              = lazyWithRetry(() => import('@/pages/Home/HomePage'))
const AuthPage              = lazyWithRetry(() => import('@/pages/Auth/AuthPage'))
const OnboardingPage        = lazyWithRetry(() => import('@/pages/Onboarding/OnboardingPage'))
const VerifyIdentityPage    = lazyWithRetry(() => import('@/pages/PostVerification/VerifyIdentityPage'))
const DashboardPage         = lazyWithRetry(() => import('@/pages/Dashboard/DashboardPage'))
const BrowsePage            = lazyWithRetry(() => import('@/pages/Browse/BrowsePage'))
const MatchesPage           = lazyWithRetry(() => import('@/pages/Matches/MatchesPage'))
const PropertyPage          = lazyWithRetry(() => import('@/pages/Property/PropertyPage'))
const ProfessionalsPage     = lazyWithRetry(() => import('@/pages/Professionals/ProfessionalsPage'))
const ApplyProfessionalPage = lazyWithRetry(() => import('@/pages/Professionals/ApplyProfessionalPage'))
const LandlordDashboardPage = lazyWithRetry(() => import('@/pages/LandlordDashboard/LandlordDashboardPage'))
const ProfilePage           = lazyWithRetry(() => import('@/pages/Profile/ProfilePage'))
const AdminPage             = lazyWithRetry(() => import('@/pages/Admin/AdminPage'))
const AdminLoginPage        = lazyWithRetry(() => import('@/pages/Admin/AdminLoginPage'))
const AuthCallback          = lazyWithRetry(() => import('@/pages/Auth/AuthCallback'))
const ResetPasswordPage     = lazyWithRetry(() => import('@/pages/Auth/ResetPasswordPage'))
const StudentHostelsPage    = lazyWithRetry(() => import('@/pages/StudentHostels/StudentHostelsPage'))
const ListHostelPage        = lazyWithRetry(() => import('@/pages/StudentHostels/ListHostelPage'))
const StudentVerifyPage     = lazyWithRetry(() => import('@/pages/StudentHostels/StudentVerifyPage'))
const RentalsPage           = lazyWithRetry(() => import('@/pages/Rentals/RentalsPage'))
const HotelsPage            = lazyWithRetry(() => import('@/pages/Hotels/HotelsPage'))
const ListRentalPage        = lazyWithRetry(() => import('@/pages/Rentals/ListRentalPage'))
const EscrowPage            = lazyWithRetry(() => import('@/pages/Escrow/EscrowPage'))
const TenancyPage           = lazyWithRetry(() => import('@/pages/Tenancy/TenancyPage'))
const ListPropertyPage      = lazyWithRetry(() => import('@/pages/List/ListPropertyPage'))
const AvailabilityPage      = lazyWithRetry(() => import('@/pages/Availability/AvailabilityPage'))
const PrivacyPage           = lazyWithRetry(() => import('@/pages/Legal/PrivacyPage'))
const TermsPage             = lazyWithRetry(() => import('@/pages/Legal/TermsPage'))
const MortgagePage          = lazyWithRetry(() => import('@/pages/Mortgage/MortgagePage'))
const VerificationPage      = lazyWithRetry(() => import('@/pages/Verification/VerificationPage'))
const MessagesPage          = lazyWithRetry(() => import('@/pages/Messages/MessagesPage'))
const LenderDashboardPage   = lazyWithRetry(() => import('@/pages/LenderDashboard/LenderDashboardPage'))
const AgentDashboardPage    = lazyWithRetry(() => import('@/pages/Agent/AgentDashboardPage'))
const ReferralPage          = lazyWithRetry(() => import('@/pages/Referral/ReferralPage'))
const ForumPage              = lazyWithRetry(() => import('@/pages/Forum/ForumPage'))
const MarketplacePage        = lazyWithRetry(() => import('@/pages/Marketplace/MarketplacePage'))

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
    try {
      window.__sentry_capture?.('render_error', {
        message:        error?.message,
        stack:          error?.stack?.substring(0, 500),
        componentStack: info?.componentStack?.substring(0, 500),
      })
    } catch { /* Sentry not initialised */ }
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
        <h1 style={{ fontWeight:900, fontSize:26, color:'#1A1210', margin:0 }}>
          Something went wrong
        </h1>
        <p style={{ color:'#8A7E78', fontSize:14, maxWidth:320, lineHeight:1.6, margin:0 }}>
          DealMatch hit an unexpected error. Our team has been notified. Please try refreshing or{' '}
          <a href="/" style={{ color:'#C96A3A', fontWeight:600 }}>return home</a>.
        </p>
        <button
          onClick={() => { this.setState({ hasError:false, error:null }); window.location.href = '/' }}
          style={{
            marginTop:8, padding:'12px 28px', borderRadius:100,
            backgroundColor:'#C96A3A', color:'#fff',
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
    background:'linear-gradient(145deg,#0f0f0f 0%,#1a1210 50%,#0f0f0f 100%)',
    position:'relative', overflow:'hidden',
  }}>
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&display=swap');
      @keyframes dm-spin{to{transform:rotate(360deg)}}
      @keyframes dm-pulse-ring{0%{transform:scale(0.8);opacity:0.8}100%{transform:scale(1.6);opacity:0}}
      @keyframes dm-fade-up{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
      @keyframes dm-shimmer{0%{background-position:-200% center}100%{background-position:200% center}}
      @keyframes dm-float{0%,100%{transform:translateY(0);opacity:0.3}50%{transform:translateY(-8px);opacity:1}}
      @keyframes dm-glow{0%,100%{opacity:0.15}50%{opacity:0.35}}
      .dm-logo{font-family:'DM Sans',sans-serif;font-size:28px;font-weight:700;background:linear-gradient(90deg,#c9a96e,#f0d4a0,#c9a96e);background-size:200% auto;-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:dm-shimmer 2.5s linear infinite,dm-fade-up 0.6s ease forwards}
      .dm-sub{font-family:'DM Sans',sans-serif;font-size:12px;color:rgba(255,255,255,0.35);letter-spacing:2.5px;text-transform:uppercase;animation:dm-fade-up 0.6s ease 0.2s both}
      .dm-tag{font-family:'DM Sans',sans-serif;font-size:11px;color:rgba(201,106,58,0.7);letter-spacing:1px;animation:dm-fade-up 0.6s ease 0.35s both}
      .dm-ring{width:52px;height:52px;border-radius:50%;border:2px solid rgba(201,169,110,0.15);border-top:2px solid #c9a96e;animation:dm-spin 1s cubic-bezier(0.4,0,0.2,1) infinite}
      .dm-pulse{position:absolute;width:52px;height:52px;border-radius:50%;border:1px solid rgba(201,169,110,0.5);animation:dm-pulse-ring 1.5s ease-out infinite}
      .dm-dot{width:5px;height:5px;border-radius:50%;background:#c9a96e}
      .dm-dot:nth-child(1){animation:dm-float 1.4s ease-in-out 0s infinite}
      .dm-dot:nth-child(2){animation:dm-float 1.4s ease-in-out 0.2s infinite}
      .dm-dot:nth-child(3){animation:dm-float 1.4s ease-in-out 0.4s infinite}
      .dm-glow{position:absolute;border-radius:50%;filter:blur(80px);animation:dm-glow 3s ease-in-out infinite;pointer-events:none}
    `}</style>
    <div className="dm-glow" style={{ width:300,height:300,background:'#c9a96e',top:'-80px',right:'-80px' }} />
    <div className="dm-glow" style={{ width:250,height:250,background:'#7A9E7E',bottom:'-60px',left:'-60px',animationDelay:'1.5s' }} />
    <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:28,zIndex:1 }}>
      <div style={{ position:'relative',display:'flex',alignItems:'center',justifyContent:'center' }}>
        <div className="dm-pulse" /><div className="dm-ring" />
        <div style={{ position:'absolute',fontSize:18,animation:'dm-fade-up 0.5s ease 0.3s both' }}><Home size={24} className="text-terracotta" /></div>
      </div>
      <div style={{ display:'flex',flexDirection:'column',alignItems:'center',gap:6 }}>
        <span className="dm-logo">DealMatch</span>
        <span className="dm-sub">Nigeria's Property Platform</span>
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
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:16 }}>
      <div style={{
        width:36, height:36, borderRadius:'50%',
        border:'2.5px solid #E8DDD2',
        borderTopColor:'#C96A3A',
        animation:'dm-spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes dm-spin{to{transform:rotate(360deg)}}`}</style>
      <p style={{ fontSize:13, color:'#8A7E78', fontWeight:500 }}>Loading…</p>
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
const ProtectedRoute = ({ children, requireOnboarding = true }) => {
  const { isAuthenticated, hasCompletedOnboarding, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!isAuthenticated) return <Navigate to="/auth" replace />
  if (requireOnboarding && !hasCompletedOnboarding) return <Navigate to="/onboarding" replace />
  return children
}

const ADMIN_ALLOWED_EMAILS = ['divineandbassey@gmail.com', 'prosperwithbassey@gmail.com']
const AdminRoute = ({ children }) => {
  const { user, profile, loading } = useAuth()
  if (loading) return <LoadingScreen />
  if (!user) return <Navigate to="/admin-login" replace />
  const isAdmin = ADMIN_ALLOWED_EMAILS.includes(user.email) || ['admin','agent','verifier'].includes(profile?.role)
  if (!isAdmin) return <Navigate to="/" replace />
  return children
}

const PublicOnlyRoute = ({ children }) => {
  const { isAuthenticated, hasCompletedOnboarding, loading } = useAuth()
  if (loading) return <LoadingScreen />
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

        <Route path="/professionals" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><ProfessionalsPage /></PageTransition>
            </Suspense>
          </AppShell>
        } />

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

        <Route path="/terms" element={
          <AppShell>
            <Suspense fallback={<PageSkeleton />}>
              <PageTransition><TermsPage /></PageTransition>
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
            <AuthCallback />
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
            <AppShell showNav={false} showFooter={false} showWhatsApp={false}>
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

        {/* ── Protected ─────────────────────────────── */}
        {[
          ['/browse',       BrowsePage,             { showFooter:false }],
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
        <Route path="/admin-login" element={
          <Suspense fallback={<LoadingScreen />}>
            <AdminLoginPage />
          </Suspense>
        } />

        <Route path="/admin/*" element={
          <AdminRoute>
            <Suspense fallback={<LoadingScreen />}>
              <AdminPage />
            </Suspense>
          </AdminRoute>
        } />

        <Route path="/agent" element={
          <AdminRoute>
            <Suspense fallback={<LoadingScreen />}>
              <AgentDashboardPage />
            </Suspense>
          </AdminRoute>
        } />

        {/* ── 404 ─────────────────────────────────── */}
        <Route path="*" element={
          <AppShell>
            <PageTransition>
              <div className="min-h-screen flex items-center justify-center flex-col gap-5 pt-20">
                <div className="text-6xl"><Home size={24} className="text-terracotta" /></div>
                <h1 className="font-display text-3xl font-black" style={{ color:'#1A1210' }}>Page not found</h1>
                <p className="text-sm" style={{ color:'#8A7E78' }}>Every match is a connection</p>
                <a href="/" className="btn-primary text-sm px-6 py-3">Go home</a>
              </div>
            </PageTransition>
          </AppShell>
        } />

      </Routes>
    </AnimatePresence>
  )
}

// ─── Root ─────────────────────────────────────────────────────────────────────
const basename = import.meta.env.BASE_URL

export default function App() {
  return (
    <ErrorBoundary>
      <BrowserRouter basename={basename}>
        <ThemeProvider>
          <AuthProvider>
            <Toaster
              position="bottom-center"
              toastOptions={{
                style:{
                  background:'#1A1210', color:'#FAF6F0',
                  borderRadius:'100px', padding:'14px 24px',
                  fontSize:'14px', fontFamily:"'DM Sans',sans-serif", fontWeight:'500',
                },
                success: { iconTheme:{ primary:'#7A9E7E', secondary:'#FAF6F0' } },
                error:   { iconTheme:{ primary:'#C96A3A', secondary:'#FAF6F0' } },
              }}
            />
            <AnimatedRoutes />
          </AuthProvider>
        </ThemeProvider>
      </BrowserRouter>
    </ErrorBoundary>
  )
}
