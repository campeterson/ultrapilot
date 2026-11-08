// Bottom navigation: every section in one user-ordered list. Map is always the
// first button (it's home); the first NAV_BAR_COUNT sections available in the
// current flight mode follow it, and the rest live under More. Pure.
import type { FlightMode } from '../models'

export type NavSection =
  | 'wind' | 'timeline' | 'checklists' | 'wx' | 'waypoints' | 'routes'
  | 'plan' | 'places' | 'live' | 'instruments' | 'sessions' | 'tilesets' | 'settings'

export interface NavSectionInfo {
  id: NavSection
  /** Short label for the bar. */
  label: string
  /** Full name: title bar and the More menu. */
  title: string
  icon: string
  /** Only offered in these flight modes (all when absent). */
  modes?: FlightMode[]
}

export const NAV_SECTIONS: NavSectionInfo[] = [
  { id: 'wind',        label: 'Wind',     title: 'Windreader',         icon: '≋', modes: ['lta'] },
  { id: 'timeline',    label: 'Timeline', title: 'Timeline',           icon: '◷' },
  { id: 'checklists',  label: 'Lists',    title: 'Checklists',         icon: '☑' },
  { id: 'wx',          label: 'Wx/Apt',   title: 'Weather & Airports', icon: '⛅' },
  { id: 'waypoints',   label: 'Wpts',     title: 'Waypoints',          icon: '⌖' },
  { id: 'routes',      label: 'Routes',   title: 'Routes',             icon: '✈', modes: ['powered'] },
  { id: 'plan',        label: 'Plan',     title: 'Flight Plan',        icon: '▲' },
  { id: 'places',      label: 'Places',   title: 'Places',             icon: '▦' },
  { id: 'live',        label: 'Live',     title: 'Live Group',         icon: '◉' },
  { id: 'instruments', label: 'Instr',    title: 'Instruments',        icon: '◈' },
  { id: 'sessions',    label: 'Sessions', title: 'Sessions',           icon: '◷' },
  { id: 'tilesets',    label: 'Maps',     title: 'Offline Maps',       icon: '◱' },
  { id: 'settings',    label: 'Settings', title: 'Settings',           icon: '⚙' },
]

/** Buttons after Map before More. */
export const NAV_BAR_COUNT = 4

export const DEFAULT_NAV_ORDER: NavSection[] = NAV_SECTIONS.map(s => s.id)

export function sectionInfo(id: NavSection): NavSectionInfo {
  return NAV_SECTIONS.find(s => s.id === id)!
}

const isSection = (v: unknown): v is NavSection => NAV_SECTIONS.some(s => s.id === v)

/** A saved order made whole: unknown ids dropped, duplicates removed, new sections appended. */
export function normalizeNavOrder(saved: unknown): NavSection[] {
  const list = Array.isArray(saved) ? saved.filter(isSection) : []
  const seen = new Set<NavSection>()
  const out: NavSection[] = []
  for (const id of [...list, ...DEFAULT_NAV_ORDER]) if (!seen.has(id)) { seen.add(id); out.push(id) }
  return out
}

export function isAvailable(id: NavSection, mode: FlightMode): boolean {
  const m = sectionInfo(id).modes
  return !m || m.includes(mode)
}

/** The bar (first NAV_BAR_COUNT available) and More (the rest), in order. */
export function splitNav(order: NavSection[], mode: FlightMode): { bar: NavSection[]; more: NavSection[] } {
  const available = order.filter(id => isAvailable(id, mode))
  return { bar: available.slice(0, NAV_BAR_COUNT), more: available.slice(NAV_BAR_COUNT) }
}

/**
 * Move a section up (−1) or down (+1) among the sections available in `mode`.
 * Sections for the other flight mode keep their slots, so switching modes
 * doesn't scramble either mode's order.
 */
export function moveSection(order: NavSection[], mode: FlightMode, id: NavSection, delta: -1 | 1): NavSection[] {
  const available = order.filter(s => isAvailable(s, mode))
  const i = available.indexOf(id)
  const j = i + delta
  if (i < 0 || j < 0 || j >= available.length) return order
  ;[available[i], available[j]] = [available[j], available[i]]
  let k = 0
  return order.map(s => (isAvailable(s, mode) ? available[k++] : s))
}
