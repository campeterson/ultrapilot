import { create } from 'zustand'
import { listChecklists, putChecklist, deleteChecklist } from '../data/db'
import { resetChecklist, toggleItem, isComplete, type ChecklistRunState } from '../data/logic/checklist-logic'
import type { Checklist } from '../data/models'
import { PPC_DEFAULT_CHECKLISTS } from '../data/defaults/ppc-checklists'

interface ChecklistStore {
  checklists: Checklist[]
  loading: boolean

  // Runner state: which checklist is active + item completion state
  activeChecklistId: string | null
  runState: ChecklistRunState | null

  load: () => Promise<void>
  save: (cl: Checklist) => Promise<void>
  remove: (id: string) => Promise<void>

  openRunner: (id: string) => void
  closeRunner: () => void
  toggleChecklistItem: (itemId: string) => void
  isChecklistComplete: () => boolean
}

export const useChecklistStore = create<ChecklistStore>((set, get) => ({
  checklists: [],
  loading: false,
  activeChecklistId: null,
  runState: null,

  load: async () => {
    set({ loading: true })
    let checklists = await listChecklists()
    if (checklists.length === 0) {
      await Promise.all(PPC_DEFAULT_CHECKLISTS.map(putChecklist))
      checklists = await listChecklists()
    }
    set({ checklists, loading: false })
  },

  save: async (cl) => {
    await putChecklist(cl)
    const checklists = await listChecklists()
    set({ checklists })
  },

  remove: async (id) => {
    await deleteChecklist(id)
    const checklists = await listChecklists()
    set({ checklists })
  },

  openRunner: (id) => {
    set({ activeChecklistId: id, runState: resetChecklist(id) })
  },

  closeRunner: () => {
    set({ activeChecklistId: null, runState: null })
  },

  toggleChecklistItem: (itemId) => {
    const { runState } = get()
    if (!runState) return
    set({ runState: toggleItem(runState, itemId) })
  },

  isChecklistComplete: () => {
    const { runState, activeChecklistId, checklists } = get()
    if (!runState || !activeChecklistId) return false
    const cl = checklists.find(c => c.id === activeChecklistId)
    if (!cl) return false
    return isComplete(runState, cl)
  },
}))
