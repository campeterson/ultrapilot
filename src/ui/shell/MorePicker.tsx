import { useEffect, useRef } from 'react'
import { theme } from '../theme'
import { sectionInfo, type NavSection } from '../../data/logic/nav-logic'

interface MorePickerProps {
  visible: boolean
  /** Sections not on the bar, in the user's order. */
  items: NavSection[]
  active: NavSection | null
  onSelect: (id: NavSection) => void
  onDismiss: () => void
}

export function MorePicker({ visible, items, active, onSelect, onDismiss }: MorePickerProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!visible) return
    const handler = (e: MouseEvent | TouchEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onDismiss()
      }
    }
    document.addEventListener('mousedown', handler)
    document.addEventListener('touchstart', handler)
    return () => {
      document.removeEventListener('mousedown', handler)
      document.removeEventListener('touchstart', handler)
    }
  }, [visible, onDismiss])

  if (!visible) return null

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        bottom: `calc(${theme.safeNavHeight} + 8px)`,
        right: `calc(8px + ${theme.safeRight})`,
        background: theme.colors.darkCard,
        border: `1px solid ${theme.colors.darkBorder}`,
        borderRadius: '10px',
        overflowX: 'hidden',
        overflowY: 'auto',
        maxHeight: `calc(100vh - ${theme.safeNavHeight} - 24px - env(safe-area-inset-top, 0px))`,
        zIndex: 300,
        minWidth: '180px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
      }}
    >
      {items.map(id => sectionInfo(id)).map(item => (
        <button
          key={item.id}
          onClick={() => onSelect(item.id)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            width: '100%',
            padding: '14px 16px',
            background: 'none',
            border: 'none',
            borderBottom: `1px solid ${theme.colors.darkBorder}`,
            color: item.id === active ? theme.colors.red : theme.colors.cream,
            cursor: 'pointer',
            fontFamily: theme.font.primary,
            fontSize: theme.size.body,
            minHeight: theme.tapTarget,
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
          {item.title}
        </button>
      ))}
    </div>
  )
}
