import { useEffect } from 'react'
import { useChecklistStore } from '../../../state/checklist-store'
import { useTimelineStore, buildStamp } from '../../../state/timeline-store'
import { useSessionStore } from '../../../state/session-store'
import { useGPSStore } from '../../../state/gps-store'
import { sortedItems, progressOf } from '../../../data/logic/checklist-logic'
import { theme } from '../../theme'
import type { Checklist, ChecklistCategory } from '../../../data/models'

const CATEGORY_ORDER: ChecklistCategory[] = [
  'preflight',
  'before_takeoff',
  'in_flight',
  'before_landing',
  'post_flight',
  'custom',
]

const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  preflight: 'Preflight',
  before_takeoff: 'Before Takeoff',
  in_flight: 'In Flight',
  before_landing: 'Before Landing',
  post_flight: 'Post Flight',
  custom: 'Custom',
}

function groupByCategory(checklists: Checklist[]): { category: ChecklistCategory; items: Checklist[] }[] {
  const map = new Map<ChecklistCategory, Checklist[]>()
  for (const cl of checklists) {
    if (!map.has(cl.category)) map.set(cl.category, [])
    map.get(cl.category)!.push(cl)
  }
  return CATEGORY_ORDER
    .filter(cat => map.has(cat))
    .map(cat => ({ category: cat, items: map.get(cat)!.sort((a, b) => a.name.localeCompare(b.name)) }))
}

function ChecklistRow({ checklist, onOpen }: { checklist: Checklist; onOpen: () => void }) {
  const { runState, activeChecklistId } = useChecklistStore()
  const isActive = activeChecklistId === checklist.id
  const progress = isActive && runState ? progressOf(runState, checklist) : null

  const statusLabel = isActive
    ? progress?.done === checklist.items.length ? 'Done' : `${progress?.done}/${checklist.items.length}`
    : `${checklist.items.length} items`

  const statusColor = isActive && progress?.done === checklist.items.length
    ? theme.colors.green
    : isActive ? theme.colors.amber : theme.colors.dim

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        width: '100%',
        padding: '14px 16px',
        background: 'none',
        border: 'none',
        borderBottom: `1px solid ${theme.colors.darkBorder}`,
        borderLeft: isActive ? `3px solid ${theme.colors.amber}` : '3px solid transparent',
        color: theme.colors.cream,
        cursor: 'pointer',
        fontFamily: theme.font.primary,
        minHeight: theme.tapTarget,
        textAlign: 'left',
      }}
    >
      <span style={{ fontSize: theme.size.body }}>{checklist.name}</span>
      <span style={{ fontSize: theme.size.small, color: statusColor }}>{statusLabel}</span>
    </button>
  )
}

function ChecklistRunner({ checklist }: { checklist: Checklist }) {
  const { runState, toggleChecklistItem, closeRunner, isChecklistComplete } = useChecklistStore()
  const { addStamp } = useTimelineStore()
  const { session } = useSessionStore()

  const items = sortedItems(checklist)
  const complete = isChecklistComplete()

  async function handleComplete() {
    if (!session) return
    const pos = useGPSStore.getState().position
    await addStamp(buildStamp(
      session.id,
      'checklist_complete',
      pos?.lat ?? session.originLat,
      pos?.lon ?? session.originLon,
      pos?.altMSL ?? session.originAltMSL,
      0,
      pos?.speed ?? 0,
      checklist.name
    ))
    closeRunner()
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', fontFamily: theme.font.primary }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
        <button
          onClick={closeRunner}
          style={{ background: 'none', border: 'none', color: theme.colors.dim, cursor: 'pointer', fontSize: '20px', padding: '4px', minHeight: theme.tapTarget }}
        >
          ←
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ color: theme.colors.cream, fontWeight: 700, fontSize: theme.size.body }}>{checklist.name}</div>
          {runState && (
            <div style={{ color: theme.colors.dim, fontSize: theme.size.small }}>
              {runState.completed.size} of {checklist.items.length} items
            </div>
          )}
        </div>
      </div>

      {/* Items */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {items.map(item => {
          const checked = runState?.completed.has(item.id) ?? false
          return (
            <button
              key={item.id}
              onClick={() => toggleChecklistItem(item.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                width: '100%',
                padding: '14px 16px',
                background: 'none',
                border: 'none',
                borderBottom: `1px solid ${theme.colors.darkBorder}`,
                color: checked ? theme.colors.dim : theme.colors.cream,
                cursor: 'pointer',
                fontFamily: theme.font.primary,
                fontSize: theme.size.body,
                minHeight: theme.tapTarget,
                textAlign: 'left',
                textDecoration: checked ? 'line-through' : 'none',
              }}
            >
              <span style={{
                width: '22px', height: '22px', borderRadius: '4px', flexShrink: 0,
                border: `2px solid ${checked ? theme.colors.green : theme.colors.darkBorder}`,
                background: checked ? theme.colors.green : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '14px', color: '#fff',
              }}>
                {checked ? '✓' : ''}
              </span>
              {item.text}
            </button>
          )
        })}
      </div>

      {/* Complete button */}
      {complete && (
        <div style={{ padding: '12px 16px', borderTop: `1px solid ${theme.colors.darkBorder}` }}>
          <button
            onClick={handleComplete}
            style={{
              width: '100%', padding: '14px', borderRadius: '8px', border: 'none',
              background: theme.colors.green, color: '#fff', cursor: 'pointer',
              fontFamily: theme.font.primary, fontSize: '15px', fontWeight: 700,
              minHeight: theme.tapTarget,
            }}
          >
            ✓ Complete Checklist
          </button>
        </div>
      )}
    </div>
  )
}

export function ChecklistsPage() {
  const { checklists, loading, load, openRunner, activeChecklistId } = useChecklistStore()

  useEffect(() => { load() }, [])

  const activeChecklist = checklists.find(c => c.id === activeChecklistId)

  if (loading) {
    return <div style={{ padding: '24px', color: theme.colors.dim, fontFamily: theme.font.primary }}>Loading…</div>
  }

  if (activeChecklist) {
    return <ChecklistRunner checklist={activeChecklist} />
  }

  const groups = groupByCategory(checklists)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', background: theme.colors.dark, fontFamily: theme.font.primary }}>
      {/* Header */}
      <div style={{ padding: '14px 16px 10px', borderBottom: `1px solid ${theme.colors.darkBorder}`, flexShrink: 0 }}>
        <span style={{ fontSize: '15px', fontWeight: 700, color: theme.colors.cream }}>Checklists</span>
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {checklists.length === 0 ? (
          <div style={{ padding: '24px', textAlign: 'center', color: theme.colors.dim, fontSize: theme.size.body }}>
            No checklists yet. Add them in Settings.
          </div>
        ) : (
          groups.map(({ category, items }) => (
            <div key={category}>
              <div style={{
                padding: '8px 16px 6px',
                fontSize: theme.size.small,
                fontWeight: 700,
                color: theme.colors.dim,
                letterSpacing: '0.07em',
                textTransform: 'uppercase',
                borderBottom: `1px solid ${theme.colors.darkBorder}`,
                background: 'rgba(255,255,255,0.02)',
              }}>
                {CATEGORY_LABELS[category]}
              </div>
              {items.map(cl => (
                <ChecklistRow key={cl.id} checklist={cl} onOpen={() => openRunner(cl.id)} />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
