import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import DemoCanvas from '../components/DemoCanvas'
import LandscapeBlurb from '../components/LandscapeBlurb'
import logoDark from '../assets/logo-name.svg'
import logoLight from '../assets/logo-name-light.svg'
import styles from './InviteLanding.module.css'

/* ── Invitation data ───────────────────────────────────────────── */

interface InviteData {
  mapName: string
  senderName: string
  mapId: string
  invitationId: string
}

/* ── Main page ─────────────────────────────────────────────────── */

export default function InviteLanding() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const logo = resolvedTheme === 'light' ? logoLight : logoDark
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setError('Invalid invite link.'); setLoading(false); return }

    // Dev shortcut: /invite/demo shows sample data
    if (token === 'demo') {
      setInvite({
        mapName: 'Literary Agents',
        senderName: 'Matt',
        mapId: 'demo',
        invitationId: 'demo',
      })
      setLoading(false)
      return
    }

    async function load() {
      const { data, error: rpcErr } = await supabase
        .rpc('get_invitation_by_token', { invite_token: token })
        .single<{ status: string; map_name: string; sender_name: string; map_id: string; invitation_id: string }>()

      if (rpcErr || !data) { setError('This invitation was not found.'); setLoading(false); return }
      if (data.status !== 'pending') { setError('This invitation has already been used.'); setLoading(false); return }

      setInvite({
        mapName: data.map_name || 'a shared map',
        senderName: data.sender_name || 'Someone',
        mapId: data.map_id,
        invitationId: data.invitation_id,
      })
      setLoading(false)
    }
    load()
  }, [token])

  const handleJoin = useCallback(() => {
    navigate(`/invite/${token}/join`)
  }, [token, navigate])

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading invitation...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <img src={logo} alt="Coterie" className={styles.logoImg} />
          <p className={styles.errorText}>{error}</p>
          <button className={styles.button} onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.page}>
        {/* Header */}
        <p className={styles.invitedBy}>
          <strong>{invite!.senderName}</strong> has invited you to join
        </p>
        <img src={logo} alt="Coterie" className={styles.logoImg} />

        {/* Explainer */}
        <LandscapeBlurb />

        {/* Demo canvas */}
        <DemoCanvas />

        {/* Coterie blurb */}
        <p className={styles.blurb}>
          Join {invite!.senderName}'s{' '}
          <em>{invite!.mapName}</em> shared map and start sharing
          professional intel.
        </p>

        {/* CTA */}
        <button className={styles.ctaButton} onClick={handleJoin}>
          Learn More / Join
        </button>
      </div>
    </div>
  )
}
