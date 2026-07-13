import { chromium } from 'playwright'
import { resolve } from 'node:path'

const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173/'

async function clickSelector(page, selector) {
  await page.waitForSelector(selector, { state: 'attached', timeout: 30000 })
  await page.evaluate((targetSelector) => {
    document.querySelector(targetSelector)?.click()
  }, selector)
}

async function inspectCanvas(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('canvas')

    if (!canvas) {
      return { ok: false, reason: 'missing canvas' }
    }

    await new Promise((resolveFrame) =>
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
    )

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

    if (!gl) {
      return { ok: false, reason: 'missing webgl context' }
    }

    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    const sampleWidth = Math.min(width, 180)
    const sampleHeight = Math.min(height, 140)
    const samplePoints = [
      [0.28, 0.32],
      [0.5, 0.32],
      [0.72, 0.32],
      [0.28, 0.55],
      [0.5, 0.55],
      [0.72, 0.55],
      [0.38, 0.75],
      [0.62, 0.75],
    ]

    let bright = 0
    let varied = 0
    let alpha = 0
    let sum = 0
    let pixelCount = 0

    for (const [xRatio, yRatio] of samplePoints) {
      const x = Math.max(
        0,
        Math.min(width - sampleWidth, Math.floor(width * xRatio - sampleWidth / 2)),
      )
      const y = Math.max(
        0,
        Math.min(height - sampleHeight, Math.floor(height * yRatio - sampleHeight / 2)),
      )
      const pixels = new Uint8Array(sampleWidth * sampleHeight * 4)

      gl.readPixels(x, y, sampleWidth, sampleHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
      pixelCount += pixels.length / 4

      for (let index = 0; index < pixels.length; index += 4) {
        const red = pixels[index]
        const green = pixels[index + 1]
        const blue = pixels[index + 2]
        const opacity = pixels[index + 3]
        const max = Math.max(red, green, blue)
        const min = Math.min(red, green, blue)

        sum += red + green + blue

        if (max > 35) {
          bright += 1
        }

        if (max - min > 8) {
          varied += 1
        }

        if (opacity > 0) {
          alpha += 1
        }
      }
    }

    return {
      ok: bright > pixelCount * 0.04 && varied > pixelCount * 0.015,
      width,
      height,
      sampleWidth,
      sampleHeight,
      bright,
      varied,
      alpha,
      averageRgb: Math.round(sum / pixelCount / 3),
    }
  })
}

async function waitForCanvasPixels(page) {
  let latest = null

  for (let attempt = 0; attempt < 8; attempt += 1) {
    latest = await inspectCanvas(page)

    if (latest.ok) {
      return latest
    }

    await page.waitForTimeout(250)
  }

  return latest
}

async function runViewport(browser, name, viewport, screenshotPath) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))

  // Keep visual QA deterministic and independent from OpenF1 rate limits.
  await page.route('https://api.openf1.org/**', (route) => route.abort())

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('canvas')
  await page.waitForTimeout(1800)

  const title = await page.locator('.live-row').innerText()
  const weekendButtons = await page.locator('.weekend-flow button').count()
  await page.getByTitle('Advance weekend stage').click()
  await page.waitForTimeout(180)
  const weekendFlowText = await page.locator('.weekend-flow').innerText()
  await page.getByTitle('Set weekend stage to Race').click()
  await page.waitForTimeout(180)
  const sectorBoardsInitiallyVisible = (await page.locator('.sector-boards').count()) > 0
  const liveTimingInitiallyVisible = (await page.locator('.leaderboard').count()) > 0
  const openF1InitiallyVisible = (await page.locator('.openf1-panel').count()) > 0
  let sectorBoardsClosed = !sectorBoardsInitiallyVisible
  let sectorBoardsReopened = sectorBoardsInitiallyVisible
  let liveTimingClosed = !liveTimingInitiallyVisible
  let liveTimingReopened = liveTimingInitiallyVisible
  let openF1Closed = !openF1InitiallyVisible
  let openF1Reopened = openF1InitiallyVisible
  let classificationClosed = true
  let classificationReopened = false
  let analysisClosed = true
  let analysisReopened = false
  let manualStrategyVisible = false
  let paceModeControlsVisible = false
  let telemetryHeader = ''
  let rows = 0
  let microBars = 0
  let miniSectorStates = { colored: 0, dim: 0 }
  let timingOverlayLayout = null
  let tickerHiddenWithTiming = false

  if (name.startsWith('desktop')) {
    await clickSelector(page, 'button[title="Speed 60x"]')
    await page.waitForTimeout(3000)

    await clickSelector(page, 'button[aria-label="toggle sector boards"]')
    await page.waitForSelector('.sector-boards')
    sectorBoardsReopened = await page.locator('.sector-boards').isVisible()
    await clickSelector(page, '.sector-boards-header button')
    await page.waitForTimeout(150)
    sectorBoardsClosed = (await page.locator('.sector-boards').count()) === 0
    await clickSelector(page, 'button[aria-label="toggle sector boards"]')
    await page.waitForSelector('.sector-boards')

    await clickSelector(page, 'button[aria-label="toggle live timing"]')
    await page.waitForSelector('.leaderboard')
    liveTimingReopened = await page.locator('.leaderboard').isVisible()
    telemetryHeader = await page.locator('.timing-header-row').innerText()
    rows = await page.locator('.leaderboard li').count()
    microBars = await page
      .locator('.leaderboard li')
      .first()
      .locator('.micro-bar')
      .count()
    miniSectorStates = await page
      .locator('.leaderboard .micro-bar')
      .evaluateAll((bars) =>
        bars.reduce(
          (states, bar) => {
            if (bar.classList.contains('micro-dim')) {
              states.dim += 1
            }

            if (
              bar.classList.contains('micro-yellow') ||
              bar.classList.contains('micro-green') ||
              bar.classList.contains('micro-purple') ||
              bar.classList.contains('micro-pit') ||
              bar.classList.contains('micro-stopped')
            ) {
              states.colored += 1
            }

            return states
          },
          { colored: 0, dim: 0 },
        ),
      )
    timingOverlayLayout = await page.evaluate(() => {
      const timing = document.querySelector('.leaderboard')?.getBoundingClientRect()
      const session = document.querySelector('.hud-session')?.getBoundingClientRect()

      return timing && session
        ? {
            timingBottom: timing.bottom,
            sessionTop: session.top,
          }
        : null
    })
    tickerHiddenWithTiming = (await page.locator('.event-ticker').count()) === 0
    await clickSelector(page, '.leaderboard-header button')
    await page.waitForTimeout(150)
    liveTimingClosed = (await page.locator('.leaderboard').count()) === 0

    await clickSelector(page, 'button[aria-label="toggle OpenF1 data"]')
    await page.waitForSelector('.openf1-panel')
    openF1Reopened = await page.locator('.openf1-panel').isVisible()
    await clickSelector(page, '.openf1-panel header button')
    await page.waitForTimeout(150)
    openF1Closed = (await page.locator('.openf1-panel').count()) === 0

    await clickSelector(page, 'button[aria-label="toggle classification"]')
    await page.waitForSelector('.classification-panel')
    classificationReopened = await page.locator('.classification-panel').isVisible()
    await clickSelector(page, '.classification-panel header button')
    await page.waitForTimeout(150)
    classificationClosed = (await page.locator('.classification-panel').count()) === 0

    await clickSelector(page, 'button[aria-label="toggle race analysis"]')
    await page.waitForSelector('.insights-panel')
    analysisReopened = await page.locator('.insights-panel').isVisible()
    manualStrategyVisible = (await page.locator('.manual-strategy select').count()) === 1
    paceModeControlsVisible = (await page.locator('.pace-mode-row button').count()) === 4
    await clickSelector(page, '.insights-panel header button')
    await page.waitForTimeout(150)
    analysisClosed = (await page.locator('.insights-panel').count()) === 0

  }

  // Setup is exercised by unit/component coverage. Keeping the visual smoke
  // test focused on the canvas and overlay controls avoids HMR timing noise.
  const before = await waitForCanvasPixels(page)
  const layout = await page.evaluate(() => {
    const rect = document.querySelector('.leaderboard')?.getBoundingClientRect()

    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      innerHeight: window.innerHeight,
      scrollHeight: document.documentElement.scrollHeight,
      leaderboard: rect
        ? {
            left: rect.left,
            right: rect.right,
            top: rect.top,
            bottom: rect.bottom,
          }
        : null,
    }
  })

  await page.screenshot({ path: screenshotPath, fullPage: true })
  await page.close()

  return {
    name,
    title,
    telemetryHeader,
    weekendButtons,
    weekendFlowText,
    rows,
    microBars,
    miniSectorStates,
    timingOverlayLayout,
    tickerHiddenWithTiming,
    sectorBoardsInitiallyVisible,
    sectorBoardsClosed,
    sectorBoardsReopened,
    liveTimingInitiallyVisible,
    liveTimingClosed,
    liveTimingReopened,
    openF1InitiallyVisible,
    openF1Closed,
    openF1Reopened,
    classificationClosed,
    classificationReopened,
    analysisClosed,
    analysisReopened,
    manualStrategyVisible,
    paceModeControlsVisible,
    before,
    layout,
    screenshotPath,
    pageErrors,
  }
}

const browser = await chromium.launch({ headless: true })

try {
  const results = [
    await runViewport(
      browser,
      'desktop',
      { width: 1440, height: 900 },
      resolve('qa-desktop.png'),
    ),
    await runViewport(
      browser,
      'desktop-compact',
      { width: 1280, height: 720 },
      resolve('qa-desktop-compact.png'),
    ),
  ]

  console.log(JSON.stringify(results, null, 2))

  for (const result of results) {
    const failures = []

    if (result.rows < 22) {
      failures.push(`expected 22 leaderboard rows, saw ${result.rows}`)
    }

    if (result.microBars < 24) {
      failures.push(`expected first timing row to expose mini-sector bars, saw ${result.microBars}`)
    }

    if (result.miniSectorStates.colored === 0 || result.miniSectorStates.dim === 0) {
      failures.push('mini-sectors did not retain both completed and uncompleted states')
    }

    for (const label of ['SRC', 'THR', 'BRAKE', 'RPM', 'GEAR', 'AERO/OVT']) {
      if (!result.telemetryHeader.includes(label)) {
        failures.push(`telemetry header missing ${label}`)
      }
    }

    if (result.weekendButtons < 5) {
      failures.push(`expected weekend flow buttons, saw ${result.weekendButtons}`)
    }

    if (result.name.startsWith('desktop') && result.sectorBoardsInitiallyVisible) {
      failures.push('sector boards should start hidden on desktop')
    }

    if (result.name.startsWith('desktop') && !result.sectorBoardsClosed) {
      failures.push('sector boards did not close')
    }

    if (result.name.startsWith('desktop') && !result.sectorBoardsReopened) {
      failures.push('sector boards did not reopen')
    }

    if (result.name.startsWith('desktop') && result.liveTimingInitiallyVisible) {
      failures.push('live timing should start hidden on desktop')
    }

    if (result.name.startsWith('desktop') && !result.liveTimingClosed) {
      failures.push('live timing did not close')
    }

    if (result.name.startsWith('desktop') && !result.liveTimingReopened) {
      failures.push('live timing did not reopen')
    }

    if (result.name.startsWith('desktop') && result.openF1InitiallyVisible) {
      failures.push('OpenF1 panel should start hidden on desktop')
    }

    if (result.name.startsWith('desktop') && !result.openF1Closed) {
      failures.push('OpenF1 panel did not close')
    }

    if (result.name.startsWith('desktop') && !result.openF1Reopened) {
      failures.push('OpenF1 panel did not open')
    }

    if (!result.title.includes('ENGINE WORKER')) {
      failures.push(`Web Worker engine was not active: ${result.title}`)
    }

    if (result.pageErrors.length > 0) {
      failures.push(`page errors: ${result.pageErrors.join(', ')}`)
    }

    if (result.name.startsWith('desktop') && !result.classificationClosed) {
      failures.push('classification did not close')
    }

    if (result.name.startsWith('desktop') && !result.classificationReopened) {
      failures.push('classification did not open')
    }

    if (result.name.startsWith('desktop') && !result.analysisClosed) {
      failures.push('race analysis did not close')
    }

    if (result.name.startsWith('desktop') && !result.analysisReopened) {
      failures.push('race analysis did not open')
    }

    if (result.name.startsWith('desktop') && !result.manualStrategyVisible) {
      failures.push('manual strategy controls are missing')
    }

    if (result.name.startsWith('desktop') && !result.paceModeControlsVisible) {
      failures.push('pace mode controls are missing')
    }

    if (result.name.startsWith('desktop') && !result.tickerHiddenWithTiming) {
      failures.push('event ticker should hide while live timing is open')
    }

    if (
      result.name.startsWith('desktop') &&
      (!result.timingOverlayLayout ||
        result.timingOverlayLayout.timingBottom > result.timingOverlayLayout.sessionTop)
    ) {
      failures.push('live timing overlaps the session HUD')
    }

    if (!result.before.ok) {
      failures.push('initial canvas pixel check failed')
    }

    if (result.layout.scrollWidth > result.layout.innerWidth) {
      failures.push(
        `horizontal overflow: ${result.layout.scrollWidth} > ${result.layout.innerWidth}`,
      )
    }

    if (failures.length > 0) {
      throw new Error(`${result.name} playtest failed: ${failures.join('; ')}`)
    }
  }
} finally {
  await browser.close()
}
