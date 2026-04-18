import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { Pencil, Check, X, Phone, FileText, Clipboard, Calendar, CalendarCheck, Plus, ChevronDown, ChevronRight, Link, Trash2, Map as MapIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getEffectiveConnections, otherObjectId } from '../lib/connections'
import { useAuth } from '../contexts/AuthContext'
import { sizeIndexToScale } from '../constants/palettes'
import type { ObjectNodeData, ContactEntry } from './ObjectNode'
import type { NodeRect } from '../types'
import Tooltip from './Tooltip'
import SharePicker from './SharePicker'
import TagInput from './TagInput'
import ObjectSearch from './ObjectSearch'
import styles from './DetailPanel.module.css'

// Must match ObjectNode.module.css .card width/height and Canvas.tsx constants
const NODE_WIDTH = 180
const NODE_HEIGHT = 60

interface DetailPanelProps {
  nodeId: string
  object: ObjectNodeData
  onClose: () => void
  onObjectUpdated?: () => void
  peerObject?: ObjectNodeData
  preferredSide?: 'left' | 'right'
  onConnectToPeer?: () => void
}

type TabId = 'contact' | 'notes' | 'projects' | 'events'

const tabs: { id: TabId; Icon: typeof Phone; label: string }[] = [
  { id: 'contact', Icon: Phone, label: 'Contact' },
  { id: 'notes', Icon: FileText, label: 'Notes' },
  { id: 'projects', Icon: Clipboard, label: 'Projects' },
  { id: 'events', Icon: Calendar, label: 'Events' },
]

const classPlaceholders: Record<string, { name: string; title: string }> = {
  org: { name: 'Name', title: 'Description' },
  person:  { name: 'Name (First Last)', title: 'Title' },
  project: { name: 'Project Name', title: 'Description' },
  event:   { name: 'Event Name', title: 'Description' },
}

const typeTagPlaceholders: Record<string, string> = {
  org: 'Org Type(s)',
  person:  'Tags (eg jobs, roles, etc.)',
  project: 'e.g. feature, tv series, documentary...',
  event:   'e.g. meeting, call, pitch...',
}

const contactTypes = ['phone', 'email', 'url', 'address', 'social']

const emptyContact = (): ContactEntry => ({ type: 'phone', label: '', value: '' })

function todayDateString(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}


interface LinkedObject {
  id: string
  name: string
  class: string
  connectionType: string
}

interface ConnectedItem {
  id: string
  name: string
  title: string | null
  status: string | null
  event_date: string | null
  types: string[]
  linkedObjects?: LinkedObject[]
}

// --- Detail Panel ---

const headerClassStyles: Record<string, string> = {
  org: styles.headerOrg,
  person: styles.headerPerson,
}

const GAP = 12
const PANEL_WIDTH = 300

export default function DetailPanel({ nodeId, object, onClose, onObjectUpdated, peerObject, preferredSide, onConnectToPeer }: DetailPanelProps) {
  const { user } = useAuth()
  const { flowToScreenPosition } = useReactFlow()
  const viewport = useViewport()

  const nodePosition = useStore(
    useCallback(s => s.nodeLookup.get(nodeId)?.position ?? null, [nodeId]),
    (a, b) => a?.x === b?.x && a?.y === b?.y
  )

  const effectiveScale = sizeIndexToScale(object.data?.size)

  const nodeRect: NodeRect | null = useMemo(() => {
    if (!nodePosition) return null
    const topLeft = flowToScreenPosition(nodePosition)
    const bottomRight = flowToScreenPosition({
      x: nodePosition.x + NODE_WIDTH * effectiveScale,
      y: nodePosition.y + NODE_HEIGHT * effectiveScale,
    })
    return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y }
  }, [nodePosition, viewport, flowToScreenPosition, effectiveScale])

  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const placementKey = useRef<string | null>(null)
  const offsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })

  // Tabs
  const [activeTab, setActiveTab] = useState<TabId>('contact')

  // Header editing (name + title)
  const [headerEditing, setHeaderEditing] = useState(false)
  const [headerValues, setHeaderValues] = useState({ name: object.name || '', title: object.title || '' })

  // Types editing
  const [showTagInput, setShowTagInput] = useState(false)
  const [editTypes, setEditTypes] = useState<string[]>(object.types || [])

  // Contact tab editing
  const [contactEditing, setContactEditing] = useState(false)
  const [editContacts, setEditContacts] = useState<ContactEntry[]>(
    () => object.data?.contacts ?? []
  )
  const [openContactTypeIndex, setOpenContactTypeIndex] = useState<number | null>(null)

  // Notes tab — notes are objects (class='note') connected to this object
  const [connectedNotes, setConnectedNotes] = useState<ConnectedItem[]>([])
  const [creatingNote, setCreatingNote] = useState(false)
  const [newNoteText, setNewNoteText] = useState('')
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null)
  const [editNoteText, setEditNoteText] = useState('')

  // Shared intel via maps_shares table (contacts, projects, events, notes)
  interface SharedIntelRow { peer_user_id: string; peer_display_name: string; share_type: string; shared_object_id: string; object_class: string | null; name: string | null; title: string | null; status: string | null; event_date: string | null; contacts: any }
  const [sharedIntel, setSharedIntel] = useState<SharedIntelRow[]>([])

  // Connected items (projects/events)
  const [connectedProjects, setConnectedProjects] = useState<ConnectedItem[]>([])
  const [connectedEvents, setConnectedEvents] = useState<ConnectedItem[]>([])
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
  const [expandedIntelId, setExpandedIntelId] = useState<string | null>(null)
  const [editingItemId, setEditingItemId] = useState<string | null>(null)
  const [editItemValues, setEditItemValues] = useState({ name: '', title: '', status: '', event_date: '' })
  const [editItemTypes, setEditItemTypes] = useState<string[]>([])

  // Linked objects for expanded items
  const [linkedObjects, setLinkedObjects] = useState<LinkedObject[]>([])
  const [showLinkSearch, setShowLinkSearch] = useState(false)

  // Create form state
  const [creatingProject, setCreatingProject] = useState(false)
  const [creatingEvent, setCreatingEvent] = useState(false)
  const [newItemLinks, setNewItemLinks] = useState<{ id: string; name: string; class: string }[]>([])
  const [newItemValues, setNewItemValues] = useState({ name: '', title: '', status: '', event_date: '' })
  const [newItemTypes, setNewItemTypes] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [dateInputActive, setDateInputActive] = useState(false)
  function resetCreateForm() {
    setNewItemValues({ name: '', title: '', status: '', event_date: '' })
    setNewItemTypes([])
    setNewItemLinks([])
    setDateInputActive(false)
  }

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    connections: number
    orphanedProjects: number
    orphanedEvents: number
  } | null>(null)

  // Maps popover
  const [showMapsPopover, setShowMapsPopover] = useState(false)
  const [objectMaps, setObjectMaps] = useState<{ id: string; name: string }[]>([])
  const [allMaps, setAllMaps] = useState<{ id: string; name: string }[]>([])
  const [mapSearchQuery, setMapSearchQuery] = useState('')
  const mapsPopoverRef = useRef<HTMLDivElement>(null)
  const mapSearchInputRef = useRef<HTMLInputElement>(null)

  const loadObjectMaps = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('maps')
      .select('id, name, maps_objects!inner(object_ref_id)')
      .eq('user_id', user.id)
      .eq('maps_objects.object_ref_id', object.id)
      .order('name')
    setObjectMaps((data ?? []).map(m => ({ id: m.id, name: m.name })))
  }, [user, object.id])

  const loadAllMaps = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('maps')
      .select('id, name')
      .eq('user_id', user.id)
      .order('name')
    setAllMaps(data ?? [])
  }, [user])

  useEffect(() => {
    if (showMapsPopover) {
      loadObjectMaps()
      loadAllMaps()
      setTimeout(() => mapSearchInputRef.current?.focus(), 0)
    }
  }, [showMapsPopover, loadObjectMaps, loadAllMaps])

  // Close maps popover on outside click
  useEffect(() => {
    if (!showMapsPopover) return
    const handler = (e: MouseEvent) => {
      if (mapsPopoverRef.current && !mapsPopoverRef.current.contains(e.target as Node)) {
        setShowMapsPopover(false)
        setMapSearchQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [showMapsPopover])

  const toggleObjectMap = async (mapId: string) => {
    const isMember = objectMaps.some(m => m.id === mapId)
    if (isMember) {
      const { error } = await supabase.from('maps_objects').delete()
        .eq('map_id', mapId).eq('object_ref_id', object.id)
      if (error) { console.error('Failed to remove from map:', error); return }
      setObjectMaps(prev => prev.filter(m => m.id !== mapId))
    } else {
      const { error } = await supabase.from('maps_objects').insert({ map_id: mapId, object_ref_id: object.id })
      if (error) { console.error('Failed to add to map:', error); return }
      const map = allMaps.find(m => m.id === mapId)
      if (map) setObjectMaps(prev => [...prev, map].sort((a, b) => a.name.localeCompare(b.name)))
    }
    document.dispatchEvent(new Event('maps:refresh'))
  }

  const filteredMaps = mapSearchQuery.trim()
    ? allMaps.filter(m => m.name.toLowerCase().includes(mapSearchQuery.toLowerCase()))
    : allMaps

  // Check if a connection to the peer object already exists
  const [peerConnected, setPeerConnected] = useState(false)

  useEffect(() => {
    if (!peerObject || !user) { setPeerConnected(false); return }

    async function check() {
      const { count: canonCount } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .or(`and(object_a_id.eq.${object.id},object_b_id.eq.${peerObject!.id}),and(object_a_id.eq.${peerObject!.id},object_b_id.eq.${object.id})`)

      const { count: userCount } = await supabase
        .from('connections_overrides')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user!.id)
        .is('connection_id', null)
        .eq('deactivated', false)
        .or(`and(object_a_id.eq.${object.id},object_b_id.eq.${peerObject!.id}),and(object_a_id.eq.${peerObject!.id},object_b_id.eq.${object.id})`)

      setPeerConnected(((canonCount || 0) + (userCount || 0)) > 0)
    }
    check()
  }, [peerObject, object.id, user])

  const placeholders = classPlaceholders[object.class] || classPlaceholders.org

  // Load connected projects/events when tab activates
  const loadConnectedItems = useCallback(async (objectId: string, targetClass: 'project' | 'event' | 'note') => {
    if (!user) return

    const { data } = await supabase.rpc('get_connected_items', {
      p_user_id: user.id,
      p_object_id: objectId,
      p_class: targetClass,
    })

    const items: ConnectedItem[] = (data || []).map((o: any) => ({
      id: o.id,
      name: o.name || '(unnamed)',
      title: o.title,
      status: o.status,
      event_date: o.event_date,
      types: o.types || [],
    }))

    if (targetClass === 'project') setConnectedProjects(items)
    else if (targetClass === 'event') setConnectedEvents(items)
    else setConnectedNotes(items)
  }, [user])

  useEffect(() => {
    if (activeTab === 'projects') loadConnectedItems(object.id, 'project')
    if (activeTab === 'events') loadConnectedItems(object.id, 'event')
    if (activeTab === 'notes') loadConnectedItems(object.id, 'note')
  }, [activeTab, object.id, loadConnectedItems])

  // Load shared intel (contacts, projects, events) via RPC
  useEffect(() => {
    async function loadSharedIntel() {
      if (!user) return
      const { data } = await supabase.rpc('get_shared_intel', {
        p_user_id: user.id,
        p_object_id: object.id,
      })
      setSharedIntel((data || []) as SharedIntelRow[])
    }
    loadSharedIntel()
  }, [object.id, user])

  // Load all objects linked to a specific event/project (for expanded view)
  const loadLinkedObjects = useCallback(async (itemId: string) => {
    if (!user) return

    const conns = await getEffectiveConnections(itemId, user.id)
    const otherIds = new Set<string>()
    for (const c of conns) {
      const otherId = otherObjectId(c, itemId)
      if (otherId && otherId !== object.id) otherIds.add(otherId)
    }

    if (otherIds.size === 0) {
      setLinkedObjects([])
      return
    }

    const ids = Array.from(otherIds)
    const { data: objs } = await supabase
      .from('user_objects')
      .select('id, name, class')
      .eq('user_id', user.id)
      .in('id', ids)

    // Fallback for objects not in user_objects
    const foundIds = new Set((objs || []).map(o => o.id))
    const missingIds = ids.filter(id => !foundIds.has(id))
    let fallback: { id: string; name: string; class: string }[] = []
    if (missingIds.length > 0) {
      const { data } = await supabase
        .from('objects')
        .select('id, name, class')
        .eq('is_active', true)
        .in('id', missingIds)
      fallback = (data || []).map(o => ({ id: o.id, name: o.name || '(unnamed)', class: o.class }))
    }

    setLinkedObjects([
      ...(objs || []).map(o => ({ id: o.id, name: o.name || '(unnamed)', class: o.class, connectionType: '' })),
      ...fallback.map(o => ({ ...o, connectionType: '' })),
    ])
  }, [user, object.id])

  // When an item is expanded, load its linked objects
  useEffect(() => {
    if (expandedItemId) {
      loadLinkedObjects(expandedItemId)
      setShowLinkSearch(false)
    } else {
      setLinkedObjects([])
    }
  }, [expandedItemId, loadLinkedObjects])

  // Link an existing object to an event/project
  async function linkObjectToItem(itemId: string, targetObj: { id: string; name: string; class: string }, _itemClass: 'project' | 'event') {
    if (!user) return

    const { error } = await supabase.from('connections_overrides').insert({
      user_id: user.id,
      object_a_id: targetObj.id,
      object_b_id: itemId,
    })
    if (error) { console.error('Failed to link object:', error); return }

    loadLinkedObjects(itemId)
    onObjectUpdated?.()
  }

  // Link existing project to current node (feature A: name matching picked an existing project)
  async function linkExistingItem(existingId: string, targetClass: 'project' | 'event') {
    if (!user) return
    setSaving(true)

    const { error } = await supabase.rpc('link_existing_item', {
      p_user_id: user.id,
      p_parent_id: object.id,
      p_item_id: existingId,
    })
    if (error) { console.error('Failed to link item:', error); setSaving(false); return }

    setSaving(false)
    if (targetClass === 'project') {
      setCreatingProject(false)
      loadConnectedItems(object.id, 'project')
    } else {
      setCreatingEvent(false)
      loadConnectedItems(object.id, 'event')
    }
    onObjectUpdated?.()
  }

  // Reset all state when object changes
  useEffect(() => {
    setHeaderEditing(false)
    setShowTagInput(false)
    setContactEditing(false)
    setCreatingNote(false)
    setNewNoteText('')
    setEditingNoteId(null)
    setEditNoteText('')
    setCreatingProject(false)
    setCreatingEvent(false)
    setExpandedItemId(null)
    setEditingItemId(null)
    setLinkedObjects([])
    setShowLinkSearch(false)
    resetCreateForm()
    setHeaderValues({ name: object.name || '', title: object.title || '' })
    setEditTypes(object.types || [])
    setEditContacts(object.data?.contacts ?? [])
  }, [object.id])

  // Position panel: smart-anchor on initial placement (or preferredSide change for
  // multi-select handoff), then lock a fixed offset from the node and follow it
  // verbatim on drag/pan/zoom. Off-screen is fine — panel stays glued to the pill.
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el || !nodeRect) return

    const key = `${object.id}|${preferredSide ?? 'auto'}`

    if (placementKey.current !== key) {
      const vw = window.innerWidth
      const vh = window.innerHeight
      const nodeCenterY = (nodeRect.top + nodeRect.bottom) / 2
      const h = el.scrollHeight

      let left: number
      if (preferredSide === 'left') {
        left = nodeRect.left - PANEL_WIDTH - GAP
      } else if (preferredSide === 'right') {
        left = nodeRect.right + GAP
      } else {
        left = (vw - nodeRect.right) >= nodeRect.left
          ? nodeRect.right + GAP
          : nodeRect.left - PANEL_WIDTH - GAP
      }
      left = Math.max(GAP, Math.min(left, vw - PANEL_WIDTH - GAP))

      const anchorRatio = Math.max(0, Math.min(1, nodeCenterY / vh))
      let top = nodeCenterY - (h * anchorRatio)
      top = Math.max(GAP, Math.min(top, vh - h - GAP))

      offsetRef.current = { dx: left - nodeRect.left, dy: top - nodeRect.top }
      placementKey.current = key
      setPos({ left, top })
    } else {
      const { dx, dy } = offsetRef.current
      setPos({ left: nodeRect.left + dx, top: nodeRect.top + dy })
    }
  }, [nodeRect, object.id, preferredSide])

  // --- Save functions ---

  async function saveHeader() {
    if (!user) return
    const { error } = await supabase
      .from('objects_overrides')
      .update({
        name: headerValues.name.trim() || null,
        title: headerValues.title.trim() || null,
      })
      .eq('object_id', object.id)
      .eq('user_id', user.id)
    if (error) { console.error('Failed to save header:', error); return }
    if (showTagInput) await saveTypes()
    setHeaderEditing(false)
    setShowTagInput(false)
    onObjectUpdated?.()
  }

  async function saveTypes() {
    if (!user) return
    await supabase.rpc('set_object_types', {
      p_user_id: user.id,
      p_object_id: object.id,
      p_class: object.class,
      p_type_names: editTypes,
    })
    setShowTagInput(false)
    onObjectUpdated?.()
  }

  async function saveContact() {
    if (!user) return
    const cleaned = editContacts.filter(c => c.value.trim())
    const existingData = object.data || {}
    const data = { ...existingData, contacts: cleaned.length > 0 ? cleaned : undefined }
    const { error } = await supabase
      .from('objects_overrides')
      .update({ data: Object.keys(data).length > 0 ? data : null })
      .eq('object_id', object.id)
      .eq('user_id', user.id)
    if (error) { console.error('Failed to save contacts:', error); return }
    setContactEditing(false)
    onObjectUpdated?.()
  }

  function intelContactFingerprint(userId: string, c: ContactEntry) {
    return `${userId}:${c.type}:${c.value}`
  }

  async function adoptIntelContact(sourceUserId: string, contact: ContactEntry) {
    if (!user) return
    const existingData = object.data || {}
    const contacts: ContactEntry[] = [...(existingData.contacts ?? []), { ...contact }]
    const adopted: string[] = [...((existingData as any).adopted_intel ?? []), intelContactFingerprint(sourceUserId, contact)]
    const data = { ...existingData, contacts, adopted_intel: adopted }
    const { error } = await supabase
      .from('objects_overrides')
      .update({ data })
      .eq('object_id', object.id)
      .eq('user_id', user.id)
    if (error) { console.error('Failed to adopt contact:', error); return }
    onObjectUpdated?.()
  }

  async function createNote() {
    if (!user || !newNoteText.trim()) return
    setSaving(true)

    const { error } = await supabase.rpc('create_note', {
      p_user_id: user.id,
      p_parent_id: object.id,
      p_text: newNoteText.trim(),
    })
    if (error) { console.error('Failed to create note:', error); setSaving(false); return }

    setSaving(false)
    setCreatingNote(false)
    setNewNoteText('')
    loadConnectedItems(object.id, 'note')
  }

  async function saveEditNote(noteId: string) {
    if (!user || !editNoteText.trim()) return
    setSaving(true)

    const { error } = await supabase
      .from('objects_overrides')
      .update({ name: editNoteText.trim() })
      .eq('object_id', noteId)
      .eq('user_id', user.id)
    if (error) { console.error('Failed to save note:', error); setSaving(false); return }

    setSaving(false)
    setEditingNoteId(null)
    setEditNoteText('')
    loadConnectedItems(object.id, 'note')
  }

  async function deleteNote(noteId: string) {
    if (!user) return

    const { error } = await supabase.rpc('delete_connected_item', {
      p_user_id: user.id,
      p_parent_id: object.id,
      p_item_id: noteId,
    })
    if (error) console.error('Failed to delete note:', error)

    loadConnectedItems(object.id, 'note')
  }

  // ===== DELETE =====

  async function initiateDelete() {
    if (!user) return

    const { data } = await supabase.rpc('preflight_delete_object', {
      p_user_id: user.id,
      p_object_id: object.id,
    })

    if (data) {
      setDeleteConfirm({
        connections: data.connections ?? 0,
        orphanedProjects: data.orphanedProjects ?? 0,
        orphanedEvents: data.orphanedEvents ?? 0,
      })
    } else {
      setDeleteConfirm({ connections: 0, orphanedProjects: 0, orphanedEvents: 0 })
    }
  }

  async function executeDelete() {
    if (!user) return

    const { error } = await supabase.rpc('delete_object_with_cleanup', {
      p_user_id: user.id,
      p_object_id: object.id,
    })
    if (error) { console.error('Delete error:', error); return }

    setDeleteConfirm(null)
    onClose()
    onObjectUpdated?.()
    document.dispatchEvent(new Event('maps:refresh'))
  }

  async function createConnectedItem(targetClass: 'project' | 'event') {
    if (!user || !newItemValues.name.trim()) return
    setSaving(true)

    const { error } = await supabase.rpc('create_connected_item', {
      p_user_id: user.id,
      p_parent_id: object.id,
      p_class: targetClass,
      p_name: newItemValues.name.trim(),
      p_title: newItemValues.title.trim() || null,
      p_status: newItemValues.status.trim() || null,
      p_event_date: targetClass === 'event' && newItemValues.event_date ? newItemValues.event_date : null,
      p_types: newItemTypes,
      p_link_ids: newItemLinks.map(l => l.id),
    })
    if (error) { console.error('Failed to create item:', error); setSaving(false); return }

    // Reset and reload
    setSaving(false)
    resetCreateForm()
    if (targetClass === 'project') {
      setCreatingProject(false)
      loadConnectedItems(object.id, 'project')
    } else {
      setCreatingEvent(false)
      loadConnectedItems(object.id, 'event')
    }
    onObjectUpdated?.()
  }

  async function saveEditItem(itemId: string, targetClass: 'project' | 'event') {
    if (!user) return
    setSaving(true)

    const { error } = await supabase.rpc('save_item_with_types', {
      p_user_id: user.id,
      p_object_id: itemId,
      p_class: targetClass,
      p_name: editItemValues.name.trim() || null,
      p_title: editItemValues.title.trim() || null,
      p_status: editItemValues.status.trim() || null,
      p_event_date: targetClass === 'event' && editItemValues.event_date ? editItemValues.event_date : null,
      p_types: editItemTypes,
    })
    if (error) { console.error('Failed to save item:', error); setSaving(false); return }

    setSaving(false)
    setEditingItemId(null)
    loadConnectedItems(object.id, targetClass)
    onObjectUpdated?.()
  }

  async function deleteConnectedItem(itemId: string, targetClass: 'project' | 'event') {
    if (!user) return

    const { error } = await supabase.rpc('delete_connected_item', {
      p_user_id: user.id,
      p_parent_id: object.id,
      p_item_id: itemId,
    })
    if (error) console.error('Failed to delete item:', error)

    setExpandedItemId(null)
    setEditingItemId(null)
    loadConnectedItems(object.id, targetClass)
    onObjectUpdated?.()
  }

  function formatDate(dateStr: string | null): string {
    if (!dateStr) return ''
    const d = new Date(dateStr + 'T00:00:00')
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  }

  // Focus panel on mount and when object changes
  useEffect(() => {
    panelRef.current?.focus()
  }, [object.id])

  // Keyboard: Escape to close, Enter to toggle edit mode, Tab focus trap
  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return

    function handleKeyDown(e: KeyboardEvent) {
      const anyEditing = headerEditing || showTagInput || contactEditing || creatingNote || editingNoteId || creatingProject || creatingEvent || editingItemId || showLinkSearch

      if (e.key === 'Escape') {
        if (anyEditing) return
        onClose()
        return
      }

      if (e.key === 'Enter') {
        const active = document.activeElement
        const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
        const onButton = active && active.tagName === 'BUTTON'
        if (inInput || onButton) return

        // If delete confirmation is showing, Enter confirms the delete
        if (deleteConfirm) {
          e.preventDefault()
          executeDelete()
          return
        }

        if (headerEditing) {
          e.preventDefault()
          saveHeader()
        } else if (!anyEditing) {
          e.preventDefault()
          setHeaderEditing(true)
        }
        return
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (anyEditing) return
        const active = document.activeElement
        if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return
        e.preventDefault()
        initiateDelete()
        return
      }

      // Focus trap: Tab cycles within the panel
      if (e.key === 'Tab') {
        e.preventDefault()
        const all = panel!.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        const focusable = Array.from(all).filter(
          node => node.offsetParent !== null && !node.closest('[hidden]')
        )
        if (focusable.length === 0) return
        const active = document.activeElement
        const idx = focusable.indexOf(active as HTMLElement)
        if (e.shiftKey) {
          focusable[idx <= 0 ? focusable.length - 1 : idx - 1].focus()
        } else {
          focusable[idx < 0 || idx >= focusable.length - 1 ? 0 : idx + 1].focus()
        }
      }
    }
    panel.addEventListener('keydown', handleKeyDown)
    return () => panel.removeEventListener('keydown', handleKeyDown)
  }, [headerEditing, showTagInput, contactEditing, creatingNote, editingNoteId, creatingProject, creatingEvent, editingItemId, showLinkSearch, onClose, deleteConfirm])

  // Off-screen detection
  const nodeOffScreen = !nodeRect ||
    nodeRect.bottom < 0 || nodeRect.top > window.innerHeight ||
    nodeRect.right < 0 || nodeRect.left > window.innerWidth

  // --- Create form (reused for projects and events) ---
  // IDs already connected to this node (to exclude from search)
  const connectedIds = useMemo(() => {
    const ids = [object.id]
    for (const p of connectedProjects) ids.push(p.id)
    for (const e of connectedEvents) ids.push(e.id)
    return ids
  }, [object.id, connectedProjects, connectedEvents])

  function renderCreateForm(targetClass: 'project' | 'event') {
    return (
      <div className={styles.createForm}>
        {targetClass === 'event' && (
          <TagInput
            tags={newItemTypes}
            onChange={setNewItemTypes}
            objectClass="event"
            placeholder="Event Type(s)"
            userId={user!.id}
            onCancel={() => { setCreatingEvent(false); resetCreateForm() }}
          />
        )}

        {/* Project name: search existing or type new */}
        {targetClass === 'project' ? (
          <ObjectSearch
            userId={user!.id}
            targetClass="project"
            excludeIds={connectedIds}
            placeholder="Project name (search existing or type new)"
            autoFocus
            onSelect={proj => linkExistingItem(proj.id, 'project')}
            onCreateNew={name => setNewItemValues(prev => ({ ...prev, name }))}
            onChange={value => setNewItemValues(prev => ({ ...prev, name: value }))}
            onCancel={() => { setCreatingProject(false); resetCreateForm() }}
          />
        ) : (
          <textarea
            className={styles.createInput}
            value={newItemValues.name}
            onChange={e => setNewItemValues(prev => ({ ...prev, name: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                setCreatingEvent(false)
                resetCreateForm()
              }
            }}
            placeholder="Event name"
            autoComplete="off"
            autoFocus
            rows={1}
          />
        )}

        {targetClass === 'project' && (
          <TagInput
            tags={newItemTypes}
            onChange={setNewItemTypes}
            objectClass="project"
            placeholder="Formats & Genres"
            userId={user!.id}
            autoFocus={false}
          />
        )}
        <textarea
          className={styles.createInput}
          value={newItemValues.title}
          onChange={e => setNewItemValues(prev => ({ ...prev, title: e.target.value }))}
          placeholder="Description"
          autoComplete="off"
          rows={1}
        />
        {targetClass === 'event' && (
          <>
            {dateInputActive || newItemValues.event_date ? (
              <div className={styles.dateRow}>
                <input
                  className={styles.createInput}
                  type="date"
                  value={newItemValues.event_date}
                  onChange={e => setNewItemValues(prev => ({ ...prev, event_date: e.target.value }))}
                  autoFocus={dateInputActive && !newItemValues.event_date}
                />
                <Tooltip text="Set to today">
                  <button
                    className={styles.todayBtn}
                    onClick={() => setNewItemValues(prev => ({ ...prev, event_date: todayDateString() }))}
                    type="button"
                  >
                    <CalendarCheck size={14} />
                  </button>
                </Tooltip>
              </div>
            ) : (
              <input
                className={styles.createInput}
                readOnly
                placeholder="Event Date"
                onFocus={() => setDateInputActive(true)}
              />
            )}
          </>
        )}
        {targetClass === 'project' && (
          <textarea
            className={styles.createInput}
            value={newItemValues.status}
            onChange={e => setNewItemValues(prev => ({ ...prev, status: e.target.value }))}
            placeholder="Status"
            autoComplete="off"
            rows={1}
          />
        )}

        {/* Link additional objects during creation */}
        {newItemLinks.length > 0 && (
          <div className={styles.linkedList}>
            <span className={styles.label}>Also linked to</span>
            {newItemLinks.map(link => (
              <div key={link.id} className={styles.linkedItem}>
                <span className={styles.linkedName}>{link.name}</span>
                <span className={styles.canonBadge}>{link.class}</span>
                <button
                  className={styles.iconButtonSm}
                  onClick={() => setNewItemLinks(prev => prev.filter(l => l.id !== link.id))}
                >
                  <X size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
        <ObjectSearch
          userId={user!.id}
          excludeIds={[...connectedIds, ...newItemLinks.map(l => l.id)]}
          placeholder="Link to another person, org, or project..."
          onSelect={obj => setNewItemLinks(prev => [...prev, obj])}
          autoFocus={false}
        />

        <div className={styles.createFormActions}>
          <button
            className={styles.formBtn}
            onClick={() => {
              if (targetClass === 'project') setCreatingProject(false)
              else setCreatingEvent(false)
              resetCreateForm()
            }}
          >
            Cancel
          </button>
          <button
            className={`${styles.formBtn} ${styles.formBtnPrimary}`}
            onClick={() => createConnectedItem(targetClass)}
            disabled={saving || !newItemValues.name.trim()}
          >
            {saving ? 'Saving...' : 'Save'}
          </button>
        </div>
      </div>
    )
  }

  // --- Item list (reused for projects and events) ---
  function renderItemList(items: ConnectedItem[], targetClass: 'project' | 'event') {
    if (items.length === 0) {
      return <span className={styles.emptyState}>No {targetClass}s yet</span>
    }

    return (
      <div className={styles.itemList}>
        {items.map(item => {
          const isExpanded = expandedItemId === item.id
          const isEditing = editingItemId === item.id
          return (
            <div key={item.id} className={styles.item}>
              <button
                className={`${styles.itemHeader} ${isExpanded ? styles.itemHeaderExpanded : ''}`}
                onClick={() => {
                  if (isEditing) return
                  setExpandedItemId(isExpanded ? null : item.id)
                  setEditingItemId(null)
                }}
              >
                <div className={styles.itemHeaderLeft}>
                  {isExpanded
                    ? <ChevronDown size={12} className={styles.itemChevron} />
                    : <ChevronRight size={12} className={styles.itemChevron} />
                  }
                  <span className={styles.itemName}>{item.name}</span>
                </div>
                {targetClass === 'event' && item.event_date && (
                  <span className={styles.itemDate}>{formatDate(item.event_date)}</span>
                )}
                {targetClass === 'project' && item.status && (
                  <span className={styles.itemStatus}>{item.status}</span>
                )}
              </button>
              {isExpanded && !isEditing && (
                <div className={styles.itemBody}>
                  {item.types.length > 0 && (
                    <div className={styles.itemTypes}>
                      {item.types.map(t => (
                        <span key={t} className={styles.type}>{t.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  )}
                  {item.title && <p className={styles.itemDescription}>{item.title}</p>}
                  {targetClass === 'event' && item.event_date && (
                    <div className={styles.itemMeta}>{formatDate(item.event_date)}</div>
                  )}
                  {/* Feature D: Show all linked objects */}
                  {linkedObjects.length > 0 && (
                    <div className={styles.linkedList}>
                      <span className={styles.label}>Also linked to</span>
                      {linkedObjects.map(lo => (
                        <div key={lo.id} className={styles.linkedItem}>
                          <span className={styles.linkedName}>{lo.name}</span>
                          <span className={styles.canonBadge}>{lo.class}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Feature C: Link search in expanded view */}
                  {showLinkSearch ? (
                    <ObjectSearch
                      userId={user!.id}
                      excludeIds={[object.id, item.id, ...linkedObjects.map(lo => lo.id)]}
                      placeholder="Link to person, org, or project..."
                      onSelect={obj => linkObjectToItem(item.id, obj, targetClass)}
                      autoFocus
                    />
                  ) : null}

                  <div className={styles.itemActions}>
                    <Tooltip text="Edit">
                      <button
                        className={styles.iconButtonSm}
                        onClick={() => {
                          setEditingItemId(item.id)
                          setEditItemValues({
                            name: item.name || '',
                            title: item.title || '',
                            status: item.status || '',
                            event_date: item.event_date || '',
                          })
                          setEditItemTypes(item.types || [])
                        }}
                      >
                        <Pencil size={11} />
                      </button>
                    </Tooltip>
                    <Tooltip text="Link to another person or org">
                      <button
                        className={styles.iconButtonSm}
                        onClick={() => setShowLinkSearch(!showLinkSearch)}
                      >
                        <Link size={11} />
                      </button>
                    </Tooltip>
                    <SharePicker objectId={item.id} shareType={targetClass} />
                    <Tooltip text="Delete">
                      <button
                        className={styles.iconButtonSmDanger}
                        onClick={() => deleteConnectedItem(item.id, targetClass)}
                      >
                        <Trash2 size={11} />
                      </button>
                    </Tooltip>
                  </div>
                </div>
              )}
              {isEditing && (
                <div className={styles.itemEditBody}>
                  <textarea
                    className={styles.createInput}
                    value={editItemValues.name}
                    onChange={e => setEditItemValues(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Name"
                    autoComplete="off"
                    rows={1}
                    autoFocus
                  />
                  <TagInput
                    tags={editItemTypes}
                    onChange={setEditItemTypes}
                    objectClass={targetClass}
                    placeholder={targetClass === 'project' ? 'Formats & Genres' : 'Event Type(s)'}
                    userId={user!.id}
                    autoFocus={false}
                  />
                  <textarea
                    className={styles.createInput}
                    value={editItemValues.title}
                    onChange={e => setEditItemValues(prev => ({ ...prev, title: e.target.value }))}
                    placeholder="Description"
                    autoComplete="off"
                    rows={1}
                  />
                  {targetClass === 'event' && (
                    <div className={styles.dateRow}>
                      <input
                        className={styles.createInput}
                        type="date"
                        value={editItemValues.event_date}
                        onChange={e => setEditItemValues(prev => ({ ...prev, event_date: e.target.value }))}
                      />
                      <Tooltip text="Set to today">
                        <button
                          className={styles.todayBtn}
                          onClick={() => setEditItemValues(prev => ({ ...prev, event_date: todayDateString() }))}
                          type="button"
                        >
                          <CalendarCheck size={14} />
                        </button>
                      </Tooltip>
                    </div>
                  )}
                  {targetClass === 'project' && (
                    <textarea
                      className={styles.createInput}
                      value={editItemValues.status}
                      onChange={e => setEditItemValues(prev => ({ ...prev, status: e.target.value }))}
                      placeholder="Status"
                      autoComplete="off"
                      rows={1}
                    />
                  )}
                  <div className={styles.createFormActions}>
                    <button
                      className={styles.formBtn}
                      onClick={() => setEditingItemId(null)}
                    >
                      Cancel
                    </button>
                    <button
                      className={`${styles.formBtn} ${styles.formBtnPrimary}`}
                      onClick={() => saveEditItem(item.id, targetClass)}
                      disabled={saving || !editItemValues.name.trim()}
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </div>
    )
  }

  return (
    <div ref={panelRef} tabIndex={-1} className={styles.panel} style={{ left: pos.left, top: pos.top, width: PANEL_WIDTH, visibility: nodeOffScreen ? 'hidden' : 'visible', outline: 'none' } as CSSProperties}>
      {/* ===== HEADER ===== */}
      <div className={`${styles.header} ${headerClassStyles[object.class] || ''}`}>
        {object.photo_url && (
          <img className={styles.photo} src={object.photo_url} alt="" />
        )}
        <div className={styles.identity}>
          {headerEditing ? (
            <>
              <input
                className={styles.nameInput}
                value={headerValues.name}
                onChange={e => setHeaderValues(v => ({ ...v, name: e.target.value }))}
                placeholder={placeholders.name}
                autoComplete="off"
                autoFocus
              />
              <input
                className={styles.titleInput}
                value={headerValues.title}
                onChange={e => setHeaderValues(v => ({ ...v, title: e.target.value }))}
                placeholder={placeholders.title}
                autoComplete="off"
              />
            </>
          ) : (
            <>
              <h2 className={styles.name}>{object.name}</h2>
              {object.title && <span className={styles.title}>{object.title}</span>}
            </>
          )}
          <div className={styles.typesRow}>
            <div className={styles.types}>
              {(showTagInput ? editTypes : object.types).map(t => (
                <span key={t} className={styles.type}>
                  {t.replace(/_/g, ' ')}
                  {showTagInput && (
                    <button className={styles.tagRemoveInline} onClick={() => setEditTypes(prev => prev.filter(x => x !== t))} type="button">
                      <X size={8} />
                    </button>
                  )}
                </span>
              ))}
            </div>
            {headerEditing && !showTagInput && (
              <Tooltip text="Edit types">
                <button className={styles.iconButtonSm} onClick={() => { setEditTypes(object.types || []); setShowTagInput(true) }}>
                  <Plus size={12} />
                </button>
              </Tooltip>
            )}
          </div>
          {showTagInput && (
            <TagInput
              tags={editTypes}
              onChange={setEditTypes}
              objectClass={object.class}
              placeholder={typeTagPlaceholders[object.class] || 'Add types...'}
              userId={user!.id}
            />
          )}
        </div>
        <div className={styles.headerActions}>
          {headerEditing ? (
            <>
              <Tooltip text="Save">
                <button className={styles.iconButton} onClick={saveHeader}>
                  <Check size={14} />
                </button>
              </Tooltip>
              <Tooltip text="Cancel">
                <button className={styles.iconButton} onClick={() => { setHeaderValues({ name: object.name || '', title: object.title || '' }); setHeaderEditing(false); setShowTagInput(false) }}>
                  <X size={14} />
                </button>
              </Tooltip>
            </>
          ) : (
            <>
              <Tooltip text="Edit name, title, and types">
                <button className={styles.iconButton} onClick={() => setHeaderEditing(true)}>
                  <Pencil size={12} />
                </button>
              </Tooltip>
              <div style={{ position: 'relative' }}>
                <Tooltip text="Maps">
                  <button className={styles.iconButton} onClick={() => setShowMapsPopover(prev => !prev)}>
                    <MapIcon size={12} />
                  </button>
                </Tooltip>
                {showMapsPopover && (
                  <div ref={mapsPopoverRef} className={styles.mapsPopover}>
                    <input
                      ref={mapSearchInputRef}
                      className={styles.mapsSearch}
                      type="text"
                      placeholder="Search maps..."
                      value={mapSearchQuery}
                      onChange={e => setMapSearchQuery(e.target.value)}
                      autoComplete="off"
                    />
                    <div className={styles.mapsList}>
                      {filteredMaps.length === 0 && (
                        <div className={styles.mapsEmpty}>No maps found</div>
                      )}
                      {filteredMaps.map(m => (
                        <button
                          key={m.id}
                          className={styles.mapsItem}
                          onClick={() => toggleObjectMap(m.id)}
                        >
                          <span className={styles.mapsCheck}>{objectMaps.some(om => om.id === m.id) ? '✓' : ''}</span>
                          <span className={styles.mapsName}>{m.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <Tooltip text="Remove from Landscape">
                <button className={styles.iconButton} onClick={initiateDelete}>
                  <Trash2 size={12} />
                </button>
              </Tooltip>
              <Tooltip text="Close">
                <button className={styles.iconButton} onClick={onClose}>
                  <X size={14} />
                </button>
              </Tooltip>
            </>
          )}
        </div>
      </div>

      {/* ===== TAB BAR ===== */}
      <div className={styles.tabBar}>
        {tabs.map(tab => (
          <Tooltip key={tab.id} text={tab.label} disabled={activeTab === tab.id}>
            <button
              className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabActive : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              <tab.Icon size={16} />
              <span className={styles.tabLabel}>{tab.label}</span>
            </button>
          </Tooltip>
        ))}
      </div>

      {/* ===== TAB CONTENT ===== */}
      <div className={styles.tabContent}>
        {/* CONTACT TAB */}
        {activeTab === 'contact' && (
          <div className={styles.tabSection}>
            {contactEditing ? (
              <div className={styles.editFields}>
                {editContacts.map((c, i) => (
                  <div key={i} className={styles.contactRow}>
                    <div className={styles.contactTypeWrapper}>
                      <button
                        className={styles.contactType}
                        onClick={() => setOpenContactTypeIndex(openContactTypeIndex === i ? null : i)}
                      >
                        {c.type} <ChevronDown size={10} />
                      </button>
                      {openContactTypeIndex === i && (
                        <div className={styles.contactTypeDropdown}>
                          {contactTypes.map(t => (
                            <button
                              key={t}
                              className={`${styles.contactTypeOption} ${t === c.type ? styles.contactTypeOptionActive : ''}`}
                              onClick={() => {
                                setEditContacts(prev => prev.map((x, j) => j === i ? { ...x, type: t } : x))
                                setOpenContactTypeIndex(null)
                              }}
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      className={styles.contactLabel}
                      value={c.label}
                      onChange={e => setEditContacts(prev => prev.map((x, j) => j === i ? { ...x, label: e.target.value } : x))}
                      placeholder="Label"
                      autoComplete="off"
                    />
                    {c.type === 'address' ? (
                      <textarea
                        className={styles.contactValue}
                        value={c.value}
                        onChange={e => setEditContacts(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                        placeholder="Value"
                        rows={2}
                      />
                    ) : (
                      <input
                        className={styles.contactValue}
                        value={c.value}
                        onChange={e => setEditContacts(prev => prev.map((x, j) => j === i ? { ...x, value: e.target.value } : x))}
                        placeholder="Value"
                        autoComplete="off"
                      />
                    )}
                    <Tooltip text="Remove">
                      <button
                        className={styles.iconButtonSmDanger}
                        onClick={() => setEditContacts(prev => prev.filter((_, j) => j !== i))}
                      >
                        <Trash2 size={10} />
                      </button>
                    </Tooltip>
                  </div>
                ))}
                <button
                  className={styles.addButton}
                  onClick={() => setEditContacts(prev => [...prev, emptyContact()])}
                >
                  <Plus size={12} /> Add another
                </button>
                <div className={styles.createFormActions}>
                  <button className={styles.formBtn} onClick={() => {
                    setEditContacts(object.data?.contacts ?? [])
                    setOpenContactTypeIndex(null)
                    setContactEditing(false)
                  }}>
                    Cancel
                  </button>
                  <button
                    className={`${styles.formBtn} ${styles.formBtnPrimary}`}
                    onClick={saveContact}
                    disabled={editContacts.length === 0 || editContacts.every(c => !c.value.trim())}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className={styles.readFields}>
                  {(object.data?.contacts ?? []).map((c, i) => (
                    <div key={i} className={styles.field}>
                      <span className={styles.label}>{c.label || c.type}</span>
                      <span className={styles.value}>{c.value}</span>
                    </div>
                  ))}
                  {/* Shared contacts via maps_shares table */}
                  {(() => {
                    const contactIntel = sharedIntel.filter(r => r.share_type === 'contacts' && r.contacts?.length > 0)
                    if (contactIntel.length === 0) return null
                    const adopted = new Set<string>(((object.data as any)?.adopted_intel ?? []) as string[])
                    const byPeer = new Map<string, { display_name: string; contacts: ContactEntry[] }>()
                    for (const r of contactIntel) {
                      if (!byPeer.has(r.peer_user_id)) byPeer.set(r.peer_user_id, { display_name: r.peer_display_name, contacts: [] })
                      for (const c of r.contacts as ContactEntry[]) {
                        if (!adopted.has(intelContactFingerprint(r.peer_user_id, c))) {
                          byPeer.get(r.peer_user_id)!.contacts.push(c)
                        }
                      }
                    }
                    const entries = Array.from(byPeer.entries()).filter(([, v]) => v.contacts.length > 0)
                    if (entries.length === 0) return null
                    return (
                      <div className={styles.sharedIntelSection}>
                        <span className={styles.sharedIntelLabel}>Shared Intel</span>
                        {entries.map(([uid, { display_name, contacts }]) => (
                          <div key={uid} className={styles.sharedIntelEntry}>
                            <span className={styles.sharedIntelAuthor}>From {display_name}:</span>
                            {contacts.map((c, i) => (
                              <div key={i} className={styles.intelContactRow}>
                                <div className={styles.field} style={{ flex: 1 }}>
                                  <span className={styles.label}>{c.label || c.type}</span>
                                  <span className={styles.value}>{c.value}</span>
                                </div>
                                <Tooltip text="Add to my intel">
                                  <button
                                    className={styles.intelAdoptBtn}
                                    onClick={() => adoptIntelContact(uid, c)}
                                  >
                                    <Plus size={11} />
                                  </button>
                                </Tooltip>
                              </div>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
                <div className={styles.addNewRowBar}>
                  <button className={styles.addNewRow} onClick={() => {
                    setEditContacts([...(object.data?.contacts ?? []), emptyContact()])
                    setContactEditing(true)
                  }}>
                    <Plus size={12} /> Add contact info
                  </button>
                  <SharePicker objectId={object.id} shareType="contacts" tooltip="Share contact info" />
                </div>
              </>
            )}
          </div>
        )}

        {/* NOTES TAB */}
        {activeTab === 'notes' && (
          <div className={styles.tabSection}>
            {connectedNotes.length > 0 && (
              <div className={styles.itemList}>
                {connectedNotes.map(note => (
                  <div key={note.id} className={styles.item}>
                    {editingNoteId === note.id ? (
                      <div className={styles.itemEditBody}>
                        <textarea
                          className={styles.editTextarea}
                          value={editNoteText}
                          onChange={e => setEditNoteText(e.target.value)}
                          autoFocus
                          rows={3}
                        />
                        <div className={styles.createFormActions}>
                          <button
                            className={styles.formBtn}
                            onClick={() => { setEditingNoteId(null); setEditNoteText('') }}
                          >
                            Cancel
                          </button>
                          <button
                            className={`${styles.formBtn} ${styles.formBtnPrimary}`}
                            onClick={() => saveEditNote(note.id)}
                            disabled={saving || !editNoteText.trim()}
                          >
                            {saving ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className={styles.noteCard}>
                        <p className={styles.noteText}>{note.name}</p>
                        <div className={styles.itemActions}>
                          <Tooltip text="Edit">
                            <button
                              className={styles.iconButtonSm}
                              onClick={() => { setEditingNoteId(note.id); setEditNoteText(note.name) }}
                            >
                              <Pencil size={11} />
                            </button>
                          </Tooltip>
                          <SharePicker objectId={note.id} shareType="note" />
                          <Tooltip text="Delete">
                            <button
                              className={styles.iconButtonSmDanger}
                              onClick={() => deleteNote(note.id)}
                            >
                              <Trash2 size={11} />
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
            {(() => {
              const noteIntel = sharedIntel.filter(r => r.share_type === 'note')
              if (noteIntel.length === 0) return null
              const byPeer = new Map<string, { display_name: string; items: SharedIntelRow[] }>()
              for (const r of noteIntel) {
                if (!byPeer.has(r.peer_user_id)) byPeer.set(r.peer_user_id, { display_name: r.peer_display_name, items: [] })
                byPeer.get(r.peer_user_id)!.items.push(r)
              }
              return (
                <div className={styles.sharedIntelSection}>
                  <span className={styles.sharedIntelLabel}>Shared Intel</span>
                  {Array.from(byPeer.entries()).map(([uid, { display_name, items }]) => (
                    <div key={uid} className={styles.sharedIntelEntry}>
                      <span className={styles.sharedIntelAuthor}>From {display_name}:</span>
                      {items.map(item => (
                        <p key={item.shared_object_id} className={styles.noteText}>{item.name || '(empty note)'}</p>
                      ))}
                    </div>
                  ))}
                </div>
              )
            })()}
            {creatingNote ? (
              <div className={styles.createForm}>
                <textarea
                  className={styles.editTextarea}
                  value={newNoteText}
                  onChange={e => setNewNoteText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Escape') { setCreatingNote(false); setNewNoteText('') }
                  }}
                  placeholder="Write a note..."
                  autoFocus
                  rows={3}
                />
                <div className={styles.createFormActions}>
                  <button
                    className={styles.formBtn}
                    onClick={() => { setCreatingNote(false); setNewNoteText('') }}
                  >
                    Cancel
                  </button>
                  <button
                    className={`${styles.formBtn} ${styles.formBtnPrimary}`}
                    onClick={createNote}
                    disabled={saving || !newNoteText.trim()}
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            ) : (
              <button className={styles.addNewRow} onClick={() => setCreatingNote(true)}>
                <Plus size={12} /> Add note
              </button>
            )}
          </div>
        )}

        {/* PROJECTS TAB */}
        {activeTab === 'projects' && (
          <div className={styles.tabSection}>
            {renderItemList(connectedProjects, 'project')}
            {(() => {
              const projectIntel = sharedIntel.filter(r => r.share_type === 'project')
              if (projectIntel.length === 0) return null
              const byPeer = new Map<string, { display_name: string; items: SharedIntelRow[] }>()
              for (const r of projectIntel) {
                if (!byPeer.has(r.peer_user_id)) byPeer.set(r.peer_user_id, { display_name: r.peer_display_name, items: [] })
                byPeer.get(r.peer_user_id)!.items.push(r)
              }
              return (
                <div className={styles.sharedIntelSection}>
                  <span className={styles.sharedIntelLabel}>Shared Intel</span>
                  {Array.from(byPeer.entries()).map(([uid, { display_name, items }]) => (
                    <div key={uid} className={styles.sharedIntelEntry}>
                      <span className={styles.sharedIntelAuthor}>From {display_name}:</span>
                      {items.map(item => {
                        const isExpanded = expandedIntelId === item.shared_object_id
                        return (
                          <div key={item.shared_object_id} className={styles.item}>
                            <button
                              className={`${styles.itemHeader} ${isExpanded ? styles.itemHeaderExpanded : ''}`}
                              onClick={() => setExpandedIntelId(isExpanded ? null : item.shared_object_id)}
                            >
                              <div className={styles.itemHeaderLeft}>
                                {isExpanded
                                  ? <ChevronDown size={12} className={styles.itemChevron} />
                                  : <ChevronRight size={12} className={styles.itemChevron} />
                                }
                                <span className={styles.itemName}>{item.name || '(unnamed)'}</span>
                              </div>
                              {item.status && <span className={styles.itemStatus}>{item.status}</span>}
                            </button>
                            {isExpanded && (
                              <div className={styles.itemBody}>
                                {item.title && <p className={styles.itemDescription}>{item.title}</p>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )
            })()}
            {creatingProject ? renderCreateForm('project') : (
              <button className={styles.addNewRow} onClick={() => {
                resetCreateForm()
                setCreatingProject(true)
              }}>
                <Plus size={12} /> Add project
              </button>
            )}
          </div>
        )}

        {/* EVENTS TAB */}
        {activeTab === 'events' && (
          <div className={styles.tabSection}>
            {renderItemList(connectedEvents, 'event')}
            {(() => {
              const eventIntel = sharedIntel.filter(r => r.share_type === 'event')
              if (eventIntel.length === 0) return null
              const byPeer = new Map<string, { display_name: string; items: SharedIntelRow[] }>()
              for (const r of eventIntel) {
                if (!byPeer.has(r.peer_user_id)) byPeer.set(r.peer_user_id, { display_name: r.peer_display_name, items: [] })
                byPeer.get(r.peer_user_id)!.items.push(r)
              }
              return (
                <div className={styles.sharedIntelSection}>
                  <span className={styles.sharedIntelLabel}>Shared Intel</span>
                  {Array.from(byPeer.entries()).map(([uid, { display_name, items }]) => (
                    <div key={uid} className={styles.sharedIntelEntry}>
                      <span className={styles.sharedIntelAuthor}>From {display_name}:</span>
                      {items.map(item => {
                        const isExpanded = expandedIntelId === item.shared_object_id
                        return (
                          <div key={item.shared_object_id} className={styles.item}>
                            <button
                              className={`${styles.itemHeader} ${isExpanded ? styles.itemHeaderExpanded : ''}`}
                              onClick={() => setExpandedIntelId(isExpanded ? null : item.shared_object_id)}
                            >
                              <div className={styles.itemHeaderLeft}>
                                {isExpanded
                                  ? <ChevronDown size={12} className={styles.itemChevron} />
                                  : <ChevronRight size={12} className={styles.itemChevron} />
                                }
                                <span className={styles.itemName}>{item.name || '(unnamed)'}</span>
                              </div>
                              {item.event_date && <span className={styles.itemDate}>{formatDate(item.event_date)}</span>}
                            </button>
                            {isExpanded && (
                              <div className={styles.itemBody}>
                                {item.title && <p className={styles.itemDescription}>{item.title}</p>}
                                {item.event_date && <div className={styles.itemMeta}>{formatDate(item.event_date)}</div>}
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )
            })()}
            {creatingEvent ? renderCreateForm('event') : (
              <button className={styles.addNewRow} onClick={() => {
                resetCreateForm()
                setCreatingEvent(true)
              }}>
                <Plus size={12} /> Add event
              </button>
            )}
          </div>
        )}
      </div>

      {/* Dual-select relationship action */}
      {peerObject && (
        <div className={styles.relationshipAction}>
          {peerConnected ? (
            <span className={styles.relationshipConnected}>Connected to {peerObject.name}</span>
          ) : (
            <button className={styles.relationshipButton} onClick={onConnectToPeer}>
              Connect to {peerObject.name}
            </button>
          )}
        </div>
      )}

      {/* Delete confirmation overlay */}
      {deleteConfirm && (
        <div className={styles.deleteOverlay}>
          <div className={styles.deleteContent}>
            <p className={styles.deleteTitle}>Delete <strong>{object.name}</strong>?</p>
            {(deleteConfirm.connections > 0 || deleteConfirm.orphanedProjects > 0 || deleteConfirm.orphanedEvents > 0) && (
              <p className={styles.deleteDetails}>
                This will also delete{' '}
                {[
                  deleteConfirm.connections > 0 && `${deleteConfirm.connections} connection${deleteConfirm.connections !== 1 ? 's' : ''}`,
                  deleteConfirm.orphanedProjects > 0 && `${deleteConfirm.orphanedProjects} project${deleteConfirm.orphanedProjects !== 1 ? 's' : ''}`,
                  deleteConfirm.orphanedEvents > 0 && `${deleteConfirm.orphanedEvents} event${deleteConfirm.orphanedEvents !== 1 ? 's' : ''}`,
                ].filter(Boolean).join(' and ')}
              </p>
            )}
            <div className={styles.deleteActions}>
              <button className={styles.deleteCancelBtn} onClick={() => setDeleteConfirm(null)}>Cancel</button>
              <button className={styles.deleteConfirmBtn} onClick={executeDelete}>Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
