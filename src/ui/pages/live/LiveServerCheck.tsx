import { useState } from 'react'
import { theme } from '../../theme'
import { useLiveGroupStore } from '../../../state/live-group-store'
import { buttonStyle } from '../plan/plan-styles'

/** "Check server": is the relay's storage working, and does it see my group? */
export function LiveServerCheck() {
  const { checkServer, serverCheck } = useLiveGroupStore()
  const [busy, setBusy] = useState(false)
  async function run() { setBusy(true); try { await checkServer() } finally { setBusy(false) } }
  return (
    <div style={{ marginTop: '10px' }}>
      <button onClick={run} disabled={busy} style={{ ...buttonStyle(false, busy), width: '100%' }}>{busy ? 'Checking…' : 'Check server'}</button>
      {serverCheck && (
        <div style={{ marginTop: '8px', fontSize: theme.size.small, lineHeight: 1.5, color: serverCheck.ok ? theme.colors.green : theme.colors.amber }}>
          {serverCheck.lines.map((l, i) => <div key={i}>{serverCheck.ok ? '✓' : '•'} {l}</div>)}
        </div>
      )}
    </div>
  )
}
