import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './AppShell.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import { registerAppUpdater } from './pwa.ts'
import { AppUpdateNotice } from './components/AppUpdateNotice.tsx'

const releaseId = import.meta.env.VITE_APP_RELEASE_ID?.trim()

if (releaseId) {
  document.documentElement.dataset.releaseId = releaseId
}

registerAppUpdater()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
      <AppUpdateNotice />
    </AppErrorBoundary>
  </StrictMode>,
)
