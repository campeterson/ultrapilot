import { useEffect, useRef } from 'react'

/** Acquire a screen wake lock while `active` is true.
 *  Automatically re-acquires after visibility change. */
export function useWakeLock(active: boolean) {
  const lockRef = useRef<WakeLockSentinel | null>(null)

  async function acquire() {
    if (!('wakeLock' in navigator)) return
    try {
      lockRef.current = await navigator.wakeLock.request('screen')
    } catch {
      // Silently fail — wake lock is best-effort
    }
  }

  function release() {
    lockRef.current?.release().catch(() => {})
    lockRef.current = null
  }

  useEffect(() => {
    if (!active) {
      release()
      return
    }

    acquire()

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active) acquire()
    }
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      release()
    }
  }, [active])
}
