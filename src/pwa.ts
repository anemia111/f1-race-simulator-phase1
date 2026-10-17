import { registerSW } from 'virtual:pwa-register'

export type AppUpdateState = {
  currentBuild: string
  latestBuild: string | null
  status: 'idle' | 'checking' | 'current' | 'available' | 'offline' | 'applying' | 'error'
}
export const currentBuild = import.meta.env.VITE_APP_BUILD_ID ?? 'development'
let state: AppUpdateState = { currentBuild, latestBuild: null, status: 'idle' }
const listeners = new Set<() => void>()
let registration: ServiceWorkerRegistration | undefined
let pendingCheck: Promise<void> | undefined
let started = false
export const appUpdateSnapshot = () => state
export const subscribeAppUpdate = (listener: () => void) => {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
const publish = (patch: Partial<AppUpdateState>) => {
  state = { ...state, ...patch }
  listeners.forEach(listener => listener())
}
async function readServerBuild() {
  const url = new URL(`${import.meta.env.BASE_URL}build-info.json`, window.location.origin)
  url.searchParams.set('check', String(Date.now()))
  const response = await fetch(url, { cache: 'no-store', signal: AbortSignal.timeout(5000) })
  if (!response.ok) throw new Error('Build manifest unavailable')
  const manifest = await response.json() as { buildId?: unknown }
  if (typeof manifest.buildId !== 'string' || !manifest.buildId || manifest.buildId.length > 200) {
    throw new Error('Invalid build manifest')
  }
  return manifest.buildId
}
export function checkAppUpdate(): Promise<void> {
  if (pendingCheck) return pendingCheck
  if (state.status === 'applying') return Promise.resolve()
  publish({ status: 'checking' })
  pendingCheck = (async () => {
    try {
      const latestBuild = await readServerBuild()
      publish({ latestBuild, status: latestBuild === currentBuild ? 'current' : 'available' })
      void registration?.update().catch(() => undefined)
    } catch {
      publish({ status: 'offline' })
    } finally {
      pendingCheck = undefined
    }
  })()
  return pendingCheck
}
async function activateWorker() {
  if (!registration) return
  await registration.update()
  const worker = registration.installing ?? registration.waiting
  if (!worker) return
  if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' })
  await new Promise<void>((resolve, reject) => {
    const timeout = window.setTimeout(() => { cleanup(); reject(new Error('Update activation timed out')) }, 10000)
    const cleanup = () => { clearTimeout(timeout); worker.removeEventListener('statechange', changed) }
    const changed = () => {
      if (worker.state === 'installed') worker.postMessage({ type: 'SKIP_WAITING' })
      if (worker.state === 'activated') { cleanup(); resolve() }
      if (worker.state === 'redundant') { cleanup(); reject(new Error('Update worker failed')) }
    }
    worker.addEventListener('statechange', changed)
    changed()
  })
}
export async function applyAppUpdate() {
  if (state.status === 'applying') return
  publish({ status: 'applying' })
  try {
    const latestBuild = await readServerBuild()
    await activateWorker()
    publish({ latestBuild })
    window.location.reload()
  } catch {
    publish({ status: 'error' })
  }
}
export function registerAppUpdater() {
  if (started || import.meta.env.DEV) return
  started = true
  document.documentElement.dataset.buildId = currentBuild
  if ('serviceWorker' in navigator) {
    registerSW({
      immediate: true,
      onNeedReload: () => { void checkAppUpdate() },
      onRegisteredSW: (_url, registered) => { registration = registered; void checkAppUpdate() },
      onRegisterError: () => { void checkAppUpdate() },
    })
  }
  void checkAppUpdate()
  window.setInterval(() => { void checkAppUpdate() }, 60000)
  window.addEventListener('online', () => { void checkAppUpdate() })
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void checkAppUpdate()
  })
}
