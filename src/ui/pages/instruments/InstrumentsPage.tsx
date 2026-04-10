import { useInstrumentStore } from '../../../state/instrument-store'
import { INSTRUMENT_LABELS, INSTRUMENT_UNITS } from '../../../data/models'
import { formatInstrumentValue } from '../../../data/logic/instrument-logic'
import { theme } from '../../theme'
import type { InstrumentId } from '../../../data/models'

const HERO_INSTRUMENTS: InstrumentId[] = ['gs', 'agl']
const GRID_INSTRUMENTS: InstrumentId[] = ['msl', 'vs', 'hdg', 'dist', 'brg', 'etime', 'sess', 'maxalt']

function HeroInstrument({ id }: { id: InstrumentId }) {
  const { values } = useInstrumentStore()
  const label = INSTRUMENT_LABELS[id]
  const unit = INSTRUMENT_UNITS[id]
  const displayValue = values ? formatInstrumentValue(id, values) : '—'

  return (
    <div
      style={{
        flex: 1, background: theme.colors.darkCard, borderRadius: '10px',
        padding: '16px', textAlign: 'center',
      }}
    >
      <div style={{ fontSize: theme.size.small, color: theme.colors.dim, letterSpacing: '0.08em', marginBottom: '8px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '4px' }}>
        <span style={{ fontSize: theme.size.heroValue, color: theme.colors.cream, fontFamily: theme.font.mono, fontWeight: 700 }}>
          {displayValue}
        </span>
        {unit && <span style={{ fontSize: theme.size.small, color: theme.colors.dim }}>{unit}</span>}
      </div>
    </div>
  )
}

function GridInstrument({ id }: { id: InstrumentId }) {
  const { values } = useInstrumentStore()
  const label = INSTRUMENT_LABELS[id]
  const unit = INSTRUMENT_UNITS[id]
  const displayValue = values ? formatInstrumentValue(id, values) : '—'

  return (
    <div
      style={{
        background: theme.colors.darkCard, borderRadius: '8px',
        padding: '12px', textAlign: 'center',
      }}
    >
      <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, letterSpacing: '0.06em', marginBottom: '4px' }}>
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: '2px' }}>
        <span style={{ fontSize: '20px', color: theme.colors.cream, fontFamily: theme.font.mono, fontWeight: 700 }}>
          {displayValue}
        </span>
        {unit && <span style={{ fontSize: theme.size.tiny, color: theme.colors.dim }}>{unit}</span>}
      </div>
    </div>
  )
}

export function InstrumentsPage() {
  return (
    <div
      style={{
        height: '100%', overflowY: 'auto', padding: '12px',
        background: theme.colors.dark, fontFamily: theme.font.primary,
        display: 'flex', flexDirection: 'column', gap: '8px',
      }}
    >
      {/* Hero row */}
      <div style={{ display: 'flex', gap: '8px' }}>
        {HERO_INSTRUMENTS.map(id => <HeroInstrument key={id} id={id} />)}
      </div>

      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
        {GRID_INSTRUMENTS.map(id => <GridInstrument key={id} id={id} />)}
      </div>
    </div>
  )
}
