import { INSTRUMENT_LABELS, type InstrumentId } from '../../data/models'
import { theme } from '../theme'

const ALL_INSTRUMENTS: InstrumentId[] = [
  'gs', 'agl', 'msl', 'vs', 'hdg', 'dist', 'brg', 'brg_arrow',
  'etime', 'sess', 'maxalt', 'dtk', 'dtk_arrow', 'dte', 'xtk', 'ete',
]

const OVERLAY_INSTRUMENTS: Array<InstrumentId | null> = [null, ...ALL_INSTRUMENTS]

interface InstrumentPickerModalProps {
  current: InstrumentId | null
  /** Overlay slots allow "Off" (null); strip slots don't */
  includeNull: boolean
  onSelect: (id: InstrumentId | null) => void
  onClose: () => void
}

export function InstrumentPickerModal({ current, includeNull, onSelect, onClose }: InstrumentPickerModalProps) {
  const options: Array<InstrumentId | null> = includeNull ? OVERLAY_INSTRUMENTS : ALL_INSTRUMENTS

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 300,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: theme.colors.darkCard,
          border: `1px solid ${theme.colors.darkBorder}`,
          borderRadius: '16px', padding: '20px', width: '300px',
          maxHeight: '70vh', overflowY: 'auto',
          fontFamily: theme.font.primary,
        }}
      >
        <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '16px' }}>
          Choose Instrument
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          {options.map((id, i) => {
            const label = id ? INSTRUMENT_LABELS[id] : 'Off'
            const isActive = id === current
            return (
              <button
                key={id ?? `null-${i}`}
                onClick={() => { onSelect(id); onClose() }}
                style={{
                  padding: '12px 10px', borderRadius: '8px',
                  border: `2px solid ${isActive ? theme.colors.red : theme.colors.darkBorder}`,
                  background: isActive ? theme.colors.redDim : theme.colors.dark,
                  color: isActive ? theme.colors.cream : theme.colors.light,
                  cursor: 'pointer', fontFamily: theme.font.primary,
                  fontSize: theme.size.small, textAlign: 'center',
                  minHeight: theme.tapTarget,
                }}
              >
                {label}
              </button>
            )
          })}
        </div>
        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: '14px', padding: '12px', borderRadius: '8px',
            border: `1px solid ${theme.colors.darkBorder}`, background: 'none',
            color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary,
            fontSize: theme.size.body, minHeight: theme.tapTarget,
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  )
}
