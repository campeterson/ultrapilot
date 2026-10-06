import { useMemo } from 'react'
import { useReplayStore } from '../../state/replay-store'
import { useWindBandFt } from './useUnits'
import { computeBands, samplesUpTo } from '../../data/logic/windreader-logic'
import { frameAt } from '../../data/logic/replay-logic'
import type { WindBand } from '../../data/models'

/** Windreader bands for the session being replayed.
 *  Active replay: only samples up to the replay time, tagged above/below the
 *  replay altitude. Not playing: the whole flight's wind profile (no "current").
 *  null when the session isn't an LTA flight. */
export function useReplayWindBands(): { bands: WindBand[]; nowTs: number } | null {
  const samples = useReplayStore(s => s.windSamples)
  const track = useReplayStore(s => s.track)
  const active = useReplayStore(s => s.active)
  const t = useReplayStore(s => s.t)
  const originAlt = useReplayStore(s => s.originAltMSL)
  const bandFt = useWindBandFt()

  return useMemo(() => {
    if (!samples || !track) return null
    if (!active) return { bands: computeBands(samples, bandFt, null), nowTs: track.endTs }
    const alt = frameAt(track, t, originAlt).altMSLft
    return { bands: computeBands(samplesUpTo(samples, t), bandFt, alt), nowTs: t }
  }, [samples, track, active, t, originAlt, bandFt])
}
