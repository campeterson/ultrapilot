import { useEffect, useRef } from 'react'
import { theme } from '../theme'

export type MoreView = 'instruments' | 'settings'

interface MorePickerProps {
  visible: boolean
  onSelect: (view: MoreView) => void
  onDismiss: () => void
}

const MORE_ITEMS: { id: MoreView; label: string; icon: string }[] = [
  { id: 'instruments', label: 'Instruments', icon: '◈' },
  { id: 'settings', label: 'Settings', icon: '⚙' },
]

export function MorePicker({ visible, onSelect, onDismiss }: MorePickerProps) {
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
        bottom: `calc(${theme.navHeight} + 8px)`,
        right: '8px',
        background: theme.colors.darkCard,
        border: `1px solid ${theme.colors.darkBorder}`,
        borderRadius: '10px',
        overflow: 'hidden',
        zIndex: 300,
        minWidth: '180px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
      }}
    >
      {MORE_ITEMS.map(item => (
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
            color: theme.colors.cream,
            cursor: 'pointer',
            fontFamily: theme.font.primary,
            fontSize: theme.size.body,
            minHeight: theme.tapTarget,
            textAlign: 'left',
          }}
        >
          <span style={{ fontSize: '18px', width: '24px', textAlign: 'center' }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}
