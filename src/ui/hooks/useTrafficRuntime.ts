import { useEffect } from 'react'
import { useTrafficStore } from '../../state/traffic-store'

/** Traffic plumbing that needs the browser: start watching, and pause polling while the app is hidden. */
export function useTrafficRuntime() {
  useEffect(() => {
    useTrafficStore.getState().init()
    const onVis = () => useTrafficStore.getState().setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
}
