import { useState, useEffect, useRef } from 'react'

/** Returns elapsed milliseconds since `startMs`, updating every `intervalMs`.
 *  Returns 0 if `startMs` is null (not yet started). */
export function useTimer(startMs: number | null, intervalMs = 1000): number {
  const [elapsed, setElapsed] = useState(startMs !== null ? Date.now() - startMs : 0)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (startMs === null) {
      setElapsed(0)
      return
    }

    setElapsed(Date.now() - startMs)

    intervalRef.current = setInterval(() => {
      setElapsed(Date.now() - startMs)
    }, intervalMs)

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current)
    }
  }, [startMs, intervalMs])

  return elapsed
}
