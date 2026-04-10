import { create } from 'zustand'
import { putSession, getSession, listSessions, deleteSession } from '../data/db'
import { createSession, endSession } from '../data/logic/session-logic'
import type { Session } from '../data/models'

interface SessionStore {
  // Active session
  session: Session | null
  sessionStatus: 'idle' | 'active' | 'ended'

  // Session history
  sessions: Session[]
  loadingSessions: boolean

  // History map overlay — the past session currently shown on the map
  historySessionId: string | null
  setHistorySession: (id: string | null) => void

  // Actions
  startSession: (lat: number, lon: number, altMSLm: number) => Promise<Session>
  endCurrentSession: (maxAGLft: number, totalDistNM: number) => Promise<void>
  resetOrigin: (lat: number, lon: number, altMSLm: number) => Promise<void>
  loadHistory: () => Promise<void>
  deleteSessionById: (id: string) => Promise<void>

  // Track point buffer (flushed periodically to DB)
  trackBuffer: { sessionId: string; ts: number; lat: number; lon: number; altMSL: number; speed: number; heading: number; accuracy: number }[]
  pushTrackPoint: (pt: Omit<SessionStore['trackBuffer'][number], 'sessionId'>) => void
  clearTrackBuffer: () => SessionStore['trackBuffer']
}

export const useSessionStore = create<SessionStore>((set, get) => ({
  session: null,
  sessionStatus: 'idle',
  sessions: [],
  loadingSessions: false,
  historySessionId: null,
  setHistorySession: (id) => set({ historySessionId: id }),
  trackBuffer: [],

  startSession: async (lat, lon, altMSLm) => {
    const s = createSession(lat, lon, altMSLm)
    await putSession(s)
    localStorage.setItem('ultrapilot_lastSession', s.id)
    set({ session: s, sessionStatus: 'active' })
    return s
  },

  resetOrigin: async (lat, lon, altMSLm) => {
    const { session } = get()
    if (!session) return
    const updated = { ...session, originLat: lat, originLon: lon, originAltMSL: altMSLm }
    await putSession(updated)
    set({ session: updated })
  },

  endCurrentSession: async (maxAGLft, totalDistNM) => {
    const { session } = get()
    if (!session) return
    const ended = endSession(session, maxAGLft, totalDistNM)
    await putSession(ended)
    localStorage.removeItem('ultrapilot_lastSession')
    set({ session: null, sessionStatus: 'idle' })
  },

  loadHistory: async () => {
    set({ loadingSessions: true })
    const sessions = await listSessions()
    set({ sessions, loadingSessions: false })
  },

  deleteSessionById: async (id) => {
    await deleteSession(id)
    const sessions = await listSessions()
    set({ sessions })
  },

  pushTrackPoint: (pt) => {
    const { session } = get()
    if (!session) return
    set(state => ({
      trackBuffer: [...state.trackBuffer, { ...pt, sessionId: session.id }]
    }))
  },

  clearTrackBuffer: () => {
    const buf = get().trackBuffer
    set({ trackBuffer: [] })
    return buf
  },
}))

/** Attempt to restore a session from localStorage on app boot */
export async function restoreLastSession(): Promise<Session | null> {
  const lastId = localStorage.getItem('ultrapilot_lastSession')
  if (!lastId) return null
  const s = await getSession(lastId)
  if (s && !s.endTime) {
    useSessionStore.setState({ session: s, sessionStatus: 'active' })
    return s
  }
  return null
}
