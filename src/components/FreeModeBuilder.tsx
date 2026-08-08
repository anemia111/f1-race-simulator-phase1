import {
  ArrowDown,
  ArrowUp,
  Copy,
  Download,
  Equal,
  Play,
  Plus,
  RotateCcw,
  Save,
  Shuffle,
  Trash2,
  Upload,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from 'react'
import {
  createDefaultFreeModeConfiguration,
  createEntrantsFromCategoryGrid,
  freeModeTrackOptions,
  suggestFreeModeRaceLaps,
} from '../freeMode/freeModeRegistry'
import {
  exportFreeModeConfiguration,
  importFreeModeConfiguration,
  loadFreeModePresets,
  saveFreeModePresets,
} from '../freeMode/freeModePersistence'
import {
  FREE_MODE_MAX_CARS,
  freeModeQualifyingResultMatches,
  validateFreeModeConfiguration,
} from '../freeMode/freeModeValidation'
import type {
  FreeModeBuildContext,
  FreeModeConfiguration,
  FreeModeEntrant,
  FreeModePreset,
  FreeModeQualifyingResult,
} from '../freeMode/types'
import type { DriverPoolRecord } from '../series/driverPool'
import type { SeriesId } from '../series/types'
import { createSeededRandom, normalizeSimulationSeed } from '../simulation/random'

type FreeModeBuilderProps = {
  context: FreeModeBuildContext
  initialConfiguration: FreeModeConfiguration
  isOpen: boolean
  onClose: () => void
  onStart: (configuration: FreeModeConfiguration) => void
  qualifyingResult: FreeModeQualifyingResult | null
}

// oxlint-disable-next-line react/only-export-components
export const freeModeCategoryLabels: Record<SeriesId, string> = {
  'f1-custom': 'F1',
  'super-formula': 'SUPER FORMULA',
}

const historySeriesLabels = {
  'f1-custom': 'F1 history',
  f2: 'F2 history',
  f3: 'F3 history',
  'super-formula': 'SF history',
  external: 'External history',
} as const

const sessionLabels = {
  practice: 'Practice',
  qualifying: 'Qualifying',
  race: 'Race',
} as const

// FP1 starts from an unlearned setup on heavy fuel; setup knowledge grows into
// FP3, where a light-fuel attack lap becomes representative of the category.
const practiceStageLabels = {
  fp1: 'FP1 (new setup)',
  fp2: 'FP2',
  fp3: 'FP3 (learned setup)',
} as const

const weatherLabels = {
  random: 'Random',
  clear: 'Clear',
  'light-rain': 'Light rain',
  'heavy-rain': 'Heavy rain',
} as const

const cloneConfiguration = (
  configuration: FreeModeConfiguration,
): FreeModeConfiguration => ({
  ...configuration,
  entrants: configuration.entrants.map((entrant) => ({ ...entrant })),
})

const nextEntryId = (entrants: FreeModeEntrant[]) => {
  const used = new Set(entrants.map((entrant) => entrant.id))

  for (let index = 1; index <= 999; index += 1) {
    const id = `free-entry-${String(index).padStart(3, '0')}`
    if (!used.has(id)) return id
  }

  return `free-entry-${Date.now()}`
}

const nextCarNumber = (
  entrants: FreeModeEntrant[],
  preferred = 0,
) => {
  const used = new Set(entrants.map((entrant) => entrant.carNumber))

  for (let offset = 0; offset < 1_000; offset += 1) {
    const candidate = (preferred + offset) % 1_000
    if (!used.has(candidate)) return candidate
  }

  return 0
}

// oxlint-disable-next-line react/only-export-components
export function driverHistorySearchTerms(driver: DriverPoolRecord) {
  return [
    ...driver.careerHistory.flatMap((entry) => [
      entry.seriesId,
      historySeriesLabels[entry.seriesId],
      String(entry.season),
      entry.sourceTeamId ?? '',
      entry.sourceTeamName ?? '',
      entry.sourceCarNumber === undefined
        ? ''
        : String(entry.sourceCarNumber),
      entry.role,
      ...entry.sourceIds,
    ]),
    ...driver.provenance.flatMap((source) => [
      source.sourceSeriesId,
      historySeriesLabels[source.sourceSeriesId],
      source.sourceTeam?.sourceId ?? '',
      source.sourceTeam?.name ?? '',
      source.sourceCarNumber === undefined
        ? ''
        : String(source.sourceCarNumber),
      source.sourceRole ?? '',
      source.sourceFile,
      source.sourceDate,
      ...source.sourceIds,
    ]),
  ]
}

function driverHistorySeriesSummary(driver: DriverPoolRecord) {
  return [
    ...new Set(
      driver.careerHistory.map((entry) =>
        historySeriesLabels[entry.seriesId].replace(' history', ''),
      ),
    ),
  ].join('/')
}

// oxlint-disable-next-line react/only-export-components
export function assignDriverToFreeModeSeat(
  entrant: FreeModeEntrant,
  driverId: string,
): FreeModeEntrant {
  return { ...entrant, driverId }
}

// oxlint-disable-next-line react/only-export-components
export const matchesDriverSearch = (
  search: string,
  driver: DriverPoolRecord,
  searchTerms: string[],
) => {
  const query = search.trim().toLocaleLowerCase()
  if (!query) return true

  const searchable = [
    driver.name,
    driver.code,
    driver.nationality,
    String(driver.overall),
    ...searchTerms,
  ]
    .join(' ')
    .toLocaleLowerCase()

  return query.split(/\s+/u).every((term) => searchable.includes(term))
}

function fieldMeanOverall(
  configuration: FreeModeConfiguration,
  context: FreeModeBuildContext,
) {
  const series = context.seriesById.get(configuration.categoryId)
  if (!series || configuration.entrants.length === 0) return 0
  const teams = new Map(series.teams.map((team) => [team.id, team]))
  const values = configuration.entrants.flatMap((entrant) => {
    const overall = teams.get(entrant.sourceTeamId)?.performanceSource?.overall
    return typeof overall === 'number' ? [overall] : []
  })

  return values.length > 0
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : 0
}

export function FreeModeBuilder({
  context,
  initialConfiguration,
  isOpen,
  onClose,
  onStart,
  qualifyingResult,
}: FreeModeBuilderProps) {
  const [configuration, setConfiguration] = useState(() =>
    cloneConfiguration(initialConfiguration),
  )
  const [driverSearch, setDriverSearch] = useState('')
  const [vehicleSearch, setVehicleSearch] = useState('')
  const [bulkCount, setBulkCount] = useState(5)
  const [targetCarCount, setTargetCarCount] = useState(
    initialConfiguration.entrants.length,
  )
  const [bulkTeamId, setBulkTeamId] = useState(
    initialConfiguration.entrants[0]?.sourceTeamId ?? '',
  )
  const [presetName, setPresetName] = useState('My free session')
  const [selectedPresetId, setSelectedPresetId] = useState('')
  const [presets, setPresets] = useState<FreeModePreset[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const dialogRef = useRef<HTMLDivElement>(null)
  const closeButtonRef = useRef<HTMLButtonElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const onCloseRef = useRef(onClose)

  const validationContext = useMemo(
    () => ({ ...context, qualifyingResult }),
    [context, qualifyingResult],
  )
  const tracks = useMemo(
    () => freeModeTrackOptions(context.seriesById),
    [context.seriesById],
  )
  const series = context.seriesById.get(configuration.categoryId)
  const teams = useMemo(
    () => {
      const query = vehicleSearch.trim().toLocaleLowerCase()
      if (!query) return series?.teams ?? []

      return (series?.teams ?? []).filter(
        (team) =>
          team.name.toLocaleLowerCase().includes(query) ||
          (series?.drivers ?? []).some(
            (driver) =>
              driver.teamId === team.id &&
              String(driver.carNumber).includes(query),
          ),
      )
    },
    [series, vehicleSearch],
  )
  const driverSearchTermsById = useMemo(() => {
    const terms = new Map(
      context.driverPool.map((driver) => [
        driver.id,
        driverHistorySearchTerms(driver),
      ]),
    )

    for (const packageValue of context.seriesById.values()) {
      const packageTeams = new Map(
        packageValue.teams.map((team) => [team.id, team.name]),
      )
      for (const driver of packageValue.drivers) {
        terms.set(driver.id, [
          ...(terms.get(driver.id) ?? []),
          packageTeams.get(driver.teamId) ?? '',
          String(driver.carNumber),
        ])
      }
    }

    return terms
  }, [context.driverPool, context.seriesById])
  const filteredDrivers = useMemo(
    () =>
      context.driverPool.filter((driver) =>
        matchesDriverSearch(
          driverSearch,
          driver,
          driverSearchTermsById.get(driver.id) ?? [],
        ),
      ),
    [context.driverPool, driverSearch, driverSearchTermsById],
  )
  const driverById = useMemo(
    () => new Map(context.driverPool.map((driver) => [driver.id, driver])),
    [context.driverPool],
  )
  const teamById = useMemo(
    () => new Map((series?.teams ?? []).map((team) => [team.id, team])),
    [series?.teams],
  )
  const issues = useMemo(
    () => validateFreeModeConfiguration(configuration, validationContext),
    [configuration, validationContext],
  )
  const compatibleQualifyingResult = freeModeQualifyingResultMatches(
    qualifyingResult,
    configuration,
  )
  const issuesByEntrant = useMemo(() => {
    const grouped = new Map<string, string[]>()
    for (const issue of issues) {
      if (!issue.entrantId) continue
      grouped.set(issue.entrantId, [
        ...(grouped.get(issue.entrantId) ?? []),
        issue.message,
      ])
    }
    return grouped
  }, [issues])
  const fieldMean = fieldMeanOverall(configuration, context)

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    if (!isOpen) return
    const previouslyFocused =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const focusFrame = window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus()
    })
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        onCloseRef.current()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = [
        ...(dialogRef.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0)
      const first = focusable[0]
      const last = focusable.at(-1)
      if (!first || !last) return

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault()
        last.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      window.cancelAnimationFrame(focusFrame)
      document.removeEventListener('keydown', handleKeyDown)
      previouslyFocused?.focus()
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    setConfiguration(cloneConfiguration(initialConfiguration))
    setTargetCarCount(initialConfiguration.entrants.length)
    setBulkTeamId(initialConfiguration.entrants[0]?.sourceTeamId ?? '')
    setPresets(loadFreeModePresets(window.localStorage, validationContext))
    setNotice(null)
  }, [initialConfiguration, isOpen, validationContext])

  if (!isOpen || !series) {
    return null
  }

  const replaceConfiguration = (next: FreeModeConfiguration) => {
    setConfiguration(cloneConfiguration(next))
    setTargetCarCount(next.entrants.length)
    setBulkTeamId(next.entrants[0]?.sourceTeamId ?? '')
  }

  const updateEntrant = (
    entrantId: string,
    update: Partial<FreeModeEntrant>,
  ) => {
    setConfiguration((current) => ({
      ...current,
      entrants: current.entrants.map((entrant) =>
        entrant.id === entrantId ? { ...entrant, ...update } : entrant,
      ),
    }))
  }

  const unusedDriver = (
    current: FreeModeConfiguration,
    preferredId?: string,
  ) => {
    const used = new Set(current.entrants.map((entrant) => entrant.driverId))
    const preferred = preferredId ? driverById.get(preferredId) : null

    return (
      (preferred && !used.has(preferred.id) ? preferred : null) ??
      context.driverPool.find((driver) => !used.has(driver.id)) ??
      null
    )
  }

  const appendEntrants = (count: number, sourceTeamId = bulkTeamId) => {
    setConfiguration((current) => {
      const entrants = [...current.entrants]
      const safeCount = Math.min(
        Math.max(0, Math.floor(count)),
        FREE_MODE_MAX_CARS - entrants.length,
      )

      for (let index = 0; index < safeCount; index += 1) {
        const driver = unusedDriver({ ...current, entrants })
        if (!driver) break
        entrants.push({
          carNumber: nextCarNumber(entrants),
          driverId: driver.id,
          id: nextEntryId(entrants),
          sourceTeamId:
            teamById.has(sourceTeamId)
              ? sourceTeamId
              : series.teams[0]?.id ?? '',
        })
      }

      setTargetCarCount(entrants.length)
      return { ...current, entrants }
    })
  }

  const resizeField = () => {
    const target = Math.min(
      FREE_MODE_MAX_CARS,
      Math.max(1, Math.floor(targetCarCount)),
    )

    if (target < configuration.entrants.length) {
      setConfiguration((current) => ({
        ...current,
        entrants: current.entrants.slice(0, target),
      }))
    } else {
      appendEntrants(target - configuration.entrants.length)
    }
    setTargetCarCount(target)
  }

  const setCategory = (
    categoryId: FreeModeConfiguration['categoryId'],
  ) => {
    const nextSeries = context.seriesById.get(categoryId)
    if (!nextSeries) return
    const fallbackTeamId = nextSeries.teams[0]?.id ?? ''
    const validTeams = new Set(nextSeries.teams.map((team) => team.id))
    const replacedVehicles = configuration.entrants.some(
      (entrant) => !validTeams.has(entrant.sourceTeamId),
    )

    setConfiguration((current) => ({
      ...current,
      categoryId,
      entrants: current.entrants.map((entrant) => ({
        ...entrant,
        sourceTeamId: validTeams.has(entrant.sourceTeamId)
          ? entrant.sourceTeamId
          : fallbackTeamId,
      })),
      practiceDurationMinutes: Math.round(
        nextSeries.rules.freePracticeDurationSeconds / 60,
      ),
    }))
    setBulkTeamId(fallbackTeamId)
    setNotice(
      replacedVehicles
        ? 'Vehicles unavailable in the new category were replaced. Review highlighted entries before starting.'
        : null,
    )
  }

  const loadCategoryGrid = () => {
    const entrants = createEntrantsFromCategoryGrid(series)
    setConfiguration((current) => ({
      ...current,
      entrants,
      equalCars: false,
    }))
    setTargetCarCount(entrants.length)
    setNotice(`Loaded the ${series.shortLabel} ${entrants.length}-car grid.`)
  }

  const randomizeDrivers = () => {
    const random = createSeededRandom(
      `${normalizeSimulationSeed(configuration.seed)}:builder:drivers`,
    )
    const available = [...context.driverPool]

    for (let index = available.length - 1; index > 0; index -= 1) {
      const target = Math.floor(random() * (index + 1))
      ;[available[index], available[target]] = [available[target], available[index]]
    }

    setConfiguration((current) => ({
      ...current,
      entrants: current.entrants.map((entrant, index) =>
        assignDriverToFreeModeSeat(entrant, available[index].id),
      ),
    }))
  }

  const randomizeCars = () => {
    const random = createSeededRandom(
      `${normalizeSimulationSeed(configuration.seed)}:builder:cars`,
    )
    setConfiguration((current) => ({
      ...current,
      entrants: current.entrants.map((entrant) => ({
        ...entrant,
        sourceTeamId:
          series.teams[Math.floor(random() * series.teams.length)]?.id ??
          entrant.sourceTeamId,
      })),
    }))
  }

  const moveEntrant = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= configuration.entrants.length) return
    setConfiguration((current) => {
      const entrants = [...current.entrants]
      ;[entrants[index], entrants[target]] = [entrants[target], entrants[index]]
      return { ...current, entrants }
    })
  }

  const duplicateEntrant = (entrant: FreeModeEntrant) => {
    if (configuration.entrants.length >= FREE_MODE_MAX_CARS) return
    const driver = unusedDriver(configuration)
    if (!driver) return
    setConfiguration((current) => ({
      ...current,
      entrants: [
        ...current.entrants,
        {
          ...entrant,
          carNumber: nextCarNumber(
            current.entrants,
            entrant.carNumber + 1,
          ),
          driverId: driver.id,
          id: nextEntryId(current.entrants),
        },
      ],
    }))
    setTargetCarCount(configuration.entrants.length + 1)
  }

  const removeEntrant = (entrantId: string) => {
    setConfiguration((current) => ({
      ...current,
      entrants: current.entrants.filter((entrant) => entrant.id !== entrantId),
    }))
    setTargetCarCount(Math.max(0, configuration.entrants.length - 1))
  }

  const savePreset = () => {
    if (issues.length > 0) {
      setNotice('Fix validation errors before saving this preset.')
      return
    }
    const now = new Date().toISOString()
    const preset: FreeModePreset = {
      configuration: cloneConfiguration(configuration),
      id: globalThis.crypto?.randomUUID?.() ?? `preset-${Date.now()}`,
      name: presetName.trim() || 'Free Mode preset',
      updatedAt: now,
    }
    const next = [...presets, preset]
    setPresets(next)
    setSelectedPresetId(preset.id)
    saveFreeModePresets(window.localStorage, next)
    setNotice(`Saved preset "${preset.name}".`)
  }

  const renamePreset = () => {
    const name = presetName.trim()
    if (!selectedPresetId || !name) return
    const next = presets.map((preset) =>
      preset.id === selectedPresetId
        ? { ...preset, name, updatedAt: new Date().toISOString() }
        : preset,
    )
    setPresets(next)
    saveFreeModePresets(window.localStorage, next)
  }

  const duplicatePreset = () => {
    const source = presets.find((preset) => preset.id === selectedPresetId)
    if (!source) return
    const duplicate: FreeModePreset = {
      ...source,
      configuration: cloneConfiguration(source.configuration),
      id: globalThis.crypto?.randomUUID?.() ?? `preset-${Date.now()}`,
      name: `${source.name} copy`,
      updatedAt: new Date().toISOString(),
    }
    const next = [...presets, duplicate]
    setPresets(next)
    setSelectedPresetId(duplicate.id)
    saveFreeModePresets(window.localStorage, next)
  }

  const deletePreset = () => {
    if (!selectedPresetId) return
    const next = presets.filter((preset) => preset.id !== selectedPresetId)
    setPresets(next)
    setSelectedPresetId('')
    saveFreeModePresets(window.localStorage, next)
  }

  const loadPreset = (presetId: string) => {
    setSelectedPresetId(presetId)
    const preset = presets.find((candidate) => candidate.id === presetId)
    if (!preset) return
    replaceConfiguration(preset.configuration)
    setPresetName(preset.name)
    setNotice(`Loaded preset "${preset.name}".`)
  }

  const exportJson = () => {
    const blob = new Blob([exportFreeModeConfiguration(configuration)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `free-mode-${configuration.categoryId}-${configuration.trackId}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importJson = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || file.size > 1_000_000) {
      setNotice('Import rejected: choose a JSON file smaller than 1 MB.')
      return
    }
    const imported = importFreeModeConfiguration(
      await file.text(),
      validationContext,
    )
    if (!imported) {
      setNotice('Import rejected: the complete configuration is not valid.')
      return
    }
    replaceConfiguration(imported)
    setNotice('Imported and validated the Free Mode configuration.')
  }

  const selectedDriverIds = new Set(
    configuration.entrants.map((entrant) => entrant.driverId),
  )

  return (
    <div
      aria-label="Free Mode session builder"
      aria-modal="true"
      className="free-mode-backdrop"
      ref={dialogRef}
      role="dialog"
    >
      <section className="free-mode-builder">
        <header className="free-mode-header">
          <div>
            <span>INDEPENDENT SIM SESSION</span>
            <h1>Free Mode Builder</h1>
            <p>
              Championship points, calendar progress and OpenF1 sessions stay
              untouched.
            </p>
          </div>
          <button
            aria-label="Close Free Mode Builder"
            className="free-mode-icon-button"
            onClick={onClose}
            ref={closeButtonRef}
            title="Close"
            type="button"
          >
            <X size={19} />
          </button>
        </header>

        <div className="free-mode-settings">
          <label>
            <span>Category</span>
            <select
              onChange={(event) =>
                setCategory(
                  event.target.value as FreeModeConfiguration['categoryId'],
                )
              }
              value={configuration.categoryId}
            >
              {Object.entries(freeModeCategoryLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="free-mode-track-select">
            <span>Track</span>
            <select
              onChange={(event) => {
                const nextTrack = tracks.find(
                  (track) => track.id === event.target.value,
                )
                setConfiguration((current) => ({
                  ...current,
                  raceLaps: nextTrack
                    ? suggestFreeModeRaceLaps(series, nextTrack.physicalTrack)
                    : current.raceLaps,
                  trackId: event.target.value,
                }))
              }}
              value={configuration.trackId}
            >
              {tracks.map((track) => (
                <option key={track.id} value={track.id}>
                  {track.name} · {track.sources.join(' / ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Session</span>
            <select
              onChange={(event) =>
                setConfiguration((current) => ({
                  ...current,
                  sessionKind: event.target
                    .value as FreeModeConfiguration['sessionKind'],
                }))
              }
              value={configuration.sessionKind}
            >
              {Object.entries(sessionLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Cars</span>
            <div className="free-mode-inline-input">
              <input
                max={FREE_MODE_MAX_CARS}
                min={1}
                onChange={(event) =>
                  setTargetCarCount(Number(event.target.value))
                }
                type="number"
                value={targetCarCount}
              />
              <button onClick={resizeField} type="button">
                Apply
              </button>
            </div>
          </label>
          {configuration.sessionKind === 'race' ? (
            <label>
              <span>Race laps</span>
              <input
                max={999}
                min={1}
                onChange={(event) =>
                  setConfiguration((current) => ({
                    ...current,
                    raceLaps: Number(event.target.value),
                  }))
                }
                type="number"
                value={configuration.raceLaps}
              />
            </label>
          ) : null}
          {configuration.sessionKind === 'practice' ? (
            <label>
              <span>Practice</span>
              <select
                onChange={(event) =>
                  setConfiguration((current) => ({
                    ...current,
                    practiceStage: event.target
                      .value as FreeModeConfiguration['practiceStage'],
                  }))
                }
                value={configuration.practiceStage ?? 'fp1'}
              >
                {Object.entries(practiceStageLabels).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          ) : null}
          {configuration.sessionKind === 'practice' ? (
            <label>
              <span>Minutes</span>
              <input
                max={240}
                min={5}
                onChange={(event) =>
                  setConfiguration((current) => ({
                    ...current,
                    practiceDurationMinutes: Number(event.target.value),
                  }))
                }
                type="number"
                value={configuration.practiceDurationMinutes}
              />
            </label>
          ) : null}
          <label>
            <span>Weather</span>
            <select
              onChange={(event) =>
                setConfiguration((current) => ({
                  ...current,
                  weatherMode: event.target
                    .value as FreeModeConfiguration['weatherMode'],
                }))
              }
              value={configuration.weatherMode}
            >
              {Object.entries(weatherLabels).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Seed</span>
            <input
              maxLength={120}
              onChange={(event) =>
                setConfiguration((current) => ({
                  ...current,
                  seed: event.target.value,
                }))
              }
              value={configuration.seed}
            />
          </label>
          <label>
            <span>Grid</span>
            <select
              disabled={configuration.sessionKind !== 'race'}
              onChange={(event) =>
                setConfiguration((current) => ({
                  ...current,
                  gridMode: event.target
                    .value as FreeModeConfiguration['gridMode'],
                }))
              }
              value={configuration.gridMode}
            >
              <option value="manual">Manual order</option>
              <option value="random">Seeded random</option>
              <option value="qualifying-result">Qualifying result</option>
            </select>
          </label>
        </div>

        <div className="free-mode-tools">
          <div className="free-mode-bulk-add">
            <select
              aria-label="Vehicle for bulk add"
              onChange={(event) => setBulkTeamId(event.target.value)}
              value={bulkTeamId}
            >
              {series.teams.map((team) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
            <input
              aria-label="Cars to add"
              max={40}
              min={1}
              onChange={(event) => setBulkCount(Number(event.target.value))}
              type="number"
              value={bulkCount}
            />
            <button
              disabled={configuration.entrants.length >= FREE_MODE_MAX_CARS}
              onClick={() => appendEntrants(bulkCount)}
              type="button"
            >
              <Plus size={15} /> Add multiple
            </button>
          </div>
          <button onClick={loadCategoryGrid} type="button">
            <RotateCcw size={15} /> Category grid
          </button>
          <button onClick={randomizeDrivers} type="button">
            <Shuffle size={15} /> Drivers
          </button>
          <button onClick={randomizeCars} type="button">
            <Shuffle size={15} /> Cars
          </button>
          <button
            aria-pressed={configuration.equalCars}
            onClick={() =>
              setConfiguration((current) => ({
                ...current,
                equalCars: !current.equalCars,
              }))
            }
            type="button"
          >
            <Equal size={15} /> Equal cars
          </button>
          <button
            onClick={() =>
              setConfiguration((current) => ({ ...current, entrants: [] }))
            }
            type="button"
          >
            <Trash2 size={15} /> Clear
          </button>
          <button
            onClick={() =>
              replaceConfiguration(
                createDefaultFreeModeConfiguration(
                  context.seriesById,
                  configuration.seed,
                ),
              )
            }
            type="button"
          >
            <RotateCcw size={15} /> Reset
          </button>
        </div>

        <div className="free-mode-search">
          <label>
            <span>Find driver</span>
            <input
              onChange={(event) => setDriverSearch(event.target.value)}
              placeholder="Name, code, nationality, rating, history"
              value={driverSearch}
            />
          </label>
          <label>
            <span>Find vehicle</span>
            <input
              onChange={(event) => setVehicleSearch(event.target.value)}
              placeholder="Team name or car number"
              value={vehicleSearch}
            />
          </label>
          <div className="free-mode-field-summary">
            <strong>{configuration.entrants.length}</strong>
            <span>cars</span>
            <strong>{fieldMean.toFixed(1)}</strong>
            <span>{configuration.equalCars ? 'equal rating' : 'field mean'}</span>
          </div>
        </div>

        <div className="free-mode-entry-table" role="region" aria-label="Entries">
          <div className="free-mode-entry-head">
            <span>Grid</span>
            <span>Driver</span>
            <span>Vehicle</span>
            <span>No.</span>
            <span>DRV</span>
            <span>CAR</span>
            <span>Actions</span>
          </div>
          <div className="free-mode-entry-scroll">
            {configuration.entrants.map((entrant, index) => {
              const driver = driverById.get(entrant.driverId)
              const team = teamById.get(entrant.sourceTeamId)
              const rowIssues = issuesByEntrant.get(entrant.id) ?? []
              const driverOptions = filteredDrivers.some(
                (candidate) => candidate.id === entrant.driverId,
              )
                ? filteredDrivers
                : driver
                  ? [driver, ...filteredDrivers]
                  : filteredDrivers
              const teamOptions = teams.some(
                (candidate) => candidate.id === entrant.sourceTeamId,
              )
                ? teams
                : team
                  ? [team, ...teams]
                  : teams

              return (
                <div
                  className={`free-mode-entry-row${rowIssues.length ? ' has-error' : ''}`}
                  key={entrant.id}
                >
                  <strong>{index + 1}</strong>
                  <label>
                    <span className="sr-only">Driver for grid {index + 1}</span>
                    <select
                      aria-invalid={rowIssues.length > 0}
                      onChange={(event) => {
                        updateEntrant(
                          entrant.id,
                          assignDriverToFreeModeSeat(
                            entrant,
                            event.target.value,
                          ),
                        )
                      }}
                      value={entrant.driverId}
                    >
                      {driverOptions.map((option) => (
                        <option
                          disabled={
                            option.id !== entrant.driverId &&
                            selectedDriverIds.has(option.id)
                          }
                          key={option.id}
                          value={option.id}
                        >
                          {option.code} · {option.name} · {option.nationality}{' '}
                          · history {driverHistorySeriesSummary(option)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="free-mode-vehicle-cell">
                    <i
                      aria-hidden="true"
                      style={{ backgroundColor: team?.color ?? '#65717d' }}
                    />
                    <span className="sr-only">Vehicle for grid {index + 1}</span>
                    <select
                      onChange={(event) =>
                        updateEntrant(entrant.id, {
                          sourceTeamId: event.target.value,
                        })
                      }
                      value={entrant.sourceTeamId}
                    >
                      {teamOptions.map((option) => (
                        <option key={option.id} value={option.id}>
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="sr-only">
                      Car number for grid {index + 1}
                    </span>
                    <input
                      max={999}
                      min={0}
                      onChange={(event) =>
                        updateEntrant(entrant.id, {
                          carNumber: Number(event.target.value),
                        })
                      }
                      type="number"
                      value={entrant.carNumber}
                    />
                  </label>
                  <span>{driver?.overall ?? '--'}</span>
                  <span>
                    {configuration.equalCars
                      ? fieldMean.toFixed(0)
                      : team?.performanceSource?.overall ?? '--'}
                  </span>
                  <div className="free-mode-row-actions">
                    <button
                      aria-label={`Move grid ${index + 1} up`}
                      disabled={index === 0}
                      onClick={() => moveEntrant(index, -1)}
                      title="Move up"
                      type="button"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      aria-label={`Move grid ${index + 1} down`}
                      disabled={index === configuration.entrants.length - 1}
                      onClick={() => moveEntrant(index, 1)}
                      title="Move down"
                      type="button"
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      aria-label={`Duplicate vehicle at grid ${index + 1}`}
                      disabled={
                        configuration.entrants.length >= FREE_MODE_MAX_CARS
                      }
                      onClick={() => duplicateEntrant(entrant)}
                      title="Duplicate vehicle with another driver"
                      type="button"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      aria-label={`Delete grid ${index + 1}`}
                      onClick={() => removeEntrant(entrant.id)}
                      title="Delete"
                      type="button"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {rowIssues.length > 0 ? (
                    <small>{rowIssues.join(' ')}</small>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <div className="free-mode-presets">
          <label>
            <span>Preset name</span>
            <input
              maxLength={80}
              onChange={(event) => setPresetName(event.target.value)}
              value={presetName}
            />
          </label>
          <button onClick={savePreset} type="button">
            <Save size={15} /> Save
          </button>
          <select
            aria-label="Saved Free Mode preset"
            onChange={(event) => loadPreset(event.target.value)}
            value={selectedPresetId}
          >
            <option value="">Load preset...</option>
            {presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
          <button disabled={!selectedPresetId} onClick={renamePreset} type="button">
            Rename
          </button>
          <button
            disabled={!selectedPresetId}
            onClick={duplicatePreset}
            type="button"
          >
            <Copy size={15} /> Duplicate
          </button>
          <button disabled={!selectedPresetId} onClick={deletePreset} type="button">
            <Trash2 size={15} /> Delete
          </button>
          <button onClick={exportJson} type="button">
            <Download size={15} /> Export JSON
          </button>
          <button onClick={() => importInputRef.current?.click()} type="button">
            <Upload size={15} /> Import JSON
          </button>
          <input
            accept="application/json,.json"
            className="free-mode-file-input"
            onChange={importJson}
            ref={importInputRef}
            type="file"
          />
        </div>

        <footer className="free-mode-footer">
          <div>
            {notice ? <p>{notice}</p> : null}
            {issues.length > 0 ? (
              <p className="free-mode-error" role="alert">
                {issues.filter((issue) => !issue.entrantId)[0]?.message ??
                  `${issues.length} entry issue${issues.length === 1 ? '' : 's'} must be fixed.`}
              </p>
            ) : (
              <p>
                Ready: {freeModeCategoryLabels[configuration.categoryId]} ·{' '}
                {configuration.entrants.length} cars · SIM only
              </p>
            )}
          </div>
          {compatibleQualifyingResult ? (
            <button
              onClick={() =>
                setConfiguration((current) => ({
                  ...current,
                  gridMode: 'qualifying-result',
                  sessionKind: 'race',
                }))
              }
              type="button"
            >
              Use qualifying grid
            </button>
          ) : null}
          <button
            className="free-mode-start"
            disabled={issues.length > 0}
            onClick={() => onStart(cloneConfiguration(configuration))}
            type="button"
          >
            <Play size={16} /> Start session
          </button>
        </footer>
      </section>
    </div>
  )
}
