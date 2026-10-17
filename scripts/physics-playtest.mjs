import { preview } from 'vite'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const directory = resolve('../../outputs/physics-ui-qa')
await mkdir(directory, { recursive: true })
const server = await preview({ logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } })
const browser = await chromium.launch({ headless: true })
const errors = [], cases = []
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  page.on('pageerror', error => errors.push(error.message))
  await page.route('https://api.openf1.org/**', route => route.abort())
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
  await page.waitForSelector('canvas')
  await page.locator('.sidebar-settings').click()
  const rounds = page.getByLabel('Championship round')
  const suzuka = await rounds.locator('option').evaluateAll(options => options.find(option => /suzuka/i.test(option.textContent))?.value)
  await rounds.selectOption(suzuka)
  await page.getByPlaceholder('simulation seed').fill('physics-ui-suzuka-20261017')
  await page.getByLabel('close setup').click()
  await page.getByRole('button', { name: 'Skip formation lap', exact: false }).click().catch(() => {})
  await page.getByRole('button', { name: 'Physics', exact: true }).click()
  const panel = page.getByLabel('Live physics telemetry')
  await panel.waitFor({ timeout: 60000 })
  for (const speed of [1, 5, 20, 60]) {
    await page.getByRole('button', { name: `${speed}x`, exact: true }).click()
    await page.waitForTimeout(1700)
    const text = await panel.innerText()
    if (/NaN|undefined|Infinity/.test(text)) throw new Error(`Invalid telemetry at ${speed}x`)
    cases.push({ view: 'overview', speed, text })
  }
  await page.screenshot({ path: resolve(directory, 'overview-physics.png') })
  await page.getByRole('button', { name: '1x', exact: true }).click()
  await page.getByRole('button', { name: 'Cinematic', exact: true }).click()
  await page.waitForFunction(() => window.__cinematicMetrics?.triangles > 0, {}, { timeout: 60000 })
  for (const mode of ['tv', 'onboard']) {
    await page.getByLabel('Cinematic camera').selectOption(mode)
    await page.waitForTimeout(2000)
    cases.push({ view: mode, speed: 1, text: await panel.innerText(), renderMetrics: await page.evaluate(() => window.__cinematicMetrics) })
    await page.screenshot({ path: resolve(directory, `${mode}-physics.png`) })
  }
  if (errors.length) throw new Error(errors.join('\n'))
} finally {
  await writeFile(resolve(directory, 'report.json'), JSON.stringify({ generatedAt: new Date().toISOString(), viewport: '1920x1080', note: 'Functional smoke check; headless software rendering and concurrent test load are not a hardware FPS acceptance measurement.', errors, cases }, null, 2))
  await browser.close()
  await new Promise(resolveClose => server.httpServer.close(resolveClose))
}
