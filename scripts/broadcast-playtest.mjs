import { chromium } from 'playwright'
import { resolve } from 'node:path'

const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173/'

async function inspectCanvas(page) {
  return page.evaluate(async () => {
    const canvas = document.querySelector('canvas')

    if (!canvas) return { ok: false, reason: 'missing canvas' }

    await new Promise((resolveFrame) =>
      requestAnimationFrame(() => requestAnimationFrame(resolveFrame)),
    )

    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl')

    if (!gl) return { ok: false, reason: 'missing webgl context' }

    gl.finish()

    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    const pixels = new Uint8Array(width * height * 4)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)

    let visible = 0
    let colored = 0
    let bright = 0

    for (let index = 0; index < pixels.length; index += 4) {
      const red = pixels[index]
      const green = pixels[index + 1]
      const blue = pixels[index + 2]
      const alpha = pixels[index + 3]
      const maximum = Math.max(red, green, blue)
      const minimum = Math.min(red, green, blue)

      if (alpha > 6) visible += 1
      if (maximum - minimum > 12 && alpha > 6) colored += 1
      if (maximum > 70 && alpha > 6) bright += 1
    }

    const total = width * height

    return {
      alphaRatio: visible / total,
      brightRatio: bright / total,
      coloredRatio: colored / total,
      height,
      ok: visible > total * 0.003 && colored > total * 0.0005,
      width,
    }
  })
}

async function waitForCanvasPixels(page) {
  let result = null

  for (let attempt = 0; attempt < 12; attempt += 1) {
    result = await inspectCanvas(page)

    if (result.ok) return result

    await page.waitForTimeout(250)
  }

  return result
}

async function runViewport(browser, name, viewport, screenshotPath) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 1 })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('https://api.openf1.org/**', (route) => route.abort())

  await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.broadcast-app')
  await page.waitForSelector('canvas')
  await page.waitForTimeout(1800)

  const leaderboardRows = await page.locator('.leaderboard-rows li').count()
  const trackTitle = await page.locator('.broadcast-track-panel .broadcast-panel-header').innerText()
  const headerText = await page.locator('.broadcast-topbar').innerText()

  await page.locator('.broadcast-sidebar button[title="Timing"]').click()
  await page.waitForSelector('.timing-detail-list')
  const miniSectors = await page.locator('.broadcast-mini-sectors span').count()
  const miniSectorStates = await page.locator('.broadcast-mini-sectors span').evaluateAll((bars) => ({
    colored: bars.filter((bar) => !bar.classList.contains('mini-dim')).length,
    dim: bars.filter((bar) => bar.classList.contains('mini-dim')).length,
  }))

  await page.locator('.broadcast-sidebar button[title="Telemetry"]').click()
  const telemetryHeader = await page.locator('.telemetry-table .center-table-head').innerText()
  const telemetryRows = await page.locator('.telemetry-table li').count()

  await page.locator('.broadcast-sidebar button[title="Tyres"]').click()
  const tyreRows = await page.locator('.tyre-detail-table li').count()

  await page.locator('.broadcast-sidebar button[title="Messages"]').click()
  const messageRows = await page.locator('.detail-message-list li').count()

  await page.locator('.broadcast-sidebar button[title="Data"]').click()
  const dataDetails = await page.locator('.data-detail-grid > div').count()
  const tokenInputVisible = await page.locator('.broadcast-data-control input').isVisible()

  const liveClose = page.locator('.broadcast-live-timing .panel-close')
  await liveClose.click()
  const liveTimingClosed = await page.locator('.broadcast-live-timing .restore-panel').isVisible()
  await page.locator('.broadcast-live-timing .restore-panel').click()
  const liveTimingRestored = await page.locator('.data-view').isVisible()

  const messageClose = page.locator('.messages-panel .panel-close')
  await messageClose.click()
  const messagesClosed = await page.locator('.messages-panel .restore-panel').isVisible()
  await page.locator('.messages-panel .restore-panel').click()
  const messagesRestored = await page.locator('.race-message-list').isVisible()

  const sectorToggle = page.getByTitle('Toggle sector tables')
  await sectorToggle.click()
  const sectorsClosed = await page.locator('.analytics-hidden').isVisible()
  await sectorToggle.click()
  const sectorsRestored = await page.locator('.broadcast-bottom-analytics').isVisible()

  await page.locator('.broadcast-sidebar button[title="Overview"]').click()
  const secondDriver = page.locator('.leaderboard-rows li button').nth(1)
  await secondDriver.click()
  const selectedRows = await page.locator('.leaderboard-rows li.selected').count()

  await page.getByRole('button', { name: '60x' }).click()
  await page.waitForTimeout(4_500)
  const speed60Selected = await page.getByRole('button', { name: '60x' }).getAttribute('aria-pressed')
  const pauseButton = page.getByLabel('Pause simulation')
  await pauseButton.click()
  const resumeVisible = await page.getByLabel('Resume simulation').isVisible()
  await page.getByLabel('Resume simulation').click()
  await page.getByRole('button', { name: '1x' }).click()

  await page.getByTitle('chase camera').click()
  const chaseSelected = await page.getByTitle('chase camera').getAttribute('aria-pressed')
  await page.getByTitle('overview camera').click()

  await page.locator('.broadcast-sidebar .sidebar-settings').click()
  await page.waitForSelector('.setup-panel')
  const setupVisible = await page.locator('.setup-panel').isVisible()
  await page.getByLabel('close setup').click()

  await page.getByTitle('Classification').click()
  await page.waitForSelector('.classification-panel')
  const classificationVisible = await page.locator('.classification-panel').isVisible()
  await page.locator('.classification-panel header button').click()

  await page.getByTitle('Selected driver analysis').click()
  await page.waitForSelector('.insights-panel')
  const insightsVisible = await page.locator('.insights-panel').isVisible()
  const strategyControlsVisible = await page.locator('.manual-strategy').isVisible()
  await page.locator('.insights-panel header button').click()

  const canvas = await waitForCanvasPixels(page)
  const activePitRows = await page.locator('.leaderboard-rows li').evaluateAll(
    (rows) => rows.filter((row) => /\bPIT\b/u.test(row.textContent ?? '')).length,
  )
  const layout = await page.evaluate(() => {
    const app = document.querySelector('.broadcast-app')?.getBoundingClientRect()
    const top = document.querySelector('.broadcast-topbar')?.getBoundingClientRect()
    const workspace = document.querySelector('.broadcast-workspace')?.getBoundingClientRect()
    const footer = document.querySelector('.broadcast-footer')?.getBoundingClientRect()
    const panels = Array.from(document.querySelectorAll('.broadcast-workspace > *'))
      .map((element) => element.getBoundingClientRect())
    const clippedButtons = Array.from(document.querySelectorAll('.broadcast-app button'))
      .filter((button) => button.clientWidth > 0 && button.clientHeight > 0)
      .filter((button) => button.scrollWidth > button.clientWidth + 2 || button.scrollHeight > button.clientHeight + 2)
      .length

    return {
      app: app ? { bottom: app.bottom, height: app.height, left: app.left, right: app.right, top: app.top, width: app.width } : null,
      clippedButtons,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      footer: footer ? { bottom: footer.bottom, top: footer.top } : null,
      panels: panels.map((rect) => ({ bottom: rect.bottom, left: rect.left, right: rect.right, top: rect.top })),
      top: top ? { bottom: top.bottom, top: top.top } : null,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      workspace: workspace ? { bottom: workspace.bottom, left: workspace.left, right: workspace.right, top: workspace.top } : null,
    }
  })

  await page.screenshot({ path: screenshotPath, fullPage: true })
  await page.close()

  return {
    activePitRows,
    canvas,
    chaseSelected,
    classificationVisible,
    dataDetails,
    headerText,
    insightsVisible,
    layout,
    leaderboardRows,
    liveTimingClosed,
    liveTimingRestored,
    messageRows,
    messagesClosed,
    messagesRestored,
    miniSectors,
    miniSectorStates,
    name,
    pageErrors,
    resumeVisible,
    screenshotPath,
    sectorsClosed,
    sectorsRestored,
    selectedRows,
    setupVisible,
    speed60Selected,
    strategyControlsVisible,
    telemetryHeader,
    telemetryRows,
    tokenInputVisible,
    trackTitle,
    tyreRows,
  }
}

const browser = await chromium.launch({ headless: true })

try {
  const results = [
    await runViewport(browser, 'desktop', { width: 1440, height: 900 }, resolve('qa-broadcast-desktop.png')),
    await runViewport(browser, 'desktop-compact', { width: 1280, height: 720 }, resolve('qa-broadcast-compact.png')),
  ]

  console.log(JSON.stringify(results, null, 2))

  for (const result of results) {
    const failures = []

    if (result.leaderboardRows < 22) failures.push(`expected 22 leaderboard rows, saw ${result.leaderboardRows}`)
    if (result.activePitRows >= result.leaderboardRows / 2) failures.push(`implausible simultaneous pit wave: ${result.activePitRows} cars`)
    if (!result.headerText.includes('AUSTRALIAN GRAND PRIX 2026')) failures.push('official event name missing from header')
    if (!result.headerText.includes('km/h')) failures.push('broadcast wind speed must use km/h')
    if (result.miniSectors < 240) failures.push(`expected timing mini sectors, saw ${result.miniSectors}`)
    if (result.miniSectorStates.colored === 0 || result.miniSectorStates.dim === 0) failures.push('mini sectors need completed and pending states')
    for (const label of ['SPD', 'THR', 'BRK', 'GEAR', 'RPM', 'ERS', 'SOURCE']) {
      if (!result.telemetryHeader.includes(label)) failures.push(`telemetry header missing ${label}`)
    }
    if (result.telemetryRows < 10 || result.tyreRows < 10) failures.push('detail tables did not render ten drivers')
    if (result.dataDetails < 10 || !result.tokenInputVisible) failures.push('data reliability view is incomplete')
    if (!result.liveTimingClosed || !result.liveTimingRestored) failures.push('live timing close/restore failed')
    if (!result.messagesClosed || !result.messagesRestored) failures.push('message close/restore failed')
    if (!result.sectorsClosed || !result.sectorsRestored) failures.push('sector table toggle failed')
    if (result.selectedRows !== 1) failures.push(`expected one selected timing row, saw ${result.selectedRows}`)
    if (result.speed60Selected !== 'true' || !result.resumeVisible) failures.push('playback controls failed')
    if (result.chaseSelected !== 'true') failures.push('camera switch failed')
    if (!result.setupVisible || !result.classificationVisible || !result.insightsVisible || !result.strategyControlsVisible) failures.push('secondary functional panels failed')
    if (!result.canvas?.ok) failures.push(`canvas pixels invalid: ${JSON.stringify(result.canvas)}`)
    if (result.pageErrors.length > 0) failures.push(`page errors: ${result.pageErrors.join('; ')}`)
    if (result.layout.documentWidth !== result.layout.viewportWidth || result.layout.documentHeight !== result.layout.viewportHeight) failures.push(`viewport overflow ${result.layout.documentWidth}x${result.layout.documentHeight}`)
    if (result.layout.clippedButtons > 0) failures.push(`${result.layout.clippedButtons} visible buttons clip content`)
    if (result.layout.top?.bottom > result.layout.workspace?.top + 1) failures.push('top bar overlaps workspace')
    if (result.layout.workspace?.bottom > result.layout.footer?.top + 1) failures.push('workspace overlaps footer')

    if (failures.length > 0) throw new Error(`${result.name} failed:\n- ${failures.join('\n- ')}`)
  }
} finally {
  await browser.close()
}
