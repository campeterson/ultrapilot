import { theme } from '../theme'
import { useFlightModeStore } from '../../state/flight-mode-store'
import type { FlightMode } from '../../data/models'

export type NavTab = 'map' | 'wind' | 'timeline' | 'checklists' | 'wx' | 'waypoints' | 'routes' | 'more'

interface NavBarProps {
  active: NavTab
  onSelect: (tab: NavTab) => void
}

const TABS: { id: NavTab; label: string; icon: string; modes?: FlightMode[] }[] = [
  { id: 'map', label: 'Map', icon: '◎' },
  { id: 'wind', label: 'Wind', icon: '≋', modes: ['lta'] },
  { id: 'timeline', label: 'Timeline', icon: '◷' },
  { id: 'checklists', label: 'Lists', icon: '☑' },
  { id: 'wx', label: 'Wx/Apt', icon: '⛅' },
  { id: 'waypoints', label: 'Wpts', icon: '⌖' },
  { id: 'routes', label: 'Routes', icon: '✈', modes: ['powered'] },
  { id: 'more', label: 'More', icon: '⋯' },
]

export function NavBar({ active, onSelect }: NavBarProps) {
  const mode = useFlightModeStore(s => s.mode)
  const tabs = TABS.filter(t => !t.modes || t.modes.includes(mode))
  return (
    <nav
      style={{
        position: 'fixed',
        bottom: 0,
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
      {tabs.map(tab => {
        const isActive = active === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onSelect(tab.id)}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              color: isActive ? theme.colors.red : theme.colors.light,
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '3px',
              minHeight: theme.tapTarget,
              fontFamily: theme.font.primary,
              transition: 'color 0.15s',
            }}
          >
            <span style={{ fontSize: '18px', lineHeight: 1 }}>{tab.icon}</span>
            <span style={{ fontSize: theme.size.tiny, letterSpacing: '0.03em' }}>{tab.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
