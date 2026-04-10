import { create } from 'zustand'
import { addEvent, getEvents } from '../data/db'
import type { StampEvent, StampEventType } from '../data/models'

interface TimelineStore {
  events: StampEvent[]
  loading: boolean

  loadEvents: (sessionId: string) => Promise<void>
  addStamp: (event: Omit<StampEvent, 'id'>) => Promise<StampEvent>
  clearEvents: () => void
}

export const useTimelineStore = create<TimelineStore>((set) => ({
  events: [],
  loading: false,

  loadEvents: async (sessionId) => {
    set({ loading: true })
    const events = await getEvents(sessionId)
    set({ events, loading: false })
  },

  addStamp: async (event) => {
    const full: StampEvent = { ...event, id: crypto.randomUUID() }
    await addEvent(full)
    set(state => ({ events: [...state.events, full].sort((a, b) => a.ts - b.ts) }))
    return full
  },

  clearEvents: () => set({ events: [] }),
}))

/** Helper: create a stamp from current GPS position + session context */
export function buildStamp(
  sessionId: string,
  type: StampEventType,
  lat: number,
  lon: number,
  altMSLm: number,
  altAGLm: number,
  speedMs: number,
  note: string | null = null
): Omit<StampEvent, 'id'> {
  return {
    sessionId,
    ts: Date.now(),
    type,
    lat,
    lon,
    altMSL: altMSLm,
    altAGL: altAGLm,
    speed: speedMs,
    note,
  }
}
