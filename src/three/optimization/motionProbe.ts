import type { CarSnapshot } from '../../types'
declare global {
  interface Window {
    __cinematicMotion?: {
      renderedAt: number
      driverId: string
      distance: number
      latestDistance: number
      speedKph: number
      status: string
    }
  }
}
/** Read-only last-render telemetry; no history allocation or React update. */
export function recordCinematicMotion(rendered: CarSnapshot, latest: CarSnapshot) {
  window.__cinematicMotion = { renderedAt: performance.now(), driverId: latest.driverId,
    distance: rendered.totalDistance, latestDistance: latest.totalDistance,
    speedKph: rendered.speedKph, status: rendered.status }
}
