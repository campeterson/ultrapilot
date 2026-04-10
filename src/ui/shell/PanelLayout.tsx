import type { ReactNode } from 'react'
import { theme } from '../theme'
import type { LayoutMode } from '../hooks/useResponsiveLayout'

interface PanelLayoutProps {
  layout: LayoutMode
  mapContent: ReactNode
  panelContent: ReactNode | null  // null = no panel open
  onTogglePanel?: () => void
  panelOpen: boolean
}

export function PanelLayout({ layout, mapContent, panelContent, panelOpen, onTogglePanel }: PanelLayoutProps) {
  const topOffset = theme.stripHeight
  const bottomOffset = theme.navHeight

  if (layout === 'phone') {
    return (
      <div style={{ position: 'fixed', top: topOffset, bottom: bottomOffset, left: 0, right: 0 }}>
        {panelOpen && panelContent ? (
          <div style={{ height: '100%', overflow: 'auto', background: theme.colors.dark }}>
            {panelContent}
          </div>
        ) : (
          mapContent
        )}
      </div>
    )
  }

  if (layout === 'tablet-portrait') {
    const mapH = panelOpen ? '52%' : '100%'
    const panelH = '48%'
    return (
      <div style={{ position: 'fixed', top: topOffset, bottom: bottomOffset, left: 0, right: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ height: mapH, position: 'relative', transition: 'height 0.25s ease' }}>
          {mapContent}
          {/* Chevron toggle */}
          <button
            onClick={onTogglePanel}
            style={{
              position: 'absolute',
              bottom: 0,
              left: '50%',
              transform: 'translateX(-50%)',
              background: theme.colors.darkCard,
              border: `1px solid ${theme.colors.darkBorder}`,
              borderRadius: '8px 8px 0 0',
              color: theme.colors.light,
              padding: '4px 20px',
              cursor: 'pointer',
              zIndex: 50,
              fontFamily: theme.font.primary,
              minWidth: '80px',
              minHeight: '28px',
            }}
          >
            {panelOpen ? '˄' : '˅'}
          </button>
        </div>
        {panelOpen && panelContent && (
          <div style={{ height: panelH, overflow: 'auto', background: theme.colors.dark, borderTop: `1px solid ${theme.colors.darkBorder}` }}>
            {panelContent}
          </div>
        )}
      </div>
    )
  }

  // tablet-landscape
  const panelWidth = '310px'
  return (
    <div style={{ position: 'fixed', top: topOffset, bottom: bottomOffset, left: 0, right: 0, display: 'flex' }}>
      <div style={{ flex: 1, position: 'relative' }}>
        {mapContent}
        {/* Chevron toggle */}
        <button
          onClick={onTogglePanel}
          style={{
            position: 'absolute',
            top: '50%',
            right: 0,
            transform: 'translateY(-50%)',
            background: theme.colors.darkCard,
            border: `1px solid ${theme.colors.darkBorder}`,
            borderRadius: '8px 0 0 8px',
            color: theme.colors.light,
            padding: '16px 6px',
            cursor: 'pointer',
            zIndex: 50,
            fontFamily: theme.font.primary,
            minWidth: '24px',
            minHeight: '60px',
          }}
        >
          {panelOpen ? '›' : '‹'}
        </button>
      </div>
      {panelOpen && panelContent && (
        <div style={{ width: panelWidth, overflow: 'auto', background: theme.colors.dark, borderLeft: `1px solid ${theme.colors.darkBorder}` }}>
          {panelContent}
        </div>
      )}
    </div>
  )
}
