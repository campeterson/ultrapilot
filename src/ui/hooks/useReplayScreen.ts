import { useResponsiveLayout } from './useResponsiveLayout'
import { useSessionStore } from '../../state/session-store'
import { useReplayStore } from '../../state/replay-store'

/** On tablets, an open session's replay gets its own screen in the map area
 *  (over the live map, which stays mounted underneath) and the side panel keeps
 *  the controls. Phones show the main map behind the panel, so they keep the
 *  session detail's inline map. Never while a live session records. */
export function useReplayScreen(): boolean {
  const layout = useResponsiveLayout()
  const recording = useSessionStore(s => s.sessionStatus === 'active')
  const replaySessionId = useReplayStore(s => s.sessionId)
  return layout !== 'phone' && !recording && !!replaySessionId
}
