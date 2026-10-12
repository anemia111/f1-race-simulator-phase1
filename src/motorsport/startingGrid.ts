import type { MotorsportClass, MotorsportRaceConfig } from './types'

/** User-requested SIM start separation, not a claim about championship rules. */
export const CLASS_START_GAP_M = 500
const GRID_CAR_GAP_M = 9

/** Preserve the authored/manual/qualifying order inside each class. */
export function startingGridPositions(config: MotorsportRaceConfig): Map<string, { distanceM: number; lateralM: number }> {
  const classOrder: MotorsportClass[] = config.championship === 'wec'
    ? ['hypercar', 'lmp2', 'lmgt3']
    : config.championship === 'super-gt' ? ['gt500', 'gt300'] : []
  for (const entry of config.entries) if (!classOrder.includes(entry.classId)) classOrder.push(entry.classId)
  const entries = [...config.entries].sort((a,b)=>classOrder.indexOf(a.classId)-classOrder.indexOf(b.classId))
  const positions = new Map<string, { distanceM: number; lateralM: number }>()
  let distanceM = 0, classIndex = 0
  entries.forEach((entry,index)=>{
    if (index > 0) {
      const nextClass = entries[index-1].classId !== entry.classId
      distanceM -= nextClass ? CLASS_START_GAP_M : GRID_CAR_GAP_M
      classIndex = nextClass ? 0 : classIndex + 1
    }
    positions.set(entry.id,{distanceM,lateralM:classIndex % 2 ? 1.5 : -1.5})
  })
  return positions
}
