import { theme } from '../theme'
import type { KeepAwakeState } from '../hooks/useKeepAwake'

/** Shown only when the phone refused to stay awake; a tap (anywhere) retries with a user gesture. */
export function KeepAwakeBanner({ state, onRetry, top }: { state: KeepAwakeState; onRetry: () => void; top: string }) {
  if (state !== 'needs-tap') return null
  return (
    <button
      onClick={onRetry}
      style={{
        position: 'fixed', top, left: '50%', transform: 'translateX(-50%)', zIndex: 160,
        minHeight: theme.tapTarget, padding: '8px 16px', borderRadius: '22px',
        background: theme.colors.stripBg, border: `1px solid ${theme.colors.amber}`, color: theme.colors.amber,
        fontFamily: theme.font.primary, fontSize: theme.size.small, cursor: 'pointer', whiteSpace: 'nowrap',
        boxShadow: '0 2px 12px rgba(0,0,0,0.5)',
      }}
    >
      ☾ Screen may sleep — tap to keep awake
    </button>
  )
}
