// All money in the app is handled in minor units (kobo). Only format at the edge.
export function formatKobo(kobo, currency = 'NGN') {
  const n = Number(kobo);
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('en-NG', {
    style: 'currency',
    currency,
    maximumFractionDigits: n % 100 === 0 ? 0 : 2,
  }).format(n / 100);
}
