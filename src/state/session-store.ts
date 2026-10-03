import { create } from 'zustand'
import { putSession, getSession, listSessions, listDeletedSessions, deleteSession, softDeleteSession, restoreSession, bulkAddTrackPoints, getTrackPoints, addEvent } from '../data/db'
import { parseSessionFile, type ImportStats } from '../data/import'
import { createSession, endSession, computeTrackDistanceNM } from '../data/logic/session-logic'
import type { Session } from '../data/models'
import { useFlightModeStore } from './flight-mode-store'

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
  /** Import a GPX / OADS / UltraPilot JSON file. `confirmReplace` is asked
   *  once when sessions with the same id already exist. */
  importFile: (fileName: string, text: string, confirmReplace: (count: number) => boolean) => Promise<{ stats: ImportStats; importedIds: string[] }>

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
    const s = createSession(lat, lon, altMSLm, useFlightModeStore.getState().mode)
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

  importFile: async (fileName, text, confirmReplace) => {
    const payloads = parseSessionFile(fileName, text)
    const stats: ImportStats = { imported: 0, replaced: 0, skippedDuplicates: 0, skippedInvalid: 0 }
    const byId = new Map<string, (typeof payloads)[number]>()
    for (const p of payloads) {
      if (!p.session.id) { stats.skippedInvalid += 1; continue }
      if (byId.has(p.session.id)) stats.skippedInvalid += 1
      byId.set(p.session.id, p)
    }
    const unique = Array.from(byId.values())
    const existing = new Set<string>()
    for (const p of unique) {
      if (await getSession(p.session.id)) existing.add(p.session.id)
    }
    const replace = existing.size > 0 && confirmReplace(existing.size)

    const importedIds: string[] = []
    for (const p of unique) {
      const exists = existing.has(p.session.id)
      if (exists && !replace) { stats.skippedDuplicates += 1; continue }
      if (exists) { await deleteSession(p.session.id); stats.replaced += 1 }
      await putSession(p.session)
      await bulkAddTrackPoints(p.trackPoints)
      for (const ev of p.events) await addEvent(ev)
      stats.imported += 1
      importedIds.push(p.session.id)
    }

    const sessions = await listSessions()
    set({ sessions })
    return { stats, importedIds }
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
