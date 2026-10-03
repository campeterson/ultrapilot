import { theme } from '../../theme'
import { useReplayStore } from '../../../state/replay-store'
import { SessionMap } from './SessionMap'

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
}

/** Tablet: the open session's map, shown in the map area in place of the live
 *  map. Its own MapLibre instance — the live map is untouched underneath.
 *  Controls, readouts and stamps stay in the side panel. */
export function ReplayScreen() {
  const session = useReplayStore(s => s.session)
  const events = useReplayStore(s => s.events)
  const loading = useReplayStore(s => s.loading)
  if (!session) return null

  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 40, background: theme.colors.dark }}>
      {!loading && <SessionMap session={session} events={events} />}
      <div style={{
        position: 'absolute', bottom: '12px', left: '12px', zIndex: 5, pointerEvents: 'none',
        background: 'rgba(14, 14, 20, 0.88)', border: `1px solid ${theme.colors.darkBorder}`,
        borderRadius: '8px', padding: '6px 10px', fontFamily: theme.font.primary,
        fontSize: theme.size.tiny, letterSpacing: '0.08em', color: theme.colors.light,
      }}>
        SESSION · {formatDate(session.startTime).toUpperCase()}
      </div>
    </div>
  )
}
