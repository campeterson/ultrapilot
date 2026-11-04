import { create } from 'zustand'

const STORAGE_KEY = 'ultrapilot_panelMode'

/** How a section shows on a tablet: beside the map, or over the whole screen.
 *  Phones are always full screen. */
export type PanelMode = 'split' | 'full'

function load(): PanelMode {
  try { return localStorage.getItem(STORAGE_KEY) === 'full' ? 'full' : 'split' } catch { return 'split' }
}

interface PanelStore {
  mode: PanelMode
  setMode: (m: PanelMode) => void
}

export const usePanelStore = create<PanelStore>((set) => ({
  mode: load(),
  setMode: (mode) => {
    set({ mode })
    try { localStorage.setItem(STORAGE_KEY, mode) } catch {}
  },
}))
