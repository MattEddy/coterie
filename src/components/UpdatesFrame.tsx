import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Frame from './Frame'
import styles from './UpdatesFrame.module.css'
import type { PlacementCluster } from '../types'

interface Dissonance {
  dissonance_type: 'new_object' | 'new_connection' | 'deactivated_connection' | 'career_move' | 'type_change'
  origin_map_id: string
  map_name: string
  source_user_id: string
  source_user_name: string
  object_id: string | null
  object_name: string | null
  object_class: string | null
  object_a_id: string | null
  object_a_name: string | null
  object_b_id: string | null
  object_b_name: string | null
  role_a_name: string | null
  role_b_name: string | null
  their_name: string | null
  your_name: string | null
  their_title: string | null
  your_title: string | null
  their_status: string | null
  your_status: string | null
  their_types: string[] | null
  your_types: string[] | null
  ref_type: string
  ref_id: string
  is_dismissed: boolean
}

interface UpdatesFrameProps {
  onClose: () => void
  onEnterPlacement?: (cluster: PlacementCluster) => void
}

export default function UpdatesFrame({ onClose, onEnterPlacement }: UpdatesFrameProps) {
  const { user } = useAuth()
  const [dissonances, setDissonances] = useState<Dissonance[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const loadDissonances = useCallback(async () => {
    if (!user) return
    const { data, error } = await supabase.rpc('get_dissonances', { p_user_id: user.id })
    if (error) { console.error('Failed to load dissonances:', error); return }
    if (data) setDissonances((data as Dissonance[]).filter(d => !d.is_dismissed))
  }, [user])

  useEffect(() => {
    loadDissonances()
    // Poll for cross-user changes (swap to Supabase Realtime when feasible)
    const interval = setInterval(loadDissonances, 30000)
    return () => clearInterval(interval)
  }, [loadDissonances])

  // Push count directly to NotificationBoxes whenever local state changes
  useEffect(() => {
    document.dispatchEvent(new CustomEvent('sharing:dissonance-count', { detail: dissonances.length }))
  }, [dissonances.length])

  const itemKey = (d: Dissonance) => `${d.ref_id}-${d.dissonance_type}`

  const removeDissonance = (d: Dissonance) => {
    setDissonances(prev => prev.filter(x =>
      !(x.ref_id === d.ref_id && x.source_user_id === d.source_user_id && x.dissonance_type === d.dissonance_type)
    ))
    setSelectedId(null)
    document.dispatchEvent(new Event('sharing:notifications-changed'))
  }

  const handleAccept = async (d: Dissonance) => {
    if (!user) return

    if (d.dissonance_type === 'new_object' && onEnterPlacement && d.object_id) {
      // For new_object with placement mode, we need the member's data for the ghost preview
      const { data: memberOv } = await supabase
        .from('objects_overrides')
        .select('name, title, status')
        .eq('id', d.ref_id)
        .single()
      if (!memberOv) return

      onEnterPlacement({
        label: memberOv.name ?? d.object_name ?? 'New Object',
        items: [{
          objectId: d.object_id,
          name: memberOv.name ?? d.object_name ?? 'Unknown',
          class: d.object_class ?? 'person',
          relativeX: 0,
          relativeY: 0,
        }],
        connections: [],
        onConfirm: async (anchorX, anchorY) => {
          await supabase.rpc('accept_dissonance', {
            p_user_id: user!.id,
            p_dissonance_type: 'new_object',
            p_ref_id: d.ref_id,
            p_object_id: d.object_id,
            p_origin_map_id: d.origin_map_id,
            p_map_x: anchorX,
            p_map_y: anchorY,
          })
          removeDissonance(d)
        },
        onCancel: () => {
          // User cancelled — dissonance stays in the list
        },
      })
      return // Don't remove dissonance yet
    }

    // All other types (and new_object without placement mode) go through the RPC
    await supabase.rpc('accept_dissonance', {
      p_user_id: user.id,
      p_dissonance_type: d.dissonance_type,
      p_ref_id: d.ref_id,
      p_object_id: d.object_id || null,
      p_origin_map_id: d.origin_map_id || null,
    })

    removeDissonance(d)
    document.dispatchEvent(new Event('sharing:refresh-canvas'))
  }

  const handleIgnore = async (d: Dissonance) => {
    if (!user) return
    const { error } = await supabase.from('maps_reviews').insert({
      user_id: user.id,
      source_user_id: d.source_user_id,
      ref_type: d.ref_type,
      ref_id: d.ref_id,
    })
    if (error) { console.error('Failed to dismiss dissonance:', error); return }
    removeDissonance(d)
  }

  return (
    <Frame title="Updates" titleTooltip="Differences between your data and your shared maps" onClose={onClose} initialPosition={{ x: 60, y: 60 }} width={320} resizable persistKey="updates">
      {dissonances.length > 0 ? (
        <div className={styles.list}>
          {dissonances.map(d => {
            const key = itemKey(d)
            const isSelected = selectedId === key
            return (
              <div
                key={key}
                className={`${styles.item} ${isSelected ? styles.itemSelected : ''}`}
                onClick={() => setSelectedId(isSelected ? null : key)}
              >
                <div className={styles.content}>
                  <span className={styles.desc}>
                    {d.dissonance_type === 'new_object' && (
                      <>{d.source_user_name} added <strong>{d.object_name}</strong></>
                    )}
                    {d.dissonance_type === 'new_connection' && (
                      <>{d.source_user_name} connected <strong>{d.object_a_name}</strong> ↔ <strong>{d.object_b_name}</strong></>
                    )}
                    {d.dissonance_type === 'deactivated_connection' && (
                      <>{d.source_user_name} disconnected <strong>{d.object_a_name}</strong> ↔ <strong>{d.object_b_name}</strong></>
                    )}
                    {d.dissonance_type === 'career_move' && (
                      <>{d.source_user_name} updated <strong>{d.object_name}</strong></>
                    )}
                    {d.dissonance_type === 'type_change' && (
                      <>{d.source_user_name} updated types for <strong>{d.object_name}</strong></>
                    )}
                  </span>
                  <div className={styles.detail}>
                    {d.dissonance_type === 'new_object' && (
                      <span>{d.object_class}</span>
                    )}
                    {(d.dissonance_type === 'new_connection' || d.dissonance_type === 'deactivated_connection') &&
                      (d.role_a_name || d.role_b_name) && (
                      <span>{[d.role_a_name, d.role_b_name].filter(Boolean).join(' / ')}</span>
                    )}
                    {d.dissonance_type === 'career_move' && (
                      <>
                        {d.their_title !== d.your_title && (
                          <span>Title: {d.your_title || '—'} → {d.their_title || '—'}</span>
                        )}
                        {d.their_status !== d.your_status && (
                          <span>Status: {d.your_status || '—'} → {d.their_status || '—'}</span>
                        )}
                        {d.their_name !== d.your_name && (
                          <span>Name: {d.your_name || '—'} → {d.their_name || '—'}</span>
                        )}
                      </>
                    )}
                    {d.dissonance_type === 'type_change' && d.their_types && d.your_types && (
                      <span>
                        {d.their_types.filter(t => !d.your_types!.includes(t)).map(t => `+${t}`).join(' ')}
                        {d.their_types.filter(t => !d.your_types!.includes(t)).length > 0 &&
                         d.your_types.filter(t => !d.their_types!.includes(t)).length > 0 && '  '}
                        {d.your_types.filter(t => !d.their_types!.includes(t)).map(t => `−${t}`).join(' ')}
                      </span>
                    )}
                    <span className={styles.mapName}>{d.map_name}</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button className={styles.acceptBtn} onClick={e => { e.stopPropagation(); handleAccept(d) }}>
                    Accept
                  </button>
                  <button className={styles.ignoreBtn} onClick={e => { e.stopPropagation(); handleIgnore(d) }}>
                    Ignore
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          You're in sync with your shared maps.
        </div>
      )}
    </Frame>
  )
}
