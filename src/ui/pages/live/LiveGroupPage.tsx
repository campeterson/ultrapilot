import { useState } from 'react'
import { theme } from '../../theme'
import { useLiveGroupStore } from '../../../state/live-group-store'
import { useHasPanelTitleBar } from '../../shell/panel-title-context'
import { parseInvite, roleLabel } from '../../../data/logic/live-logic'
import { buttonStyle, inputStyle, sectionStyle, sectionTitle } from '../plan/plan-styles'
import { LiveProfileForm } from './LiveProfileForm'
import { LiveInvite } from './LiveInvite'
import { LiveMemberList } from './LiveMemberList'
import { LiveDisplayOptions } from './LiveDisplayOptions'
import { LiveServerCheck } from './LiveServerCheck'
import { LiveDemo } from './LiveDemo'

const STATUS_TEXT = { idle: '', connecting: 'Connecting…', live: 'Live', offline: 'No connection — retrying' } as const

/** Live Group: share your position with a group (balloon + chase, a fly-out) and see theirs. */
export function LiveGroupPage() {
  const hasTitleBar = useHasPanelTitleBar()
  const { profile, group, status, error, sharing, busy, pendingInvite, createGroup, joinGroup, leaveGroup, endGroup, startSharing, stopSharing, setPendingInvite } = useLiveGroupStore()
  const [editProfile, setEditProfile] = useState(false)
  const [paste, setPaste] = useState('')
  const [confirmLeave, setConfirmLeave] = useState(false)
  /** One tap: read the clipboard (iOS asks to allow Paste). Falls back to typing / long-press paste. */
  async function pasteCode() {
    try {
      const text = await navigator.clipboard.readText()
      setPaste(parseInvite(text) ?? text.trim())
    } catch { /* clipboard not readable — long-press the field and Paste */ }
  }
  const small: React.CSSProperties = { fontSize: theme.size.tiny, color: theme.colors.dim, lineHeight: 1.4, marginTop: '6px' }

  return (
    <div style={{ padding: '12px', fontFamily: theme.font.primary, color: theme.colors.light }}>
      {!hasTitleBar && <div style={{ fontSize: '17px', fontWeight: 700, color: theme.colors.cream, marginBottom: '10px' }}>Live Group</div>}

      <div style={{ ...sectionStyle, borderColor: theme.colors.amber, fontSize: theme.size.small, color: theme.colors.light, lineHeight: 1.4 }}>
        <strong style={{ color: theme.colors.amber }}>Not for navigation or traffic separation.</strong> Positions can be seconds to minutes old, and phones lose signal in the air.
      </div>

      {/* Profile */}
      <div style={sectionStyle}>
        <div style={sectionTitle}>You</div>
        {!profile || editProfile ? (
          <LiveProfileForm onDone={() => setEditProfile(false)} />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ width: '14px', height: '14px', borderRadius: '50%', background: theme.colors.liveRoles[profile.role] }} />
            <span style={{ flex: 1, color: theme.colors.cream, fontWeight: 700 }}>{profile.callsign} <span style={{ color: theme.colors.dim, fontWeight: 400 }}>· {roleLabel(profile.role)}</span></span>
            <button onClick={() => setEditProfile(true)} style={buttonStyle()}>Edit</button>
          </div>
        )}
      </div>

      {error && <div style={{ color: theme.colors.red, fontSize: theme.size.small, marginBottom: '10px' }}>{error}</div>}

      {/* Invited by link */}
      {pendingInvite && !group && profile && (
        <div style={{ ...sectionStyle, borderColor: theme.colors.green }}>
          <div style={sectionTitle}>You’ve been invited to a Live Group</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button onClick={() => setPendingInvite(null)} style={{ ...buttonStyle(), flex: 1 }}>Not now</button>
            <button onClick={() => joinGroup(pendingInvite)} disabled={busy} style={{ ...buttonStyle(true, busy), flex: 2 }}>Join as {profile.callsign}</button>
          </div>
        </div>
      )}

      {!group && profile && (
        <div style={sectionStyle}>
          <div style={sectionTitle}>Start or join a group</div>
          <button onClick={createGroup} disabled={busy} style={{ ...buttonStyle(true, busy), width: '100%' }}>{busy ? 'Working…' : 'Create a group'}</button>
          <div style={{ fontSize: theme.size.tiny, color: theme.colors.dim, margin: '12px 0 4px' }}>Join with a group code</div>
          <div style={{ display: 'flex', gap: '6px' }}>
            <input style={{ ...inputStyle, flex: 1, fontFamily: theme.font.mono }} value={paste} onChange={e => setPaste(e.target.value)} placeholder="Group code"
              aria-label="Group code" autoCapitalize="off" autoCorrect="off" spellCheck={false} />
            <button onClick={pasteCode} style={buttonStyle()}>Paste</button>
          </div>
          <button onClick={async () => { if (await joinGroup(paste)) setPaste('') }} disabled={busy || !paste.trim()}
            style={{ ...buttonStyle(!!paste.trim(), busy || !paste.trim()), width: '100%', marginTop: '6px' }}>Join</button>
          <div style={small}>Ask whoever started the group to copy the code and send it to you, then paste it here. (A pasted message or link works too — the code is picked out of it.)</div>
          <LiveServerCheck />
        </div>
      )}

      {group && (
        <>
          <div style={sectionStyle}>
            <div style={{ ...sectionTitle, display: 'flex', justifyContent: 'space-between' }}>
              <span>Sharing</span>
              <span style={{ color: status === 'live' ? theme.colors.green : status === 'offline' ? theme.colors.amber : theme.colors.dim }}>● {STATUS_TEXT[status]}</span>
            </div>
            <button onClick={() => (sharing ? stopSharing() : startSharing())}
              style={{ ...buttonStyle(!sharing), width: '100%', minHeight: '52px', fontSize: theme.size.body, ...(sharing ? { borderColor: theme.colors.green, color: theme.colors.green } : {}) }}>
              {sharing ? '● Sharing my position — tap to stop' : 'Start sharing my position'}
            </button>
            <div style={small}>Keep UltraPilot open with the screen on while sharing — phones stop sending when the screen locks or the app is in the background.</div>
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitle}>Group</div>
            <LiveMemberList />
            <LiveDisplayOptions />
          </div>

          <div style={sectionStyle}>
            <div style={sectionTitle}>Invite</div>
            <LiveInvite secret={group.secret} />
            <LiveServerCheck />
          </div>

          <div style={{ display: 'flex', gap: '6px' }}>
            {confirmLeave ? (
              <>
                <button onClick={() => setConfirmLeave(false)} style={{ ...buttonStyle(), flex: 1 }}>Cancel</button>
                <button onClick={() => { void leaveGroup(); setConfirmLeave(false) }} style={{ ...buttonStyle(), flex: 1, color: theme.colors.red }}>Leave group</button>
                {group.ownerKey && <button onClick={() => { void endGroup(); setConfirmLeave(false) }} style={{ ...buttonStyle(), flex: 1, color: theme.colors.red }}>End for everyone</button>}
              </>
            ) : (
              <button onClick={() => setConfirmLeave(true)} style={{ ...buttonStyle(), flex: 1, color: theme.colors.dim }}>Leave group…</button>
            )}
          </div>
        </>
      )}

      {profile && <LiveDemo />}
    </div>
  )
}
