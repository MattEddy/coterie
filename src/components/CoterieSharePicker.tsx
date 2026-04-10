import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Share2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Tooltip from './Tooltip'
import styles from './CoterieSharePicker.module.css'

interface CoterieOption {
  id: string
  name: string
  shared: boolean
}

interface CoterieSharePickerProps {
  objectId: string
  shareType: 'contacts' | 'project' | 'event'
}

export default function CoterieSharePicker({ objectId, shareType }: CoterieSharePickerProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [coteries, setCoteries] = useState<CoterieOption[]>([])
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!user) return

    const { data: memberships } = await supabase
      .from('coteries_members')
      .select('coterie_id, coteries(name)')
      .eq('user_id', user.id)
    if (!memberships?.length) { setCoteries([]); return }

    const { data: shares } = await supabase
      .from('coterie_shares')
      .select('coterie_id')
      .eq('user_id', user.id)
      .eq('object_id', objectId)
      .eq('share_type', shareType)

    const sharedIds = new Set((shares || []).map(s => s.coterie_id))

    setCoteries(memberships.map((m: any) => ({
      id: m.coterie_id,
      name: m.coteries?.name || 'Unknown',
      shared: sharedIds.has(m.coterie_id),
    })))
  }, [user, objectId, shareType])

  // Load on mount to show gold indicator, and reload when dropdown opens
  useEffect(() => { load() }, [load])
  useEffect(() => { if (open) load() }, [open, load])

  // Position dropdown relative to button
  const openDropdown = () => {
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 4, left: rect.right - 160 })
    }
    setOpen(true)
  }

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current?.contains(e.target as Node)) return
      if (btnRef.current?.contains(e.target as Node)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  const toggle = async (coterieId: string, currently: boolean) => {
    if (!user) return
    if (currently) {
      await supabase
        .from('coterie_shares')
        .delete()
        .eq('coterie_id', coterieId)
        .eq('user_id', user.id)
        .eq('object_id', objectId)
    } else {
      await supabase
        .from('coterie_shares')
        .insert({ coterie_id: coterieId, user_id: user.id, object_id: objectId, share_type: shareType })
    }
    setCoteries(prev => prev.map(c => c.id === coterieId ? { ...c, shared: !currently } : c))
  }

  const anyShared = coteries.some(c => c.shared)

  if (!user) return null

  return (
    <>
      <Tooltip text="Share with coteries">
        <button
          ref={btnRef}
          className={`${styles.shareBtn} ${anyShared ? styles.shareBtnActive : ''}`}
          onClick={() => open ? setOpen(false) : openDropdown()}
        >
          <Share2 size={11} />
        </button>
      </Tooltip>
      {open && createPortal(
        <div
          ref={dropdownRef}
          className={styles.dropdown}
          style={{ top: pos.top, left: Math.max(8, pos.left) }}
        >
          {coteries.length === 0 ? (
            <span className={styles.empty}>No coteries</span>
          ) : (
            coteries.map(c => (
              <label key={c.id} className={styles.option}>
                <input
                  type="checkbox"
                  checked={c.shared}
                  onChange={() => toggle(c.id, c.shared)}
                />
                {c.name}
              </label>
            ))
          )}
        </div>,
        document.body
      )}
    </>
  )
}
