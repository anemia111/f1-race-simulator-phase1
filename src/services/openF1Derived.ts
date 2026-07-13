import type {
  FlagState,
  WeekendStage,
  WeekendState,
} from '../types'
import type {
  OpenF1Bundle,
  OpenF1Interval,
  OpenF1Position,
  OpenF1RaceControl,
} from './openF1'
import { openF1StageForSession } from './openF1'

export type OpenF1LiveTiming = {
  gapToLeaderLabel: string
  intervalLabel: string
}

export type OpenF1LiveRaceState = {
  flag: FlagState | null
  flagLabel: string | null
  positionsByCode: Map<string, number>
  raceControlCategory: string | null
  raceControlMessage: string | null
  timingByCode: Map<string, OpenF1LiveTiming>
  weekend: WeekendState | null
}

function latestByDate<T extends { date: string }>(items: T[]) {
  return [...items].sort((a, b) => b.date.localeCompare(a.date))[0] ?? null
}

function driverCodesByNumber(bundle: OpenF1Bundle) {
  return new Map(
    bundle.drivers.map((driver) => [driver.driver_number, driver.name_acronym]),
  )
}

function formatGap(value: number | string | null | undefined, leaderLabel: string) {
  if (typeof value === 'number') {
    return value === 0 ? leaderLabel : `+${value.toFixed(3)}`
  }

  return value ?? '-'
}

function latestPositionsByCode(bundle: OpenF1Bundle, targetMs: number) {
  const codesByNumber = driverCodesByNumber(bundle)
  const latestByDriver = new Map<number, OpenF1Position>()

  for (const position of bundle.positions) {
    if (new Date(position.date).getTime() > targetMs) {
      continue
    }
    const current = latestByDriver.get(position.driver_number)

    if (!current || position.date.localeCompare(current.date) > 0) {
      latestByDriver.set(position.driver_number, position)
    }
  }

  return new Map(
    [...latestByDriver.values()]
      .map((position) => {
        const code = codesByNumber.get(position.driver_number)

        return code ? ([code, position.position] as const) : null
      })
      .filter((entry): entry is readonly [string, number] => entry !== null),
  )
}

function latestTimingByCode(bundle: OpenF1Bundle, targetMs: number) {
  const codesByNumber = driverCodesByNumber(bundle)
  const latestByDriver = new Map<number, OpenF1Interval>()

  for (const interval of bundle.intervals) {
    if (new Date(interval.date).getTime() > targetMs) {
      continue
    }
    const current = latestByDriver.get(interval.driver_number)

    if (!current || interval.date.localeCompare(current.date) > 0) {
      latestByDriver.set(interval.driver_number, interval)
    }
  }

  return new Map(
    [...latestByDriver.values()]
      .map((interval) => {
        const code = codesByNumber.get(interval.driver_number)

        return code
          ? ([
              code,
              {
                gapToLeaderLabel: formatGap(interval.gap_to_leader, 'Leader'),
                intervalLabel: formatGap(interval.interval, '-'),
              },
            ] as const)
          : null
      })
      .filter(
        (entry): entry is readonly [string, OpenF1LiveTiming] => entry !== null,
      ),
  )
}

export function flagFromRaceControl(
  raceControl: OpenF1RaceControl | null,
): Pick<OpenF1LiveRaceState, 'flag' | 'flagLabel'> {
  if (!raceControl) {
    return { flag: null, flagLabel: null }
  }

  const text = `${raceControl.flag ?? ''} ${raceControl.category} ${raceControl.message}`
    .toUpperCase()
    .replace(/\s+/g, ' ')

  if (text.includes('RED FLAG')) {
    return { flag: 'red', flagLabel: 'RED' }
  }

  if (text.includes('SAFETY CAR') && !text.includes('VIRTUAL')) {
    return { flag: 'sc', flagLabel: 'SC' }
  }

  if (text.includes('VSC') || text.includes('VIRTUAL SAFETY CAR')) {
    return { flag: 'vsc', flagLabel: 'VSC' }
  }

  if (text.includes('YELLOW')) {
    return { flag: 'yellow', flagLabel: 'YELLOW' }
  }

  if (text.includes('GREEN') || text.includes('CLEAR')) {
    return { flag: 'clear', flagLabel: 'CLEAR' }
  }

  return { flag: null, flagLabel: null }
}

function stageLabel(stage: WeekendStage) {
  return {
    fp1: 'FP1',
    fp2: 'FP2',
    fp3: 'FP3',
    sprintQualifying: 'Sprint Qualifying',
    qualifying: 'Qualifying',
    race: 'Race',
    sprint: 'Sprint',
  }[stage]
}

function openF1WeekendState(
  bundle: OpenF1Bundle,
  fallbackStage: WeekendStage,
  targetMs = Date.now(),
): WeekendState | null {
  if (bundle.sessions.length === 0) {
    return null
  }

  const now = targetMs
  const current =
    bundle.sessions.find((session) => {
      const start = new Date(session.date_start).getTime()
      const end = new Date(session.date_end).getTime()

      return start <= now && now <= end
    }) ??
    bundle.sessions
      .filter((session) => new Date(session.date_end).getTime() <= now)
      .slice()
      .sort((a, b) => b.date_end.localeCompare(a.date_end))[0] ??
    bundle.sessions
      .slice()
      .sort((a, b) => a.date_start.localeCompare(b.date_start))[0]

  const stage = current ? openF1StageForSession(current) : fallbackStage
  const completed = Array.from(
    new Set(
      bundle.sessions
        .filter((session) => new Date(session.date_end).getTime() < now)
        .map(openF1StageForSession)
        .filter((candidate) => candidate !== stage),
    ),
  )

  return {
    completed,
    label: stageLabel(stage),
    source: 'openf1',
    stage,
  }
}

export function buildOpenF1LiveRaceState(
  bundle: OpenF1Bundle | null | undefined,
  fallbackStage: WeekendStage,
  targetDate?: string | null,
): OpenF1LiveRaceState {
  if (!bundle) {
    return {
      flag: null,
      flagLabel: null,
      positionsByCode: new Map(),
      raceControlCategory: null,
      raceControlMessage: null,
      timingByCode: new Map(),
      weekend: null,
    }
  }

  const parsedTargetMs = targetDate
    ? new Date(targetDate).getTime()
    : Date.now()
  const targetMs = Number.isFinite(parsedTargetMs)
    ? parsedTargetMs
    : Date.now()
  const raceControl = latestByDate(
    bundle.raceControl.filter(
      (event) => new Date(event.date).getTime() <= targetMs,
    ),
  )
  const flag = flagFromRaceControl(raceControl)

  return {
    ...flag,
    positionsByCode: latestPositionsByCode(bundle, targetMs),
    raceControlCategory: raceControl?.category ?? null,
    raceControlMessage: raceControl?.message ?? null,
    timingByCode: latestTimingByCode(bundle, targetMs),
    weekend: openF1WeekendState(bundle, fallbackStage, targetMs),
  }
}
