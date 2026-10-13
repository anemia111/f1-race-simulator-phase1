import { chromium } from 'playwright'
import { preview } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import assert from 'node:assert/strict'
const root = resolve(import.meta.dirname, '..'), artifacts = resolve(process.env.QA_ARTIFACT_DIR || join(tmpdir(), 'f1-simulator-qa'))
await mkdir(artifacts, { recursive: true })
const server = process.env.QA_BASE_URL ? null : await preview({ root, logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } })
const url = process.env.QA_BASE_URL || `http://127.0.0.1:${server.httpServer.address().port}/`
const browser = await chromium.launch({ headless: true }), reports = [], errors = []
try {
  for (const category of ['kyojo', 'super-gt', 'wec', 'indycar']) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } }), page = await context.newPage()
    page.on('pageerror', error => errors.push(`${category}: ${error.message}`))
    await page.goto(url, { waitUntil: 'domcontentloaded' })
    await page.getByRole('combobox', { name: 'Racing series', exact: true }).selectOption(`motorsport:${category}`)
    await page.getByRole('button', { name: '60x', exact: true }).click()
    await page.getByRole('button', { name: 'Resume simulation', exact: true }).click()
    await page.getByRole('button', { name: 'Skip formation lap', exact: true }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('.sector-value b')].some(element => /\d+\.\d+/.test(element.textContent || '')), null, { timeout: 60000 })
    await page.getByRole('button', { name: 'Pause simulation', exact: true }).click()
    const first = await page.locator('.sector-value b').allTextContents()
    const colors = await page.locator('.broadcast-mini-sectors .mini-purple, .broadcast-mini-sectors .mini-green, .broadcast-mini-sectors .mini-yellow').count()
    assert.ok(colors > 0, `${category}: mini sectors must update`)
    await page.getByRole('button', { name: 'Resume simulation', exact: true }).click()
    await page.waitForFunction(before => JSON.stringify([...document.querySelectorAll('.sector-value b')].map(element => element.textContent)) !== JSON.stringify(before), first, { timeout: 60000 })
    await page.getByRole('button', { name: 'Pause simulation', exact: true }).click()
    const second = await page.locator('.sector-value b').allTextContents()
    assert.notDeepEqual(second, first)
    const clipped = await page.locator('.sector-value b').evaluateAll(elements => elements.filter(element => {
      const range = document.createRange(); range.selectNodeContents(element)
      return range.getBoundingClientRect().width > element.getBoundingClientRect().width + 0.5
    }).map(element => element.textContent))
    assert.deepEqual(clipped, [], `${category}: sector text fits its column`)
    const screenshot = `live-sectors-${category}.png`
    await page.screenshot({ path: join(artifacts, screenshot), fullPage: true })
    reports.push({ category, first, second, coloredMiniSectors: colors, screenshot })
    await context.close()
  }
  assert.deepEqual(errors, [])
  const report = { url, reports, errors }
  await writeFile(join(artifacts, 'sector-timing-browser.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report, null, 2))
} finally { await browser.close(); await server?.close() }
