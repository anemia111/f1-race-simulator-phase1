import type { CarSetup, WeekendContext } from '../types'
import { normalizeCarSetup } from './engineering'

export function updateDriverCarSetup<T extends WeekendContext>(
  context: T, driverId: string, patch: Partial<CarSetup>,
): T {
  const current = context.setupByDriver[driverId]
  if (!current || context.parcFermeLockedByDriver[driverId]) return context
  const finitePatch = Object.fromEntries(Object.entries(patch).filter(([, value]) => Number.isFinite(value)))
  if (!Object.keys(finitePatch).length) return context
  return {
    ...context,
    setupByDriver: { ...context.setupByDriver, [driverId]: normalizeCarSetup({ ...current, ...finitePatch }) },
    manualSetupByDriver: { ...context.manualSetupByDriver, [driverId]: true },
  }
}

export function setDriverAutomaticSetup<T extends WeekendContext>(
  context: T, driverId: string, automatic: boolean,
): T {
  if (!context.setupByDriver[driverId] || context.parcFermeLockedByDriver[driverId]) return context
  return { ...context, manualSetupByDriver: { ...context.manualSetupByDriver, [driverId]: !automatic } }
}
