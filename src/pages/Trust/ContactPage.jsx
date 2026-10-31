import { Mail, MessageCircle } from 'lucide-react';
import TrustLayout from '@/components/trust/TrustLayout';
import { SUPPORT_EMAIL, whatsappLink } from '@/lib/supportContacts';
import { btnPrimary, btnSecondary, card } from '@/components/ui/styles';

export default function ContactPage() {
  const wa = whatsappLink();
  return (
    <TrustLayout title="Contact Support" subtitle="Tell us which transaction or listing you need help with.">
      <div className={`${card} space-y-4`}>
        {wa ? <a href={wa} target="_blank" rel="noopener noreferrer" className={btnPrimary}><MessageCircle className="h-4 w-4" aria-hidden="true" /> Chat on WhatsApp</a> : null}
        {SUPPORT_EMAIL ? <a href={`mailto:${SUPPORT_EMAIL}`} className={btnSecondary}><Mail className="h-4 w-4" aria-hidden="true" /> {SUPPORT_EMAIL}</a> : null}
        {!wa && !SUPPORT_EMAIL ? <p className="text-sm text-warm">Support contact details are not available yet. Please check back soon.</p> : null}
        <p className="text-sm text-warm">For a problem with a payment, include the transaction reference from the transaction page.</p>
      </div>
    </TrustLayout>
  );
}
