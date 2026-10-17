import type { ReactNode } from 'react'
import type { BroadcastRaceControlEntry, BroadcastTimingRow } from './BroadcastDashboard'
import type { EnvironmentReadout } from '../domain/environmentReadout'
import { cleanEnvironmentValue } from '../domain/environmentReadout'
import type { RaceSnapshot, TrackDefinition } from '../types'
import { trackSurfaceSectorSummary } from '../simulation/trackSurface'
import type { SeasonState } from '../simulation/season'

export type RaceDataView = 'telemetry' | 'track' | 'tyres' | 'messages' | 'drivers' | 'season'

function DataTable({ headers, rows, label }: {
  headers: string[]; rows: Array<{ id: string; cells: ReactNode[] }>; label: string
}) {
  return <div className="race-data-scroll" tabIndex={0}>
    <table className="race-data-table" aria-label={label}>
      <thead><tr>{headers.map(header => <th key={header} scope="col">{header}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}>{row.cells.map((cell, index) => <td key={index}>{cell}</td>)}</tr>)}</tbody>
    </table>
    {rows.length === 0 && <p className="race-data-empty">No data available for this session.</p>}
  </div>
}

export function BroadcastRaceData({ view, rows, snapshot, track, environment, messages, season, dataMode, onFocusDriver }: {
  view: RaceDataView; rows: BroadcastTimingRow[]; snapshot: RaceSnapshot; track: TrackDefinition
  environment: EnvironmentReadout; messages: BroadcastRaceControlEntry[]; season?: SeasonState
  dataMode: 'SIM' | 'HIST' | 'LIVE'; onFocusDriver: (id: string) => void
}) {
  const driver = (row: BroadcastTimingRow) => <button className="race-data-driver" style={{ color: row.car.teamColor }}
    onClick={() => onFocusDriver(row.car.driverId)} title={`Focus ${row.car.code}`} type="button">#{row.car.carNumber} {row.car.code}</button>
  if (view === 'telemetry') return <DataTable label="All drivers telemetry"
    headers={['DRIVER', 'SPEED km/h', 'THROTTLE', 'BRAKE', 'GEAR', 'RPM', 'ERS / OTS', 'AERO / OVT', 'SOURCE']}
    rows={rows.map(row => {
      const available = row.telemetrySource !== 'unavailable'
      const observed = row.telemetrySource === 'openf1'
      const f1 = row.car.runtimeSystems.kind === 'f1'
      return { id: row.car.driverId, cells: [driver(row), available ? Math.round(row.speedKph) : '--',
        available ? `${row.throttlePercent}%` : '--', available ? `${row.brakePercent}%` : '--',
        available ? row.gear : '--', available ? row.rpm : '--',
        dataMode === 'SIM' && f1 ? `${row.batteryPercent ?? '--'}% SOC` : '--',
        available ? row.aeroOvertakeLabel : '--', observed ? 'OBS' : available ? 'SIM' : 'UNAVAILABLE'] }
    })} />

  if (view === 'drivers') return <DataTable label="All driver information"
    headers={['DRIVER', 'TEAM', 'ABILITY (SIM)', 'GRID', 'POSITION', 'CHANGE', 'PACE MODE (SIM)', 'STATUS']}
    rows={rows.map(row => ({ id: row.car.driverId, cells: [driver(row), row.car.teamName,
      dataMode === 'SIM' ? row.driverOverallAbility : '--', row.car.gridPosition, row.displayPosition,
      row.car.gridPosition - row.displayPosition, dataMode === 'SIM' ? row.car.racePaceMode : '--', row.car.status] }))} />

  if (view === 'tyres') return <DataTable label="All drivers tyre information"
    headers={['DRIVER', 'TYRE / SURFACE', 'AGE (LAPS)', 'LIFE', 'TEMPERATURE', 'STOPS', 'SOURCE']}
    rows={rows.map(row => ({ id: row.car.driverId, cells: [driver(row),
      row.tireDisplay.kind === 'f1-pirelli' ? row.tireDisplay.compound : `${row.tireDisplay.surface.toUpperCase()} CTRL`,
      row.tireDisplay.kind === 'f1-pirelli' ? row.tireDisplay.ageLaps : row.tireDisplay.lapsOnCurrentSet,
      dataMode !== 'SIM' || row.tireLifePercent === null ? '--' : `${row.tireLifePercent}%`,
      dataMode !== 'SIM' || row.tireTemperatureC === null ? '--' : `${row.tireTemperatureC.toFixed(1)} °C`, row.car.pitStops,
      row.tireModelSource === 'unavailable' ? 'UNAVAILABLE' : row.tireModelSource === 'openf1-calibrated' ? 'OBS / CAL' : 'SIM'] }))} />

  if (view === 'messages') return <DataTable label="Race control messages"
    headers={['TIME', 'SOURCE', 'MESSAGE']}
    rows={messages.map(message => ({ id: message.id, cells: [message.timeLabel, message.source, message.message] }))} />

  if (view === 'season') {
    if (!season || dataMode !== 'SIM') return <p className="race-data-empty">Local SIM championship standings are unavailable in this mode.</p>
    const standings = rows.slice().sort((a, b) => {
      const points = (season.driverPoints[b.car.driverId] ?? 0) - (season.driverPoints[a.car.driverId] ?? 0)
      if (points !== 0) return points
      const aResults = season.driverResults[a.car.driverId] ?? []
      const bResults = season.driverResults[b.car.driverId] ?? []
      for (let position = 1; position <= rows.length; position++) {
        const countback = bResults.filter(result => result === position).length - aResults.filter(result => result === position).length
        if (countback !== 0) return countback
      }
      return a.car.code.localeCompare(b.car.code)
    })
    return <div className="race-data-season"><p>Local SIM championship · {season.completedRounds.length} completed rounds · equal records share rank</p>
      <DataTable label="Local championship driver standings" headers={['DRIVER', 'TEAM', 'POINTS', 'RACE RESULTS']}
        rows={standings.map(row => ({ id: row.car.driverId, cells: [driver(row), row.car.teamName,
          season.driverPoints[row.car.driverId] ?? 0, (season.driverResults[row.car.driverId] ?? []).join(' / ') || '--'] }))} />
      <DataTable label="Local championship constructor standings" headers={['TEAM', 'POINTS']}
        rows={[...new Map(rows.map(row => [row.car.teamId, row.car.teamName])).entries()]
          .sort(([a], [b]) => (season.teamPoints[b] ?? 0) - (season.teamPoints[a] ?? 0))
          .map(([id, name]) => ({ id, cells: [name, season.teamPoints[id] ?? 0] }))} />
    </div>
  }

  const water = trackSurfaceSectorSummary(snapshot.trackSurface).surfaceWaterMmBySector
  const simulated = dataMode === 'SIM'
  const fields: Array<[string, ReactNode, string]> = [
    ['Circuit', track.name, track.layoutSource?.provider ?? 'UNAVAILABLE'],
    ['Length', `${track.lengthKm.toFixed(3)} km`, track.lengthSource ?? 'UNAVAILABLE'],
    ['Corners', track.corners?.length ?? '--', track.layoutSource?.provider ?? 'UNAVAILABLE'],
    ['Sector boundaries', track.sectorMarks.slice(1).map(mark => `${(mark * 100).toFixed(1)}%`).join(' / '), track.sectorMarksSource ?? 'UNAVAILABLE'],
    ['Pit speed limit', track.pitLane ? `${track.pitLane.speedLimitKph} km/h` : '--', track.pitLane?.speedLimitSource ?? 'UNAVAILABLE'],
    ['Air temperature', cleanEnvironmentValue(environment.airLabel), environment.source],
    ['Track temperature', cleanEnvironmentValue(environment.trackLabel), environment.source],
    ['Rainfall', cleanEnvironmentValue(environment.rainLabel), environment.source],
    ['Humidity', cleanEnvironmentValue(environment.humidityLabel), environment.source],
    ['Wind', cleanEnvironmentValue(environment.windLabel), environment.source],
    ['Pressure', cleanEnvironmentValue(environment.pressureLabel), environment.source],
    ['Track grip', simulated ? `${Math.round(snapshot.trackGrip * 100)}%` : '--', simulated ? 'SIM' : 'UNAVAILABLE'],
    ['Surface water', simulated ? `${(water.reduce((a, b) => a + b, 0) / Math.max(1, water.length)).toFixed(2)} mm` : '--', simulated ? 'SIM' : 'UNAVAILABLE'],
    ['Forecast', simulated ? snapshot.weatherForecastLabel : '--', simulated ? 'SIM' : 'UNAVAILABLE'],
  ]
  return <DataTable label="Track and weather information" headers={['ITEM', 'VALUE', 'SOURCE']}
    rows={fields.map(([id, value, source]) => ({ id, cells: [id, value, source] }))} />
}
