import { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { Map as MapIcon, Plus, Check, Pencil, Trash2, X, Search, Focus, MousePointerClick, ChevronRight, Share2, Users } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Frame from './Frame'
import Tooltip from './Tooltip'
import styles from './MapsFrame.module.css'

interface MapRow {
  id: string
  name: string
  description: string | null
  auto_add: boolean
  object_count: number
  source_coterie_id: string | null
  coterie_name: string | null
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

// --- Map Detail Card (opens as separate frame to the right) ---

interface MapDetailCardProps {
  map: MapRow
  activeMapId: string | null
  onActivateMap: (mapId: string | null) => void
  onClose: () => void
  onMapUpdated: (updated: MapRow) => void
  onMapDeleted: (mapId: string) => void
  initialPosition: { x: number; y: number }
}

const MapDetailCard = forwardRef<HTMLDivElement, MapDetailCardProps>(function MapDetailCard({ map, activeMapId, onActivateMap, onClose, onMapUpdated, onMapDeleted, initialPosition }, ref) {
  const { user } = useAuth()
  const [mapObjects, setMapObjects] = useState<MapObject[]>([])
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editAutoAdd, setEditAutoAdd] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [coterieDeleteBlock, setCoterieDeleteBlock] = useState<string | null>(null)
  const editInputRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [highlightIndex, setHighlightIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Share (create coterie) state
  const [sharing, setSharing] = useState(false)
  const [shareName, setShareName] = useState('')
  const [shareEmails, setShareEmails] = useState<string[]>([])
  const [shareEmailInput, setShareEmailInput] = useState('')

  const loadMapObjects = useCallback(async (mapId: string) => {
    if (!user) return
    const { data: moData } = await supabase
      .from('maps_objects')
      .select('object_ref_id')
      .eq('map_id', mapId)
    if (!moData) return
    const ids = moData.map(d => d.object_ref_id)
    if (ids.length === 0) { setMapObjects([]); return }
    const { data } = await supabase
      .from('user_objects')
      .select('id, name, class, title')
      .eq('user_id', user.id)
      .in('id', ids)
    if (!data) return
    setMapObjects(data.map((d: any) => ({
      object_ref_id: d.id,
      name: d.name ?? 'Unknown',
      class: d.class ?? 'org',
      title: d.title ?? null,
    })))
  }, [user])

  // Reset on map change
  useEffect(() => {
    setEditing(false)
    setConfirmDelete(false)
    setSharing(false)
    setShareEmails([])
    setShareEmailInput('')
    setSearchQuery('')
    setSearchResults([])
    loadMapObjects(map.id)
  }, [map.id, loadMapObjects])

  // Refresh object list when maps:refresh fires (e.g., auto-add on object create)
  useEffect(() => {
    const handler = () => loadMapObjects(map.id)
    document.addEventListener('maps:refresh', handler)
    return () => document.removeEventListener('maps:refresh', handler)
  }, [map.id, loadMapObjects])

  const startShare = () => {
    setSharing(true)
    setShareName(`${map.name} Coterie`)
    setShareEmails([])
    setShareEmailInput('')
  }

  const addShareEmail = () => {
    const email = shareEmailInput.trim().toLowerCase()
    if (!email || shareEmails.includes(email)) return
    setShareEmails(prev => [...prev, email])
    setShareEmailInput('')
  }

  const handleShare = async () => {
    if (!user || !shareName.trim() || shareEmails.length === 0) return

    // Create the coterie
    const { data: coterie, error } = await supabase
      .from('coteries')
      .insert({ name: shareName.trim(), owner_id: user.id })
      .select('id')
      .single()
    if (error || !coterie) { console.error('Coterie create error:', error); return }

    // Add owner as member
    const { error: memberError } = await supabase.from('coteries_members').insert({
      coterie_id: coterie.id,
      user_id: user.id,
      role: 'owner',
    })
    if (memberError) { console.error('Failed to add coterie member:', memberError); return }

    // Link this map
    const { error: linkError } = await supabase.from('coteries_maps').insert({
      coterie_id: coterie.id,
      map_id: map.id,
    })
    if (linkError) { console.error('Failed to link map to coterie:', linkError); return }

    // Create invitations
    await Promise.all(
      shareEmails.map(email =>
        supabase.from('coteries_invitations').insert({
          coterie_id: coterie.id,
          invited_by: user.id,
          email,
        }).then(({ error }) => {
          if (error) console.error('Failed to create invitation for', email, error)
        })
      )
    )

    setSharing(false)
    // Notify maps list to refresh (coterie linkage changed)
    document.dispatchEvent(new CustomEvent('maps:refresh'))
  }

  const startEdit = () => {
    setEditName(map.name)
    setEditDesc(map.description ?? '')
    setEditAutoAdd(map.auto_add)
    setEditing(true)
    setTimeout(() => editInputRef.current?.focus(), 0)
  }

  const saveEdit = async () => {
    if (!editName.trim()) return
    const { error } = await supabase
      .from('maps')
      .update({ name: editName.trim(), description: editDesc.trim() || null, auto_add: editAutoAdd })
      .eq('id', map.id)
    if (error) { console.error('Failed to save map:', error); return }
    onMapUpdated({ ...map, name: editName.trim(), description: editDesc.trim() || null, auto_add: editAutoAdd })
    setEditing(false)
  }

  const handleDelete = async () => {
    if (activeMapId === map.id) onActivateMap(null)
    const { error } = await supabase.from('maps').update({ is_active: false }).eq('id', map.id)
    if (error) { console.error('Failed to delete map:', error); return }
    setConfirmDelete(false)
    onMapDeleted(map.id)
  }

  const handleRemoveObject = async (objectRefId: string) => {
    const { error } = await supabase
      .from('maps_objects')
      .delete()
      .eq('map_id', map.id)
      .eq('object_ref_id', objectRefId)
    if (error) { console.error('Failed to remove object from map:', error); return }
    setMapObjects(prev => prev.filter(o => o.object_ref_id !== objectRefId))
    onMapUpdated({ ...map, object_count: map.object_count - 1 })
  }

  // Search for objects to add
  useEffect(() => {
    if (!user || searchQuery.length < 2) {
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
  }, [searchQuery, user, mapObjects])

  const handleAddObject = async (obj: SearchResult) => {
    const { error } = await supabase
      .from('maps_objects')
      .insert({ map_id: map.id, object_ref_id: obj.id })
    if (error) { console.error('Failed to add object to map:', error); return }
    setMapObjects(prev => [...prev, {
      object_ref_id: obj.id,
      name: obj.name,
      class: obj.class,
      title: obj.title,
    }])
    setSearchQuery('')
    setSearchResults([])
    onMapUpdated({ ...map, object_count: map.object_count + 1 })
    searchInputRef.current?.focus()
  }

  const headerActions = editing ? (
    <Tooltip text="Save"><button className={styles.iconBtn} onClick={saveEdit}><Check size={14} /></button></Tooltip>
  ) : (
    <>
      <Tooltip text="Share as Coterie"><button className={styles.iconBtn} onClick={startShare}><Share2 size={14} /></button></Tooltip>
      <Tooltip text="Edit map"><button className={styles.iconBtn} onClick={startEdit}><Pencil size={14} /></button></Tooltip>
      <Tooltip text="Delete map"><button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={async () => {
        if (map.source_coterie_id) {
          const { data: coterie } = await supabase
            .from('coteries')
            .select('name')
            .eq('id', map.source_coterie_id)
            .single()
          setCoterieDeleteBlock(coterie?.name || 'a coterie')
        } else {
          setConfirmDelete(true)
        }
      }}><Trash2 size={14} /></button></Tooltip>
    </>
  )

  return (
    <Frame
      ref={ref}
      title={map.name}
      onClose={editing ? () => setEditing(false) : onClose}
      initialPosition={initialPosition}
      width={320}
      actions={headerActions}
      titleClassName={styles.entityName}
      resizable
      headerContent={
        editing ? (
          <div className={styles.detailMeta}>
            <input
              ref={editInputRef}
              className={styles.inlineInput}
              value={editName}
              onChange={e => setEditName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') saveEdit()
                if (e.key === 'Escape') setEditing(false)
              }}
              placeholder="Map name"
            />
            <textarea
              className={styles.inlineInput}
              value={editDesc}
              onChange={e => setEditDesc(e.target.value)}
              placeholder="Description (optional)"
              rows={2}
              style={{ resize: 'vertical' }}
            />
            <label className={styles.checkboxLabel}>
              <input
                type="checkbox"
                checked={editAutoAdd}
                onChange={e => setEditAutoAdd(e.target.checked)}
              />
              Automatically add new objects to map
            </label>
          </div>
        ) : (map.description || map.auto_add) ? (
          <div className={styles.detailMeta}>
            {map.description && <p className={styles.description}>{map.description}</p>}
            {map.auto_add && <p className={styles.autoAddHint}>New objects will be automatically added</p>}
          </div>
        ) : undefined
      }
    >
      {/* Coterie linkage banner */}
      {map.coterie_name && (
        <div className={styles.coterieBanner}>
          <Users size={12} className={styles.coterieBannerIcon} />
          <span>
            {coterieDeleteBlock
              ? <>Leave the <strong>{map.coterie_name}</strong> coterie before deleting this map.</>
              : <>Linked to <strong>{map.coterie_name}</strong></>
            }
          </span>
          {coterieDeleteBlock && (
            <button className={styles.formBtn} onClick={() => setCoterieDeleteBlock(null)}>OK</button>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className={styles.deleteConfirm}>
          <span className={styles.deleteConfirmText}>
            Delete &ldquo;{map.name}&rdquo;? This removes the map, not the objects themselves.
          </span>
          <div className={styles.deleteConfirmActions}>
            <button className={styles.formBtn} onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className={styles.deleteBtnConfirm} onClick={handleDelete}>Delete</button>
          </div>
        </div>
      )}

      {/* Share as coterie form */}
      {sharing && (
        <div className={styles.deleteConfirm}>
          <input
            className={styles.input}
            placeholder="Coterie name"
            value={shareName}
            onChange={e => setShareName(e.target.value)}
            autoFocus
          />
          <div className={styles.emailTags}>
            {shareEmails.map(e => (
              <span key={e} className={styles.emailTag}>
                {e}
                <button className={styles.emailTagRemove} onClick={() => setShareEmails(prev => prev.filter(x => x !== e))}>
                  <X size={10} />
                </button>
              </span>
            ))}
            <input
              className={styles.emailInput}
              type="email"
              placeholder={shareEmails.length ? '' : 'Invite by email...'}
              value={shareEmailInput}
              onChange={e => setShareEmailInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); addShareEmail() }
                if (e.key === 'Backspace' && !shareEmailInput && shareEmails.length) {
                  setShareEmails(prev => prev.slice(0, -1))
                }
              }}
              onBlur={() => { if (shareEmailInput.trim()) addShareEmail() }}
            />
          </div>
          <div className={styles.deleteConfirmActions}>
            <button className={styles.formBtn} onClick={() => setSharing(false)}>Cancel</button>
            <button
              className={`${styles.formBtn} ${styles.formBtnPrimary}`}
              onClick={handleShare}
              disabled={!shareName.trim() || shareEmails.length === 0}
            >
              Share
            </button>
          </div>
        </div>
      )}

      {/* Objects list */}
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
                <Tooltip text="Remove from map"><button
                  className={styles.removeBtn}
                  onClick={() => handleRemoveObject(obj.object_ref_id)}
                >
                  <X size={12} />
                </button></Tooltip>
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
})

// --- Maps List Frame ---

interface MapsFrameProps {
  onClose: () => void
  activeMapId: string | null
  onActivateMap: (mapId: string | null) => void
  onHighlightObjects?: (objectIds: string[] | null) => void
  onMapEditModeChange?: (active: boolean, handler: ((objectId: string) => void) | null) => void
  onMapSelected?: () => void
}

export default function MapsFrame({ onClose, activeMapId, onActivateMap, onHighlightObjects, onMapEditModeChange, onMapSelected }: MapsFrameProps) {
  const { user } = useAuth()
  const [maps, setMaps] = useState<MapRow[]>([])
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)
  const [openedMap, setOpenedMap] = useState<MapRow | null>(null)
  const [creating, setCreating] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createDesc, setCreateDesc] = useState('')
  const listFrameRef = useRef<HTMLDivElement>(null)
  const detailFrameRef = useRef<HTMLDivElement>(null)
  const [detailPosition, setDetailPosition] = useState({ x: 388, y: 120 })

  // Map edit mode: click canvas objects to add/remove from selected map
  const [mapEditMode, setMapEditMode] = useState(false)
  const [mapObjectIds, setMapObjectIds] = useState<Set<string>>(new Set())
  const mapObjectIdsRef = useRef<Set<string>>(new Set())
  mapObjectIdsRef.current = mapObjectIds

  const loadMaps = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('maps')
      .select('id, name, description, auto_add, source_coterie_id')
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
    if (!data) return
    const countResults = await Promise.all(
      data.map(m =>
        supabase.from('maps_objects').select('*', { count: 'exact', head: true }).eq('map_id', m.id)
          .then(({ count }) => [m.id, count ?? 0] as const)
      )
    )
    const counts = new Map<string, number>(countResults)

    // Resolve coterie names for linked maps (recipient: source_coterie_id, sender: coteries_maps)
    const coterieNames = new Map<string, string>()
    const recipientIds = data.filter(m => m.source_coterie_id).map(m => m.source_coterie_id!)
    if (recipientIds.length > 0) {
      const { data: coteries } = await supabase
        .from('coteries')
        .select('id, name')
        .in('id', recipientIds)
      for (const c of coteries || []) {
        for (const m of data) {
          if (m.source_coterie_id === c.id) coterieNames.set(m.id, c.name)
        }
      }
    }
    // Sender maps linked via coteries_maps
    const mapIds = data.map(m => m.id)
    const { data: cmRows } = await supabase
      .from('coteries_maps')
      .select('map_id, coterie_id')
      .in('map_id', mapIds)
    if (cmRows?.length) {
      const coterieIds = [...new Set(cmRows.map(r => r.coterie_id))]
      const { data: coteries } = await supabase
        .from('coteries')
        .select('id, name')
        .in('id', coterieIds)
      const nameMap = new Map((coteries || []).map(c => [c.id, c.name]))
      for (const r of cmRows) {
        if (!coterieNames.has(r.map_id)) {
          coterieNames.set(r.map_id, nameMap.get(r.coterie_id) || 'a coterie')
        }
      }
    }

    setMaps(data.map(m => ({
      ...m,
      object_count: counts.get(m.id) ?? 0,
      coterie_name: coterieNames.get(m.id) ?? null,
    })))
  }, [user])

  useEffect(() => { loadMaps() }, [loadMaps])

  // Listen for map creation from MultiSelectPanel + coterie linkage changes
  useEffect(() => {
    const handleCreated = (e: Event) => {
      const mapId = (e as CustomEvent).detail?.mapId
      loadMaps().then(() => {
        if (mapId) setSelectedMapId(mapId)
      })
    }
    const handleRefresh = () => loadMaps()
    document.addEventListener('coterie:map-created', handleCreated)
    document.addEventListener('maps:refresh', handleRefresh)
    return () => {
      document.removeEventListener('coterie:map-created', handleCreated)
      document.removeEventListener('maps:refresh', handleRefresh)
    }
  }, [loadMaps])

  // Load map object IDs when selection changes
  useEffect(() => {
    if (!selectedMapId) {
      setMapObjectIds(new Set())
      return
    }
    supabase
      .from('maps_objects')
      .select('object_ref_id')
      .eq('map_id', selectedMapId)
      .then(({ data }) => {
        if (data) setMapObjectIds(new Set(data.map(d => d.object_ref_id)))
      })
  }, [selectedMapId])

  // Derive highlights from mapObjectIds
  useEffect(() => {
    if (!selectedMapId) {
      onHighlightObjects?.(null)
    } else {
      onHighlightObjects?.(Array.from(mapObjectIds))
    }
  }, [mapObjectIds, selectedMapId, onHighlightObjects])

  // Deactivate edit mode when map selection changes
  useEffect(() => {
    setMapEditMode(false)
    onMapEditModeChange?.(false, null)
  }, [selectedMapId, onMapEditModeChange])

  // Clear highlights + edit mode when MapsFrame unmounts
  useEffect(() => {
    return () => {
      onHighlightObjects?.(null)
      onMapEditModeChange?.(false, null)
    }
  }, [onHighlightObjects, onMapEditModeChange])

  // Click anywhere outside maps UI to deselect (locked during edit mode)
  // Two mechanisms:
  // 1. Global mousedown for non-canvas clicks (navbar, other frames, canvas background)
  // 2. Custom event from Canvas's onNodeClick (React Flow uses pointer capture,
  //    so global mouse listeners don't see node clicks)
  useEffect(() => {
    if (!selectedMapId || mapEditMode) return

    const handleClickOutside = (e: MouseEvent) => {
      if (listFrameRef.current?.contains(e.target as Node)) return
      if (detailFrameRef.current?.contains(e.target as Node)) return
      setSelectedMapId(null)
    }
    const handleNodeClick = () => setSelectedMapId(null)

    document.addEventListener('mousedown', handleClickOutside)
    document.addEventListener('coterie:node-click', handleNodeClick)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('coterie:node-click', handleNodeClick)
    }
  }, [selectedMapId, mapEditMode])

  // Toggle an object in/out of the selected map (called from Canvas clicks)
  const lastToggleRef = useRef<{ id: string; time: number }>({ id: '', time: 0 })

  const handleToggleMapObject = useCallback(async (objectId: string) => {
    if (!selectedMapId) return

    // Debounce rapid toggles (e.g., double-click)
    const now = Date.now()
    if (lastToggleRef.current.id === objectId && now - lastToggleRef.current.time < 400) return
    lastToggleRef.current = { id: objectId, time: now }

    const currentIds = mapObjectIdsRef.current
    const isInMap = currentIds.has(objectId)

    // Optimistic update
    const next = new Set(currentIds)
    if (isInMap) {
      next.delete(objectId)
    } else {
      next.add(objectId)
    }
    mapObjectIdsRef.current = next
    setMapObjectIds(next)

    const countDelta = isInMap ? -1 : 1
    setMaps(prev => prev.map(m => m.id === selectedMapId ? { ...m, object_count: m.object_count + countDelta } : m))
    setOpenedMap(prev => prev?.id === selectedMapId ? { ...prev, object_count: prev.object_count + countDelta } : prev)

    // Persist
    if (isInMap) {
      const { error } = await supabase.from('maps_objects').delete()
        .eq('map_id', selectedMapId).eq('object_ref_id', objectId)
      if (error) console.error('Failed to remove object from map:', error)
    } else {
      const { error } = await supabase.from('maps_objects').insert({ map_id: selectedMapId, object_ref_id: objectId })
      if (error) console.error('Failed to add object to map:', error)
    }
  }, [selectedMapId])

  // Stable ref wrapper so Canvas always calls the latest handler
  const handleToggleRef = useRef(handleToggleMapObject)
  handleToggleRef.current = handleToggleMapObject
  const stableToggle = useCallback((id: string) => handleToggleRef.current(id), [])

  const toggleEditMode = () => {
    const newMode = !mapEditMode
    setMapEditMode(newMode)
    if (newMode) setOpenedMap(null)
    onMapEditModeChange?.(newMode, newMode ? stableToggle : null)
  }

  const computeDetailPosition = () => {
    const rect = listFrameRef.current?.getBoundingClientRect()
    if (rect) {
      setDetailPosition({ x: rect.right + 8, y: rect.top })
    }
  }

  const handleMapClick = (map: MapRow) => {
    if (mapEditMode) return // locked during edit mode
    const newId = selectedMapId === map.id ? null : map.id
    setSelectedMapId(newId)
    if (newId) onMapSelected?.()
    // If a detail card is already open, switch to the clicked map
    if (openedMap && newId && newId !== openedMap.id) {
      setOpenedMap(map)
    }
  }

  const handleMapDoubleClick = (map: MapRow) => {
    computeDetailPosition()
    setOpenedMap(map)
    setSelectedMapId(map.id)
  }

  const handleCreate = async () => {
    if (!user || !createName.trim()) return
    const { data, error } = await supabase
      .from('maps')
      .insert({ name: createName.trim(), description: createDesc.trim() || null, user_id: user.id })
      .select('id, name, description, auto_add, source_coterie_id')
      .single()
    if (error) { console.error('Map create error:', error); return }
    if (data) {
      setCreating(false)
      setCreateName('')
      setCreateDesc('')
      await loadMaps()
      const newMap = { ...data, object_count: 0, coterie_name: null }
      computeDetailPosition()
      setOpenedMap(newMap)
      setSelectedMapId(newMap.id)
    }
  }

  const handleMapUpdated = (updated: MapRow) => {
    setOpenedMap(updated)
    setMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
  }

  // Sync openedMap when maps list reloads (e.g., coterie linkage changes)
  useEffect(() => {
    if (openedMap) {
      const fresh = maps.find(m => m.id === openedMap.id)
      if (fresh && fresh.coterie_name !== openedMap.coterie_name) {
        setOpenedMap(prev => prev ? { ...prev, coterie_name: fresh.coterie_name } : prev)
      }
    }
  }, [maps])

  const handleMapDeleted = (mapId: string) => {
    setOpenedMap(null)
    setSelectedMapId(null)
    if (activeMapId === mapId) onActivateMap(null)
    loadMaps()
  }

  return (
    <>
      <Frame ref={listFrameRef} title="Maps" titleTooltip="Organize and share filtered views of your Landscape" onClose={onClose} initialPosition={{ x: 60, y: 120 }} width={280} resizable persistKey="maps">
        {maps.length > 0 ? (
          <div className={styles.mapsList} onClick={() => { if (!mapEditMode) setSelectedMapId(null) }}>
            {maps.map(m => (
              <button
                key={m.id}
                className={`${styles.mapItem} ${selectedMapId === m.id ? styles.mapItemSelected : ''} ${activeMapId === m.id ? styles.mapItemActive : ''}`}
                onClick={e => { e.stopPropagation(); handleMapClick(m) }}
                onDoubleClick={e => { e.stopPropagation(); handleMapDoubleClick(m) }}
              >
                <MapIcon size={14} className={styles.mapIcon} />
                <div className={styles.mapInfo}>
                  <span className={styles.mapName}>{m.name}</span>
                  <span className={styles.mapCount}>
                    {m.object_count} {m.object_count === 1 ? 'object' : 'objects'}
                    {m.coterie_name && (
                      <Tooltip text={`Linked to ${m.coterie_name}`}>
                        <Users size={13} className={styles.coterieBadge} />
                      </Tooltip>
                    )}
                  </span>
                </div>
                {selectedMapId === m.id ? (
                  <div className={styles.mapActions}>
                    <Tooltip text={mapEditMode ? 'Stop editing' : 'Select Mode \u2014 click objects to add or remove'}>
                    <span
                      role="button"
                      className={`${styles.mapActionBtn} ${mapEditMode ? styles.mapActionBtnActive : ''}`}
                      onClick={e => { e.stopPropagation(); toggleEditMode() }}
                    >
                      <MousePointerClick size={13} />
                    </span>
                    </Tooltip>
                    <Tooltip text={activeMapId === m.id ? 'Show all objects' : "Isolate \u2014 show only this map's objects"}>
                    <span
                      role="button"
                      className={`${styles.mapActionBtn} ${activeMapId === m.id ? styles.mapActionBtnActive : ''}`}
                      onClick={e => { e.stopPropagation(); onActivateMap(activeMapId === m.id ? null : m.id) }}
                    >
                      <Focus size={13} />
                    </span>
                    </Tooltip>
                    <Tooltip text="Open map details">
                    <span
                      role="button"
                      className={styles.mapActionBtn}
                      onClick={e => { e.stopPropagation(); handleMapDoubleClick(m) }}
                    >
                      <ChevronRight size={13} />
                    </span>
                    </Tooltip>
                  </div>
                ) : (
                  activeMapId === m.id && <span className={styles.activeIndicator} />
                )}
              </button>
            ))}
          </div>
        ) : !creating ? (
          <div className={styles.empty}>
            Create a map to organize your landscape into filtered views.
          </div>
        ) : null}

        {creating ? (
          <div className={styles.createForm}>
            <input
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
        ) : mapEditMode ? (
          <p className={styles.editModeHint}>
            Select objects to add/remove them from the <strong>{maps.find(m => m.id === selectedMapId)?.name}</strong> map.
          </p>
        ) : (
          <button className={styles.newMapBtn} onClick={() => { setSelectedMapId(null); setCreating(true) }}>
            <Plus size={14} />
            New Map
          </button>
        )}
      </Frame>

      {openedMap && (
        <MapDetailCard
          ref={detailFrameRef}
          map={openedMap}
          activeMapId={activeMapId}
          onActivateMap={onActivateMap}
          onClose={() => setOpenedMap(null)}
          onMapUpdated={handleMapUpdated}
          onMapDeleted={handleMapDeleted}
          initialPosition={detailPosition}
        />
      )}
    </>
  )
}
