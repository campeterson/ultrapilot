import { useState } from 'react'
import { useSessionStore } from '../../../state/session-store'
import { useInstrumentStore } from '../../../state/instrument-store'
import { useTimelineStore } from '../../../state/timeline-store'
import { useGPSStore } from '../../../state/gps-store'
import { useMapSettingsStore } from '../../../state/map-settings-store'
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout'
import { addEvent, bulkAddTrackPoints, deleteSession, getSession, getTrackPoints, getEvents, putSession } from '../../../data/db'
import { toGPX, toOADSSession, downloadString, sessionFilename, type OADSEnvelope } from '../../../data/export'
import { computeTrackDistanceNM } from '../../../data/logic/session-logic'
import { theme } from '../../theme'
import { INSTRUMENT_LABELS, type InstrumentId, type Session, type StampEvent, type StampEventType, type TrackPoint } from '../../../data/models'
// INSTRUMENT_LABELS used in InstrumentConfigurator below
import { InstrumentPickerModal } from '../../shell/InstrumentPickerModal'
import { PAGE_LAYOUTS, PAGE_LAYOUT_IDS, type PageLayoutId } from '../../../data/logic/instrument-layouts'
import { LayoutThumbnail } from '../instruments/LayoutThumbnail'

type SessionImportPayload = {
  session: Session
  trackPoints: TrackPoint[]
  events: StampEvent[]
}

type ImportStats = {
  imported: number
  replaced: number
  skippedDuplicates: number
  skippedInvalid: number
}

const STAMP_EVENT_TYPES: StampEventType[] = [
  'session_start', 'session_end', 'takeoff', 'landing', 'engine_start', 'engine_shutdown',
  'checklist_complete', 'wing_layout', 'weather', 'waypoint', 'preflight', 'maneuver', 'custom',
]

function isStampEventType(value: unknown): value is StampEventType {
  return typeof value === 'string' && STAMP_EVENT_TYPES.includes(value as StampEventType)
}

function coerceFinite(value: unknown, fallback = 0): number {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalizeSession(input: unknown): Session | null {
  if (!input || typeof input !== 'object') return null
  const s = input as Record<string, unknown>
  if (typeof s.id !== 'string' || typeof s.startTime !== 'string') return null
  return {
    id: s.id,
    startTime: s.startTime,
    endTime: typeof s.endTime === 'string' ? s.endTime : null,
    originLat: coerceFinite(s.originLat),
    originLon: coerceFinite(s.originLon),
    originAltMSL: coerceFinite(s.originAltMSL),
    maxAGL: coerceFinite(s.maxAGL),
    totalDistanceNM: coerceFinite(s.totalDistanceNM),
    deviceInfo: typeof s.deviceInfo === 'string' ? s.deviceInfo : 'imported',
    deletedAt: null,
  }
}

function normalizeTrackPoints(input: unknown, sessionId: string): TrackPoint[] {
  if (!Array.isArray(input)) return []
  return input
    .map((pt) => {
      if (!pt || typeof pt !== 'object') return null
      const p = pt as Record<string, unknown>
      const lat = coerceFinite(p.lat, NaN)
      const lon = coerceFinite(p.lon, NaN)
      const ts = coerceFinite(p.ts, NaN)
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(ts)) return null
      return {
        sessionId,
        ts,
        lat,
        lon,
        altMSL: coerceFinite(p.altMSL),
        speed: coerceFinite(p.speed),
        heading: coerceFinite(p.heading),
        accuracy: coerceFinite(p.accuracy),
      }
    })
    .filter((pt): pt is TrackPoint => !!pt)
    .sort((a, b) => a.ts - b.ts)
}

function normalizeEvents(input: unknown, sessionId: string): StampEvent[] {
  if (!Array.isArray(input)) return []
  return input
    .map((ev, index) => {
      if (!ev || typeof ev !== 'object') return null
      const e = ev as Record<string, unknown>
      const lat = coerceFinite(e.lat, NaN)
      const lon = coerceFinite(e.lon, NaN)
      const ts = coerceFinite(e.ts, NaN)
      if (!Number.isFinite(lat) || !Number.isFinite(lon) || !Number.isFinite(ts)) return null
      const type = isStampEventType(e.type) ? e.type : 'custom'
      const id = typeof e.id === 'string' ? e.id : `${sessionId}-event-${ts}-${index}`
      return {
        id,
        sessionId,
        ts,
        type,
        lat,
        lon,
        altMSL: coerceFinite(e.altMSL),
        altAGL: coerceFinite(e.altAGL),
        speed: coerceFinite(e.speed),
        note: typeof e.note === 'string' ? e.note : null,
      }
    })
    .filter((ev): ev is StampEvent => !!ev)
    .sort((a, b) => a.ts - b.ts)
}

function parseSessionOADS(raw: unknown): SessionImportPayload[] {
  const envelopes: OADSEnvelope[] = Array.isArray(raw)
    ? (raw as OADSEnvelope[])
    : [raw as OADSEnvelope]

  const valid = envelopes.filter(env => env && typeof env === 'object' && (env as { oads?: unknown }).oads === '1.0')
  if (valid.length === 0) throw new Error('No OADS envelopes found')

  const groups = new Map<string, { track?: OADSEnvelope; events?: OADSEnvelope }>()
  for (const env of valid) {
    const ext = ((env.extensions ?? {}) as { ultrapilot?: { sessionId?: string; session?: Session } }).ultrapilot
    const sessionId = ext?.sessionId ?? ext?.session?.id
    if (!sessionId) continue
    const g = groups.get(sessionId) ?? {}
    if (env.type === 'track_log') g.track = env
    if (env.type === 'flight_event_log') g.events = env
    groups.set(sessionId, g)
  }

  const payloads: SessionImportPayload[] = []
  for (const [sessionId, group] of groups.entries()) {
    const trackExt = ((group.track?.extensions ?? {}) as { ultrapilot?: { session?: Session } }).ultrapilot
    const session = trackExt?.session
    if (!session) continue

    const trackCoordinates = (((group.track?.data ?? {}) as { track?: { geometry?: { coordinates?: unknown[] } } }).track?.geometry?.coordinates ?? []) as unknown[]
    const timestamps = ((((group.track?.data ?? {}) as { track?: { properties?: { timestamps?: unknown[] } } }).track?.properties?.timestamps) ?? []) as unknown[]
    const speedsKts = ((((group.track?.data ?? {}) as { track?: { properties?: { ground_speed_kts?: unknown[] } } }).track?.properties?.ground_speed_kts) ?? []) as unknown[]
    const headings = ((((group.track?.data ?? {}) as { track?: { properties?: { heading_magnetic?: unknown[] } } }).track?.properties?.heading_magnetic) ?? []) as unknown[]

    const trackPoints: TrackPoint[] = trackCoordinates
      .map((coord, i) => {
        if (!Array.isArray(coord) || coord.length < 2) return null
        const lon = coerceFinite(coord[0], NaN)
        const lat = coerceFinite(coord[1], NaN)
        const altMSL = coerceFinite(coord[2])
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        const tsRaw = typeof timestamps[i] === 'string' ? Date.parse(timestamps[i] as string) : NaN
        return {
          sessionId,
          ts: Number.isFinite(tsRaw) ? tsRaw : Date.now() + i,
          lat,
          lon,
          altMSL,
          speed: coerceFinite(speedsKts[i]) / 1.94384,
          heading: coerceFinite(headings[i]),
          accuracy: 0,
        }
      })
      .filter((pt): pt is TrackPoint => !!pt)

    const rawEvents = (((group.events?.data ?? {}) as { events?: unknown[] }).events ?? []) as unknown[]
    const events: StampEvent[] = rawEvents
      .map((ev, idx): StampEvent | null => {
        if (!ev || typeof ev !== 'object') return null
        const e = ev as Record<string, unknown>
        const loc = e.location as { coordinates?: unknown[] } | undefined
        const coords = Array.isArray(loc?.coordinates) ? loc?.coordinates : []
        if (coords.length < 2) return null
        const lon = coerceFinite(coords[0], NaN)
        const lat = coerceFinite(coords[1], NaN)
        if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
        const tsRaw = typeof e.timestamp === 'string' ? Date.parse(e.timestamp) : NaN
        return {
          id: typeof e.id === 'string' ? e.id : `${sessionId}-oads-${idx}`,
          sessionId,
          ts: Number.isFinite(tsRaw) ? tsRaw : Date.now() + idx,
          type: isStampEventType(e.event_type) ? e.event_type : 'custom',
          lat,
          lon,
          altMSL: coerceFinite(coords[2]),
          altAGL: 0,
          speed: 0,
          note: typeof e.notes === 'string' ? e.notes : null,
        }
      })
      .filter((ev): ev is StampEvent => !!ev)

    if (trackPoints.length > 1) {
      session.totalDistanceNM = computeTrackDistanceNM(trackPoints)
    }

    payloads.push({ session: { ...session, deletedAt: null }, trackPoints, events })
  }

  if (payloads.length === 0) throw new Error('No UltraPilot session records found in OADS file')
  return payloads
}

function parseSessionJson(raw: unknown): SessionImportPayload[] {
  if (!raw || typeof raw !== 'object') throw new Error('Not a valid JSON object')
  const obj = raw as Record<string, unknown>

  const parseOne = (entry: unknown): SessionImportPayload | null => {
    if (!entry || typeof entry !== 'object') return null
    const rec = entry as Record<string, unknown>
    const session = normalizeSession(rec.session)
    if (!session) return null
    const trackPoints = normalizeTrackPoints(rec.trackPoints, session.id)
    const events = normalizeEvents(rec.events, session.id)
    if (trackPoints.length > 1) {
      session.totalDistanceNM = computeTrackDistanceNM(trackPoints)
    }
    return { session, trackPoints, events }
  }

  if (obj.session && obj.trackPoints && obj.events) {
    const one = parseOne(obj)
    if (!one) throw new Error('Invalid session file structure')
    return [one]
  }

  if (Array.isArray(obj.sessions)) {
    const parsed = obj.sessions
      .map(parseOne)
      .filter((item): item is SessionImportPayload => !!item)
    if (parsed.length === 0) throw new Error('No valid sessions found in file')
    return parsed
  }

  throw new Error('Unsupported session file format')
}

function toIsoOrFallback(value: string | null | undefined, fallbackMs: number): string {
  if (value) {
    const ms = Date.parse(value)
    if (Number.isFinite(ms)) return new Date(ms).toISOString()
  }
  return new Date(fallbackMs).toISOString()
}

function parseGpxEventType(name: string): StampEventType {
  const normalized = name.trim().toLowerCase().replace(/\s+/g, '_')
  return isStampEventType(normalized) ? normalized : 'custom'
}

function parseSessionGpx(text: string): SessionImportPayload {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  if (doc.querySelector('parsererror')) {
    throw new Error('Invalid GPX XML')
  }

  const trkpts = Array.from(doc.getElementsByTagName('trkpt'))
  if (trkpts.length === 0) {
    throw new Error('GPX has no track points')
  }

  const rawPoints = trkpts
    .map((node, index) => {
      const lat = coerceFinite(node.getAttribute('lat'), NaN)
      const lon = coerceFinite(node.getAttribute('lon'), NaN)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      const eleText = node.getElementsByTagName('ele')[0]?.textContent
      const timeText = node.getElementsByTagName('time')[0]?.textContent
      const speedText = node.getElementsByTagName('speed')[0]?.textContent
      const courseText = node.getElementsByTagName('course')[0]?.textContent

      const parsedTime = timeText ? Date.parse(timeText) : NaN
      const ts = Number.isFinite(parsedTime) ? parsedTime : Date.now() + (index * 1000)

      return {
        lat,
        lon,
        ts,
        altMSL: coerceFinite(eleText),
        speed: coerceFinite(speedText),
        heading: coerceFinite(courseText),
      }
    })
    .filter((pt): pt is NonNullable<typeof pt> => !!pt)
    .sort((a, b) => a.ts - b.ts)

  if (rawPoints.length === 0) throw new Error('GPX track points are invalid')

  const startMs = rawPoints[0].ts
  const endMs = rawPoints[rawPoints.length - 1].ts
  const sessionId = new Date(startMs).toISOString()

  const trackPoints: TrackPoint[] = rawPoints.map(pt => ({
    sessionId,
    ts: pt.ts,
    lat: pt.lat,
    lon: pt.lon,
    altMSL: pt.altMSL,
    speed: pt.speed,
    heading: pt.heading,
    accuracy: 0,
  }))

  const distanceNM = computeTrackDistanceNM(trackPoints)
  const maxAlt = Math.max(...trackPoints.map(p => p.altMSL))
  const minAlt = Math.min(...trackPoints.map(p => p.altMSL))

  const session: Session = {
    id: sessionId,
    startTime: toIsoOrFallback(doc.getElementsByTagName('metadata')[0]?.getElementsByTagName('time')[0]?.textContent, startMs),
    endTime: new Date(endMs).toISOString(),
    originLat: trackPoints[0].lat,
    originLon: trackPoints[0].lon,
    originAltMSL: trackPoints[0].altMSL,
    maxAGL: Math.max(0, maxAlt - minAlt),
    totalDistanceNM: distanceNM,
    deviceInfo: 'imported-gpx',
    deletedAt: null,
  }

  const events: StampEvent[] = Array.from(doc.getElementsByTagName('wpt'))
    .map((node, index): StampEvent | null => {
      const lat = coerceFinite(node.getAttribute('lat'), NaN)
      const lon = coerceFinite(node.getAttribute('lon'), NaN)
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null
      const name = node.getElementsByTagName('name')[0]?.textContent ?? 'custom'
      const desc = node.getElementsByTagName('desc')[0]?.textContent
      const timeText = node.getElementsByTagName('time')[0]?.textContent
      const parsedTime = timeText ? Date.parse(timeText) : NaN
      return {
        id: `${sessionId}-wpt-${index}`,
        sessionId,
        ts: Number.isFinite(parsedTime) ? parsedTime : (startMs + index),
        type: parseGpxEventType(name),
        lat,
        lon,
        altMSL: coerceFinite(node.getElementsByTagName('ele')[0]?.textContent),
        altAGL: 0,
        speed: 0,
        note: desc ?? null,
      }
    })
    .filter((ev): ev is StampEvent => !!ev)

  return { session, trackPoints, events }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 16px', borderBottom: `1px solid ${theme.colors.darkBorder}`, minHeight: theme.tapTarget }}>
      <span style={{ fontSize: theme.size.body, color: theme.colors.light }}>{label}</span>
      {children}
    </div>
  )
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div style={{ padding: '10px 16px 6px', fontSize: theme.size.small, color: theme.colors.dim, letterSpacing: '0.08em', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
      {title}
    </div>
  )
}

function Toggle({ value, onToggle }: { value: boolean; onToggle: () => void }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: '48px', height: '28px', borderRadius: '14px', border: 'none',
        background: value ? theme.colors.red : theme.colors.darkCard,
        cursor: 'pointer', position: 'relative', transition: 'background 0.2s',
        outline: `1px solid ${theme.colors.darkBorder}`,
        flexShrink: 0,
      }}
    >
      <div style={{
        position: 'absolute', top: '4px',
        left: value ? '24px' : '4px',
        width: '20px', height: '20px', borderRadius: '50%',
        background: '#fff', transition: 'left 0.2s',
      }} />
    </button>
  )
}

// ── Slot Button ────────────────────────────────────────────────────────────────

function SlotButton({
  index,
  id,
  hiddenOnMobile,
  onTap,
}: {
  index: number
  id: InstrumentId
  hiddenOnMobile: boolean
  onTap: () => void
}) {
  return (
    <button
      onClick={onTap}
      style={{
        padding: '10px 12px', borderRadius: '8px',
        border: `2px solid ${hiddenOnMobile ? theme.colors.amber : theme.colors.red}`,
        background: hiddenOnMobile ? 'rgba(230,126,34,0.12)' : theme.colors.redDim,
        color: theme.colors.cream, cursor: 'pointer',
        fontFamily: theme.font.primary, fontSize: theme.size.small,
        textAlign: 'left', display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', minHeight: theme.tapTarget, width: '100%',
      }}
    >
      <span style={{ color: theme.colors.dim, marginRight: '6px', fontFamily: theme.font.mono, fontSize: '11px' }}>#{index + 1}</span>
      <span style={{ flex: 1, textAlign: 'left' }}>{INSTRUMENT_LABELS[id]}</span>
      {hiddenOnMobile && (
        <span style={{
          background: theme.colors.amber, color: '#fff',
          padding: '2px 6px', borderRadius: '4px',
          fontSize: '10px', fontWeight: 700, marginLeft: '6px',
        }}>hidden</span>
      )}
    </button>
  )
}

function EmptySlot({ index, onTap }: { index: number; onTap: () => void }) {
  return (
    <button
      onClick={onTap}
      style={{
        padding: '10px 12px', borderRadius: '8px',
        border: `2px dashed ${theme.colors.darkBorder}`,
        background: 'transparent', color: theme.colors.dim,
        cursor: 'pointer', fontFamily: theme.font.primary,
        fontSize: theme.size.small, textAlign: 'left',
        display: 'flex', alignItems: 'center', gap: '6px',
        minHeight: theme.tapTarget, width: '100%',
      }}
    >
      <span style={{ color: theme.colors.dim, fontFamily: theme.font.mono, fontSize: '11px' }}>#{index + 1}</span>
      <span style={{ color: theme.colors.dim }}>+ Add</span>
    </button>
  )
}

// ── Overlay Slot Button ────────────────────────────────────────────────────────

function OverlaySlot({
  label,
  id,
  onTap,
}: {
  label: string
  id: InstrumentId | null
  onTap: () => void
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
      <span style={{ fontSize: theme.size.small, color: theme.colors.light, flex: 1 }}>{label}</span>
      <button
        onClick={onTap}
        style={{
          padding: '8px 14px', borderRadius: '8px',
          border: `1px solid ${id ? theme.colors.red : theme.colors.darkBorder}`,
          background: id ? theme.colors.redDim : theme.colors.darkCard,
          color: id ? theme.colors.cream : theme.colors.dim,
          cursor: 'pointer', fontFamily: theme.font.primary,
          fontSize: theme.size.small, minHeight: '36px',
          whiteSpace: 'nowrap',
        }}
      >
        {id ? INSTRUMENT_LABELS[id] : 'Off'}
      </button>
    </div>
  )
}

// ── Instrument Configurator ────────────────────────────────────────────────────

function InstrumentConfigurator() {
  const {
    strip, setStrip,
    mapLeft, mapRight, mapBottom,
    setMapLeft, setMapRight, setMapBottom,
    stripCount, setStripCount,
  } = useInstrumentStore()
  const layout = useResponsiveLayout()
  const isPhone = layout === 'phone'

  // Local strip state (committed on slot removal/add)
  const [localStrip, setLocalStrip] = useState<InstrumentId[]>(strip)

  // Picker state
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)       // strip slot index
  const [pickerOverlay, setPickerOverlay] = useState<'left' | 'right' | 'bottom' | null>(null)

  function openStripPicker(index: number) {
    setPickerSlot(index)
  }

  function removeFromStrip(index: number) {
    const next = localStrip.filter((_, i) => i !== index)
    setLocalStrip(next)
    setStrip(next)
  }

  function handleStripPick(id: InstrumentId | null) {
    if (id === null || pickerSlot === null) return
    const next = [...localStrip]
    if (pickerSlot < next.length) {
      next[pickerSlot] = id
    } else {
      next.push(id)
    }
    setLocalStrip(next)
    setStrip(next)
    setPickerSlot(null)
  }

  function handleOverlayPick(id: InstrumentId | null) {
    if (pickerOverlay === 'left')   setMapLeft(id)
    if (pickerOverlay === 'right')  setMapRight(id)
    if (pickerOverlay === 'bottom') setMapBottom(id)
    setPickerOverlay(null)
  }

  // Build slot list: filled slots + one empty "add" slot (up to 6)
  const slotCount = Math.min(6, localStrip.length + 1)
  const slots = Array.from({ length: slotCount }, (_, i) => i)

  return (
    <div style={{ padding: '12px 16px' }}>

      {/* Strip count selector */}
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '8px' }}>
        Strip slot count {isPhone && '(phone shows max 4)'}
      </div>
      <div style={{ display: 'flex', gap: '8px', marginBottom: '18px' }}>
        {([4, 5, 6] as const).map(n => (
          <button
            key={n}
            onClick={() => setStripCount(n)}
            style={{
              flex: 1, padding: '10px', borderRadius: '8px',
              border: `2px solid ${stripCount === n ? theme.colors.red : theme.colors.darkBorder}`,
              background: stripCount === n ? theme.colors.redDim : theme.colors.dark,
              color: stripCount === n ? theme.colors.cream : theme.colors.light,
              cursor: 'pointer', fontFamily: theme.font.primary,
              fontSize: theme.size.body, fontWeight: stripCount === n ? 700 : 400,
              minHeight: theme.tapTarget,
            }}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Strip slots */}
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '10px' }}>
        Instrument strip — tap a slot to change, ✕ to remove
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
        {slots.map(i => {
          const id = localStrip[i]
          const hiddenOnMobile = isPhone && i >= 4
          if (id !== undefined) {
            return (
              <div key={i} style={{ display: 'flex', gap: '6px' }}>
                <div style={{ flex: 1 }}>
                  <SlotButton
                    index={i}
                    id={id}
                    hiddenOnMobile={hiddenOnMobile}
                    onTap={() => openStripPicker(i)}
                  />
                </div>
                <button
                  onClick={() => removeFromStrip(i)}
                  style={{
                    width: '44px', height: '44px', borderRadius: '8px',
                    border: `1px solid ${theme.colors.darkBorder}`,
                    background: theme.colors.dark, color: theme.colors.dim,
                    cursor: 'pointer', fontSize: '18px', flexShrink: 0,
                  }}
                >
                  ✕
                </button>
              </div>
            )
          }
          if (localStrip.length < 6) {
            return <EmptySlot key={`empty-${i}`} index={i} onTap={() => openStripPicker(i)} />
          }
          return null
        })}
      </div>

      {/* Map overlay slots */}
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '10px' }}>
        Map corner overlays — tap to change
      </div>
      <OverlaySlot label="Top Left"     id={mapLeft}   onTap={() => setPickerOverlay('left')} />
      <OverlaySlot label="Top Right"    id={mapRight}  onTap={() => setPickerOverlay('right')} />
      <OverlaySlot label="Bottom Right" id={mapBottom} onTap={() => setPickerOverlay('bottom')} />

      {/* Strip picker modal */}
      {pickerSlot !== null && (
        <InstrumentPickerModal
          current={localStrip[pickerSlot] ?? null}
          includeNull={false}
          onSelect={id => handleStripPick(id as InstrumentId)}
          onClose={() => setPickerSlot(null)}
        />
      )}

      {/* Overlay picker modal */}
      {pickerOverlay !== null && (
        <InstrumentPickerModal
          current={
            pickerOverlay === 'left' ? mapLeft
            : pickerOverlay === 'right' ? mapRight
            : mapBottom
          }
          includeNull={true}
          onSelect={handleOverlayPick}
          onClose={() => setPickerOverlay(null)}
        />
      )}
    </div>
  )
}

// ── Instruments Page Layout Picker ────────────────────────────────────────────

function PageLayoutPicker() {
  const pageLayoutId = useInstrumentStore(s => s.pageLayoutId)
  const setPageLayout = useInstrumentStore(s => s.setPageLayout)

  return (
    <div style={{ padding: '12px 16px 16px' }}>
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, marginBottom: '10px' }}>
        Instruments page layout — tap to choose
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px' }}>
        {PAGE_LAYOUT_IDS.map(id => {
          const layout = PAGE_LAYOUTS[id]
          const active = id === pageLayoutId
          return (
            <button
              key={id}
              onClick={() => setPageLayout(id as PageLayoutId)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                padding: '10px 8px', borderRadius: '10px',
                border: `2px solid ${active ? theme.colors.red : theme.colors.darkBorder}`,
                background: active ? theme.colors.redDim : theme.colors.dark,
                color: active ? theme.colors.cream : theme.colors.light,
                cursor: 'pointer',
                fontFamily: theme.font.primary,
                fontSize: theme.size.small,
                fontWeight: active ? 700 : 400,
                minHeight: theme.tapTarget,
              }}
            >
              <LayoutThumbnail layoutId={id as PageLayoutId} active={active} size={80} />
              <span style={{ textAlign: 'center', lineHeight: 1.2 }}>
                {layout.name}
                <span style={{ display: 'block', fontSize: theme.size.tiny, color: theme.colors.dim, fontWeight: 400, marginTop: '2px' }}>
                  {layout.slots.length} slots
                </span>
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

export function SettingsPage() {
  const { session, sessionStatus, endCurrentSession, loadHistory } = useSessionStore()
  const { maxAGLft } = useInstrumentStore()
  const { showDirectionLine, showDistanceRings, recordTrack, showInstrumentStrip, showMapOverlays, toggle } = useMapSettingsStore()
  const [showInstrConfig, setShowInstrConfig] = useState(false)
  const [importStatus, setImportStatus] = useState<string | null>(null)

  async function handleExportGPX() {
    if (!session) return
    const [pts, evts] = await Promise.all([getTrackPoints(session.id), getEvents(session.id)])
    const gpx = toGPX(session, pts, evts)
    downloadString(gpx, sessionFilename(session, 'gpx'), 'application/gpx+xml')
  }

  async function handleExportJSON() {
    if (!session) return
    const [pts, evts] = await Promise.all([getTrackPoints(session.id), getEvents(session.id)])
    const oads = toOADSSession(session, pts, evts)
    downloadString(JSON.stringify(oads, null, 2), sessionFilename(session, 'oads.json'), 'application/json')
  }

  async function handleEndSession() {
    if (!session) return
    if (!confirm('End the current session?')) return
    const pos = useGPSStore.getState().position
    await endCurrentSession(maxAGLft)
    const { addStamp } = useTimelineStore.getState()
    await addStamp({
      sessionId: session.id,
      ts: Date.now(),
      type: 'session_end',
      lat: pos?.lat ?? session.originLat,
      lon: pos?.lon ?? session.originLon,
      altMSL: pos?.altMSL ?? session.originAltMSL,
      altAGL: 0,
      speed: pos?.speed ?? 0,
      note: null,
    })
  }

  async function importSessions(payloads: SessionImportPayload[]): Promise<ImportStats> {
    const stats: ImportStats = { imported: 0, replaced: 0, skippedDuplicates: 0, skippedInvalid: 0 }
    const byId = new Map<string, SessionImportPayload>()
    for (const payload of payloads) {
      if (!payload.session.id) {
        stats.skippedInvalid += 1
        continue
      }
      if (byId.has(payload.session.id)) {
        stats.skippedInvalid += 1
      }
      byId.set(payload.session.id, payload)
    }

    const uniquePayloads = Array.from(byId.values())
    const existingFlags = await Promise.all(uniquePayloads.map(async p => ({
      id: p.session.id,
      exists: !!(await getSession(p.session.id)),
    })))
    const duplicateIds = existingFlags.filter(x => x.exists).map(x => x.id)

    let replaceDuplicates = false
    if (duplicateIds.length > 0) {
      replaceDuplicates = confirm(
        `${duplicateIds.length} session${duplicateIds.length === 1 ? '' : 's'} already exist. Replace duplicates?`
      )
    }

    for (const payload of uniquePayloads) {
      const exists = duplicateIds.includes(payload.session.id)
      if (exists && !replaceDuplicates) {
        stats.skippedDuplicates += 1
        continue
      }
      if (exists && replaceDuplicates) {
        await deleteSession(payload.session.id)
        stats.replaced += 1
      }

      await putSession(payload.session)
      await bulkAddTrackPoints(payload.trackPoints)
      for (const ev of payload.events) {
        await addEvent(ev)
      }
      stats.imported += 1
    }

    await loadHistory()
    return stats
  }

  async function handleImportSessionFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return

    try {
      const rawText = await file.text()
      let payloads: SessionImportPayload[]
      if (file.name.toLowerCase().endsWith('.gpx')) {
        payloads = [parseSessionGpx(rawText)]
      } else {
        const rawJson = JSON.parse(rawText)
        try {
          payloads = parseSessionOADS(rawJson)
        } catch {
          payloads = parseSessionJson(rawJson)
        }
      }

      const stats = await importSessions(payloads)
      const parts = [
        `Imported ${stats.imported}`,
      ]
      if (stats.replaced > 0) parts.push(`replaced ${stats.replaced}`)
      if (stats.skippedDuplicates > 0) parts.push(`skipped duplicates ${stats.skippedDuplicates}`)
      if (stats.skippedInvalid > 0) parts.push(`skipped invalid ${stats.skippedInvalid}`)
      setImportStatus(parts.join(' · '))
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Import failed'
      setImportStatus(`Import failed: ${msg}`)
    }

    setTimeout(() => setImportStatus(null), 5000)
  }

  return (
    <div style={{ height: '100%', overflowY: 'auto', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      {session && sessionStatus === 'active' && (
        <>
          <SectionHeader title="CURRENT SESSION" />
          <Row label="Export GPX">
            <button onClick={handleExportGPX} style={actionBtn}>GPX</button>
          </Row>
          <Row label="Export OADS">
            <button onClick={handleExportJSON} style={actionBtn}>OADS</button>
          </Row>
          <Row label="End Session">
            <button onClick={handleEndSession} style={{ ...actionBtn, background: theme.colors.red }}>End</button>
          </Row>
        </>
      )}

      <SectionHeader title="RECORDING" />
      <Row label="Record GPS Track">
        <Toggle value={recordTrack} onToggle={() => toggle('recordTrack')} />
      </Row>

      <SectionHeader title="MAP DISPLAY" />
      <Row label="Direction Line">
        <Toggle value={showDirectionLine} onToggle={() => toggle('showDirectionLine')} />
      </Row>
      <Row label="Distance Rings (0.5 / 1 / 2 nm)">
        <Toggle value={showDistanceRings} onToggle={() => toggle('showDistanceRings')} />
      </Row>

      <SectionHeader title="INSTRUMENTS" />
      <Row label="Top Strip">
        <Toggle value={showInstrumentStrip} onToggle={() => toggle('showInstrumentStrip')} />
      </Row>
      <Row label="Map Overlays">
        <Toggle value={showMapOverlays} onToggle={() => toggle('showMapOverlays')} />
      </Row>
      <Row label="Configure Strip &amp; Overlays">
        <button onClick={() => setShowInstrConfig(v => !v)} style={actionBtn}>
          {showInstrConfig ? 'Hide' : 'Edit'}
        </button>
      </Row>
      {showInstrConfig && <InstrumentConfigurator />}

      <SectionHeader title="INSTRUMENTS PAGE" />
      <PageLayoutPicker />

      <SectionHeader title="SESSION DATA" />
      <input
        id="session-import-input"
        type="file"
        accept=".json,.gpx,application/json,application/gpx+xml,text/xml"
        style={{ display: 'none' }}
        onChange={handleImportSessionFile}
      />
      <Row label="Import Session File">
        <label
          htmlFor="session-import-input"
          style={{
            ...actionBtn,
            display: 'inline-flex',
            alignItems: 'center',
          }}
        >
          Import
        </label>
      </Row>
      {importStatus && (
        <div style={{
          padding: '10px 16px', background: theme.colors.darkCard,
          borderBottom: `1px solid ${theme.colors.darkBorder}`,
          fontSize: theme.size.small, color: theme.colors.cream,
        }}>
          {importStatus}
        </div>
      )}

      <SectionHeader title="ABOUT" />
      <Row label="Version">
        <span style={{ fontSize: theme.size.small, color: theme.colors.dim }}>{__APP_VERSION__}</span>
      </Row>
      <Row label="Part of">
        <a
          href="https://aviatorstoolkit.com"
          target="_blank"
          rel="noopener noreferrer"
          style={{ fontSize: theme.size.small, color: theme.colors.magenta, textDecoration: 'none' }}
        >
          Aviator's Toolkit ↗
        </a>
      </Row>
    </div>
  )
}

const actionBtn: React.CSSProperties = {
  padding: '8px 16px', borderRadius: '6px', border: `1px solid ${theme.colors.darkBorder}`,
  background: theme.colors.darkCard, color: theme.colors.cream, cursor: 'pointer',
  fontFamily: 'inherit', fontSize: theme.size.small, minHeight: '36px',
}
