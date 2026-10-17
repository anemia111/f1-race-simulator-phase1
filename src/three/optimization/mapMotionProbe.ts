type MapMotionSample = { driverId: string; x: number; z: number; speedKph: number; moving: boolean; renderedAt: number }
declare global { interface Window { __mapMotion?: MapMotionSample } }
/** Latest selected render position only. No histories, state updates or physics writes. */
export function recordSelectedMapMotion(sample: MapMotionSample) { window.__mapMotion = sample }
