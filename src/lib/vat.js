// VAT on DealMatch's own fees (never on rent, a sale price, a room charge or money held for others).
//
// The rate comes from the tax_settings table, which the owner edits in Admin > Tax. While VAT is
// switched off the rate is 0 and nothing changes at checkout. Server only: the browser never
// names a tax amount.

/** VAT in kobo on a fee in naira. Rounded to the nearest kobo. */
export function vatKobo(feeNaira, ratePct) {
  const fee = Number(feeNaira)
  const rate = Number(ratePct)
  if (!Number.isFinite(fee) || !Number.isFinite(rate) || fee <= 0 || rate <= 0) return 0
  return Math.round((Math.round(fee * 100) * rate) / 100)
}

/** The VAT rate in force (percent), or 0 when VAT is switched off or cannot be read. */
export async function currentVatRate(svc) {
  const { data, error } = await svc.from('tax_settings').select('rate_pct, is_active').eq('key', 'vat').maybeSingle()
  if (error) throw error
  return data && data.is_active ? Number(data.rate_pct) : 0
}

/**
 * Add VAT to a priced payment. Returns what the payer is charged and what to store with it.
 * The price (amountNaira) is untouched; VAT goes on top and is recorded separately.
 */
export function addVat(plan, ratePct) {
  const priceKobo = Math.round(plan.amountNaira * 100)
  const vat = vatKobo(plan.feeNaira, ratePct)
  const metadata = vat > 0
    ? { ...plan.metadata, vat_kobo: String(vat), vat_rate: String(ratePct), vat_base_kobo: String(Math.round(plan.feeNaira * 100)) }
    : plan.metadata
  return { priceKobo, vatKobo: vat, totalKobo: priceKobo + vat, metadata }
}
