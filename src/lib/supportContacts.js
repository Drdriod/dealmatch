// Set both in Vercel env. Digits only for WhatsApp, in international format.
export const SUPPORT_WHATSAPP = import.meta.env.VITE_SUPPORT_WHATSAPP || '';
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || '';

export function whatsappLink(text = 'Hello DealMatch support') {
  if (!SUPPORT_WHATSAPP) return '';
  return `https://wa.me/${SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}
