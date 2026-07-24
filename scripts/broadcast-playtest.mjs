import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173/'
// The F1 category this playtest loads runs ten teams of two cars.
const EXPECTED_FIELD_SIZE = 20
const MINI_SECTORS_PER_DRIVER = 24
const artifactDirectory = resolve(
  process.env.QA_ARTIFACT_DIR?.trim() || join(tmpdir(), 'f1-simulator-qa'),
)

await mkdir(artifactDirectory, { recursive: true })

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

async function inspectScroll(locator) {
  return locator.evaluate((element) => {
    const initialScrollTop = element.scrollTop
    const maxScrollTop = Math.max(0, element.scrollHeight - element.clientHeight)
    element.scrollTop = maxScrollTop
    const reachedBottom = Math.abs(element.scrollTop - maxScrollTop) <= 1
    element.scrollTop = initialScrollTop

    return {
      clientHeight: element.clientHeight,
      maxScrollTop,
      reachedBottom,
      scrollHeight: element.scrollHeight,
    }
  })
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
  const leaderboardScroll = await inspectScroll(page.locator('.leaderboard-rows'))
  const liveGapRows = await page.locator('.live-gap-panel li').count()
  const liveGapScroll = await inspectScroll(page.locator('.live-gap-panel ol'))
  const liveTimingTitle = await page.locator('.broadcast-live-timing .broadcast-panel-header').innerText()
  const leaderboardHeader = await page.locator('.leaderboard-column-head').innerText()
  const overviewNavigationItems = await page.locator('.broadcast-sidebar button[title="Overview"]').count()
  const initialFastestText = await page.locator('.fastest-lap-panel').innerText()
  const initialSectorValues = await page.locator('.leaderboard-rows .sector-value').allInnerTexts()
  const initialSectorStatuses = await page.locator('.leaderboard-rows .sector-value').evaluateAll((cells) => ({
    pending: cells.filter((cell) => cell.classList.contains('sector-status-pending')).length,
    total: cells.length,
  }))
  const trackTitle = await page.locator('.broadcast-track-panel .broadcast-panel-header').innerText()
  const removedBottomPanelLabels = await page.evaluate(() => {
    const labels = [
      'LAP TIME COMPARISON',
      'SECTOR TIMES (LIVE)',
      'FUEL LOAD',
      'NEXT EVENTS',
    ]
    const bodyText = document.body.innerText.toUpperCase()

    return labels.filter((label) => bodyText.includes(label))
  })
  const centerMapLayout = await page.evaluate(() => {
    const center = document.querySelector('.broadcast-center-column')?.getBoundingClientRect()
    const map = document.querySelector('.broadcast-track-panel')?.getBoundingClientRect()

    return {
      centerHeight: center?.height ?? 0,
      mapHeight: map?.height ?? 0,
      mapHeightRatio:
        center && map && center.height > 0 ? map.height / center.height : 0,
    }
  })
  const headerText = await page.locator('.broadcast-topbar').innerText()
  const sectorFlagLabels = await page.locator('.sector-flag').allInnerTexts()
  const sectorFlagAriaLabel = await page.locator('.sector-flag-strip').getAttribute('aria-label')

  await page.locator('.broadcast-sidebar button[title="Timing"]').click()
  await page.waitForSelector('.timing-detail-list')
  const timingDetailRows = await page.locator('.timing-detail-list > [role="listitem"]').count()
  const timingDetailScroll = await inspectScroll(page.locator('.timing-detail-list'))
  const miniSectors = await page.locator('.broadcast-mini-sectors span').count()
  const initialMiniSectorStates = await page.locator('.broadcast-mini-sectors span').evaluateAll((bars) => ({
    colored: bars.filter((bar) => !bar.classList.contains('mini-dim')).length,
    dim: bars.filter((bar) => bar.classList.contains('mini-dim')).length,
  }))

  await page.locator('.broadcast-sidebar button[title="Telemetry"]').click()
  const telemetryHeader = await page.locator('.telemetry-table .center-table-head').innerText()
  const telemetryRows = await page.locator('.telemetry-table li').count()
  const telemetryScroll = await inspectScroll(page.locator('.telemetry-table ol'))

  await page.locator('.broadcast-sidebar button[title="Tyres"]').click()
  const tyreRows = await page.locator('.tyre-detail-table li').count()
  const tyreHeader = await page.locator('.tyre-detail-table .center-table-head').innerText()
  const tyreScroll = await inspectScroll(page.locator('.tyre-detail-table ol'))

  await page.locator('.broadcast-sidebar button[title="Drivers"]').click()
  const driverRows = await page.locator('.driver-detail-table li').count()
  const driverNumberLabels = await page
    .locator('.driver-detail-table li strong')
    .allInnerTexts()
  const driverScroll = await inspectScroll(page.locator('.driver-detail-table ol'))

  await page.locator('.broadcast-sidebar button[title="Season"]').click()
  const seasonStandingsSections = await page.locator('.season-standings section').count()
  const seasonEmptyStateVisible = await page
    .locator('.broadcast-live-timing .empty-detail')
    .count() > 0
  // A fresh profile has no recorded rounds; a persisted one shows both tables.
  const seasonViewOk = seasonStandingsSections === 2 || seasonEmptyStateVisible

  await page.locator('.broadcast-sidebar button[title="Messages"]').click()
  const messageRows = await page.locator('.detail-message-list li').count()

  await page.locator('.broadcast-sidebar button[title="Data"]').click()
  const dataDetails = await page.locator('.data-detail-grid > div').count()
  const tokenInputVisible = await page.locator('.broadcast-data-control input').isVisible()

  await page.getByRole('button', { name: 'Manage series data' }).click()
  await page.waitForSelector('.series-data-manager')
  await page.getByLabel('Filter series').selectOption('all')
  await page.waitForFunction(
    () => document.querySelectorAll('.driver-directory-list li').length === 110,
  )
  const dataManagerDriverRows = await page.locator('.driver-directory-list li').count()
  const dataManagerDriverScroll = await inspectScroll(page.locator('.driver-directory-list'))
  if (name === 'desktop') {
    await page.screenshot({
      path: join(artifactDirectory, 'series-data-manager-drivers.png'),
      fullPage: true,
    })
  }
  await page.getByRole('button', { name: /^Teams /u }).click()
  const dataManagerTeamRows = await page.locator('.team-data-list button').count()
  await page.getByRole('button', { name: 'Rules' }).click()
  const dataManagerRuleRows = await page.locator('.event-rule-table > div').count()
  const dataManagerRuleInputs = await page.locator('.rule-editor-controls input, .rule-editor-controls select, .qualifying-rule-editor input').count()
  const dataManagerQualifyingRows = await page.locator('.qualifying-rule-editor > div').count()
  await page.locator('.event-rule-table button', { hasText: 'f1-16' }).click()
  const dataManagerEventInputs = await page.locator('.event-rule-editor input, .event-rule-editor select').count()
  const dataManagerSelectedEvent = await page.locator('.event-rule-editor header').innerText()
  if (name === 'desktop') {
    await page.screenshot({
      path: join(artifactDirectory, 'series-data-manager-rules.png'),
      fullPage: true,
    })
  }
  await page.getByRole('button', { name: 'Backup' }).click()
  const dataManagerAudit = await page.locator('.configuration-audit-grid').innerText()
  const dataManagerLayout = await page.locator('.series-data-manager').evaluate((element) => ({
    clientHeight: element.clientHeight,
    clientWidth: element.clientWidth,
    scrollHeight: element.scrollHeight,
    scrollWidth: element.scrollWidth,
  }))
  await page.getByLabel('Close data manager').click()

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

  const secondDriver = page.locator('.leaderboard-rows li button').nth(1)
  await secondDriver.click()
  const selectedRows = await page.locator('.leaderboard-rows li.selected').count()

  await page.getByRole('button', { name: '60x' }).click()
  let observedOverallBest = false
  let observedMeasuredSector = false

  for (let sample = 0; sample < 45; sample += 1) {
    await page.waitForTimeout(100)
    const measuredSectorCount = await page
      .locator(
        '.leaderboard-rows .sector-status-overall-best, .leaderboard-rows .sector-status-personal-best, .leaderboard-rows .sector-status-slower',
      )
      .count()

    observedOverallBest ||=
      (await page.locator('.leaderboard-rows .sector-status-overall-best').count()) > 0
    observedMeasuredSector ||= measuredSectorCount > 0
  }

  const batteryValues = await page.locator('.leaderboard-rows button > span:last-child').allInnerTexts()
  const tireLifeValues = await page.locator('.leaderboard-tire-life').allInnerTexts()
  const sectorStatuses = await page.locator('.leaderboard-rows .sector-value').evaluateAll((cells) => ({
    overallBest: cells.filter((cell) => cell.classList.contains('sector-status-overall-best')).length,
    personalBest: cells.filter((cell) => cell.classList.contains('sector-status-personal-best')).length,
    slower: cells.filter((cell) => cell.classList.contains('sector-status-slower')).length,
  }))
  await page.locator('.broadcast-sidebar button[title="Timing"]').click()
  const runningMiniSectorStates = await page.locator('.broadcast-mini-sectors span').evaluateAll((bars) => ({
    colored: bars.filter((bar) => !bar.classList.contains('mini-dim')).length,
    dim: bars.filter((bar) => bar.classList.contains('mini-dim')).length,
  }))
  const timingLapRows = await page.locator('.timing-detail-list > [role="listitem"]').evaluateAll((rows) =>
    rows.map((row) => ({
      label: row.querySelector('.timing-lap-source > small')?.textContent ?? '',
      status: row.getAttribute('data-car-status') ?? '',
    })),
  )
  const timingLapLabels = timingLapRows.map((row) => row.label)
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
  const driverTunePanel = page.locator('.setup-section').filter({ hasText: 'Driver tune' })
  const driverAbilitySliders = driverTunePanel.locator('input[type="range"]')
  const driverAbilityMaxes = await driverAbilitySliders.evaluateAll((inputs) => inputs.map((input) => input.getAttribute('max')))
  const driverAbilityValues = await driverTunePanel.locator('.slider-row strong').allInnerTexts()
  const driverOverallAbility = await page.locator('.driver-overall-rating strong').innerText()
  const firstAbilityValue = await driverAbilitySliders.first().inputValue()
  await driverAbilitySliders.first().fill(firstAbilityValue === '0.55' ? '1' : '0.55')
  const editedDriverOverallAbility = await page.locator('.driver-overall-rating strong').innerText()
  const driverAbilityControlChanged = editedDriverOverallAbility !== driverOverallAbility
  await driverAbilitySliders.first().fill(firstAbilityValue)
  await page.getByLabel('close setup').click()

  await page.getByTitle('Classification').click()
  await page.waitForSelector('.classification-panel')
  const classificationVisible = await page.locator('.classification-panel').isVisible()
  await page.getByLabel('Show lap chart').click()
  // A car holding its grid position draws a flat polyline with a zero-height
  // bounding box, which Playwright treats as invisible; require attachment.
  await page.waitForSelector('.lap-chart svg polyline', { state: 'attached' })
  const lapChartLineCount = await page.locator('.lap-chart svg polyline').count()
  await page.getByLabel('Hide lap chart').click()
  await page.getByLabel('hide classification').click()

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
    batteryValues,
    canvas,
    centerMapLayout,
    chaseSelected,
    classificationVisible,
    lapChartLineCount,
    seasonViewOk,
    dataDetails,
    dataManagerAudit,
    dataManagerDriverRows,
    dataManagerDriverScroll,
    dataManagerEventInputs,
    dataManagerLayout,
    dataManagerQualifyingRows,
    dataManagerRuleInputs,
    dataManagerRuleRows,
    dataManagerSelectedEvent,
    dataManagerTeamRows,
    headerText,
    initialFastestText,
    initialSectorStatuses,
    initialSectorValues,
    insightsVisible,
    layout,
    leaderboardRows,
    leaderboardScroll,
    leaderboardHeader,
    liveGapRows,
    liveGapScroll,
    liveTimingTitle,
    liveTimingClosed,
    liveTimingRestored,
    messageRows,
    messagesClosed,
    messagesRestored,
    miniSectors,
    driverAbilityMaxes,
    driverAbilityControlChanged,
    driverOverallAbility,
    driverAbilityValues,
    initialMiniSectorStates,
    name,
    observedMeasuredSector,
    observedOverallBest,
    overviewNavigationItems,
    pageErrors,
    removedBottomPanelLabels,
    resumeVisible,
    screenshotPath,
    sectorStatuses,
    selectedRows,
    sectorFlagAriaLabel,
    sectorFlagLabels,
    setupVisible,
    speed60Selected,
    strategyControlsVisible,
    telemetryHeader,
    telemetryRows,
    telemetryScroll,
    tireLifeValues,
    timingDetailRows,
    timingDetailScroll,
    timingLapLabels,
    timingLapRows,
    runningMiniSectorStates,
    tokenInputVisible,
    trackTitle,
    tyreHeader,
    tyreRows,
    tyreScroll,
    driverRows,
    driverNumberLabels,
    driverScroll,
  }
}

async function inspectSeriesModes(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('https://api.openf1.org/**', (route) => route.abort())
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.broadcast-app')

  const seriesSelector = page.getByLabel('Racing series')
  const seriesOptions = await seriesSelector.locator('option').evaluateAll((options) =>
    options.map((option) => option.value),
  )
  const results = {}

  for (const [seriesId, expectedCars] of [
    ['f2', 22],
    ['f3', 30],
    ['super-formula', 24],
  ]) {
    await seriesSelector.selectOption(seriesId)
    await page.waitForFunction(
      (count) => document.querySelectorAll('.leaderboard-rows li').length === count,
      expectedCars,
    )
    results[seriesId] = {
      cars: await page.locator('.leaderboard-rows li').count(),
      eventName: await page.locator('.broadcast-brand strong').innerText(),
      timingTitle: await page
        .locator('.broadcast-live-timing .broadcast-panel-header')
        .innerText(),
    }

    if (seriesId === 'f3') {
      await page.locator('.broadcast-sidebar .sidebar-settings').click()
      await page.waitForSelector('.setup-panel')
      const eventSelector = page.getByLabel('Championship round')
      await eventSelector.selectOption('f3-09')
      await page.waitForFunction(
        () =>
          Array.from(
            document.querySelectorAll('select[aria-label="Weekend session"] option'),
          ).some((option) => option.value === 'race2'),
      )
      results.f3.madridSessions = await page
        .getByLabel('Weekend session')
        .locator('option')
        .evaluateAll((options) => options.map((option) => option.value))
      results.f3.madridScreenshot = join(
        artifactDirectory,
        'broadcast-f3-madrid.png',
      )
      await page.screenshot({ path: results.f3.madridScreenshot, fullPage: true })
      await page.getByLabel('close setup').click()
    }
  }

  await page.locator('.broadcast-sidebar .sidebar-settings').click()
  await page.waitForSelector('.setup-panel')
  await page.getByLabel('Championship round').selectOption('sf-03-replacement')
  await page.waitForFunction(
    () =>
      document.querySelector('select[aria-label="Weekend session"]')?.value ===
      'race',
  )
  results['super-formula'].replacementSessions = await page
    .getByLabel('Weekend session')
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.value))
  results['super-formula'].replacementProgress = await page
    .locator('.broadcast-session-core')
    .innerText()
  results['super-formula'].replacementScreenshot = join(
    artifactDirectory,
    'broadcast-sf-replacement.png',
  )
  await page.screenshot({
    path: results['super-formula'].replacementScreenshot,
    fullPage: true,
  })
  await page.close()

  return { pageErrors, results, seriesOptions }
}

const browser = await chromium.launch({ headless: true })

try {
  const results = [
    await runViewport(browser, 'desktop', { width: 1440, height: 900 }, join(artifactDirectory, 'broadcast-desktop.png')),
    await runViewport(browser, 'desktop-compact', { width: 1280, height: 720 }, join(artifactDirectory, 'broadcast-compact.png')),
  ]
  const seriesModes = await inspectSeriesModes(browser)

  console.log(JSON.stringify({ seriesModes, viewports: results }, null, 2))

  for (const result of results) {
    const failures = []

    if (result.leaderboardRows !== EXPECTED_FIELD_SIZE) failures.push(`expected ${EXPECTED_FIELD_SIZE} leaderboard rows, saw ${result.leaderboardRows}`)
    if (!result.leaderboardHeader.includes('SPD')) failures.push('leaderboard speed column missing')
    if (!result.leaderboardHeader.includes('BAT')) failures.push('leaderboard battery column missing')
    if (result.overviewNavigationItems !== 0) failures.push('redundant overview navigation is still present')
    if (!result.initialFastestText.includes('--:--.---') || !result.initialFastestText.includes('Awaiting completed lap')) failures.push('initial fastest lap must wait for a measured CPU lap')
    if (result.initialSectorValues.some((value) => value !== '--.---')) failures.push('initial sector cells must remain unmeasured')
    if (result.initialSectorStatuses.pending !== result.initialSectorStatuses.total) failures.push('initial sector cells must all use the pending state')
    if (!result.observedOverallBest) failures.push('completed sectors never showed a provisional overall-best state')
    if (!result.observedMeasuredSector) failures.push('completed sectors never showed a measured color state')
    if (result.batteryValues.some((value) => !/^\d+%$/u.test(value))) failures.push('leaderboard battery values are invalid')
    if (result.activePitRows >= result.leaderboardRows / 2) failures.push(`implausible simultaneous pit wave: ${result.activePitRows} cars`)
    if (!result.headerText.includes('AUSTRALIAN GRAND PRIX 2026')) failures.push('official event name missing from header')
    if (!result.headerText.includes('km/h')) failures.push('broadcast wind speed must use km/h')
    const expectedMiniSectors = EXPECTED_FIELD_SIZE * MINI_SECTORS_PER_DRIVER
    if (result.miniSectors < expectedMiniSectors) failures.push(`expected ${expectedMiniSectors} complete timing mini-sector cells, saw ${result.miniSectors}`)
    if (result.initialMiniSectorStates.colored !== 0 || result.initialMiniSectorStates.dim !== result.miniSectors) failures.push('initial mini sectors must all be pending')
    const validSectorFlag = /(CLEAR|YELLOW|DOUBLE YELLOW|VSC|SC|RED)/u
    if (result.sectorFlagLabels.length !== 3 || result.sectorFlagLabels.some((label, index) => !label.includes(`S${index + 1}`) || !validSectorFlag.test(label))) failures.push(`sector flag strip is incomplete: ${result.sectorFlagLabels.join(', ')}`)
    if (!result.sectorFlagAriaLabel?.includes('Sector 1') || !result.sectorFlagAriaLabel.includes('Sector 3')) failures.push('sector flag strip needs an accessible per-sector summary')
    if (result.runningMiniSectorStates.colored === 0 || result.runningMiniSectorStates.dim === 0) failures.push('running mini sectors need completed and pending states')
    const invalidTimingLapRows = result.timingLapRows.filter(
      (row) =>
        !/^L\d+$/u.test(row.label) &&
        !['retired', 'disqualified', 'dns'].includes(row.status),
    )
    if (invalidTimingLapRows.length > 0) failures.push(`active timing rows need measured lap labels: ${JSON.stringify(invalidTimingLapRows)}`)
    if (result.driverAbilityMaxes.length !== 12 || result.driverAbilityValues.length !== 12 || result.driverAbilityMaxes.some((value) => value !== '1')) failures.push('driver editor must expose 12 grouped sliders with the 100-point ceiling')
    if (!result.driverAbilityControlChanged) failures.push('grouped driver ability control did not update the calculated overall rating')
    if (result.driverAbilityValues.some((value) => Number(value) > 100)) failures.push('CSV-configured driver abilities exceed the 100-point scale')
    if (!/^\d{1,3}$/u.test(result.driverOverallAbility) || Number(result.driverOverallAbility) > 100) failures.push(`driver overall ability is invalid: ${result.driverOverallAbility}`)
    if (!result.driverNumberLabels.includes('#31 NAK')) failures.push(`NAK car number 31 is missing: ${result.driverNumberLabels.join(', ')}`)
    if (result.removedBottomPanelLabels.length > 0) failures.push(`removed bottom panels are still visible: ${result.removedBottomPanelLabels.join(', ')}`)
    if (result.centerMapLayout.mapHeightRatio < 0.55) failures.push(`track map did not expand into the removed panel space: ${JSON.stringify(result.centerMapLayout)}`)
    if (result.tireLifeValues.some((value) => !/^\d{1,3}$/u.test(value) || Number(value) < 0 || Number(value) > 100)) failures.push(`tyre life must be a 100-to-0 remaining value: ${result.tireLifeValues.join(', ')}`)
    if (result.tireLifeValues.every((value) => Number(value) === 100)) failures.push('tyre life never decreased from 100 during the accelerated run')
    for (const label of ['SPD', 'THR', 'BRK', 'GEAR', 'RPM', 'ERS', 'SOURCE']) {
      if (!result.telemetryHeader.includes(label)) failures.push(`telemetry header missing ${label}`)
    }
    for (const [name, count] of [
      ['timing', result.timingDetailRows],
      ['telemetry', result.telemetryRows],
      ['tyres', result.tyreRows],
      ['drivers', result.driverRows],
    ]) {
      if (count !== result.leaderboardRows) failures.push(`${name} table rendered ${count}/${result.leaderboardRows} drivers`)
    }
    if (result.liveGapRows !== result.leaderboardRows - 1) failures.push(`live gap rendered ${result.liveGapRows}/${result.leaderboardRows - 1} trailing drivers`)
    if (!result.liveTimingTitle.includes(`ALL ${result.leaderboardRows}`)) failures.push(`live timing field label is stale: ${result.liveTimingTitle}`)
    for (const [name, metrics] of [
      ['leaderboard', result.leaderboardScroll],
      ['timing', result.timingDetailScroll],
      ['telemetry', result.telemetryScroll],
      ['tyres', result.tyreScroll],
      ['drivers', result.driverScroll],
      ['live gap', result.liveGapScroll],
    ]) {
      // A list that already shows every driver has nothing to scroll, which is
      // still every driver reachable.
      const fitsWithoutScrolling = metrics.scrollHeight <= metrics.clientHeight + 1
      if (!fitsWithoutScrolling && (metrics.maxScrollTop <= 0 || !metrics.reachedBottom)) failures.push(`${name} list cannot scroll through all drivers: ${JSON.stringify(metrics)}`)
    }
    if (!result.tyreHeader.includes('PACE DELTA') || !result.tyreHeader.includes('SOURCE')) failures.push('tyre model provenance is missing')
    if (result.dataDetails < 10 || !result.tokenInputVisible) failures.push('data reliability view is incomplete')
    if (result.dataManagerDriverRows !== 110) failures.push(`data manager rendered ${result.dataManagerDriverRows}/110 pool drivers`)
    if (result.dataManagerDriverScroll.maxScrollTop <= 0 || !result.dataManagerDriverScroll.reachedBottom) failures.push(`driver directory cannot scroll: ${JSON.stringify(result.dataManagerDriverScroll)}`)
    if (result.dataManagerTeamRows !== 10) failures.push(`data manager rendered ${result.dataManagerTeamRows}/10 F1 teams`)
    if (result.dataManagerRuleRows !== 25) failures.push(`data manager rendered ${result.dataManagerRuleRows - 1}/24 F1 events`)
    if (result.dataManagerRuleInputs < 10 || result.dataManagerQualifyingRows !== 4) failures.push(`rule editor is incomplete: ${result.dataManagerRuleInputs} inputs / ${result.dataManagerQualifyingRows - 1} segments`)
    if (result.dataManagerEventInputs < 7 || !result.dataManagerSelectedEvent.includes('f1-16')) failures.push(`event override editor is incomplete: ${result.dataManagerEventInputs} inputs / ${result.dataManagerSelectedEvent}`)
    if (!result.dataManagerAudit.includes('Driver records') || !result.dataManagerAudit.includes(`${EXPECTED_FIELD_SIZE} / ${EXPECTED_FIELD_SIZE}`) || !result.dataManagerAudit.includes('Pool records') || !result.dataManagerAudit.includes('110')) failures.push(`data manager audit is incomplete: ${result.dataManagerAudit}`)
    if (result.dataManagerLayout.scrollWidth !== result.dataManagerLayout.clientWidth || result.dataManagerLayout.scrollHeight !== result.dataManagerLayout.clientHeight) failures.push(`data manager overflows its frame: ${JSON.stringify(result.dataManagerLayout)}`)
    if (!result.liveTimingClosed || !result.liveTimingRestored) failures.push('live timing close/restore failed')
    if (!result.messagesClosed || !result.messagesRestored) failures.push('message close/restore failed')
    if (result.selectedRows !== 1) failures.push(`expected one selected timing row, saw ${result.selectedRows}`)
    if (result.speed60Selected !== 'true' || !result.resumeVisible) failures.push('playback controls failed')
    if (result.chaseSelected !== 'true') failures.push('camera switch failed')
    if (!result.setupVisible || !result.classificationVisible || !result.insightsVisible || !result.strategyControlsVisible) failures.push('secondary functional panels failed')
    if (result.lapChartLineCount < EXPECTED_FIELD_SIZE) failures.push(`lap chart drew ${result.lapChartLineCount} of ${EXPECTED_FIELD_SIZE} car lines`)
    if (!result.seasonViewOk) failures.push('season standings view rendered neither tables nor its empty state')
    if (!result.canvas?.ok) failures.push(`canvas pixels invalid: ${JSON.stringify(result.canvas)}`)
    if (result.pageErrors.length > 0) failures.push(`page errors: ${result.pageErrors.join('; ')}`)
    if (result.layout.documentWidth !== result.layout.viewportWidth || result.layout.documentHeight !== result.layout.viewportHeight) failures.push(`viewport overflow ${result.layout.documentWidth}x${result.layout.documentHeight}`)
    if (result.layout.clippedButtons > 0) failures.push(`${result.layout.clippedButtons} visible buttons clip content`)
    if (result.layout.top?.bottom > result.layout.workspace?.top + 1) failures.push('top bar overlaps workspace')
    if (result.layout.workspace?.bottom > result.layout.footer?.top + 1) failures.push('workspace overlaps footer')

    if (failures.length > 0) throw new Error(`${result.name} failed:\n- ${failures.join('\n- ')}`)
  }

  const expectedCars = { f2: 22, f3: 30, 'super-formula': 24 }
  const seriesFailures = []
  if (seriesModes.seriesOptions.join(',') !== 'f1-custom,f2,f3,super-formula') {
    seriesFailures.push(`series selector is incomplete: ${seriesModes.seriesOptions.join(', ')}`)
  }
  for (const [seriesId, carCount] of Object.entries(expectedCars)) {
    const result = seriesModes.results[seriesId]
    if (result.cars !== carCount) seriesFailures.push(`${seriesId} rendered ${result.cars}/${carCount} cars`)
    if (!result.timingTitle.includes(`ALL ${carCount}`)) seriesFailures.push(`${seriesId} timing title is stale: ${result.timingTitle}`)
  }
  const madridSessions = seriesModes.results.f3.madridSessions ?? []
  if (madridSessions.join(',') !== 'fp1,qualifying,qualifying2,sprint,race,race2') {
    seriesFailures.push(`Madrid session order is wrong: ${madridSessions.join(', ')}`)
  }
  const replacement = seriesModes.results['super-formula']
  if (replacement.replacementSessions?.join(',') !== 'race') {
    seriesFailures.push(`SF replacement event has extra sessions: ${replacement.replacementSessions?.join(', ')}`)
  }
  if (!/1\s*\/\s*25/u.test(replacement.replacementProgress)) {
    seriesFailures.push(`SF replacement event is not 25 laps: ${replacement.replacementProgress}`)
  }
  if (seriesModes.pageErrors.length > 0) {
    seriesFailures.push(`series mode page errors: ${seriesModes.pageErrors.join('; ')}`)
  }
  if (seriesFailures.length > 0) {
    throw new Error(`multi-series failed:\n- ${seriesFailures.join('\n- ')}`)
  }
} finally {
  await browser.close()
}
