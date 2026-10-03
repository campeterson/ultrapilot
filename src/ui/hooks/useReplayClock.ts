import { useEffect } from 'react'
import { useReplayStore } from '../../state/replay-store'

/** ~20 fps is smooth enough for a moving marker and keeps older iPhones cool
 *  (each tick re-renders the trail and readouts). */
const FRAME_MS = 50

/** Drives the replay clock with requestAnimationFrame while playing. */
export function useReplayClock() {
  const playing = useReplayStore(s => s.playing)

  useEffect(() => {
    if (!playing) return
    let raf = 0
    let last = performance.now()
    let acc = 0
    const loop = (now: number) => {
      acc += now - last
      last = now
      if (acc >= FRAME_MS) {
        useReplayStore.getState().tick(acc)
        acc = 0
      }
      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [playing])
}
