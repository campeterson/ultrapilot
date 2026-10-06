import { useState } from 'react'
import { useInstrumentStore } from '../../state/instrument-store'
import { useResponsiveLayout } from '../hooks/useResponsiveLayout'
import { INSTRUMENT_LABELS, type InstrumentId } from '../../data/models'
import { formatInstrumentValue, instrumentUnit, getInstrumentColor, isInstrumentAvailable } from '../../data/logic/instrument-logic'
import { useFlightModeStore } from '../../state/flight-mode-store'
import { theme } from '../theme'
import { useUnits } from '../hooks/useUnits'
import { InstrumentPickerModal } from './InstrumentPickerModal'

export function InstrumentStrip() {
  const { strip, values, stripCount, setStrip } = useInstrumentStore()
  const units = useUnits()
  const layout = useResponsiveLayout()
  const [pickerIndex, setPickerIndex] = useState<number | null>(null)
  const mode = useFlightModeStore(s => s.mode)

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
    <>
      {pickerIndex !== null && (
        <InstrumentPickerModal
          current={strip[pickerIndex] ?? null}
          includeNull={false}
          onSelect={handlePick}
          onClose={() => setPickerIndex(null)}
        />
      )}
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
        paddingLeft: theme.safeLeft,
        paddingRight: theme.safeRight,
      }}
    >
      {visibleStrip.map((id, idx) => {
        // HSI is a composite SVG instrument — not suited for the text strip
        if (id === 'hsi') return null
        // Course instruments are hidden in LTA mode (slot config is kept)
        if (!isInstrumentAvailable(id, mode)) return null

        const label = INSTRUMENT_LABELS[id]
        const unit = instrumentUnit(id, units)
        const displayValue = values ? formatInstrumentValue(id, values, units) : '—'
        const valueColor = values ? getInstrumentColor(id, values, mode) : theme.colors.cream

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
    </>
  )
}
