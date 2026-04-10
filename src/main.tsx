import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'leaflet/dist/leaflet.css'
import { AppShell } from './ui/shell/AppShell'
import { restoreLastSession } from './state/session-store'

// Restore any open session from a previous visit
restoreLastSession()

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <AppShell />
  </StrictMode>
)

// Register service worker
if ('serviceWorker' in navigator) {
  import('virtual:pwa-register').then(({ registerSW }) => {
    registerSW({ immediate: true })
  }).catch(() => {
    // PWA registration not available in dev
  })
}
