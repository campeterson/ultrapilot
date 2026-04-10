import type { ReactNode } from 'react'
import { theme } from '../theme'
import type { LayoutMode } from '../hooks/useResponsiveLayout'

interface PanelLayoutProps {
  layout: LayoutMode
  mapContent: ReactNode
  panelContent: ReactNode | null
  onTogglePanel?: () => void
  panelOpen: boolean
}

const chevronBase: React.CSSProperties = {
  background: theme.colors.darkCard,
  border: `1px solid ${theme.colors.darkBorder}`,
  color: theme.colors.light,
  cursor: 'pointer',
  fontFamily: theme.font.primary,
  position: 'absolute',
  zIndex: 50,
}

export function PanelLayout({ layout, mapContent, panelContent, panelOpen, onTogglePanel }: PanelLayoutProps) {
  const top = theme.safeStripHeight
  const bottom = theme.safeNavHeight
  const hasPanel = panelOpen && panelContent !== null

  // ── Phone ────────────────────────────────────────────────────────────────
  // Map stays mounted beneath; panel overlays it when open.
  if (layout === 'phone') {
    return (
      <div style={{ position: 'fixed', top, bottom, left: 0, right: 0 }}>
        {/* Map always mounted so Leaflet isn't destroyed on tab switch */}
        <div style={{ position: 'absolute', inset: 0 }}>
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

  // ── Tablet Portrait ───────────────────────────────────────────────────────
  // Map always in top portion; flex-basis drives the 52/48 split.
  if (layout === 'tablet-portrait') {
    return (
      <div style={{
        position: 'fixed', top, bottom, left: 0, right: 0,
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          flex: hasPanel ? '0 0 52%' : '1 1 100%',
          position: 'relative',
          overflow: 'hidden',
          transition: 'flex-basis 0.2s ease',
        }}>
          {mapContent}
          <button
            onClick={onTogglePanel}
            style={{
              ...chevronBase,
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              borderRadius: '8px 8px 0 0',
              padding: '4px 24px',
              minWidth: '80px',
              minHeight: '28px',
            }}
          >
            {hasPanel ? '˄' : '˅'}
          </button>
        </div>
        {hasPanel && (
          <div style={{
            flex: '0 0 48%',
            overflow: 'auto',
            background: theme.colors.dark,
            borderTop: `1px solid ${theme.colors.darkBorder}`,
          }}>
            {panelContent}
          </div>
        )}
      </div>
    )
  }

  // ── Tablet Landscape ──────────────────────────────────────────────────────
  // Map always on left; panel slides in from right.
  return (
    <div style={{
      position: 'fixed', top, bottom, left: 0, right: 0,
      display: 'flex',
    }}>
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {mapContent}
        <button
          onClick={onTogglePanel}
          style={{
            ...chevronBase,
            top: '50%',
            right: 0,
            transform: 'translateY(-50%)',
            borderRadius: '8px 0 0 8px',
            padding: '16px 6px',
            minWidth: '24px',
            minHeight: '60px',
          }}
        >
          {hasPanel ? '›' : '‹'}
        </button>
      </div>
      {hasPanel && (
        <div style={{
          width: '33.33%',
          flexShrink: 0,
          overflow: 'auto',
          background: theme.colors.dark,
          borderLeft: `1px solid ${theme.colors.darkBorder}`,
        }}>
          {panelContent}
        </div>
      )}
    </div>
  )
}
