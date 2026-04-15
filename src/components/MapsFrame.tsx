import { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { Map as MapIcon, Plus, Check, Pencil, Trash2, X, Search, Focus, MousePointerClick, ChevronRight, Share2, Users, Mail, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Frame from './Frame'
import Tooltip from './Tooltip'
import type { PlacementCluster } from '../types'
import styles from './MapsFrame.module.css'

interface MapRow {
  id: string
  name: string
  description: string | null
  auto_add: boolean
  object_count: number
  origin_map_id: string | null
  member_count: number
  is_admin: boolean
}

interface PendingInvite {
  id: string
  map_id: string
  map_name: string
  sender_name: string
  created_at: string
}

interface SharedMember {
  user_id: string
  display_name: string
  map_id: string  // their copy's map id
}

interface PendingMember {
  email: string
  invited_by: string
  created_at: string
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
  const [confirmLeave, setConfirmLeave] = useState(false)
  const editInputRef = useRef<HTMLInputElement>(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<SearchResult[]>([])
  const [highlightIndex, setHighlightIndex] = useState(0)
  const searchInputRef = useRef<HTMLInputElement>(null)

  // Share state
  const [sharing, setSharing] = useState(false)
  const [shareEmails, setShareEmails] = useState<string[]>([])
  const [shareEmailInput, setShareEmailInput] = useState('')

  // Members state (for shared maps)
  const [members, setMembers] = useState<SharedMember[]>([])
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([])

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

  // Load members for shared maps
  const loadMembers = useCallback(async () => {
    if (!map.origin_map_id) { setMembers([]); setPendingMembers([]); return }
    const originId = map.origin_map_id
    // All maps in the sharing group
    const { data: groupMaps } = await supabase
      .from('maps')
      .select('id, user_id')
      .eq('origin_map_id', originId)
    if (!groupMaps) return
    const userIds = groupMaps.map(m => m.user_id).filter(Boolean) as string[]
    if (userIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', userIds)
      setMembers((profiles || []).map(p => ({
        user_id: p.user_id,
        display_name: p.display_name || 'Unknown',
        map_id: groupMaps.find(m => m.user_id === p.user_id)?.id || '',
      })))
    }
    // Pending invitations
    const { data: pending } = await supabase
      .from('maps_invitations')
      .select('email, invited_by, created_at')
      .eq('map_id', originId)
    setPendingMembers(pending || [])
  }, [map.origin_map_id])

  // Reset on map change
  useEffect(() => {
    setEditing(false)
    setConfirmDelete(false)
    setConfirmLeave(false)
    setSharing(false)
    setShareEmails([])
    setShareEmailInput('')
    setSearchQuery('')
    setSearchResults([])
    loadMapObjects(map.id)
    loadMembers()
  }, [map.id, loadMapObjects, loadMembers])

  // Refresh object list when maps:refresh fires (e.g., auto-add on object create)
  useEffect(() => {
    const handler = () => loadMapObjects(map.id)
    document.addEventListener('maps:refresh', handler)
    return () => document.removeEventListener('maps:refresh', handler)
  }, [map.id, loadMapObjects])

  const startShare = () => {
    setSharing(true)
    setShareEmails([])
    setShareEmailInput('')
  }

  const addShareEmail = () => {
    const email = shareEmailInput.trim().toLowerCase()
    if (!email || shareEmails.includes(email)) return
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return
    setShareEmails(prev => [...prev, email])
    setShareEmailInput('')
  }

  const handleShare = async () => {
    const pendingEmail = shareEmailInput.trim().toLowerCase()
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pendingEmail)
    const finalEmails = pendingEmail && isValidEmail && !shareEmails.includes(pendingEmail)
      ? [...shareEmails, pendingEmail]
      : shareEmails
    if (!user || finalEmails.length === 0) return

    const { error } = await supabase.rpc('share_map', {
      p_user_id: user.id,
      p_map_id: map.id,
      p_emails: finalEmails,
    })
    if (error) { console.error('Share error:', error); return }

    setSharing(false)
    onMapUpdated({ ...map, origin_map_id: map.id, is_admin: true, member_count: 1 })
    document.dispatchEvent(new CustomEvent('maps:refresh'))
    loadMembers()
  }

  const handleLeaveMap = async () => {
    if (!user) return
    const { error } = await supabase.rpc('leave_shared_map', {
      p_user_id: user.id,
      p_map_id: map.id,
    })
    if (error) { console.error('Failed to leave map:', error); return }
    setConfirmLeave(false)
    onMapUpdated({ ...map, origin_map_id: null, member_count: 0, is_admin: false })
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
    const { error } = await supabase.from('maps').delete().eq('id', map.id)
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
      <Tooltip text="Share map"><button className={styles.iconBtn} onClick={startShare}><Share2 size={14} /></button></Tooltip>
      <Tooltip text="Edit map"><button className={styles.iconBtn} onClick={startEdit}><Pencil size={14} /></button></Tooltip>
      {map.origin_map_id && !map.is_admin ? (
        <Tooltip text="Exit map sharing"><button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => setConfirmLeave(true)}><LogOut size={14} /></button></Tooltip>
      ) : (
        <Tooltip text="Delete map"><button className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={() => setConfirmDelete(true)}><Trash2 size={14} /></button></Tooltip>
      )}
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

      {/* Leave confirmation */}
      {confirmLeave && (
        <div className={styles.deleteConfirm}>
          <span className={styles.deleteConfirmText}>
            Stop sharing this map? You&rsquo;ll keep the map and its objects, but will stop receiving updates.
          </span>
          <div className={styles.deleteConfirmActions}>
            <button className={styles.formBtn} onClick={() => setConfirmLeave(false)}>Cancel</button>
            <button className={styles.deleteBtnConfirm} onClick={handleLeaveMap}>Stop Sharing</button>
          </div>
        </div>
      )}

      {/* Share form (for unshared maps) */}
      {sharing && (
        <div className={styles.deleteConfirm}>
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
              autoFocus
            />
          </div>
          <div className={styles.deleteConfirmActions}>
            <button className={styles.formBtn} onClick={() => setSharing(false)}>Cancel</button>
            <button
              className={`${styles.formBtn} ${styles.formBtnPrimary}`}
              onClick={handleShare}
              disabled={shareEmails.length === 0 && !shareEmailInput.trim()}
            >
              Share
            </button>
          </div>
        </div>
      )}

      {/* Members section (for shared maps) */}
      {map.origin_map_id && !sharing && !editing && (
        <div className={styles.section}>
          <span className={styles.sectionLabel}>Members ({members.length})</span>
          <div className={styles.objectList}>
            {members.map(m => (
              <div key={m.user_id} className={styles.objectItem}>
                <Users size={12} />
                <span className={styles.objectName}>
                  {m.display_name}
                  {m.user_id === user?.id && <span style={{ opacity: 0.5 }}> (you)</span>}
                </span>
              </div>
            ))}
            {pendingMembers.map(pm => (
              <div key={pm.email} className={styles.objectItem} style={{ opacity: 0.5 }}>
                <Mail size={12} />
                <span className={styles.objectName}>{pm.email}</span>
                <span className={styles.searchResultTitle}>pending</span>
              </div>
            ))}
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
  onEnterPlacement?: (cluster: PlacementCluster) => void
}

export default function MapsFrame({ onClose, activeMapId, onActivateMap, onHighlightObjects, onMapEditModeChange, onMapSelected, onEnterPlacement }: MapsFrameProps) {
  const { user } = useAuth()
  const [maps, setMaps] = useState<MapRow[]>([])
  const [pendingInvites, setPendingInvites] = useState<PendingInvite[]>([])
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
    const { data } = await supabase.rpc('get_user_maps', { p_user_id: user.id })
    if (!data) return
    setMaps(data.map((m: any) => ({
      ...m,
      object_count: Number(m.object_count),
      member_count: Number(m.member_count),
    })))
  }, [user])

  const loadPendingInvites = useCallback(async () => {
    if (!user?.email) return
    const { data } = await supabase.rpc('get_pending_invites', { p_email: user.email })
    setPendingInvites(data || [])
  }, [user?.email])

  useEffect(() => { loadMaps(); loadPendingInvites() }, [loadMaps, loadPendingInvites])

  // Listen for map creation + refresh events
  useEffect(() => {
    const handleCreated = (e: Event) => {
      const mapId = (e as CustomEvent).detail?.mapId
      loadMaps().then(() => {
        if (mapId) setSelectedMapId(mapId)
      })
    }
    const handleRefresh = () => { loadMaps(); loadPendingInvites() }
    document.addEventListener('maps:map-created', handleCreated)
    document.addEventListener('maps:refresh', handleRefresh)
    return () => {
      document.removeEventListener('maps:map-created', handleCreated)
      document.removeEventListener('maps:refresh', handleRefresh)
    }
  }, [loadMaps, loadPendingInvites])

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
    document.addEventListener('canvas:node-click', handleNodeClick)
    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
      document.removeEventListener('canvas:node-click', handleNodeClick)
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
      if (error) {
        console.error('Failed to remove object from map:', error)
        mapObjectIdsRef.current = currentIds
        setMapObjectIds(currentIds)
        setMaps(prev => prev.map(m => m.id === selectedMapId ? { ...m, object_count: m.object_count - countDelta } : m))
        setOpenedMap(prev => prev?.id === selectedMapId ? { ...prev, object_count: prev.object_count - countDelta } : prev)
      }
    } else {
      const { error } = await supabase.from('maps_objects').insert({ map_id: selectedMapId, object_ref_id: objectId })
      if (error) {
        console.error('Failed to add object to map:', error)
        mapObjectIdsRef.current = currentIds
        setMapObjectIds(currentIds)
        setMaps(prev => prev.map(m => m.id === selectedMapId ? { ...m, object_count: m.object_count - countDelta } : m))
        setOpenedMap(prev => prev?.id === selectedMapId ? { ...prev, object_count: prev.object_count - countDelta } : prev)
      }
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
      .select('id, name, description, auto_add, origin_map_id')
      .single()
    if (error) { console.error('Map create error:', error); return }
    if (data) {
      setCreating(false)
      setCreateName('')
      setCreateDesc('')
      await loadMaps()
      const newMap: MapRow = { ...data, object_count: 0, origin_map_id: null, member_count: 0, is_admin: false }
      computeDetailPosition()
      setOpenedMap(newMap)
      setSelectedMapId(newMap.id)
    }
  }

  const handleMapUpdated = (updated: MapRow) => {
    setOpenedMap(updated)
    setMaps(prev => prev.map(m => m.id === updated.id ? updated : m))
  }

  // Sync openedMap when maps list reloads
  useEffect(() => {
    if (openedMap) {
      const fresh = maps.find(m => m.id === openedMap.id)
      if (fresh && (fresh.origin_map_id !== openedMap.origin_map_id || fresh.member_count !== openedMap.member_count)) {
        setOpenedMap(prev => prev ? { ...prev, origin_map_id: fresh.origin_map_id, member_count: fresh.member_count, is_admin: fresh.is_admin } : prev)
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
        {/* Pending invitations */}
        {pendingInvites.length > 0 && (
          <div className={styles.section}>
            <span className={styles.sectionLabel}>Invitations</span>
            {pendingInvites.map(inv => (
              <div key={inv.id} className={styles.inviteItem}>
                <div className={styles.inviteInfo}>
                  <span className={styles.inviteName}>{inv.map_name}</span>
                  <span className={styles.inviteSender}>from {inv.sender_name}</span>
                </div>
                <div className={styles.inviteActions}>
                  <button className={`${styles.formBtn} ${styles.formBtnPrimary}`} onClick={async () => {
                    if (!user) return
                    const { data: result, error } = await supabase.rpc('accept_map_invitation', {
                      p_user_id: user.id,
                      p_invitation_id: inv.id,
                    })
                    if (error || !result || result.error) { console.error('Accept error:', error || result?.error); return }
                    if (result.items && result.items.length > 0 && onEnterPlacement) {
                      onEnterPlacement({
                        label: result.map_name || 'Shared Map',
                        items: result.items.map((item: any) => ({
                          objectId: item.objectId,
                          name: item.name,
                          class: item.class,
                          relativeX: item.relativeX,
                          relativeY: item.relativeY,
                        })),
                        connections: result.connections || [],
                        onConfirm: async (anchorX: number, anchorY: number) => {
                          await supabase.rpc('place_shared_objects', {
                            p_user_id: user.id,
                            p_origin_map_id: result.origin_map_id,
                            p_anchor_x: anchorX,
                            p_anchor_y: anchorY,
                            p_items: result.items,
                          })
                          document.dispatchEvent(new Event('sharing:refresh-canvas'))
                          loadMaps()
                          loadPendingInvites()
                        },
                        onCancel: async () => {
                          // Place at default (0,0) — user can reposition later
                          await supabase.rpc('place_shared_objects', {
                            p_user_id: user.id,
                            p_origin_map_id: result.origin_map_id,
                            p_anchor_x: 0,
                            p_anchor_y: 0,
                            p_items: result.items,
                          })
                          document.dispatchEvent(new Event('sharing:refresh-canvas'))
                          loadMaps()
                          loadPendingInvites()
                        },
                      })
                    } else {
                      document.dispatchEvent(new Event('sharing:refresh-canvas'))
                      loadMaps()
                      loadPendingInvites()
                    }
                  }}>Accept</button>
                  <button className={styles.formBtn} onClick={async () => {
                    await supabase.from('maps_invitations').delete().eq('id', inv.id)
                    loadPendingInvites()
                  }}>Decline</button>
                </div>
              </div>
            ))}
          </div>
        )}

        {maps.length > 0 ? (
          <div className={styles.mapsList} onClick={() => { if (!mapEditMode) setSelectedMapId(null) }}>
            {maps.map(m => (
              <button
                key={m.id}
                className={`${styles.mapItem} ${selectedMapId === m.id ? styles.mapItemSelected : ''} ${activeMapId === m.id ? styles.mapItemActive : ''}`}
                onClick={e => { e.stopPropagation(); handleMapClick(m) }}
                onDoubleClick={e => { e.stopPropagation(); handleMapDoubleClick(m) }}
                onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); handleMapDoubleClick(m) } }}
              >
                <MapIcon size={14} className={styles.mapIcon} />
                <div className={styles.mapInfo}>
                  <span className={styles.mapName}>{m.name}</span>
                  <span className={styles.mapCount}>
                    {m.object_count} {m.object_count === 1 ? 'object' : 'objects'}
                    {m.origin_map_id && (
                      <Tooltip text={`Shared \u2014 ${m.member_count} ${m.member_count === 1 ? 'member' : 'members'}`}>
                        <Users size={13} className={styles.sharedBadge} />
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
