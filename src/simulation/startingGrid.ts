/** Longitudinal spacing between consecutive legacy grid slots. */
export const STARTING_GRID_SLOT_GAP = 0.00145
/** A complete left/right row stays compact enough for adjacent map labels. */
export const STARTING_GRID_ROW_GAP = STARTING_GRID_SLOT_GAP * 2
/** Even positions sit slightly behind the odd position in the same row. */
export const STARTING_GRID_STAGGER = STARTING_GRID_SLOT_GAP

export function startingGridDistance(gridIndex: number) {
  const normalizedIndex = Math.max(0, Math.floor(gridIndex))
  const row = Math.floor(normalizedIndex / 2)
  const stagger = normalizedIndex % 2 === 0 ? 0 : STARTING_GRID_STAGGER

  return 1 - row * STARTING_GRID_ROW_GAP - stagger
}
