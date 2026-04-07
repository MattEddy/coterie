import { useState, useRef, useEffect, useCallback } from 'react'
import { Navigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { useTheme } from '../contexts/ThemeContext'
import { acceptInvitationByToken } from '../lib/acceptInvitation'
import logoNameDark from '../assets/logo-name.svg'
import logoNameLight from '../assets/logo-name-light.svg'
import styles from './Login.module.css'

type Step = 'email' | 'code'

export default function Login() {
  const { user, sendOtp, verifyOtp } = useAuth()
  const { resolvedTheme } = useTheme()
  const [searchParams] = useSearchParams()
  const inviteEmail = searchParams.get('email')
  const inviteToken = searchParams.get('invite')
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState(inviteEmail || '')
  const [usingInviteEmail, setUsingInviteEmail] = useState(!!inviteEmail)
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])

  const [accepting, setAccepting] = useState(false)
  const [checkingProfile, setCheckingProfile] = useState(true)

  // Accept pending invitation, then redirect
  const acceptAndRedirect = useCallback(async (uid: string) => {
    const pendingToken = inviteToken || sessionStorage.getItem('pendingInviteToken')
    if (pendingToken) {
      setAccepting(true)
      await acceptInvitationByToken(uid, pendingToken)
      sessionStorage.removeItem('pendingInviteToken')
      sessionStorage.setItem('showWelcomeModal', 'true')
      setAccepting(false)
    }
    // Navigate will happen via the render check below
  }, [inviteToken])

  // After OTP verification, accept invite if pending and redirect
  useEffect(() => {
    if (!user) { setCheckingProfile(false); return }
    setCheckingProfile(true)
    supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single()
      .then(async ({ data }) => {
        if (!data?.display_name) {
          sessionStorage.setItem('needsDisplayName', 'true')
        }
        await acceptAndRedirect(user.id)
        setCheckingProfile(false)
      })
  }, [user, acceptAndRedirect])

  if (user && !accepting && !checkingProfile) return <Navigate to="/" replace />

  const handleSendCode = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await sendOtp(email.trim())
    if (error) {
      setError(error.message)
    } else {
      setStep('code')
      setCode(['', '', '', '', '', ''])
    }
    setLoading(false)
  }

  const handleVerifyCode = async (fullCode: string) => {
    setError('')
    setLoading(true)
    const { error } = await verifyOtp(email.trim(), fullCode)
    if (error) {
      setError('Invalid code. Please try again.')
      setCode(['', '', '', '', '', ''])
      codeRefs.current[0]?.focus()
    }
    setLoading(false)
  }

  const handleCodeInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return
    const digit = value.slice(-1)
    const next = [...code]
    next[index] = digit
    setCode(next)

    if (digit && index < 5) {
      codeRefs.current[index + 1]?.focus()
    }

    // Auto-submit when all 6 digits entered
    if (digit && index === 5) {
      const fullCode = next.join('')
      if (fullCode.length === 6) handleVerifyCode(fullCode)
    }
  }

  const handleCodeKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      codeRefs.current[index - 1]?.focus()
    }
  }

  const handleCodePaste = (e: React.ClipboardEvent) => {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6)
    if (!pasted) return
    const next = [...code]
    for (let i = 0; i < pasted.length; i++) {
      next[i] = pasted[i]
    }
    setCode(next)
    if (pasted.length === 6) {
      handleVerifyCode(pasted)
    } else {
      codeRefs.current[Math.min(pasted.length, 5)]?.focus()
    }
  }

  return (
    <div className={styles.container}>
      <div className={styles.form}>
        <p className={styles.welcomeText}>Welcome to</p>
        <img src={resolvedTheme === 'light' ? logoNameLight : logoNameDark} alt="Coterie" className={styles.logoImg} />
        <p className={styles.subtitle}>Please login to get started.</p>

        {step === 'email' && (
          <form onSubmit={handleSendCode} className={styles.stepContent}>
            {usingInviteEmail ? (
              <>
                <p className={styles.hint}>
                  We'll send a code to <strong>{email}</strong>
                </p>
                {error && <p className={styles.error}>{error}</p>}
                <button className={styles.button} type="submit" disabled={loading}>
                  {loading ? 'Sending...' : 'Send Code'}
                </button>
                <button
                  className={styles.linkButton}
                  type="button"
                  onClick={() => { setUsingInviteEmail(false); setEmail(''); setError('') }}
                >
                  Use a different email to join Coterie
                </button>
              </>
            ) : (
              <>
                <input
                  className={styles.input}
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoFocus
                />
                {error && <p className={styles.error}>{error}</p>}
                <button className={styles.button} type="submit" disabled={loading}>
                  {loading ? 'Sending...' : 'Continue'}
                </button>
              </>
            )}
          </form>
        )}

        {step === 'code' && (
          <div className={styles.stepContent}>
            <p className={styles.hint}>Enter the 6-digit code sent to <strong>{email}</strong></p>
            <div className={styles.codeRow} onPaste={handleCodePaste}>
              {code.map((digit, i) => (
                <input
                  key={i}
                  ref={el => { codeRefs.current[i] = el }}
                  className={styles.codeInput}
                  type="text"
                  inputMode="numeric"
                  maxLength={1}
                  value={digit}
                  onChange={e => handleCodeInput(i, e.target.value)}
                  onKeyDown={e => handleCodeKeyDown(i, e)}
                  autoFocus={i === 0}
                />
              ))}
            </div>
            {error && <p className={styles.error}>{error}</p>}
            {loading && <p className={styles.hint}>Verifying...</p>}
            <button
              className={styles.linkButton}
              type="button"
              onClick={() => { setStep('email'); setError('') }}
            >
              Use a different email
            </button>
          </div>
        )}


      </div>
    </div>
  )
}
