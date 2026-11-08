import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { theme } from '../../theme'
import { codeShareText, inviteLink } from '../../../data/logic/live-logic'
import { buttonStyle } from '../plan/plan-styles'

/**
 * Invite others. The group code comes first: copy or share it, and the other
 * person pastes it into their installed app (a tapped link would open the
 * browser instead). A link / QR stays available for crew without the app.
 */
export function LiveInvite({ secret }: { secret: string }) {
  const link = inviteLink(window.location.origin, secret)
  const [copied, setCopied] = useState<'code' | 'link' | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const canShare = typeof navigator.share === 'function'
  const small: React.CSSProperties = { fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '6px', lineHeight: 1.4 }

  useEffect(() => { if (!copied) return; const t = setTimeout(() => setCopied(null), 2000); return () => clearTimeout(t) }, [copied])

  async function copy(what: 'code' | 'link') {
    try { await navigator.clipboard.writeText(what === 'code' ? secret : link); setCopied(what) } catch { /* not allowed */ }
  }
  async function shareCode() {
    try { await navigator.share({ title: 'UltraPilot Live Group code', text: codeShareText(secret) }) } catch { /* cancelled */ }
  }
  async function shareLink() {
    try { await navigator.share({ title: 'UltraPilot Live Group', text: 'Watch our UltraPilot Live Group', url: link }) } catch { /* cancelled */ }
  }
  async function showQr() {
    setQr(await QRCode.toDataURL(link, { width: 640, margin: 2, errorCorrectionLevel: 'M' }))
  }

  return (
    <div>
      <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginBottom: '4px' }}>Group code</div>
      <div aria-label="Group code"
        style={{ fontFamily: theme.font.mono, fontSize: theme.size.body, color: theme.colors.cream, background: 'rgba(255,255,255,0.05)', border: `1px solid ${theme.colors.darkBorder}`,
          borderRadius: '8px', padding: '10px 12px', wordBreak: 'break-all', userSelect: 'all', WebkitUserSelect: 'all', lineHeight: 1.4 }}>
        {secret}
      </div>
      <div style={{ display: 'flex', gap: '6px', marginTop: '8px' }}>
        <button onClick={() => copy('code')} style={{ ...buttonStyle(true), flex: 1 }}>{copied === 'code' ? '✓ Copied' : 'Copy code'}</button>
        {canShare && <button onClick={shareCode} style={{ ...buttonStyle(), flex: 1 }}>Share code</button>}
      </div>
      <div style={small}>
        Others paste this code in their UltraPilot app: More → Live Group → Paste code. Anyone with the code can see and share positions in this group; positions are encrypted on the device — the server can’t read them.
      </div>

      <div style={{ borderTop: `1px dashed ${theme.colors.darkBorder}`, marginTop: '12px', paddingTop: '10px' }}>
        <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginBottom: '6px' }}>Crew without the app — opens in their browser</div>
        <div style={{ display: 'flex', gap: '6px' }}>
          {canShare
            ? <button onClick={shareLink} style={{ ...buttonStyle(), flex: 1 }}>Share link</button>
            : <button onClick={() => copy('link')} style={{ ...buttonStyle(), flex: 1 }}>{copied === 'link' ? '✓ Copied' : 'Copy link'}</button>}
          <button onClick={showQr} style={{ ...buttonStyle(), flex: 1 }}>QR code</button>
        </div>
      </div>

      {qr && (
        <div onClick={() => setQr(null)}
          style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: theme.screenBottom, background: 'rgba(0,0,0,0.85)', zIndex: 500, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '24px' }}>
          <img src={qr} alt="Live Group invite link QR code" style={{ width: 'min(80vw, 80vh, 420px)', height: 'auto', background: '#fff', borderRadius: '12px' }} />
          <div style={{ color: theme.colors.cream, fontFamily: theme.font.primary, fontSize: theme.size.body, textAlign: 'center' }}>Scan with the camera to open in the browser · tap to close</div>
        </div>
      )}
    </div>
  )
}
