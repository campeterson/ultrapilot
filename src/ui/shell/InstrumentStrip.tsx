import { useInstrumentStore } from '../../state/instrument-store'
import { useResponsiveLayout } from '../hooks/useResponsiveLayout'
import { INSTRUMENT_LABELS, INSTRUMENT_UNITS } from '../../data/models'
import { formatInstrumentValue, getInstrumentColor } from '../../data/logic/instrument-logic'
import { theme } from '../theme'

export function InstrumentStrip() {
  const { strip, values } = useInstrumentStore()
  const layout = useResponsiveLayout()

  // Phone only has room for 4; tablet/desktop shows all 6
  const visibleStrip = layout === 'phone' ? strip.slice(0, 4) : strip

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
      {visibleStrip.map((id, idx) => {
        const label = INSTRUMENT_LABELS[id]
        const unit = INSTRUMENT_UNITS[id]
        const displayValue = values ? formatInstrumentValue(id, values) : '—'
        const valueColor = values ? getInstrumentColor(id, values) : theme.colors.cream

        return (
          <div
            key={id}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              borderRight: idx < visibleStrip.length - 1 ? `1px solid ${theme.colors.darkBorder}` : 'none',
              padding: '0 4px',
              minWidth: 0,
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
