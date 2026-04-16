import { useState, useEffect, useCallback, useRef } from 'react'
import { Mail, GitCompareArrows } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import styles from './NotificationBoxes.module.css'

interface NotificationBoxesProps {
  onOpenMaps: () => void
  onOpenUpdates: () => void
}

export default function NotificationBoxes({ onOpenMaps, onOpenUpdates }: NotificationBoxesProps) {
  const { user } = useAuth()
  const [inviteCount, setInviteCount] = useState(0)
  const [dissonanceCount, setDissonanceCount] = useState(0)
  const loadCountsRef = useRef<() => Promise<void>>(undefined)
  const prevInviteCountRef = useRef(0)

  const loadCounts = useCallback(async () => {
    if (!user) return

    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (authUser?.email) {
      const { count } = await supabase
        .from('maps_invitations')
        .select('*', { count: 'exact', head: true })
        .eq('email', authUser.email)
      const newCount = count ?? 0
      if (newCount !== prevInviteCountRef.current) {
        prevInviteCountRef.current = newCount
        document.dispatchEvent(new CustomEvent('maps:refresh'))
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

    // Poll for cross-user changes (swap to Supabase Realtime when feasible)
    const interval = setInterval(() => loadCountsRef.current?.(), 30000)

    // Direct count push from UpdatesFrame (instant for own actions)
    const handleCountPush = (e: Event) => {
      setDissonanceCount((e as CustomEvent).detail)
    }
    document.addEventListener('sharing:dissonance-count', handleCountPush)

    // Refresh after invite acceptance (welcome flow dispatches this)
    const handleRefreshNotifs = () => loadCountsRef.current?.()
    document.addEventListener('sharing:refresh-notifications', handleRefreshNotifs)

    return () => {
      clearInterval(interval)
      document.removeEventListener('sharing:dissonance-count', handleCountPush)
      document.removeEventListener('sharing:refresh-notifications', handleRefreshNotifs)
    }
  }, [loadCounts])

  if (inviteCount === 0 && dissonanceCount === 0) return null

  return (
    <div className={styles.container}>
      {inviteCount > 0 && (
        <button className={styles.box} onClick={onOpenMaps}>
          <Mail size={14} className={styles.icon} />
          <span>{inviteCount} {inviteCount === 1 ? 'invitation' : 'invitations'}</span>
        </button>
      )}
      {dissonanceCount > 0 && (
        <button className={styles.box} onClick={onOpenUpdates}>
          <GitCompareArrows size={14} className={styles.icon} />
          <span>{dissonanceCount} {dissonanceCount === 1 ? 'update' : 'updates'}</span>
        </button>
      )}
    </div>
  )
}
