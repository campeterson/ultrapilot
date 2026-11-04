import { useState, useEffect, useRef } from 'react'
import { NavBar, type NavTab } from './NavBar'
import { MorePicker, type MoreView } from './MorePicker'
import { InstrumentStrip } from './InstrumentStrip'
import { PanelLayout } from './PanelLayout'
import { usePanelStore } from '../../state/panel-store'
import { UpdateBanner } from './UpdateBanner'
import { RouteBanner } from './RouteBanner'
import { Disclaimer } from './Disclaimer'
import { useResponsiveLayout } from '../hooks/useResponsiveLayout'
import { useGPS } from '../hooks/useGPS'
import { useWakeLock } from '../hooks/useWakeLock'
import { useIOSScrollReset } from '../hooks/useIOSScrollReset'
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
import { useFlightModeStore } from '../../state/flight-mode-store'
import { WindreaderPage } from '../pages/windreader/WindreaderPage'
import { PlanPage } from '../pages/plan/PlanPage'
import { PendingPlaceForm } from '../pages/places/PlaceForm'
import { PlacesPage } from '../pages/places/PlacesPage'
import { ReplayScreen } from '../pages/sessions/ReplayScreen'
import { useReplayScreen } from '../hooks/useReplayScreen'

/** Section titles for the tablet title bar. */
const PANEL_TITLES: Record<string, string> = {
  plan: 'Flight Plan', places: 'Places', instruments: 'Instruments', sessions: 'Sessions', tilesets: 'Offline Maps',
  settings: 'Settings', wind: 'Windreader', timeline: 'Timeline', checklists: 'Checklists', wx: 'Weather & Airports',
  waypoints: 'Waypoints', routes: 'Routes',
}

export function AppShell() {
  const [activeTab, setActiveTab] = useState<NavTab>('map')
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreView, setMoreView] = useState<MoreView | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const layout = useResponsiveLayout()
  const { mode: panelMode, setMode: setPanelMode } = usePanelStore()
  const { sessionStatus } = useSessionStore()
  const { showInstrumentStrip } = useMapSettingsStore()
  const flightMode = useFlightModeStore(s => s.mode)
  // Tablet: an open session's map replaces the live map in the map area
  const replayScreen = useReplayScreen()

  // Wind tab is LTA-only and Routes is powered-only — leave a tab that the
  // new mode doesn't have
  useEffect(() => {
    if ((flightMode !== 'lta' && activeTab === 'wind') || (flightMode === 'lta' && activeTab === 'routes')) {
      setActiveTab('map')
    }
  }, [flightMode, activeTab])

  // Start GPS on mount
  useGPS()
  useIOSScrollReset()

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

  function closePanel() {
    setMoreOpen(false)
    setMoreView(null)
    setPanelOpen(false)
    setActiveTab('map')
  }

  function getPanelContent() {
    if (moreView === 'plan') return <PlanPage />
    if (moreView === 'places') return <PlacesPage />
    if (moreView === 'instruments') return <InstrumentsPage />
    if (moreView === 'sessions') return <SessionsPage />
    if (moreView === 'tilesets') return <TilesetsPage />
    if (moreView === 'settings') return <SettingsPage />

    switch (activeTab) {
      case 'wind': return flightMode === 'lta' ? <WindreaderPage /> : null
      case 'timeline': return <TimelinePage />
      case 'checklists': return <ChecklistsPage />
      case 'wx': return <WxPage />
      case 'waypoints': return <WaypointsPage />
      case 'routes': return flightMode === 'powered' ? <RoutesPage /> : null
      default: return null
    }
  }

  const panelContent = getPanelContent()
  const isPanelTab = activeTab !== 'map' || moreView !== null
  const effectivePanelOpen = layout === 'phone' ? isPanelTab : panelOpen

  // The instrument ribbon belongs to the flying map: shown only while the map is
  // on screen (no section, or a tablet split), and in a landscape split it spans
  // the map column only.
  const sectionOpen = effectivePanelOpen && panelContent !== null
  const sectionFull = sectionOpen && (layout === 'phone' || panelMode === 'full')
  const stripVisible = showInstrumentStrip && !sectionFull
  const stripRight = layout === 'tablet-landscape' && sectionOpen && !sectionFull ? `calc(${theme.safeRight} + (100vw - ${theme.safeLeft} - ${theme.safeRight}) / 2)` : undefined

  return (
    <>
      {stripVisible && <InstrumentStrip right={stripRight} />}

      <PanelLayout
        layout={layout}
        mapContent={
          <>
            {/* Live map stays mounted under the replay screen */}
            <MapPage showControls={!replayScreen && !sectionFull} />
            {replayScreen && <ReplayScreen />}
          </>
        }
        panelContent={panelContent}
        panelOpen={effectivePanelOpen}
        panelMode={panelMode}
        panelTitle={PANEL_TITLES[moreView ?? activeTab] ?? ''}
        onSetPanelMode={setPanelMode}
        onClosePanel={closePanel}
        mapTopInset={stripVisible ? theme.stripHeight : '0px'}
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

      <PendingPlaceForm />
      <RouteBanner stripVisible={stripVisible} />
      <UpdateBanner />
      <Disclaimer />
    </>
  )
}
