import { useState, useEffect, useRef } from 'react'
import { NavBar, type NavActive } from './NavBar'
import { MorePicker } from './MorePicker'
import { useNavStore } from '../../state/nav-store'
import { isAvailable, sectionInfo, splitNav, type NavSection } from '../../data/logic/nav-logic'
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
import { LiveGroupPage } from '../pages/live/LiveGroupPage'
import { useLiveGroupRuntime } from '../hooks/useLiveGroupRuntime'
import { useLiveGroupStore } from '../../state/live-group-store'
import { ReplayScreen } from '../pages/sessions/ReplayScreen'
import { useReplayScreen } from '../hooks/useReplayScreen'

export function AppShell() {
  /** The open section, or null for the full-screen map. */
  const [section, setSection] = useState<NavSection | null>(null)
  const [moreOpen, setMoreOpen] = useState(false)
  const [panelOpen, setPanelOpen] = useState(false)

  const layout = useResponsiveLayout()
  const { mode: panelMode, setMode: setPanelMode } = usePanelStore()
  const { sessionStatus } = useSessionStore()
  const { showInstrumentStrip } = useMapSettingsStore()
  const flightMode = useFlightModeStore(s => s.mode)
  // Tablet: an open session's map replaces the live map in the map area
  const replayScreen = useReplayScreen()

  // Bottom bar: Map, then the first four sections in the user's order, then More
  const navOrder = useNavStore(s => s.order)
  const { bar, more } = splitNav(navOrder, flightMode)

  // Wind is LTA-only and Routes is powered-only — leave a section that the
  // new mode doesn't have
  useEffect(() => {
    if (section && !isAvailable(section, flightMode)) setSection(null)
  }, [flightMode, section])

  // Start GPS on mount
  useGPS()
  useIOSScrollReset()

  // Register downloaded offline tilesets with the PMTiles protocol so the map
  // can render pmtiles://<id> sources. Idempotent — the store guards on init.
  useEffect(() => { useTilesetsStore.getState().init() }, [])

  // Keep screen awake during active sessions
  // …and while sharing a live position (the page must stay open and visible)
  const liveSharing = useLiveGroupStore(s => s.sharing)
  useWakeLock(sessionStatus === 'active' || liveSharing)

  // Live Group: resume, visibility, and invite links (#live=…) open the section
  useLiveGroupRuntime(() => {
    setMoreOpen(false)
    setSection('live')
    setPanelOpen(true)
  })

  // When a session ends: reset ephemeral flight state and open the sessions
  // view on the just-ended session (SessionsPage reads justEndedSessionId from
  // the store and auto-selects it).
  const prevStatus = useRef(sessionStatus)
  useEffect(() => {
    if (prevStatus.current === 'active' && sessionStatus === 'idle') {
      setMoreOpen(false)
      setSection('sessions')
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

  function openSection(id: NavSection) {
    setMoreOpen(false)
    setSection(id)
    trackEvent(`panel_${id}`)
    if (layout !== 'phone') setPanelOpen(true)
  }

  function closePanel() {
    setMoreOpen(false)
    setSection(null)
    setPanelOpen(false)
  }

  function getPanelContent() {
    switch (section) {
      case 'wind': return flightMode === 'lta' ? <WindreaderPage /> : null
      case 'timeline': return <TimelinePage />
      case 'checklists': return <ChecklistsPage />
      case 'wx': return <WxPage />
      case 'waypoints': return <WaypointsPage />
      case 'routes': return flightMode === 'powered' ? <RoutesPage /> : null
      case 'plan': return <PlanPage />
      case 'places': return <PlacesPage />
      case 'live': return <LiveGroupPage />
      case 'instruments': return <InstrumentsPage />
      case 'sessions': return <SessionsPage />
      case 'tilesets': return <TilesetsPage />
      case 'settings': return <SettingsPage />
      default: return null
    }
  }

  const panelContent = getPanelContent()
  const effectivePanelOpen = layout === 'phone' ? section !== null : panelOpen
  // The bar highlights Map, a bar section, or More for a section kept there
  const navActive: NavActive = !section || !effectivePanelOpen ? 'map' : bar.includes(section) ? section : 'more'

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
        panelTitle={section ? sectionInfo(section).title : ''}
        onSetPanelMode={setPanelMode}
        onClosePanel={closePanel}
        mapTopInset={stripVisible ? theme.stripHeight : '0px'}
      />

      <NavBar
        bar={bar}
        active={moreOpen ? 'more' : navActive}
        onMap={closePanel}
        onSection={openSection}
        onMore={() => setMoreOpen(v => !v)}
      />

      <MorePicker
        visible={moreOpen}
        items={more}
        active={section}
        onSelect={openSection}
        onDismiss={() => setMoreOpen(false)}
      />

      <PendingPlaceForm />
      <RouteBanner stripVisible={stripVisible} />
      <UpdateBanner />
      <Disclaimer />
    </>
  )
}
