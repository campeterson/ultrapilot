import { create } from 'zustand'

export interface DirectToTarget {
  lat: number
  lon: number
  name: string
  fromLat: number  // position when D→ was activated (XTK reference start)
  fromLon: number
  /** Following a Live Group member: the target moves with their position. */
  memberId?: string
}

interface DirectToStore {
  target: DirectToTarget | null
  setTarget: (target: DirectToTarget) => void
  clearTarget: () => void
  /** Move a member-following target (no-op for any other target). */
  followMember: (memberId: string, lat: number, lon: number) => void
}

export const useDirectToStore = create<DirectToStore>((set, get) => ({
  target: null,
  setTarget: (target) => set({ target }),
  clearTarget: () => set({ target: null }),
  followMember: (memberId, lat, lon) => {
    const t = get().target
    if (t?.memberId === memberId && (t.lat !== lat || t.lon !== lon)) set({ target: { ...t, lat, lon } })
  },
}))
