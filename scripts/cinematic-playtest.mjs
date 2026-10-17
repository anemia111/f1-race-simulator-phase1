import { preview } from 'vite'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
const directory = resolve(
  process.env.CINEMATIC_QA_DIR ?? '../../outputs/cinematic-qa',
)
await mkdir(directory, { recursive: true })
const server = await preview({
  logLevel: 'error',
  preview: { host: '127.0.0.1', port: 0 },
})
const hardware = process.env.CINEMATIC_HARDWARE === '1'
const browser = await chromium.launch(
  hardware
    ? {
        headless: false,
        args: ['--use-angle=d3d11', '--window-position=-2400,-2400'],
      }
    : { headless: true },
)
const results = []
try {
  const page = await browser.newPage({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
  })
  const errors = []
  async function measure() {
    const samples = []
    await page.waitForTimeout(1500)
    for (let i = 0; i < (hardware ? 10 : 3); i++) {
      await page.waitForTimeout(1050)
      const m = await page.evaluate(() => window.__cinematicMetrics)
      if (m && samples.at(-1)?.reportedAt !== m.reportedAt) samples.push(m)
    }
    const frames = samples.reduce((sum, m) => sum + (m.sampleFrames ?? 0), 0)
    const duration = samples.reduce(
      (sum, m) => sum + (m.sampleDurationMs ?? 0),
      0,
    )
    return {
      metrics: samples.at(-1),
      sampleWindows: samples,
      aggregateFps: duration ? (frames / duration) * 1000 : null,
    }
  }
  page.on('pageerror', (e) => errors.push(e.message))
  await page.route('https://api.openf1.org/**', (r) => r.abort())
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
  await page.waitForSelector('canvas')
  await page.locator('.sidebar-settings').click()
  const rounds = page.getByLabel('Championship round')
  const suzuka = await rounds
    .locator('option')
    .evaluateAll((es) => es.find((e) => /suzuka/i.test(e.textContent))?.value)
  await rounds.selectOption(suzuka)
  await page
    .getByPlaceholder('simulation seed')
    .fill('cinematic-qa-suzuka-2026')
  await page.getByLabel('close setup').click()
  await page.getByRole('button', { name: 'Cinematic', exact: true }).click()
  await page.waitForFunction(
    () => window.__cinematicMetrics?.triangles > 0,
    {},
    { timeout: 60000 },
  )
  await page.getByRole('button', { name: 'Metrics', exact: true }).click()
  await page
    .getByRole('button', { name: 'Skip formation lap', exact: false })
    .click()
    .catch(() => {})
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  for (const mode of [
    'tv',
    'trackside',
    'chase',
    'onboard',
    'helicopter',
    'free',
  ]) {
    await page.getByLabel('Cinematic camera').selectOption(mode)
    const measurement = await measure()
    await page.screenshot({ path: resolve(directory, `${mode}.png`) })
    results.push({
      mode,
      quality: 'medium',
      entrants: 22,
      ...measurement,
    })
  }
  for (const quality of ['high', 'low']) {
    await page.getByLabel('Cinematic quality').selectOption(quality)
    await page.getByLabel('Cinematic camera').selectOption('chase')
    const measurement = await measure()
    results.push({
      mode: 'chase',
      quality,
      entrants: 22,
      ...measurement,
    })
  }
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  await page.getByRole('button', { name: 'Overview Map', exact: true }).click()
  await page.waitForSelector('.race-canvas')
  await page.getByRole('button', { name: 'FREE', exact: true }).click()
  await page.waitForSelector('.free-mode-builder')
  await page
    .locator('.free-mode-track-select select')
    .selectOption('suzuka-approx')
  await page
    .locator('.free-mode-settings input[type="number"]')
    .first()
    .fill('40')
  await page.getByRole('button', { name: 'Apply', exact: true }).click()
  await page.waitForFunction(
    () => document.querySelectorAll('.free-mode-entry-row').length === 40,
  )
  await page.getByRole('button', { name: 'Start session', exact: true }).click()
  await page.getByRole('button', { name: '1x', exact: true }).click()
  await page.getByRole('button', { name: 'Cinematic', exact: true }).click()
  await page.waitForTimeout(5000)
  await page.getByLabel('Cinematic camera').selectOption('chase')
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  for (const quality of ['low', 'medium', 'high']) {
    await page.getByLabel('Cinematic quality').selectOption(quality)
    const measurement = await measure()
    results.push({
      mode: 'chase',
      quality,
      entrants: 40,
      ...measurement,
    })
  }
  await page.screenshot({ path: resolve(directory, 'free40.png') })
  const report = {
    recordedAt: new Date().toISOString(),
    viewport: '1920x1080',
    requestedHardware: hardware,
    errors,
    results,
    limits:
      'Short moving-race samples with per-window data, not an endurance or all-course acceptance. Fullscreen for 22 and 40 cars; presets may lower internal resolution. GPU timing is conditional; VRAM is not measured. Other system workloads may affect timing.',
  }
  await writeFile(
    resolve(directory, 'results.json'),
    JSON.stringify(report, null, 2),
  )
  console.log(JSON.stringify(report, null, 2))
  if (errors.length) throw new Error(errors.join('\n'))
} finally {
  await browser.close()
  await new Promise((r) => server.httpServer.close(r))
}
