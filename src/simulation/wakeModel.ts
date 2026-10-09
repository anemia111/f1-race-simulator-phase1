/** Shared force-coefficient model, extracted from the native F1/SF integrator.
 * These are SIM coefficients, not manufacturer wind-tunnel measurements. */
const clamp = (x: number, a: number, b: number) => Math.min(b,Math.max(a,x))
export type WakeObservation = {
  gapSeconds: number
  lateralSeparationM?: number
  curvature: number
  straightness: number
}
export function wakeDownforceMultiplier(observation: WakeObservation, sensitivity: number) {
  const {gapSeconds,curvature,lateralSeparationM} = observation
  if (!Number.isFinite(gapSeconds) || gapSeconds<=0 || gapSeconds>=2.5 || curvature<0.025) return 1
  const proximity=1-clamp(gapSeconds/2.5,0,1)
  const alignment=lateralSeparationM===undefined?1:clamp(1-Math.abs(lateralSeparationM)/3.2,0,1)**1.35
  return clamp(1-proximity**1.35*curvature*0.115*sensitivity*alignment,0.88,1)
}
export function wakeDragReduction(observation: WakeObservation, sensitivity: number) {
  const {gapSeconds,straightness,lateralSeparationM}=observation
  if (!Number.isFinite(gapSeconds) || gapSeconds<=0 || gapSeconds>1.8 || straightness<0.72) return 0
  const proximity=1-clamp((gapSeconds-0.08)/1.72,0,1)
  const alignment=lateralSeparationM===undefined?1:clamp(1-Math.abs(lateralSeparationM)/2.8,0,1)**1.2
  return clamp(proximity*straightness*sensitivity*alignment,0,0.07)
}
