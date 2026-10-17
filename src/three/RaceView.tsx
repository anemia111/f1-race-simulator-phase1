import { lazy, Suspense, useEffect, useState } from 'react'
import { RaceScene, type RaceSceneProps } from './RaceScene'
import type { CinematicCamera, Quality } from './core/visualFrame'
import type { RenderMetrics } from './optimization/FrameMetrics'
import { SceneBoundary } from './core/SceneBoundary'
import { PhysicsTelemetryPanel } from '../components/PhysicsTelemetryPanel'

const CinematicScene = lazy(() =>
  import('./core/CinematicScene').then((m) => ({ default: m.CinematicScene })),
)
export function RaceView(
  props: RaceSceneProps & {
    isPaused: boolean
    speed: number
    dataMode: string
    onCinematicChange: (active: boolean) => void
  },
) {
  const [cinematic, setCinematic] = useState(false),
    [mode, setMode] = useState<CinematicCamera>('tv'),
    [quality, setQuality] = useState<Quality>('medium'),
    [metrics, setMetrics] = useState<RenderMetrics | null>(null),
    [diagnostics, setDiagnostics] = useState(false),
    [physicsDiagnostics,setPhysicsDiagnostics]=useState(false)
  const available =
    props.config.track.id === 'suzuka-approx' &&
    props.dataMode === 'SIM' &&
    props.snapshot.cars.every((c) => c.runtimeSystems.kind === 'f1') &&
    props.speed === 1
  const active = cinematic && available
  const onCinematicChange = props.onCinematicChange
  useEffect(() => onCinematicChange(active), [active, onCinematicChange])
  return (
    <div className={`race-view ${active ? 'cinematic-view' : ''}`}>
      <div className="cinematic-toolbar">
        <div className="view-choice">
          <button
            type="button"
            aria-pressed={!active}
            onClick={() => setCinematic(false)}
          >
            Overview Map
          </button>
          <button
            type="button"
            disabled={!available}
            title={
              available
                ? 'Suzuka cinematic reconstruction'
                : 'Cinematic: Suzuka / F1 / SIM / 1x required'
            }
            aria-pressed={active}
            onClick={() => setCinematic(true)}
          >
            Cinematic
          </button>
        </div>
        {props.dataMode==='SIM'&&<button type="button" aria-pressed={physicsDiagnostics} onClick={()=>setPhysicsDiagnostics(v=>!v)}>Physics</button>}
        {active && (
          <>
            <select
              aria-label="Cinematic camera"
              value={mode}
              onChange={(e) => setMode(e.target.value as CinematicCamera)}
            >
              {Object.entries({
                tv: 'TV Broadcast',
                trackside: 'Trackside',
                chase: 'Chase',
                onboard: 'Onboard',
                helicopter: 'Helicopter',
                free: 'Free Camera',
              }).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
            <select
              aria-label="Cinematic quality"
              value={quality}
              onChange={(e) => setQuality(e.target.value as Quality)}
            >
              {['high', 'medium', 'low'].map((q) => (
                <option key={q} value={q}>
                  {q.toUpperCase()}
                </option>
              ))}
            </select>
            <button
              type="button"
              aria-pressed={diagnostics}
              onClick={() => setDiagnostics((v) => !v)}
            >
              Metrics
            </button>
            <button
              type="button"
              onClick={(e) => {
                const host = e.currentTarget.closest('.race-view')
                if (document.fullscreenElement) void document.exitFullscreen()
                else void host?.requestFullscreen()
              }}
            >
              Fullscreen
            </button>
          </>
        )}
      </div>
      {physicsDiagnostics&&props.dataMode==='SIM'&&<PhysicsTelemetryPanel car={props.snapshot.cars.find(c=>c.driverId===props.selectedDriverId)}/>}
      {active ? (
        <SceneBoundary
          fallback={
            <div className="scene-loading">
              Cinematic asset unavailable.{' '}
              <button type="button" onClick={() => setCinematic(false)}>
                Return to Overview Map
              </button>
            </div>
          }
        >
          <Suspense
            fallback={
              <div className="scene-loading">
                Loading Suzuka reconstruction…
              </div>
            }
          >
            <CinematicScene
              config={props.config}
              snapshot={props.snapshot}
              selected={props.selectedDriverId}
              paused={props.isPaused}
              quality={quality}
              mode={mode}
              onSelect={props.onSelectDriver}
              onMetrics={setMetrics}
            />
          </Suspense>
        </SceneBoundary>
      ) : (
        <RaceScene {...props} />
      )}
      {active && (
        <>
          <div className="cinematic-caption">
            <strong>SUZUKA / {mode.toUpperCase()}</strong>
            <span>SIM · 2026 concept · DEM elevation</span>
            <a
              style={{ pointerEvents: 'auto', color: '#d4e5e4' }}
              href={
                import.meta.env.BASE_URL + 'cinematic/qvist-attribution.txt'
              }
              target="_blank"
              rel="noreferrer"
            >
              Model: Qvist_designs · CC BY 4.0 · adapted
            </a>
            <small>
              Reconstruction preview · local widths, facilities & vehicle pose
              estimated
            </small>
          </div>
          {diagnostics && (
            <output className="cinematic-metrics">
              {metrics
                ? `${metrics.fps.toFixed(1)} render fps · p95 ${metrics.p95Ms.toFixed(1)} ms\n${metrics.calls} calls · ${(metrics.triangles / 1000).toFixed(0)}k triangles\n${metrics.geometries} geometries · ${metrics.textures} textures\n${metrics.width}×${metrics.height} · GPU ${metrics.gpuMs === null ? 'unavailable' : metrics.gpuMs.toFixed(1) + ' ms'}\nCPU submit ${metrics.renderCpuMs.toFixed(1)} ms · heap ${metrics.heapMiB?.toFixed(1) ?? 'unavailable'} MiB\n${metrics.renderer}`
                : 'Measuring…'}
            </output>
          )}
        </>
      )}
    </div>
  )
}
