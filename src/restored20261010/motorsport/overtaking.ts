/** Observed driving opportunities; this never adds grip, power or distance. */
export function hasOvertakingOpportunity(input: {
  speedMps:number; opponentSpeedMps:number; freeTargetMps:number; gapM:number
  continuing:boolean; powerToMassAdvantage:number; lapping:boolean
  ownBestLap:number|null; opponentBestLap:number|null
  ownTyreLaps:number; opponentTyreLaps:number
  opponentBrakePercent:number; opponentThrottlePercent:number
}) {
  if(input.gapM < -7 || input.gapM > Math.max(15,Math.min(90,input.speedMps*1.8))) return false
  if(input.continuing || input.lapping || input.speedMps>input.opponentSpeedMps+0.5) return true
  const pace = input.ownBestLap!==null && input.opponentBestLap!==null &&
    input.ownBestLap+0.25<input.opponentBestLap
  const fresher = input.ownTyreLaps+4<input.opponentTyreLaps
  const observedSlowdown = input.opponentBrakePercent>5 || input.opponentThrottlePercent<60
  // The free envelope is the driver's own capability. Rival capability/fuel/
  // hidden tyre grip is not inspected. Pedals remain force/slip constrained.
  return input.freeTargetMps>input.opponentSpeedMps+1.5 &&
    (input.powerToMassAdvantage>0.003 || pace || fresher || observedSlowdown)
}
