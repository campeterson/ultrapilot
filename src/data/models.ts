// ─── Session ─────────────────────────────────────────────────────────────────

export interface Session {
  id: string          // ISO timestamp used as primary key
  startTime: string   // ISO
  endTime: string | null
  originLat: number
  originLon: number
  originAltMSL: number
  maxAGL: number
  totalDistanceNM: number
  deviceInfo: string
  deletedAt?: string | null  // ISO; set when soft-deleted to trash
}

// ─── Track Points ─────────────────────────────────────────────────────────────

export interface TrackPoint {
  sessionId: string
  ts: number        // unix ms
  lat: number
  lon: number
  altMSL: number    // meters
  speed: number     // m/s
  heading: number   // degrees
  accuracy: number  // meters
}

// ─── Events / Stamps ─────────────────────────────────────────────────────────

export type StampEventType =
  | 'session_start'
  | 'session_end'
  | 'takeoff'
  | 'landing'
  | 'engine_start'
  | 'engine_shutdown'
  | 'checklist_complete'
  | 'wing_layout'
  | 'weather'
  | 'waypoint'
  | 'preflight'
  | 'maneuver'
  | 'custom'

export interface StampEvent {
  id: string        // uuid
  sessionId: string
  ts: number        // unix ms
  type: StampEventType
  lat: number
  lon: number
  altMSL: number    // meters
  altAGL: number    // meters above origin
  speed: number     // m/s
  note: string | null
}

// ─── Checklists ───────────────────────────────────────────────────────────────

export type ChecklistCategory =
  | 'preflight'
  | 'before_takeoff'
  | 'in_flight'
  | 'before_landing'
  | 'post_flight'
  | 'custom'

export interface ChecklistItem {
  id: string
  text: string
  order: number
}

export interface Checklist {
  id: string
  name: string
  category: ChecklistCategory
  items: ChecklistItem[]
  createdAt: string  // ISO
  updatedAt: string  // ISO
}

// ─── Waypoints ───────────────────────────────────────────────────────────────

export interface Waypoint {
  id: string
  name: string
  lat: number
  lon: number
  note: string | null
  createdAt: string  // ISO
}

// ─── Airports ─────────────────────────────────────────────────────────────────

export interface Airport {
  id: string    // "KJEF"
  name: string
  lat: number
  lon: number
  elev: number  // ft MSL
}

// ─── Instruments ─────────────────────────────────────────────────────────────

export type InstrumentId =
  | 'gs'        // Ground speed (kt)
  | 'agl'       // Altitude AGL (ft)
  | 'msl'       // GPS altitude MSL (ft)
  | 'vs'        // Vertical speed (fpm)
  | 'hdg'       // Ground track (°)
  | 'dist'      // Distance to origin (nm)
  | 'brg'       // Bearing to origin (°)
  | 'brg_arrow' // Bearing to origin — arrow display
  | 'etime'     // Elapsed flight time
  | 'sess'      // Elapsed session time
  | 'maxalt'    // Max AGL this session (ft)
  | 'dtk'       // Desired track to direct-to (°)
  | 'dtk_arrow' // Bearing to direct-to — arrow display
  | 'dte'       // Distance to direct-to (nm)
  | 'xtk'       // Cross-track error (nm)
  | 'ete'       // Est. time enroute to direct-to (min)

export const INSTRUMENT_LABELS: Record<InstrumentId, string> = {
  gs: 'GND SPD',
  agl: 'AGL',
  msl: 'MSL',
  vs: 'V/S',
  hdg: 'TRACK',
  dist: 'DIST',
  brg: 'BRG',
  brg_arrow: '→ ORIG',
  etime: 'FLT',
  sess: 'SESS',
  maxalt: 'MAX AGL',
  dtk: 'DTK',
  dtk_arrow: '→ D→',
  dte: 'DTE',
  xtk: 'XTK',
  ete: 'ETE',
}

export const INSTRUMENT_UNITS: Record<InstrumentId, string> = {
  gs: 'kt',
  agl: 'ft',
  msl: 'ft',
  vs: 'fpm',
  hdg: '°',
  dist: 'nm',
  brg: '°',
  brg_arrow: '',
  etime: '',
  sess: '',
  maxalt: 'ft',
  dtk: '°',
  dtk_arrow: '',
  dte: 'nm',
  xtk: 'nm',
  ete: 'min',
}

export const INSTRUMENT_DESCRIPTIONS: Record<InstrumentId, string> = {
  gs: 'Ground speed',
  agl: 'Height above origin',
  msl: 'GPS altitude',
  vs: 'Climb/descent rate',
  hdg: 'Direction of travel',
  dist: 'Range from origin',
  brg: 'Heading to origin',
  brg_arrow: 'Arrow to origin',
  etime: 'Flight duration',
  sess: 'Session duration',
  maxalt: 'Peak AGL this session',
  dtk: 'Course to direct-to',
  dtk_arrow: 'Arrow to direct-to',
  dte: 'Range to direct-to',
  xtk: 'Off-course error',
  ete: 'Time to direct-to',
}

export const DEFAULT_INSTRUMENT_STRIP: InstrumentId[] = ['agl', 'msl', 'gs', 'hdg', 'dist', 'etime']

// ─── GPS Position ─────────────────────────────────────────────────────────────

export interface GPSPosition {
  lat: number
  lon: number
  altMSL: number    // meters
  speed: number     // m/s
  heading: number   // degrees
  accuracy: number  // meters
  ts: number        // unix ms
}
