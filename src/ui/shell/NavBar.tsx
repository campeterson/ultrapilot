import { theme } from '../theme'
import { sectionInfo, type NavSection } from '../../data/logic/nav-logic'

/** What the bar highlights: the map, a bar section, or More (for a More section). */
export type NavActive = 'map' | 'more' | NavSection

interface NavBarProps {
  /** Sections on the bar, in order (Map and More are added around them). */
  bar: NavSection[]
  active: NavActive
  onMap: () => void
  onSection: (id: NavSection) => void
  onMore: () => void
}

export function NavBar({ bar, active, onMap, onSection, onMore }: NavBarProps) {
  const buttons: { key: string; label: string; icon: string; on: boolean; onClick: () => void }[] = [
    { key: 'map', label: 'Map', icon: '◎', on: active === 'map', onClick: onMap },
    ...bar.map(id => {
      const s = sectionInfo(id)
      return { key: id, label: s.label, icon: s.icon, on: active === id, onClick: () => onSection(id) }
    }),
    { key: 'more', label: 'More', icon: '⋯', on: active === 'more', onClick: onMore },
  ]
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: theme.screenBottom,
        left: 0,
        right: 0,
        height: theme.safeNavHeight,
        background: theme.colors.navBg,
        borderTop: `1px solid ${theme.colors.darkBorder}`,
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 200,
        paddingBottom: 'env(safe-area-inset-bottom)',
        paddingLeft: theme.safeLeft,
        paddingRight: theme.safeRight,
      }}
    >
      {buttons.map(b => (
        <button
          key={b.key}
          onClick={b.onClick}
          style={{
            flex: 1,
            background: 'none',
            border: 'none',
            color: b.on ? theme.colors.red : theme.colors.light,
            cursor: 'pointer',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '3px',
            minHeight: theme.tapTarget,
            minWidth: 0,
            fontFamily: theme.font.primary,
            transition: 'color 0.15s',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>{b.icon}</span>
          <span style={{ fontSize: theme.size.tiny, letterSpacing: '0.03em' }}>{b.label}</span>
        </button>
      ))}
    </nav>
  )
}
