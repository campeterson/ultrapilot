import type { StampEvent, StampEventType } from '../models'

/** Color coding for event types */
export const EVENT_COLORS: Record<StampEventType, string> = {
  session_start: '#3498db',
  session_end: '#3498db',
  takeoff: '#27ae60',
  landing: '#27ae60',
  engine_start: '#e67e22',
  engine_shutdown: '#e67e22',
  checklist_complete: '#27ae60',
  wing_layout: '#ccd',
  custom: '#ccd',
}

/** Human-readable labels */
export const EVENT_LABELS: Record<StampEventType, string> = {
  session_start: 'Session Start',
  session_end: 'Session End',
  takeoff: 'Takeoff',
  landing: 'Landing',
  engine_start: 'Engine Start',
  engine_shutdown: 'Engine Shutdown',
  checklist_complete: 'Checklist Complete',
  wing_layout: 'Wing Layout',
  custom: 'Custom Event',
}

/** Stamp types available to the user via the STAMP picker */
export const USER_STAMP_TYPES: StampEventType[] = [
  'wing_layout',
  'engine_start',
  'engine_shutdown',
  'takeoff',
  'landing',
  'custom',
]

/** Detect which engine cycle we're in based on prior events.
 *  PPC has two engine cycles: warmup (before takeoff) and flight (during flight).
 */
export function detectEngineCycle(events: StampEvent[]): 'warmup' | 'flight' | null {
  const hasTakeoff = events.some(e => e.type === 'takeoff')
  const hasLanding = events.some(e => e.type === 'landing')
  if (hasTakeoff && !hasLanding) return 'flight'
  return 'warmup'
}

/** Build a stamp sub-detail line for display in the timeline */
export function buildEventDetail(event: StampEvent, completionCount?: number): string {
  switch (event.type) {
    case 'session_start':
    case 'session_end':
      return `${event.lat.toFixed(4)}°, ${event.lon.toFixed(4)}°`
    case 'takeoff':
    case 'landing':
      return `AGL ${Math.round(event.altAGL * 3.28084)} ft  ·  ${Math.round(event.speed * 1.94384)} kt`
    case 'engine_start': {
      const cycle = event.note ?? 'warmup'
      return `Cycle: ${cycle}`
    }
    case 'checklist_complete':
      return completionCount !== undefined
        ? `Checklist completed (${completionCount} items)`
        : 'Checklist completed'
    default:
      return `${event.lat.toFixed(4)}°, ${event.lon.toFixed(4)}°${event.note ? `  ·  ${event.note}` : ''}`
  }
}
