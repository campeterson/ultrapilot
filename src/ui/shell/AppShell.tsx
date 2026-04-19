import { useState, useEffect, useRef } from 'react'
import { NavBar, type NavTab } from './NavBar'
import { MorePicker, type MoreView } from './MorePicker'
import { InstrumentStrip } from './InstrumentStrip'
import { PanelLayout } from './PanelLayout'
import { UpdateBanner } from './UpdateBanner'
import { RouteBanner } from './RouteBanner'
import { useResponsiveLayout } from '../hooks/useResponsiveLayout'
import { useGPS } from '../hooks/useGPS'
import { useWakeLock } from '../hooks/useWakeLock'
import { useSessionStore } from '../../state/session-store'
import { useDirectToStore } from '../../state/direct-to-store'
import { useRouteStore } from '../../state/route-store'
import { useMapSettingsStore } from '../../state/map-settings-store'
import { theme } from '../theme'
import { trackEvent } from '../../lib/analytics'
import { MapPage } from '../pages/map/MapPage'
import { TimelinePage } from '../pages/timeline/TimelinePage'
import { ChecklistsPage } from '../pages/checklists/ChecklistsPage'
import { WxPage } from '../pages/weather/WxPage'
import { WaypointsPage } from '../pages/waypoints/WaypointsPage'
import { RoutesPage } from '../pages/routes/RoutesPage'
import { SessionsPage } from '../pages/sessions/SessionsPage'
import { InstrumentsPage } from '../pages/instruments/InstrumentsPage'
import { SettingsPage } from '../pages/settings/SettingsPage'

export function AppShell() {
  const [activeTab, setActiveTab] = useState<NavTab>('map')
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreView, setMoreView] = useState<MoreView | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const layout = useResponsiveLayout()
  const { sessionStatus } = useSessionStore()
  const { showInstrumentStrip } = useMapSettingsStore()

  // Start GPS on mount
  useGPS()

  // Keep screen awake during active sessions
  useWakeLock(sessionStatus === 'active')

  // Return to map tab and clear direct-to when a session ends
  const prevStatus = useRef(sessionStatus)
  useEffect(() => {
    if (prevStatus.current === 'active' && sessionStatus === 'idle') {
      setActiveTab('map')
      setMoreView(null)
      setMoreOpen(false)
      setPanelOpen(false)
      useDirectToStore.getState().clearTarget()
      useRouteStore.getState().deactivateRoute()
    }
    prevStatus.current = sessionStatus
  }, [sessionStatus])

  function handleTabSelect(tab: NavTab) {
    if (tab === 'more') {
      setMoreOpen(v => !v)
      return
    }
    setMoreOpen(false)
    setMoreView(null)

    if (tab === 'map') {
      setPanelOpen(false)
      setActiveTab('map')
    } else {
      setActiveTab(tab)
      trackEvent(`panel_${tab}`)
      if (layout !== 'phone') {
        setPanelOpen(true)
      }
    }
  }

  function handleMoreSelect(view: MoreView) {
    setMoreOpen(false)
    setMoreView(view)
    trackEvent(`panel_${view}`)
    if (layout !== 'phone') setPanelOpen(true)
  }

  function getPanelContent() {
    if (moreView === 'instruments') return <InstrumentsPage />
    if (moreView === 'sessions') return <SessionsPage />
    if (moreView === 'settings') return <SettingsPage />

    switch (activeTab) {
      case 'timeline': return <TimelinePage />
      case 'checklists': return <ChecklistsPage />
      case 'wx': return <WxPage />
      case 'waypoints': return <WaypointsPage />
      case 'routes': return <RoutesPage />
      default: return null
    }
  }

  const panelContent = getPanelContent()
  const isPanelTab = activeTab !== 'map' || moreView !== null
  const effectivePanelOpen = layout === 'phone' ? isPanelTab : panelOpen

  const topOffset = showInstrumentStrip
    ? theme.safeStripHeight
    : 'env(safe-area-inset-top, 0px)'

  return (
    <>
      {showInstrumentStrip && <InstrumentStrip />}

      <PanelLayout
        layout={layout}
        mapContent={<MapPage showControls={layout !== 'phone' || (activeTab === 'map' && moreView === null)} />}
        panelContent={panelContent}
        panelOpen={effectivePanelOpen}
        onTogglePanel={() => setPanelOpen(v => !v)}
        topOffset={topOffset}
      />

      <NavBar
        active={moreView ? 'more' : activeTab}
        onSelect={handleTabSelect}
      />

      <MorePicker
        visible={moreOpen}
        onSelect={handleMoreSelect}
        onDismiss={() => setMoreOpen(false)}
      />

      <RouteBanner />
      <UpdateBanner />
    </>
  )
}
