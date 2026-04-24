import type { InstrumentId } from '../models'

export type PageLayoutId = 'hero-pair' | 'six-pack' | 'big-hero' | 'quad'

export type SlotSize = 'hero' | 'large' | 'medium' | 'small'

export interface PageLayoutSlot {
  row: number
  col: number
  rowSpan?: number
  colSpan?: number
  size: SlotSize
}

export interface PageLayout {
  id: PageLayoutId
  name: string
  cols: number
  rows: number
  slots: PageLayoutSlot[]
  defaults: InstrumentId[]
}

export const PAGE_LAYOUTS: Record<PageLayoutId, PageLayout> = {
  'hero-pair': {
    id: 'hero-pair',
    name: 'Hero Pair',
    cols: 2,
    rows: 5,
    slots: [
      { row: 1, col: 1, size: 'hero' },
      { row: 1, col: 2, size: 'hero' },
      { row: 2, col: 1, size: 'medium' },
      { row: 2, col: 2, size: 'medium' },
      { row: 3, col: 1, size: 'medium' },
      { row: 3, col: 2, size: 'medium' },
      { row: 4, col: 1, size: 'medium' },
      { row: 4, col: 2, size: 'medium' },
      { row: 5, col: 1, size: 'medium' },
      { row: 5, col: 2, size: 'medium' },
    ],
    defaults: ['gs', 'agl', 'msl', 'vs', 'hdg', 'dist', 'brg', 'etime', 'sess', 'maxalt'],
  },
  'six-pack': {
    id: 'six-pack',
    name: 'Six-Pack',
    cols: 2,
    rows: 3,
    slots: [
      { row: 1, col: 1, size: 'large' },
      { row: 1, col: 2, size: 'large' },
      { row: 2, col: 1, size: 'large' },
      { row: 2, col: 2, size: 'large' },
      { row: 3, col: 1, size: 'large' },
      { row: 3, col: 2, size: 'large' },
    ],
    defaults: ['gs', 'agl', 'msl', 'vs', 'hdg', 'dist'],
  },
  'big-hero': {
    id: 'big-hero',
    name: 'Big Hero',
    cols: 3,
    rows: 3,
    slots: [
      { row: 1, col: 1, colSpan: 3, size: 'hero' },
      { row: 2, col: 1, size: 'medium' },
      { row: 2, col: 2, size: 'medium' },
      { row: 2, col: 3, size: 'medium' },
      { row: 3, col: 1, size: 'medium' },
      { row: 3, col: 2, size: 'medium' },
      { row: 3, col: 3, size: 'medium' },
    ],
    defaults: ['agl', 'gs', 'msl', 'vs', 'hdg', 'dist', 'etime'],
  },
  quad: {
    id: 'quad',
    name: 'Quad',
    cols: 2,
    rows: 2,
    slots: [
      { row: 1, col: 1, size: 'large' },
      { row: 1, col: 2, size: 'large' },
      { row: 2, col: 1, size: 'large' },
      { row: 2, col: 2, size: 'large' },
    ],
    defaults: ['gs', 'agl', 'hdg', 'msl'],
  },
}

export const PAGE_LAYOUT_IDS: PageLayoutId[] = ['hero-pair', 'six-pack', 'big-hero', 'quad']
export const DEFAULT_PAGE_LAYOUT_ID: PageLayoutId = 'hero-pair'

/** Slots for a new layout, preserving user picks where they line up and
 *  filling additional positions from the layout's defaults. */
export function resizePageSlots(
  layoutId: PageLayoutId,
  existing: InstrumentId[],
): InstrumentId[] {
  const layout = PAGE_LAYOUTS[layoutId]
  const next: InstrumentId[] = []
  for (let i = 0; i < layout.slots.length; i++) {
    next.push(existing[i] ?? layout.defaults[i])
  }
  return next
}
