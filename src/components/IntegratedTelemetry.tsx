import { useMemo } from 'react'
import { TelemetryComparison } from '../restored20261010/components/TelemetryComparison'
import type { TelemetryTrace } from '../restored20261010/components/TelemetryComparison'
import { trackCornerTelemetry } from '../restored20261010/data/cornerReferences'
import type { TrackDefinition } from '../types'
import './integratedTelemetry.css'

export function IntegratedTelemetry({ traces, track, selectedId, dataMode, onFocusDriver }: {
  traces: TelemetryTrace[]; track: TrackDefinition; selectedId: string; dataMode: 'SIM' | 'HIST' | 'LIVE'
  onFocusDriver: (id: string) => void
}) {
  const corners = useMemo(() => trackCornerTelemetry(track), [track])
  if (dataMode !== 'SIM') return <p className="race-data-empty">HIST / LIVEの比較履歴は未接続です。SIMの走行履歴と混同して表示しません。</p>
  return <div className="integrated-telemetry">
    <label className="telemetry-primary-car">車両A <select aria-label="Telemetry primary car" value={selectedId}
      onChange={event => onFocusDriver(event.target.value)}>{traces.map(trace => <option key={trace.id} value={trace.id}>{trace.name}</option>)}</select></label>
    <p>SIM · 受信した走行状態を記録します。未提供の操舵角・姿勢・4輪温度などは未取得のまま表示します。比較はこの観戦セッションで受信した履歴です。</p>
    <TelemetryComparison traces={traces} selectedId={selectedId} lengthM={track.lengthKm * 1000}
      corners={corners} centerline={track.centerline} />
  </div>
}
