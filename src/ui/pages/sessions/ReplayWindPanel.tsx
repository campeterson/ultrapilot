import { useState } from 'react'
import { theme } from '../../theme'
import { useReplayStore } from '../../../state/replay-store'
import { useReplayWindBands } from '../../hooks/useReplayWindBands'
import { WindreaderTable } from '../windreader/WindreaderTable'

/** Windreader for an LTA replay, floated over whichever map is playing it.
 *  Replaying: bands seen so far around the replay altitude.
 *  Not replaying: the whole flight's wind profile. */
export function ReplayWindPanel({ top = '8px', left = '8px' }: { top?: string; left?: string }) {
  const wind = useReplayWindBands()
  const active = useReplayStore(s => s.active)
  const [open, setOpen] = useState(true)
  if (!wind || wind.bands.length === 0) return null

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        aria-label="Show Windreader"
        style={{
          position: 'absolute', top, left, zIndex: 50,
          width: theme.tapTarget, height: theme.tapTarget, borderRadius: '50%',
          border: `1px solid ${theme.colors.darkBorder}`, background: 'rgba(14, 14, 20, 0.88)',
          color: theme.colors.cream, fontSize: '18px', cursor: 'pointer',
        }}
      >
        ≋
      </button>
    )
  }

  return (
    <div style={{
      position: 'absolute', top, left, zIndex: 50, width: '210px',
      maxHeight: `calc(100% - ${top} - 16px)`, overflowY: 'auto',
      background: 'rgba(14, 14, 20, 0.88)', border: `1px solid ${theme.colors.darkBorder}`,
      borderRadius: '10px', backdropFilter: 'blur(6px)',
    }}>
      <button
        onClick={() => setOpen(false)}
        style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%',
          padding: '6px 10px', background: 'none', border: 'none', cursor: 'pointer',
          color: theme.colors.light, fontFamily: theme.font.primary, fontSize: theme.size.tiny,
          letterSpacing: '0.08em', minHeight: theme.tapTarget,
        }}
      >
        <span>{active ? 'WINDREADER · REPLAY' : 'FLIGHT WINDS'}</span><span style={{ color: theme.colors.dim }}>✕</span>
      </button>
      <WindreaderTable bands={wind.bands} compact maxRows={active ? 7 : undefined} nowTs={wind.nowTs} />
    </div>
  )
}
