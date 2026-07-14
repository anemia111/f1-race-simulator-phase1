import { writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173/'
const sampleSeconds = Number(process.env.BENCHMARK_SECONDS ?? 8)
const strict = process.env.BENCHMARK_STRICT === '1'
const benchmarkSpeed = process.env.BENCHMARK_SPEED ?? '60'

if (!['1', '5', '20', '60'].includes(benchmarkSpeed)) {
  throw new Error(`Unsupported BENCHMARK_SPEED: ${benchmarkSpeed}`)
}

const browser = await chromium.launch({ headless: true })

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('https://api.openf1.org/**', (route) => route.abort())
  await page.addInitScript(() => {
    window.__f1LongTasks = []
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        window.__f1LongTasks.push({
          duration: entry.duration,
          startTime: entry.startTime,
        })
      }
    }).observe({ entryTypes: ['longtask'] })
  })

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.broadcast-app')
  await page.waitForSelector('canvas')
  await page
    .getByRole('button', { name: `${benchmarkSpeed}x`, exact: true })
    .click()
  await page.waitForTimeout(1_000)

  const metrics = await page.evaluate(async (durationMs) => {
    window.__f1LongTasks = []
    let frames = 0
    let firstFrame = 0
    let lastFrame = 0

    await new Promise((resolve) => {
      const startedAt = performance.now()
      const countFrame = (now) => {
        if (firstFrame === 0) {
          firstFrame = now
        }

        lastFrame = now
        frames += 1

        if (now - startedAt >= durationMs) {
          resolve()
          return
        }

        requestAnimationFrame(countFrame)
      }

      requestAnimationFrame(countFrame)
    })

    const elapsedSeconds = Math.max(0.001, (lastFrame - firstFrame) / 1_000)
    const longTasks = window.__f1LongTasks ?? []
    const memory = performance.memory
    const canvas = document.querySelector('canvas')
    const gl = canvas?.getContext('webgl2') || canvas?.getContext('webgl')
    const rendererExtension = gl?.getExtension('WEBGL_debug_renderer_info')
    const renderer =
      gl && rendererExtension
        ? gl.getParameter(rendererExtension.UNMASKED_RENDERER_WEBGL)
        : gl?.getParameter(gl.RENDERER) ?? 'unavailable'

    return {
      frames,
      measuredSeconds: elapsedSeconds,
      averageFps: frames / elapsedSeconds,
      longTaskCount: longTasks.length,
      longestTaskMs: longTasks.reduce(
        (longest, task) => Math.max(longest, task.duration),
        0,
      ),
      totalLongTaskMs: longTasks.reduce((total, task) => total + task.duration, 0),
      domNodes: document.getElementsByTagName('*').length,
      canvasPixels: Array.from(document.querySelectorAll('canvas')).reduce(
        (total, canvas) => total + canvas.width * canvas.height,
        0,
      ),
      heapUsedMb: memory ? memory.usedJSHeapSize / 1024 / 1024 : null,
      renderer,
      softwareRenderer: /swiftshader|software|llvmpipe/i.test(renderer),
    }
  }, sampleSeconds * 1_000)

  const report = {
    recordedAt: new Date().toISOString(),
    appUrl,
    viewport: '1440x900@1x',
    simulationSpeed: `${benchmarkSpeed}x`,
    strict,
    pageErrors,
    ...metrics,
  }

  await writeFile('qa-performance.json', `${JSON.stringify(report, null, 2)}\n`)
  console.log(JSON.stringify(report, null, 2))

  if (pageErrors.length > 0) {
    throw new Error(`page errors: ${pageErrors.join(', ')}`)
  }

  if (strict && !metrics.softwareRenderer && metrics.averageFps < 24) {
    throw new Error(`average frame rate below floor: ${metrics.averageFps.toFixed(1)} fps`)
  }

  if (strict && metrics.longestTaskMs > 500) {
    throw new Error(`longest main-thread task exceeded 500ms: ${metrics.longestTaskMs.toFixed(1)}ms`)
  }
} finally {
  await browser.close()
}
