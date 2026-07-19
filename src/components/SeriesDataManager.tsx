import {
  Database,
  Download,
  Equal,
  RotateCcw,
  Search,
  Undo2,
  Upload,
  X,
} from 'lucide-react'
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type CSSProperties,
} from 'react'
import {
  DRIVER_ABILITY_GROUPS,
  clampDriverAbility,
  driverAbilityGroupValue,
  driverOverallAbilityPoints,
} from '../simulation/driverAbility'
import type {
  DriverAssignmentRecord,
  DriverPoolRecord,
  SeriesCalendarEvent,
  SeriesId,
  SeriesPackage,
  SeriesRules,
} from '../series/types'
import { validateSeriesPackage } from '../series/seriesRegistry'
import type {
  Driver,
  MachinePerformanceProfile,
  Team,
} from '../types'
import {
  MAX_CONFIGURATION_FILE_BYTES,
  SeriesConfigurationValidationError,
  cloneSeriesConfiguration,
  equalizeMachinePerformance,
  exportDriverCsv,
  exportSeriesConfigurationBackup,
  exportTeamCsv,
  importDriverCsv,
  importSeriesConfigurationBackup,
  importTeamCsv,
} from '../data/seriesConfiguration'

type DataManagerTab = 'drivers' | 'teams' | 'rules' | 'backup'
type DriverRoleFilter =
  | 'all'
  | 'regular'
  | 'third_car'
  | 'reserve'
  | 'development'
  | 'free_agent'
type RankFilter = 'all' | 'top10' | 'top25' | 'top50'
type ImportKind = 'drivers' | 'teams' | 'backup'

type SeriesDataManagerProps = {
  assignments: DriverAssignmentRecord[]
  driverPool: DriverPoolRecord[]
  drivers: Driver[]
  isOpen: boolean
  migrationHistory: string[]
  onApply: (
    teams: Team[],
    drivers: Driver[],
    migrationEntry?: string,
    importedMigrationHistory?: string[],
    rules?: SeriesRules,
    calendar?: SeriesPackage['calendar'],
  ) => void
  onClose: () => void
  onReset: () => void
  series: SeriesPackage
  teams: Team[]
}

type DirectoryRow = DriverPoolRecord & {
  affiliations: DriverAssignmentRecord[]
  currentDriver: Driver | null
  overall: number
  rank: number
}

const seriesLabels: Record<SeriesId, string> = {
  'f1-custom': 'F1',
  f2: 'F2',
  f3: 'F3',
  'super-formula': 'SF',
}

const driverRoleLabels: Record<Exclude<DriverRoleFilter, 'all'>, string> = {
  development: 'Development',
  free_agent: 'Free agent',
  regular: 'Regular',
  reserve: 'Reserve',
  third_car: 'Third car',
}

const machineKeys = [
  'qualifyingPace',
  'racePace',
  'lowSpeedCornerPerformance',
  'mediumSpeedCornerPerformance',
  'highSpeedCornerPerformance',
  'mechanicalGrip',
  'traction',
  'brakingStability',
  'brakingPerformance',
  'aerodynamicEfficiency',
  'downforceGeneration',
  'dragEfficiency',
  'straightLineEfficiency',
  'activeAeroEfficiency',
  'towSensitivity',
  'dirtyAirTolerance',
  'tireWarmup',
  'tireDegManagement',
  'frontTireManagement',
  'rearTireManagement',
  'wetPerformance',
  'intermediatePerformance',
  'kerbHandling',
  'rideCompliance',
  'bumpTolerance',
  'coolingEfficiency',
  'brakeCooling',
  'puOutput',
  'electricalDeploymentEfficiency',
  'energyRecoveryEfficiency',
  'fuelEfficiency',
  'reliability',
] as const satisfies readonly (keyof MachinePerformanceProfile)[]

const tireCompounds = ['S', 'M', 'H', 'I', 'W'] as const

const humanize = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replaceAll('_', ' ')
    .replace(/^./, (letter) => letter.toUpperCase())

const slug = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function downloadText(fileName: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const anchor = document.createElement('a')
  anchor.download = fileName
  anchor.href = url
  anchor.click()
  URL.revokeObjectURL(url)
}

function validationMessage(error: unknown) {
  if (error instanceof SeriesConfigurationValidationError) {
    return error.issues.join(' ')
  }
  return error instanceof Error ? error.message : 'Import failed validation.'
}

function fieldMean(team: Team) {
  return Math.round(
    (machineKeys.reduce((total, key) => total + team.machine[key], 0) /
      machineKeys.length) *
      100,
  )
}

function RulePointsInput({
  label,
  onCommit,
  values,
}: {
  label: string
  onCommit: (values: number[]) => void
  values: number[]
}) {
  const [draft, setDraft] = useState(values.join(', '))

  useEffect(() => setDraft(values.join(', ')), [values])

  return (
    <label>
      <span>{label}</span>
      <input
        onBlur={() => {
          const parsed = draft
            .split(/[\s,]+/)
            .filter(Boolean)
            .map(Number)
          if (parsed.every((value) => Number.isFinite(value) && value >= 0)) {
            onCommit(parsed)
          } else {
            setDraft(values.join(', '))
          }
        }}
        onChange={(event) => setDraft(event.target.value)}
        value={draft}
      />
    </label>
  )
}

export function SeriesDataManager({
  assignments,
  driverPool,
  drivers,
  isOpen,
  migrationHistory,
  onApply,
  onClose,
  onReset,
  series,
  teams,
}: SeriesDataManagerProps) {
  const firstCalendarEventId = series.calendar[0]?.id ?? ''
  const [tab, setTab] = useState<DataManagerTab>('drivers')
  const [selectedDriverId, setSelectedDriverId] = useState(drivers[0]?.id ?? '')
  const [selectedTeamId, setSelectedTeamId] = useState(teams[0]?.id ?? '')
  const [selectedRuleEventId, setSelectedRuleEventId] = useState(
    firstCalendarEventId,
  )
  const [search, setSearch] = useState('')
  const [seriesFilter, setSeriesFilter] = useState<'all' | SeriesId>(series.id)
  const [teamFilter, setTeamFilter] = useState('all')
  const [nationalityFilter, setNationalityFilter] = useState('all')
  const [roleFilter, setRoleFilter] = useState<DriverRoleFilter>('all')
  const [rankFilter, setRankFilter] = useState<RankFilter>('all')
  const [bulkGroup, setBulkGroup] = useState<string>(
    DRIVER_ABILITY_GROUPS[0].key,
  )
  const [bulkMode, setBulkMode] = useState<'adjust' | 'set'>('adjust')
  const [bulkValue, setBulkValue] = useState(1)
  const [status, setStatus] = useState('Configuration validated')
  const [rollback, setRollback] = useState<{
    drivers: Driver[]
    label: string
    migrationHistory: string[]
    rules: SeriesRules
    calendar: SeriesPackage['calendar']
    teams: Team[]
  } | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const pendingImport = useRef<ImportKind>('backup')

  useEffect(() => {
    setSelectedDriverId('')
    setSelectedTeamId('')
    setSelectedRuleEventId(firstCalendarEventId)
    setSeriesFilter(series.id)
    setTeamFilter('all')
    setStatus('Configuration validated')
    setRollback(null)
  }, [firstCalendarEventId, series.id])

  useEffect(() => {
    setSelectedDriverId((current) =>
      drivers.some((driver) => driver.id === current)
        ? current
        : drivers[0]?.id ?? '',
    )
    setSelectedTeamId((current) =>
      teams.some((team) => team.id === current)
        ? current
        : teams[0]?.id ?? '',
    )
  }, [drivers, teams])

  const currentById = useMemo(
    () => new Map(drivers.map((driver) => [driver.id, driver])),
    [drivers],
  )
  const assignmentsByDriver = useMemo(() => {
    const grouped = new Map<string, DriverAssignmentRecord[]>()
    for (const assignment of assignments) {
      const entries = grouped.get(assignment.driverId) ?? []
      entries.push(assignment)
      grouped.set(assignment.driverId, entries)
    }
    return grouped
  }, [assignments])

  const directory = useMemo<DirectoryRow[]>(() => {
    const rows = driverPool.map((poolDriver) => {
      const currentDriver = currentById.get(poolDriver.id) ?? null
      const baselineAffiliations = assignmentsByDriver.get(poolDriver.id) ?? []
      const currentAssignmentIndex = baselineAffiliations.findIndex(
        (assignment) => assignment.seriesId === series.id,
      )
      const affiliations = baselineAffiliations.slice()
      if (currentDriver) {
        const currentAssignment: DriverAssignmentRecord = {
          active: true,
          carNumber: currentDriver.carNumber,
          driverId: currentDriver.id,
          role: currentDriver.seatRole ?? 'regular',
          season: 2026,
          seriesId: series.id,
          teamId: currentDriver.teamId,
        }
        if (currentAssignmentIndex >= 0) affiliations[currentAssignmentIndex] = currentAssignment
        else affiliations.push(currentAssignment)
      }

      return {
        ...poolDriver,
        code: currentDriver?.code ?? poolDriver.code,
        name: currentDriver?.name ?? poolDriver.name,
        nationality: currentDriver?.nationality ?? poolDriver.nationality,
        potential: Math.round((currentDriver?.potential ?? poolDriver.potential / 100) * 100),
        affiliations,
        currentDriver,
        overall: currentDriver
          ? driverOverallAbilityPoints(currentDriver)
          : poolDriver.overall,
        rank: 0,
      }
    })
    rows.sort(
      (a, b) => b.overall - a.overall || a.name.localeCompare(b.name),
    )
    return rows.map((row, index) => ({ ...row, rank: index + 1 }))
  }, [assignmentsByDriver, currentById, driverPool, series.id])

  const nationalities = useMemo(
    () =>
      Array.from(new Set(directory.map((driver) => driver.nationality))).sort(),
    [directory],
  )
  const filteredDirectory = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase()
    const rankLimit =
      rankFilter === 'top10'
        ? 10
        : rankFilter === 'top25'
          ? 25
          : rankFilter === 'top50'
            ? 50
            : Number.POSITIVE_INFINITY

    return directory.filter((driver) => {
      const activeAssignments = driver.affiliations.filter(
        (assignment) => assignment.active,
      )
      const hasSeries =
        seriesFilter === 'all' ||
        activeAssignments.some((assignment) => assignment.seriesId === seriesFilter)
      const hasTeam =
        teamFilter === 'all' ||
        (driver.currentDriver?.teamId ?? null) === teamFilter
      const hasRole =
        roleFilter === 'all' ||
        (roleFilter === 'free_agent'
          ? activeAssignments.length === 0
          : activeAssignments.some((assignment) => assignment.role === roleFilter))
      const matchesSearch =
        normalizedSearch.length === 0 ||
        `${driver.name} ${driver.code} ${driver.id}`
          .toLowerCase()
          .includes(normalizedSearch)

      return (
        hasSeries &&
        hasTeam &&
        hasRole &&
        matchesSearch &&
        (nationalityFilter === 'all' ||
          driver.nationality === nationalityFilter) &&
        driver.rank <= rankLimit
      )
    })
  }, [
    directory,
    nationalityFilter,
    rankFilter,
    roleFilter,
    search,
    seriesFilter,
    teamFilter,
  ])

  const selectedDirectoryDriver =
    directory.find((driver) => driver.id === selectedDriverId) ?? directory[0]
  const selectedDriver = selectedDirectoryDriver?.currentDriver ?? null
  const selectedTeam =
    teams.find((team) => team.id === selectedTeamId) ?? teams[0]
  const selectedRuleEvent =
    series.calendar.find((event) => event.id === selectedRuleEventId) ??
    series.calendar[0]
  const activeFilteredIds = new Set(
    filteredDirectory
      .filter((driver) => driver.currentDriver !== null)
      .map((driver) => driver.id),
  )
  const duplicateProfiles = useMemo(() => {
    const signatures = new Map<string, string[]>()
    for (const driver of drivers) {
      const signature = DRIVER_ABILITY_GROUPS.map((group) =>
        Math.round(driverAbilityGroupValue(driver, group.stats) * 100),
      ).join(':')
      signatures.set(signature, [...(signatures.get(signature) ?? []), driver.code])
    }
    return [...signatures.values()].filter((codes) => codes.length > 1)
  }, [drivers])

  if (!isOpen) return null

  const applyConfiguration = (
    nextTeams: Team[],
    nextDrivers: Driver[],
    label: string,
    canRollback = false,
    importedMigrationHistory?: string[],
    nextRules = series.rules,
    nextCalendar = series.calendar,
  ) => {
    if (canRollback) {
      setRollback({
        ...cloneSeriesConfiguration(
          teams,
          drivers,
          series.rules,
          series.calendar,
        ),
        label,
        migrationHistory: [...migrationHistory],
      })
    }
    onApply(
      nextTeams,
      nextDrivers,
      label,
      importedMigrationHistory,
      nextRules,
      nextCalendar,
    )
    setStatus(label)
  }

  const updateDriver = (patch: Partial<Driver>, label: string) => {
    if (!selectedDriver) return
    applyConfiguration(
      teams,
      drivers.map((driver) =>
        driver.id === selectedDriver.id ? { ...driver, ...patch } : driver,
      ),
      label,
    )
  }

  const updateDriverGroup = (groupKey: string, value: number) => {
    if (!selectedDriver) return
    const group = DRIVER_ABILITY_GROUPS.find((item) => item.key === groupKey)
    if (!group) return
    const skills = { ...selectedDriver.skills }
    for (const stat of group.stats) skills[stat] = clampDriverAbility(value)
    updateDriver({ skills }, `${selectedDriver.code} ${group.label} updated`)
  }

  const updateTeam = (patch: Partial<Team>, label: string) => {
    if (!selectedTeam) return
    applyConfiguration(
      teams.map((team) =>
        team.id === selectedTeam.id ? { ...team, ...patch } : team,
      ),
      drivers,
      label,
    )
  }

  const updateRules = (nextRules: SeriesRules, label: string) => {
    try {
      validateSeriesPackage({ ...series, rules: nextRules })
      applyConfiguration(
        teams,
        drivers,
        label,
        true,
        undefined,
        nextRules,
        series.calendar,
      )
    } catch (error) {
      setStatus(`Rule edit rejected: ${validationMessage(error)}`)
    }
  }

  const updateCalendarEvent = (
    patch: Partial<SeriesCalendarEvent>,
    label: string,
  ) => {
    if (!selectedRuleEvent) return
    const nextCalendar = series.calendar.map((event) =>
      event.id === selectedRuleEvent.id ? { ...event, ...patch } : event,
    )

    try {
      validateSeriesPackage({ ...series, calendar: nextCalendar })
      applyConfiguration(
        teams,
        drivers,
        label,
        true,
        undefined,
        series.rules,
        nextCalendar,
      )
    } catch (error) {
      setStatus(`Event edit rejected: ${validationMessage(error)}`)
    }
  }

  const requestImport = (kind: ImportKind) => {
    pendingImport.current = kind
    fileInput.current?.click()
  }

  const handleFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    if (file.size > MAX_CONFIGURATION_FILE_BYTES) {
      setStatus(`Import rejected: ${file.name} exceeds 2 MB`)
      return
    }

    try {
      const source = await file.text()
      if (pendingImport.current === 'drivers') {
        const nextDrivers = importDriverCsv(source, series, drivers, teams)
        applyConfiguration(
          teams,
          nextDrivers,
          `Driver CSV imported: ${file.name}`,
          true,
        )
      } else if (pendingImport.current === 'teams') {
        const nextTeams = importTeamCsv(source, series, teams)
        applyConfiguration(
          nextTeams,
          drivers,
          `Machine CSV imported: ${file.name}`,
          true,
        )
      } else {
        const next = importSeriesConfigurationBackup(source, series)
        applyConfiguration(
          next.teams,
          next.drivers,
          `JSON backup imported: ${file.name}`,
          true,
          next.migrationHistory,
          next.rules,
          next.calendar,
        )
      }
    } catch (error) {
      setStatus(`Import rejected: ${validationMessage(error)}`)
    }
  }

  const tabs: Array<{ id: DataManagerTab; label: string }> = [
    { id: 'drivers', label: `Drivers ${driverPool.length}` },
    { id: 'teams', label: `Teams ${teams.length}` },
    { id: 'rules', label: 'Rules' },
    { id: 'backup', label: 'Backup' },
  ]

  return (
    <div className="data-manager-backdrop" role="presentation">
      <section
        aria-label={`${series.label} data manager`}
        aria-modal="true"
        className="series-data-manager"
        role="dialog"
      >
        <header className="data-manager-header">
          <div>
            <Database aria-hidden="true" size={18} />
            <span>Series data</span>
            <strong>{series.label}</strong>
          </div>
          <output aria-live="polite">{status}</output>
          <button
            aria-label="Close data manager"
            className="plain-icon-button"
            onClick={onClose}
            title="Close data manager"
            type="button"
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <nav aria-label="Data manager views" className="data-manager-tabs">
          {tabs.map((item) => (
            <button
              aria-current={tab === item.id ? 'page' : undefined}
              key={item.id}
              onClick={() => setTab(item.id)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>

        <input
          accept=".csv,.json,text/csv,application/json"
          hidden
          onChange={handleFile}
          ref={fileInput}
          type="file"
        />

        {tab === 'drivers' ? (
          <div className="data-manager-driver-layout">
            <div className="driver-directory-pane">
              <div className="directory-filters">
                <label className="directory-search">
                  <Search aria-hidden="true" size={14} />
                  <input
                    aria-label="Search drivers"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search driver"
                    type="search"
                    value={search}
                  />
                </label>
                <select
                  aria-label="Filter series"
                  onChange={(event) =>
                    setSeriesFilter(event.target.value as 'all' | SeriesId)
                  }
                  value={seriesFilter}
                >
                  <option value="all">All series</option>
                  {Object.entries(seriesLabels).map(([id, label]) => (
                    <option key={id} value={id}>{label}</option>
                  ))}
                </select>
                <select
                  aria-label="Filter current team"
                  onChange={(event) => setTeamFilter(event.target.value)}
                  value={teamFilter}
                >
                  <option value="all">All teams</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
                <select
                  aria-label="Filter nationality"
                  onChange={(event) => setNationalityFilter(event.target.value)}
                  value={nationalityFilter}
                >
                  <option value="all">All nations</option>
                  {nationalities.map((nationality) => <option key={nationality} value={nationality}>{nationality}</option>)}
                </select>
                <select
                  aria-label="Filter role"
                  onChange={(event) => setRoleFilter(event.target.value as DriverRoleFilter)}
                  value={roleFilter}
                >
                  <option value="all">All roles</option>
                  {Object.entries(driverRoleLabels).map(([role, label]) => <option key={role} value={role}>{label}</option>)}
                </select>
                <select
                  aria-label="Filter rank"
                  onChange={(event) => setRankFilter(event.target.value as RankFilter)}
                  value={rankFilter}
                >
                  <option value="all">All ranks</option>
                  <option value="top10">Top 10</option>
                  <option value="top25">Top 25</option>
                  <option value="top50">Top 50</option>
                </select>
              </div>

              <div className="driver-directory-head">
                <span>RK</span><span>DRIVER</span><span>OVR</span><span>ASSIGNMENTS</span>
              </div>
              <ol className="driver-directory-list" tabIndex={0}>
                {filteredDirectory.map((driver) => (
                  <li key={driver.id}>
                    <button
                      aria-current={driver.id === selectedDriverId ? 'true' : undefined}
                      onClick={() => setSelectedDriverId(driver.id)}
                      type="button"
                    >
                      <span>{driver.rank}</span>
                      <strong>{driver.code} <small>{driver.name}</small></strong>
                      <b>{driver.overall}</b>
                      <span>
                        {driver.affiliations.length > 0
                          ? driver.affiliations.map((assignment) => `${seriesLabels[assignment.seriesId]}:${assignment.role}`).join(' / ')
                          : 'FREE AGENT'}
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
              <div className="bulk-edit-row">
                <select aria-label="Bulk ability group" onChange={(event) => setBulkGroup(event.target.value)} value={bulkGroup}>
                  {DRIVER_ABILITY_GROUPS.map((group) => <option key={group.key} value={group.key}>{group.label}</option>)}
                </select>
                <select aria-label="Bulk edit mode" onChange={(event) => setBulkMode(event.target.value as 'adjust' | 'set')} value={bulkMode}>
                  <option value="adjust">Adjust</option><option value="set">Set</option>
                </select>
                <input aria-label="Bulk ability value" max={100} min={bulkMode === 'set' ? 0 : -20} onChange={(event) => setBulkValue(Number(event.target.value))} step={1} type="number" value={bulkValue} />
                <button
                  disabled={activeFilteredIds.size === 0}
                  onClick={() => {
                    const group = DRIVER_ABILITY_GROUPS.find((item) => item.key === bulkGroup)
                    if (!group) return
                    const next = drivers.map((driver) => {
                      if (!activeFilteredIds.has(driver.id)) return driver
                      const current = driverAbilityGroupValue(driver, group.stats) * 100
                      const target = (bulkMode === 'set' ? bulkValue : current + bulkValue) / 100
                      const skills = { ...driver.skills }
                      for (const stat of group.stats) skills[stat] = clampDriverAbility(target)
                      return { ...driver, skills }
                    })
                    applyConfiguration(teams, next, `Bulk ${group.label}: ${activeFilteredIds.size} drivers`, true)
                  }}
                  type="button"
                >
                  Apply {activeFilteredIds.size}
                </button>
              </div>
            </div>

            <div className="driver-editor-pane">
              {selectedDirectoryDriver ? (
                <>
                  <div className="data-editor-title">
                    <div>
                      <span>#{selectedDriver?.carNumber ?? '--'} {selectedDirectoryDriver.code}</span>
                      <strong>{selectedDirectoryDriver.name}</strong>
                    </div>
                    <b>{selectedDirectoryDriver.overall}</b>
                  </div>
                  <div className="assignment-strip">
                    {selectedDirectoryDriver.affiliations.length > 0
                      ? selectedDirectoryDriver.affiliations.map((assignment) => (
                          <span key={`${assignment.seriesId}:${assignment.teamId}:${assignment.role}`}>
                            {seriesLabels[assignment.seriesId]} / {assignment.teamId} / {assignment.role}
                          </span>
                        ))
                      : <span>FREE AGENT</span>}
                  </div>
                  {selectedDriver ? (
                    <>
                      <div className="driver-metadata-grid">
                        <label><span>Name</span><input onChange={(event) => { if (event.target.value.trim()) updateDriver({ name: event.target.value }, `${selectedDriver.code} name updated`) }} value={selectedDriver.name} /></label>
                        <label><span>Code</span><input maxLength={5} onChange={(event) => { if (event.target.value.trim()) updateDriver({ code: event.target.value.toUpperCase() }, `${selectedDriver.code} code updated`) }} value={selectedDriver.code} /></label>
                        <label><span>Nationality</span><input maxLength={40} onChange={(event) => updateDriver({ nationality: event.target.value }, `${selectedDriver.code} nationality updated`)} value={selectedDriver.nationality ?? ''} /></label>
                        <label><span>Car number</span><input max={999} min={1} onChange={(event) => {
                          const carNumber = Number(event.target.value)
                          if (Number.isInteger(carNumber) && !drivers.some((driver) => driver.id !== selectedDriver.id && driver.carNumber === carNumber)) updateDriver({ carNumber }, `${selectedDriver.code} car number updated`)
                        }} type="number" value={selectedDriver.carNumber} /></label>
                        <label><span>Team</span><select onChange={(event) => updateDriver({ teamId: event.target.value }, `${selectedDriver.code} seat updated`)} value={selectedDriver.teamId}>{teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}</select></label>
                        <label><span>Role</span><select onChange={(event) => updateDriver({ seatRole: event.target.value as NonNullable<Driver['seatRole']> }, `${selectedDriver.code} role updated`)} value={selectedDriver.seatRole ?? 'regular'}>{Object.entries(driverRoleLabels).filter(([role]) => role !== 'free_agent').map(([role, label]) => <option key={role} value={role}>{label}</option>)}</select></label>
                        <label><span>Potential</span><input max={100} min={0} onChange={(event) => updateDriver({ potential: Number(event.target.value) / 100 }, `${selectedDriver.code} potential updated`)} type="number" value={Math.round((selectedDriver.potential ?? 0) * 100)} /></label>
                        <label><span>Source</span><output>{selectedDriver.performanceSource?.fileName ?? 'series registry'}</output></label>
                      </div>
                      <div className="ability-editor-grid">
                        {DRIVER_ABILITY_GROUPS.map((group) => {
                          const value = Math.round(driverAbilityGroupValue(selectedDriver, group.stats) * 100)
                          return (
                            <label key={group.key}>
                              <span>{group.label}</span>
                              <input max={100} min={0} onChange={(event) => updateDriverGroup(group.key, Number(event.target.value) / 100)} step={1} type="range" value={value} />
                              <strong>{value}</strong>
                            </label>
                          )
                        })}
                      </div>
                    </>
                  ) : (
                    <div className="read-only-driver-record">
                      <span>Nationality</span><strong>{selectedDirectoryDriver.nationality}</strong>
                      <span>Potential</span><strong>{selectedDirectoryDriver.potential}</strong>
                      <span>Registry</span><strong>2026 driver pool</strong>
                    </div>
                  )}
                </>
              ) : null}
              <footer className="data-editor-actions">
                <button onClick={() => downloadText(`${slug(series.shortLabel)}-drivers.csv`, exportDriverCsv(drivers), 'text/csv;charset=utf-8')} title="Export driver CSV" type="button"><Download size={14} /> Drivers CSV</button>
                <button onClick={() => requestImport('drivers')} title="Import driver CSV" type="button"><Upload size={14} /> Drivers CSV</button>
              </footer>
            </div>
          </div>
        ) : null}

        {tab === 'teams' ? (
          <div className="team-data-layout">
            <div className="team-data-list" role="list">
              {teams.map((team) => (
                <button aria-current={team.id === selectedTeam?.id ? 'true' : undefined} key={team.id} onClick={() => setSelectedTeamId(team.id)} style={{ '--team-color': team.color } as CSSProperties} type="button">
                  <i /><strong>{team.name}</strong><span>{fieldMean(team)}</span>
                </button>
              ))}
            </div>
            {selectedTeam ? (
              <div className="team-data-editor">
                <div className="team-identity-fields">
                  <label><span>Team name</span><input maxLength={80} onChange={(event) => { if (event.target.value.trim()) updateTeam({ name: event.target.value }, `${selectedTeam.id} name updated`) }} value={selectedTeam.name} /></label>
                  <label><span>Color</span><input onChange={(event) => updateTeam({ color: event.target.value }, `${selectedTeam.id} color updated`)} type="color" value={selectedTeam.color} /></label>
                  <label><span>Pit crew</span><input max={100} min={55} onChange={(event) => updateTeam({ pitCrewSpeed: Number(event.target.value) / 100 }, `${selectedTeam.id} pit crew updated`)} type="number" value={Math.round(selectedTeam.pitCrewSpeed * 100)} /></label>
                  <output>{selectedTeam.performanceSource?.fileName ?? 'series registry'}</output>
                </div>
                <div className="machine-editor-grid">
                  {machineKeys.map((key) => (
                    <label key={key}>
                      <span>{humanize(key)}</span>
                      <input max={100} min={55} onChange={(event) => updateTeam({ machine: { ...selectedTeam.machine, [key]: Number(event.target.value) / 100 } }, `${selectedTeam.id} ${key} updated`)} step={1} type="range" value={Math.round(selectedTeam.machine[key] * 100)} />
                      <strong>{Math.round(selectedTeam.machine[key] * 100)}</strong>
                    </label>
                  ))}
                </div>
                <footer className="data-editor-actions">
                  <button onClick={() => downloadText(`${slug(series.shortLabel)}-machines.csv`, exportTeamCsv(teams), 'text/csv;charset=utf-8')} title="Export machine CSV" type="button"><Download size={14} /> Machines CSV</button>
                  <button onClick={() => requestImport('teams')} title="Import machine CSV" type="button"><Upload size={14} /> Machines CSV</button>
                  <button onClick={() => applyConfiguration(equalizeMachinePerformance(teams), drivers, 'Machine performance equalised', true)} title="Equalise all machine ratings" type="button"><Equal size={14} /> Equalise</button>
                </footer>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === 'rules' ? (
          <div className="series-rules-view">
            <div className="series-rule-summary">
              <span>Cars</span><strong>{series.carCount}</strong>
              <span>Teams</span><strong>{series.teamCount}</strong>
              <span>Qualifying</span><strong>{series.rules.qualifying.format} / {series.rules.qualifying.segments.map((segment) => `${segment.name} ${Math.round(segment.durationSeconds / 60)}m`).join(' / ')}</strong>
              <span>Overtake</span><strong>{series.rules.overtakeSystem.toUpperCase()} / {series.rules.overtakeActivation}</strong>
              <span>Feature points</span><strong>{series.rules.points.feature.join('-')}</strong>
              <span>Sprint points</span><strong>{series.rules.points.sprint.join('-') || 'N/A'}</strong>
              <span>Qualifying points</span><strong>{series.rules.points.qualifying.join('-') || 'N/A'}</strong>
              <span>Tyres</span><strong>{series.rules.tireSupplier} / {Object.entries(series.rules.tires.standardAllocation).map(([compound, count]) => `${compound}${count}`).join(' ')}</strong>
              <span>Mandatory stop</span><strong>{series.rules.featureRaceMandatoryPitStop ? 'YES' : 'NO'}</strong>
            </div>
            <div className="rule-editor-controls">
              <label><span>Practice minutes</span><input max={240} min={1} onChange={(event) => updateRules({ ...series.rules, freePracticeDurationSeconds: Number(event.target.value) * 60 }, 'Practice duration updated')} type="number" value={Math.round(series.rules.freePracticeDurationSeconds / 60)} /></label>
              <label><span>Qualifying break minutes</span><input max={60} min={0} onChange={(event) => updateRules({ ...series.rules, qualifying: { ...series.rules.qualifying, breakSeconds: Number(event.target.value) * 60 } }, 'Qualifying break updated')} type="number" value={Math.round(series.rules.qualifying.breakSeconds / 60)} /></label>
              <label className="rule-checkbox"><input checked={series.rules.featureRaceMandatoryPitStop} onChange={(event) => updateRules({ ...series.rules, featureRaceMandatoryPitStop: event.target.checked }, 'Mandatory stop rule updated')} type="checkbox" /><span>Mandatory feature stop</span></label>
              <label className="rule-checkbox"><input checked={series.rules.featureRaceTwoDryCompounds} onChange={(event) => updateRules({ ...series.rules, featureRaceTwoDryCompounds: event.target.checked }, 'Two-compound rule updated')} type="checkbox" /><span>Two dry compounds</span></label>
              <label><span>Team scoring</span><select onChange={(event) => updateRules({ ...series.rules, championshipTeamScoring: event.target.value as SeriesRules['championshipTeamScoring'] }, 'Team scoring updated')} value={series.rules.championshipTeamScoring}><option value="all-cars">All cars</option><option value="best-two">Best two</option></select></label>
              {tireCompounds.map((compound) => (
                <label key={compound}><span>{compound} tyre sets</span><input max={30} min={0} onChange={(event) => updateRules({ ...series.rules, tires: { ...series.rules.tires, standardAllocation: { ...series.rules.tires.standardAllocation, [compound]: Number(event.target.value) } } }, `${compound} tyre allocation updated`)} type="number" value={series.rules.tires.standardAllocation[compound]} /></label>
              ))}
              <RulePointsInput label="Feature points" onCommit={(feature) => updateRules({ ...series.rules, points: { ...series.rules.points, feature } }, 'Feature points updated')} values={series.rules.points.feature} />
              <RulePointsInput label="Sprint points" onCommit={(sprint) => updateRules({ ...series.rules, points: { ...series.rules.points, sprint } }, 'Sprint points updated')} values={series.rules.points.sprint} />
              <RulePointsInput label="Qualifying points" onCommit={(qualifying) => updateRules({ ...series.rules, points: { ...series.rules.points, qualifying } }, 'Qualifying points updated')} values={series.rules.points.qualifying} />
            </div>
            <div className="qualifying-rule-editor">
              <div><span>SEGMENT</span><span>DURATION</span><span>ADVANCE</span></div>
              {series.rules.qualifying.segments.map((segment, index) => (
                <div key={segment.name}>
                  <strong>{series.rules.qualifying.format === 'grouped' && index === 0 ? `${segment.name} A/B` : segment.name}</strong>
                  <label><input aria-label={`${segment.name} duration minutes`} max={60} min={1} onChange={(event) => {
                    const segments = series.rules.qualifying.segments.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, durationSeconds: Number(event.target.value) * (series.rules.qualifying.format === 'grouped' && index === 0 ? 120 : 60) } : candidate)
                    updateRules({ ...series.rules, qualifying: { ...series.rules.qualifying, segments } }, `${segment.name} duration updated`)
                  }} type="number" value={Math.round(segment.durationSeconds / (series.rules.qualifying.format === 'grouped' && index === 0 ? 120 : 60))} /><span>min</span></label>
                  {segment.advanceCount === null ? <span>FINAL</span> : <label><input aria-label={`${segment.name} advance count`} max={index === 0 ? series.carCount - 1 : (series.rules.qualifying.segments[index - 1].advanceCount ?? series.carCount) - 1} min={1} onChange={(event) => {
                    const segments = series.rules.qualifying.segments.map((candidate, candidateIndex) => candidateIndex === index ? { ...candidate, advanceCount: Number(event.target.value) } : candidate)
                    updateRules({ ...series.rules, qualifying: { ...series.rules.qualifying, segments } }, `${segment.name} advance count updated`)
                  }} type="number" value={segment.advanceCount} /><span>cars</span></label>}
                </div>
              ))}
            </div>
            {selectedRuleEvent ? (
              <div className="event-rule-editor">
                <header><span>EVENT OVERRIDE</span><strong>R{selectedRuleEvent.round} {selectedRuleEvent.id}</strong><small>{selectedRuleEvent.trackId}</small></header>
                <label><span>Race count</span><input max={3} min={1} onChange={(event) => updateCalendarEvent({ raceCount: Number(event.target.value) }, `${selectedRuleEvent.id} race count updated`)} type="number" value={selectedRuleEvent.raceCount} /></label>
                <label><span>Race laps</span><input min={1} onChange={(event) => updateCalendarEvent({ raceLaps: event.target.value === '' ? undefined : Number(event.target.value) }, `${selectedRuleEvent.id} lap override updated`)} placeholder="AUTO" type="number" value={selectedRuleEvent.raceLaps ?? ''} /></label>
                <label><span>Time limit min</span><input min={1} onChange={(event) => updateCalendarEvent({ raceTimeLimitSeconds: event.target.value === '' ? undefined : Number(event.target.value) * 60 }, `${selectedRuleEvent.id} time limit updated`)} placeholder="SERIES" type="number" value={selectedRuleEvent.raceTimeLimitSeconds === undefined ? '' : selectedRuleEvent.raceTimeLimitSeconds / 60} /></label>
                <label><span>Overall limit min</span><input min={1} onChange={(event) => updateCalendarEvent({ raceOverallTimeLimitSeconds: event.target.value === '' ? undefined : Number(event.target.value) * 60 }, `${selectedRuleEvent.id} overall limit updated`)} placeholder="SERIES" type="number" value={selectedRuleEvent.raceOverallTimeLimitSeconds === undefined ? '' : selectedRuleEvent.raceOverallTimeLimitSeconds / 60} /></label>
                <label><span>Mandatory stop</span><select onChange={(event) => updateCalendarEvent({ featureRaceMandatoryPitStop: event.target.value === 'inherit' ? undefined : event.target.value === 'yes' }, `${selectedRuleEvent.id} pit rule updated`)} value={selectedRuleEvent.featureRaceMandatoryPitStop === undefined ? 'inherit' : selectedRuleEvent.featureRaceMandatoryPitStop ? 'yes' : 'no'}><option value="inherit">Series rule</option><option value="yes">Required</option><option value="no">Not required</option></select></label>
                <label><span>Points source</span><select onChange={(event) => updateCalendarEvent({ featurePoints: event.target.value === 'series' ? undefined : [...series.rules.points.feature] }, `${selectedRuleEvent.id} points source updated`)} value={selectedRuleEvent.featurePoints ? 'event' : 'series'}><option value="series">Series table</option><option value="event">Event override</option></select></label>
                <label className="rule-checkbox"><input checked={selectedRuleEvent.cancelled ?? false} onChange={(event) => updateCalendarEvent({ cancelled: event.target.checked || undefined }, `${selectedRuleEvent.id} cancellation updated`)} type="checkbox" /><span>Cancelled / no points</span></label>
                {selectedRuleEvent.featurePoints ? <RulePointsInput label="Event points" onCommit={(featurePoints) => updateCalendarEvent({ featurePoints }, `${selectedRuleEvent.id} points updated`)} values={selectedRuleEvent.featurePoints} /> : null}
              </div>
            ) : null}
            <div className="event-rule-table">
              <div><span>ROUND</span><span>EVENT</span><span>RACES</span><span>OVERRIDES</span></div>
              {series.calendar.map((event) => (
                <div className={event.id === selectedRuleEvent?.id ? 'is-selected' : undefined} key={event.id}>
                  <span>{event.round}</span><strong><button onClick={() => setSelectedRuleEventId(event.id)} type="button">{event.id}</button></strong><span>{event.raceCount}</span>
                  <span>{[
                    event.weekendStages ? event.weekendStages.join('/') : null,
                    event.qualifying ? `${event.qualifying.format}:${event.qualifying.segments.map((segment) => segment.name).join('/')}` : null,
                    event.raceLaps ? `${event.raceLaps} laps` : null,
                    event.featurePoints ? `${event.featurePoints.join('-')} pts` : null,
                    event.featureRaceMandatoryPitStop === false ? 'no mandatory stop' : null,
                    event.gridSourceTrackId ? `grid:${event.gridSourceTrackId}` : null,
                  ].filter(Boolean).join(' / ') || 'standard'}</span>
                </div>
              ))}
            </div>
            <div className="rule-source-list">
              {series.sources.map((source) => <a href={source.url} key={source.url} rel="noreferrer" target="_blank"><strong>{source.label}</strong><span>{source.sourceDate}</span></a>)}
            </div>
          </div>
        ) : null}

        {tab === 'backup' ? (
          <div className="backup-data-view">
            <div className="configuration-audit-grid">
              <span>Save version</span><strong>1</strong>
              <span>Driver records</span><strong>{drivers.length} / {series.carCount}</strong>
              <span>Team records</span><strong>{teams.length} / {series.teamCount}</strong>
              <span>Pool records</span><strong>{driverPool.length}</strong>
              <span>Duplicate ability profiles</span><strong>{duplicateProfiles.length}</strong>
              <span>Migration entries</span><strong>{migrationHistory.length}</strong>
            </div>
            {duplicateProfiles.length > 0 ? (
              <div className="configuration-warning-list">
                {duplicateProfiles.map((codes) => <span key={codes.join(':')}>Duplicate profile: {codes.join(', ')}</span>)}
              </div>
            ) : null}
            <ol className="migration-history-list">
              {migrationHistory.length > 0
                ? migrationHistory.slice().reverse().map((entry, index) => <li key={`${entry}:${index}`}>{entry}</li>)
                : <li>No migrations recorded</li>}
            </ol>
            <div className="backup-actions">
              <button onClick={() => downloadText(`${slug(series.shortLabel)}-configuration.json`, exportSeriesConfigurationBackup(series, teams, drivers, new Date().toISOString(), migrationHistory), 'application/json')} title="Export JSON backup" type="button"><Download size={14} /> JSON backup</button>
              <button onClick={() => requestImport('backup')} title="Import JSON backup" type="button"><Upload size={14} /> JSON backup</button>
              <button onClick={() => { onReset(); setStatus('Official baseline restored') }} title="Restore official baseline" type="button"><RotateCcw size={14} /> Official baseline</button>
              <button disabled={!rollback} onClick={() => {
                if (!rollback) return
                onApply(rollback.teams, rollback.drivers, `Rolled back: ${rollback.label}`, rollback.migrationHistory, rollback.rules, rollback.calendar)
                setStatus(`Rolled back: ${rollback.label}`)
                setRollback(null)
              }} title="Rollback last import" type="button"><Undo2 size={14} /> Rollback import</button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  )
}
