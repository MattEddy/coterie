import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { Pencil, Check, X, Phone, FileText, Clipboard, Calendar, CalendarCheck, Plus, ChevronDown, ChevronRight, Link, Trash2, Map as MapIcon } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { getEffectiveConnections, otherObjectId } from '../lib/connections'
import { useAuth } from '../contexts/AuthContext'
import type { ObjectNodeData, ContactEntry } from './ObjectNode'
import type { NodeRect } from '../types'
import Tooltip from './Tooltip'
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

  const nodeRect: NodeRect | null = useMemo(() => {
    if (!nodePosition) return null
    const topLeft = flowToScreenPosition(nodePosition)
    const bottomRight = flowToScreenPosition({
      x: nodePosition.x + NODE_WIDTH,
      y: nodePosition.y + NODE_HEIGHT,
    })
    return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y }
  }, [nodePosition, viewport, flowToScreenPosition])

  const panelRef = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ left: 0, top: 0 })

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

  // Notes tab editing
  const [notesEditing, setNotesEditing] = useState(false)
  const [notesValues, setNotesValues] = useState({
    shared_notes: object.shared_notes || '',
    private_notes: object.private_notes || '',
  })

  // Coterie Intel (shared notes + contacts from coterie members)
  const [coterieIntel, setCoterieIntel] = useState<{ user_id: string; display_name: string; shared_notes: string | null; contacts: ContactEntry[] }[]>([])

  // Connected items (projects/events)
  const [connectedProjects, setConnectedProjects] = useState<ConnectedItem[]>([])
  const [connectedEvents, setConnectedEvents] = useState<ConnectedItem[]>([])
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)
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
    const { data: moData } = await supabase
      .from('maps_objects')
      .select('map_id')
      .eq('object_ref_id', object.id)
    if (!moData) return
    const mapIds = moData.map(d => d.map_id)
    if (mapIds.length === 0) { setObjectMaps([]); return }
    const { data } = await supabase
      .from('maps')
      .select('id, name')
      .in('id', mapIds)
      .eq('user_id', user.id)
      .eq('is_active', true)
      .order('name')
    setObjectMaps(data ?? [])
  }, [user, object.id])

  const loadAllMaps = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('maps')
      .select('id, name')
      .eq('user_id', user.id)
      .eq('is_active', true)
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
  const loadConnectedItems = useCallback(async (objectId: string, targetClass: 'project' | 'event') => {
    if (!user) return

    const conns = await getEffectiveConnections(objectId, user.id)
    const itemIds = new Set<string>()
    for (const c of conns) {
      const otherId = otherObjectId(c, objectId)
      if (otherId) itemIds.add(otherId)
    }

    if (itemIds.size === 0) {
      if (targetClass === 'project') setConnectedProjects([])
      else setConnectedEvents([])
      return
    }

    // Fetch the connected objects — try user_objects first, fall back to objects
    const ids = Array.from(itemIds)
    const { data: userObjs } = await supabase
      .from('user_objects')
      .select('*')
      .eq('user_id', user.id)
      .eq('class', targetClass)
      .in('id', ids)

    // For any IDs not found in user_objects (no override row), query objects directly
    const foundIds = new Set((userObjs || []).map(o => o.id))
    const missingIds = ids.filter(id => !foundIds.has(id))
    let fallbackObjs: typeof userObjs = []
    if (missingIds.length > 0) {
      const { data } = await supabase
        .from('objects')
        .select('id, class, name, title, status, event_date')
        .eq('class', targetClass)
        .eq('is_active', true)
        .in('id', missingIds)
      fallbackObjs = data || []
    }

    const items: ConnectedItem[] = [
      ...(userObjs || []).map(o => ({
        id: o.id,
        name: o.name || '(unnamed)',
        title: o.title,
        status: o.status,
        event_date: o.event_date,
        types: o.types || [],
      })),
      ...(fallbackObjs || []).map(o => ({
        id: o.id,
        name: o.name || '(unnamed)',
        title: o.title,
        status: o.status,
        event_date: o.event_date,
        types: [],
      })),
    ]

    // Sort: events by date desc, projects alphabetically
    if (targetClass === 'event') {
      items.sort((a, b) => (b.event_date || '').localeCompare(a.event_date || ''))
    } else {
      items.sort((a, b) => (a.name).localeCompare(b.name))
    }

    if (targetClass === 'project') setConnectedProjects(items)
    else setConnectedEvents(items)
  }, [user])

  useEffect(() => {
    if (activeTab === 'projects') loadConnectedItems(object.id, 'project')
    if (activeTab === 'events') loadConnectedItems(object.id, 'event')
  }, [activeTab, object.id, loadConnectedItems])

  // Load coterie intel (shared notes + contacts from coterie members)
  useEffect(() => {
    async function loadCoterieIntel() {
      if (!user) return

      // Get coterie peer user IDs
      const { data: myMemberships } = await supabase
        .from('coteries_members')
        .select('coterie_id')
        .eq('user_id', user.id)
      if (!myMemberships?.length) return

      const { data: peers } = await supabase
        .from('coteries_members')
        .select('user_id')
        .in('coterie_id', myMemberships.map(m => m.coterie_id))
        .neq('user_id', user.id)
      if (!peers?.length) return

      const peerIds = [...new Set(peers.map(p => p.user_id))]

      // IMPORTANT: Only select shared_notes + data — NEVER private_notes.
      // RLS grants full-row SELECT for coterie intel (column filtering is app-side).
      // Using select('*') here would leak private_notes to coterie members.
      const { data: overrides } = await supabase
        .from('objects_overrides')
        .select('user_id, shared_notes, data')
        .eq('object_id', object.id)
        .in('user_id', peerIds)
      if (!overrides?.length) { setCoterieIntel([]); return }

      // Get display names
      const { data: profiles } = await supabase
        .from('profiles')
        .select('user_id, display_name')
        .in('user_id', overrides.map(o => o.user_id))
      const nameMap = new Map((profiles ?? []).map(p => [p.user_id, p.display_name || 'Unknown']))

      setCoterieIntel(overrides
        .filter(o => o.shared_notes || (o.data as any)?.contacts?.length > 0)
        .map(o => ({
          user_id: o.user_id,
          display_name: nameMap.get(o.user_id) || 'Unknown',
          shared_notes: o.shared_notes,
          contacts: ((o.data as any)?.contacts ?? []) as ContactEntry[],
        }))
      )
    }
    loadCoterieIntel()
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

    const { error: connError } = await supabase.from('connections_overrides').insert({
      user_id: user.id,
      object_a_id: object.id,
      object_b_id: existingId,
    })
    if (connError) { console.error('Failed to link item:', connError); setSaving(false); return }

    // Ensure override row exists so it shows up in user_objects
    const { data: existing } = await supabase
      .from('objects_overrides')
      .select('id')
      .eq('object_id', existingId)
      .eq('user_id', user.id)
      .maybeSingle()
    if (!existing) {
      await supabase.from('objects_overrides').insert({ user_id: user.id, object_id: existingId })
    }

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
    setNotesEditing(false)
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
    setNotesValues({
      shared_notes: object.shared_notes || '',
      private_notes: object.private_notes || '',
    })
  }, [object.id])

  // Position panel adjacent to node
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el || !nodeRect) return

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

    setPos({ left, top })
  }, [nodeRect, activeTab, headerEditing, contactEditing, notesEditing, showTagInput, creatingProject, creatingEvent, expandedItemId, editingItemId, object.id])

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

  async function resolveTypeIds(displayNames: string[]): Promise<string[]> {
    if (displayNames.length === 0) return []
    const { data } = await supabase
      .from('types')
      .select('id, display_name')
      .in('display_name', displayNames)
      .eq('class', object.class)
    return (data || []).map(t => t.id)
  }

  async function saveTypes() {
    if (!user) return
    await supabase
      .from('objects_types_overrides')
      .delete()
      .eq('object_id', object.id)
      .eq('user_id', user.id)
    if (editTypes.length > 0) {
      const typeIds = await resolveTypeIds(editTypes)
      if (typeIds.length > 0) {
        await supabase
          .from('objects_types_overrides')
          .insert(typeIds.map(typeId => ({ user_id: user.id, object_id: object.id, type_id: typeId })))
      }
    }
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

  async function saveNotes() {
    if (!user) return
    const { error } = await supabase
      .from('objects_overrides')
      .update({
        shared_notes: notesValues.shared_notes.trim() || null,
        private_notes: notesValues.private_notes.trim() || null,
      })
      .eq('object_id', object.id)
      .eq('user_id', user.id)
    if (error) { console.error('Failed to save notes:', error); return }
    setNotesEditing(false)
    onObjectUpdated?.()
  }

  // ===== DELETE =====

  async function initiateDelete() {
    if (!user) return

    // Get all object IDs on the user's landscape
    const { data: userObjRows } = await supabase
      .from('objects_overrides')
      .select('object_id')
      .eq('user_id', user.id)

    const userObjectIds = new Set((userObjRows || []).map(r => r.object_id))

    const conns = await getEffectiveConnections(object.id, user.id)

    // Only count connections where the other endpoint is on the user's landscape
    const totalConnections = conns.filter(c => {
      return userObjectIds.has(otherObjectId(c, object.id))
    }).length

    // Find connected off-landscape objects (projects/events) that would be orphaned
    const relatedIds = new Set<string>()
    for (const c of conns) {
      relatedIds.add(otherObjectId(c, object.id))
    }

    // Check which are orphans (only connected to this object)
    let orphanedProjects = 0
    let orphanedEvents = 0
    for (const relId of relatedIds) {
      const { count: otherConns } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .or(`object_a_id.eq.${relId},object_b_id.eq.${relId}`)
        .neq('object_a_id', object.id)
        .neq('object_b_id', object.id)

      const { count: otherUserConns } = await supabase
        .from('connections_overrides')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('connection_id', null)
        .or(`object_a_id.eq.${relId},object_b_id.eq.${relId}`)
        .neq('object_a_id', object.id)
        .neq('object_b_id', object.id)

      if ((otherConns || 0) + (otherUserConns || 0) === 0) {
        const { data: relObj } = await supabase
          .from('objects')
          .select('class')
          .eq('id', relId)
          .single()

        if (relObj?.class === 'project') orphanedProjects++
        else if (relObj?.class === 'event') orphanedEvents++
      }
    }

    setDeleteConfirm({ connections: totalConnections, orphanedProjects, orphanedEvents })
  }

  async function executeDelete() {
    if (!user) return

    // Delete the override FIRST (critical operation — removes from landscape)
    const { error: deleteError } = await supabase
      .from('objects_overrides')
      .delete()
      .eq('object_id', object.id)
      .eq('user_id', user.id)

    if (deleteError) return

    // If user-created, hard-delete the objects row too
    if (!object.is_canon && object.created_by === user.id) {
      await supabase.from('objects').delete().eq('id', object.id)
    }

    // Clean up connections (non-critical — wrapped in try/catch)
    try {
    // 1. Delete user-created connections involving this object
    await supabase
      .from('connections_overrides')
      .delete()
      .eq('user_id', user.id)
      .or(`object_a_id.eq.${object.id},object_b_id.eq.${object.id}`)

    // 2. Deactivate canonical connections (create override with deactivated=true)
    const { data: canonConns } = await supabase
      .from('connections')
      .select('id')
      .eq('is_active', true)
      .or(`object_a_id.eq.${object.id},object_b_id.eq.${object.id}`)

    if (canonConns?.length) {
      for (const c of canonConns) {
        const { data: existing } = await supabase
          .from('connections_overrides')
          .select('id')
          .eq('user_id', user.id)
          .eq('connection_id', c.id)
          .maybeSingle()

        if (existing) {
          await supabase
            .from('connections_overrides')
            .update({ deactivated: true })
            .eq('id', existing.id)
        } else {
          // Need real object_a/object_b from the canonical connection
          const { data: conn } = await supabase
            .from('connections')
            .select('object_a_id, object_b_id')
            .eq('id', c.id)
            .single()

          if (conn) {
            await supabase
              .from('connections_overrides')
              .insert({
                user_id: user.id,
                connection_id: c.id,
                object_a_id: conn.object_a_id,
                object_b_id: conn.object_b_id,
                deactivated: true,
              })
          }
        }
      }
    }

    // 3. Clean up orphaned off-landscape objects
    const { data: offConns } = await supabase
      .from('connections')
      .select('object_a_id, object_b_id')
      .eq('is_active', true)
      .or(`object_a_id.eq.${object.id},object_b_id.eq.${object.id}`)

    const { data: offUserConns } = await supabase
      .from('connections_overrides')
      .select('object_a_id, object_b_id')
      .eq('user_id', user.id)
      .is('connection_id', null)
      .or(`object_a_id.eq.${object.id},object_b_id.eq.${object.id}`)

    const orphanCandidates = new Set<string>()
    for (const c of [...(offConns || []), ...(offUserConns || [])]) {
      orphanCandidates.add(c.object_a_id === object.id ? c.object_b_id : c.object_a_id)
    }

    for (const orphanId of orphanCandidates) {
      // Delete connections to this orphan that go through our object
      // (already deleted above via user connections + deactivated canonical)
      // Check if truly orphaned now
      const { count: remaining } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .or(`object_a_id.eq.${orphanId},object_b_id.eq.${orphanId}`)
        .neq('object_a_id', object.id)
        .neq('object_b_id', object.id)

      const { count: remainingUser } = await supabase
        .from('connections_overrides')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('connection_id', null)
        .or(`object_a_id.eq.${orphanId},object_b_id.eq.${orphanId}`)
        .neq('object_a_id', object.id)
        .neq('object_b_id', object.id)

      if ((remaining || 0) + (remainingUser || 0) === 0) {
        // Orphan — hard-delete override and (if user-created) the object
        await supabase
          .from('objects_overrides')
          .delete()
          .eq('object_id', orphanId)
          .eq('user_id', user.id)

        const { data: orphanObj } = await supabase
          .from('objects')
          .select('is_canon, created_by')
          .eq('id', orphanId)
          .single()

        if (orphanObj && !orphanObj.is_canon && orphanObj.created_by === user.id) {
          await supabase.from('objects').delete().eq('id', orphanId)
        }
      }
    }
    } catch (e) {
      console.error('Connection cleanup error (non-critical):', e)
    }

    setDeleteConfirm(null)
    onClose()
    onObjectUpdated?.()
  }

  async function createConnectedItem(targetClass: 'project' | 'event') {
    if (!user || !newItemValues.name.trim()) return
    setSaving(true)

    // 1. Create skeleton objects row
    const { data: newObj } = await supabase
      .from('objects')
      .insert({ class: targetClass, is_canon: false, created_by: user.id })
      .select('id')
      .single()

    if (!newObj) { setSaving(false); return }

    // 2. Create objects_overrides with all user data
    const overridePayload: Record<string, unknown> = {
      user_id: user.id,
      object_id: newObj.id,
      name: newItemValues.name.trim(),
      title: newItemValues.title.trim() || null,
      status: newItemValues.status.trim() || null,
    }
    if (targetClass === 'event' && newItemValues.event_date) {
      overridePayload.event_date = newItemValues.event_date
    }
    const { error: ovError } = await supabase.from('objects_overrides').insert(overridePayload)
    if (ovError) { console.error('Failed to create override:', ovError); setSaving(false); return }

    // 3. Create types overrides (resolve display_names to UUIDs)
    if (newItemTypes.length > 0) {
      const { data: typeRows } = await supabase
        .from('types')
        .select('id, display_name')
        .in('display_name', newItemTypes)
        .eq('class', targetClass)
      const typeIds = (typeRows || []).map(t => t.id)
      if (typeIds.length > 0) {
        await supabase
          .from('objects_types_overrides')
          .insert(typeIds.map(typeId => ({ user_id: user.id, object_id: newObj.id, type_id: typeId })))
      }
    }

    // 4. Create connection to current node
    const { error: connErr } = await supabase.from('connections_overrides').insert({
      user_id: user.id,
      object_a_id: object.id,
      object_b_id: newObj.id,
    })
    if (connErr) console.error('Failed to create connection:', connErr)

    // 5. Create additional connections from the link picker
    if (newItemLinks.length > 0) {
      const { error: linksErr } = await supabase.from('connections_overrides').insert(
        newItemLinks.map(link => ({
          user_id: user.id,
          object_a_id: link.id,
          object_b_id: newObj.id,
        }))
      )
      if (linksErr) console.error('Failed to create link connections:', linksErr)
    }

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

    const payload: Record<string, unknown> = {
      name: editItemValues.name.trim() || null,
      title: editItemValues.title.trim() || null,
      status: editItemValues.status.trim() || null,
    }
    if (targetClass === 'event') {
      payload.event_date = editItemValues.event_date || null
    }

    // Upsert override (might not exist yet for canonical objects)
    const { data: existing } = await supabase
      .from('objects_overrides')
      .select('id')
      .eq('object_id', itemId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (existing) {
      await supabase
        .from('objects_overrides')
        .update(payload)
        .eq('object_id', itemId)
        .eq('user_id', user.id)
    } else {
      await supabase
        .from('objects_overrides')
        .insert({ user_id: user.id, object_id: itemId, ...payload })
    }

    // Save types
    await supabase
      .from('objects_types_overrides')
      .delete()
      .eq('object_id', itemId)
      .eq('user_id', user.id)
    if (editItemTypes.length > 0) {
      const { data: typeRows } = await supabase
        .from('types')
        .select('id, display_name')
        .in('display_name', editItemTypes)
        .eq('class', targetClass)
      const typeIds = (typeRows || []).map(t => t.id)
      if (typeIds.length > 0) {
        await supabase
          .from('objects_types_overrides')
          .insert(typeIds.map(typeId => ({ user_id: user.id, object_id: itemId, type_id: typeId })))
      }
    }

    setSaving(false)
    setEditingItemId(null)
    loadConnectedItems(object.id, targetClass)
    onObjectUpdated?.()
  }

  async function deleteConnectedItem(itemId: string, targetClass: 'project' | 'event') {
    if (!user) return

    // Deactivate canonical connections between this node and the item
    const { data: canonConns } = await supabase
      .from('connections')
      .select('id')
      .eq('is_active', true)
      .or(`and(object_a_id.eq.${object.id},object_b_id.eq.${itemId}),and(object_a_id.eq.${itemId},object_b_id.eq.${object.id})`)

    if (canonConns && canonConns.length > 0) {
      for (const conn of canonConns) {
        await supabase.from('connections_overrides').upsert({
          user_id: user.id,
          connection_id: conn.id,
          deactivated: true,
        }, { onConflict: 'user_id,connection_id' })
      }
    }

    // Hard delete user-created connections between this node and the item
    await supabase
      .from('connections_overrides')
      .delete()
      .eq('user_id', user.id)
      .is('connection_id', null)
      .or(`and(object_a_id.eq.${object.id},object_b_id.eq.${itemId}),and(object_a_id.eq.${itemId},object_b_id.eq.${object.id})`)

    // Check if the item has any remaining connections for this user
    // Canonical connections not deactivated by this user
    const { data: allCanonConns } = await supabase
      .from('connections')
      .select('id')
      .eq('is_active', true)
      .or(`object_a_id.eq.${itemId},object_b_id.eq.${itemId}`)

    const { data: allDeactivated } = await supabase
      .from('connections_overrides')
      .select('connection_id')
      .eq('user_id', user.id)
      .not('connection_id', 'is', null)
      .eq('deactivated', true)

    const deactivatedIds = new Set((allDeactivated || []).map(d => d.connection_id))
    const activeCanon = (allCanonConns || []).filter(c => !deactivatedIds.has(c.id)).length

    // Remaining user-created connections
    const { count: remainingUser } = await supabase
      .from('connections_overrides')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .is('connection_id', null)
      .or(`object_a_id.eq.${itemId},object_b_id.eq.${itemId}`)

    const totalRemaining = activeCanon + (remainingUser || 0)

    // If no remaining connections, clean up the orphaned item
    if (totalRemaining <= 0) {
      // Hard delete the user's override
      await supabase
        .from('objects_overrides')
        .delete()
        .eq('object_id', itemId)
        .eq('user_id', user.id)

      // Hard delete type overrides
      await supabase
        .from('objects_types_overrides')
        .delete()
        .eq('object_id', itemId)
        .eq('user_id', user.id)

      // If user created it and it's not canonical, hard delete the objects row too
      const { data: obj } = await supabase
        .from('objects')
        .select('is_canon, created_by')
        .eq('id', itemId)
        .single()

      if (obj && !obj.is_canon && obj.created_by === user.id) {
        await supabase
          .from('objects')
          .delete()
          .eq('id', itemId)
      }
    }

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
      const anyEditing = headerEditing || showTagInput || contactEditing || notesEditing || creatingProject || creatingEvent || editingItemId || showLinkSearch

      if (e.key === 'Escape') {
        if (anyEditing) return
        onClose()
        return
      }

      if (e.key === 'Enter') {
        const active = document.activeElement
        const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT')
        const onButton = active && active.tagName === 'BUTTON'
        if (inInput) return

        if (headerEditing) {
          e.preventDefault()
          saveHeader()
        } else if (!anyEditing && !onButton) {
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
        const all = panel.querySelectorAll<HTMLElement>(
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
  }, [headerEditing, showTagInput, contactEditing, notesEditing, creatingProject, creatingEvent, editingItemId, showLinkSearch, onClose])

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

        {/* Feature A: Project name matching — search existing or type new */}
        {targetClass === 'project' && !newItemValues.name ? (
          <ObjectSearch
            userId={user!.id}
            targetClass="project"
            excludeIds={connectedIds}
            placeholder="Project name (search existing or type new)"
            autoFocus
            onSelect={proj => linkExistingItem(proj.id, 'project')}
            onCreateNew={name => setNewItemValues(prev => ({ ...prev, name }))}
            onCancel={() => { setCreatingProject(false); resetCreateForm() }}
          />
        ) : (
          <textarea
            className={styles.createInput}
            value={newItemValues.name}
            onChange={e => setNewItemValues(prev => ({ ...prev, name: e.target.value }))}
            onKeyDown={e => {
              if (e.key === 'Escape') {
                if (targetClass === 'project') setCreatingProject(false)
                else setCreatingEvent(false)
                resetCreateForm()
              }
            }}
            placeholder={targetClass === 'project' ? 'Project name' : 'Event name'}
            autoComplete="off"
            autoFocus={!newItemValues.name}
            rows={1}
          />
        )}

        {/* Cancel button always visible before name is set */}
        {!newItemValues.name && (
          <button
            className={styles.addButton}
            onClick={() => {
              if (targetClass === 'project') setCreatingProject(false)
              else setCreatingEvent(false)
              resetCreateForm()
            }}
          >
            Cancel
          </button>
        )}

        {/* Only show remaining fields once a new name is set (not linking existing) */}
        {newItemValues.name && (
          <>
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
              <>
                <textarea
                  className={styles.createInput}
                  value={newItemValues.status}
                  onChange={e => setNewItemValues(prev => ({ ...prev, status: e.target.value }))}
                  placeholder="Status"
                  autoComplete="off"
                  rows={1}
                />
                <TagInput
                  tags={newItemTypes}
                  onChange={setNewItemTypes}
                  objectClass="project"
                  placeholder="Formats & Genres"
                  userId={user!.id}
                  autoFocus={false}
                />
              </>
            )}

            {/* Feature C: Link additional objects during creation */}
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
                className={styles.addButton}
                onClick={() => createConnectedItem(targetClass)}
                disabled={saving || !newItemValues.name.trim()}
              >
                <Check size={12} /> {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                className={styles.addButton}
                onClick={() => {
                  if (targetClass === 'project') setCreatingProject(false)
                  else setCreatingEvent(false)
                  resetCreateForm()
                }}
              >
                Cancel
              </button>
            </div>
          </>
        )}
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
                  {item.title && <p className={styles.itemDescription}>{item.title}</p>}
                  {item.types.length > 0 && (
                    <div className={styles.itemTypes}>
                      {item.types.map(t => (
                        <span key={t} className={styles.type}>{t.replace(/_/g, ' ')}</span>
                      ))}
                    </div>
                  )}
                  {targetClass === 'event' && item.event_date && (
                    <div className={styles.itemMeta}>{formatDate(item.event_date)}</div>
                  )}
                  {targetClass === 'project' && item.status && (
                    <div className={styles.itemMeta}>{item.status}</div>
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
                    <Tooltip text="Link existing">
                      <button
                        className={styles.iconButtonSm}
                        onClick={() => setShowLinkSearch(!showLinkSearch)}
                      >
                        <Link size={11} />
                      </button>
                    </Tooltip>
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
                    <Tooltip text="Remove">
                      <button
                        className={styles.iconButtonSmDanger}
                        onClick={() => deleteConnectedItem(item.id, targetClass)}
                      >
                        <X size={11} />
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
                  <TagInput
                    tags={editItemTypes}
                    onChange={setEditItemTypes}
                    objectClass={targetClass}
                    placeholder={targetClass === 'project' ? 'Formats & Genres' : 'Event Type(s)'}
                    userId={user!.id}
                    autoFocus={false}
                  />
                  <div className={styles.createFormActions}>
                    <button
                      className={styles.addButton}
                      onClick={() => saveEditItem(item.id, targetClass)}
                      disabled={saving || !editItemValues.name.trim()}
                    >
                      <Check size={12} /> {saving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      className={styles.addButton}
                      onClick={() => setEditingItemId(null)}
                    >
                      Cancel
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
            <div className={styles.tabFloatingAction}>
              {contactEditing ? (
                <>
                  <Tooltip text="Save"><button className={styles.iconButtonSm} onClick={saveContact}><Check size={12} /></button></Tooltip>
                  <Tooltip text="Cancel"><button className={styles.iconButtonSm} onClick={() => {
                    setEditContacts(object.data?.contacts ?? [])
                    setContactEditing(false)
                  }}><X size={12} /></button></Tooltip>
                </>
              ) : (
                <Tooltip text="Edit contact info">
                  <button className={styles.iconButtonSm} onClick={() => {
                    setEditContacts(object.data?.contacts ?? [])
                    setContactEditing(true)
                  }}>
                    <Pencil size={12} />
                  </button>
                </Tooltip>
              )}
            </div>
            {contactEditing ? (
              <div className={styles.editFields}>
                {editContacts.map((c, i) => (
                  <div key={i} className={styles.contactRow}>
                    <select
                      className={styles.contactType}
                      value={c.type}
                      onChange={e => setEditContacts(prev => prev.map((x, j) => j === i ? { ...x, type: e.target.value } : x))}
                    >
                      {contactTypes.map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
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
                        className={styles.iconButtonSm}
                        onClick={() => setEditContacts(prev => prev.filter((_, j) => j !== i))}
                      >
                        <X size={10} />
                      </button>
                    </Tooltip>
                  </div>
                ))}
                <button
                  className={styles.addButton}
                  onClick={() => setEditContacts(prev => [...prev, emptyContact()])}
                >
                  <Plus size={12} /> Add contact
                </button>
              </div>
            ) : (
              <div className={styles.readFields}>
                {(object.data?.contacts ?? []).map((c, i) => (
                  <div key={i} className={styles.field}>
                    <span className={styles.label}>{c.label || c.type}</span>
                    <span className={styles.value}>{c.value}</span>
                  </div>
                ))}
                {!(object.data?.contacts?.length) && !coterieIntel.some(ci => ci.contacts.length > 0) && (
                  <span className={styles.emptyState}>No contact info</span>
                )}
                {/* Note: the coterie intel contacts section with adopt buttons is rendered via the IIFE below */}
                {(() => {
                  const adopted = new Set<string>(((object.data as any)?.adopted_intel ?? []) as string[])
                  const intelWithUnadopted = coterieIntel
                    .map(ci => ({
                      ...ci,
                      unadoptedContacts: ci.contacts.filter(c => !adopted.has(intelContactFingerprint(ci.user_id, c))),
                    }))
                    .filter(ci => ci.unadoptedContacts.length > 0)
                  return intelWithUnadopted.length > 0 && (
                    <div className={styles.coterieIntelSection}>
                      <span className={styles.coterieIntelLabel}>Coterie Intel</span>
                      {intelWithUnadopted.map(ci => (
                        <div key={ci.user_id} className={styles.coterieIntelEntry}>
                          <span className={styles.coterieIntelAuthor}>{ci.display_name}</span>
                          {ci.unadoptedContacts.map((c, i) => (
                            <div key={i} className={styles.intelContactRow}>
                              <div className={styles.field} style={{ flex: 1 }}>
                                <span className={styles.label}>{c.label || c.type}</span>
                                <span className={styles.value}>{c.value}</span>
                              </div>
                              <Tooltip text="Add to my intel">
                                <button
                                  className={styles.intelAdoptBtn}
                                  onClick={() => adoptIntelContact(ci.user_id, c)}
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
            )}
          </div>
        )}

        {/* NOTES TAB */}
        {activeTab === 'notes' && (
          <div className={styles.tabSection}>
            <div className={styles.tabFloatingAction}>
              {notesEditing ? (
                <>
                  <Tooltip text="Save"><button className={styles.iconButtonSm} onClick={saveNotes}><Check size={12} /></button></Tooltip>
                  <Tooltip text="Cancel"><button className={styles.iconButtonSm} onClick={() => {
                    setNotesValues({ shared_notes: object.shared_notes || '', private_notes: object.private_notes || '' })
                    setNotesEditing(false)
                  }}><X size={12} /></button></Tooltip>
                </>
              ) : (
                <Tooltip text="Edit notes">
                  <button className={styles.iconButtonSm} onClick={() => setNotesEditing(true)}>
                    <Pencil size={12} />
                  </button>
                </Tooltip>
              )}
            </div>
            {notesEditing ? (
              <div className={styles.editFields}>
                <div className={styles.editField}>
                  <label className={styles.label}>Shared with Coteries</label>
                  <textarea
                    className={styles.editTextarea}
                    value={notesValues.shared_notes}
                    onChange={e => setNotesValues(prev => ({ ...prev, shared_notes: e.target.value }))}
                    placeholder="Notes visible to your coterie..."
                    rows={3}
                  />
                </div>
                <div className={styles.editField}>
                  <label className={styles.label}>Private (Not Shared)</label>
                  <textarea
                    className={styles.editTextarea}
                    value={notesValues.private_notes}
                    onChange={e => setNotesValues(prev => ({ ...prev, private_notes: e.target.value }))}
                    placeholder="Private notes (never shared)..."
                    rows={3}
                  />
                </div>
              </div>
            ) : (
              <div className={styles.readFields}>
                {object.shared_notes && (
                  <div className={styles.noteBlock}>
                    <span className={styles.label}>Shared with Coteries</span>
                    <p className={styles.noteText}>{object.shared_notes}</p>
                  </div>
                )}
                {object.private_notes && (
                  <div className={styles.noteBlock}>
                    <span className={styles.label}>Private (Not Shared)</span>
                    <p className={styles.noteText}>{object.private_notes}</p>
                  </div>
                )}
                {!object.shared_notes && !object.private_notes && !coterieIntel.some(ci => ci.shared_notes) && (
                  <span className={styles.emptyState}>No notes</span>
                )}
                {coterieIntel.some(ci => ci.shared_notes) && (
                  <div className={styles.coterieIntelSection}>
                    <span className={styles.coterieIntelLabel}>Coterie Intel</span>
                    {coterieIntel.filter(ci => ci.shared_notes).map(ci => (
                      <div key={ci.user_id} className={styles.coterieIntelEntry}>
                        <span className={styles.coterieIntelAuthor}>{ci.display_name}</span>
                        <p className={styles.noteText}>{ci.shared_notes}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* PROJECTS TAB */}
        {activeTab === 'projects' && (
          <div className={styles.tabSection}>
            {!creatingProject && (
              <div className={styles.tabFloatingAction}>
                <Tooltip text="Add project">
                  <button className={styles.iconButtonSm} onClick={() => {
                    resetCreateForm()
                    setCreatingProject(true)
                  }}>
                    <Plus size={12} />
                  </button>
                </Tooltip>
              </div>
            )}
            {creatingProject && renderCreateForm('project')}
            {renderItemList(connectedProjects, 'project')}
          </div>
        )}

        {/* EVENTS TAB */}
        {activeTab === 'events' && (
          <div className={styles.tabSection}>
            {!creatingEvent && (
              <div className={styles.tabFloatingAction}>
                <Tooltip text="Add event">
                  <button className={styles.iconButtonSm} onClick={() => {
                    resetCreateForm()
                    setCreatingEvent(true)
                  }}>
                    <Plus size={12} />
                  </button>
                </Tooltip>
              </div>
            )}
            {creatingEvent && renderCreateForm('event')}
            {renderItemList(connectedEvents, 'event')}
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
