import { useState } from 'react'
import { theme } from '../../theme'
import { USER_STAMP_TYPES, EVENT_LABELS, EVENT_COLORS } from '../../../data/logic/stamp-logic'
import type { StampEventType } from '../../../data/models'

interface StampModalProps {
  onSelect: (type: StampEventType, note: string | null) => void
  onClose: () => void
}

export function StampModal({ onSelect, onClose }: StampModalProps) {
  const [note, setNote] = useState('')
  const [selectedType, setSelectedType] = useState<StampEventType | null>(null)

  function handleConfirm() {
    if (!selectedType) {
      onSelect('custom', note.trim() || null)
    } else {
      onSelect(selectedType, note.trim() || null)
    }
  }

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: theme.navHeight,
        background: 'rgba(0,0,0,0.7)',
        zIndex: 400,
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div
        style={{
          background: theme.colors.darkCard,
          borderRadius: '16px 16px 0 0',
          width: '100%',
          maxWidth: '480px',
          padding: '20px 16px',
          paddingBottom: 'calc(20px + env(safe-area-inset-bottom))',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <h2 style={{ fontSize: '15px', color: theme.colors.cream, fontFamily: theme.font.primary, fontWeight: 700 }}>
            Stamp Event
          </h2>
          <button
            onClick={onClose}
            style={{ background: 'none', border: 'none', color: theme.colors.dim, cursor: 'pointer', fontSize: '20px', padding: '4px 8px', minHeight: theme.tapTarget }}
          >
            ✕
          </button>
        </div>

        {/* Event type grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '16px' }}>
          {USER_STAMP_TYPES.map(type => {
            const isSelected = selectedType === type
            return (
              <button
                key={type}
                onClick={() => setSelectedType(isSelected ? null : type)}
                style={{
                  padding: '12px 6px',
                  borderRadius: '8px',
                  border: `2px solid ${isSelected ? EVENT_COLORS[type] : theme.colors.darkBorder}`,
                  background: isSelected ? `rgba(${hexToRgb(EVENT_COLORS[type])}, 0.15)` : theme.colors.dark,
                  color: isSelected ? EVENT_COLORS[type] : theme.colors.light,
                  cursor: 'pointer',
                  fontFamily: theme.font.primary,
                  fontSize: '11px',
                  textAlign: 'center',
                  minHeight: theme.tapTarget,
                  lineHeight: 1.3,
                }}
              >
                {EVENT_LABELS[type]}
              </button>
            )
          })}
        </div>

        {/* Note field */}
        <input
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={e => setNote(e.target.value)}
          style={{
            width: '100%',
            padding: '12px',
            background: theme.colors.dark,
            border: `1px solid ${theme.colors.darkBorder}`,
            borderRadius: '8px',
            color: theme.colors.cream,
            fontFamily: theme.font.primary,
            fontSize: theme.size.body,
            marginBottom: '16px',
          }}
        />

        {/* Confirm */}
        <button
          onClick={handleConfirm}
          style={{
            width: '100%',
            padding: '14px',
            borderRadius: '8px',
            border: 'none',
            background: theme.colors.red,
            color: '#fff',
            cursor: 'pointer',
            fontFamily: theme.font.primary,
            fontSize: '15px',
            fontWeight: 700,
            minHeight: theme.tapTarget,
          }}
        >
          {selectedType ? `Stamp: ${EVENT_LABELS[selectedType]}` : 'Quick Stamp'}
        </button>
      </div>
    </div>
  )
}

function hexToRgb(hex: string): string {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return '255,255,255'
  return `${parseInt(result[1], 16)},${parseInt(result[2], 16)},${parseInt(result[3], 16)}`
}
