import { useState } from 'react'
import { NavBar, type NavTab } from './NavBar'
import { MorePicker, type MoreView } from './MorePicker'
import { InstrumentStrip } from './InstrumentStrip'
import { PanelLayout } from './PanelLayout'
import { useResponsiveLayout } from '../hooks/useResponsiveLayout'
import { useGPS } from '../hooks/useGPS'
import { useWakeLock } from '../hooks/useWakeLock'
import { useSessionStore } from '../../state/session-store'
import { MapPage } from '../pages/map/MapPage'
import { TimelinePage } from '../pages/timeline/TimelinePage'
import { ChecklistsPage } from '../pages/checklists/ChecklistsPage'
import { WxPage } from '../pages/weather/WxPage'
import { InstrumentsPage } from '../pages/instruments/InstrumentsPage'
import { SettingsPage } from '../pages/settings/SettingsPage'

export function AppShell() {
  const [activeTab, setActiveTab] = useState<NavTab>('map')
  const [moreOpen, setMoreOpen] = useState(false)
  const [moreView, setMoreView] = useState<MoreView | null>(null)
  const [panelOpen, setPanelOpen] = useState(false)

  const layout = useResponsiveLayout()
  const { sessionStatus } = useSessionStore()

  // Start GPS on mount
  useGPS()

  // Keep screen awake during active sessions
  useWakeLock(sessionStatus === 'active')

  function handleTabSelect(tab: NavTab) {
    if (tab === 'more') {
      setMoreOpen(v => !v)
      return
    }
    setMoreOpen(false)
    setMoreView(null)

    if (tab === 'map') {
      // Map tab always collapses panel
      setPanelOpen(false)
      setActiveTab('map')
    } else {
      setActiveTab(tab)
      // On phone, switching to a non-map tab shows the panel content fullscreen
      // On tablet, open the panel if not already open
      if (layout !== 'phone') {
        setPanelOpen(true)
      }
    }
  }

  function handleMoreSelect(view: MoreView) {
    setMoreOpen(false)
    setMoreView(view)
    if (layout !== 'phone') setPanelOpen(true)
  }

  function getPanelContent() {
    if (moreView === 'instruments') return <InstrumentsPage />
    if (moreView === 'settings') return <SettingsPage />

    switch (activeTab) {
      case 'timeline': return <TimelinePage />
      case 'checklists': return <ChecklistsPage />
      case 'wx': return <WxPage />
      default: return null
    }
  }

  const panelContent = getPanelContent()
  const isPanelTab = activeTab !== 'map' || moreView !== null
  const effectivePanelOpen = layout === 'phone' ? isPanelTab : panelOpen

  return (
    <>
      <InstrumentStrip />

      <PanelLayout
        layout={layout}
        mapContent={<MapPage />}
        panelContent={panelContent}
        panelOpen={effectivePanelOpen}
        onTogglePanel={() => setPanelOpen(v => !v)}
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
    </>
  )
}
