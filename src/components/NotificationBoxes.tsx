import { useState, useEffect, useCallback, useRef } from 'react'
import { Mail, GitCompareArrows } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import styles from './NotificationBoxes.module.css'

interface NotificationBoxesProps {
  onOpenCoteries: () => void
  onOpenUpdates: () => void
}

export default function NotificationBoxes({ onOpenCoteries, onOpenUpdates }: NotificationBoxesProps) {
  const { user } = useAuth()
  const [inviteCount, setInviteCount] = useState(0)
  const [dissonanceCount, setDissonanceCount] = useState(0)
  const loadCountsRef = useRef<() => Promise<void>>()
  const prevInviteCountRef = useRef(0)

  const loadCounts = useCallback(async () => {
    if (!user) return

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser?.email) {
      const { count } = await supabase
        .from('coteries_invitations')
        .select('*', { count: 'exact', head: true })
        .eq('email', authUser.email)
        .eq('status', 'pending')
      const newCount = count ?? 0
      if (newCount !== prevInviteCountRef.current) {
        prevInviteCountRef.current = newCount
        document.dispatchEvent(new CustomEvent('coteries:refresh'))
      }
      setInviteCount(newCount)
    }

    const { data } = await supabase.rpc('get_dissonances', { p_user_id: user.id })
    if (data) {
      setDissonanceCount((data as any[]).filter(d => !d.is_dismissed).length)
    }
  }, [user])

  loadCountsRef.current = loadCounts

  useEffect(() => {
    loadCounts()

    // Poll every 3s for cross-user changes
    // (Supabase Realtime postgres_changes doesn't work reliably in local dev;
    //  swap to Broadcast or postgres_changes when deploying to Supabase Cloud)
    const interval = setInterval(() => loadCountsRef.current?.(), 3000)

    // Direct count push from CoterieUpdatesFrame (instant for own actions)
    const handleCountPush = (e: Event) => {
      setDissonanceCount((e as CustomEvent).detail)
    }
    document.addEventListener('coterie:dissonance-count', handleCountPush)

    return () => {
      clearInterval(interval)
      document.removeEventListener('coterie:dissonance-count', handleCountPush)
    }
  }, [loadCounts])

  if (inviteCount === 0 && dissonanceCount === 0) return null

  return (
    <div className={styles.container}>
      {inviteCount > 0 && (
        <button className={styles.box} onClick={onOpenCoteries}>
          <Mail size={14} className={styles.icon} />
          <span>{inviteCount} coterie {inviteCount === 1 ? 'invitation' : 'invitations'}</span>
        </button>
      )}
      {dissonanceCount > 0 && (
        <button className={styles.box} onClick={onOpenUpdates}>
          <GitCompareArrows size={14} className={styles.icon} />
          <span>{dissonanceCount} coterie {dissonanceCount === 1 ? 'update' : 'updates'}</span>
        </button>
      )}
    </div>
  )
}
