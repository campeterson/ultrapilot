import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { theme } from '../../theme'
import { inviteLink } from '../../../data/logic/live-logic'
import { buttonStyle } from '../plan/plan-styles'

/** Share the invite: share sheet, copy, or a big QR code for the briefing. */
export function LiveInvite({ secret }: { secret: string }) {
  const link = inviteLink(window.location.origin, secret)
  const [copied, setCopied] = useState(false)
  const [qr, setQr] = useState<string | null>(null)
  const canShare = typeof navigator.share === 'function'

  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(false), 2000); return () => clearTimeout(t) }, [copied])

  async function share() {
    try { await navigator.share({ title: 'UltraPilot Live Group', text: 'Join my UltraPilot Live Group', url: link }) } catch { /* cancelled */ }
  }
  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true) } catch { /* not allowed */ }
  }
  async function showQr() {
    setQr(await QRCode.toDataURL(link, { width: 640, margin: 2, errorCorrectionLevel: 'M' }))
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: '6px' }}>
        {canShare && <button onClick={share} style={{ ...buttonStyle(true), flex: 1 }}>Share invite</button>}
        <button onClick={copy} style={{ ...buttonStyle(), flex: 1 }}>{copied ? '✓ Copied' : 'Copy link'}</button>
        <button onClick={showQr} style={{ ...buttonStyle(), flex: 1 }}>QR code</button>
      </div>
      <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '6px', lineHeight: 1.4 }}>
        Anyone with the link can see and share positions in this group. Positions are encrypted on the device — the server can’t read them.
      </div>
      {qr && (
        <div onClick={() => setQr(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: theme.screenBottom, background: 'rgba(0,0,0,0.85)', zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px' }}>
          <img src={qr} alt="Live Group invite QR code" style={{ width: 'min(80vw, 80vh, 420px)', height: 'auto', background: '#fff', borderRadius: '12px' }} />
          <div style={{ color: theme.colors.cream, fontFamily: theme.font.primary, fontSize: theme.size.body, textAlign: 'center' }}>Scan with the camera to join · tap to close</div>
        </div>
      )}
    </div>
  )
}
