import React from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/context/AuthContext'
import DeleteAccountPanel from '@/components/DeleteAccountPanel'

// Public page. Its URL is what Google Play's Data safety form asks for.
export default function DeleteAccountPage() {
  const { user } = useAuth()
  return (
    <div className="min-h-screen pt-20 pb-16" style={{ backgroundColor: '#FFFAF5' }}>
      <div className="max-w-2xl mx-auto px-6">
        <h1 className="font-display font-black text-3xl mb-2" style={{ color: '#17211B' }}>Delete your DealMatch account</h1>
        <p className="text-sm mb-6" style={{ color: '#5C4F49' }}>
          You can delete your account and personal data yourself, at any time.
        </p>

        <h2 className="font-bold text-lg mb-2" style={{ color: '#17211B' }}>What is deleted</h2>
        <p className="text-sm mb-4" style={{ color: '#5C4F49' }}>
          Your name, email address, phone number, profile photo, bio, location, identity documents and
          selfie, and saved bank details. Your login is disabled immediately.
        </p>

        <h2 className="font-bold text-lg mb-2" style={{ color: '#17211B' }}>What is kept</h2>
        <p className="text-sm mb-4" style={{ color: '#5C4F49' }}>
          Records of completed payments and escrow transactions are kept, without your personal details,
          because we must retain financial records for accounting, fraud prevention and dispute handling.
        </p>

        <h2 className="font-bold text-lg mb-2" style={{ color: '#17211B' }}>Before you delete</h2>
        <p className="text-sm mb-6" style={{ color: '#5C4F49' }}>
          Deletion is not possible while money is in progress: an active deal, funds held in escrow, a pending
          payout or withdrawal, or a balance in your wallet. Finish or withdraw first, then come back here.
        </p>

        <h2 className="font-bold text-lg mb-2" style={{ color: '#17211B' }}>How to delete</h2>
        {user ? (
          <DeleteAccountPanel />
        ) : (
          <div className="text-sm" style={{ color: '#5C4F49' }}>
            <ol className="list-decimal pl-5 mb-4 space-y-1">
              <li>Sign in to your account.</li>
              <li>Come back to this page (or open Profile in the app) and tap <b>Delete my account</b>.</li>
            </ol>
            <Link to="/login" className="inline-block px-5 py-3 rounded-xl text-sm font-bold text-white" style={{ backgroundColor: '#C85F2D' }}>Sign in</Link>
          </div>
        )}

        <p className="text-xs mt-8" style={{ color: '#647068' }}>
          Can't sign in? Email info@dealmatch.com.ng from the address on your account, or message us on WhatsApp at
          +234 705 739 2060, and we will delete it for you.
        </p>
      </div>
    </div>
  )
}
