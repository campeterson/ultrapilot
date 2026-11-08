import { create } from 'zustand'
import { DEFAULT_NAV_ORDER, moveSection, normalizeNavOrder, type NavSection } from '../data/logic/nav-logic'
import type { FlightMode } from '../data/models'

const STORAGE_KEY = 'ultrapilot_navOrder'

function load(): NavSection[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return normalizeNavOrder(JSON.parse(raw))
  } catch {}
  return [...DEFAULT_NAV_ORDER]
}

interface NavStore {
  /** Every section, in the user's order. The first four (for the flight mode) are on the bar. */
  order: NavSection[]
  move: (id: NavSection, delta: -1 | 1, mode: FlightMode) => void
  reset: () => void
}

export const useNavStore = create<NavStore>((set, get) => {
  const save = (order: NavSection[]) => {
    set({ order })
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(order)) } catch {}
  }
  return {
    order: load(),
    move: (id, delta, mode) => save(moveSection(get().order, mode, id, delta)),
    reset: () => save([...DEFAULT_NAV_ORDER]),
  }
})
