import { useState, useEffect, useCallback } from 'react'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Frame from './Frame'
import styles from './CoterieUpdatesFrame.module.css'

interface Dissonance {
  dissonance_type: 'new_object' | 'new_connection' | 'deactivated_connection' | 'career_move' | 'type_change'
  coterie_id: string
  coterie_name: string
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

interface CoterieUpdatesFrameProps {
  onClose: () => void
}

export default function CoterieUpdatesFrame({ onClose }: CoterieUpdatesFrameProps) {
  const { user } = useAuth()
  const [dissonances, setDissonances] = useState<Dissonance[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const loadDissonances = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.rpc('get_dissonances', { p_user_id: user.id })
    if (data) setDissonances((data as Dissonance[]).filter(d => !d.is_dismissed))
  }, [user])

  useEffect(() => {
    loadDissonances()
    // Poll for cross-user changes (same rationale as NotificationBoxes)
    const interval = setInterval(loadDissonances, 3000)
    return () => clearInterval(interval)
  }, [loadDissonances])

  // Push count directly to NotificationBoxes whenever local state changes
  useEffect(() => {
    document.dispatchEvent(new CustomEvent('coterie:dissonance-count', { detail: dissonances.length }))
  }, [dissonances.length])

  const itemKey = (d: Dissonance) => `${d.ref_id}-${d.dissonance_type}`

  const removeDissonance = (d: Dissonance) => {
    setDissonances(prev => prev.filter(x =>
      !(x.ref_id === d.ref_id && x.source_user_id === d.source_user_id && x.dissonance_type === d.dissonance_type)
    ))
    setSelectedId(null)
    document.dispatchEvent(new Event('coterie:notifications-changed'))
  }

  const handleAccept = async (d: Dissonance) => {
    if (!user) return

    switch (d.dissonance_type) {
      case 'new_object': {
        const { data: memberOv } = await supabase
          .from('objects_overrides')
          .select('name, title, status, map_x, map_y, event_date, data')
          .eq('id', d.ref_id)
          .single()
        if (!memberOv) return

        await supabase.from('objects_overrides').insert({
          user_id: user.id,
          object_id: d.object_id,
          name: memberOv.name,
          title: memberOv.title,
          status: memberOv.status,
          map_x: memberOv.map_x,
          map_y: memberOv.map_y,
          event_date: memberOv.event_date,
          data: memberOv.data,
        })

        const { data: aggMap } = await supabase
          .from('maps')
          .select('id')
          .eq('user_id', user.id)
          .eq('source_coterie_id', d.coterie_id)
          .single()
        if (aggMap && d.object_id) {
          await supabase.from('maps_objects').upsert({
            map_id: aggMap.id,
            object_ref_id: d.object_id,
          })
        }
        break
      }

      case 'new_connection': {
        const { data: memberConn } = await supabase
          .from('connections_overrides')
          .select('object_a_id, object_b_id, role_a, role_b, data')
          .eq('id', d.ref_id)
          .single()
        if (!memberConn) return

        await supabase.from('connections_overrides').insert({
          user_id: user.id,
          object_a_id: memberConn.object_a_id,
          object_b_id: memberConn.object_b_id,
          role_a: memberConn.role_a,
          role_b: memberConn.role_b,
          data: memberConn.data,
        })
        break
      }

      case 'deactivated_connection': {
        const { data: memberDeact } = await supabase
          .from('connections_overrides')
          .select('connection_id')
          .eq('id', d.ref_id)
          .single()
        if (!memberDeact?.connection_id) return

        const { data: existing } = await supabase
          .from('connections_overrides')
          .select('id')
          .eq('user_id', user.id)
          .eq('connection_id', memberDeact.connection_id)
          .maybeSingle()

        if (existing) {
          await supabase.from('connections_overrides')
            .update({ deactivated: true })
            .eq('id', existing.id)
        } else {
          await supabase.from('connections_overrides').insert({
            user_id: user.id,
            connection_id: memberDeact.connection_id,
            deactivated: true,
          })
        }
        break
      }

      case 'career_move': {
        const updates: Record<string, string | null> = {}
        if (d.their_name !== d.your_name) updates.name = d.their_name
        if (d.their_title !== d.your_title) updates.title = d.their_title
        if (d.their_status !== d.your_status) updates.status = d.their_status

        if (Object.keys(updates).length > 0) {
          await supabase
            .from('objects_overrides')
            .update(updates)
            .eq('user_id', user.id)
            .eq('object_id', d.object_id)
        }
        break
      }

      case 'type_change': {
        if (!d.their_types || !d.object_id) break
        // Replace user's type overrides with member's types
        await supabase
          .from('objects_types_overrides')
          .delete()
          .eq('user_id', user.id)
          .eq('object_id', d.object_id)

        // Resolve display_names to type IDs
        const { data: typeRows } = await supabase
          .from('types')
          .select('id, display_name')
          .in('display_name', d.their_types)
          .eq('class', d.object_class!)
        if (typeRows && typeRows.length > 0) {
          await supabase.from('objects_types_overrides').insert(
            typeRows.map(t => ({
              user_id: user.id,
              object_id: d.object_id!,
              type_id: t.id,
            }))
          )
        }
        break
      }
    }

    removeDissonance(d)
    document.dispatchEvent(new Event('coterie:refresh-canvas'))
  }

  const handleIgnore = async (d: Dissonance) => {
    if (!user) return
    await supabase.from('coteries_reviews').insert({
      user_id: user.id,
      source_user_id: d.source_user_id,
      ref_type: d.ref_type,
      ref_id: d.ref_id,
    })
    removeDissonance(d)
  }

  return (
    <Frame title="Coterie Updates" onClose={onClose} initialPosition={{ x: 60, y: 60 }} width={320} resizable persistKey="coterie-updates">
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
                    <span className={styles.coterieName}>{d.coterie_name}</span>
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
          You're in sync with your coterie.
        </div>
      )}
    </Frame>
  )
}
