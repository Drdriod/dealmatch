import React, { Component } from 'react'
import { motion, AnimatePresence } from 'motion/react'
import { Home } from 'lucide-react'
import { captureRenderError } from '@/lib/sentry'
import Navbar from '@/components/layout/Navbar'
import MobileTabBar from '@/components/layout/MobileTabBar'
import Footer from '@/components/layout/Footer'
import WhatsAppButton from '@/components/ui/WhatsAppButton'
import InstallPrompt from '@/components/ui/InstallPrompt'

// ─── Error Boundary ────────────────────────────────────────────────────────────
export class ErrorBoundary extends Component {
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
          <a href="/" style={{ color:'#B8511E', fontWeight:600 }}>return home</a>.
        </p>
        <button
          onClick={() => { this.setState({ hasError:false, error:null }); window.location.href = '/' }}
          style={{
            marginTop:8, padding:'12px 28px', borderRadius:100,
            backgroundColor:'#B8511E', color:'#fff',
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
export const LoadingScreen = () => (
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
export const PageSkeleton = () => (
  <div style={{
    minHeight:'60vh', display:'flex', alignItems:'center',
    justifyContent:'center', background:'#FFFAF5',
  }}>
    <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:14 }}>
      <div style={{ position:'relative', width:44, height:44, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{
          position:'absolute', width:44, height:44, borderRadius:'50%',
          border:'2.5px solid #DEDDD6', borderTopColor:'#B8511E',
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
export const PageTransition = ({ children }) => (
  <motion.div
    initial={{ opacity:0, y:8 }}
    animate={{ opacity:1, y:0 }}
    exit={{ opacity:0, y:-8 }}
    transition={{ duration:0.18, ease:'easeOut' }}
  >
    {children}
  </motion.div>
)


// ─── App shell ────────────────────────────────────────────────────────────────
export const AppShell = ({ children, showNav=true, showFooter=true, showWhatsApp=true, showTabBar=true }) => (
  <div className="min-h-screen flex flex-col">
    {showNav && <Navbar />}
    <main className="flex-1 pb-16 md:pb-0">{children}</main>
    {showFooter && <Footer />}
    {showWhatsApp && <WhatsAppButton />}
    <InstallPrompt />
    {showTabBar && <MobileTabBar />}
  </div>
)

