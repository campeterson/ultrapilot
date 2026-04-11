import { useState } from 'react'
import { useInstrumentStore } from '../../state/instrument-store'
import { useResponsiveLayout } from '../hooks/useResponsiveLayout'
import { INSTRUMENT_LABELS, INSTRUMENT_UNITS, type InstrumentId } from '../../data/models'
import { formatInstrumentValue, getInstrumentColor } from '../../data/logic/instrument-logic'
import { theme } from '../theme'
import { InstrumentPickerModal } from './InstrumentPickerModal'

export function InstrumentStrip() {
  const { strip, values, stripCount, setStrip } = useInstrumentStore()
  const layout = useResponsiveLayout()
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)

  function handlePick(newId: InstrumentId | null) {
    if (newId === null || pickerIndex === null) return
    const next = [...strip]
    next[pickerIndex] = newId
    setStrip(next)
    setPickerIndex(null)
  }

  // Phone caps at 4 regardless of user preference; tablet respects stripCount
  const maxVisible = layout === 'phone' ? Math.min(stripCount, 4) : stripCount
  const visibleStrip = strip.slice(0, maxVisible)

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: theme.safeStripHeight,
        background: theme.colors.stripBg,
        borderBottom: `1px solid ${theme.colors.darkBorder}`,
        display: 'flex',
        alignItems: 'stretch',
        zIndex: 100,
        backdropFilter: 'blur(8px)',
        paddingTop: 'env(safe-area-inset-top)',
      }}
    >
      {pickerIndex !== null && (
        <InstrumentPickerModal
          current={strip[pickerIndex] ?? null}
          includeNull={false}
          onSelect={handlePick}
          onClose={() => setPickerIndex(null)}
        />
      )}
      {visibleStrip.map((id, idx) => {
        const label = INSTRUMENT_LABELS[id]
        const unit = INSTRUMENT_UNITS[id]
        const displayValue = values ? formatInstrumentValue(id, values) : '—'
        const valueColor = values ? getInstrumentColor(id, values) : theme.colors.cream

        // Find real strip index (not sliced index) for the picker
        const realIndex = strip.indexOf(id, idx)

        return (
          <div
            key={`${id}-${idx}`}
            onClick={() => setPickerIndex(realIndex >= 0 ? realIndex : idx)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRight: idx < visibleStrip.length - 1 ? `1px solid ${theme.colors.darkBorder}` : 'none',
              padding: '0 4px',
              minWidth: 0,
              cursor: 'pointer',
            }}
          >
            <span
              style={{
                fontSize: theme.size.instrumentLabel,
                color: theme.colors.dim,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                lineHeight: 1,
                marginBottom: '3px',
                whiteSpace: 'nowrap',
              }}
            >
              {label}
            </span>
            <span style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
              <span
                style={{
                  fontSize: theme.size.instrumentValue,
                  color: valueColor,
                  fontFamily: theme.font.mono,
                  fontWeight: 700,
                  lineHeight: 1,
                }}
              >
                {displayValue}
              </span>
              {unit && (
                <span
                  style={{
                    fontSize: theme.size.tiny,
                    color: theme.colors.dim,
                    lineHeight: 1,
                  }}
                >
                  {unit}
                </span>
              )}
            </span>
          </div>
        )
      })}
    </div>
  )
}
