import { useState } from 'react'
import { createPortal } from 'react-dom'
import { INSTRUMENT_LABELS, INSTRUMENT_UNITS, INSTRUMENT_DESCRIPTIONS, INSTRUMENT_GROUPS, type InstrumentId } from '../../data/models'
import { useSessionStore } from '../../state/session-store'
import { useGPSStore } from '../../state/gps-store'
import { useInstrumentStore } from '../../state/instrument-store'
import { theme } from '../theme'

interface InstrumentButtonProps {
  id: InstrumentId | null
  current: InstrumentId | null
  showDetails: boolean
  onSelect: (id: InstrumentId | null) => void
  onClose: () => void
}

function InstrumentButton({ id, current, showDetails, onSelect, onClose }: InstrumentButtonProps) {
  const label = id ? INSTRUMENT_LABELS[id] : 'Off'
  const unit = id ? INSTRUMENT_UNITS[id] : ''
  const desc = id ? INSTRUMENT_DESCRIPTIONS[id] : ''
  const isActive = id === current
  return (
    <button
      onClick={() => { onSelect(id); onClose() }}
      style={{
        padding: showDetails ? '8px 8px' : '12px 10px', borderRadius: '8px',
        border: `2px solid ${isActive ? theme.colors.red : theme.colors.darkBorder}`,
        background: isActive ? theme.colors.redDim : theme.colors.dark,
        color: isActive ? theme.colors.cream : theme.colors.light,
        cursor: 'pointer', fontFamily: theme.font.primary,
        fontSize: theme.size.small, textAlign: 'center',
        minHeight: theme.tapTarget,
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: '2px',
      }}
    >
      <div>{label}{showDetails && unit ? ` (${unit})` : ''}</div>
      {showDetails && desc && (
        <div style={{ fontSize: '10px', color: theme.colors.dim, lineHeight: 1.2 }}>
          {desc}
        </div>
      )}
    </button>
  )
}

interface InstrumentPickerModalProps {
  current: InstrumentId | null
  /** Overlay slots allow "Off" (null); strip slots don't */
  includeNull: boolean
  onSelect: (id: InstrumentId | null) => void
  onClose: () => void
}

export function InstrumentPickerModal({ current, includeNull, onSelect, onClose }: InstrumentPickerModalProps) {
  const session = useSessionStore(s => s.session)
  const resetOrigin = useSessionStore(s => s.resetOrigin)
  const position = useGPSStore(s => s.position)
  const resetMaxAGL = useInstrumentStore(s => s.resetMaxAGL)
  const [confirmZero, setConfirmZero] = useState(false)
  const [showDetails, setShowDetails] = useState(false)

  const canZero = !!session && !!position

  async function handleZero() {
    if (!session || !position) return
    await resetOrigin(position.lat, position.lon, position.altMSL)
    resetMaxAGL()
    setConfirmZero(false)
    onClose()
  }

  return createPortal(
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
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: '12px', marginBottom: '16px',
          }}
        >
          <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream }}>
            Choose Instrument
          </div>
          {canZero && (
            <button
              onClick={() => setConfirmZero(true)}
              style={{
                padding: '6px 10px', borderRadius: '6px',
                border: `1px solid ${theme.colors.darkBorder}`,
                background: 'none', color: theme.colors.light,
                cursor: 'pointer', fontFamily: theme.font.primary,
                fontSize: theme.size.small, whiteSpace: 'nowrap',
              }}
            >
              Zero AGL
            </button>
          )}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {includeNull && (
            <InstrumentButton
              id={null}
              current={current}
              showDetails={showDetails}
              onSelect={onSelect}
              onClose={onClose}
            />
          )}
          {INSTRUMENT_GROUPS.map(group => (
            <div key={group.name}>
              <div style={{
                fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em',
                color: theme.colors.dim, textTransform: 'uppercase',
                marginBottom: '6px',
              }}>
                {group.name}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                {group.ids.map(id => (
                  <InstrumentButton
                    key={id}
                    id={id}
                    current={current}
                    showDetails={showDetails}
                    onSelect={onSelect}
                    onClose={onClose}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
        <button
          onClick={() => setShowDetails(d => !d)}
          style={{
            width: '100%', marginTop: '14px', padding: '10px', borderRadius: '8px',
            border: `1px solid ${theme.colors.darkBorder}`, background: 'none',
            color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary,
            fontSize: theme.size.small, minHeight: theme.tapTarget,
          }}
        >
          {showDetails ? 'Hide Details' : 'Show Details'}
        </button>
        <button
          onClick={onClose}
          style={{
            width: '100%', marginTop: '8px', padding: '12px', borderRadius: '8px',
            border: `1px solid ${theme.colors.darkBorder}`, background: 'none',
            color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary,
            fontSize: theme.size.body, minHeight: theme.tapTarget,
          }}
        >
          Cancel
        </button>
      </div>

      {confirmZero && (
        <div
          onClick={(e) => { e.stopPropagation(); setConfirmZero(false) }}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 310,
          }}
        >
          <div
            onClick={e => e.stopPropagation()}
            style={{
              background: theme.colors.darkCard,
              border: `1px solid ${theme.colors.darkBorder}`,
              borderRadius: '16px', padding: '20px', width: '280px',
              fontFamily: theme.font.primary,
            }}
          >
            <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '8px' }}>
              Zero AGL?
            </div>
            <div style={{ fontSize: theme.size.small, color: theme.colors.light, marginBottom: '16px', lineHeight: 1.4 }}>
              Set the current altitude as the AGL baseline for this session. Max AGL will also reset.
            </div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => setConfirmZero(false)}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px',
                  border: `1px solid ${theme.colors.darkBorder}`, background: 'none',
                  color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary,
                  fontSize: theme.size.body, minHeight: theme.tapTarget,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleZero}
                style={{
                  flex: 1, padding: '12px', borderRadius: '8px',
                  border: `2px solid ${theme.colors.red}`,
                  background: theme.colors.redDim, color: theme.colors.cream,
                  cursor: 'pointer', fontFamily: theme.font.primary, fontWeight: 700,
                  fontSize: theme.size.body, minHeight: theme.tapTarget,
                }}
              >
                Zero
              </button>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  )
}
