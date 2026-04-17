import { useEffect, useState } from 'react'
import { registerSW } from 'virtual:pwa-register'
import { theme } from '../theme'

export function UpdateBanner() {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [updateSW, setUpdateSW] = useState<(() => Promise<void>) | null>(null)

  useEffect(() => {
    const update = registerSW({
      onNeedRefresh() { setNeedRefresh(true) },
    })
    setUpdateSW(() => () => update(true))
  }, [])

  if (!needRefresh) return null

  return (
    <div
      style={{
        position: 'fixed',
        left: '12px',
        right: '12px',
        bottom: `calc(12px + env(safe-area-inset-bottom, 0px))`,
        background: theme.colors.darkCard,
        border: `1px solid ${theme.colors.red}`,
        borderRadius: '12px',
        padding: '12px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        color: theme.colors.cream,
        fontFamily: theme.font.primary,
        fontSize: theme.size.small,
        boxShadow: '0 6px 20px rgba(0,0,0,0.4)',
        zIndex: 3000,
        maxWidth: '520px',
        marginLeft: 'auto',
        marginRight: 'auto',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        A new version of UltraPilot is available.
      </div>
      <button
        onClick={() => setNeedRefresh(false)}
        style={{
          background: 'none',
          border: `1px solid ${theme.colors.darkBorder}`,
          color: theme.colors.light,
          padding: '8px 10px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontFamily: theme.font.primary,
          fontSize: theme.size.small,
          minHeight: theme.tapTarget,
        }}
      >
        Later
      </button>
      <button
        onClick={() => updateSW?.()}
        style={{
          background: theme.colors.red,
          border: 'none',
          color: '#fff',
          padding: '8px 14px',
          borderRadius: '8px',
          cursor: 'pointer',
          fontWeight: 700,
          fontFamily: theme.font.primary,
          fontSize: theme.size.small,
          minHeight: theme.tapTarget,
        }}
      >
        Refresh
      </button>
    </div>
  )
}
