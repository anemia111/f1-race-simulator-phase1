import { courseAssetsFor } from '../series/expansionAssets'
import { projectPointToArcProgress } from '../data/sectorBoundaries'
import { phaseOneConfig } from '../data/phaseOne'
import { expansionCourseTiming } from '../data/expansionTiming'
import { createInitialRace } from '../simulation/race'
import type { BroadcastTimingRow } from '../components/BroadcastDashboard'
import type { RaceConfig, RaceSnapshot, TrackDefinition } from '../types'
import { coursePosition } from './coursePhysics'
import { motorsportStandings } from './race'
import { timingDurations } from './sectorTiming'
import { bestSectorTime, classifySectorTime } from '../domain/sectorTiming'
import type { MotorsportRaceConfig, MotorsportRaceState } from './types'

// Presentation defaults only. The category engine remains the sole source of motion/timing.
const empty = createInitialRace()
export function dashboardCourse(config: MotorsportRaceConfig): TrackDefinition {
  const points = Array.from({ length: 512 }, (_, index) => coursePosition(config.course, index / 512 * config.course.lengthM))
  const xs = points.map(p => p[0]), ys = points.map(p => p[1])
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2, cy = (Math.max(...ys) + Math.min(...ys)) / 2
  const scale = 48 / Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const anchors = courseAssetsFor(config.championship === 'super-gt' ? 'super-gt-gt500' : config.championship === 'wec' ? 'wec-hypercar' : config.championship).find(course => course.id === config.course.id)?.corners ?? []
  const corners = anchors.map(corner => {
    const progress = projectPointToArcProgress(config.course.points.map(([x,y]) => [x,0,y]), corner.position)
    const [x,y] = coursePosition(config.course, progress * config.course.lengthM)
    return {...corner, position: [(x-cx)*scale,0,-(y-cy)*scale] as [number,number,number]}
  })
  return { corners, id: config.course.id, name: config.course.name, location: config.course.name,
    kind: config.course.kind === 'street' ? 'street' : 'permanent', feature: config.course.geometryBasis,
    isSprintWeekend: false, rainProbability: 0, centerline: points.map(([x,y]) => [(x-cx)*scale,0,-(y-cy)*scale]),
    width: 4, lengthKm: config.course.lengthM / 1000, lengthSource: 'official', baseLapTime: 100,
    ...expansionCourseTiming(config.course.id, config.course.points), activeAeroUnavailable: true,
    layoutSource: { detail: 'real', provider: 'fallback', label: config.course.geometryBasis, url: config.course.sourceUrl, year: 2026 } }
}
export function dashboardFrame(config: MotorsportRaceConfig, state: MotorsportRaceState, track: TrackDefinition) {
  const standings = motorsportStandings(state, config)
  const count = track.sectorMarks.length
  const timing = new Map(standings.map(({ entry, car }) => {
    const current = timingDurations(car.timing?.crossings ?? Array(count * 8).fill(null), count)
    const hasCurrent = car.timing?.crossings.some(value => value !== null) ?? false
    const valid = hasCurrent ? !car.timing?.invalid : car.timing?.lastLap?.valid ?? false
    const sectors = hasCurrent ? current.sectors : car.timing?.lastLap?.sectors ?? Array(count).fill(null)
    const minis = hasCurrent ? current.minis : car.timing?.lastLap?.miniSectors ?? Array(count * 8).fill(null)
    const bestSectors = Array.from({ length: count }, (_, i) => bestSectorTime([car.timing?.bestSectors[i], valid ? sectors[i] : null]))
    const bestMinis = Array.from({ length: count * 8 }, (_, i) => bestSectorTime([car.timing?.bestMiniSectors[i], valid ? minis[i] : null]))
    return [entry.id, { current, sectors, minis, valid, bestSectors, bestMinis, lap: hasCurrent ? car.timing?.lap ?? null : car.timing?.lastLap?.lap ?? null }] as const
  }))
  const classBests = new Map([...new Set(config.entries.map(entry => entry.classId))].map(classId => {
    const samples = standings.filter(row => row.entry.classId === classId).map(row => timing.get(row.entry.id)!)
    return [classId, {
      sectors: Array.from({ length: count }, (_, i) => bestSectorTime(samples.map(row => row.bestSectors[i]))),
      minis: Array.from({ length: count * 8 }, (_, i) => bestSectorTime(samples.map(row => row.bestMinis[i]))),
    }] as const
  }))
  const leader = standings[0].car
  const cars = standings.map(({entry, car, overallPosition}) => {
    const driver = entry.drivers[car.driverIndex]
    const classCars = standings.filter(row => row.entry.classId === entry.classId)
    const classIndex = classCars.findIndex(row => row.entry.id === entry.id)
    const classLeader = classCars[0].car
    const interval = (ahead: typeof car) => {
      if (config.sessionKind === 'practice' || config.sessionKind === 'qualifying') return car.bestLapSeconds === null || ahead.bestLapSeconds === null ? '—' : `+${Math.max(0,car.bestLapSeconds-ahead.bestLapSeconds).toFixed(3)}`
      if (car.finishTime !== null && ahead.finishTime !== null) return `+${Math.max(0,car.finishTime+car.penaltySeconds-ahead.finishTime-ahead.penaltySeconds).toFixed(1)}`
      const lapGap = Math.floor(Math.max(0,ahead.distanceM-car.distanceM)/config.course.lengthM)
      return lapGap > 0 ? `+${lapGap}L` : `+${(Math.max(0,ahead.distanceM-car.distanceM)/Math.max(1,car.speedMps)).toFixed(1)}`
    }
    const distance = car.distanceM + (state.phase === 'formation' ? state.formationSeconds * 80 / 3.6 : 0)
    return { ...empty.cars[0], driverId: entry.id, teamId: entry.id, code: driver.name.split(/\s+/).at(-1)!.slice(0,3).toUpperCase(),
      carNumber: Number(entry.number), driverName: driver.name, teamName: entry.team, teamColor: entry.color,
      position: overallPosition, gridPosition: config.entries.indexOf(entry) + 1, lap: car.laps + 1,
      totalDistance: distance / config.course.lengthM, progress: ((distance / config.course.lengthM) % 1 + 1) % 1,
      lateralOffsetM: 0, trackLateralOffset: 0, desiredLateralOffsetM: 0,
      lastLapTimeSeconds: car.lastLapSeconds, bestLapTimeSeconds: car.bestLapSeconds, telemetryHistory: car.telemetryHistory,
      currentLapSectorTimes: timing.get(entry.id)!.current.sectors, currentLapMiniSectorTimes: timing.get(entry.id)!.current.minis, lapHistory: [],
      gapToLeaderLabel: classIndex === 0 ? 'LEADER' : interval(classLeader),
      gapToAheadLabel: classIndex === 0 ? 'LEADER' : interval(classCars[classIndex-1].car),
      status: car.status.startsWith('pit-') ? 'pit' as const : car.status === 'finished' ? 'finished' as const : car.status === 'retired' ? 'retired' as const : 'running' as const,
      speedKph: car.speedMps * 3.6, gear: car.gear, fuelLoadKg: car.fuelKg, racePaceMode: car.paceMode ?? 'standard',
      pitStops: car.pits, pitPhase: 'none' as const, penaltySeconds: car.penaltySeconds,
      finishedAtSeconds: car.finishTime, blueFlag: car.blueFlag, hiddenFromTrack: car.status === 'retired' }
  })
  const flag = state.flag === 'fcy' ? 'vsc' as const : state.flag === 'green' ? 'clear' as const : state.flag
  const snapshot: RaceSnapshot = { ...empty, cars, elapsedSeconds: state.raceSeconds + state.formationSeconds,
    raceClockSeconds: state.raceSeconds, elapsedLabel: String(state.raceSeconds), leaderLap: leader.laps + 1,
    raceLaps: config.format.kind === 'laps' ? config.format.laps : leader.laps + 1,
    sessionStatus: state.phase === 'finished' ? 'finished' : 'racing',
    // Formation movement is supplied by the category engine, never interpolated by the F1 start renderer.
    startProcedure: 'racing', formationBehindSafetyCar: false, flag, flagLabel: state.flag.toUpperCase(),
    sectorFlags: Array(count).fill(flag), eventMessage: state.events.at(-1)?.message ?? '', flagPhase: null,
    weather: config.weather === 'wet' ? 'light-rain' : 'clear', trackGrip: config.weather === 'wet' ? 0.73 : 1,
    lowGripConditions: config.weather === 'wet', raceStartedAtSeconds: state.phase === 'formation' || config.sessionKind === 'practice' || config.sessionKind === 'qualifying' ? null : state.formationSeconds }
  const timingRows: BroadcastTimingRow[] = standings.map(({entry,car,classPosition}, index) => ({
    car: cars[index], displayPosition: index+1, displayGapToLeaderLabel: cars[index].gapToLeaderLabel,
    displayIntervalLabel: cars[index].gapToAheadLabel, driverOverallAbility: entry.drivers[car.driverIndex].overall ?? 0,
    aeroOvertakeLabel: 'N/A', batteryPercent: null, brakePercent: car.brakePercent ?? 0, gear: car.gear,
    lapTimeSeconds: car.lastLapSeconds, lapDataLabel: 'SIM', microSectors: Array.from({length:count}, (_, sector) => Array.from({length:8}, (_, mini) => {
      const item = timing.get(entry.id)!, i = sector * 8 + mini, value = item.minis[i]
      if (car.status.startsWith('pit-')) return mini === 0 || mini === 7 ? 'pit' : 'dim'
      if (value === null) return 'dim'
      if (car.status === 'retired') return 'stopped'
      if (!item.valid) return 'yellow'
      const status = classifySectorTime(value, classBests.get(entry.classId)!.minis[i], item.bestMinis[i])
      return status === 'overall-best' ? 'purple' : status === 'personal-best' ? 'green' : 'yellow'
    })),
    performancePaceDeltaSeconds: null, performanceSource: 'simulation', rpm: car.rpm ?? 0, sectorLapNumber: timing.get(entry.id)!.lap,
    source: 'simulation', sectors: timing.get(entry.id)!.sectors, sectorStatuses: timing.get(entry.id)!.sectors.map((value, i) => timing.get(entry.id)!.valid ? classifySectorTime(value,classBests.get(entry.classId)!.sectors[i],timing.get(entry.id)!.bestSectors[i]) : value === null ? 'pending' : 'slower'), speedKph: car.speedMps*3.6,
    telemetrySource: 'simulation', throttlePercent: car.throttlePercent ?? 0,
    tireDisplay: { kind: 'f1-pirelli', compound: 'M', ageLaps: 0, label: 'SIM' },
    tireModelSource: 'simulation', tireLifePercent: car.tyreLife*100, tirePaceDeltaSeconds: null, tireTemperatureC: car.tyreTemperatureC,
    categoryDisplay: { carNumberLabel: entry.number, classId: entry.classId, classPosition, classLabel: `${entry.classId.toUpperCase()} P${classPosition}`,
      tyreLabel: `${car.tyreSets.at(-1)?.compound ?? 'primary'} / SIM`,
      usedTyres: car.tyreSets.map(set => set.compound[0].toUpperCase()).join('/'),
      energyLabel: entry.machine.hybridCapacityMj.value > 0 ? `${Math.round(car.hybridEnergyMj / entry.machine.hybridCapacityMj.value*100)}%` : '—' }
  }))
  const sceneConfig: RaceConfig = { ...phaseOneConfig, track, weekendStage: config.sessionKind === 'practice' ? 'fp1' : config.sessionKind === 'qualifying' ? 'qualifying' : 'race',
    drivers: cars.map(car => ({ ...phaseOneConfig.drivers[0], id: car.driverId, teamId: car.teamId, code: car.code, name: car.driverName, carNumber: car.carNumber })),
    teams: cars.map(car => ({ ...phaseOneConfig.teams[0], id: car.teamId, name: car.teamName, color: car.teamColor })) }
  return { snapshot, timingRows, sceneConfig }
}
