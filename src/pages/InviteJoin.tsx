import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import logoDark from '../assets/logo-name.svg'
import logoLight from '../assets/logo-name-light.svg'
import FeatureCards from '../components/FeatureCards'
import styles from './InviteJoin.module.css'

/* ── Invitation data ───────────────────────────────────────────── */

interface InviteData {
  mapName: string
  senderName: string
  email: string
}

/* ── Main page ─────────────────────────────────────────────────── */

export default function InviteJoin() {
  const { token } = useParams<{ token: string }>()
  const navigate = useNavigate()
  const { user } = useAuth()
  const { resolvedTheme } = useTheme()
  const logo = resolvedTheme === 'light' ? logoLight : logoDark
  const [invite, setInvite] = useState<InviteData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!token) { setError('Invalid invite link.'); setLoading(false); return }

    if (token === 'demo') {
      setInvite({ mapName: 'Literary Agents', senderName: 'Matt', email: 'demo@example.com' })
      setLoading(false)
      return
    }

    async function load() {
      const { data, error: rpcErr } = await supabase
        .rpc('get_invitation_by_token', { invite_token: token })
        .single<{ status: string; map_name: string; sender_name: string; email: string }>()

      if (rpcErr || !data) { setError('Invitation not found.'); setLoading(false); return }
      if (data.status !== 'pending') { setError('This invitation has already been used.'); setLoading(false); return }

      setInvite({
        mapName: data.map_name || 'a shared map',
        senderName: data.sender_name || 'Someone',
        email: data.email,
      })
      setLoading(false)
    }
    load()
  }, [token])

  const handleSignUp = useCallback(() => {
    if (token) sessionStorage.setItem('pendingInviteToken', token)
    if (user) {
      navigate('/')
    } else {
      const params = new URLSearchParams({ invite: token! })
      if (invite?.email) params.set('email', invite.email)
      navigate(`/login?${params}`)
    }
  }, [token, user, navigate, invite])

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>Loading...</div>
      </div>
    )
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.errorCard}>
          <img src={logo} alt="Coterie" className={styles.logo} />
          <p className={styles.errorText}>{error}</p>
          <button className={styles.primaryBtn} onClick={() => navigate('/login')}>
            Go to Login
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      <div className={styles.page}>
        {/* Logo */}
        <img src={logo} alt="Coterie" className={styles.logo} />

        {/* Feature cards */}
        <FeatureCards />

        {/* Pricing */}
        <div className={styles.pricingSection}>
          <h2 className={styles.pricingHeadline}>Start free. No card needed.</h2>
          <p className={styles.pricingSubtext}>
            Try Coterie free for 2 months — then continue for $3.99/month or $39/year.
          </p>
        </div>

        {/* CTA */}
        <div className={styles.ctaSection}>
          <button className={styles.primaryBtn} onClick={handleSignUp}>
            Start Free Trial
          </button>
          {invite && (
            <p className={styles.ctaBlurb}>
              Join {invite.senderName}'s{' '}
              <em>{invite.mapName}</em> shared map and start sharing
              professional intel.
            </p>
          )}
          <p className={styles.pricingNote}>
            After your trial, you can continue using Coterie Free offline — you
            keep all your information, with no cloud backup or map sharing.
            Upgrade anytime to reconnect.
          </p>
        </div>
      </div>
    </div>
  )
}
