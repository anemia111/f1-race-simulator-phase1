import { registerSW } from 'virtual:pwa-register'

const UPDATE_INTERVAL_MS = 60_000

export function registerAppUpdater() {
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) {
    return
  }

  const checkForUpdate = (registration: ServiceWorkerRegistration) => {
    if (!navigator.onLine) {
      return
    }

    void registration.update().catch((error: unknown) => {
      console.warn('F1 app update check failed.', error)
    })
  }

  registerSW({
    immediate: true,
    // Let the new worker take control without interrupting a live race. The
    // updated app is loaded on the next normal navigation or desktop launch.
    onNeedReload: () => undefined,
    onRegisteredSW: (_scriptUrl, registration) => {
      if (!registration) {
        return
      }

      checkForUpdate(registration)
      window.setInterval(
        () => checkForUpdate(registration),
        UPDATE_INTERVAL_MS,
      )
      window.addEventListener('online', () => checkForUpdate(registration))
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          checkForUpdate(registration)
        }
      })
    },
    onRegisterError: (error: unknown) => {
      console.warn('F1 app service worker registration failed.', error)
    },
  })
}
