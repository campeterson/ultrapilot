import { openDB, type IDBPDatabase } from 'idb'
import type { Session, TrackPoint, StampEvent, Checklist, Waypoint } from './models'

const DB_NAME = 'ultrapilot'
const DB_VERSION = 2

type UltraPilotDB = {
  sessions: {
    key: string
    value: Session
  }
  trackPoints: {
    key: string
    value: TrackPoint & { id: string }
    indexes: { by_session: string }
  }
  events: {
    key: string
    value: StampEvent
    indexes: { by_session: string }
  }
  checklists: {
    key: string
    value: Checklist
  }
  waypoints: {
    key: string
    value: Waypoint
  }
}

let _db: IDBPDatabase<UltraPilotDB> | null = null

async function getDB(): Promise<IDBPDatabase<UltraPilotDB>> {
  if (_db) return _db
  _db = await openDB<UltraPilotDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('sessions')) {
        db.createObjectStore('sessions', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('trackPoints')) {
        const tpStore = db.createObjectStore('trackPoints', { keyPath: 'id' })
        tpStore.createIndex('by_session', 'sessionId')
      }
      if (!db.objectStoreNames.contains('events')) {
        const evStore = db.createObjectStore('events', { keyPath: 'id' })
        evStore.createIndex('by_session', 'sessionId')
      }
      if (!db.objectStoreNames.contains('checklists')) {
        db.createObjectStore('checklists', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('waypoints')) {
        db.createObjectStore('waypoints', { keyPath: 'id' })
      }
    },
  })
  return _db
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function listSessions(): Promise<Session[]> {
  const db = await getDB()
  const all = await db.getAll('sessions')
  return all
    .filter(s => !s.deletedAt)
    .sort((a, b) => b.startTime.localeCompare(a.startTime))
}

export async function listDeletedSessions(): Promise<Session[]> {
  const db = await getDB()
  const all = await db.getAll('sessions')
  return all
    .filter(s => !!s.deletedAt)
    .sort((a, b) => (b.deletedAt ?? '').localeCompare(a.deletedAt ?? ''))
}

export async function getSession(id: string): Promise<Session | undefined> {
  const db = await getDB()
  return db.get('sessions', id)
}

export async function putSession(session: Session): Promise<void> {
  const db = await getDB()
  await db.put('sessions', session)
}

export async function softDeleteSession(id: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('sessions', id)
  if (!existing) return
  await db.put('sessions', { ...existing, deletedAt: new Date().toISOString() })
}

export async function restoreSession(id: string): Promise<void> {
  const db = await getDB()
  const existing = await db.get('sessions', id)
  if (!existing) return
  const { deletedAt: _omit, ...rest } = existing
  void _omit
  await db.put('sessions', { ...rest, deletedAt: null })
}

export async function deleteSession(id: string): Promise<void> {
  const db = await getDB()
  const tx = db.transaction(['sessions', 'trackPoints', 'events'], 'readwrite')
  await tx.objectStore('sessions').delete(id)
  const tpIndex = tx.objectStore('trackPoints').index('by_session')
  const tpKeys = await tpIndex.getAllKeys(id)
  for (const key of tpKeys) await tx.objectStore('trackPoints').delete(key)
  const evIndex = tx.objectStore('events').index('by_session')
  const evKeys = await evIndex.getAllKeys(id)
  for (const key of evKeys) await tx.objectStore('events').delete(key)
  await tx.done
}

// ─── Track Points ─────────────────────────────────────────────────────────────

export async function addTrackPoint(point: TrackPoint): Promise<void> {
  const db = await getDB()
  const id = `${point.sessionId}_${point.ts}`
  await db.put('trackPoints', { ...point, id })
}

export async function bulkAddTrackPoints(points: TrackPoint[]): Promise<void> {
  if (points.length === 0) return
  const db = await getDB()
  const tx = db.transaction('trackPoints', 'readwrite')
  for (const point of points) {
    const id = `${point.sessionId}_${point.ts}`
    tx.store.put({ ...point, id })
  }
  await tx.done
}

export async function getTrackPoints(sessionId: string): Promise<TrackPoint[]> {
  const db = await getDB()
  const index = db.transaction('trackPoints').store.index('by_session')
  const results = await index.getAll(sessionId)
  return results.sort((a, b) => a.ts - b.ts)
}

// ─── Events ───────────────────────────────────────────────────────────────────

export async function addEvent(event: StampEvent): Promise<void> {
  const db = await getDB()
  await db.put('events', event)
}

export async function getEvents(sessionId: string): Promise<StampEvent[]> {
  const db = await getDB()
  const index = db.transaction('events').store.index('by_session')
  const results = await index.getAll(sessionId)
  return results.sort((a, b) => a.ts - b.ts)
}

// ─── Checklists ───────────────────────────────────────────────────────────────

export async function listChecklists(): Promise<Checklist[]> {
  const db = await getDB()
  return db.getAll('checklists')
}

export async function putChecklist(checklist: Checklist): Promise<void> {
  const db = await getDB()
  await db.put('checklists', checklist)
}

export async function deleteChecklist(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('checklists', id)
}

// ─── Waypoints ────────────────────────────────────────────────────────────────

export async function listWaypoints(): Promise<Waypoint[]> {
  const db = await getDB()
  const all = await db.getAll('waypoints')
  return all.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
}

export async function putWaypoint(waypoint: Waypoint): Promise<void> {
  const db = await getDB()
  await db.put('waypoints', waypoint)
}

export async function deleteWaypoint(id: string): Promise<void> {
  const db = await getDB()
  await db.delete('waypoints', id)
}
