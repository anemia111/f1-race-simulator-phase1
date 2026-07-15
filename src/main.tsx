import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { AppErrorBoundary } from './components/AppErrorBoundary.tsx'
import { registerAppUpdater } from './pwa.ts'

const releaseId = import.meta.env.VITE_APP_RELEASE_ID?.trim()

if (releaseId) {
  document.documentElement.dataset.releaseId = releaseId
}

registerAppUpdater()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
