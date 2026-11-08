import type { ReactNode } from 'react'
import { theme } from '../theme'
import type { LayoutMode } from '../hooks/useResponsiveLayout'
import type { PanelMode } from '../../state/panel-store'
import { PanelTitleBarContext } from './panel-title-context'

interface PanelLayoutProps {
  layout: LayoutMode
  mapContent: ReactNode
  panelContent: ReactNode | null
  panelOpen: boolean
  /** Tablet only: beside the map, or over the whole screen. */
  panelMode: PanelMode
  panelTitle: string
  onSetPanelMode: (m: PanelMode) => void
  /** Close the section and return to the full map. */
  onClosePanel: () => void
  /** Height of the instrument ribbon above the map ('0px' when hidden). */
  mapTopInset: string
}

const barBtn: React.CSSProperties = {
  minWidth: theme.tapTarget, minHeight: theme.tapTarget, padding: '0 12px',
  background: 'none', border: `1px solid ${theme.colors.darkBorder}`, borderRadius: '8px',
  color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.small,
  display: 'flex', alignItems: 'center', gap: '6px',
}

/** Tablet section title bar: split ⇄ full screen, and close back to the map. */
function PanelBar({ title, mode, onSetMode, onClose }: { title: string; mode: PanelMode; onSetMode: (m: PanelMode) => void; onClose: () => void }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px 6px 14px', flexShrink: 0,
      background: theme.colors.navBg, borderBottom: `1px solid ${theme.colors.darkBorder}`, fontFamily: theme.font.primary,
    }}>
      <span style={{ flex: 1, minWidth: 0, color: theme.colors.cream, fontSize: theme.size.body, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
      {mode === 'split' ? (
        <button onClick={() => onSetMode('full')} style={barBtn} title="Full screen" aria-label="Full screen"><span style={{ fontSize: '16px' }}>⤢</span> Full</button>
      ) : (
        <button onClick={() => onSetMode('split')} style={barBtn} title="Split with map" aria-label="Split with map"><span style={{ fontSize: '16px' }}>◧</span> Split</button>
      )}
      <button onClick={onClose} style={{ ...barBtn, padding: 0, justifyContent: 'center', fontSize: theme.size.body }} title="Back to map" aria-label="Close — back to map">✕</button>
    </div>
  )
}

export function PanelLayout({ layout, mapContent, panelContent, panelOpen, panelMode, panelTitle, onSetPanelMode, onClosePanel, mapTopInset }: PanelLayoutProps) {
  // Sections start at the top of the screen; only the map sits below the ribbon
  const top = 'env(safe-area-inset-top, 0px)'
  const bottom = theme.aboveNav
  const hasPanel = panelOpen && panelContent !== null

  // ── Phone ────────────────────────────────────────────────────────────────
  // Map stays mounted beneath; panel overlays it when open.
  if (layout === 'phone') {
    return (
      <div style={{ position: 'fixed', top, bottom, left: theme.safeLeft, right: theme.safeRight }}>
        {/* Map always mounted so Leaflet isn't destroyed on tab switch */}
        <div style={{ position: 'absolute', top: mapTopInset, left: 0, right: 0, bottom: 0 }}>
          {mapContent}
        </div>
        {hasPanel && (
          <div style={{
            position: 'absolute', inset: 0,
            overflow: 'auto',
            background: theme.colors.dark,
            zIndex: 10,
          }}>
            {panelContent}
          </div>
        )}
      </div>
    )
  }

  // ── Tablet ───────────────────────────────────────────────────────────────
  // Split: map and section share the screen 50/50 (Garmin Pilot style),
  // side by side in landscape, stacked in portrait.
  // Full: the panel covers the map, which stays mounted (and sized) beneath.
  const portrait = layout === 'tablet-portrait'
  const full = hasPanel && panelMode === 'full'
  const panelStyle: React.CSSProperties = full
    ? { position: 'absolute', inset: 0, zIndex: 10 }
    : portrait
      ? { flex: '0 0 50%', borderTop: `1px solid ${theme.colors.darkBorder}` }
      : { width: '50%', flexShrink: 0, borderLeft: `1px solid ${theme.colors.darkBorder}` }

  return (
    <div style={{
      position: 'fixed', top, bottom, left: theme.safeLeft, right: theme.safeRight,
      display: 'flex', flexDirection: portrait ? 'column' : 'row',
    }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden', visibility: full ? 'hidden' : 'visible' }}>
        <div style={{ position: 'absolute', top: mapTopInset, left: 0, right: 0, bottom: 0 }}>
          {mapContent}
        </div>
      </div>
      {hasPanel && (
        <div style={{ ...panelStyle, display: 'flex', flexDirection: 'column', background: theme.colors.dark, minHeight: 0 }}>
          <PanelBar title={panelTitle} mode={panelMode} onSetMode={onSetPanelMode} onClose={onClosePanel} />
          <div style={{ flex: 1, overflow: 'auto', minHeight: 0 }}>
            <PanelTitleBarContext.Provider value={true}>{panelContent}</PanelTitleBarContext.Provider>
          </div>
        </div>
      )}
    </div>
  )
}
