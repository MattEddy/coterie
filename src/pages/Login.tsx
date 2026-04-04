import { useState, useRef, useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import styles from './Login.module.css'

type Step = 'email' | 'code' | 'name'

export default function Login() {
  const { user, sendOtp, verifyOtp } = useAuth()
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState(['', '', '', '', '', ''])
  const [displayName, setDisplayName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const codeRefs = useRef<(HTMLInputElement | null)[]>([])
  const pendingUserId = useRef<string | null>(null)

  // After OTP verification, check if profile needs a display name
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_name) {
          // Already has a name — done
          pendingUserId.current = null
        } else {
          // New user — ask for name
          pendingUserId.current = user.id
          setStep('name')
        }
      })
  }, [user])

  if (user && step !== 'name') return <Navigate to="/" replace />

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

  const handleSaveName = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!displayName.trim() || !user) return
    setLoading(true)
    await supabase
      .from('profiles')
      .update({ display_name: displayName.trim() })
      .eq('user_id', user.id)
    setLoading(false)
    pendingUserId.current = null
    setStep('email') // triggers the Navigate redirect
  }

  return (
    <div className={styles.container}>
      <div className={styles.form}>
        <h1 className={styles.title}>Coterie</h1>
        <p className={styles.subtitle}>Map your professional world.</p>

        {step === 'email' && (
          <form onSubmit={handleSendCode} className={styles.stepContent}>
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

        {step === 'name' && (
          <form onSubmit={handleSaveName} className={styles.stepContent}>
            <p className={styles.hint}>What should people call you?</p>
            <input
              className={styles.input}
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={e => setDisplayName(e.target.value)}
              required
              autoFocus
            />
            <button className={styles.button} type="submit" disabled={loading || !displayName.trim()}>
              {loading ? 'Saving...' : 'Get Started'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
