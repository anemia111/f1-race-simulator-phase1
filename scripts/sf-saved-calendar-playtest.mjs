import { chromium } from 'playwright'
import { preview } from 'vite'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const server = await preview({ root: fileURLToPath(new URL('..', import.meta.url)), logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } })
const browser = await chromium.launch({ headless: true })
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://api.openf1.org/**', route => route.abort())
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`, { waitUntil: 'domcontentloaded' })
  await page.getByLabel('Racing series', { exact: true }).selectOption('super-formula')
  await page.waitForFunction(() => Object.keys(localStorage).some(key => key.includes('race-sim-series-configuration-v1') && key.includes('super-formula')))
  await page.evaluate(() => {
    const key = Object.keys(localStorage).find(key => key.includes('race-sim-series-configuration-v1') && key.includes('super-formula'))
    const saved = JSON.parse(localStorage.getItem(key))
    for (const event of saved.calendar) if (event.id !== 'sf-03-replacement' && event.eventOperations) delete event.eventOperations.raceDistance
    saved.teams[0].name = 'Saved SF Migration Team'
    localStorage.setItem(key, JSON.stringify(saved))
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.locator('.broadcast-sidebar .sidebar-settings').click()
  for (const [event, laps] of [['sf-01', 37], ['sf-12', 31]]) {
    await page.getByLabel('Championship round').selectOption(event)
    const sessions = await page.getByLabel('Weekend session').locator('option').evaluateAll(options => options.map(option => option.value))
    assert.ok(sessions.includes('race'), `${event} race is missing after legacy save reload`)
    await page.getByLabel('Weekend session').selectOption('race')
    await page.getByLabel('Seed', { exact: true }).fill('sf-calendar-dry-0')
    await page.waitForFunction(laps => new RegExp(`\\d+\\s*/\\s*${laps}`).test(document.querySelector('.broadcast-session-core')?.textContent ?? ''), laps)
  }
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem(Object.keys(localStorage).find(key => key.includes('race-sim-series-configuration-v1') && key.includes('super-formula')))))
  assert.equal(saved.teams[0].name, 'Saved SF Migration Team')
  assert.ok(saved.calendar.filter(event => !event.cancelled).every(event => event.eventOperations?.raceDistance?.availability === 'verified-event-override'))
  assert.deepEqual(errors, [])
  console.log('PASS: old SF save reload restores Race, first/final round lap counts, all 12 distances and edited team; no browser errors')
} finally {
  await browser.close()
  await new Promise(resolve => server.httpServer.close(resolve))
}
