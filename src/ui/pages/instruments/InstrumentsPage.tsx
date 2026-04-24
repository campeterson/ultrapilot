import { useState } from 'react'
import { useInstrumentStore } from '../../../state/instrument-store'
import { INSTRUMENT_LABELS, INSTRUMENT_UNITS, type InstrumentId } from '../../../data/models'
import { formatInstrumentValue, getInstrumentColor } from '../../../data/logic/instrument-logic'
import { PAGE_LAYOUTS, type PageLayoutSlot, type SlotSize } from '../../../data/logic/instrument-layouts'
import { InstrumentPickerModal } from '../../shell/InstrumentPickerModal'
import { theme } from '../../theme'

const SIZE_STYLE: Record<SlotSize, { value: string; label: string; padding: string; minHeight: string }> = {
  hero:   { value: theme.size.heroValue, label: theme.size.small, padding: '18px 12px', minHeight: '110px' },
  large:  { value: '32px',                label: theme.size.small, padding: '14px 10px', minHeight: '88px'  },
  medium: { value: '22px',                label: theme.size.tiny,  padding: '10px 8px',  minHeight: '68px'  },
  small:  { value: '18px',                label: theme.size.tiny,  padding: '8px 6px',   minHeight: '56px'  },
}

function SlotCard({ slot, id, onClick }: { slot: PageLayoutSlot; id: InstrumentId | undefined; onClick: () => void }) {
  const { values } = useInstrumentStore()
  const s = SIZE_STYLE[slot.size]

  const label = id ? INSTRUMENT_LABELS[id] : '+ Add'
  const unit = id ? INSTRUMENT_UNITS[id] : ''
  const displayValue = id && values ? formatInstrumentValue(id, values) : '—'
  const valueColor = id && values ? getInstrumentColor(id, values) : theme.colors.cream

  return (
    <button
      onClick={onClick}
      style={{
        gridColumn: `${slot.col} / span ${slot.colSpan ?? 1}`,
        gridRow: `${slot.row} / span ${slot.rowSpan ?? 1}`,
        background: theme.colors.darkCard,
        border: `1px solid ${theme.colors.darkBorder}`,
        borderRadius: '10px',
        padding: s.padding,
        minHeight: s.minHeight,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: '6px',
        cursor: 'pointer',
        fontFamily: theme.font.primary,
        color: theme.colors.cream,
        textAlign: 'center',
      }}
    >
      <div style={{ fontSize: s.label, color: theme.colors.dim, letterSpacing: '0.08em', lineHeight: 1 }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '3px', lineHeight: 1 }}>
        <span style={{ fontSize: s.value, color: valueColor, fontFamily: theme.font.mono, fontWeight: 700, lineHeight: 1 }}>
          {displayValue}
        </span>
        {unit && <span style={{ fontSize: theme.size.small, color: theme.colors.dim }}>{unit}</span>}
      </div>
    </button>
  )
}

export function InstrumentsPage() {
  const { pageLayoutId, pageSlots, setPageSlot } = useInstrumentStore()
  const [pickerSlot, setPickerSlot] = useState<number | null>(null)
  const layout = PAGE_LAYOUTS[pageLayoutId]

  function handlePick(id: InstrumentId | null) {
    if (id === null || pickerSlot === null) return
    setPageSlot(pickerSlot, id)
    setPickerSlot(null)
  }

  return (
    <div
      style={{
        height: '100%', overflowY: 'auto', padding: '12px',
        background: theme.colors.dark, fontFamily: theme.font.primary,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${layout.cols}, 1fr)`,
          gridTemplateRows: `repeat(${layout.rows}, auto)`,
          gap: '8px',
        }}
      >
        {layout.slots.map((slot, i) => (
          <SlotCard
            key={i}
            slot={slot}
            id={pageSlots[i]}
            onClick={() => setPickerSlot(i)}
          />
        ))}
      </div>

      {pickerSlot !== null && (
        <InstrumentPickerModal
          current={pageSlots[pickerSlot] ?? null}
          includeNull={false}
          onSelect={id => handlePick(id as InstrumentId)}
          onClose={() => setPickerSlot(null)}
        />
      )}
    </div>
  )
}
