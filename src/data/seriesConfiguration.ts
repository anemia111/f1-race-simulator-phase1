import {
  DRIVER_ABILITY_GROUPS,
  DRIVER_ABILITY_STATS,
  clampDriverAbility,
  driverAbilityGroupValue,
} from '../simulation/driverAbility'
import { validateSeriesPackage } from '../series/seriesRegistry'
import type {
  SeriesCalendarEvent,
  SeriesId,
  SeriesPackage,
  SeriesRules,
} from '../series/types'
import type {
  Driver,
  DriverSkillProfile,
  MachinePerformanceProfile,
  Team,
} from '../types'

export const SERIES_CONFIGURATION_STORAGE_KEY =
  'race-sim-series-configuration-v1'
export const SERIES_CONFIGURATION_SAVE_VERSION = 1
export const MAX_CONFIGURATION_FILE_BYTES = 2_000_000

const driverRoles = [
  'regular',
  'third_car',
  'reserve',
  'development',
] as const

type DriverRole = NonNullable<Driver['seatRole']>

type StoredTeam = Pick<Team, 'color' | 'id' | 'machine' | 'name' | 'pitCrewSpeed'>

type StoredDriver = Pick<
  Driver,
  | 'carNumber'
  | 'code'
  | 'id'
  | 'name'
  | 'nationality'
  | 'potential'
  | 'seatRole'
  | 'skills'
  | 'teamId'
>

export type PersistedSeriesConfiguration = {
  calendar?: SeriesCalendarEvent[]
  drivers: StoredDriver[]
  migrationHistory: string[]
  saveVersion: 1
  seriesId: SeriesId
  teams: StoredTeam[]
  rules?: SeriesRules
}

export type SeriesConfigurationBackup = PersistedSeriesConfiguration & {
  exportedAt: string
}

export type SeriesConfigurationSnapshot = {
  calendar: SeriesCalendarEvent[]
  drivers: Driver[]
  migrationHistory: string[]
  rules: SeriesRules
  teams: Team[]
}

export class SeriesConfigurationValidationError extends Error {
  readonly issues: string[]

  constructor(issues: string[]) {
    super(issues.join('\n'))
    this.name = 'SeriesConfigurationValidationError'
    this.issues = issues
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

const cloneTeams = (teams: Team[]) =>
  teams.map((team) => ({ ...team, machine: { ...team.machine } }))

const cloneDrivers = (drivers: Driver[]) =>
  drivers.map((driver) => ({
    ...driver,
    skills: { ...driver.skills },
    style: { ...driver.style },
  }))

const cloneJson = <Value,>(value: Value): Value =>
  JSON.parse(JSON.stringify(value)) as Value

const machineKeysFor = (series: SeriesPackage) =>
  Object.keys(series.teams[0]?.machine ?? {}) as Array<
    keyof MachinePerformanceProfile
  >

const rejectSpreadsheetFormula = (value: string) =>
  /^[=+\-@]/.test(value) ? `'${value}` : value

const restoreSpreadsheetFormulaText = (value: string) =>
  /^'[=+\-@]/.test(value) ? value.slice(1) : value

const csvCell = (value: string | number) => {
  const text = rejectSpreadsheetFormula(String(value))
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

const csvLine = (values: Array<string | number>) =>
  values.map(csvCell).join(',')

const readableNumber = (value: number) =>
  Number(value.toFixed(4)).toString()

function parseCsvTable(source: string): string[][] {
  if (new TextEncoder().encode(source).byteLength > MAX_CONFIGURATION_FILE_BYTES) {
    throw new SeriesConfigurationValidationError([
      `CSV exceeds the ${MAX_CONFIGURATION_FILE_BYTES / 1_000_000} MB limit.`,
    ])
  }

  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let inQuotes = false

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]

    if (inQuotes) {
      if (character === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index += 1
        } else {
          inQuotes = false
        }
      } else {
        field += character
      }
      continue
    }

    if (character === '"') {
      if (field.length > 0) {
        throw new SeriesConfigurationValidationError([
          `CSV has an unexpected quote near character ${index + 1}.`,
        ])
      }
      inQuotes = true
    } else if (character === ',') {
      row.push(restoreSpreadsheetFormulaText(field.trim()))
      field = ''
    } else if (character === '\n' || character === '\r') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      row.push(restoreSpreadsheetFormulaText(field.trim()))
      field = ''
      if (row.some((cell) => cell.length > 0)) rows.push(row)
      row = []
    } else {
      field += character
    }
  }

  if (inQuotes) {
    throw new SeriesConfigurationValidationError([
      'CSV ends inside a quoted field.',
    ])
  }

  row.push(restoreSpreadsheetFormulaText(field.trim()))
  if (row.some((cell) => cell.length > 0)) rows.push(row)

  if (rows.length < 2) {
    throw new SeriesConfigurationValidationError([
      'CSV must contain a header and at least one data row.',
    ])
  }

  if (rows[0][0]?.charCodeAt(0) === 0xfeff) {
    rows[0][0] = rows[0][0].slice(1)
  }

  const duplicateHeaders = rows[0].filter(
    (header, index, headers) => headers.indexOf(header) !== index,
  )
  if (duplicateHeaders.length > 0) {
    throw new SeriesConfigurationValidationError([
      `CSV has duplicate columns: ${Array.from(new Set(duplicateHeaders)).join(', ')}.`,
    ])
  }

  return rows
}

function rowsAsRecords(source: string) {
  const rows = parseCsvTable(source)
  const headers = rows[0]

  return rows.slice(1).map((row, index) => {
    if (row.length !== headers.length) {
      throw new SeriesConfigurationValidationError([
        `CSV row ${index + 2} has ${row.length} columns; expected ${headers.length}.`,
      ])
    }

    return Object.fromEntries(headers.map((header, column) => [header, row[column]]))
  })
}

function requiredText(
  value: unknown,
  label: string,
  maximumLength = 80,
): string {
  if (typeof value !== 'string') {
    throw new SeriesConfigurationValidationError([`${label} must be text.`])
  }

  const trimmed = value.trim()
  if (trimmed.length === 0 || trimmed.length > maximumLength) {
    throw new SeriesConfigurationValidationError([
      `${label} must contain 1-${maximumLength} characters.`,
    ])
  }

  return trimmed
}

function optionalText(
  value: unknown,
  label: string,
  maximumLength = 40,
): string | undefined {
  if (value === undefined || value === null || value === '') return undefined
  return requiredText(value, label, maximumLength)
}

function boundedNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
): number {
  const numeric =
    typeof value === 'string' && value.trim() !== '' ? Number(value) : value

  if (!isFiniteNumber(numeric) || numeric < minimum || numeric > maximum) {
    throw new SeriesConfigurationValidationError([
      `${label} must be between ${minimum} and ${maximum}.`,
    ])
  }

  return numeric
}

function integerNumber(
  value: unknown,
  label: string,
  minimum: number,
  maximum: number,
) {
  const numeric = boundedNumber(value, label, minimum, maximum)
  if (!Number.isInteger(numeric)) {
    throw new SeriesConfigurationValidationError([`${label} must be an integer.`])
  }
  return numeric
}

function validateExactIds(
  label: string,
  candidateIds: string[],
  expectedIds: string[],
) {
  const duplicates = candidateIds.filter(
    (id, index) => candidateIds.indexOf(id) !== index,
  )
  const expected = new Set(expectedIds)
  const missing = expectedIds.filter((id) => !candidateIds.includes(id))
  const unknown = candidateIds.filter((id) => !expected.has(id))
  const issues = [
    duplicates.length > 0
      ? `${label} has duplicate ids: ${Array.from(new Set(duplicates)).join(', ')}.`
      : null,
    missing.length > 0 ? `${label} is missing ids: ${missing.join(', ')}.` : null,
    unknown.length > 0 ? `${label} has unknown ids: ${unknown.join(', ')}.` : null,
  ].filter((issue): issue is string => issue !== null)

  if (issues.length > 0) throw new SeriesConfigurationValidationError(issues)
}

function parseStoredTeams(value: unknown, series: SeriesPackage): Team[] {
  if (!Array.isArray(value)) {
    throw new SeriesConfigurationValidationError(['teams must be an array.'])
  }

  const machineKeys = machineKeysFor(series)
  const baseById = new Map(series.teams.map((team) => [team.id, team]))
  const ids = value.map((team, index) =>
    isRecord(team) ? requiredText(team.id, `teams[${index}].id`) : '',
  )
  validateExactIds('teams', ids, series.teams.map((team) => team.id))

  return value.map((candidate, index) => {
    if (!isRecord(candidate) || !isRecord(candidate.machine)) {
      throw new SeriesConfigurationValidationError([
        `teams[${index}] must contain a machine object.`,
      ])
    }

    const id = ids[index]
    const base = baseById.get(id)!
    const candidateMachine = candidate.machine as Record<string, unknown>
    const machine = Object.fromEntries(
      machineKeys.map((key) => [
        key,
        boundedNumber(
          candidateMachine[key],
          `${id}.${key}`,
          0.55,
          1,
        ),
      ]),
    ) as MachinePerformanceProfile
    const color = requiredText(candidate.color, `${id}.color`, 16)

    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      throw new SeriesConfigurationValidationError([
        `${id}.color must be a six-digit hex color.`,
      ])
    }

    return {
      ...base,
      color,
      machine,
      name: requiredText(candidate.name, `${id}.name`),
      pitCrewSpeed: boundedNumber(
        candidate.pitCrewSpeed,
        `${id}.pitCrewSpeed`,
        0.55,
        1,
      ),
    }
  })
}

function parseStoredDrivers(
  value: unknown,
  series: SeriesPackage,
  teams: Team[],
): Driver[] {
  if (!Array.isArray(value)) {
    throw new SeriesConfigurationValidationError(['drivers must be an array.'])
  }

  const baseById = new Map(series.drivers.map((driver) => [driver.id, driver]))
  const teamIds = new Set(teams.map((team) => team.id))
  const ids = value.map((driver, index) =>
    isRecord(driver) ? requiredText(driver.id, `drivers[${index}].id`) : '',
  )
  validateExactIds('drivers', ids, series.drivers.map((driver) => driver.id))

  const drivers = value.map((candidate, index) => {
    if (!isRecord(candidate) || !isRecord(candidate.skills)) {
      throw new SeriesConfigurationValidationError([
        `drivers[${index}] must contain a skills object.`,
      ])
    }

    const id = ids[index]
    const base = baseById.get(id)!
    const candidateSkills = candidate.skills as Record<string, unknown>
    const teamId = requiredText(candidate.teamId, `${id}.teamId`)
    const role = candidate.seatRole ?? 'regular'

    if (!teamIds.has(teamId)) {
      throw new SeriesConfigurationValidationError([
        `${id}.teamId references unknown team ${teamId}.`,
      ])
    }
    if (
      typeof role !== 'string' ||
      !driverRoles.includes(role as DriverRole)
    ) {
      throw new SeriesConfigurationValidationError([`${id}.seatRole is invalid.`])
    }

    const skills = Object.fromEntries(
      DRIVER_ABILITY_STATS.map((stat) => [
        stat,
        boundedNumber(candidateSkills[stat], `${id}.${stat}`, 0, 1),
      ]),
    ) as DriverSkillProfile

    return {
      ...base,
      carNumber: integerNumber(candidate.carNumber, `${id}.carNumber`, 1, 999),
      code: requiredText(candidate.code, `${id}.code`, 5).toUpperCase(),
      id,
      name: requiredText(candidate.name, `${id}.name`),
      nationality: optionalText(candidate.nationality, `${id}.nationality`),
      potential: boundedNumber(candidate.potential ?? 0, `${id}.potential`, 0, 1),
      seatRole: role as DriverRole,
      skills,
      style: { ...base.style },
      teamId,
    }
  })

  const numbers = drivers.map((driver) => driver.carNumber)
  const duplicates = numbers.filter(
    (number, index) => numbers.indexOf(number) !== index,
  )
  if (duplicates.length > 0) {
    throw new SeriesConfigurationValidationError([
      `Car numbers must be unique within ${series.shortLabel}: ${Array.from(new Set(duplicates)).join(', ')}.`,
    ])
  }

  return drivers
}

function parseConfigurationValue(
  value: unknown,
  series: SeriesPackage,
): SeriesConfigurationSnapshot {
  if (!isRecord(value)) {
    throw new SeriesConfigurationValidationError([
      'Configuration must be a JSON object.',
    ])
  }
  if (value.saveVersion !== SERIES_CONFIGURATION_SAVE_VERSION) {
    throw new SeriesConfigurationValidationError([
      `Unsupported saveVersion ${String(value.saveVersion)}.`,
    ])
  }
  if (value.seriesId !== series.id) {
    throw new SeriesConfigurationValidationError([
      `This file is for ${String(value.seriesId)}, not ${series.id}.`,
    ])
  }

  const teams = parseStoredTeams(value.teams, series)
  const drivers = parseStoredDrivers(value.drivers, series, teams)
  const calendar =
    value.calendar === undefined
      ? cloneJson(series.calendar)
      : (() => {
          if (!Array.isArray(value.calendar)) {
            throw new SeriesConfigurationValidationError([
              'calendar must be an array.',
            ])
          }
          const candidate = cloneJson(
            value.calendar,
          ) as SeriesCalendarEvent[]
          const candidateIds = candidate.map((event) =>
            isRecord(event) ? requiredText(event.id, 'calendar event id') : '',
          )
          validateExactIds(
            'calendar',
            candidateIds,
            series.calendar.map((event) => event.id),
          )
          return candidate
        })()
  const rules =
    value.rules === undefined
      ? cloneJson(series.rules)
      : cloneJson(value.rules as SeriesRules)

  try {
    validateSeriesPackage({ ...series, calendar, drivers, rules, teams })
  } catch (error) {
    throw new SeriesConfigurationValidationError([
      error instanceof Error ? error.message : 'Rules or calendar are invalid.',
    ])
  }
  const migrationHistory = Array.isArray(value.migrationHistory)
    ? value.migrationHistory
        .filter((entry): entry is string => typeof entry === 'string')
        .map((entry) => entry.slice(0, 160))
        .slice(-20)
    : []

  return { calendar, drivers, migrationHistory, rules, teams }
}

export function serializeSeriesConfiguration(
  seriesId: SeriesId,
  teams: Team[],
  drivers: Driver[],
  migrationHistory: string[] = [],
  rules?: SeriesRules,
  calendar?: SeriesCalendarEvent[],
): PersistedSeriesConfiguration {
  return {
    calendar: calendar ? cloneJson(calendar) : undefined,
    drivers: drivers.map((driver) => ({
      carNumber: driver.carNumber,
      code: driver.code,
      id: driver.id,
      name: driver.name,
      nationality: driver.nationality,
      potential: driver.potential,
      seatRole: driver.seatRole,
      skills: { ...driver.skills },
      teamId: driver.teamId,
    })),
    migrationHistory: migrationHistory.slice(-20),
    saveVersion: SERIES_CONFIGURATION_SAVE_VERSION,
    seriesId,
    teams: teams.map((team) => ({
      color: team.color,
      id: team.id,
      machine: { ...team.machine },
      name: team.name,
      pitCrewSpeed: team.pitCrewSpeed,
    })),
    rules: rules ? cloneJson(rules) : undefined,
  }
}

export function parsePersistedSeriesConfiguration(
  raw: string | null,
  series: SeriesPackage,
): SeriesConfigurationSnapshot | null {
  if (!raw) return null

  try {
    if (new TextEncoder().encode(raw).byteLength > MAX_CONFIGURATION_FILE_BYTES) {
      return null
    }
    return parseConfigurationValue(JSON.parse(raw) as unknown, series)
  } catch {
    return null
  }
}

export function exportSeriesConfigurationBackup(
  series: SeriesPackage,
  teams: Team[],
  drivers: Driver[],
  exportedAt = new Date().toISOString(),
  migrationHistory: string[] = [],
) {
  const backup: SeriesConfigurationBackup = {
    ...serializeSeriesConfiguration(
      series.id,
      teams,
      drivers,
      migrationHistory,
      series.rules,
      series.calendar,
    ),
    exportedAt,
  }

  return `${JSON.stringify(backup, null, 2)}\n`
}

export function importSeriesConfigurationBackup(
  source: string,
  series: SeriesPackage,
): SeriesConfigurationSnapshot {
  if (new TextEncoder().encode(source).byteLength > MAX_CONFIGURATION_FILE_BYTES) {
    throw new SeriesConfigurationValidationError([
      `JSON exceeds the ${MAX_CONFIGURATION_FILE_BYTES / 1_000_000} MB limit.`,
    ])
  }

  try {
    return parseConfigurationValue(JSON.parse(source) as unknown, series)
  } catch (error) {
    if (error instanceof SeriesConfigurationValidationError) throw error
    throw new SeriesConfigurationValidationError(['JSON could not be parsed.'])
  }
}

export function exportDriverCsv(drivers: Driver[]) {
  const headers = [
    'driver_id',
    'name',
    'code',
    'nationality',
    'car_number',
    'team_id',
    'role',
    'potential',
    'overall',
    ...DRIVER_ABILITY_GROUPS.map((group) => group.key),
  ]
  const lines = drivers.map((driver) =>
    csvLine([
      driver.id,
      driver.name,
      driver.code,
      driver.nationality ?? '',
      driver.carNumber,
      driver.teamId,
      driver.seatRole ?? 'regular',
      Math.round((driver.potential ?? 0) * 100),
      Math.round(
        (DRIVER_ABILITY_GROUPS.reduce(
          (total, group) => total + driverAbilityGroupValue(driver, group.stats),
          0,
        ) /
          DRIVER_ABILITY_GROUPS.length) *
          100,
      ),
      ...DRIVER_ABILITY_GROUPS.map((group) =>
        Math.round(driverAbilityGroupValue(driver, group.stats) * 100),
      ),
    ]),
  )

  return `${[csvLine(headers), ...lines].join('\r\n')}\r\n`
}

export function importDriverCsv(
  source: string,
  series: SeriesPackage,
  currentDrivers: Driver[],
  teams: Team[],
) {
  const records = rowsAsRecords(source)
  if (currentDrivers.length !== series.carCount) {
    throw new SeriesConfigurationValidationError([
      `Current ${series.shortLabel} field has ${currentDrivers.length} drivers; expected ${series.carCount}.`,
    ])
  }
  const requiredHeaders = [
    'driver_id',
    'name',
    'code',
    'car_number',
    'team_id',
    'role',
    'potential',
    ...DRIVER_ABILITY_GROUPS.map((group) => group.key),
  ]
  const missingHeaders = requiredHeaders.filter(
    (header) => !(header in (records[0] ?? {})),
  )
  if (missingHeaders.length > 0) {
    throw new SeriesConfigurationValidationError([
      `Driver CSV is missing columns: ${missingHeaders.join(', ')}.`,
    ])
  }

  validateExactIds(
    'driver CSV',
    records.map((record) => record.driver_id),
    currentDrivers.map((driver) => driver.id),
  )

  const currentById = new Map(currentDrivers.map((driver) => [driver.id, driver]))
  const teamIds = new Set(teams.map((team) => team.id))
  const imported = records.map((record) => {
    const current = currentById.get(record.driver_id)!
    const teamId = requiredText(record.team_id, `${current.id}.team_id`)
    const role = requiredText(record.role, `${current.id}.role`) as DriverRole
    if (!teamIds.has(teamId)) {
      throw new SeriesConfigurationValidationError([
        `${current.id}.team_id references unknown team ${teamId}.`,
      ])
    }
    if (!driverRoles.includes(role)) {
      throw new SeriesConfigurationValidationError([
        `${current.id}.role is invalid.`,
      ])
    }

    const skills = { ...current.skills }
    for (const group of DRIVER_ABILITY_GROUPS) {
      const value = boundedNumber(record[group.key], `${current.id}.${group.key}`, 0, 100) / 100
      for (const stat of group.stats) skills[stat] = clampDriverAbility(value)
    }

    return {
      ...current,
      carNumber: integerNumber(record.car_number, `${current.id}.car_number`, 1, 999),
      code: requiredText(record.code, `${current.id}.code`, 5).toUpperCase(),
      name: requiredText(record.name, `${current.id}.name`),
      nationality: optionalText(record.nationality, `${current.id}.nationality`),
      potential: boundedNumber(record.potential, `${current.id}.potential`, 0, 100) / 100,
      seatRole: role,
      skills,
      teamId,
    }
  })

  const numbers = imported.map((driver) => driver.carNumber)
  const duplicates = numbers.filter(
    (number, index) => numbers.indexOf(number) !== index,
  )
  if (duplicates.length > 0) {
    throw new SeriesConfigurationValidationError([
      `Driver CSV has duplicate car numbers: ${Array.from(new Set(duplicates)).join(', ')}.`,
    ])
  }

  return cloneDrivers(imported)
}

export function exportTeamCsv(teams: Team[]) {
  const machineKeys = Object.keys(teams[0]?.machine ?? {}) as Array<
    keyof MachinePerformanceProfile
  >
  const headers = ['team_id', 'name', 'color', 'pit_crew', ...machineKeys]
  const lines = teams.map((team) =>
    csvLine([
      team.id,
      team.name,
      team.color,
      readableNumber(team.pitCrewSpeed * 100),
      ...machineKeys.map((key) => readableNumber(team.machine[key] * 100)),
    ]),
  )

  return `${[csvLine(headers), ...lines].join('\r\n')}\r\n`
}

export function importTeamCsv(
  source: string,
  series: SeriesPackage,
  currentTeams: Team[],
) {
  const records = rowsAsRecords(source)
  const machineKeys = machineKeysFor(series)
  const requiredHeaders = [
    'team_id',
    'name',
    'color',
    'pit_crew',
    ...machineKeys,
  ]
  const missingHeaders = requiredHeaders.filter(
    (header) => !(header in (records[0] ?? {})),
  )
  if (missingHeaders.length > 0) {
    throw new SeriesConfigurationValidationError([
      `Team CSV is missing columns: ${missingHeaders.join(', ')}.`,
    ])
  }

  validateExactIds(
    'team CSV',
    records.map((record) => record.team_id),
    currentTeams.map((team) => team.id),
  )

  const currentById = new Map(currentTeams.map((team) => [team.id, team]))
  return records.map((record) => {
    const current = currentById.get(record.team_id)!
    const color = requiredText(record.color, `${current.id}.color`, 16)
    if (!/^#[0-9a-f]{6}$/i.test(color)) {
      throw new SeriesConfigurationValidationError([
        `${current.id}.color must be a six-digit hex color.`,
      ])
    }

    const machine = Object.fromEntries(
      machineKeys.map((key) => [
        key,
        boundedNumber(record[key], `${current.id}.${key}`, 55, 100) / 100,
      ]),
    ) as MachinePerformanceProfile

    return {
      ...current,
      color,
      machine,
      name: requiredText(record.name, `${current.id}.name`),
      pitCrewSpeed:
        boundedNumber(record.pit_crew, `${current.id}.pit_crew`, 55, 100) /
        100,
    }
  })
}

export function equalizeMachinePerformance(teams: Team[]) {
  if (teams.length === 0) return []

  const machineKeys = Object.keys(teams[0].machine) as Array<
    keyof MachinePerformanceProfile
  >
  const averageMachine = Object.fromEntries(
    machineKeys.map((key) => [
      key,
      teams.reduce((total, team) => total + team.machine[key], 0) / teams.length,
    ]),
  ) as MachinePerformanceProfile
  const averagePitCrew =
    teams.reduce((total, team) => total + team.pitCrewSpeed, 0) / teams.length

  return teams.map((team) => ({
    ...team,
    machine: { ...averageMachine },
    pitCrewSpeed: averagePitCrew,
  }))
}

export function cloneSeriesConfiguration(
  teams: Team[],
  drivers: Driver[],
  rules: SeriesRules,
  calendar: SeriesCalendarEvent[],
): Pick<
  SeriesConfigurationSnapshot,
  'calendar' | 'drivers' | 'rules' | 'teams'
> {
  return {
    calendar: cloneJson(calendar),
    drivers: cloneDrivers(drivers),
    rules: cloneJson(rules),
    teams: cloneTeams(teams),
  }
}
