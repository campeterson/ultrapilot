import { useShallow } from 'zustand/react/shallow'
import { useUnitsStore, selectUnits } from '../../state/units-store'
import { useWindreaderStore } from '../../state/windreader-store'
import { bandSizeFt } from '../../data/logic/windreader-logic'
import type { UnitPrefs } from '../../data/models'

/** The display-unit preferences, re-rendering only when one changes. */
export function useUnits(): UnitPrefs {
  return useUnitsStore(useShallow(selectUnits))
}

/** Windreader band height in feet (50 ft steps, or 15 m steps in metric). */
export function useWindBandFt(): number {
  const step = useWindreaderStore(s => s.bandStep)
  const altitude = useUnitsStore(s => s.altitude)
  return bandSizeFt(step, altitude)
}
