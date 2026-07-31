import { useMemo } from 'react'
import {
  componentConditionLabels,
  componentConditionState,
  componentDisplayLabels,
  PIT_WALL_NOT_APPLICABLE,
  pitWallObservedSource,
} from '../../domain/pitWall'
import { weakestComponent } from '../../simulation/components'
import {
  PitWallConditionGauge,
  PitWallGroup,
  PitWallMetric,
} from './PitWallShared'
import type { CarComponents } from '../../types'
import type { PitWallTabProps } from './types'

/**
 * Brake condition is not a separately tracked component in this simulator; it
 * is modelled as measured disc temperature plus continuous time spent above
 * the safe range. It is reported that way rather than as an invented percent.
 */
const BRAKE_OVERHEAT_WATCH_SECONDS = 4
const BRAKE_OVERHEAT_CRITICAL_SECONDS = 12

export function PitWallSystems({
  capabilities,
  car,
  openF1Mode,
  telemetryIsOpenF1,
  tireCondition,
}: PitWallTabProps) {
  const telemetrySource = pitWallObservedSource(telemetryIsOpenF1, openF1Mode)
  const componentEntries = useMemo(
    () =>
      (Object.entries(car.components) as Array<
        [keyof CarComponents, CarComponents[keyof CarComponents]]
      >).sort(
        (left, right) =>
          left[1].conditionPercent - right[1].conditionPercent,
      ),
    [car.components],
  )
  const weakest = useMemo(
    () => weakestComponent(car.components),
    [car.components],
  )
  const weakestState = componentConditionState(weakest[1].conditionPercent)
  const brakeTone =
    car.brakeOverheatSeconds >= BRAKE_OVERHEAT_CRITICAL_SECONDS
      ? 'critical'
      : car.brakeOverheatSeconds >= BRAKE_OVERHEAT_WATCH_SECONDS
        ? 'watch'
        : 'good'
  const damagePercent = Math.round(car.damage * 100)

  return (
    <div className="pit-wall-columns">
      <PitWallGroup title="Energy Store">
        {capabilities.hybridErs ? (
          <>
            <PitWallMetric
              label="SOC"
              source="SIM"
              value={`${Math.round(car.ersBatteryPercent)}%`}
            />
            <PitWallMetric
              label="Stored energy"
              source="SIM"
              value={`${car.energyStore.currentEnergyMJ.toFixed(2)} MJ`}
            />
            <PitWallMetric
              label="Deployment"
              source="SIM"
              value={`${Math.round(car.energyStore.actualDeploymentPowerKw)} kW`}
            />
            <PitWallMetric
              label="Recovery"
              source="SIM"
              value={`${Math.round(car.energyStore.actualRecoveryPowerKw)} kW`}
            />
            <PitWallMetric
              label="ERS mode"
              source="SIM"
              value={car.ersMode.toUpperCase()}
            />
            <PitWallMetric
              label="Lap balance"
              source="SIM"
              title="Harvested versus deployed on the current lap"
              value={`${car.energyHarvestedThisLapMj.toFixed(2)} / ${car.energyDeployedThisLapMj.toFixed(2)} MJ`}
            />
          </>
        ) : (
          <PitWallMetric
            label="Hybrid Energy Store"
            source="UNAVAILABLE"
            title="This category runs no hybrid Energy Store, so there is no SOC, deployment, or recovery to report"
            value={PIT_WALL_NOT_APPLICABLE}
          />
        )}
      </PitWallGroup>

      <PitWallGroup title="Overtake systems">
        <PitWallMetric
          label="Active aero"
          source={capabilities.activeAero ? 'SIM' : 'UNAVAILABLE'}
          title={
            capabilities.activeAero
              ? undefined
              : 'This category has no driver-adjustable active aero'
          }
          value={
            capabilities.activeAero
              ? car.activeAeroMode.toUpperCase()
              : PIT_WALL_NOT_APPLICABLE
          }
        />
        <PitWallMetric
          label={capabilities.overtakeStatusLabel}
          source="SIM"
          value={
            capabilities.ots
              ? `${Math.ceil(car.otsRemainingSeconds ?? 0)}s remaining`
              : car.overtakeStatus.toUpperCase()
          }
        />
        <PitWallMetric
          label="Overtake energy"
          source={capabilities.hybridErs ? 'SIM' : 'UNAVAILABLE'}
          value={
            capabilities.hybridErs
              ? `${car.overtakeEnergyRemainingMj.toFixed(2)} MJ`
              : PIT_WALL_NOT_APPLICABLE
          }
        />
        <PitWallMetric
          label="Battle state"
          source="SIM"
          value={car.battlePhase.replace(/-/gu, ' ').toUpperCase()}
        />
      </PitWallGroup>

      <PitWallGroup title="Drive and thermal">
        <PitWallMetric
          label="Speed"
          source={telemetrySource}
          value={`${Math.round(car.speedKph)} km/h`}
        />
        <PitWallMetric
          label="Gear"
          source={telemetrySource}
          value={car.gear > 0 ? String(car.gear) : 'N'}
        />
        <PitWallMetric
          label="RPM"
          source={telemetrySource}
          value={Math.round(car.rpm).toLocaleString('en-GB')}
        />
        <PitWallMetric
          label="Throttle"
          source={telemetrySource}
          value={`${Math.round(car.throttlePercent)}%`}
        />
        <PitWallMetric
          label="Brake"
          source={telemetrySource}
          value={`${Math.round(car.brakePercent)}%`}
        />
        <PitWallMetric
          label="Brake temp"
          source="SIM"
          tone={brakeTone}
          title={`${car.brakeOverheatSeconds.toFixed(1)}s continuously above the safe brake range`}
          value={`${Math.round(car.brakeTemperatureC)}C`}
        />
        <PitWallMetric
          label="Tyre temp"
          source="SIM"
          value={`${Math.round(car.tireTemperatureC)}C ${tireCondition.operatingState.toUpperCase()}`}
        />
        <PitWallMetric
          label="Tyre wear"
          source="SIM"
          tone={
            tireCondition.wearState === 'critical'
              ? 'critical'
              : tireCondition.wearState === 'used'
                ? 'watch'
                : 'good'
          }
          value={`${Math.round(car.tireWearPercent)}% worn`}
        />
      </PitWallGroup>

      <PitWallGroup title="Component condition" wide>
        {componentEntries.map(([key, condition]) => (
          <PitWallConditionGauge
            key={key}
            label={componentDisplayLabels[key]}
            percent={condition.conditionPercent}
          />
        ))}
      </PitWallGroup>

      <PitWallGroup title="Integrity">
        <PitWallMetric
          label="Weakest part"
          source="SIM"
          tone={weakestState}
          value={`${componentDisplayLabels[weakest[0]]} ${Math.round(weakest[1].conditionPercent)}% ${componentConditionLabels[weakestState]}`}
        />
        <PitWallMetric
          label="Car damage"
          source="SIM"
          tone={
            damagePercent >= 40
              ? 'critical'
              : damagePercent > 0
                ? 'watch'
                : 'good'
          }
          value={damagePercent > 0 ? `${damagePercent}%` : 'NONE'}
        />
        <PitWallMetric
          label="Aero components"
          source="UNAVAILABLE"
          title="Bodywork is not tracked as a separately replaceable component; accumulated aerodynamic loss is reported as car damage"
          value={PIT_WALL_NOT_APPLICABLE}
        />
        <PitWallMetric
          label="Warning lights"
          source="SIM"
          tone={car.warningLightsUntilSeconds !== null ? 'critical' : 'good'}
          value={car.warningLightsUntilSeconds !== null ? 'ON' : 'OFF'}
        />
        <PitWallMetric
          label="Stewards"
          source="SIM"
          tone={car.stewardStatus === 'clear' ? 'good' : 'watch'}
          title={car.stewardNote ?? undefined}
          value={car.stewardStatus.toUpperCase()}
        />
        <PitWallMetric
          label="Status"
          source="SIM"
          tone={car.status === 'running' ? 'good' : 'watch'}
          title={car.retiredReason ?? undefined}
          value={car.status.toUpperCase()}
        />
      </PitWallGroup>
    </div>
  )
}
