import { cleanEnvironmentValue } from '../../domain/environmentReadout'
import { PitWallGroup, PitWallMetric } from './PitWallShared'
import type { PitWallSource } from '../../domain/pitWall'
import type { SectorFlagState } from '../../types'
import type { PitWallTabProps } from './types'

const sectorFlagLabels: Record<SectorFlagState, string> = {
  clear: 'CLEAR',
  'double-yellow': 'DOUBLE YELLOW',
  red: 'RED',
  sc: 'SC',
  vsc: 'VSC',
  yellow: 'YELLOW',
}

export function PitWallWeather({
  environment,
  snapshot,
  track,
}: PitWallTabProps) {
  // The weather strip is either an OpenF1 sample or the seeded simulation
  // model; it is never a mixture, so one chip describes the whole group.
  const environmentSource: PitWallSource =
    environment.source === 'simulation' ? 'SIM' : 'OBS'
  const neutralised = snapshot.flag === 'sc' || snapshot.flag === 'vsc'
  const f1WeatherDeclarationsUnavailable = snapshot.heatIndexC === null
  const heatIndexLabel = snapshot.heatIndexC?.toFixed(1) ?? 'unavailable'

  return (
    <div className="pit-wall-columns">
      <PitWallGroup title="Atmosphere">
        <PitWallMetric
          label="Air temp"
          source={environmentSource}
          value={cleanEnvironmentValue(environment.airLabel)}
        />
        <PitWallMetric
          label="Track temp"
          source={environmentSource}
          value={cleanEnvironmentValue(environment.trackLabel)}
        />
        <PitWallMetric
          label="Humidity"
          source={environmentSource}
          value={cleanEnvironmentValue(environment.humidityLabel)}
        />
        <PitWallMetric
          label="Pressure"
          source={environmentSource}
          value={cleanEnvironmentValue(environment.pressureLabel)}
        />
        <PitWallMetric
          label="Wind"
          source={environmentSource}
          value={cleanEnvironmentValue(environment.windLabel)}
        />
        <PitWallMetric
          label="Rainfall"
          source={environmentSource}
          value={cleanEnvironmentValue(environment.rainLabel)}
        />
      </PitWallGroup>

      <PitWallGroup title="Surface">
        <PitWallMetric
          label="Weather"
          source="SIM"
          value={snapshot.weatherLabel}
        />
        <PitWallMetric
          label="Forecast"
          source="SIM"
          value={snapshot.weatherForecastLabel}
        />
        <PitWallMetric
          label="Track grip"
          source="SIM"
          value={`${Math.round(snapshot.trackGrip * 100)}%`}
        />
        <PitWallMetric
          label="Low grip declared"
          source="SIM"
          title={
            f1WeatherDeclarationsUnavailable
              ? 'FIA B1.5.12 declaration model is unavailable for this category.'
              : 'Simulated Race Director declaration modelled on Sporting Regulations B1.5.12'
          }
          tone={snapshot.lowGripConditions ? 'watch' : 'good'}
          value={
            f1WeatherDeclarationsUnavailable
              ? 'UNAVAILABLE'
              : snapshot.lowGripConditions
                ? 'DECLARED'
                : 'NO'
          }
        />
        <PitWallMetric
          label="Heat hazard"
          source="SIM"
          title={
            f1WeatherDeclarationsUnavailable
              ? 'FIA B1.5.10 declaration and C4.6 mass model are unavailable for this category.'
              : `Simulated declaration modelled on Sporting Regulations B1.5.10; heat index ${heatIndexLabel}C`
          }
          tone={snapshot.heatHazardDeclared ? 'watch' : 'good'}
          value={
            f1WeatherDeclarationsUnavailable
              ? 'UNAVAILABLE'
              : snapshot.heatHazardDeclared
                ? 'DECLARED'
                : 'NO'
          }
        />
        <PitWallMetric
          label="Rain hazard"
          source="SIM"
          title={
            f1WeatherDeclarationsUnavailable
              ? 'FIA B1.5.11 declaration model is unavailable for this category.'
              : 'Simulated declaration modelled on Sporting Regulations B1.5.11'
          }
          tone={snapshot.rainHazardDeclared ? 'watch' : 'good'}
          value={
            f1WeatherDeclarationsUnavailable
              ? 'UNAVAILABLE'
              : snapshot.rainHazardDeclared
                ? 'DECLARED'
                : 'NO'
          }
        />
      </PitWallGroup>

      <PitWallGroup title="Sector surface">
        {[0, 1, 2].map((index) => (
          <PitWallMetric
            key={`water-${index}`}
            label={`S${index + 1} standing water`}
            source="SIM"
            value={`${snapshot.surfaceWaterMmBySector[index].toFixed(2)} mm`}
          />
        ))}
        {[0, 1, 2].map((index) => (
          <PitWallMetric
            key={`drying-${index}`}
            label={`S${index + 1} dry line`}
            source="SIM"
            title="Drying-line maturity from 0 (fully wet) to 100 (dry racing line)"
            value={`${Math.round(snapshot.dryingLineBySector[index] * 100)}%`}
          />
        ))}
      </PitWallGroup>

      <PitWallGroup title="Race control state">
        {[0, 1, 2].map((index) => {
          const flag = snapshot.sectorFlags[index]

          return (
            <PitWallMetric
              key={`flag-${index}`}
              label={`Sector ${index + 1} flag`}
              source="SIM"
              tone={flag === 'clear' ? 'good' : 'watch'}
              value={sectorFlagLabels[flag]}
            />
          )
        })}
        <PitWallMetric
          label="Safety Car"
          source="SIM"
          tone={snapshot.flag === 'sc' ? 'critical' : 'good'}
          value={snapshot.flag === 'sc' ? 'DEPLOYED' : 'NO'}
        />
        <PitWallMetric
          label="Virtual SC"
          source="SIM"
          tone={snapshot.flag === 'vsc' ? 'critical' : 'good'}
          value={snapshot.flag === 'vsc' ? 'DEPLOYED' : 'NO'}
        />
        <PitWallMetric
          label="Red flag"
          source="SIM"
          tone={snapshot.flag === 'red' ? 'critical' : 'good'}
          value={snapshot.flag === 'red' ? 'SHOWN' : 'NO'}
        />
        <PitWallMetric
          label="Pit entry"
          source="SIM"
          tone={snapshot.pitLaneOpen ? 'good' : 'critical'}
          value={snapshot.pitLaneOpen ? 'OPEN' : 'CLOSED'}
        />
        <PitWallMetric
          label="Pit exit"
          source="SIM"
          tone={snapshot.pitExitOpen ? 'good' : 'critical'}
          value={snapshot.pitExitOpen ? 'OPEN' : 'HELD'}
        />
        <PitWallMetric
          label="Control phase"
          source="SIM"
          tone={neutralised || snapshot.flag === 'red' ? 'watch' : 'good'}
          value={snapshot.flagLabel}
        />
      </PitWallGroup>

      <PitWallGroup title="Circuit">
        <PitWallMetric
          label="Layout"
          source={
            track.layoutSource?.provider === 'official'
              ? 'OFF'
              : track.layoutSource?.provider === 'openf1' ||
                  track.layoutSource?.provider === 'openstreetmap'
                ? 'OBS'
                : 'SIM'
          }
          value={`${track.lengthKm.toFixed(3)} km`}
        />
        <PitWallMetric
          label="Track evolution"
          source="SIM"
          value={`${Math.round(snapshot.trackEvolutionLevel * 100)}%`}
        />
        {[0, 1, 2].map((index) => (
          <PitWallMetric
            key={`rubber-${index}`}
            label={`S${index + 1} rubber`}
            source="SIM"
            value={`${Math.round(snapshot.rubberLevelBySector[index] * 100)}%`}
          />
        ))}
      </PitWallGroup>
    </div>
  )
}
