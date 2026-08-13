import { useMemo } from 'react'
import {
  pitWallLapLog,
  pitWallObservedSource,
} from '../../domain/pitWall'
import {
  formatLapTime,
  formatSectorTime,
  UNMEASURED_SECTOR_TIME,
} from '../../domain/timingFormat'
import { PitWallSourceTag } from './PitWallShared'
import type { PitWallTabProps } from './types'

/**
 * Every completed lap for the selected car with its three measured splits.
 *
 * The car's own fastest lap and fastest split are marked so an engineer can
 * see where the time is going without comparing rows by eye. A deleted lap is
 * struck through and keeps its reason, and it can never hold a personal best.
 */
export function PitWallLapLog({
  car,
  openF1Mode,
  session,
  timingIsOpenF1,
}: PitWallTabProps) {
  const f1Runtime =
    car.runtimeSystems.kind === 'f1' ? car.runtimeSystems : null
  const timingSource = f1Runtime
    ? pitWallObservedSource(timingIsOpenF1, openF1Mode)
    : 'SIM'
  const rows = useMemo(() => pitWallLapLog(car.lapHistory), [car.lapHistory])

  if (rows.length === 0) {
    return (
      <p className="pit-wall-empty">
        {car.code} has not completed a timed lap in this{' '}
        {session.label.toLowerCase()} session yet. Rows appear as the car
        crosses the timing line.
      </p>
    )
  }

  return (
    <div className="pit-wall-lap-log">
      <div className="pit-wall-lap-log-summary">
        <span>
          {rows.length} completed lap{rows.length === 1 ? '' : 's'} · newest
          first
        </span>
        <PitWallSourceTag source={timingSource} />
      </div>
      <div className="pit-wall-lap-log-scroll">
        <table>
          <caption className="sr-only">
            Completed laps for {car.code} with sector times
          </caption>
          <thead>
            <tr>
              <th scope="col">Lap</th>
              <th scope="col">Time</th>
              <th scope="col">S1</th>
              <th scope="col">S2</th>
              <th scope="col">S3</th>
              <th scope="col">{f1Runtime ? 'Tyre' : 'Control tyre'}</th>
              <th scope="col">Pos</th>
              <th scope="col">Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                className={row.isValid ? undefined : 'is-deleted'}
                key={`${row.lap}-${row.segment ?? 'race'}`}
              >
                <th scope="row">{row.lap}</th>
                <td
                  className={
                    row.isPersonalBestLap ? 'is-personal-best' : undefined
                  }
                >
                  {formatLapTime(row.lapTimeSeconds)}
                </td>
                {row.sectors.map((split, index) => (
                  <td
                    className={
                      row.isPersonalBestSector[index]
                        ? 'is-personal-best'
                        : undefined
                    }
                    key={`s${index}`}
                  >
                    {split > 0
                      ? formatSectorTime(split)
                      : UNMEASURED_SECTOR_TIME}
                  </td>
                ))}
                {row.tireDisplay.kind === 'f1-pirelli' ? (
                  <td
                    title={`${row.tireDisplay.ageLaps} laps on this set at the line`}
                  >
                    {row.tireDisplay.compound}
                    <small>{row.tireDisplay.ageLaps}</small>
                  </td>
                ) : (
                  <td
                    title={`SUPER FORMULA ${row.tireDisplay.surface} control tyre; physical model unavailable`}
                  >
                    {row.tireDisplay.surface.toUpperCase()} CTRL
                    <small>{row.tireDisplay.lapsOnCurrentSet} laps / MODEL --</small>
                    <PitWallSourceTag source="UNAVAILABLE" />
                  </td>
                )}
                <td>P{row.position}</td>
                <td className="pit-wall-lap-log-note">
                  {[
                    row.segment,
                    row.pitStop ? 'PIT' : null,
                    row.isValid ? null : (row.invalidReason ?? 'DELETED'),
                  ]
                    .filter(Boolean)
                    .join(' · ') || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
