import { useRef } from 'react'
import { recordTelemetry } from '../restored20261010/simulation/telemetryHistory'
import type { TelemetryTrace } from '../restored20261010/components/TelemetryComparison'
import { profileDistanceKmBetween } from '../simulation/trackDynamics'
import type { RaceSnapshot, TrackDefinition } from '../types'
import type { BroadcastTimingRow } from '../components/BroadcastDashboard'

export function useTelemetryTraces({ snapshot, rows, track, dataMode }: {
  snapshot: RaceSnapshot; rows: BroadcastTimingRow[]; track: TrackDefinition; dataMode: 'SIM' | 'HIST' | 'LIVE'
}) {
  const history = useRef<{ key: string; seconds: number; traces: TelemetryTrace[] }>({ key: '', seconds: -1, traces: [] })
  const key = `${track.id}:${rows.map(row => row.car.driverId).sort().join(',')}:${dataMode}`
  if (history.current.key !== key || snapshot.elapsedSeconds < history.current.seconds) {
    history.current = { key, seconds: -1, traces: [] }
  }
  if (dataMode === 'SIM' && snapshot.elapsedSeconds > history.current.seconds) {
    const previous = new Map(history.current.traces.map(trace => [trace.id, trace]))
    history.current = { key, seconds: snapshot.elapsedSeconds, traces: rows.map(row => {
      const car = row.car
      const samples = previous.get(car.driverId)?.samples ?? []
      const f1 = car.runtimeSystems.kind === 'f1' ? car.runtimeSystems : null
      const physics = car.physicsTelemetry
      return { id: car.driverId, name: `#${car.carNumber} ${car.driverName}`, color: car.teamColor,
        samples: snapshot.startProcedure === 'formation' || car.status !== 'running' || car.pitPhase !== 'none' ? samples : recordTelemetry(samples, {
          lap: Math.floor(car.totalDistance), progress: profileDistanceKmBetween(track, 0, car.progress) / track.lengthKm,
          seconds: snapshot.elapsedSeconds, speedKph: car.speedKph, throttlePercent: car.throttlePercent,
          brakePercent: car.brakePercent, gear: car.gear, rpm: car.rpm, fuelKg: car.fuelLoadKg,
          ...(physics ? { longitudinalG: physics.accelerationMps2 / 9.80665,
            lateralG: physics.lateralTyreDemandN / Math.max(1, physics.massKg) / 9.80665 } : {}),
          ...(f1 ? { energyPercent: row.batteryPercent ?? undefined, deploymentKw: f1.energyStore.actualDeploymentPowerKw,
            recoveryKw: f1.energyStore.actualRecoveryPowerKw, tyreLifePercent: row.tireLifePercent ?? undefined } : {}),
        }) }
    }) }
  }
  return history.current.traces
}
