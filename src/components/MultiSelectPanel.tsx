import { useState, useEffect, useRef } from 'react'
import { Check, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { ObjectNodeData } from './ObjectNode'
import styles from './MultiSelectPanel.module.css'

interface MultiSelectItem {
  nodeId: string
  data: ObjectNodeData
}

interface MultiSelectPanelProps {
  items: MultiSelectItem[]
  position: { x: number; y: number }
  onClose: () => void
}

interface MapOption {
  id: string
  name: string
}

export default function MultiSelectPanel({ items, position, onClose }: MultiSelectPanelProps) {
  const { user } = useAuth()
  const [mode, setMode] = useState<'default' | 'newMap' | 'addToMap' | 'confirmDelete'>('default')
  const [newMapName, setNewMapName] = useState('')
  const [maps, setMaps] = useState<MapOption[]>([])
  const [feedback, setFeedback] = useState<string | null>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  const counts: { label: string; count: number }[] = []
  const orgs = items.filter(i => i.data.class === 'org').length
  const people = items.filter(i => i.data.class === 'person').length
  const projects = items.filter(i => i.data.class === 'project').length

  if (orgs > 0) counts.push({ label: orgs === 1 ? 'org' : 'orgs', count: orgs })
  if (people > 0) counts.push({ label: people === 1 ? 'person' : 'people', count: people })
  if (projects > 0) counts.push({ label: projects === 1 ? 'project' : 'projects', count: projects })

  // Load existing maps for "Add to Map" mode
  useEffect(() => {
    if (mode !== 'addToMap' || !user) return
    supabase
      .from('maps')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
      .then(({ data }) => {
        if (data) setMaps(data)
      })
  }, [mode, user])

  useEffect(() => {
    if (mode === 'newMap') {
      setTimeout(() => nameInputRef.current?.focus(), 0)
    }
  }, [mode])

  // Clear feedback after a delay
  useEffect(() => {
    if (!feedback) return
    const t = setTimeout(() => setFeedback(null), 2000)
    return () => clearTimeout(t)
  }, [feedback])

  const objectIds = items.map(i => i.nodeId)

  const handleDelete = async () => {
    if (!user) return

    // Delete overrides first (critical — removes from landscape)
    for (const id of objectIds) {
      await supabase
        .from('objects_overrides')
        .delete()
        .eq('object_id', id)
        .eq('user_id', user.id)
    }

    // Clean up connections (non-critical)
    try {
      // Delete user-created connections involving any of these objects
      for (const id of objectIds) {
        await supabase
          .from('connections_overrides')
          .delete()
          .eq('user_id', user.id)
          .or(`object_a_id.eq.${id},object_b_id.eq.${id}`)
      }

      // Deactivate canonical connections involving these objects
      for (const id of objectIds) {
        const { data: canonConns } = await supabase
          .from('connections')
          .select('id, object_a_id, object_b_id')
          .eq('is_active', true)
          .or(`object_a_id.eq.${id},object_b_id.eq.${id}`)

        for (const c of canonConns ?? []) {
          const { data: existing } = await supabase
            .from('connections_overrides')
            .select('id')
            .eq('user_id', user.id)
            .eq('connection_id', c.id)
            .maybeSingle()

          if (existing) {
            await supabase.from('connections_overrides').update({ deactivated: true }).eq('id', existing.id)
          } else {
            await supabase.from('connections_overrides').insert({
              user_id: user.id,
              connection_id: c.id,
              object_a_id: c.object_a_id,
              object_b_id: c.object_b_id,
              deactivated: true,
            })
          }
        }
      }

      // Hard-delete user-created objects
      for (const item of items) {
        if (!item.data.is_canon && item.data.created_by === user.id) {
          await supabase.from('objects').delete().eq('id', item.nodeId)
        }
      }
    } catch (e) {
      console.error('Connection cleanup error (non-critical):', e)
    }

    onClose()
    document.dispatchEvent(new Event('coterie:refresh-canvas'))
  }

  const handleCreateMap = async () => {
    if (!user || !newMapName.trim()) return
    const { data: map, error: mapError } = await supabase
      .from('maps')
      .insert({ name: newMapName.trim(), user_id: user.id })
      .select('id')
      .single()

    if (mapError || !map) { console.error('Failed to create map:', mapError); return }

    // Add all selected objects
    const { error: objError } = await supabase
      .from('maps_objects')
      .insert(objectIds.map(id => ({ map_id: map.id, object_ref_id: id })))
    if (objError) console.error('Failed to add objects to map:', objError)

    setNewMapName('')
    // Notify MapsFrame to refresh and select the new map, then clear selection
    document.dispatchEvent(new CustomEvent('coterie:map-created', { detail: { mapId: map.id } }))
    onClose()
  }

  const handleAddToMap = async (mapId: string, mapName: string) => {
    // Upsert to avoid duplicate key errors if some are already in the map
    const { error } = await supabase
      .from('maps_objects')
      .upsert(
        objectIds.map(id => ({ map_id: mapId, object_ref_id: id })),
        { onConflict: 'map_id,object_ref_id' }
      )
    if (error) { console.error('Failed to add objects to map:', error); return }

    setMode('default')
    setFeedback(`Added to "${mapName}"`)
  }

  return (
    <div
      className={styles.panel}
      style={{ left: position.x, top: position.y }}
    >
      <div className={styles.header}>
        <span className={styles.count}>{items.length} selected</span>
        <button className={styles.close} onClick={onClose}>&times;</button>
      </div>

      <div className={styles.breakdown}>
        {counts.map(c => (
          <span key={c.label} className={styles.tag}>{c.count} {c.label}</span>
        ))}
      </div>

      {/* Feedback message */}
      {feedback && (
        <div className={styles.feedback}>
          <Check size={12} />
          {feedback}
        </div>
      )}

      {/* Default actions */}
      {mode === 'default' && !feedback && (
        <div className={styles.actions}>
          <button className={styles.action} onClick={() => setMode('newMap')}>New Map</button>
          <button className={styles.action} onClick={() => setMode('addToMap')}>Add to Map</button>
          <button className={styles.action} onClick={() => setMode('confirmDelete')} style={{ color: 'var(--color-danger)' }}>
            <Trash2 size={12} /> Delete {items.length} Objects
          </button>
        </div>
      )}

      {/* New Map mode — name input */}
      {mode === 'newMap' && (
        <div className={styles.inlineForm}>
          <input
            ref={nameInputRef}
            className={styles.inlineInput}
            placeholder="Map name..."
            value={newMapName}
            onChange={e => setNewMapName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreateMap()
              if (e.key === 'Escape') { setMode('default'); setNewMapName('') }
            }}
          />
          <div className={styles.inlineActions}>
            <button className={styles.inlineCancel} onClick={() => { setMode('default'); setNewMapName('') }}>Cancel</button>
            <button className={styles.inlineConfirm} onClick={handleCreateMap} disabled={!newMapName.trim()}>Create</button>
          </div>
        </div>
      )}

      {/* Confirm delete */}
      {mode === 'confirmDelete' && (
        <div className={styles.inlineForm}>
          <span style={{ fontSize: 12, color: 'var(--color-text-muted)' }}>
            Remove {items.length} objects from your Landscape? Their connections will also be removed.
          </span>
          <div className={styles.inlineActions}>
            <button className={styles.inlineCancel} onClick={() => setMode('default')}>Cancel</button>
            <button className={styles.inlineConfirm} onClick={handleDelete} style={{ background: 'var(--color-danger)' }}>Delete</button>
          </div>
        </div>
      )}

      {/* Add to Map mode — pick existing map */}
      {mode === 'addToMap' && (
        <div className={styles.mapPicker}>
          {maps.length > 0 ? (
            maps.map(m => (
              <button key={m.id} className={styles.mapPickerItem} onClick={() => handleAddToMap(m.id, m.name)}>
                {m.name}
              </button>
            ))
          ) : (
            <span className={styles.mapPickerEmpty}>No maps yet</span>
          )}
          <button className={styles.inlineCancel} onClick={() => setMode('default')}>Cancel</button>
        </div>
      )}
    </div>
  )
}
