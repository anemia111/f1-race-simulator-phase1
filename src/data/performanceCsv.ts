import type {
  Driver,
  DriverStyleProfile,
  MachinePerformanceProfile,
  Team,
} from '../types'
import performanceCsv from './f1Performance.csv?raw'
import { expandedDriverSkills } from './driverProfiles'

export const PERFORMANCE_CSV_FILE = 'src/data/f1Performance.csv'

type ParsedCsvRow = {
  lineNumber: number
  values: string[]
}

type CsvRecord = {
  lineNumber: number
  values: Record<string, string>
}

export type PerformanceCsvAudit = {
  fileName: string
  driverColumns: string[]
  driverIds: string[]
  machineColumns: string[]
  teamDriverCounts: Record<string, number>
  teamIds: string[]
}

const DRIVER_COLUMNS = [
  'Driver ID',
  'Team',
  'Driver',
  'Code',
  'Car Number',
  'Nationality',
  'Seat Role',
  'Overall',
  'Potential',
  'Qualifying pace',
  'Race pace',
  'Consistency',
  'Tyre management',
  'Wet skill',
  'Race start',
  'Overtaking',
  'Defending',
  'Technical feedback',
  'Adaptability',
  'Experience',
  'Error control',
] as const

const MACHINE_COLUMNS = [
  'Team',
  'Overall',
  'Qualifying pace',
  'Race pace',
  'Top speed',
  'Acceleration',
  'Power unit',
  'ERS deployment',
  'ERS recovery',
  'Fuel efficiency',
  'Low-speed downforce',
  'Mid-speed downforce',
  'High-speed downforce',
  'Mechanical grip',
  'Traction',
  'Braking stability',
  'Tire preservation',
  'Tire warmup',
  'Dirty air resistance',
  'Wet performance',
  'Reliability',
  'Setup window',
  'Development potential',
] as const

const TEAM_COLORS: Record<string, string> = {
  'Aston Martin': '#229971',
  'Racing Bulls': '#6692ff',
  Alpine: '#2293d1',
  Audi: '#c8ccd0',
  Ferrari: '#dc0000',
  'Haas F1 Team': '#b6babd',
  McLaren: '#ff8700',
  Mercedes: '#27f4d2',
  'Red Bull Racing': '#3671c6',
  Williams: '#64c4ff',
}

const NEUTRAL_DRIVER_STYLE: DriverStyleProfile = {
  frontEndPreference: 0,
  rearStabilityNeed: 0,
  oversteerTolerance: 0.5,
  understeerTolerance: 0.5,
  brakingAggression: 0.5,
  cornerShapePreference: 0,
}

const mean = (...values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length

export function normalizeCsvAbility(value: number) {
  return value / 100
}

function validationError(
  fileName: string,
  lineNumber: number,
  column: string,
  value: unknown,
  expectation: string,
): never {
  throw new Error(
    `${fileName} row ${lineNumber}, column "${column}": ${JSON.stringify(value)}; expected ${expectation}.`,
  )
}

function parseCsvRows(csv: string, fileName: string): ParsedCsvRow[] {
  const rows: ParsedCsvRow[] = []
  let values: string[] = []
  let field = ''
  let inQuotes = false
  let lineNumber = 1
  let rowLineNumber = 1

  const pushRow = () => {
    values.push(field)
    rows.push({ lineNumber: rowLineNumber, values })
    values = []
    field = ''
    rowLineNumber = lineNumber + 1
  }

  for (let index = 0; index < csv.length; index += 1) {
    const character = csv[index]

    if (character === '"') {
      if (inQuotes && csv[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        inQuotes = !inQuotes
      }
      continue
    }

    if (!inQuotes && character === ',') {
      values.push(field)
      field = ''
      continue
    }

    if (!inQuotes && (character === '\n' || character === '\r')) {
      if (character === '\r' && csv[index + 1] === '\n') {
        index += 1
      }
      pushRow()
      lineNumber += 1
      continue
    }

    field += character
  }

  if (inQuotes) {
    validationError(fileName, rowLineNumber, '<row>', field, 'a closed quoted field')
  }

  if (field.length > 0 || values.length > 0) {
    values.push(field)
    rows.push({ lineNumber: rowLineNumber, values })
  }

  if (rows[0]?.values[0]) {
    rows[0].values[0] = rows[0].values[0].replace(/^\uFEFF/u, '')
  }

  return rows
}

function nonEmptyRow(row: ParsedCsvRow) {
  return row.values.some((value) => value.trim().length > 0)
}

function requireColumns(
  fileName: string,
  lineNumber: number,
  actual: string[],
  required: readonly string[],
) {
  for (const column of required) {
    if (!actual.includes(column)) {
      validationError(fileName, lineNumber, column, null, 'a required CSV column')
    }
  }
}

function recordsFor(
  rows: ParsedCsvRow[],
  headerRow: ParsedCsvRow,
): CsvRecord[] {
  const headers = headerRow.values.map((value) => value.trim())

  return rows.filter(nonEmptyRow).map((row) => ({
    lineNumber: row.lineNumber,
    values: Object.fromEntries(
      headers.map((header, index) => [header, row.values[index]?.trim() ?? '']),
    ),
  }))
}

function requiredText(
  record: CsvRecord,
  column: string,
  fileName: string,
) {
  const value = record.values[column]?.trim() ?? ''

  if (!value) {
    validationError(fileName, record.lineNumber, column, value, 'a non-empty string')
  }

  return value
}

function requiredNumber(
  record: CsvRecord,
  column: string,
  fileName: string,
  minimum: number,
  maximum: number,
) {
  const raw = requiredText(record, column, fileName)
  const value = Number(raw)

  if (!Number.isFinite(value) || value < minimum || value > maximum) {
    validationError(
      fileName,
      record.lineNumber,
      column,
      raw,
      `a finite number from ${minimum} to ${maximum}`,
    )
  }

  return value
}

function stableTeamId(teamName: string) {
  return teamName
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-|-$/gu, '')
}

function rawNumericRatings(
  record: CsvRecord,
  columns: readonly string[],
  fileName: string,
  maximum: number,
) {
  return Object.fromEntries(
    columns
      .filter(
        (column) =>
          column !== 'Driver ID' &&
          column !== 'Team' &&
          column !== 'Driver' &&
          column !== 'Code' &&
          column !== 'Car Number' &&
          column !== 'Nationality' &&
          column !== 'Seat Role',
      )
      .map((column) => [
        column,
        requiredNumber(record, column, fileName, 0, maximum),
      ]),
  )
}

function machineProfileFor(
  record: CsvRecord,
  fileName: string,
): MachinePerformanceProfile {
  const rating = (column: (typeof MACHINE_COLUMNS)[number]) =>
    normalizeCsvAbility(requiredNumber(record, column, fileName, 0, 100))
  const lowSpeedDownforce = rating('Low-speed downforce')
  const midSpeedDownforce = rating('Mid-speed downforce')
  const highSpeedDownforce = rating('High-speed downforce')
  const mechanicalGrip = rating('Mechanical grip')
  const setupWindow = rating('Setup window')
  const topSpeed = rating('Top speed')

  return {
    qualifyingPace: rating('Qualifying pace'),
    racePace: rating('Race pace'),
    lowSpeedCornerPerformance: lowSpeedDownforce,
    mediumSpeedCornerPerformance: midSpeedDownforce,
    highSpeedCornerPerformance: highSpeedDownforce,
    mechanicalGrip,
    traction: rating('Traction'),
    brakingStability: rating('Braking stability'),
    brakingPerformance: rating('Braking stability'),
    aerodynamicEfficiency: mean(midSpeedDownforce, highSpeedDownforce, topSpeed),
    downforceGeneration: mean(
      lowSpeedDownforce,
      midSpeedDownforce,
      highSpeedDownforce,
    ),
    dragEfficiency: topSpeed,
    straightLineEfficiency: rating('Acceleration'),
    activeAeroEfficiency: mean(highSpeedDownforce, setupWindow),
    towSensitivity: topSpeed,
    dirtyAirTolerance: rating('Dirty air resistance'),
    tireWarmup: rating('Tire warmup'),
    tireDegManagement: rating('Tire preservation'),
    frontTireManagement: rating('Tire preservation'),
    rearTireManagement: rating('Tire preservation'),
    wetPerformance: rating('Wet performance'),
    intermediatePerformance: rating('Wet performance'),
    kerbHandling: mean(mechanicalGrip, setupWindow),
    rideCompliance: setupWindow,
    bumpTolerance: mean(mechanicalGrip, setupWindow),
    coolingEfficiency: 0.8,
    brakeCooling: 0.8,
    puOutput: rating('Power unit'),
    electricalDeploymentEfficiency: rating('ERS deployment'),
    energyRecoveryEfficiency: rating('ERS recovery'),
    fuelEfficiency: rating('Fuel efficiency'),
    reliability: rating('Reliability'),
  }
}

export function loadPerformanceCsv(
  csv: string,
  fileName = PERFORMANCE_CSV_FILE,
): {
  audit: PerformanceCsvAudit
  drivers: Driver[]
  teams: Team[]
} {
  const rows = parseCsvRows(csv, fileName)
  const machineMarkerIndex = rows.findIndex(
    (row) => row.values[0]?.trim() === 'TEAM MACHINE ABILITIES',
  )

  if (machineMarkerIndex < 0) {
    validationError(
      fileName,
      1,
      '<section>',
      null,
      'a TEAM MACHINE ABILITIES section',
    )
  }

  const driverHeader = rows[0]
  const machineHeader = rows
    .slice(machineMarkerIndex + 1)
    .find(nonEmptyRow)

  if (!driverHeader || !machineHeader) {
    validationError(fileName, 1, '<header>', null, 'driver and machine headers')
  }

  const driverHeaders = driverHeader.values.map((value) => value.trim())
  const machineHeaders = machineHeader.values.map((value) => value.trim())
  requireColumns(fileName, driverHeader.lineNumber, driverHeaders, DRIVER_COLUMNS)
  requireColumns(fileName, machineHeader.lineNumber, machineHeaders, MACHINE_COLUMNS)

  const driverRecords = recordsFor(
    rows.slice(1, machineMarkerIndex),
    driverHeader,
  )
  const machineHeaderIndex = rows.indexOf(machineHeader)
  const machineRecords = recordsFor(rows.slice(machineHeaderIndex + 1), machineHeader)

  if (driverRecords.length !== 30) {
    validationError(
      fileName,
      driverHeader.lineNumber,
      '<driver count>',
      driverRecords.length,
      'exactly 30 driver rows',
    )
  }

  if (machineRecords.length !== 10) {
    validationError(
      fileName,
      machineHeader.lineNumber,
      '<team count>',
      machineRecords.length,
      'exactly 10 machine rows',
    )
  }

  const teamNames = new Set<string>()
  const teams = machineRecords.map((record) => {
    const name = requiredText(record, 'Team', fileName)

    if (teamNames.has(name)) {
      validationError(fileName, record.lineNumber, 'Team', name, 'a unique team name')
    }
    teamNames.add(name)

    const color = TEAM_COLORS[name]
    if (!color) {
      validationError(fileName, record.lineNumber, 'Team', name, 'a team with configured display metadata')
    }
    const rawRatings = rawNumericRatings(record, MACHINE_COLUMNS, fileName, 100)

    return {
      id: stableTeamId(name),
      name,
      color,
      machine: machineProfileFor(record, fileName),
      pitCrewSpeed: 0.82,
      performanceSource: {
        fileName,
        overall: rawRatings.Overall,
        rawRatings,
      },
    } satisfies Team
  })
  const teamIdByName = new Map(teams.map((team) => [team.name, team.id]))
  const driverIds = new Set<string>()
  const driverCodes = new Set<string>()
  const carNumbers = new Set<number>()
  const drivers = driverRecords.map((record, index) => {
    const teamName = requiredText(record, 'Team', fileName)
    const teamId = teamIdByName.get(teamName)

    if (!teamId) {
      validationError(
        fileName,
        record.lineNumber,
        'Team',
        teamName,
        'a team present in the machine section',
      )
    }

    const code = requiredText(record, 'Code', fileName).toUpperCase()
    const id = requiredText(record, 'Driver ID', fileName)
    const carNumber = requiredNumber(record, 'Car Number', fileName, 0, 999)

    if (driverIds.has(id)) {
      validationError(fileName, record.lineNumber, 'Driver ID', id, 'a unique driver ID')
    }
    if (driverCodes.has(code)) {
      validationError(fileName, record.lineNumber, 'Code', code, 'a unique driver code')
    }
    if (carNumbers.has(carNumber)) {
      validationError(fileName, record.lineNumber, 'Car Number', carNumber, 'a unique car number')
    }
    driverIds.add(id)
    driverCodes.add(code)
    carNumbers.add(carNumber)

    const rawRatings = rawNumericRatings(record, DRIVER_COLUMNS, fileName, 100)
    const rating = (column: (typeof DRIVER_COLUMNS)[number]) =>
      normalizeCsvAbility(requiredNumber(record, column, fileName, 0, 100))
    const skills = expandedDriverSkills({
      adaptability: rating('Adaptability'),
      consistency: rating('Consistency'),
      defending: rating('Defending'),
      errorControl: rating('Error control'),
      experience: rating('Experience'),
      overtaking: rating('Overtaking'),
      qualifyingPace: rating('Qualifying pace'),
      racePace: rating('Race pace'),
      raceStart: rating('Race start'),
      technicalFeedback: rating('Technical feedback'),
      tyreManagement: rating('Tyre management'),
      wetSkill: rating('Wet skill'),
    })
    const seatRole = requiredText(record, 'Seat Role', fileName)

    if (seatRole !== 'regular' && seatRole !== 'third_car') {
      validationError(
        fileName,
        record.lineNumber,
        'Seat Role',
        seatRole,
        'regular or third_car',
      )
    }

    return {
      id,
      teamId,
      code,
      name: requiredText(record, 'Driver', fileName),
      carNumber,
      nationality: requiredText(record, 'Nationality', fileName),
      potential: rating('Potential'),
      seatRole,
      skills,
      style: { ...NEUTRAL_DRIVER_STYLE },
      startOffset: -index * 0.018,
      tire: 'M',
      performanceSource: {
        fileName,
        overall: rawRatings.Overall,
        rawRatings,
      },
    } satisfies Driver
  })
  const teamDriverCounts = Object.fromEntries(
    teams.map((team) => [
      team.id,
      drivers.filter((driver) => driver.teamId === team.id).length,
    ]),
  )

  for (const team of teams) {
    if (teamDriverCounts[team.id] !== 3) {
      validationError(
        fileName,
        machineHeader.lineNumber,
        'Team',
        team.name,
        `exactly 3 linked drivers; received ${teamDriverCounts[team.id]}`,
      )
    }
  }

  return {
    teams,
    drivers,
    audit: {
      fileName,
      driverColumns: DRIVER_COLUMNS.slice(),
      driverIds: drivers.map((driver) => driver.id),
      machineColumns: MACHINE_COLUMNS.slice(),
      teamDriverCounts,
      teamIds: teams.map((team) => team.id),
    },
  }
}

const loadedPerformance = loadPerformanceCsv(performanceCsv)

export const initialTeams = loadedPerformance.teams
export const initialDrivers = loadedPerformance.drivers
export const performanceCsvAudit = loadedPerformance.audit
