import { useState, useEffect, useRef, useCallback } from 'react'
import { Map as MapIcon, Plus, ChevronLeft, Pencil, Trash2, X, Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Frame from './Frame'
import styles from './MapsFrame.module.css'

interface MapRow {
  id: string
  name: string
  description: string | null
  object_count: number
}

interface MapObject {
  object_ref_id: string
  name: string
  class: string
  title: string | null
}

interface SearchResult {
  id: string
  name: string
  class: string
  title: string | null
}

interface MapsFrameProps {
  onClose: () => void
  activeMapId: string | null
  onActivateMap: (mapId: string | null) => void
}

export default function MapsFrame({ onClose, activeMapId, onActivateMap }: MapsFrameProps) {
  const { user } = useAuth()
  const [maps, setMaps] = useState<MapRow[]>([])
  const [selectedMap, setSelectedMap] = useState<MapRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const createInputRef = useRef<HTMLInputElement>(null)

  // Detail view state
  const [mapObjects, setMapObjects] = useState<MapObject[]>([])
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)

  // Add-object search
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [highlightIndex, setHighlightIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  const loadMaps = useCallback(async () => {
    if (!user) return
    // Get maps with object counts
    const { data } = await supabase
      .from('maps')
      .select('id, name, description')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')

    if (!data) return

    // Get counts per map
    const counts = new Map<string, number>()
    for (const m of data) {
      const { count } = await supabase
        .from('maps_objects')
        .select('*', { count: 'exact', head: true })
        .eq('map_id', m.id)
      counts.set(m.id, count ?? 0)
    }

    setMaps(data.map(m => ({
      ...m,
      object_count: counts.get(m.id) ?? 0,
    })))
  }, [user])

  useEffect(() => {
    loadMaps()
  }, [loadMaps])

  const loadMapObjects = useCallback(async (mapId: string) => {
    const { data } = await supabase
      .from('maps_objects')
      .select('object_ref_id, objects(name, class, title)')
      .eq('map_id', mapId)

    if (!data) return
    setMapObjects(data.map((d: any) => ({
      object_ref_id: d.object_ref_id,
      name: d.objects?.name ?? 'Unknown',
      class: d.objects?.class ?? 'org',
      title: d.objects?.title ?? null,
    })))
  }, [])

  // Create map
  const handleCreate = async () => {
    if (!user || !createName.trim()) return
    const { data, error } = await supabase
      .from('maps')
      .insert({ name: createName.trim(), description: createDesc.trim() || null, user_id: user.id })
      .select('id, name, description')
      .single()

    if (error) {
      console.error('Map create error:', error)
      return
    }
    if (data) {
      setCreating(false)
      setCreateName('')
      setCreateDesc('')
      await loadMaps()
      // Open the new map
      setSelectedMap({ ...data, object_count: 0 })
      setMapObjects([])
    }
  }

  // Open detail view
  const openMap = (map: MapRow) => {
    setSelectedMap(map)
    setEditing(false)
    setConfirmDelete(false)
    setSearchQuery('')
    setSearchResults([])
    loadMapObjects(map.id)
  }

  // Edit map
  const startEdit = () => {
    if (!selectedMap) return
    setEditName(selectedMap.name)
    setEditDesc(selectedMap.description ?? '')
    setEditing(true)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  const saveEdit = async () => {
    if (!selectedMap || !editName.trim()) return
    await supabase
      .from('maps')
      .update({ name: editName.trim(), description: editDesc.trim() || null })
      .eq('id', selectedMap.id)

    const updated = { ...selectedMap, name: editName.trim(), description: editDesc.trim() || null }
    setSelectedMap(updated)
    setEditing(false)
    await loadMaps()
  }

  // Delete map
  const handleDelete = async () => {
    if (!selectedMap) return
    // If this map was active, deactivate it
    if (activeMapId === selectedMap.id) {
      onActivateMap(null)
    }
    await supabase.from('maps').update({ is_active: false }).eq('id', selectedMap.id)
    setSelectedMap(null)
    setConfirmDelete(false)
    await loadMaps()
  }

  // Remove object from map
  const handleRemoveObject = async (objectRefId: string) => {
    if (!selectedMap) return
    await supabase
      .from('maps_objects')
      .delete()
      .eq('map_id', selectedMap.id)
      .eq('object_ref_id', objectRefId)

    setMapObjects(prev => prev.filter(o => o.object_ref_id !== objectRefId))
    // Update count in maps list
    setMaps(prev => prev.map(m =>
      m.id === selectedMap.id ? { ...m, object_count: m.object_count - 1 } : m
    ))
    setSelectedMap(prev => prev ? { ...prev, object_count: prev.object_count - 1 } : null)
  }

  // Add-object search
  useEffect(() => {
    if (!user || !selectedMap || searchQuery.length < 2) {
      setSearchResults([])
      return
    }

    const timer = setTimeout(async () => {
      const existingIds = new Set(mapObjects.map(o => o.object_ref_id))
      const { data } = await supabase
        .from('user_objects')
        .select('id, name, class, title')
        .eq('user_id', user.id)
        .in('class', ['org', 'person'])
        .ilike('name', `%${searchQuery}%`)
        .order('name')
        .limit(10)

      if (data) {
        setSearchResults(data.filter(o => !existingIds.has(o.id)))
        setHighlightIndex(0)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [searchQuery, user, selectedMap, mapObjects])

  const handleAddObject = async (obj: SearchResult) => {
    if (!selectedMap) return
    await supabase
      .from('maps_objects')
      .insert({ map_id: selectedMap.id, object_ref_id: obj.id })

    setMapObjects(prev => [...prev, {
      object_ref_id: obj.id,
      name: obj.name,
      class: obj.class,
      title: obj.title,
    }])
    setSearchQuery('')
    setSearchResults([])
    // Update count
    setMaps(prev => prev.map(m =>
      m.id === selectedMap.id ? { ...m, object_count: m.object_count + 1 } : m
    ))
    setSelectedMap(prev => prev ? { ...prev, object_count: prev.object_count + 1 } : null)
    searchInputRef.current?.focus()
  }

  // Toggle map active (canvas filter)
  const toggleActive = (mapId: string) => {
    onActivateMap(activeMapId === mapId ? null : mapId)
  }

  // --- Render ---

  // Detail view
  if (selectedMap) {
    return (
      <Frame title="Maps" onClose={onClose} initialPosition={{ x: 60, y: 120 }} width={320}>
        {/* Header with back, name, edit/delete */}
        <div className={styles.detailHeader}>
          <button className={styles.backBtn} onClick={() => setSelectedMap(null)} title="Back to maps">
            <ChevronLeft size={16} />
          </button>
          {editing ? (
            <input
              ref={editInputRef}
              className={`${styles.input} ${styles.detailName}`}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              style={{ flex: 1 }}
            />
          ) : (
            <span className={styles.detailName}>{selectedMap.name}</span>
          )}
          <div className={styles.detailActions}>
            {editing ? (
              <>
                <button className={styles.iconBtn} onClick={saveEdit} title="Save">
                  <Pencil size={14} />
                </button>
                <button className={styles.iconBtn} onClick={() => setEditing(false)} title="Cancel">
                  <X size={14} />
                </button>
              </>
            ) : (
              <>
                <button className={styles.iconBtn} onClick={startEdit} title="Edit">
                  <Pencil size={14} />
                </button>
                <button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => setConfirmDelete(true)} title="Delete">
                  <Trash2 size={14} />
                </button>
              </>
            )}
          </div>
        </div>

        {/* Description (edit mode) */}
        {editing && (
          <textarea
            className={styles.input}
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            placeholder="Description (optional)"
            rows={2}
            style={{ marginBottom: 12, resize: 'vertical', fontFamily: 'var(--font-sans)' }}
          />
        )}

        {/* Description (read mode) */}
        {!editing && selectedMap.description && (
          <p className={styles.description}>{selectedMap.description}</p>
        )}

        {/* Delete confirmation */}
        {confirmDelete && (
          <div className={styles.deleteConfirm}>
            <span className={styles.deleteConfirmText}>
              Delete "{selectedMap.name}"? This removes the map, not the objects themselves.
            </span>
            <div className={styles.deleteConfirmActions}>
              <button className={styles.formBtn} onClick={() => setConfirmDelete(false)}>Cancel</button>
              <button className={styles.deleteBtnConfirm} onClick={handleDelete}>Delete</button>
            </div>
          </div>
        )}

        {/* Activate/deactivate as canvas filter */}
        <div className={styles.section}>
          <button
            className={`${styles.formBtn} ${activeMapId === selectedMap.id ? styles.formBtnPrimary : ''}`}
            onClick={() => toggleActive(selectedMap.id)}
            style={{ width: '100%', marginBottom: 12 }}
          >
            {activeMapId === selectedMap.id ? 'Showing on Canvas' : 'Show on Canvas'}
          </button>
        </div>

        {/* Objects in this map */}
        <div className={styles.section}>
          <span className={styles.sectionLabel}>
            Objects ({mapObjects.length})
          </span>

          {mapObjects.length > 0 ? (
            <div className={styles.objectList}>
              {mapObjects.map(obj => (
                <div key={obj.object_ref_id} className={styles.objectItem}>
                  <span className={styles.classDot} data-class={obj.class} />
                  <span className={styles.objectName}>{obj.name}</span>
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemoveObject(obj.object_ref_id)}
                    title="Remove from map"
                  >
                    <X size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className={styles.emptyHint}>No objects yet. Search below to add some.</p>
          )}
        </div>

        {/* Add objects search */}
        <div className={styles.addSection}>
          <div className={styles.searchInput}>
            <Search size={14} className={styles.searchIcon} />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Add objects..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setHighlightIndex(i => Math.min(i + 1, searchResults.length - 1))
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setHighlightIndex(i => Math.max(i - 1, 0))
                } else if (e.key === 'Enter' && searchResults.length > 0) {
                  e.preventDefault()
                  handleAddObject(searchResults[highlightIndex])
                } else if (e.key === 'Escape') {
                  setSearchQuery('')
                  setSearchResults([])
                }
              }}
              autoComplete="off"
            />
          </div>

          {searchResults.length > 0 && (
            <div className={styles.searchResults}>
              {searchResults.map((r, i) => (
                <button
                  key={r.id}
                  className={`${styles.searchResult} ${i === highlightIndex ? styles.searchResultHighlighted : ''}`}
                  onClick={() => handleAddObject(r)}
                  onMouseEnter={() => setHighlightIndex(i)}
                >
                  <span className={styles.classDot} data-class={r.class} />
                  <span className={styles.searchResultName}>{r.name}</span>
                  {r.title && <span className={styles.searchResultTitle}>{r.title}</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </Frame>
    )
  }

  // List view
  return (
    <Frame title="Maps" onClose={onClose} initialPosition={{ x: 60, y: 120 }} width={320}>
      {/* Maps list */}
      {maps.length > 0 ? (
        <div className={styles.mapsList}>
          {maps.map(m => (
            <button key={m.id} className={`${styles.mapItem} ${activeMapId === m.id ? styles.mapItemActive : ''}`} onClick={() => openMap(m)}>
              <MapIcon size={14} className={styles.mapIcon} />
              <div className={styles.mapInfo}>
                <span className={styles.mapName}>{m.name}</span>
                <span className={styles.mapCount}>
                  {m.object_count} {m.object_count === 1 ? 'object' : 'objects'}
                </span>
              </div>
              {activeMapId === m.id && <span className={styles.activeIndicator} />}
            </button>
          ))}
        </div>
      ) : !creating ? (
        <div className={styles.empty}>
          Create a map to organize your landscape into filtered views.
        </div>
      ) : null}

      {/* New map button / inline create form */}
      {creating ? (
        <div className={styles.createForm}>
          <input
            ref={createInputRef}
            className={styles.input}
            placeholder="Map name"
            value={createName}
            onChange={e => setCreateName(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setCreating(false); setCreateName(''); setCreateDesc('') }
            }}
            autoFocus
          />
          <input
            className={styles.input}
            placeholder="Description (optional)"
            value={createDesc}
            onChange={e => setCreateDesc(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') handleCreate()
              if (e.key === 'Escape') { setCreating(false); setCreateName(''); setCreateDesc('') }
            }}
          />
          <div className={styles.formActions}>
            <button className={styles.formBtn} onClick={() => { setCreating(false); setCreateName(''); setCreateDesc('') }}>
              Cancel
            </button>
            <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={handleCreate} disabled={!createName.trim()}>
              Create
            </button>
          </div>
        </div>
      ) : (
        <button className={styles.newMapBtn} onClick={() => setCreating(true)}>
          <Plus size={14} />
          New Map
        </button>
      )}
    </Frame>
  )
}
