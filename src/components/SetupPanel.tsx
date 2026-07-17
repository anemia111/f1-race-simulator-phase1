import { Dices, RotateCcw, Wrench, X } from 'lucide-react'
import type {
  KnockoutQualifying,
  PracticeSessionResult,
  QualifyingResult,
} from '../simulation/qualifying'
import type { PracticeSetupSummary } from '../simulation/practiceSetup'
import { MAX_SIMULATION_SEED_LENGTH } from '../simulation/random'
import {
  compactSessionDurationLabel,
  isPracticeStage,
} from '../simulation/sessionRules'
import type { WeekendTirePlan } from '../simulation/weekendTires'
import {
  componentAllocationSource,
  normalizeCarComponents,
} from '../simulation/components'
import {
  DRIVER_ABILITY_GROUPS,
  DRIVER_ABILITY_INTERNAL_MAX,
  DRIVER_ABILITY_SCALE_MAX,
  driverAbilityGroupValue,
  driverAbilityPoints,
  driverConfiguredOverallAbilityPoints,
  driverOverallAbilityPoints,
} from '../simulation/driverAbility'
import type {
  CarComponents,
  Driver,
  CarSetup,
  DriverTunableStat,
  GridSource,
  MachineTunableStat,
  Team,
  TrackDefinition,
  WeekendStage,
  WeekendContext,
} from '../types'

type TeamStat = MachineTunableStat | 'pitCrewSpeed'
type DriverStat = DriverTunableStat

type SetupPanelProps = {
  drivers: Driver[]
  isOpen: boolean
  onApplyTeamPreset: (preset: 'top' | 'mid' | 'back') => void
  onDriverChange: (driverId: string) => void
  onDriverStatChange: (driverId: string, stat: DriverStat, value: number) => void
  onCarSetupChange: (
    driverId: string,
    key: keyof CarSetup,
    value: number,
  ) => void
  onComponentReplace: (
    driverId: string,
    key: keyof CarComponents,
  ) => void
  onPitLaneStartChange: (driverId: string, enabled: boolean) => void
  componentReplacementDisabled: boolean
  onGridSourceChange: (source: GridSource) => void
  openF1GridAvailable: boolean
  openF1GridStatus: string
  onRandomSeed: () => void
  onResetGrid: () => void
  onSeedChange: (seed: string) => void
  onTeamChange: (teamId: string) => void
  onTeamStatChange: (teamId: string, stat: TeamStat, value: number) => void
  onToggle: () => void
  onTrackChange: (trackId: string) => void
  seed: string
  selectedDriverId: string
  selectedTeamId: string
  selectedTrackId: string
  gridSource: GridSource
  knockoutQualifying: KnockoutQualifying
  practiceResults: PracticeSessionResult[]
  practiceSetup: PracticeSetupSummary
  qualifyingResults: QualifyingResult[]
  selectedWeekendStage: WeekendStage
  teams: Team[]
  weekendTirePlan: WeekendTirePlan
  weekendContext: WeekendContext
  tracks: TrackDefinition[]
}

const teamStats: Array<{ key: TeamStat; label: string }> = [
  { key: 'qualifyingPace', label: 'Qualifying pace' },
  { key: 'racePace', label: 'Race pace' },
  { key: 'lowSpeedCornerPerformance', label: 'Low-speed corner' },
  { key: 'mediumSpeedCornerPerformance', label: 'Mid-speed corner' },
  { key: 'highSpeedCornerPerformance', label: 'High-speed corner' },
  { key: 'mechanicalGrip', label: 'Mechanical grip' },
  { key: 'traction', label: 'Traction' },
  { key: 'brakingStability', label: 'Brake stability' },
  { key: 'brakingPerformance', label: 'Braking force' },
  { key: 'aerodynamicEfficiency', label: 'Aero efficiency' },
  { key: 'downforceGeneration', label: 'Downforce' },
  { key: 'dragEfficiency', label: 'Drag efficiency' },
  { key: 'straightLineEfficiency', label: 'Straight efficiency' },
  { key: 'activeAeroEfficiency', label: 'Active aero' },
  { key: 'towSensitivity', label: 'Tow response' },
  { key: 'dirtyAirTolerance', label: 'Dirty-air tolerance' },
  { key: 'tireWarmup', label: 'Tire warmup' },
  { key: 'tireDegManagement', label: 'Tire degradation' },
  { key: 'frontTireManagement', label: 'Front tire load' },
  { key: 'rearTireManagement', label: 'Rear tire load' },
  { key: 'wetPerformance', label: 'Wet performance' },
  { key: 'intermediatePerformance', label: 'Intermediate perf.' },
  { key: 'kerbHandling', label: 'Kerb handling' },
  { key: 'rideCompliance', label: 'Ride compliance' },
  { key: 'bumpTolerance', label: 'Bump tolerance' },
  { key: 'coolingEfficiency', label: 'Cooling' },
  { key: 'brakeCooling', label: 'Brake cooling' },
  { key: 'puOutput', label: 'PU output' },
  { key: 'electricalDeploymentEfficiency', label: 'ERS deployment' },
  { key: 'energyRecoveryEfficiency', label: 'Energy recovery' },
  { key: 'fuelEfficiency', label: 'Fuel efficiency' },
  { key: 'reliability', label: 'Reliability' },
  { key: 'pitCrewSpeed', label: 'Pit crew' },
]

function teamStatValue(team: Team, stat: TeamStat) {
  return stat === 'pitCrewSpeed' ? team.pitCrewSpeed : team.machine[stat]
}

const componentRows: Array<{ key: keyof CarComponents; label: string }> = [
  { key: 'ice', label: 'ICE' },
  { key: 'turbo', label: 'Turbo' },
  { key: 'exhaust', label: 'Exhaust' },
  { key: 'energyStore', label: 'Energy store' },
  { key: 'controlElectronics', label: 'Control electronics' },
  { key: 'mguK', label: 'MGU-K' },
  { key: 'gearbox', label: 'Gearbox (SIM)' },
]

function SliderRow({
  label,
  max = 1,
  onChange,
  value,
}: {
  label: string
  max?: number
  onChange: (value: number) => void
  value: number
}) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input
        max={max}
        min="0.55"
        onChange={(event) => onChange(Number(event.target.value))}
        step="0.01"
        type="range"
        value={value}
      />
      <strong>{driverAbilityPoints(value)}</strong>
    </label>
  )
}

function EngineeringSlider({
  disabled,
  label,
  max,
  min,
  onChange,
  step,
  suffix = '',
  value,
}: {
  disabled: boolean
  label: string
  max: number
  min: number
  onChange: (value: number) => void
  step: number
  suffix?: string
  value: number
}) {
  return (
    <label className="slider-row">
      <span>{label}</span>
      <input
        disabled={disabled}
        max={max}
        min={min}
        onChange={(event) => onChange(Number(event.target.value))}
        step={step}
        type="range"
        value={value}
      />
      <strong>{value.toFixed(step < 1 ? 1 : 0)}{suffix}</strong>
    </label>
  )
}

function formatTime(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = (seconds - minutes * 60).toFixed(3).padStart(6, '0')

  return `${minutes}:${remaining}`
}

function formatClock(seconds: number) {
  const minutes = Math.floor(seconds / 60)
  const remaining = Math.floor(seconds % 60)

  return `${minutes}:${remaining.toString().padStart(2, '0')}`
}

export function SetupPanel({
  drivers,
  isOpen,
  onApplyTeamPreset,
  onDriverChange,
  onDriverStatChange,
  onCarSetupChange,
  onComponentReplace,
  onPitLaneStartChange,
  componentReplacementDisabled,
  onGridSourceChange,
  openF1GridAvailable,
  openF1GridStatus,
  onRandomSeed,
  onResetGrid,
  onSeedChange,
  onTeamChange,
  onTeamStatChange,
  onToggle,
  onTrackChange,
  seed,
  selectedDriverId,
  selectedTeamId,
  selectedTrackId,
  gridSource,
  knockoutQualifying,
  practiceResults,
  practiceSetup,
  qualifyingResults,
  selectedWeekendStage,
  teams,
  weekendTirePlan,
  weekendContext,
  tracks,
}: SetupPanelProps) {
  const selectedTeam = teams.find((team) => team.id === selectedTeamId) ?? teams[0]
  const selectedDriver =
    drivers.find((driver) => driver.id === selectedDriverId) ?? drivers[0]
  const selectedTrack =
    tracks.find((track) => track.id === selectedTrackId) ?? tracks[0]
  const selectedCarSetup = weekendContext.setupByDriver[selectedDriver.id]
  const selectedComponents = normalizeCarComponents(
    weekendContext.componentConditionByDriver[selectedDriver.id],
  )
  const parcFermeLocked =
    weekendContext.parcFermeLockedByDriver[selectedDriver.id] ?? false

  if (!isOpen) {
    return null
  }

  return (
    <section className="hud setup-panel" aria-label="race setup">
      <div className="setup-header">
        <div>
          <span>Weekend engineering</span>
          <strong>{teams.length} teams / {drivers.length} cars</strong>
        </div>
        <button
          aria-label="close setup"
          className="plain-icon-button"
          onClick={onToggle}
          title="Close setup"
          type="button"
        >
          <X aria-hidden="true" size={18} />
        </button>
      </div>

      <label className="field-block">
        <span>Track</span>
        <select
          onChange={(event) => onTrackChange(event.target.value)}
          value={selectedTrackId}
        >
          {tracks.map((track) => (
            <option key={track.id} value={track.id}>
              {track.calendar2026?.championshipRound
                ? `R${track.calendar2026.championshipRound} `
                : ''}
              {track.name}
              {track.calendar2026?.status === 'cancelled' ? ' (cancelled)' : ''}
            </option>
          ))}
        </select>
        <small>{selectedTrack.feature}</small>
      </label>

      <div className="seed-row">
        <label className="field-block">
          <span>Seed</span>
          <input
            maxLength={MAX_SIMULATION_SEED_LENGTH}
            onChange={(event) => onSeedChange(event.target.value)}
            placeholder="simulation seed"
            type="text"
            value={seed}
          />
        </label>
        <button
          className="plain-icon-button seed-button-action"
          onClick={onRandomSeed}
          title="Generate seed"
          type="button"
        >
          <Dices aria-hidden="true" size={18} />
        </button>
      </div>

      <div className="setup-section">
        <div className="section-title">
          <span>Team tune</span>
          <button onClick={onResetGrid} type="button">
            <RotateCcw aria-hidden="true" size={14} />
            Reset grid
          </button>
        </div>
        <label className="field-block">
          <span>Grid source</span>
          <select
            onChange={(event) => onGridSourceChange(event.target.value as GridSource)}
            value={gridSource}
          >
            <option value="brief">Brief order</option>
            <option value="qualifying">Qualifying</option>
            <option disabled={!openF1GridAvailable} value="openf1">
              OpenF1 order
            </option>
          </select>
          <small>
            {gridSource === 'openf1'
              ? openF1GridStatus
              : gridSource === 'qualifying'
                ? `Pole: ${qualifyingResults[0]?.code ?? '---'} (${qualifyingResults[0]?.weatherLabel ?? 'CLEAR'})`
                : 'Use the supplied start order and stagger.'}
          </small>
        </label>
        {gridSource === 'qualifying' ? (
          <ol className="qualifying-preview" aria-label="qualifying top five">
            {qualifyingResults.slice(0, 5).map((result) => (
              <li key={result.driverId}>
                <span>{result.position}</span>
                <strong>{result.code}</strong>
                <small>
                  {result.position === 1
                    ? result.lapTimeSeconds.toFixed(3)
                    : `+${result.deltaSeconds.toFixed(3)}`}
                </small>
              </li>
            ))}
          </ol>
        ) : null}
        {isPracticeStage(selectedWeekendStage) ? (
          <div className="session-preview">
            <div className="section-title compact-title">
              <span>Practice setup</span>
              <small>{compactSessionDurationLabel(selectedWeekendStage)}</small>
            </div>
            <ol className="qualifying-preview" aria-label="practice setup top five">
              {practiceResults.slice(0, 5).map((result) => (
                <li key={result.driverId}>
                  <span>{result.position}</span>
                  <strong>{result.code}</strong>
                  <small>
                    {result.setupScore}/100 | {result.lapsCompleted} laps |{' '}
                    {Math.round(result.setupConfidence * 100)}%
                  </small>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <div className="session-preview">
          <div className="section-title compact-title">
            <span>Weekend setup</span>
            <small>FP derived</small>
          </div>
          <ol className="qualifying-preview" aria-label="weekend setup top teams">
            {practiceSetup.teamSummaries.slice(0, 3).map((summary, index) => (
              <li key={summary.teamId}>
                <span>{index + 1}</span>
                <strong>{summary.teamName.split(' ')[0]}</strong>
                <small>
                  {Math.round(summary.score)}/100 | aero{' '}
                  {summary.aeroDelta >= 0 ? '+' : ''}
                  {(summary.aeroDelta * 100).toFixed(1)}%
                </small>
              </li>
            ))}
          </ol>
        </div>
        <div className="session-preview">
          <div className="section-title compact-title">
            <span>Tire plan</span>
            <small>sets / start</small>
          </div>
          <ol className="qualifying-preview" aria-label="weekend tire plan">
            {weekendTirePlan.driverPlans.slice(0, 5).map((plan) => (
              <li key={plan.driverId}>
                <span>{plan.raceStartCompound}</span>
                <strong>{plan.code}</strong>
                <small>
                  {selectedTrack.tireNomination?.H ?? 'C?'}-
                  {selectedTrack.tireNomination?.M ?? 'C?'}-
                  {selectedTrack.tireNomination?.S ?? 'C?'} | left S{plan.remaining.S} M{plan.remaining.M} H{plan.remaining.H} |
                  sprint {plan.sprintStartCompound}
                </small>
              </li>
            ))}
          </ol>
        </div>
        {selectedWeekendStage === 'qualifying' ||
        selectedWeekendStage === 'sprintQualifying' ? (
          <div className="session-preview">
            <div className="section-title compact-title">
              <span>
                {selectedWeekendStage === 'sprintQualifying'
                  ? 'Sprint qualifying'
                  : 'Qualifying runs'}
              </span>
              <small>{compactSessionDurationLabel(selectedWeekendStage)}</small>
            </div>
            <div className="knockout-strip" aria-label="qualifying segments">
              {knockoutQualifying.segments.map((segment) => (
                <span key={segment.name}>
                  <strong>{segment.name}</strong>
                  {Math.round(segment.sessionDurationSeconds / 60)}m / out{' '}
                  {segment.eliminatedDriverIds.length}
                  {segment.suspensionSeconds > 0
                    ? ` / red +${Math.round(segment.suspensionSeconds / 60)}m`
                    : ''}
                </span>
              ))}
            </div>
            <ol className="qualifying-preview" aria-label="qualifying run plan top five">
              {qualifyingResults.slice(0, 5).map((result) => (
                <li key={result.driverId}>
                  <span>{result.position}</span>
                  <strong>{result.code}</strong>
                  <small>
                    {result.compound} pit {formatClock(result.pitExitAtSeconds)} | out{' '}
                    {formatTime(result.outLapTimeSeconds)} / push{' '}
                    {formatTime(result.lapTimeSeconds)}
                    {' | '}
                    valid {result.validRunCount}/{result.runCount}
                    {result.trafficLossSeconds > 0
                      ? ` / traffic +${result.trafficLossSeconds.toFixed(1)}`
                      : ''}
                    {result.abortedRunCount > 0
                      ? ` / abort ${result.abortedRunCount}`
                      : ''}
                    {result.deletedRunCount > 0
                      ? ` / deleted ${result.deletedRunCount}`
                      : ''}
                    {result.classificationStatus !== 'classified'
                      ? ` / ${result.classificationStatus}`
                      : ''}
                  </small>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
        <label className="field-block">
          <span>Team</span>
          <select
            onChange={(event) => onTeamChange(event.target.value)}
            value={selectedTeam.id}
          >
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>
        <div className="preset-row">
          <button onClick={() => onApplyTeamPreset('top')} type="button">
            Top
          </button>
          <button onClick={() => onApplyTeamPreset('mid')} type="button">
            Mid
          </button>
          <button onClick={() => onApplyTeamPreset('back')} type="button">
            Back
          </button>
        </div>
        {teamStats.map((stat) => (
          <SliderRow
            key={stat.key}
            label={stat.label}
            onChange={(value) => onTeamStatChange(selectedTeam.id, stat.key, value)}
            value={teamStatValue(selectedTeam, stat.key)}
          />
        ))}
      </div>

      <div className="setup-section">
        <div className="section-title">
          <span>Power unit pool</span>
          <a
            href={componentAllocationSource.url}
            rel="noreferrer"
            target="_blank"
            title={componentAllocationSource.label}
          >
            FIA B8.2
          </a>
        </div>
        <div className="component-list">
          {componentRows.map(({ key, label }) => {
            const component = selectedComponents[key]
            const limitLabel =
              component.allocationLimit === null
                ? 'SIM'
                : `${component.allocationUsed}/${component.allocationLimit}`

            return (
              <div className="component-row" key={key}>
                <span>{label}</span>
                <div className="component-condition">
                  <i
                    style={{ width: `${Math.round(component.conditionPercent)}%` }}
                  />
                </div>
                <strong>{Math.round(component.conditionPercent)}%</strong>
                <small>{limitLabel}</small>
                <button
                  aria-label={`replace ${label}`}
                  className="plain-icon-button"
                  disabled={componentReplacementDisabled}
                  onClick={() => onComponentReplace(selectedDriver.id, key)}
                  title={`Replace ${label}`}
                  type="button"
                >
                  <Wrench aria-hidden="true" size={14} />
                </button>
              </div>
            )
          })}
        </div>
        <small>
          Grid penalty {weekendContext.gridPenaltyByDriver[selectedDriver.id] ?? 0}
        </small>
        <label className="binary-setting">
          <input
            checked={weekendContext.pitLaneStartByDriver[selectedDriver.id] ?? false}
            onChange={(event) =>
              onPitLaneStartChange(selectedDriver.id, event.target.checked)
            }
            type="checkbox"
          />
          <span>Pit-lane start</span>
        </label>
      </div>

      <div className="setup-section">
        <div className="section-title">
          <span>Car setup</span>
          <small>{parcFermeLocked ? 'PARC FERME' : `confidence ${Math.round((weekendContext.setupConfidenceByDriver[selectedDriver.id] ?? 0) * 100)}%`}</small>
        </div>
        {selectedCarSetup ? (
          <>
            <EngineeringSlider disabled={parcFermeLocked} label="Front wing" min={1} max={10} step={1} value={selectedCarSetup.frontWing} onChange={(value) => onCarSetupChange(selectedDriver.id, 'frontWing', value)} />
            <EngineeringSlider disabled={parcFermeLocked} label="Rear wing" min={1} max={10} step={1} value={selectedCarSetup.rearWing} onChange={(value) => onCarSetupChange(selectedDriver.id, 'rearWing', value)} />
            <EngineeringSlider disabled={parcFermeLocked} label="Ride height" min={20} max={45} step={1} suffix="mm" value={selectedCarSetup.rideHeightMm} onChange={(value) => onCarSetupChange(selectedDriver.id, 'rideHeightMm', value)} />
            <EngineeringSlider disabled={parcFermeLocked} label="Brake bias" min={52} max={60} step={0.5} suffix="%" value={selectedCarSetup.brakeBiasPercent} onChange={(value) => onCarSetupChange(selectedDriver.id, 'brakeBiasPercent', value)} />
            <EngineeringSlider disabled={parcFermeLocked} label="Differential" min={35} max={75} step={1} suffix="%" value={selectedCarSetup.differentialPercent} onChange={(value) => onCarSetupChange(selectedDriver.id, 'differentialPercent', value)} />
            <EngineeringSlider disabled={parcFermeLocked} label="Cooling" min={25} max={90} step={1} suffix="%" value={selectedCarSetup.coolingPercent} onChange={(value) => onCarSetupChange(selectedDriver.id, 'coolingPercent', value)} />
          </>
        ) : null}
      </div>

      <div className="setup-section">
        <div className="section-title">
          <span>Driver tune</span>
          <small>
            {DRIVER_ABILITY_GROUPS.length} GROUPS / MAX{' '}
            {DRIVER_ABILITY_SCALE_MAX}
          </small>
        </div>
        <label className="field-block">
          <span>Driver</span>
          <select
            onChange={(event) => onDriverChange(event.target.value)}
            value={selectedDriver.id}
          >
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.code} - {driver.name}
              </option>
            ))}
          </select>
        </label>
        <div className="driver-overall-rating">
          <span>Overall ability</span>
          <strong>{driverOverallAbilityPoints(selectedDriver)}</strong>
          <small>
            Source OVR {driverConfiguredOverallAbilityPoints(selectedDriver)} /
            12-group mean
          </small>
        </div>
        <div className="driver-ability-grid">
          {DRIVER_ABILITY_GROUPS.map((group) => (
            <SliderRow
              key={group.key}
              label={group.label}
              max={DRIVER_ABILITY_INTERNAL_MAX}
              onChange={(value) => {
                for (const stat of group.stats) {
                  onDriverStatChange(selectedDriver.id, stat, value)
                }
              }}
              value={driverAbilityGroupValue(selectedDriver, group.stats)}
            />
          ))}
        </div>
      </div>
    </section>
  )
}
