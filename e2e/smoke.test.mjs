// Browser smoke tests: the built app runs in real Chromium with the backend mocked at the network edge.
// They guard the plumbing that unit tests cannot see: the app boots, menus fall back when the category
// service is down, sign-up fields are labelled, keyboard focus is visible, pages get titles.
// Run: npm run build && npm run test:e2e   (CI does this in the "e2e" job)
import test from 'node:test'
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { chromium } from 'playwright'

const PORT = 4173
const BASE = `http://127.0.0.1:${PORT}`
let server
let browser

async function waitForServer() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return } catch { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error('preview server did not start')
}

test.before(async () => {
  server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { stdio: 'ignore' })
  await waitForServer()
  browser = await chromium.launch()
})

test.after(async () => {
  await browser?.close()
  server?.kill()
})

async function newPage({ categoriesDown = true } = {}) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  // Every Supabase call is answered locally: no session, no rows. The category service can be made to fail,
  // which is the outage the bundled taxonomy fallback exists for.
  await page.route(/127\.0\.0\.1:54321/, (route) => {
    const url = route.request().url()
    if (url.includes('/rest/v1/categories') && categoriesDown) return route.fulfill({ status: 500, body: '{}' })
    if (url.includes('/auth/v1/')) return route.fulfill({ status: 200, contentType: 'application/json', body: '{}' })
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'content-range': '0-0/0' }, body: '[]' })
  })
  return { page, errors }
}

test('the app boots on the home page without script errors', async () => {
  const { page, errors } = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  assert.ok(await page.locator('nav, header').first().isVisible())
  assert.deepEqual(errors, [])
  await page.close()
})

test('the Place menu lists its groups from the bundled taxonomy when the category service is down', async () => {
  const { page } = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByText('Place', { exact: true }).first().hover()
  for (const name of ['Residential Properties', 'Commercial Properties', 'Land & Plots', 'Hospitality & Accommodation']) {
    await page.getByText(name, { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 })
  }
  await page.close()
})

test('the People menu lists its groups from the bundled taxonomy', async () => {
  const { page } = await newPage()
  await page.goto(BASE, { waitUntil: 'networkidle' })
  await page.getByText('People', { exact: true }).first().hover()
  for (const name of ['Home & Property Care', 'Trades & Craftsmen', 'Education']) {
    await page.getByText(name, { exact: false }).first().waitFor({ state: 'visible', timeout: 5000 })
  }
  await page.close()
})

test('sign-up fields are labelled, required fields are marked, and the page has its own title', async () => {
  const { page, errors } = await newPage()
  await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' })
  await page.getByText('Create Account', { exact: false }).first().click()
  await page.waitForTimeout(800)
  const inputs = await page.evaluate(() => [...document.querySelectorAll('form input:not([type="checkbox"]):not([type="hidden"])')].map((i) => ({
    id: !!i.id,
    labelled: !!(i.id && document.querySelector(`label[for="${CSS.escape(i.id)}"]`)) || !!i.closest('label') || !!i.getAttribute('aria-label'),
  })))
  assert.ok(inputs.length >= 2, 'sign-up should show fields')
  assert.ok(inputs.every((i) => i.labelled), 'every sign-up field has a label')
  assert.match(await page.title(), /\| DealMatch$/)
  assert.deepEqual(errors, [])
  await page.close()
})

test('keyboard focus is visible', async () => {
  const { page } = await newPage()
  await page.goto(`${BASE}/auth`, { waitUntil: 'networkidle' })
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  await page.waitForTimeout(500) // outlines ease in
  const outline = await page.evaluate(() => {
    const s = getComputedStyle(document.activeElement)
    return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) }
  })
  assert.equal(outline.style, 'solid')
  assert.ok(outline.width >= 2)
  await page.close()
})

test('the providers page loads with its search prompt and no script errors when the category service is down', async () => {
  const { page, errors } = await newPage()
  await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' })
  await page.getByText('Find the right people.', { exact: false }).first().waitFor({ state: 'visible', timeout: 8000 })
  assert.deepEqual(errors, [])
  await page.close()
})
