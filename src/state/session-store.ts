import { create } from 'zustand'
import { putSession, getSession, listSessions, listDeletedSessions, deleteSession, softDeleteSession, restoreSession, bulkAddTrackPoints, getTrackPoints } from '../data/db'
import { createSession, endSession, computeTrackDistanceNM } from '../data/logic/session-logic'
import type { Session } from '../data/models'

interface SessionStore {
  // Active session
  session: Session | null
  sessionStatus: 'idle' | 'active' | 'ended'

  // Session history
  sessions: Session[]
  loadingSessions: boolean

  // Trash
  deletedSessions: Session[]
  loadingDeleted: boolean

  // History map overlay — the past session currently shown on the map
  historySessionId: string | null
  setHistorySession: (id: string | null) => void

  // Set by endCurrentSession, consumed by SessionsPage to auto-open the
  // just-ended session's detail view. Read-once: call consumeJustEndedSessionId.
  justEndedSessionId: string | null
  consumeJustEndedSessionId: () => string | null

  // Actions
  startSession: (lat: number, lon: number, altMSLm: number) => Promise<Session>
  endCurrentSession: (maxAGLft: number) => Promise<void>
  resetOrigin: (lat: number, lon: number, altMSLm: number) => Promise<void>
  loadHistory: () => Promise<void>
  loadDeleted: () => Promise<void>
  trashSessionById: (id: string) => Promise<void>
  restoreSessionById: (id: string) => Promise<void>
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
  deletedSessions: [],
  loadingDeleted: false,
  historySessionId: null,
  setHistorySession: (id) => set({ historySessionId: id }),
  justEndedSessionId: null,
  consumeJustEndedSessionId: () => {
    const id = get().justEndedSessionId
    if (id) set({ justEndedSessionId: null })
    return id
  },
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

  endCurrentSession: async (maxAGLft) => {
    const { session, trackBuffer } = get()
    if (!session) return

    if (trackBuffer.length > 0) {
      await bulkAddTrackPoints(trackBuffer)
      set({ trackBuffer: [] })
    }

    const points = await getTrackPoints(session.id)
    const totalDistNM = computeTrackDistanceNM(points)
    const ended = endSession(session, maxAGLft, totalDistNM)
    await putSession(ended)
    localStorage.removeItem('ultrapilot_lastSession')
    set({ session: null, sessionStatus: 'idle', justEndedSessionId: ended.id })
  },

  loadHistory: async () => {
    set({ loadingSessions: true })
    const sessions = await listSessions()
    set({ sessions, loadingSessions: false })
  },

  loadDeleted: async () => {
    set({ loadingDeleted: true })
    const deletedSessions = await listDeletedSessions()
    set({ deletedSessions, loadingDeleted: false })
  },

  trashSessionById: async (id) => {
    await softDeleteSession(id)
    const [sessions, deletedSessions] = await Promise.all([listSessions(), listDeletedSessions()])
    set({ sessions, deletedSessions })
  },

  restoreSessionById: async (id) => {
    await restoreSession(id)
    const [sessions, deletedSessions] = await Promise.all([listSessions(), listDeletedSessions()])
    set({ sessions, deletedSessions })
  },

  deleteSessionById: async (id) => {
    await deleteSession(id)
    const [sessions, deletedSessions] = await Promise.all([listSessions(), listDeletedSessions()])
    set({ sessions, deletedSessions })
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
  if (s && !s.endTime && !s.deletedAt) {
    useSessionStore.setState({ session: s, sessionStatus: 'active' })
    return s
  }
  return null
}
