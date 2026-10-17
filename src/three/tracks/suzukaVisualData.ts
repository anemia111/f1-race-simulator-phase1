/** Rendering estimates only. Never imported by simulation, data or workers. */
export const suzukaVisualEvidence = {
  reference: 'https://www.suzukacircuit.jp/course_s/pdf/suzuka_courseguide.pdf',
  cornerViews: 'https://www.suzukacircuit.jp/eng/course_s/',
  accessed: '2026-10-17',
  referenceUse: 'Topology and viewing reference only; no image or texture copying.',
  confidence: 'Corner identity follows existing OpenF1 anchors. Extents, widths and kerb profiles are visual estimates, not surveyed measurements.',
} as const

type CornerVisual = {
  corner: number; name: string
  kerb?: { beforeM: number; afterM: number; widthM: number; heightM: number; stripeM: number }
  exitKerb?: { fromM: number; toM: number; widthM: number; heightM: number; stripeM: number }
  runoff?: { beforeM: number; afterM: number; widthM: number; surface: 'gravel' | 'asphalt' }
}
export const suzukaCornerVisuals: readonly CornerVisual[] = [
  { corner: 1, name: 'First', kerb: { beforeM: 22, afterM: 50, widthM: 1.4, heightM: .075, stripeM: 2 }, runoff: { beforeM: 35, afterM: 72, widthM: 28, surface: 'gravel' } },
  { corner: 2, name: 'Second', kerb: { beforeM: 20, afterM: 62, widthM: 1.5, heightM: .08, stripeM: 2.2 }, exitKerb: { fromM: 32, toM: 78, widthM: 1.35, heightM: .06, stripeM: 2.2 }, runoff: { beforeM: 24, afterM: 65, widthM: 22, surface: 'gravel' } },
  { corner: 3, name: 'S 1', kerb: { beforeM: 15, afterM: 32, widthM: 1.1, heightM: .065, stripeM: 1.8 } },
  { corner: 4, name: 'S 2', kerb: { beforeM: 17, afterM: 30, widthM: 1.15, heightM: .065, stripeM: 1.8 } },
  { corner: 5, name: 'S 3', kerb: { beforeM: 13, afterM: 37, widthM: 1.2, heightM: .07, stripeM: 1.9 } },
  { corner: 6, name: 'Reverse bank', kerb: { beforeM: 21, afterM: 44, widthM: 1.3, heightM: .075, stripeM: 2 } },
  { corner: 7, name: 'Dunlop / NIPPO', kerb: { beforeM: 25, afterM: 64, widthM: 1.35, heightM: .07, stripeM: 2.1 } },
  { corner: 8, name: 'Degner 1', kerb: { beforeM: 12, afterM: 34, widthM: 1.25, heightM: .09, stripeM: 1.7 }, runoff: { beforeM: 15, afterM: 46, widthM: 14, surface: 'gravel' } },
  { corner: 9, name: 'Degner 2', kerb: { beforeM: 14, afterM: 33, widthM: 1.4, heightM: .095, stripeM: 1.7 }, runoff: { beforeM: 24, afterM: 44, widthM: 18, surface: 'gravel' } },
  { corner: 10, name: 'Hairpin approach' },
  { corner: 11, name: 'Hairpin', kerb: { beforeM: 17, afterM: 43, widthM: 1.65, heightM: .085, stripeM: 1.8 }, runoff: { beforeM: 20, afterM: 42, widthM: 15, surface: 'gravel' } },
  { corner: 12, name: '200R' },
  { corner: 13, name: 'Spoon 1', kerb: { beforeM: 28, afterM: 56, widthM: 1.45, heightM: .075, stripeM: 2.1 }, runoff: { beforeM: 33, afterM: 64, widthM: 26, surface: 'gravel' } },
  { corner: 14, name: 'Spoon 2', kerb: { beforeM: 24, afterM: 62, widthM: 1.5, heightM: .075, stripeM: 2.1 }, exitKerb: { fromM: 35, toM: 95, widthM: 1.5, heightM: .06, stripeM: 2.2 }, runoff: { beforeM: 25, afterM: 72, widthM: 24, surface: 'gravel' } },
  { corner: 15, name: '130R', kerb: { beforeM: 35, afterM: 65, widthM: 1.25, heightM: .06, stripeM: 2.4 }, runoff: { beforeM: 32, afterM: 80, widthM: 25, surface: 'asphalt' } },
  { corner: 16, name: 'Chicane right', kerb: { beforeM: 12, afterM: 23, widthM: 1.7, heightM: .1, stripeM: 1.5 }, runoff: { beforeM: 25, afterM: 35, widthM: 16, surface: 'asphalt' } },
  { corner: 17, name: 'Chicane left', kerb: { beforeM: 10, afterM: 27, widthM: 1.7, heightM: .1, stripeM: 1.5 } },
  { corner: 18, name: 'Final', kerb: { beforeM: 20, afterM: 48, widthM: 1.25, heightM: .065, stripeM: 2 }, exitKerb: { fromM: 28, toM: 74, widthM: 1.2, heightM: .055, stripeM: 2 } },
]
