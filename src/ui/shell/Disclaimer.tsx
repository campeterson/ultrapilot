import { useState } from 'react'
import { theme } from '../theme'

const K = 'atk-up-disclaimer-accepted'

export function Disclaimer() {
  const [accepted, setAccepted] = useState(() => !!localStorage.getItem(K))

  if (accepted) return null

  function handleAccept() {
    localStorage.setItem(K, '1')
    setAccepted(true)
  }

  return (
    <div
      role="dialog"
      aria-modal
      aria-labelledby="disclaimer-heading"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99999,
        background: 'rgba(0, 0, 0, 0.82)',
        backdropFilter: 'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        padding: '24px',
      }}
    >
      <div
        style={{
          background: theme.colors.darkCard,
          border: `1px solid ${theme.colors.darkBorder}`,
          borderRadius: '16px',
          maxWidth: '480px',
          width: '100%',
          padding: '28px 28px 24px',
          boxShadow: '0 24px 64px rgba(0, 0, 0, 0.6)',
        }}
      >
        <p
          style={{
            fontFamily: theme.font.mono,
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.12em',
            textTransform: 'uppercase',
            color: theme.colors.red,
            margin: '0 0 10px',
          }}
        >
          Aviator's Toolkit
        </p>
        <h2
          id="disclaimer-heading"
          style={{
            fontFamily: theme.font.primary,
            fontSize: '22px',
            fontWeight: 700,
            color: theme.colors.light,
            margin: '0 0 14px',
          }}
        >
          Disclaimer
        </h2>
        <p
          style={{
            fontSize: '14px',
            color: theme.colors.dim,
            lineHeight: 1.7,
            margin: '0 0 24px',
          }}
        >
          This app is provided free of charge, as-is, with no warranty of any kind. It is intended
          as a flight planning and reference aid only — not a substitute for official charts,
          NOTAMs, weather briefings, regulatory requirements, or qualified flight instruction.
          Always exercise pilot-in-command judgment and consult authoritative sources. The developer
          assumes no responsibility for any damages, losses, or incidents arising from use of this
          app.
        </p>
        <button
          onClick={handleAccept}
          style={{
            display: 'block',
            width: '100%',
            padding: '16px',
            fontFamily: theme.font.mono,
            fontSize: '14px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: '#fff',
            background: theme.colors.red,
            border: 'none',
            borderRadius: '8px',
            cursor: 'pointer',
          }}
        >
          I Understand
        </button>
      </div>
    </div>
  )
}
