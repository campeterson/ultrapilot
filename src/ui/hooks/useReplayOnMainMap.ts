import { useResponsiveLayout } from './useResponsiveLayout'
import { useSessionStore } from '../../state/session-store'
import { useReplayStore } from '../../state/replay-store'

/** On tablets the replay plays on the main map (where the selected session is
 *  already overlaid) and the panel keeps only the controls. Phones hide the
 *  main map behind the panel, so they keep the session detail's own map.
 *  Never during a live session — replay is disabled while recording. */
export function useReplayOnMainMap(): boolean {
  const layout = useResponsiveLayout()
  const liveSession = useSessionStore(s => s.session)
  const historySessionId = useSessionStore(s => s.historySessionId)
  const replaySessionId = useReplayStore(s => s.sessionId)
  return layout !== 'phone' && !liveSession && !!replaySessionId && replaySessionId === historySessionId
}
