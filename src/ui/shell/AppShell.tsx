import { useState, useEffect, useRef } from 'react'
import { NavBar, type NavTab } from './NavBar'
import { MorePicker, type MoreView } from './MorePicker'
import { InstrumentStrip } from './InstrumentStrip'
import { PanelLayout } from './PanelLayout'
import { UpdateBanner } from './UpdateBanner'
import { RouteBanner } from './RouteBanner'
import { Disclaimer } from './Disclaimer'
import { useResponsiveLayout } from '../hooks/useResponsiveLayout'
import { useGPS } from '../hooks/useGPS'
import { useWakeLock } from '../hooks/useWakeLock'
import { useSessionStore } from '../../state/session-store'
import { useDirectToStore } from '../../state/direct-to-store'
import { useRouteStore } from '../../state/route-store'
import { useMapSettingsStore } from '../../state/map-settings-store'
import { useInstrumentStore } from '../../state/instrument-store'
import { useGPSStore } from '../../state/gps-store'
import { useTimelineStore } from '../../state/timeline-store'
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
import { TilesetsPage } from '../pages/tilesets/TilesetsPage'
import { useTilesetsStore } from '../../state/tilesets-store'

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

  // Register downloaded offline tilesets with the PMTiles protocol so the map
  // can render pmtiles://<id> sources. Idempotent — the store guards on init.
  useEffect(() => { useTilesetsStore.getState().init() }, [])

  // Keep screen awake during active sessions
  useWakeLock(sessionStatus === 'active')

  // When a session ends: reset ephemeral flight state and open the sessions
  // view on the just-ended session (SessionsPage reads justEndedSessionId from
  // the store and auto-selects it).
  const prevStatus = useRef(sessionStatus)
  useEffect(() => {
    if (prevStatus.current === 'active' && sessionStatus === 'idle') {
      setActiveTab('map')
      setMoreOpen(false)
      setMoreView('sessions')
      setPanelOpen(true)
      useDirectToStore.getState().clearTarget()
      useRouteStore.getState().deactivateRoute()
      const inst = useInstrumentStore.getState()
      inst.clearValues()
      inst.resetRolling()
      inst.resetMaxAGL()
      useGPSStore.setState({ smoothedTrack: null, recentPositions: [] })
      useTimelineStore.getState().clearEvents()
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
    if (moreView === 'tilesets') return <TilesetsPage />
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
      <Disclaimer />
    </>
  )
}
