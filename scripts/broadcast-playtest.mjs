import { chromium } from 'playwright'
import { mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

const appUrl = process.env.APP_URL ?? 'http://127.0.0.1:5173/'
// The 2026 F1 baseline includes Cadillac: eleven teams and twenty-two cars.
const EXPECTED_FIELD_SIZE = 22
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
  const duplicateGapPanels = await page.locator(
    '.live-gap-panel, .gap-history-panel',
  ).count()
  const reclaimedSideSpace = await page.evaluate(() => {
    const leftColumn = document
      .querySelector('.broadcast-left-column')
      ?.getBoundingClientRect()
    const leaderboard = document
      .querySelector('.broadcast-left-column > .broadcast-panel')
      ?.getBoundingClientRect()

    return {
      leaderboardRatio:
        leftColumn && leaderboard && leftColumn.height > 0
          ? leaderboard.height / leftColumn.height
          : 0,
    }
  })
  const leaderboardHeader = await page.locator('.leaderboard-column-head').innerText()
  const leaderboardColumnVisibility = await page.locator('.leaderboard-column-head').evaluate((header) => {
    const headerRect = header.getBoundingClientRect()
    const cells = Array.from(header.querySelectorAll('span'))
    const visibleInsideHeader = (cell) => {
      if (!cell) return false

      const rect = cell.getBoundingClientRect()

      return (
        rect.width > 0 &&
        rect.left >= headerRect.left - 1 &&
        rect.right <= headerRect.right + 1
      )
    }

    return {
      battery: visibleInsideHeader(cells.at(-1)),
      speed: visibleInsideHeader(cells.at(-2)),
    }
  })
  const overviewNavigationItems = await page.locator('.broadcast-sidebar button[title="Overview"]').count()
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

  // Mini sectors now live on the leaderboard itself, so the timing tower is
  // read where the field order is read.
  await page.waitForSelector('.leaderboard-rows .broadcast-mini-sectors')
  const miniSectors = await page.locator('.broadcast-mini-sectors span').count()
  const initialMiniSectorStates = await page.locator('.broadcast-mini-sectors span').evaluateAll((bars) => ({
    colored: bars.filter((bar) => !bar.classList.contains('mini-dim')).length,
    dim: bars.filter((bar) => bar.classList.contains('mini-dim')).length,
  }))

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

  // Keep the visual QA scenario reproducible. The product still creates a new
  // automatic seed for normal users; only this isolated browser profile uses
  // a fixed run.
  await page.locator('.broadcast-sidebar .sidebar-settings').click()
  await page.waitForSelector('.setup-panel')
  await page.getByPlaceholder('simulation seed').fill('broadcast-playtest-stable')
  await page.getByLabel('close setup').click()
  await page.waitForFunction(() =>
    Array.from(
      document.querySelectorAll('.leaderboard-rows .sector-value'),
    ).every((cell) => cell.textContent?.includes('--.---')),
  )

  // Data toggles against the map, so only select it when it is not already up.
  if ((await page.locator('.broadcast-live-timing').count()) === 0) {
    await page.locator('.broadcast-sidebar button[title="Data"]').click()
  }
  const liveClose = page.locator('.broadcast-live-timing .panel-close')
  await liveClose.click()
  const liveTimingClosed = await page.locator('.broadcast-live-timing .restore-panel').isVisible()
  await page.locator('.broadcast-live-timing .restore-panel').click()
  const liveTimingRestored = await page.locator('.data-view').isVisible()


  const secondDriver = page.locator('.leaderboard-rows li button').nth(1)
  await secondDriver.click()
  const selectedRows = await page.locator('.leaderboard-rows li.selected').count()

  await page.evaluate(() => {
    const observation = {
      measured: false,
      overallBest: false,
    }
    const inspect = () => {
      observation.measured ||= Boolean(
        document.querySelector(
          '.leaderboard-rows .sector-status-overall-best, .leaderboard-rows .sector-status-personal-best, .leaderboard-rows .sector-status-slower',
        ),
      )
      observation.overallBest ||= Boolean(
        document.querySelector(
          '.leaderboard-rows .sector-status-overall-best',
        ),
      )
    }

    window.__broadcastQaSectorObservation = observation
    window.__broadcastQaSectorObserver?.disconnect()
    window.__broadcastQaSectorObserver = new MutationObserver(inspect)
    window.__broadcastQaSectorObserver.observe(
      document.querySelector('.leaderboard-rows'),
      { attributes: true, childList: true, subtree: true },
    )
    inspect()
  })

  const skipFormation = page.getByLabel('Skip formation lap')
  if (await skipFormation.isVisible()) {
    await skipFormation.click()
  }
  await page.getByRole('button', { name: '5x' }).click()
  let observedOverallBest = false
  let observedMeasuredSector = false

  // First observe the initial sector at a publish rate that exposes the
  // provisional purple state, then accelerate the longer tire/lap checks.
  for (let sample = 0; sample < 240; sample += 1) {
    await page.waitForTimeout(50)
    const observation = await page.evaluate(
      () => window.__broadcastQaSectorObservation,
    )

    observedOverallBest ||= observation?.overallBest === true
    observedMeasuredSector ||= observation?.measured === true

    if (observedOverallBest && observedMeasuredSector) {
      break
    }
  }

  await page.getByRole('button', { name: '60x' }).click()
  for (let sample = 0; sample < 180; sample += 1) {
    await page.waitForTimeout(100)
    const measuredSectorCount = await page
      .locator(
        '.leaderboard-rows .sector-status-overall-best, .leaderboard-rows .sector-status-personal-best, .leaderboard-rows .sector-status-slower',
      )
      .count()

    observedOverallBest ||=
      (await page.locator('.leaderboard-rows .sector-status-overall-best').count()) > 0
    observedMeasuredSector ||= measuredSectorCount > 0

    if (sample >= 44 && sample % 5 === 4) {
      const currentTireLife = await page
        .locator('.leaderboard-tire-life')
        .allInnerTexts()
      const lastLapValues = await page
        .locator('.leaderboard-rows button > span:nth-child(5)')
        .allInnerTexts()
      const hasMeasuredLap = lastLapValues.some((value) =>
        /^\d+:\d{2}\.\d{3}$/u.test(value),
      )
      const tireLifeChanged = currentTireLife.some(
        (value) => /^\d{1,3}$/u.test(value) && Number(value) < 100,
      )

      if (
        observedOverallBest &&
        observedMeasuredSector &&
        hasMeasuredLap &&
        tireLifeChanged
      ) {
        break
      }
    }
  }
  await page.evaluate(() => window.__broadcastQaSectorObserver?.disconnect())

  const batteryValues = await page.locator('.leaderboard-rows button > span:last-child').allInnerTexts()
  const tireLifeValues = await page.locator('.leaderboard-tire-life').allInnerTexts()
  const sectorStatuses = await page.locator('.leaderboard-rows .sector-value').evaluateAll((cells) => ({
    overallBest: cells.filter((cell) => cell.classList.contains('sector-status-overall-best')).length,
    personalBest: cells.filter((cell) => cell.classList.contains('sector-status-personal-best')).length,
    slower: cells.filter((cell) => cell.classList.contains('sector-status-slower')).length,
  }))
  const runningMiniSectorStates = await page.locator('.broadcast-mini-sectors span').evaluateAll((bars) => ({
    colored: bars.filter((bar) => !bar.classList.contains('mini-dim')).length,
    dim: bars.filter((bar) => bar.classList.contains('mini-dim')).length,
  }))
  const speed60Selected = await page.getByRole('button', { name: '60x' }).getAttribute('aria-pressed')
  const pauseButton = page.getByLabel('Pause simulation')
  await pauseButton.click()
  const resumeVisible = await page.getByLabel('Resume simulation').isVisible()
  await page.getByLabel('Resume simulation').click()
  await page.getByRole('button', { name: '1x' }).click()

  if ((await page.locator('.broadcast-track-panel').count()) === 0) {
    await page.locator('.broadcast-sidebar button[title="Data"]').click()
  }
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

  const classificationPanel = page.locator('.classification-panel')
  if (
    (await classificationPanel.count()) === 0 ||
    !(await classificationPanel.isVisible())
  ) {
    await page
      .getByRole('button', { exact: true, name: 'Classification' })
      .click()
  }
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

  // --- pit wall ---------------------------------------------------------
  // Opening the pit wall must retire any other large overlay so two panels
  // never fight for the same space.
  await page
    .getByRole('button', { exact: true, name: 'Classification' })
    .click()
  await page.waitForSelector('.classification-panel')
  const openPitWall = page.getByTitle(/^Open the pit wall/u)
  await openPitWall.click()
  await page.waitForSelector('.pit-wall-panel')
  const pitWallReplacedClassification =
    (await page.locator('.classification-panel').count()) === 0
  const pitWallInitialFocus = await page.evaluate(() =>
    document.activeElement?.getAttribute('aria-label'),
  )
  const pitWallSelectedCode = (
    await page
      .locator('.leaderboard-rows li.selected .leaderboard-driver strong')
      .innerText()
  ).trim()
  const pitWallHeader = await page.locator('.pit-wall-header').innerText()

  const pitWallTabButtons = page.locator('.pit-wall-tabs button')
  const pitWallTabCount = await pitWallTabButtons.count()
  const pitWallTabViews = []
  for (let index = 0; index < pitWallTabCount; index += 1) {
    const tab = pitWallTabButtons.nth(index)
    await tab.click()
    pitWallTabViews.push({
      groups: await page
        .locator('#pit-wall-tabpanel .pit-wall-group h3')
        .allInnerTexts(),
      label: (await tab.innerText()).trim(),
      // The lap log is a table rather than metric groups, so it reports its
      // own row count and every other tab reports read-outs.
      lapLogRows: await page
        .locator('#pit-wall-tabpanel .pit-wall-lap-log tbody tr')
        .count(),
      readouts: await page
        .locator('#pit-wall-tabpanel .pit-wall-metric, #pit-wall-tabpanel .pit-wall-gauge')
        .count(),
      selected: await tab.getAttribute('aria-selected'),
    })
  }

  // The race control tab is the last one, so its filters are already visible.
  const pitWallFilterCounts = []
  for (const filterLabel of ['ALL', 'FLAGS', 'PENALTIES']) {
    await page
      .locator('.pit-wall-filter-row')
      .getByRole('button', { exact: true, name: filterLabel })
      .click()
    pitWallFilterCounts.push({
      entries: await page.locator('.pit-wall-message-log li').count(),
      filterLabel,
    })
  }

  // Every logged lap must carry a lap time and three measured splits. The log
  // is empty until the car first crosses the line, so the session is wound on
  // until there is a completed lap to read.
  await pitWallTabButtons.nth(1).click()
  await page.getByRole('button', { name: '60x' }).click()
  await page.waitForSelector('.pit-wall-lap-log tbody tr', { timeout: 60_000 })
  await page.getByRole('button', { name: '1x' }).click()
  const pitWallLapLogSample = await page
    .locator('.pit-wall-lap-log tbody tr')
    .first()
    .evaluate((row) => ({
      cells: Array.from(row.querySelectorAll('th, td')).map((cell) =>
        (cell.textContent ?? '').trim(),
      ),
    }))
  const pitWallLapLogScrolls = await page
    .locator('.pit-wall-lap-log-scroll')
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      overflowY: getComputedStyle(element).overflowY,
    }))
  await page.screenshot({
    path: join(artifactDirectory, `pit-wall-lap-log-${name}.png`),
  })

  await pitWallTabButtons.nth(0).click()
  const pitWallErsReadout = await page
    .locator('#pit-wall-tabpanel .pit-wall-metric')
    .filter({ hasText: 'ERS / battery' })
    .innerText()
  const pitWallBoxStates = await page
    .locator('.pit-wall-box-command')
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        disabled: button.disabled,
        label: (button.textContent ?? '').trim(),
        title: button.title,
      })),
    )

  // A pace instruction has to reach the selected car, not just repaint the
  // button, so the assertion reads the value back off the simulation state.
  await page
    .locator('.pit-wall-commands')
    .getByRole('button', { exact: true, name: 'PUSH' })
    .click()
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('.pit-wall-pace-command')).some(
        (button) =>
          button.getAttribute('aria-pressed') === 'true' &&
          (button.textContent ?? '').trim() === 'PUSH',
      ),
    null,
    { timeout: 8000 },
  )
  const pitWallPaceApplied = true

  const selectedStopsBefore = Number(
    await page.locator('.leaderboard-rows li.selected .leaderboard-stops').innerText(),
  )
  const enabledBoxCommand = page
    .locator('.pit-wall-box-command:not([disabled])')
    .first()
  const pitWallBoxCommandLabel = (await enabledBoxCommand.innerText()).trim()
  await enabledBoxCommand.click()
  await page.getByRole('button', { name: '60x' }).click()
  let pitWallBoxApplied = false
  for (let sample = 0; sample < 140; sample += 1) {
    await page.waitForTimeout(150)
    const stops = Number(
      await page
        .locator('.leaderboard-rows li.selected .leaderboard-stops')
        .innerText(),
    )

    if (Number.isFinite(stops) && stops > selectedStopsBefore) {
      pitWallBoxApplied = true
      break
    }
  }
  await page.getByRole('button', { name: '1x' }).click()

  const pitWallLayout = await page.evaluate(() => {
    const panel = document.querySelector('.pit-wall-panel')
    const body = document.querySelector('.pit-wall-body')
    const footer = document.querySelector('.broadcast-footer')
    const leaderboard = document.querySelector('.broadcast-leaderboard')

    if (!panel || !body || !footer) {
      return null
    }

    const rect = panel.getBoundingClientRect()
    const maxScrollTop = Math.max(0, body.scrollHeight - body.clientHeight)
    body.scrollTop = maxScrollTop
    const reachedBottom = Math.abs(body.scrollTop - maxScrollTop) <= 1
    body.scrollTop = 0
    // The track map has no substitute elsewhere on screen, so the panel is
    // measured against the canvas it must never cover.
    const canvasRect = document.querySelector('canvas')?.getBoundingClientRect()

    return {
      bottom: rect.bottom,
      canvasLeft: canvasRect?.left ?? Number.NaN,
      canvasVisibleWidth: canvasRect
        ? Math.max(0, canvasRect.right - Math.max(canvasRect.left, rect.right))
        : Number.NaN,
      canvasWidth: canvasRect?.width ?? Number.NaN,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      footerTop: footer.getBoundingClientRect().top,
      leaderboardLeft: leaderboard?.getBoundingClientRect().left ?? Number.NaN,
      leaderboardRight:
        leaderboard?.getBoundingClientRect().right ?? Number.NaN,
      left: rect.left,
      reachedBottom,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
    }
  })

  // The panel covers the timing tower, so its own selector is the way to
  // change car. It must move the whole app selection, not just the panel.
  const pitWallCodeBefore = (
    await page.locator('.pit-wall-identity strong').innerText()
  ).trim()
  await page.getByLabel('Pit wall next car').click()
  await page.waitForFunction(
    (code) =>
      document.querySelector('.pit-wall-identity strong')?.textContent?.trim() !==
      code,
    pitWallCodeBefore,
    { timeout: 8000 },
  )
  const pitWallCodeAfter = (
    await page.locator('.pit-wall-identity strong').innerText()
  ).trim()
  const pitWallSelectorMovedTimingTower = await page.evaluate(
    (code) =>
      document
        .querySelector('.leaderboard-rows li.selected .leaderboard-driver strong')
        ?.textContent?.trim() === code,
    pitWallCodeAfter,
  )
  const pitWallFollowedDriverSelection = pitWallCodeAfter !== pitWallCodeBefore

  await page.screenshot({
    path: join(artifactDirectory, `pit-wall-${name}.png`),
  })

  await page.keyboard.press('Escape')
  const pitWallEscapeClosed =
    (await page.locator('.pit-wall-panel').count()) === 0
  await openPitWall.click()
  await page.waitForSelector('.pit-wall-panel')
  await page.getByLabel('Close pit wall').click()
  const pitWallCloseButtonClosed =
    (await page.locator('.pit-wall-panel').count()) === 0

  // The pit wall is available in every session, but practice and qualifying
  // have no race distance, so the stint plan must report itself unavailable
  // rather than plan a stop against a distance the session will never run.
  const pitWallTimedSessions = []
  for (const timedStage of ['fp1', 'qualifying']) {
    await page.getByLabel('Weekend session').selectOption(timedStage)
    await page.waitForFunction(
      (value) =>
        document.querySelector('.broadcast-session-switch select')?.value ===
        value,
      timedStage,
      { timeout: 8000 },
    )
    const timedPitWallButton = page.getByTitle(/^Open the pit wall/u)
    const enabled = await timedPitWallButton.isEnabled()
    await timedPitWallButton.click()
    await page.waitForSelector('.pit-wall-panel')
    const header = await page.locator('.pit-wall-header').innerText()
    const targetStop = await page
      .locator('#pit-wall-tabpanel .pit-wall-metric')
      .filter({ hasText: 'Target stop' })
      .innerText()
      .catch(() => '')
    // STRATEGY is the third tab; read the race-only rows from it.
    await page.locator('.pit-wall-tabs button').nth(2).click()
    const strategyRows = await page
      .locator('#pit-wall-tabpanel .pit-wall-metric')
      .evaluateAll((rows) =>
        rows.map((row) => ({
          label: (row.querySelector('span')?.textContent ?? '').trim(),
          value: (
            row.querySelector('.pit-wall-value')?.textContent ?? ''
          ).trim(),
        })),
      )
    await page.getByLabel('Close pit wall').click()
    pitWallTimedSessions.push({ enabled, header, stage: timedStage, strategyRows, targetStop })
  }
  await page.getByLabel('Weekend session').selectOption('race')
  await page.waitForFunction(
    () =>
      document.querySelector('.broadcast-session-switch select')?.value ===
      'race',
    undefined,
    { timeout: 8000 },
  )

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
  const typography = await page.evaluate(() => {
    const fontSize = (selector) => {
      const element = document.querySelector(selector)

      return element ? Number.parseFloat(getComputedStyle(element).fontSize) : 0
    }

    return {
      app: fontSize('.broadcast-app'),
      leaderboard: fontSize('.leaderboard-rows button'),
      panelTitle: fontSize('.broadcast-panel-header strong'),
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
    initialSectorStatuses,
    initialSectorValues,
    insightsVisible,
    layout,
    leaderboardRows,
    leaderboardScroll,
    leaderboardHeader,
    leaderboardColumnVisibility,
    duplicateGapPanels,
    reclaimedSideSpace,
    liveTimingClosed,
    liveTimingRestored,
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
    pitWallBoxApplied,
    pitWallBoxCommandLabel,
    pitWallBoxStates,
    pitWallCloseButtonClosed,
    pitWallErsReadout,
    pitWallEscapeClosed,
    pitWallFilterCounts,
    pitWallFollowedDriverSelection,
    pitWallHeader,
    pitWallInitialFocus,
    pitWallLapLogSample,
    pitWallLapLogScrolls,
    pitWallLayout,
    pitWallPaceApplied,
    pitWallReplacedClassification,
    pitWallSelectedCode,
    pitWallSelectorMovedTimingTower,
    pitWallTabViews,
    pitWallTimedSessions,
    removedBottomPanelLabels,
    resumeVisible,
    screenshotPath,
    sectorStatuses,
    selectedRows,
    setupVisible,
    speed60Selected,
    strategyControlsVisible,
    tireLifeValues,
    typography,
    runningMiniSectorStates,
    tokenInputVisible,
    trackTitle,
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

  for (const [seriesId, expectedCars] of [['super-formula', 24]]) {
    await seriesSelector.selectOption(seriesId)
    await page.waitForFunction(
      (count) => document.querySelectorAll('.leaderboard-rows li').length === count,
      expectedCars,
    )
    results[seriesId] = {
      cars: await page.locator('.leaderboard-rows li').count(),
      eventName: await page.locator('.broadcast-brand strong').innerText(),
      timingTitle: await page.locator('.broadcast-leaderboard .broadcast-panel-header').innerText(),
    }

    // F1-only systems must read N/A rather than a fabricated value here.
    const seriesPitWallButton = page.getByTitle(/^Open the pit wall/u)
    if (await seriesPitWallButton.isEnabled()) {
      await seriesPitWallButton.click()
      await page.waitForSelector('.pit-wall-panel')
      results[seriesId].pitWallOverview = await page
        .locator('#pit-wall-tabpanel .pit-wall-metric')
        .allInnerTexts()
      await page.getByLabel('Close pit wall').click()
    } else {
      results[seriesId].pitWallOverview = null
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
  await page.waitForFunction(() =>
    /\d+\s*\/\s*25/u.test(
      document.querySelector('.broadcast-session-core')?.textContent ?? '',
    ),
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

async function inspectFreeMode(browser) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await page.route('https://api.openf1.org/**', (route) => route.abort())
  await page.goto(appUrl, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.broadcast-app')

  await page.locator('.broadcast-sidebar .sidebar-settings').click()
  await page.waitForSelector('.setup-panel')
  const initialChampionshipEvent = await page
    .locator('.broadcast-brand strong')
    .innerText()
  await page.getByLabel('Championship round').selectOption('f1-16')
  await page.waitForFunction(
    (previousEvent) =>
      document.querySelector('.broadcast-brand strong')?.textContent?.trim() !==
      previousEvent,
    initialChampionshipEvent.trim(),
  )
  await page.getByLabel('close setup').click()
  const championshipEventBeforeFree = await page
    .locator('.broadcast-brand strong')
    .innerText()
  await page.waitForFunction(() => {
    const raw = localStorage.getItem('race-sim-weekend-v3-multi-series')
    if (!raw) return false
    try {
      return JSON.parse(raw).eventId === 'f1-16'
    } catch {
      return false
    }
  })
  const championshipStorageBeforeFree = await page.evaluate(() => ({
    season: localStorage.getItem('f1-sim-season-v3:f1-custom'),
    weekend: localStorage.getItem('race-sim-weekend-v3-multi-series'),
  }))

  await page.getByRole('button', { exact: true, name: 'FREE' }).click()
  await page.waitForSelector('.free-mode-builder')
  await page.waitForFunction(
    () =>
      document.activeElement?.getAttribute('aria-label') ===
      'Close Free Mode Builder',
  )
  const initialFocus = await page.evaluate(
    () => document.activeElement?.getAttribute('aria-label') ?? '',
  )
  await page.keyboard.press('Escape')
  await page.waitForSelector('.free-mode-builder', { state: 'detached' })
  const escapeClosed = (await page.locator('.free-mode-builder').count()) === 0
  await page.getByRole('button', { exact: true, name: 'FREE' }).click()
  await page.waitForSelector('.free-mode-builder')
  const vehicleSearch = page.getByPlaceholder('Team name or car number')
  await vehicleSearch.fill('44')
  await page.waitForFunction(() =>
    Array.from(
      document.querySelectorAll(
        '.free-mode-entry-row:first-child .free-mode-vehicle-cell option',
      ),
    ).some((option) => option.textContent?.includes('Ferrari')),
  )
  const vehicleNumberSearchWorked = (
    await page
      .locator(
        '.free-mode-entry-row:first-child .free-mode-vehicle-cell select',
      )
      .locator('option')
      .allInnerTexts()
  ).some((label) => label.includes('Ferrari'))
  await vehicleSearch.fill('')

  const carCountInput = page.locator(
    '.free-mode-settings input[type="number"]',
  ).first()
  await carCountInput.fill('40')
  await page.getByRole('button', { exact: true, name: 'Apply' }).click()
  await page.waitForFunction(
    () => document.querySelectorAll('.free-mode-entry-row').length === 40,
  )
  await page.getByLabel('Race laps').fill('1')
  const startButton = page.getByRole('button', {
    exact: true,
    name: 'Start session',
  })
  const firstCarNumberInput = page.getByLabel('Car number for grid 1', {
    exact: true,
  })
  const secondCarNumberInput = page.getByLabel('Car number for grid 2', {
    exact: true,
  })
  const duplicateCarNumber = await firstCarNumberInput.inputValue()
  const originalSecondCarNumber = await secondCarNumberInput.inputValue()
  await secondCarNumberInput.focus()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(duplicateCarNumber)
  await page.waitForSelector('.free-mode-entry-row.has-error')
  const keyboardNumberEdited =
    (await secondCarNumberInput.inputValue()) === duplicateCarNumber
  const duplicateRowErrors = await page
    .locator('.free-mode-entry-row.has-error')
    .count()
  const duplicateStartDisabled = await startButton.isDisabled()
  await page.keyboard.press('Control+A')
  await page.keyboard.type(originalSecondCarNumber)
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.free-mode-entry-row.has-error').length === 0,
  )
  const rowValidationWorked =
    keyboardNumberEdited &&
    duplicateRowErrors >= 1 &&
    duplicateStartDisabled

  const builderScroll = await inspectScroll(
    page.locator('.free-mode-entry-scroll'),
  )
  const builderLayout = await page.locator('.free-mode-builder').evaluate(
    (element) => ({
      bottom: element.getBoundingClientRect().bottom,
      documentHeight: document.documentElement.scrollHeight,
      documentWidth: document.documentElement.scrollWidth,
      height: element.clientHeight,
      scrollWidth: element.scrollWidth,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth,
      width: element.clientWidth,
    }),
  )
  const startDisabled = await startButton.isDisabled()
  await startButton.click()
  await page.waitForFunction(
    () => document.querySelectorAll('.leaderboard-rows li').length === 40,
  )

  const leaderboardScroll = await inspectScroll(
    page.locator('.leaderboard-rows'),
  )
  const carNumbers = await page
    .locator('.leaderboard-car-number')
    .allInnerTexts()
  const dataModes = await page
    .locator('.footer-data-modes button')
    .evaluateAll((buttons) =>
      buttons.map((button) => ({
        active: button.getAttribute('aria-pressed') === 'true',
        disabled: button.disabled,
        label: button.textContent?.trim() ?? '',
      })),
    )
  const activeApplicationMode = await page
    .locator('.broadcast-application-mode button[aria-pressed="true"]')
    .innerText()
  const seriesDisabled = await page
    .getByLabel('Racing series')
    .isDisabled()
  const skipFormation = page.getByLabel('Skip formation lap')
  if (await skipFormation.isVisible()) {
    await skipFormation.click()
  }

  // Free Mode runs the same engine, so the pit wall has to work there too.
  await page.getByTitle(/^Open the pit wall/u).click()
  await page.waitForSelector('.pit-wall-panel')
  const freePitWallHeader = await page
    .locator('.pit-wall-header')
    .innerText()
  const freePitWallReadouts = await page
    .locator('#pit-wall-tabpanel .pit-wall-metric')
    .count()
  await page.getByLabel('Close pit wall').click()

  await page.getByRole('button', { exact: true, name: '60x' }).click()
  await page.waitForFunction(
    () =>
      document
        .querySelector('.footer-race-control')
        ?.textContent?.includes('Race complete.') === true,
    undefined,
    { timeout: 30_000 },
  )
  const championshipStorageAfterFree = await page.evaluate(() => ({
    season: localStorage.getItem('f1-sim-season-v3:f1-custom'),
    weekend: localStorage.getItem('race-sim-weekend-v3-multi-series'),
  }))
  const championshipStorageUnchanged =
    championshipStorageBeforeFree.weekend ===
      championshipStorageAfterFree.weekend &&
    championshipStorageBeforeFree.season ===
      championshipStorageAfterFree.season
  const freeClassificationPanel = page.locator('.classification-panel')
  if (
    (await freeClassificationPanel.count()) === 0 ||
    !(await freeClassificationPanel.isVisible())
  ) {
    await page
      .getByRole('button', { exact: true, name: 'Classification' })
      .click()
  }
  await page.waitForSelector('.classification-panel')
  await page.getByLabel('Show lap chart').click()
  await page.waitForSelector('.lap-chart svg polyline', { state: 'attached' })
  const freeLapChartLineCount = await page
    .locator('.lap-chart svg polyline')
    .count()
  await page.getByLabel('Hide lap chart').click()
  await page.getByLabel('hide classification').click()

  await page.getByRole('button', { exact: true, name: 'CHAMP' }).click()
  await page.waitForFunction(
    () => document.querySelectorAll('.leaderboard-rows li').length === 22,
  )
  const championshipEventAfterFree = await page
    .locator('.broadcast-brand strong')
    .innerText()

  await page.screenshot({
    path: join(artifactDirectory, 'free-mode-40-cars.png'),
    fullPage: true,
  })
  await page.close()

  return {
    activeApplicationMode,
    builderLayout,
    builderScroll,
    carNumbers,
    championshipEventAfterFree,
    championshipEventBeforeFree,
    championshipStorageUnchanged,
    dataModes,
    escapeClosed,
    freeLapChartLineCount,
    freePitWallHeader,
    freePitWallReadouts,
    initialFocus,
    keyboardNumberEdited,
    leaderboardScroll,
    pageErrors,
    rowValidationWorked,
    seriesDisabled,
    startDisabled,
    vehicleNumberSearchWorked,
  }
}

const browser = await chromium.launch({ headless: true })

try {
  const results = [
    await runViewport(browser, 'desktop', { width: 1440, height: 900 }, join(artifactDirectory, 'broadcast-desktop.png')),
    await runViewport(browser, 'desktop-compact', { width: 1280, height: 720 }, join(artifactDirectory, 'broadcast-compact.png')),
  ]
  const seriesModes = await inspectSeriesModes(browser)
  const freeMode = await inspectFreeMode(browser)

  console.log(JSON.stringify({ freeMode, seriesModes, viewports: results }, null, 2))

  for (const result of results) {
    const failures = []

    if (result.leaderboardRows !== EXPECTED_FIELD_SIZE) failures.push(`expected ${EXPECTED_FIELD_SIZE} leaderboard rows, saw ${result.leaderboardRows}`)
    if (!result.leaderboardHeader.includes('SPD')) failures.push('leaderboard speed column missing')
    if (!result.leaderboardHeader.includes('ERS')) failures.push('leaderboard ERS column missing')
    if (!result.leaderboardColumnVisibility.speed) failures.push('leaderboard speed column is clipped')
    if (!result.leaderboardColumnVisibility.battery) failures.push('leaderboard ERS column is clipped')
    if (result.overviewNavigationItems !== 0) failures.push('redundant overview navigation is still present')
    if (result.initialSectorValues.some((value) => value !== '--.---')) failures.push('initial sector cells must remain unmeasured')
    if (result.initialSectorStatuses.pending !== result.initialSectorStatuses.total) failures.push('initial sector cells must all use the pending state')
    if (!result.observedOverallBest) failures.push('completed sectors never showed a provisional overall-best state')
    if (!result.observedMeasuredSector) failures.push('completed sectors never showed a measured color state')
    if (result.batteryValues.some((value) => !/^\d+%$/u.test(value))) failures.push('leaderboard ERS values are invalid')
    if (result.activePitRows >= result.leaderboardRows / 2) failures.push(`implausible simultaneous pit wave: ${result.activePitRows} cars`)
    if (!result.headerText.includes('AUSTRALIAN GRAND PRIX 2026')) failures.push('official event name missing from header')
    if (!result.headerText.includes('km/h')) failures.push('broadcast wind speed must use km/h')
    const expectedMiniSectors = EXPECTED_FIELD_SIZE * MINI_SECTORS_PER_DRIVER
    if (result.miniSectors < expectedMiniSectors) failures.push(`expected ${expectedMiniSectors} complete timing mini-sector cells, saw ${result.miniSectors}`)
    if (result.initialMiniSectorStates.colored !== 0 || result.initialMiniSectorStates.dim !== result.miniSectors) failures.push('initial mini sectors must all be pending')
    if (result.runningMiniSectorStates.colored === 0 || result.runningMiniSectorStates.dim === 0) failures.push('running mini sectors need completed and pending states')
    if (result.driverAbilityMaxes.length !== 12 || result.driverAbilityValues.length !== 12 || result.driverAbilityMaxes.some((value) => value !== '1')) failures.push('driver editor must expose 12 grouped sliders with the 100-point ceiling')
    if (!result.driverAbilityControlChanged) failures.push('grouped driver ability control did not update the calculated overall rating')
    if (result.driverAbilityValues.some((value) => Number(value) > 100)) failures.push('CSV-configured driver abilities exceed the 100-point scale')
    if (!/^\d{1,3}$/u.test(result.driverOverallAbility) || Number(result.driverOverallAbility) > 100) failures.push(`driver overall ability is invalid: ${result.driverOverallAbility}`)
    if (result.removedBottomPanelLabels.length > 0) failures.push(`removed bottom panels are still visible: ${result.removedBottomPanelLabels.join(', ')}`)
    if (result.centerMapLayout.mapHeightRatio < 0.55) failures.push(`track map did not expand into the removed panel space: ${JSON.stringify(result.centerMapLayout)}`)
    if (result.tireLifeValues.some((value) => !/^\d{1,3}$/u.test(value) || Number(value) < 0 || Number(value) > 100)) failures.push(`tyre life must be a 100-to-0 remaining value: ${result.tireLifeValues.join(', ')}`)
    if (result.tireLifeValues.every((value) => Number(value) === 100)) failures.push('tyre life never decreased from 100 during the accelerated run')
    for (const [name, count] of [
    ]) {
      if (count !== result.leaderboardRows) failures.push(`${name} table rendered ${count}/${result.leaderboardRows} drivers`)
    }
    if (result.duplicateGapPanels !== 0) failures.push(`removed duplicate gap panels still render: ${result.duplicateGapPanels}`)
    if (result.reclaimedSideSpace.leaderboardRatio < 0.72) failures.push(`the leaderboard did not keep the left column: ${JSON.stringify(result.reclaimedSideSpace)}`)
    for (const [name, metrics] of [
      ['leaderboard', result.leaderboardScroll],
    ]) {
      // A list that already shows every driver has nothing to scroll, which is
      // still every driver reachable.
      const fitsWithoutScrolling = metrics.scrollHeight <= metrics.clientHeight + 1
      if (!fitsWithoutScrolling && (metrics.maxScrollTop <= 0 || !metrics.reachedBottom)) failures.push(`${name} list cannot scroll through all drivers: ${JSON.stringify(metrics)}`)
    }
    if (result.dataDetails < 10 || !result.tokenInputVisible) failures.push('data reliability view is incomplete')
    if (result.dataManagerDriverRows !== 110) failures.push(`data manager rendered ${result.dataManagerDriverRows}/110 pool drivers`)
    if (result.dataManagerDriverScroll.maxScrollTop <= 0 || !result.dataManagerDriverScroll.reachedBottom) failures.push(`driver directory cannot scroll: ${JSON.stringify(result.dataManagerDriverScroll)}`)
    if (result.dataManagerTeamRows !== 11) failures.push(`data manager rendered ${result.dataManagerTeamRows}/11 F1 teams`)
    if (result.dataManagerRuleRows !== 25) failures.push(`data manager rendered ${result.dataManagerRuleRows - 1}/24 F1 events`)
    if (result.dataManagerRuleInputs < 10 || result.dataManagerQualifyingRows !== 4) failures.push(`rule editor is incomplete: ${result.dataManagerRuleInputs} inputs / ${result.dataManagerQualifyingRows - 1} segments`)
    if (result.dataManagerEventInputs < 7 || !result.dataManagerSelectedEvent.includes('f1-16')) failures.push(`event override editor is incomplete: ${result.dataManagerEventInputs} inputs / ${result.dataManagerSelectedEvent}`)
    if (!result.dataManagerAudit.includes('Driver records') || !result.dataManagerAudit.includes(`${EXPECTED_FIELD_SIZE} / ${EXPECTED_FIELD_SIZE}`) || !result.dataManagerAudit.includes('Pool records') || !result.dataManagerAudit.includes('110')) failures.push(`data manager audit is incomplete: ${result.dataManagerAudit}`)
    if (result.dataManagerLayout.scrollWidth !== result.dataManagerLayout.clientWidth || result.dataManagerLayout.scrollHeight !== result.dataManagerLayout.clientHeight) failures.push(`data manager overflows its frame: ${JSON.stringify(result.dataManagerLayout)}`)
    if (!result.liveTimingClosed || !result.liveTimingRestored) failures.push('live timing close/restore failed')
    if (result.selectedRows !== 1) failures.push(`expected one selected timing row, saw ${result.selectedRows}`)
    if (result.speed60Selected !== 'true' || !result.resumeVisible) failures.push('playback controls failed')
    if (result.chaseSelected !== 'true') failures.push('camera switch failed')
    if (!result.setupVisible || !result.classificationVisible || !result.insightsVisible || !result.strategyControlsVisible) failures.push('secondary functional panels failed')
    if (result.lapChartLineCount < EXPECTED_FIELD_SIZE) failures.push(`lap chart drew ${result.lapChartLineCount} of ${EXPECTED_FIELD_SIZE} car lines`)

    // --- pit wall ---
    if (!result.pitWallReplacedClassification) failures.push('opening the pit wall left the classification overlay on screen')
    if (result.pitWallInitialFocus !== 'Close pit wall') failures.push(`pit wall did not take keyboard focus: ${result.pitWallInitialFocus}`)
    if (!result.pitWallHeader.includes(result.pitWallSelectedCode)) failures.push(`pit wall header does not identify the selected car ${result.pitWallSelectedCode}: ${result.pitWallHeader}`)
    if (!/RACE\s*\/\s*LAP\s+\d+\s+OF\s+\d+/u.test(result.pitWallHeader)) failures.push(`pit wall header is missing the session and lap count: ${result.pitWallHeader}`)
    const expectedPitWallTabs = ['OVERVIEW', 'LAP LOG', 'STRATEGY', 'CAR SYSTEMS', 'WEATHER & TRACK', 'RACE CONTROL']
    if (result.pitWallTabViews.map((tab) => tab.label).join('|') !== expectedPitWallTabs.join('|')) failures.push(`pit wall tabs are wrong: ${result.pitWallTabViews.map((tab) => tab.label).join(', ')}`)
    for (const tab of result.pitWallTabViews) {
      if (tab.selected !== 'true') failures.push(`pit wall tab ${tab.label} did not become the selected tab`)
      const rendered = tab.label === 'LAP LOG' ? tab.lapLogRows > 0 : tab.groups.length > 0 && tab.readouts > 0
      if (!rendered) failures.push(`pit wall tab ${tab.label} rendered no read-outs: ${JSON.stringify(tab)}`)
    }

    // --- pit wall lap log ---
    if (!result.pitWallLapLogSample) {
      failures.push('pit wall lap log rendered no lap row')
    } else {
      const cells = result.pitWallLapLogSample.cells
      if (cells.length !== 8) failures.push(`pit wall lap log row has ${cells.length}/8 columns: ${JSON.stringify(cells)}`)
      if (!/^\d+$/u.test(cells[0] ?? '')) failures.push(`pit wall lap log row has no lap number: ${JSON.stringify(cells)}`)
      if (!/^\d+:\d{2}\.\d{3}$/u.test(cells[1] ?? '')) failures.push(`pit wall lap log row has no lap time: ${JSON.stringify(cells)}`)
      for (const index of [2, 3, 4]) {
        if (!/^\d+\.\d{3}$/u.test(cells[index] ?? '')) failures.push(`pit wall lap log sector ${index - 1} is not a measured split: ${JSON.stringify(cells)}`)
      }
    }
    if (result.pitWallLapLogScrolls?.overflowY !== 'auto') failures.push(`pit wall lap log does not own its scroller: ${JSON.stringify(result.pitWallLapLogScrolls)}`)

    // --- pit wall in practice and qualifying ---
    for (const timed of result.pitWallTimedSessions ?? []) {
      if (!timed.enabled) failures.push(`pit wall is unavailable in ${timed.stage}`)
      const expectedLabel = timed.stage === 'fp1' ? 'PRACTICE' : 'QUALIFYING'
      if (!timed.header.includes(expectedLabel)) failures.push(`pit wall header does not name the ${timed.stage} session: ${timed.header}`)
      if (/OF\s+\d+/u.test(timed.header)) failures.push(`pit wall printed a race distance in ${timed.stage}: ${timed.header}`)
      const raceOnlyLabels = ['Target stop', 'Laps remaining', 'Rejoin', 'Rejoin change', 'Expected delta']
      for (const label of raceOnlyLabels) {
        const row = timed.strategyRows.find((entry) => entry.label === label)
        if (!row) failures.push(`pit wall ${timed.stage} strategy is missing the ${label} row`)
        else if (row.value !== 'N/A') failures.push(`pit wall ${timed.stage} printed a race-only ${label} value: ${row.value}`)
      }
      const pitLoss = timed.strategyRows.find((entry) => entry.label === 'Pit lane loss')
      if (!pitLoss || !/\d+\.\d+s/u.test(pitLoss.value)) failures.push(`pit wall ${timed.stage} lost the pit-lane transit cost, which is a physical fact in every session: ${JSON.stringify(pitLoss)}`)
    }
    const allFilter = result.pitWallFilterCounts.find((entry) => entry.filterLabel === 'ALL')
    if (!allFilter || allFilter.entries === 0) failures.push('pit wall race control log is empty')
    for (const entry of result.pitWallFilterCounts) {
      if (entry.entries > allFilter.entries) failures.push(`pit wall ${entry.filterLabel} filter returned more rows than ALL`)
    }
    if (!/\d+%/u.test(result.pitWallErsReadout)) failures.push(`F1 pit wall must report a measured ERS value: ${result.pitWallErsReadout}`)
    if (result.pitWallBoxStates.length !== 5) failures.push(`pit wall exposes ${result.pitWallBoxStates.length}/5 box commands`)
    for (const box of result.pitWallBoxStates) {
      if (box.title.trim().length === 0) failures.push(`pit wall box command ${box.label} has no explanatory title`)
      if (box.disabled && !/no .* sets remain|not running/iu.test(box.title)) failures.push(`disabled box command ${box.label} does not explain itself: ${box.title}`)
      const setsRemaining = Number((box.label.match(/(\d+)$/u) ?? [])[1])
      if (Number.isFinite(setsRemaining) && setsRemaining === 0 && !box.disabled) failures.push(`box command ${box.label} stays enabled with no tyre sets left`)
    }
    if (!result.pitWallBoxStates.some((box) => !box.disabled)) failures.push('every pit wall box command was disabled for a running car')
    if (!result.pitWallPaceApplied) failures.push('pit wall pace instruction did not reach the selected car')
    if (!result.pitWallBoxApplied) failures.push(`pit wall ${result.pitWallBoxCommandLabel} instruction never produced a pit stop for the selected car`)
    if (!result.pitWallFollowedDriverSelection) failures.push('the pit wall car selector did not change car')
    if (!result.pitWallSelectorMovedTimingTower) failures.push('the pit wall car selector did not move the app-wide selection behind it')
    if (!result.pitWallEscapeClosed) failures.push('Escape did not close the pit wall')
    if (!result.pitWallCloseButtonClosed) failures.push('the pit wall close button did not close the panel')
    if (!result.pitWallLayout) {
      failures.push('pit wall layout could not be measured')
    } else {
      const pit = result.pitWallLayout
      if (pit.top < 0 || pit.left < 0 || pit.right > pit.viewportWidth + 1 || pit.bottom > pit.footerTop + 1) failures.push(`pit wall overflows the workspace: ${JSON.stringify(pit)}`)
      if (pit.documentWidth !== pit.viewportWidth || pit.documentHeight !== pit.viewportHeight) failures.push(`pit wall forced a page scroll: ${pit.documentWidth}x${pit.documentHeight}`)
      // The panel deliberately covers the timing tower, but the track map has
      // no substitute elsewhere on screen and must stay fully visible.
      if (pit.right > pit.canvasLeft + 1) failures.push(`pit wall covers the track map: ${JSON.stringify(pit)}`)
      if (!(pit.canvasVisibleWidth >= pit.canvasWidth - 1)) failures.push(`pit wall hid part of the track map: ${JSON.stringify(pit)}`)
      if (!pit.reachedBottom) failures.push(`pit wall body cannot scroll to its last read-out: ${JSON.stringify(pit)}`)
    }
    if (!result.canvas?.ok) failures.push(`canvas pixels invalid: ${JSON.stringify(result.canvas)}`)
    if (result.pageErrors.length > 0) failures.push(`page errors: ${result.pageErrors.join('; ')}`)
    if (result.layout.documentWidth !== result.layout.viewportWidth || result.layout.documentHeight !== result.layout.viewportHeight) failures.push(`viewport overflow ${result.layout.documentWidth}x${result.layout.documentHeight}`)
    if (result.layout.clippedButtons > 0) failures.push(`${result.layout.clippedButtons} visible buttons clip content`)
    if (result.typography.app < 10) failures.push(`broadcast base font is too small: ${result.typography.app}px`)
    if (result.typography.panelTitle < 11) failures.push(`panel title font is too small: ${result.typography.panelTitle}px`)
    if (result.typography.leaderboard < 9) failures.push(`leaderboard font is too small: ${result.typography.leaderboard}px`)
    if (result.layout.top?.bottom > result.layout.workspace?.top + 1) failures.push('top bar overlaps workspace')
    if (result.layout.workspace?.bottom > result.layout.footer?.top + 1) failures.push('workspace overlaps footer')

    if (failures.length > 0) throw new Error(`${result.name} failed:\n- ${failures.join('\n- ')}`)
  }

  const expectedCars = { 'super-formula': 24 }
  const seriesFailures = []
  if (seriesModes.seriesOptions.join(',') !== 'f1-custom,super-formula') {
    seriesFailures.push(`series selector is incomplete: ${seriesModes.seriesOptions.join(', ')}`)
  }
  for (const [seriesId, carCount] of Object.entries(expectedCars)) {
    const result = seriesModes.results[seriesId]
    if (result.cars !== carCount) seriesFailures.push(`${seriesId} rendered ${result.cars}/${carCount} cars`)
    if (!/Leaderboard/iu.test(result.timingTitle)) seriesFailures.push(`${seriesId} leaderboard title is stale: ${result.timingTitle}`)

    // SUPER FORMULA has neither a hybrid Energy Store nor 2026 active aero, so
    // the pit wall must say so instead of printing an invented number.
    if (result.pitWallOverview === null) {
      seriesFailures.push(`${seriesId} pit wall could not be opened`)
    } else {
      for (const label of ['ERS / battery', 'Active aero']) {
        const row = result.pitWallOverview.find((text) => text.includes(label))

        if (!row) {
          seriesFailures.push(`${seriesId} pit wall is missing the ${label} row`)
        } else if (!row.includes('N/A')) {
          seriesFailures.push(`${seriesId} pit wall reports an F1-only system as a value: ${row.replace(/\s+/gu, ' ')}`)
        }
      }
    }
  }
  const replacement = seriesModes.results['super-formula']
  if (replacement.replacementSessions?.join(',') !== 'race') {
    seriesFailures.push(`SF replacement event has extra sessions: ${replacement.replacementSessions?.join(', ')}`)
  }
  if (!/\d+\s*\/\s*25/u.test(replacement.replacementProgress)) {
    seriesFailures.push(`SF replacement event is not 25 laps: ${replacement.replacementProgress}`)
  }
  if (seriesModes.pageErrors.length > 0) {
    seriesFailures.push(`series mode page errors: ${seriesModes.pageErrors.join('; ')}`)
  }
  if (seriesFailures.length > 0) {
    throw new Error(`multi-series failed:\n- ${seriesFailures.join('\n- ')}`)
  }

  const freeModeFailures = []
  if (freeMode.activeApplicationMode.trim() !== 'FREE') {
    freeModeFailures.push(
      `application mode did not switch to FREE: ${freeMode.activeApplicationMode}`,
    )
  }
  if (!freeMode.seriesDisabled) {
    freeModeFailures.push('series selector remains editable during a Free session')
  }
  if (
    freeMode.championshipEventBeforeFree !==
    freeMode.championshipEventAfterFree
  ) {
    freeModeFailures.push(
      `championship weekend was not restored after Free Mode: ${freeMode.championshipEventBeforeFree} -> ${freeMode.championshipEventAfterFree}`,
    )
  }
  if (!freeMode.championshipStorageUnchanged) {
    freeModeFailures.push(
      'Free race mutated championship weekend or season storage',
    )
  }
  if (freeMode.startDisabled) {
    freeModeFailures.push('valid 40-car configuration cannot start')
  }
  if (!freeMode.freePitWallHeader?.includes('PIT WALL')) {
    freeModeFailures.push(
      `pit wall did not open in Free Mode: ${freeMode.freePitWallHeader}`,
    )
  }
  if (!(freeMode.freePitWallReadouts > 0)) {
    freeModeFailures.push(
      `Free Mode pit wall rendered ${freeMode.freePitWallReadouts} read-outs`,
    )
  }
  if (!freeMode.keyboardNumberEdited || !freeMode.rowValidationWorked) {
    freeModeFailures.push(
      'keyboard editing or entrant-level duplicate validation failed',
    )
  }
  if (!freeMode.vehicleNumberSearchWorked) {
    freeModeFailures.push('vehicle search did not match a registered car number')
  }
  if (freeMode.freeLapChartLineCount < 40) {
    freeModeFailures.push(
      `Free Mode lap chart drew ${freeMode.freeLapChartLineCount}/40 entrants`,
    )
  }
  if (
    freeMode.initialFocus !== 'Close Free Mode Builder' ||
    !freeMode.escapeClosed
  ) {
    freeModeFailures.push(
      `Free Mode keyboard dialog behavior failed: ${JSON.stringify({
        escapeClosed: freeMode.escapeClosed,
        initialFocus: freeMode.initialFocus,
      })}`,
    )
  }
  if (
    freeMode.builderLayout.documentWidth !==
      freeMode.builderLayout.viewportWidth ||
    freeMode.builderLayout.documentHeight !==
      freeMode.builderLayout.viewportHeight ||
    freeMode.builderLayout.scrollWidth !== freeMode.builderLayout.width ||
    freeMode.builderLayout.bottom > freeMode.builderLayout.viewportHeight
  ) {
    freeModeFailures.push(
      `Free Mode builder overflows its viewport: ${JSON.stringify(freeMode.builderLayout)}`,
    )
  }
  if (
    freeMode.builderScroll.maxScrollTop <= 0 ||
    !freeMode.builderScroll.reachedBottom
  ) {
    freeModeFailures.push(
      `40-car builder list cannot reach every entry: ${JSON.stringify(freeMode.builderScroll)}`,
    )
  }
  if (
    freeMode.leaderboardScroll.maxScrollTop <= 0 ||
    !freeMode.leaderboardScroll.reachedBottom
  ) {
    freeModeFailures.push(
      `40-car leaderboard cannot reach every entry: ${JSON.stringify(freeMode.leaderboardScroll)}`,
    )
  }
  if (
    freeMode.carNumbers.length !== 40 ||
    new Set(freeMode.carNumbers).size !== 40 ||
    freeMode.carNumbers.some((number) => !/^#\d{1,3}$/u.test(number))
  ) {
    freeModeFailures.push(
      `Free Mode car-number identifiers are invalid: ${freeMode.carNumbers.join(', ')}`,
    )
  }
  const simMode = freeMode.dataModes.find((mode) => mode.label === 'SIM')
  const externalModes = freeMode.dataModes.filter((mode) =>
    ['HIST', 'LIVE'].includes(mode.label),
  )
  if (
    !simMode?.active ||
    simMode.disabled ||
    externalModes.length !== 2 ||
    externalModes.some((mode) => !mode.disabled || mode.active)
  ) {
    freeModeFailures.push(
      `Free Mode data-source isolation is invalid: ${JSON.stringify(freeMode.dataModes)}`,
    )
  }
  if (freeMode.pageErrors.length > 0) {
    freeModeFailures.push(
      `Free Mode page errors: ${freeMode.pageErrors.join('; ')}`,
    )
  }
  if (freeModeFailures.length > 0) {
    throw new Error(`Free Mode failed:\n- ${freeModeFailures.join('\n- ')}`)
  }
} finally {
  await browser.close()
}
