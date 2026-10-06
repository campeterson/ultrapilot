import { theme } from '../../theme'
import { useReplayStore } from '../../../state/replay-store'
import { useReplayClock } from '../../hooks/useReplayClock'
import { frameAt, nextReplaySpeed } from '../../../data/logic/replay-logic'
import { formatDeg } from '../../../data/logic/gps-logic'
import { altitudeText, speedText, verticalSpeedText } from '../../../data/logic/units-logic'
import { useUnits } from '../../hooks/useUnits'

function formatClock(ts: number): string {
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
}

function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}` : `${m}:${String(sec).padStart(2, '0')}`
}

const ctrlBtn: React.CSSProperties = {
  minWidth: theme.tapTarget, height: theme.tapTarget, borderRadius: '8px',
  border: `1px solid ${theme.colors.darkBorder}`, background: theme.colors.darkCard,
  color: theme.colors.cream, cursor: 'pointer', fontFamily: theme.font.primary,
  fontSize: theme.size.small, flexShrink: 0, padding: '0 8px',
}

/** Live readouts while a replay is active (replaces the summary cards). */
export function ReplayReadouts() {
  const track = useReplayStore(s => s.track)
  const t = useReplayStore(s => s.t)
  const originAlt = useReplayStore(s => s.originAltMSL)
  const units = useUnits()
  if (!track) return null
  const f = frameAt(track, t, originAlt)

  const cells = [
    { label: 'TIME', value: formatClock(f.ts) },
    { label: 'GND SPD', value: speedText(f.gsKts, units.speed) },
    { label: 'TRACK', value: formatDeg(f.trackDeg) },
    { label: 'MSL', value: altitudeText(f.altMSLft, units.altitude) },
    { label: 'AGL', value: altitudeText(f.aglFt, units.altitude) },
    { label: 'V/S', value: verticalSpeedText(f.vsFpm, units.vertical) },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px', padding: '8px 12px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
      {cells.map(c => (
        <div key={c.label} style={{ background: theme.colors.darkCard, borderRadius: '8px', padding: '6px 4px', textAlign: 'center' }}>
          <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, letterSpacing: '0.06em' }}>{c.label}</div>
          <div style={{ fontSize: '15px', color: theme.colors.cream, fontFamily: theme.font.mono, fontWeight: 700 }}>{c.value}</div>
        </div>
      ))}
    </div>
  )
}

/** Play/pause, scrub and speed controls. */
export function ReplayBar() {
  useReplayClock()
  const { track, t, playing, active, speed, play, pause, stop, seek, setSpeed } = useReplayStore()
  if (!track) return null

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 12px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
      <button
        onClick={playing ? pause : play}
        aria-label={playing ? 'Pause replay' : 'Play replay'}
        style={{ ...ctrlBtn, background: theme.colors.red, border: 'none', color: '#fff', fontSize: '16px' }}
      >
        {playing ? '❚❚' : '▶'}
      </button>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
        <input
          type="range"
          min={track.startTs}
          max={track.endTs}
          step={1000}
          value={t}
          onChange={e => seek(Number(e.target.value))}
          aria-label="Replay position"
          style={{ width: '100%', height: theme.tapTarget, accentColor: theme.colors.red, margin: 0 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: theme.size.tiny, color: theme.colors.dim, fontFamily: theme.font.mono, marginTop: '-10px' }}>
          <span>{formatElapsed(t - track.startTs)}</span>
          <span>{formatElapsed(track.endTs - track.startTs)}</span>
        </div>
      </div>
      <button onClick={() => setSpeed(nextReplaySpeed(speed))} aria-label="Replay speed" style={{ ...ctrlBtn, fontFamily: theme.font.mono }}>
        {speed}×
      </button>
      {active && (
        <button onClick={stop} aria-label="Stop replay" style={{ ...ctrlBtn, color: theme.colors.dim }}>✕</button>
      )}
    </div>
  )
}
