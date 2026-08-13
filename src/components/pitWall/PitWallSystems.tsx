import { useMemo } from 'react'
import {
  componentConditionLabels,
  componentConditionState,
  componentDisplayLabels,
  PIT_WALL_NOT_APPLICABLE,
  PIT_WALL_UNAVAILABLE,
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
  car,
  openF1Mode,
  telemetryIsOpenF1,
  tireCondition,
}: PitWallTabProps) {
  const f1Runtime =
    car.runtimeSystems.kind === 'f1' ? car.runtimeSystems : null
  const superFormulaRuntime =
    car.runtimeSystems.kind === 'super-formula'
      ? car.runtimeSystems
      : null
  const telemetrySource = f1Runtime
    ? pitWallObservedSource(telemetryIsOpenF1, openF1Mode)
    : 'SIM'
  const componentEntries = useMemo(
    () =>
      f1Runtime
        ? (Object.entries(f1Runtime.components) as Array<
            [keyof CarComponents, CarComponents[keyof CarComponents]]
          >).sort(
            (left, right) =>
              left[1].conditionPercent - right[1].conditionPercent,
          )
        : [],
    [f1Runtime],
  )
  const weakest = useMemo(
    () => (f1Runtime ? weakestComponent(f1Runtime.components) : null),
    [f1Runtime],
  )
  const weakestState = weakest
    ? componentConditionState(weakest[1].conditionPercent)
    : null
  const brakeTone =
    car.brakeOverheatSeconds >= BRAKE_OVERHEAT_CRITICAL_SECONDS
      ? 'critical'
      : car.brakeOverheatSeconds >= BRAKE_OVERHEAT_WATCH_SECONDS
        ? 'watch'
        : 'good'
  const damagePercent = Math.round(car.damage * 100)

  return (
    <div className="pit-wall-columns">
      {f1Runtime ? (
        <>
          <PitWallGroup title="Energy Store">
            <PitWallMetric
              label="SOC"
              source="SIM"
              value={`${Math.round(f1Runtime.ersBatteryPercent)}%`}
            />
            <PitWallMetric
              label="Stored energy"
              source="SIM"
              value={`${f1Runtime.energyStore.currentEnergyMJ.toFixed(2)} MJ`}
            />
            <PitWallMetric
              label="Deployment"
              source="SIM"
              value={`${Math.round(f1Runtime.energyStore.actualDeploymentPowerKw)} kW`}
            />
            <PitWallMetric
              label="Recovery"
              source="SIM"
              value={`${Math.round(f1Runtime.energyStore.actualRecoveryPowerKw)} kW`}
            />
            <PitWallMetric
              label="ERS mode"
              source="SIM"
              value={f1Runtime.ersMode.toUpperCase()}
            />
            <PitWallMetric
              label="Lap balance"
              source="SIM"
              title="Harvested versus deployed on the current lap"
              value={`${f1Runtime.energyHarvestedThisLapMj.toFixed(2)} / ${f1Runtime.energyDeployedThisLapMj.toFixed(2)} MJ`}
            />
          </PitWallGroup>

          <PitWallGroup title="Overtake systems">
            <PitWallMetric
              label="Active aero"
              source="SIM"
              value={f1Runtime.activeAeroMode.toUpperCase()}
            />
            <PitWallMetric
              label="Overtake"
              source="SIM"
              value={car.overtakeStatus.toUpperCase()}
            />
            <PitWallMetric
              label="Overtake energy"
              source="SIM"
              value={`${f1Runtime.overtakeEnergyRemainingMj.toFixed(2)} MJ`}
            />
            <PitWallMetric
              label="Battle state"
              source="SIM"
              value={car.battlePhase.replace(/-/gu, ' ').toUpperCase()}
            />
          </PitWallGroup>
        </>
      ) : superFormulaRuntime ? (
        <PitWallGroup title="SUPER FORMULA systems">
          <PitWallMetric
            label="Engine allocation"
            source="JAF"
            value={`${superFormulaRuntime.engineLedger.engine.used}/${superFormulaRuntime.engineLedger.engine.maximumPerEntrantPerSeason} per entrant`}
          />
          <PitWallMetric
            label="Gearbox model"
            source="UNAVAILABLE"
            title={superFormulaRuntime.gearbox.reason}
            value={PIT_WALL_UNAVAILABLE}
          />
          <PitWallMetric
            label="OTS"
            source={
              superFormulaRuntime.ots.availability === 'verified-event-rule'
                ? 'EVENT'
                : 'UNAVAILABLE'
            }
            title={
              superFormulaRuntime.ots.availability === 'verified-event-rule'
                ? `${superFormulaRuntime.ots.activationConditions}; runtime condition evaluation pending`
                : superFormulaRuntime.ots.reason
            }
            value={
              superFormulaRuntime.ots.availability === 'verified-event-rule'
                ? `CONFIGURED / ${superFormulaRuntime.ots.allocationSeconds}s`
                : PIT_WALL_UNAVAILABLE
            }
          />
          <PitWallMetric
            label="Refuelling"
            source="JAF"
            title={
              superFormulaRuntime.refuelling.permittedByRegulation
                ? `Safety gate: ${superFormulaRuntime.refuelling.safetyGate.status}`
                : superFormulaRuntime.refuelling.reason
            }
            value={
              superFormulaRuntime.refuelling.permittedByRegulation
                ? superFormulaRuntime.refuelling.safetyGate.status.toUpperCase()
                : PIT_WALL_UNAVAILABLE
            }
          />
          <PitWallMetric
            label="Fuel flow / service time"
            source="UNAVAILABLE"
            title="No verified fuel-transfer rate or timed service input is available"
            value={PIT_WALL_UNAVAILABLE}
          />
          <PitWallMetric
            label="Control tyres"
            source="JAF"
            title="Published dry/wet set maxima; no verified physical coefficients or subdivision"
            value={`D ${superFormulaRuntime.controlTires.sets.dry.remainingSets}/${superFormulaRuntime.controlTires.sets.dry.allocatedSets} · W ${superFormulaRuntime.controlTires.sets.wet.remainingSets}/${superFormulaRuntime.controlTires.sets.wet.allocatedSets}`}
          />
        </PitWallGroup>
      ) : null}

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
        {f1Runtime && tireCondition ? (
          <>
            <PitWallMetric
              label="Tyre temp"
              source="SIM"
              value={`${Math.round(f1Runtime.tires.tireTemperatureC)}C ${tireCondition.operatingState.toUpperCase()}`}
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
              value={`${Math.round(f1Runtime.tires.tireWearPercent)}% worn`}
            />
          </>
        ) : superFormulaRuntime ? (
          <>
            <PitWallMetric
              label="Fitted control tyre"
              source="SIM"
              title={superFormulaRuntime.liveTires.fitment.selectionProvenance.rationale}
              value={`${superFormulaRuntime.liveTires.activeSurface.toUpperCase()} / ${superFormulaRuntime.liveTires.lapsOnCurrentSet} laps`}
            />
            <PitWallMetric
              label="Physical tyre model"
              source="UNAVAILABLE"
              title="No verified control-tyre physical coefficients are available"
              value={PIT_WALL_UNAVAILABLE}
            />
            <PitWallMetric
              label="Dry / wet sets"
              source="JAF"
              value={`${superFormulaRuntime.controlTires.sets.dry.remainingSets}/${superFormulaRuntime.controlTires.sets.dry.allocatedSets} / ${superFormulaRuntime.controlTires.sets.wet.remainingSets}/${superFormulaRuntime.controlTires.sets.wet.allocatedSets}`}
            />
          </>
        ) : null}
      </PitWallGroup>

      {f1Runtime ? (
        <PitWallGroup title="Component condition" wide>
          {componentEntries.map(([key, condition]) => (
            <PitWallConditionGauge
              key={key}
              label={componentDisplayLabels[key]}
              percent={condition.conditionPercent}
            />
          ))}
        </PitWallGroup>
      ) : null}

      <PitWallGroup title="Integrity">
        {f1Runtime && weakest && weakestState ? (
          <PitWallMetric
            label="Weakest part"
            source="SIM"
            tone={weakestState}
            value={`${componentDisplayLabels[weakest[0]]} ${Math.round(weakest[1].conditionPercent)}% ${componentConditionLabels[weakestState]}`}
          />
        ) : superFormulaRuntime ? (
          <PitWallMetric
            label="Engine state"
            source="JAF"
            value={`${superFormulaRuntime.engineLedger.engine.used}/${superFormulaRuntime.engineLedger.engine.maximumPerEntrantPerSeason} declared`}
          />
        ) : null}
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
        {f1Runtime ? (
          <PitWallMetric
            label="Aero components"
            source="UNAVAILABLE"
            title="Bodywork is not tracked as a separately replaceable component; accumulated aerodynamic loss is reported as car damage"
            value={PIT_WALL_NOT_APPLICABLE}
          />
        ) : null}
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
