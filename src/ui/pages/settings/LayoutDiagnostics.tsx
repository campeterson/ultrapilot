import { useEffect, useRef, useState } from 'react'
import { theme } from '../../theme'
import { useTick } from '../../hooks/useTick'
import { resetDocumentScroll } from '../../hooks/useIOSScrollReset'

/** Screen-layout readout for chasing iPhone notch / home-bar issues: if the UI
 *  ever looks shifted, a screenshot of this shows exactly what iOS did. */
export function LayoutDiagnostics() {
  useTick(1000)
  const probe = useRef<HTMLDivElement>(null)
  const [insets, setInsets] = useState('')
  useEffect(() => {
    const p = probe.current
    if (!p) return
    const cs = getComputedStyle(p)
    setInsets(`T ${cs.paddingTop} · B ${cs.paddingBottom} · L ${cs.paddingLeft} · R ${cs.paddingRight}`.replace(/px/g, ''))
  })
  const vv = window.visualViewport
  const root = document.getElementById('root')
  const standalone = window.matchMedia?.('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true
  const rows: [string, string][] = [
    ['Screen', `${screen.width}×${screen.height} @${window.devicePixelRatio}x · ${standalone ? 'Home Screen app' : 'browser'}`],
    ['Window', `${window.innerWidth}×${window.innerHeight}`],
    ['Visible area', vv ? `${Math.round(vv.width)}×${Math.round(vv.height)} · offset ${Math.round(vv.offsetTop)} · zoom ${vv.scale.toFixed(2)}` : '—'],
    ['Safe area', insets],
    ['Page scroll', `window ${Math.round(window.scrollY)} · html ${document.documentElement.scrollTop} · body ${document.body.scrollTop} · root ${root?.scrollTop ?? 0}`],
  ]
  return (
    <div style={{ padding: '10px 16px 14px', borderBottom: `1px solid ${theme.colors.darkBorder}` }}>
      <div ref={probe} style={{ position: 'absolute', visibility: 'hidden', pointerEvents: 'none',
        paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)', paddingLeft: 'env(safe-area-inset-left)', paddingRight: 'env(safe-area-inset-right)' }} />
      <div style={{ fontSize: theme.size.body, color: theme.colors.light, marginBottom: '6px' }}>Screen layout</div>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: '8px', fontSize: theme.size.tiny, lineHeight: 1.6 }}>
          <span style={{ color: theme.colors.dim, width: '90px', flexShrink: 0 }}>{k}</span>
          <span style={{ color: theme.colors.cream, fontFamily: theme.font.mono }}>{v}</span>
        </div>
      ))}
      <button onClick={resetDocumentScroll}
        style={{ marginTop: '8px', width: '100%', minHeight: theme.tapTarget, borderRadius: '8px', border: `1px solid ${theme.colors.darkBorder}`, background: 'none', color: theme.colors.light, cursor: 'pointer', fontFamily: theme.font.primary, fontSize: theme.size.small }}>
        Reset layout
      </button>
      <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, marginTop: '6px', lineHeight: 1.4 }}>
        If the screen ever looks shifted up, a screenshot of this helps. "Page scroll" should be all 0.
      </div>
    </div>
  )
}
