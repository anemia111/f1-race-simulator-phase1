import { preview } from 'vite'
import { chromium } from 'playwright'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const root = resolve(process.env.STUTTER_SOURCE ?? '.')
const directory = resolve(process.env.STUTTER_QA_DIR ?? '../../outputs/stutter-after-qa')
await mkdir(directory, { recursive: true })
const server = await preview({ root, logLevel: 'error', preview: { host: '127.0.0.1', port: 0 } })
const browser = await chromium.launch({ headless: false, args: ['--use-angle=d3d11', '--window-position=-2400,-2400'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1,
  recordVideo: { dir: directory, size: { width: 1280, height: 900 } } })
const page = await context.newPage()
const errors = [], results = []
const controls = {}
page.on('pageerror', error => errors.push(error.message))
try {
  await page.route('https://api.openf1.org/**', route => route.abort())
  await page.goto(`http://127.0.0.1:${server.httpServer.address().port}/`)
  await page.waitForSelector('canvas')
  await page.locator('.sidebar-settings').click()
  const rounds = page.getByLabel('Championship round')
  const suzuka = await rounds.locator('option').evaluateAll(options => options.find(option => /suzuka/i.test(option.textContent))?.value)
  await rounds.selectOption(suzuka)
  await page.getByPlaceholder('simulation seed').fill('stutter-suzuka-fixed-20261017')
  await page.getByLabel('close setup').click()
  await page.locator('.leaderboard-rows li').filter({ hasText: 'LEC' }).getByRole('button').click()
  await page.getByRole('button', { name: 'Skip formation lap', exact: false }).click().catch(() => {})
  await page.getByRole('button', { name: 'Cinematic', exact: true }).click()
  await page.waitForFunction(() => window.__cinematicMotion?.speedKph > 50 &&
    document.querySelector('.broadcast-session-core time')?.textContent !== '00:00:00', {}, { timeout: 60000 })
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  for (const mode of ['tv', 'chase', 'onboard']) {
    await page.getByLabel('Cinematic camera').selectOption(mode)
    await page.waitForTimeout(1200)
    const measurement = await page.evaluate(async () => {
      const samples = [], metrics = []
      let last = 0, lastReport = 0
      await new Promise(resolve => {
        const began = performance.now()
        const collect = () => {
          const motion = window.__cinematicMotion
          if (motion && motion.renderedAt !== last) { samples.push({ ...motion }); last = motion.renderedAt }
          const m = window.__cinematicMetrics
          if (m && m.reportedAt !== lastReport) { metrics.push({ ...m }); lastReport = m.reportedAt }
          if (performance.now() - began >= 8000) resolve()
          else requestAnimationFrame(collect)
        }
        requestAnimationFrame(collect)
      })
      return { samples, metrics }
    })
    const movingPairs = [], gaps = []
    for (let i = 1; i < measurement.samples.length; i++) {
      const a = measurement.samples[i - 1], b = measurement.samples[i]
      if (b.status !== 'running' || b.speedKph < 50 || a.driverId !== b.driverId) continue
      movingPairs.push(b.distance - a.distance)
      gaps.push(b.renderedAt - a.renderedAt)
    }
    const sortedGaps = gaps.toSorted((a, b) => a - b)
    if (movingPairs.length < 200) throw new Error(`Insufficient moving samples for ${mode}: ${movingPairs.length}`)
    results.push({ mode, sampleCount: movingPairs.length,
      stoppedRenderFrames: movingPairs.filter(delta => Math.abs(delta) < 1e-10).length,
      reversedRenderFrames: movingPairs.filter(delta => delta < -1e-10).length,
      futurePositionFrames: measurement.samples.filter(sample => sample.distance > sample.latestDistance + 1e-9).length,
      renderGapP95Ms: sortedGaps[Math.floor(sortedGaps.length * .95)],
      maxRenderGapMs: Math.max(...gaps), ...measurement })
    await page.screenshot({ path: resolve(directory, `${mode}.png`) })
  }
  await page.getByRole('button', { name: 'Fullscreen', exact: true }).click()
  await page.getByRole('button', { name: 'Pause simulation', exact: true }).click()
  await page.waitForTimeout(300)
  const pausedDistance = await page.evaluate(() => window.__cinematicMotion?.distance)
  await page.waitForTimeout(300)
  controls.pauseStable = pausedDistance === await page.evaluate(() => window.__cinematicMotion?.distance)
  await page.getByRole('button', { name: 'Resume simulation', exact: true }).click()
  await page.waitForTimeout(700)
  controls.resumedForward = await page.evaluate(previous => window.__cinematicMotion?.distance > previous, pausedDistance)
  if (!controls.pauseStable || !controls.resumedForward) throw new Error('Pause/resume continuity failed')
  if (errors.length) throw new Error(errors.join('\n'))
} finally {
  await writeFile(resolve(directory, 'results.json'), JSON.stringify({ root, generatedAt: new Date().toISOString(),
    viewport: '1280x900', entrants: 22, playback: 1, quality: 'medium', note: 'Read-only selected-car render probe. Video recording is enabled in both runs. Camera cuts are intentional and excluded from position-stall detection.', errors, controls, results }, null, 2))
  await context.close()
  await browser.close()
  await new Promise(resolveClose => server.httpServer.close(resolveClose))
}
