/**
 * WhatsApp conversation engine.
 *
 * Trust ladder (what each tier can do from WhatsApp):
 *   guest     number registered on first message; can browse and request,
 *             sees masked results only
 *   linked    number tied to a DealMatch account (via single-use web link)
 *   verified  that account's identity_verification_status is 'approved';
 *             can be handed off to contact providers. Never asked again.
 *
 * Hard rules this file enforces:
 *   - No provider/agent phone number or email is ever put in a message.
 *   - Money and ID documents never move through WhatsApp. Anything
 *     sensitive is a link to the website, where the account is signed in.
 *   - Every free-text field is screened before it is stored or searched.
 *   - Meta retries are ignored (idempotent), and every number is rate limited.
 *
 * The engine only talks to `store` and `cloud` (see store.js / cloud.js).
 */
import { screenText, cleanText, parseNaira, formatNaira, normalizeWaId, isAllowedCountry } from './guard.js'

export const CONSENT_VERSION = '2026-10-v1'

const FLOW_TTL_MS = 30 * 60_000
const HOUR_MS = 3_600_000
const DAY_MS = 24 * HOUR_MS

const LIMITS = {
  guest:    { perHour: 40,  requestsPerDay: 5 },
  linked:   { perHour: 80,  requestsPerDay: 10 },
  verified: { perHour: 120, requestsPerDay: 20 },
}

export const SERVICE_CATEGORIES = [
  { id: 'mechanic',    title: 'Mechanic',          desc: 'Cars, trucks, motorbikes',          keywords: ['mechanic', 'auto repair', 'car repair'],            hint: /\b(mechanic|car repair|auto)\b/i },
  { id: 'electrician', title: 'Electrician',       desc: 'Wiring, fittings, faults',           keywords: ['electrician', 'electrical'],                        hint: /\b(electrician|electrical|wiring)\b/i },
  { id: 'plumber',     title: 'Plumber',           desc: 'Pipes, tanks, leaks, borehole',      keywords: ['plumber', 'plumbing'],                              hint: /\b(plumber|plumbing|leak|borehole)\b/i },
  { id: 'carpenter',   title: 'Carpenter',         desc: 'Doors, furniture, roofing',          keywords: ['carpenter', 'carpentry'],                           hint: /\b(carpenter|carpentry|furniture)\b/i },
  { id: 'painter',     title: 'Painter',           desc: 'Interior and exterior painting',     keywords: ['painter', 'painting'],                              hint: /\b(painter|painting)\b/i },
  { id: 'ac_repair',   title: 'AC and fridge',     desc: 'Air conditioners, freezers',         keywords: ['air conditioner', 'ac repair', 'refrigerator'],     hint: /\b(ac|air ?con\w*|fridge|freezer|refrigerator)\b/i },
  { id: 'generator',   title: 'Generator repair',  desc: 'Servicing and fault repair',         keywords: ['generator', 'generator repair'],                    hint: /\b(generator|gen set)\b/i },
  { id: 'cleaner',     title: 'Cleaner',           desc: 'Home and office cleaning',           keywords: ['cleaner', 'cleaning'],                              hint: /\b(cleaner|cleaning|fumigat\w*)\b/i },
  { id: 'welder',      title: 'Welder',            desc: 'Gates, rails, fabrication',          keywords: ['welder', 'welding', 'fabrication'],                 hint: /\b(welder|welding|fabricat\w*)\b/i },
  { id: 'other',       title: 'Something else',    desc: 'Type what you need',                 keywords: [],                                                   hint: null },
]

const HOME_INTENTS = {
  home_rent:  { category: 'rental',    label: 'rent' },
  home_buy:   { category: 'sale',      label: 'buy' },
  home_short: { category: 'shortlet',  label: 'short stay' },
}

const SERVICE_HINT = /\b(mechanic|plumber|electrician|carpenter|painter|welder|cleaner|technician|artisan|repair|generator|fridge|air ?con\w*|fumigat\w*)\b/i
const HOME_HINT = /\b(house|home|apartment|flat|room|duplex|bungalow|rent\w*|buy|shortlet|short let|hostel|accommodation)\b/i

const TXT = {
  consent: appUrl =>
    'Welcome to DealMatch. I can help you find a mechanic, an artisan, or a home.\n\n' +
    'To do that we keep your WhatsApp number and the details you share, so we can match you and keep the platform safe. ' +
    `Privacy policy: ${appUrl}/privacy\n\nDo you agree to continue?`,
  declined: 'No problem. Your number has been removed. Message us any time if you change your mind.',
  askName: 'What should we call you? Reply with your first name.',
  badName: 'Please send a name using letters only, for example: Chidi.',
  stopped: 'You will no longer get notifications from DealMatch on WhatsApp. You can still message us any time. Reply START to turn them back on.',
  started: 'Notifications are back on. Send MENU to see what I can do.',
  slowDown: 'You are sending messages very quickly. Please wait a little while and try again.',
  suspended: 'This number is paused while our team reviews recent activity. If you think this is a mistake, contact DealMatch support from the website.',
  illegal: 'DealMatch cannot help with that. Requests involving illegal activity are not allowed, and repeated attempts lead to this number being suspended.',
  contactInfo: 'For your safety, please do not include phone numbers, links or email addresses. DealMatch connects you to providers securely. Please send that again without them.',
  mediaUnsupported: 'I can only read text for now. Please type your message or use the buttons.',
  expired: 'That took a while, so I closed the earlier steps. Send MENU to start again.',
  resultsExpired: 'Those results have expired. Send MENU to search again.',
  help:
    'How DealMatch works on WhatsApp:\n' +
    '- Search for a mechanic, artisan or home. No account needed.\n' +
    '- To contact a provider or agent, you verify once. After that you are never asked again.\n' +
    '- Phone numbers and payments are never shared in this chat. They stay on DealMatch, where your payment is protected.\n\n' +
    'Stay safe:\n' +
    '- Never pay anyone outside DealMatch.\n' +
    '- DealMatch staff will never ask for your PIN, OTP or card details here.\n' +
    '- Report anything suspicious from the website.\n\n' +
    'Commands: MENU, VERIFY, MY REQUESTS, CANCEL, STOP.',
  restricted: 'Your DealMatch account needs attention before we can continue. Please contact DealMatch support from the website.',
}

const iso = () => new Date().toISOString()
const firstName = n => String(n || '').trim().split(/\s+/)[0] || ''

function parseInput(msg) {
  const t = msg?.type
  if (t === 'text') return { kind: 'text', text: cleanText(msg.text?.body, 500), id: null }
  if (t === 'interactive') {
    const b = msg.interactive?.button_reply
    const l = msg.interactive?.list_reply
    const pick = b || l
    return { kind: 'choice', text: cleanText(pick?.title, 80), id: pick?.id || null }
  }
  if (t === 'button') return { kind: 'choice', text: cleanText(msg.button?.text, 80), id: msg.button?.payload || null }
  return { kind: 'media', text: '', id: null }
}

// One-line operational diagnostics. Shown in Vercel logs as level "info"; never logs message text or full numbers.
function diag(msg) { console.log(`[wa] ${msg}`) }

export function createEngine({ store, cloud, appUrl, allowedCountryCodes = ['234'], phoneNumberId = null }) {
  const url = path => `${appUrl}${path}`

  // ── flow state helpers ────────────────────────────────────────────────────
  async function setFlow(contact, flow, step, data = {}) {
    const patch = {
      flow, flow_step: step, flow_data: data,
      flow_expires_at: flow ? new Date(Date.now() + FLOW_TTL_MS).toISOString() : null,
    }
    Object.assign(contact, patch)
    await store.updateContact(contact.wa_id, patch)
  }
  const clearFlow = contact => setFlow(contact, null, null, {})

  // ── outgoing building blocks ──────────────────────────────────────────────
  const say = (ctx, text) => cloud.sendText(ctx.waId, text)

  async function sendMenu(ctx, intro) {
    const name = firstName(ctx.contact.display_name)
    const body = intro || (name ? `Hello ${name}. How can DealMatch help you today?` : 'How can DealMatch help you today?')
    await cloud.sendList(ctx.waId, body, 'Choose an option', [{
      title: 'DealMatch',
      rows: [
        { id: 'menu_service',  title: 'Find a service',  description: 'Mechanic, electrician, plumber and more' },
        { id: 'menu_home',     title: 'Find a home',     description: 'Rent, buy or short stay' },
        { id: 'menu_requests', title: 'My requests',     description: 'Your recent searches' },
        { id: 'menu_verify',   title: 'Verify account',  description: 'One-time check to contact providers' },
        { id: 'menu_help',     title: 'Help and safety', description: 'How this works, staying safe' },
      ],
    }])
  }

  async function guardText(ctx, text) {
    const s = screenText(text)
    if (s.ok) return false
    if (s.reason === 'illegal') {
      const r = await store.addStrike(ctx.waId, 'illegal_content')
      if (r.status === 'suspended') {
        // Start the 24h notice cooldown now so the next message is not told twice.
        await store.updateContact(ctx.waId, { last_notice_at: iso() })
        await say(ctx, TXT.suspended)
      } else {
        await say(ctx, TXT.illegal)
      }
    } else {
      await say(ctx, TXT.contactInfo)
    }
    return true
  }

  // ── verification prompt (the "redirect link to the verification page") ────
  async function sendVerifyPrompt(ctx) {
    const { tier, identityStatus, restricted } = ctx.tierInfo
    if (restricted) return say(ctx, TXT.restricted)
    if (tier === 'verified') {
      return say(ctx, 'You are fully verified. There is nothing more to do, and you will not be asked again.')
    }
    if (tier === 'linked') {
      if (identityStatus === 'submitted') {
        return say(ctx, 'Your documents are under review. This usually does not take long. Check back here, or send VERIFY any time to see your status.')
      }
      const note = identityStatus === 'rejected'
        ? 'Your last submission was not approved. You can try again with clearer photos.'
        : 'Your account is linked. One last step: verify your identity so you can contact providers.'
      return cloud.sendCtaUrl(ctx.waId, note, 'Verify identity', url('/verify-identity'))
    }
    const t = await store.createLinkToken(ctx.waId)
    if (t.error === 'rate_limited') {
      return say(ctx, 'You have requested several links recently. Please wait a little and try again.')
    }
    if (!t.token) return say(ctx, 'I could not create your link right now. Please try again in a moment.')
    return cloud.sendCtaUrl(
      ctx.waId,
      'To contact providers safely, DealMatch needs to know you are a real person. ' +
      'Sign in or create your account with the button below, then verify your identity. ' +
      'You only do this once. The link works for 20 minutes and only for this chat.',
      'Verify on DealMatch',
      url(`/wa/link?t=${t.token}`)
    )
  }

  // ── find a service ────────────────────────────────────────────────────────
  async function startService(ctx, preselect) {
    if (preselect) return afterCategory(ctx, preselect, null)
    await setFlow(ctx.contact, 'service', 'category', {})
    await cloud.sendList(ctx.waId, 'What do you need help with?', 'Pick a service', [{
      title: 'Services',
      rows: SERVICE_CATEGORIES.map(c => ({ id: `svc_${c.id}`, title: c.title, description: c.desc })),
    }])
  }

  async function afterCategory(ctx, category, customLabel) {
    const data = {
      category_id: category.id,
      label: customLabel || category.title,
      keywords: customLabel ? customLabel.split(' ').slice(0, 4) : category.keywords,
    }
    await setFlow(ctx.contact, 'service', 'location', data)
    await say(ctx, `Which area do you need ${data.label.toLowerCase()} in? For example: Rumuola, Port Harcourt.`)
  }

  async function serviceStep(ctx, input) {
    const { contact } = ctx
    const step = contact.flow_step
    const data = contact.flow_data || {}

    if (step === 'category') {
      if (input.id?.startsWith('svc_')) {
        const cat = SERVICE_CATEGORIES.find(c => `svc_${c.id}` === input.id)
        if (cat && cat.id !== 'other') return afterCategory(ctx, cat, null)
        await setFlow(contact, 'service', 'category_text', {})
        return say(ctx, 'Tell me what you need in a few words, for example: tiler, POP ceiling, solar installer.')
      }
      return startService(ctx)
    }

    if (step === 'category_text') {
      if (await guardText(ctx, input.text)) return
      const label = cleanText(input.text, 40)
      if (label.length < 3) return say(ctx, 'Please describe the service in a few words.')
      return afterCategory(ctx, SERVICE_CATEGORIES.find(c => c.id === 'other'), label)
    }

    if (step === 'location') {
      if (await guardText(ctx, input.text)) return
      const location = cleanText(input.text, 80)
      if (location.length < 3) return say(ctx, 'Please tell me the area or town, for example: Rumuola, Port Harcourt.')
      await setFlow(contact, 'service', 'details', { ...data, location })
      return say(ctx, 'Briefly describe the problem or job in one or two sentences, or reply SKIP.')
    }

    if (step === 'details') {
      const skip = /^skip$/i.test(input.text)
      if (!skip && await guardText(ctx, input.text)) return
      return runServiceSearch(ctx, { ...data, details: skip ? '' : cleanText(input.text, 200) })
    }
  }

  async function overDailyCap(ctx) {
    const used = await store.countRequestsSince(ctx.waId, 24)
    if (used < LIMITS[ctx.tierInfo.tier].requestsPerDay) return false
    const extra = ctx.tierInfo.tier === 'guest' ? ' Verifying your account raises this limit.' : ''
    await say(ctx, `You have reached today's request limit.${extra} Please try again tomorrow.`)
    await clearFlow(ctx.contact)
    return true
  }

  async function runServiceSearch(ctx, d) {
    if (await overDailyCap(ctx)) return
    const reqId = await store.createRequest({
      wa_id: ctx.waId, kind: 'service', category: d.label, location_text: d.location, description: d.details || null,
    })
    const items = await store.searchServices({ keywords: d.keywords, location: d.location, limit: 3 })
    await store.updateRequest(reqId, { result_count: items.length, status: items.length ? 'matched' : 'open' })

    if (!items.length) {
      await clearFlow(ctx.contact)
      await say(ctx, `I could not find a ${d.label.toLowerCase()} listed for ${d.location} yet. You can browse more on DealMatch:\n${url('/search?q=' + encodeURIComponent(d.label))}`)
      return sendNextSteps(ctx, false)
    }

    const anyNearby = items.some(i => i.nearby)
    const lines = items.map((it, i) =>
      `${i + 1}. ${it.title}\n   Area: ${it.location || 'Not stated'}` +
      (it.priceCents ? `\n   From: ${formatNaira(it.priceCents / 100)}` : '') +
      `\n   ${url(it.urlPath)}`)
    const head = anyNearby
      ? `Top ${d.label.toLowerCase()} matches for ${d.location}:`
      : `No exact match in ${d.location}, so here are the closest available:`

    await setFlow(ctx.contact, 'results', 'shown', {
      results: items.map(i => ({ title: i.title, urlPath: i.urlPath })),
    })
    await say(ctx, `${head}\n\n${lines.join('\n\n')}\n\nContact details are protected until you are verified.`)
    return sendNextSteps(ctx, true)
  }

  async function sendNextSteps(ctx, canContact) {
    const buttons = []
    if (canContact) buttons.push({ id: 'act_contact', title: 'Contact a provider' })
    buttons.push({ id: 'act_new', title: 'New search' }, { id: 'menu_back', title: 'Main menu' })
    return cloud.sendButtons(ctx.waId, 'What would you like to do next?', buttons)
  }

  // ── find a home ───────────────────────────────────────────────────────────
  async function startHome(ctx) {
    await setFlow(ctx.contact, 'home', 'intent', {})
    return cloud.sendButtons(ctx.waId, 'Are you looking to rent, buy, or book a short stay?', [
      { id: 'home_rent', title: 'Rent' }, { id: 'home_buy', title: 'Buy' }, { id: 'home_short', title: 'Short stay' },
    ])
  }

  async function homeStep(ctx, input) {
    const { contact } = ctx
    const data = contact.flow_data || {}

    if (contact.flow_step === 'intent') {
      const intent = HOME_INTENTS[input.id]
      if (!intent) return startHome(ctx)
      await setFlow(contact, 'home', 'location', { category: intent.category, label: intent.label })
      return say(ctx, 'Which area or city? For example: GRA, Port Harcourt.')
    }

    if (contact.flow_step === 'location') {
      if (await guardText(ctx, input.text)) return
      const location = cleanText(input.text, 80)
      if (location.length < 3) return say(ctx, 'Please tell me the area or city, for example: GRA, Port Harcourt.')
      await setFlow(contact, 'home', 'budget', { ...data, location })
      return say(ctx, 'What is your maximum budget in naira? For example 500k or 2m, or reply SKIP.')
    }

    if (contact.flow_step === 'budget') {
      const b = parseNaira(input.text)
      if (b.invalid) return say(ctx, 'I could not read that amount. Try something like 500k, 2m or 1500000, or reply SKIP.')
      return runHomeSearch(ctx, { ...data, budgetMax: b.value || null })
    }
  }

  async function runHomeSearch(ctx, d) {
    if (await overDailyCap(ctx)) return
    const reqId = await store.createRequest({
      wa_id: ctx.waId, kind: 'home', intent: d.label, location_text: d.location, budget_max: d.budgetMax,
    })
    const items = await store.searchHomes({ category: d.category, location: d.location, budgetMax: d.budgetMax, limit: 3 })
    await store.updateRequest(reqId, { result_count: items.length, status: items.length ? 'matched' : 'open' })

    if (!items.length) {
      await clearFlow(ctx.contact)
      await say(ctx, `I could not find a home to ${d.label} in ${d.location}${d.budgetMax ? ' within that budget' : ''} yet. Browse more on DealMatch:\n${url('/search?q=' + encodeURIComponent(d.location))}`)
      return sendNextSteps(ctx, false)
    }

    const lines = items.map((it, i) =>
      `${i + 1}. ${it.title}\n   ${it.location}${it.bedrooms ? ` | ${it.bedrooms} bed` : ''}\n   ${formatNaira(it.price)}${it.period ? ` per ${it.period}` : ''}\n   ${url(it.urlPath)}`)
    await setFlow(ctx.contact, 'results', 'shown', { results: items.map(i => ({ title: i.title, urlPath: i.urlPath })) })
    await say(ctx, `Homes to ${d.label} in ${d.location}:\n\n${lines.join('\n\n')}\n\nOwner and agent contact details are protected until you are verified.`)
    return sendNextSteps(ctx, true)
  }

  // ── contact hand-off (the verification gate) ──────────────────────────────
  async function contactAction(ctx, index) {
    const { contact } = ctx
    const results = contact.flow === 'results' ? contact.flow_data?.results : null
    if (!results?.length) return say(ctx, TXT.resultsExpired)

    if (ctx.tierInfo.restricted) return say(ctx, TXT.restricted)
    if (ctx.tierInfo.tier !== 'verified') return sendVerifyPrompt(ctx)

    if (index == null) {
      if (results.length === 1) index = 0
      else {
        return cloud.sendList(ctx.waId, 'Which one would you like to contact?', 'Choose one', [{
          title: 'Your results',
          rows: results.map((r, i) => ({ id: `pick_${i}`, title: r.title.slice(0, 24) })),
        }])
      }
    }
    const chosen = results[index]
    if (!chosen) return say(ctx, TXT.resultsExpired)
    return cloud.sendCtaUrl(
      ctx.waId,
      'You are verified, so you can continue securely on DealMatch. Contact details and payments are handled there and never in this chat.',
      'Open on DealMatch',
      url(chosen.urlPath)
    )
  }

  async function sendMyRequests(ctx) {
    const rows = await store.listRequests(ctx.waId, 5)
    if (!rows.length) return say(ctx, 'You have no requests yet. Send MENU to start one.')
    const lines = rows.map((r, i) => {
      const what = r.kind === 'home' ? `Home to ${r.intent || 'find'}` : (r.category || 'Service')
      const d = new Date(r.created_at).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })
      return `${i + 1}. ${what} in ${r.location_text || 'unspecified area'} (${r.result_count} result${r.result_count === 1 ? '' : 's'}, ${d})`
    })
    return say(ctx, `Your recent requests:\n\n${lines.join('\n')}`)
  }

  // ── the single entry point per inbound message ────────────────────────────
  async function handleMessage(msg, waProfileName) {
    const waId = normalizeWaId(msg?.from)
    if (!waId || !msg?.id) { diag('ignored: message has no sender or id'); return }
    const tag = `…${String(waId).slice(-3)}`   // masked number, never the full MSISDN

    if (await store.isBlockedNumber(waId)) { diag(`ignored ${tag}: number is blocked`); return }

    let contact = await store.getContact(waId)
    if (!contact && !isAllowedCountry(waId, allowedCountryCodes)) {
      diag(`ignored ${tag}: country code not allowed (allowed: ${allowedCountryCodes.join(',')})`)
      return
    }

    if (!(await store.logInbound({ wamid: msg.id, waId, msgType: msg.type }))) {
      diag(`ignored ${tag}: duplicate delivery or wa_message_log insert failed`)   // Meta retry, or DB problem
      return
    }

    if (!contact) contact = await store.createContact({ waId, waProfileName })
    if (!contact) { diag(`ignored ${tag}: could not create wa_contacts row (check migration/service key)`); return }
    contact.last_inbound_at = iso()
    await store.updateContact(waId, { last_inbound_at: contact.last_inbound_at })

    if (contact.status === 'blocked') return
    const noticeAge = contact.last_notice_at ? Date.now() - Date.parse(contact.last_notice_at) : Infinity
    if (contact.status === 'suspended') {
      if (noticeAge > DAY_MS) {
        await cloud.sendText(waId, TXT.suspended)
        await store.updateContact(waId, { last_notice_at: iso() })
      }
      return
    }

    const tierInfo = await store.getTier(contact)
    const ctx = { waId, contact, tierInfo }

    // Rate limit (database-backed, so it still works if Redis is down).
    if ((await store.countInbound(waId, 60)) > LIMITS[tierInfo.tier].perHour) {
      if (noticeAge > HOUR_MS) {
        await say(ctx, TXT.slowDown)
        await store.updateContact(waId, { last_notice_at: iso() })
        await store.addStrike(waId, 'rate_limit')
      }
      return
    }

    const input = parseInput(msg)
    const word = input.text.toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim()

    // Notification opt-out only affects proactive messages; replies continue.
    if (word === 'stop' || word === 'unsubscribe') {
      await store.updateContact(waId, { opted_out: true })
      await clearFlow(contact)
      return say(ctx, TXT.stopped)
    }
    if (word === 'start' && contact.opted_out) {
      await store.updateContact(waId, { opted_out: false })
      return say(ctx, TXT.started)
    }

    // Consent comes before anything is stored beyond the number itself.
    if (!contact.consent_at) {
      if (input.id === 'consent_yes') {
        const patch = { consent_at: iso(), consent_version: CONSENT_VERSION }
        Object.assign(contact, patch)
        await store.updateContact(waId, patch)
        await setFlow(contact, 'name', 'ask', {})
        return say(ctx, TXT.askName)
      }
      if (input.id === 'consent_no') {
        await store.deleteContact(waId)
        return say(ctx, TXT.declined)
      }
      return cloud.sendButtons(waId, TXT.consent(appUrl), [
        { id: 'consent_yes', title: 'Agree and continue' }, { id: 'consent_no', title: 'No thanks' },
      ])
    }

    if (input.kind === 'media') return say(ctx, TXT.mediaUnsupported)

    // Expired flows reset quietly.
    if (contact.flow && contact.flow_expires_at && Date.parse(contact.flow_expires_at) < Date.now()) {
      await clearFlow(contact)
      if (input.kind === 'text' && !/^(menu|hi|hello|hey|start)$/.test(word)) {
        await say(ctx, TXT.expired)
        return
      }
    }

    // Name capture.
    if (contact.flow === 'name') {
      if (await guardText(ctx, input.text)) return
      const name = cleanText(input.text, 40)
      if (!/^[\p{L}][\p{L} .'-]{1,39}$/u.test(name)) return say(ctx, TXT.badName)
      contact.display_name = name
      await store.updateContact(waId, { display_name: name })
      await clearFlow(contact)
      await say(ctx, `Thanks, ${firstName(name)}. There is nothing to sign up for. You can search right away.`)
      return sendMenu(ctx)
    }

    // ── global commands and menu choices (always win over an active flow) ──
    if (['menu', 'hi', 'hello', 'hey', 'start', 'cancel', 'reset', 'back'].includes(word) || input.id === 'menu_back') {
      await clearFlow(contact)
      return sendMenu(ctx)
    }
    if (word === 'help' || input.id === 'menu_help') return say(ctx, TXT.help)
    if (['verify', 'link', 'status', 'verification', 'verify account'].includes(word) || input.id === 'menu_verify') return sendVerifyPrompt(ctx)
    if (['my requests', 'requests', 'history'].includes(word) || input.id === 'menu_requests') return sendMyRequests(ctx)
    if (input.id === 'menu_service' || input.id === 'act_new') return startService(ctx)
    if (input.id === 'menu_home') return startHome(ctx)
    if (input.id === 'act_contact') return contactAction(ctx, null)
    if (input.id?.startsWith('pick_')) return contactAction(ctx, parseInt(input.id.slice(5), 10))

    // ── active flows ──
    if (contact.flow === 'service' || input.id?.startsWith('svc_')) {
      if (contact.flow !== 'service') await setFlow(contact, 'service', 'category', {})
      return serviceStep(ctx, input)
    }
    if (contact.flow === 'home' || input.id?.startsWith('home_')) {
      if (contact.flow !== 'home') await setFlow(contact, 'home', 'intent', {})
      return homeStep(ctx, input)
    }

    // ── idle free text: screen, then guess the intent ──
    if (input.kind === 'text') {
      if (await guardText(ctx, input.text)) return
      if (SERVICE_HINT.test(input.text)) {
        const cat = SERVICE_CATEGORIES.find(c => c.hint && c.hint.test(input.text))
        if (cat) return startService(ctx, cat)
        return startService(ctx)
      }
      if (HOME_HINT.test(input.text)) return startHome(ctx)
    }
    return sendMenu(ctx, 'I did not catch that. Pick an option below.')
  }

  async function handleWebhook(body) {
    let handled = 0
    for (const entry of body?.entry || []) {
      for (const change of entry?.changes || []) {
        const value = change?.value
        if (!value) continue
        const gotId = value?.metadata?.phone_number_id
        diag(`webhook change: field=${change?.field} messages=${(value.messages || []).length} statuses=${(value.statuses || []).length} phone_number_id=…${String(gotId || '').slice(-4)} configured=…${String(phoneNumberId || '').slice(-4)}`)
        if (phoneNumberId && gotId && gotId !== phoneNumberId) {
          diag('ignored: phone_number_id mismatch (WHATSAPP_PHONE_NUMBER_ID does not match the number that received this message)')
          continue
        }
        const names = {}
        for (const c of value.contacts || []) names[c.wa_id] = c.profile?.name
        for (const msg of value.messages || []) {
          try { await handleMessage(msg, names[msg.from]); handled++ }
          catch (err) { console.error('wa handleMessage failed:', err?.message || err) }
        }
      }
    }
    return { handled }
  }

  return { handleWebhook, handleMessage }
}
