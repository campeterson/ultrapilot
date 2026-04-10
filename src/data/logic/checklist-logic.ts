import type { Checklist, ChecklistItem } from '../models'

export interface ChecklistRunState {
  checklistId: string
  completed: Set<string>  // item IDs
}

export function progressOf(state: ChecklistRunState, checklist: Checklist): { done: number; total: number } {
  return { done: state.completed.size, total: checklist.items.length }
}

export function isComplete(state: ChecklistRunState, checklist: Checklist): boolean {
  return state.completed.size >= checklist.items.length
}

export function toggleItem(state: ChecklistRunState, itemId: string): ChecklistRunState {
  const next = new Set(state.completed)
  if (next.has(itemId)) {
    next.delete(itemId)
  } else {
    next.add(itemId)
  }
  return { ...state, completed: next }
}

export function resetChecklist(checklistId: string): ChecklistRunState {
  return { checklistId, completed: new Set() }
}

/** Sort checklist items by their order field */
export function sortedItems(checklist: Checklist): ChecklistItem[] {
  return [...checklist.items].sort((a, b) => a.order - b.order)
}

/** Generate a new item with the next order value */
export function newItem(text: string, existingItems: ChecklistItem[]): ChecklistItem {
  const maxOrder = existingItems.reduce((max, i) => Math.max(max, i.order), -1)
  return { id: crypto.randomUUID(), text, order: maxOrder + 1 }
}
