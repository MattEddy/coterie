import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Share2 } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Tooltip from './Tooltip'
import styles from './SharePicker.module.css'

interface SharedMapOption {
  origin_map_id: string
  map_name: string
  shared: boolean
}

interface SharePickerProps {
  objectId: string
  shareType: 'contacts' | 'project' | 'event' | 'note'
  tooltip?: string
}

export default function SharePicker({ objectId, shareType, tooltip }: SharePickerProps) {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const [sharedMaps, setSharedMaps] = useState<SharedMapOption[]>([])
  const [pos, setPos] = useState({ top: 0, left: 0 })
  const btnRef = useRef<HTMLButtonElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)

  const load = useCallback(async () => {
    if (!user) return

    // Get all the user's maps that belong to a sharing group (origin_map_id is set)
    const { data: userMaps } = await supabase
      .from('maps')
      .select('id, name, origin_map_id')
      .eq('user_id', user.id)
      .not('origin_map_id', 'is', null)
    if (!userMaps?.length) { setSharedMaps([]); return }

    // Deduplicate by origin_map_id and resolve origin map names
    const originIds = [...new Set(userMaps.map(m => m.origin_map_id))]

    // For each origin, find the origin map's name (where id = origin_map_id)
    const { data: originMaps } = await supabase
      .from('maps')
      .select('id, name')
      .in('id', originIds)

    const originNameMap = new Map((originMaps || []).map(m => [m.id, m.name]))

    // Get current share state from maps_shares
    const { data: shares } = await supabase
      .from('maps_shares')
      .select('map_id')
      .eq('user_id', user.id)
      .eq('object_id', objectId)
      .eq('share_type', shareType)

    const sharedIds = new Set((shares || []).map(s => s.map_id))

    setSharedMaps(originIds.map(originId => ({
      origin_map_id: originId,
      map_name: originNameMap.get(originId) || 'Unknown',
      shared: sharedIds.has(originId),
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

  const toggle = async (originMapId: string, currently: boolean) => {
    if (!user) return
    if (currently) {
      await supabase
        .from('maps_shares')
        .delete()
        .eq('map_id', originMapId)
        .eq('user_id', user.id)
        .eq('object_id', objectId)
    } else {
      await supabase
        .from('maps_shares')
        .insert({ map_id: originMapId, user_id: user.id, object_id: objectId, share_type: shareType })
    }
    setSharedMaps(prev => prev.map(m => m.origin_map_id === originMapId ? { ...m, shared: !currently } : m))
  }

  const anyShared = sharedMaps.some(m => m.shared)

  if (!user) return null

  return (
    <>
      <Tooltip text={tooltip || "Share with shared maps"}>
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
          {sharedMaps.length === 0 ? (
            <span className={styles.empty}>No shared maps</span>
          ) : (
            sharedMaps.map(m => (
              <label key={m.origin_map_id} className={styles.option}>
                <input
                  type="checkbox"
                  checked={m.shared}
                  onChange={() => toggle(m.origin_map_id, m.shared)}
                />
                {m.map_name}
              </label>
            ))
          )}
        </div>,
        document.body
      )}
    </>
  )
}
