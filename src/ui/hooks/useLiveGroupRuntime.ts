import { useEffect } from 'react'
import { useLiveGroupStore } from '../../state/live-group-store'
import { parseInvite } from '../../data/logic/live-logic'

/**
 * Live Group plumbing that needs the browser: resume the saved group, report
 * page visibility (poll rate), and pick up an invite from the URL fragment —
 * removing it from the address bar so the secret isn't left on screen.
 * Calls `onInvite` so the shell can open the Live Group section.
 */
export function useLiveGroupRuntime(onInvite: () => void) {
  useEffect(() => {
    const store = useLiveGroupStore.getState()
    void store.init()

    const secret = parseInvite(window.location.hash)
    if (secret) {
      history.replaceState(null, '', window.location.pathname + window.location.search)
      store.setPendingInvite(secret)
      onInvite()
    }

    const onVis = () => useLiveGroupStore.getState().setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
