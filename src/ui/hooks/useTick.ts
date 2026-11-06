import { useEffect, useState } from 'react'

/** Re-render every `ms` (setInterval, not rAF — keeps running in background tabs). Returns Date.now(). */
export function useTick(ms = 1000): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(id)
  }, [ms])
  return now
}
