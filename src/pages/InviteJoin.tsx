import { useEffect, useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import logoMottoDark from '../assets/logo-name-motto.svg'
import logoMottoLight from '../assets/logo-name-motto-light.svg'
import thumbLandscape from '../assets/thumb-landscape.svg'
import thumbDetails from '../assets/thumb-details.svg'
import thumbMaps from '../assets/thumb-maps.svg'
import thumbSharedMaps from '../assets/thumb-coteries.svg'
import styles from './InviteJoin.module.css'

/* ── Feature cards ─────────────────────────────────────────────── */

const features = [
  {
    thumb: thumbLandscape,
    title: 'Landscape',
    description:
      'Visually array the people, organizations, and interrelationships in your world on a single, intuitive canvas.',
  },
  {
    thumb: thumbDetails,
    title: 'Details',
    description:
      'Add contact info and notes, track projects, and log your events — all linked to the people and organizations that matter.',
  },
  {
    thumb: thumbMaps,
    title: 'Maps',
    description:
      'Organize your Landscape into focused subsections — by project, by sector, by whatever makes sense to you.',
  },
  {
    thumb: thumbSharedMaps,
    title: 'Shared Maps',
    description:
      'Share maps with trusted collaborators to sync contact intel and keep each other in the loop — in real time.',
  },
]

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
  const logoMotto = resolvedTheme === 'light' ? logoMottoLight : logoMottoDark
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
          <img src={logoMotto} alt="Coterie" className={styles.logo} />
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
        <img src={logoMotto} alt="Coterie — Map your professional world" className={styles.logo} />

        {/* Feature cards */}
        <div className={styles.features}>
          {features.map(f => (
            <div key={f.title} className={styles.featureCard}>
              <img src={f.thumb} alt={f.title} className={styles.featureThumb} />
              <h3 className={styles.featureTitle}>{f.title}</h3>
              <p className={styles.featureDesc}>{f.description}</p>
            </div>
          ))}
        </div>

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
