import { useMemo } from 'react'
import { useWindreaderStore } from '../../state/windreader-store'
import { useGPSStore } from '../../state/gps-store'
import { computeBands } from '../../data/logic/windreader-logic'
import { metersToFeet } from '../../data/logic/gps-logic'
import type { WindBand } from '../../data/models'

/** Averaged windreader bands, tagged above/current/below the live altitude. */
export function useWindBands(): { bands: WindBand[]; currentAltFt: number | null } {
  const samples = useWindreaderStore(s => s.samples)
  const bandFt = useWindreaderStore(s => s.bandFt)
  const altMSL = useGPSStore(s => s.position?.altMSL ?? null)
  const currentAltFt = altMSL !== null ? metersToFeet(altMSL) : null
  const bands = useMemo(
    () => computeBands(samples, bandFt, currentAltFt),
    [samples, bandFt, currentAltFt],
  )
  return { bands, currentAltFt }
}
