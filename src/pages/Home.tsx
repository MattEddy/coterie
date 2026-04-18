import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import DemoCanvas from '../components/DemoCanvas'
import LandscapeBlurb from '../components/LandscapeBlurb'
import FeatureCards from '../components/FeatureCards'
import logoNameDark from '../assets/logo-name.svg'
import logoNameLight from '../assets/logo-name-light.svg'
import logoIcon from '../assets/logo-icon.svg'
import styles from './Home.module.css'

/* ── Home page ─────────────────────────────────────────────────── */

export default function Home() {
  const navigate = useNavigate()
  const { resolvedTheme } = useTheme()
  const logo = resolvedTheme === 'light' ? logoNameLight : logoNameDark
  const [waitlistEmail, setWaitlistEmail] = useState('')
  const [waitlistStatus, setWaitlistStatus] = useState<'idle' | 'sending' | 'done' | 'error'>('idle')
  const waitlistRef = useRef<HTMLInputElement>(null)

  const handleWaitlist = async (e: React.FormEvent) => {
    e.preventDefault()
    const email = waitlistEmail.trim().toLowerCase()
    if (!email) return
    setWaitlistStatus('sending')
    const { error } = await supabase.from('waitlist').insert({ email })
    if (error) {
      // Duplicate = already on the list, treat as success
      if (error.code === '23505') {
        setWaitlistStatus('done')
      } else {
        console.error('Waitlist error:', error)
        setWaitlistStatus('error')
      }
    } else {
      setWaitlistStatus('done')
    }
  }

  return (
    <div className={styles.container}>
      {/* Header */}
      <header className={styles.header}>
        <img src={logo} alt="Coterie" className={styles.headerLogo} />
        <nav className={styles.headerNav}>
          <a href="#overview" className={styles.navLink}>Overview</a>
          <a href="#features" className={styles.navLink}>Features</a>
          <a href="#pricing" className={styles.navLink}>Plans</a>
          <button className={styles.loginLink} onClick={() => navigate('/login')}>Log In</button>
        </nav>
      </header>

      <div className={styles.page}>
        {/* Overview */}
        <section id="overview" className={styles.overview}>
          <img src={logoIcon} alt="" className={styles.heroIcon} />
          <h1 className={styles.headline}>Map your interpersonal landscape.</h1>
          <LandscapeBlurb />
        </section>

        {/* Demo canvas */}
        <DemoCanvas />

        {/* Features */}
        <section id="features" className={styles.featuresSection}>
          <FeatureCards />
        </section>

        {/* Waitlist CTA */}
        <section id="pricing" className={styles.ctaSection}>
          <h2 className={styles.ctaHeadline}>Coterie is currently invite-only.</h2>
          {waitlistStatus === 'done' ? (
            <p className={styles.ctaSuccess}>You're on the list. We'll be in touch.</p>
          ) : (
            <form onSubmit={handleWaitlist} className={styles.waitlistForm}>
              <input
                ref={waitlistRef}
                className={styles.waitlistInput}
                type="email"
                placeholder="you@email.com"
                value={waitlistEmail}
                onChange={e => setWaitlistEmail(e.target.value)}
                required
              />
              <button className={styles.ctaButton} type="submit" disabled={waitlistStatus === 'sending'}>
                {waitlistStatus === 'sending' ? 'Joining...' : 'Join the Waitlist'}
              </button>
            </form>
          )}
          {waitlistStatus === 'error' && (
            <p className={styles.ctaError}>Something went wrong. Please try again.</p>
          )}
        </section>
      </div>
    </div>
  )
}
