import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { Pencil, Check, X, Phone, FileText, Clipboard, Calendar, Plus, ChevronDown, ChevronRight, Search, Link, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { ObjectNodeData, ContactEntry } from './ObjectNode'
import type { NodeRect } from '../types'
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
}

type TabId = 'contact' | 'notes' | 'projects' | 'events'

const tabs: { id: TabId; Icon: typeof Phone; label: string; heading: string }[] = [
  { id: 'contact', Icon: Phone, label: 'Contact', heading: 'Contact Info' },
  { id: 'notes', Icon: FileText, label: 'Notes', heading: 'Notes' },
  { id: 'projects', Icon: Clipboard, label: 'Projects', heading: 'Projects' },
  { id: 'events', Icon: Calendar, label: 'Events', heading: 'Events' },
]

const classPlaceholders: Record<string, { name: string; title: string }> = {
  company: { name: 'Company Name', title: 'Description' },
  person:  { name: 'Name (First Last)', title: 'Title' },
  project: { name: 'Project Name', title: 'Description' },
  event:   { name: 'Event Name', title: 'Description' },
}

const typeTagPlaceholders: Record<string, string> = {
  company: 'Organization Type(s)',
  person:  'Tags (eg jobs, roles, etc.)',
  project: 'e.g. feature, tv series, documentary...',
  event:   'e.g. meeting, call, pitch...',
}

const contactTypes = ['phone', 'email', 'url', 'address', 'social']

const emptyContact = (): ContactEntry => ({ type: 'phone', label: '', value: '' })

// Connection type mapping: which connection to create based on the selected node's class
const connectionConfig: Record<string, Record<string, { type: string; nodeIsSource: boolean }>> = {
  person: {
    project: { type: 'attached_to', nodeIsSource: true },
    event:   { type: 'participated_in', nodeIsSource: true },
  },
  company: {
    project: { type: 'produces', nodeIsSource: true },
    event:   { type: 'held_at', nodeIsSource: false },  // event → company
  },
}

// All connection types that link to projects or events
const projectConnectionTypes = ['attached_to', 'produces']
const eventConnectionTypes = ['participated_in', 'regarding', 'held_at']

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
  connectionType: string
  linkedObjects?: LinkedObject[]
}

// --- Tag Input Component ---

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  objectClass: string
  placeholder: string
  userId: string
  autoFocus?: boolean
  onCancel?: () => void
}

function TagInput({ tags, onChange, objectClass, placeholder, userId, autoFocus: shouldAutoFocus = true, onCancel }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<{ id: string; display_name: string; is_canon: boolean }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (shouldAutoFocus) inputRef.current?.focus()
  }, [shouldAutoFocus])

  useEffect(() => {
    if (inputValue.length < 1) {
      setSuggestions([])
      return
    }

    const query = inputValue.toLowerCase().trim()
    supabase
      .from('types')
      .select('id, display_name, is_canon')
      .eq('class', objectClass)
      .ilike('display_name', `%${query}%`)
      .order('is_canon', { ascending: false })
      .order('display_name')
      .limit(8)
      .then(({ data }) => {
        if (data) {
          setSuggestions(data.filter(t => !tags.includes(t.id)))
        }
      })
  }, [inputValue, objectClass, tags])

  function addTag(typeId: string) {
    if (!tags.includes(typeId)) {
      onChange([...tags, typeId])
    }
    setInputValue('')
    setSuggestions([])
    setHighlightIndex(-1)
    inputRef.current?.focus()
  }

  function removeTag(typeId: string) {
    onChange(tags.filter(t => t !== typeId))
  }

  async function createAndAddTag(name: string) {
    const id = name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')
    if (!id || tags.includes(id)) return

    const { data: existing } = await supabase
      .from('types')
      .select('id')
      .eq('id', id)
      .maybeSingle()

    if (!existing) {
      await supabase.from('types').insert({
        id,
        display_name: name.trim(),
        class: objectClass,
        is_canon: false,
        created_by: userId,
      })
    }

    addTag(id)
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(prev => Math.min(prev + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(prev => Math.max(prev - 1, -1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (highlightIndex >= 0 && suggestions[highlightIndex]) {
        addTag(suggestions[highlightIndex].id)
      } else if (inputValue.trim()) {
        const exact = suggestions.find(s => s.display_name.toLowerCase() === inputValue.trim().toLowerCase())
        if (exact) {
          addTag(exact.id)
        } else {
          createAndAddTag(inputValue.trim())
        }
      }
    } else if (e.key === 'Backspace' && !inputValue && tags.length > 0) {
      removeTag(tags[tags.length - 1])
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel?.()
    }
  }

  return (
    <div className={styles.tagInputContainer} ref={containerRef}>
      <div className={styles.tagInputField}>
        {tags.map(t => (
          <span key={t} className={styles.tagChip}>
            {t.replace(/_/g, ' ')}
            <button className={styles.tagRemove} onClick={() => removeTag(t)} type="button">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          className={styles.tagTextInput}
          value={inputValue}
          onChange={e => {
            setInputValue(e.target.value)
            setShowSuggestions(true)
            setHighlightIndex(0)
          }}
          onFocus={() => setShowSuggestions(true)}
          onBlur={() => {
            setTimeout(() => setShowSuggestions(false), 200)
          }}
          onKeyDown={handleKeyDown}
          placeholder={tags.length === 0 ? placeholder : ''}
        />
      </div>
      {showSuggestions && suggestions.length > 0 && (
        <div className={styles.suggestions}>
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              className={`${styles.suggestion} ${i === highlightIndex ? styles.suggestionHighlight : ''}`}
              onMouseDown={() => addTag(s.id)}
              type="button"
            >
              <span>{s.display_name}</span>
              {s.is_canon && <span className={styles.canonBadge}>canon</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// --- Object Search Input (for name matching + link search) ---

interface ObjectSearchProps {
  userId: string
  targetClass?: string        // filter to a specific class (e.g. 'project')
  excludeIds?: string[]       // IDs to exclude from results
  placeholder: string
  onSelect: (obj: { id: string; name: string; class: string }) => void
  onCreateNew?: (name: string) => void  // if provided, allows creating new from typed text
  onCancel?: () => void       // called on Escape key
  autoFocus?: boolean
}

function ObjectSearch({ userId, targetClass, excludeIds = [], placeholder, onSelect, onCreateNew, onCancel, autoFocus }: ObjectSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<{ id: string; name: string; class: string; title: string | null }[]>([])
  const [showResults, setShowResults] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (query.length < 2) {
      setResults([])
      return
    }

    let q = supabase
      .from('user_objects')
      .select('id, name, class, title')
      .eq('user_id', userId)
      .ilike('name', `%${query}%`)
      .limit(8)

    if (targetClass) {
      q = q.eq('class', targetClass)
    } else {
      // For link search, show landscape objects + projects
      q = q.in('class', ['company', 'person', 'project'])
    }

    q.then(({ data }) => {
      if (data) {
        setResults(data.filter(o => !excludeIds.includes(o.id)))
        setHighlightIndex(0)
      }
    })
  }, [query, userId, targetClass, excludeIds])

  function handleKeyDown(e: React.KeyboardEvent) {
    const hasResults = results.length > 0
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(prev => Math.min(prev + 1, results.length - (onCreateNew ? 0 : 1)))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(prev => Math.max(prev - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (hasResults && highlightIndex < results.length) {
        onSelect(results[highlightIndex])
        setQuery('')
        setResults([])
      } else if (onCreateNew && query.trim()) {
        onCreateNew(query.trim())
        setQuery('')
        setResults([])
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel?.()
    }
  }

  return (
    <div className={styles.tagInputContainer}>
      <input
        ref={inputRef}
        className={styles.searchInput}
        value={query}
        onChange={e => {
          setQuery(e.target.value)
          setShowResults(true)
          setHighlightIndex(0)
        }}
        onFocus={() => setShowResults(true)}
        onBlur={() => setTimeout(() => setShowResults(false), 200)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
      />
      {showResults && (results.length > 0 || (onCreateNew && query.trim())) && (
        <div className={styles.suggestions}>
          {results.map((r, i) => (
            <button
              key={r.id}
              className={`${styles.suggestion} ${i === highlightIndex ? styles.suggestionHighlight : ''}`}
              onMouseDown={() => { onSelect(r); setQuery(''); setResults([]) }}
              type="button"
            >
              <span>{r.name}</span>
              <span className={styles.canonBadge}>{r.class}</span>
            </button>
          ))}
          {onCreateNew && query.trim() && (
            <button
              className={`${styles.suggestion} ${highlightIndex === results.length ? styles.suggestionHighlight : ''}`}
              onMouseDown={() => { onCreateNew(query.trim()); setQuery(''); setResults([]) }}
              type="button"
            >
              <span>Create "{query.trim()}"</span>
              <span className={styles.canonBadge}>new</span>
            </button>
          )}
        </div>
      )}
    </div>
  )
}

// --- Detail Panel ---

const GAP = 12
const PANEL_WIDTH = 300

export default function DetailPanel({ nodeId, object, onClose, onObjectUpdated, peerObject, preferredSide }: DetailPanelProps) {
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

  // Delete confirmation
  const [deleteConfirm, setDeleteConfirm] = useState<{
    connections: number
    orphanedProjects: number
    orphanedEvents: number
  } | null>(null)

  const placeholders = classPlaceholders[object.class] || classPlaceholders.company

  // Load connected projects/events when tab activates
  const loadConnectedItems = useCallback(async (objectId: string, targetClass: 'project' | 'event') => {
    if (!user) return

    const relevantTypes = targetClass === 'project' ? projectConnectionTypes : eventConnectionTypes

    // Query canonical connections
    const { data: canonConns } = await supabase
      .from('connections')
      .select('id, source_id, target_id, type')
      .eq('is_active', true)
      .or(`source_id.eq.${objectId},target_id.eq.${objectId}`)
      .in('type', relevantTypes)

    // Query user-created connections (existence = active, no is_active flag)
    const { data: userConns } = await supabase
      .from('connections_overrides')
      .select('id, source_id, target_id, type')
      .eq('user_id', user.id)
      .is('connection_id', null)
      .or(`source_id.eq.${objectId},target_id.eq.${objectId}`)
      .in('type', relevantTypes)

    // Also check for deactivated canonical connections (to exclude them)
    const { data: deactivated } = await supabase
      .from('connections_overrides')
      .select('connection_id')
      .eq('user_id', user.id)
      .not('connection_id', 'is', null)
      .eq('deactivated', true)

    const deactivatedIds = new Set((deactivated || []).map(d => d.connection_id))

    // Collect the "other" object IDs and their connection types
    const filteredCanon = (canonConns || []).filter(c => !deactivatedIds.has(c.id))
    const allConns = [...filteredCanon, ...(userConns || [])]
    const itemMap = new Map<string, string>()  // objectId → connectionType
    for (const c of allConns) {
      const otherId = c.source_id === objectId ? c.target_id : c.source_id
      if (otherId) itemMap.set(otherId, c.type)
    }

    if (itemMap.size === 0) {
      if (targetClass === 'project') setConnectedProjects([])
      else setConnectedEvents([])
      return
    }

    // Fetch the connected objects — try user_objects first, fall back to objects
    const ids = Array.from(itemMap.keys())
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
        connectionType: itemMap.get(o.id) || '',
      })),
      ...(fallbackObjs || []).map(o => ({
        id: o.id,
        name: o.name || '(unnamed)',
        title: o.title,
        status: o.status,
        event_date: o.event_date,
        types: [],
        connectionType: itemMap.get(o.id) || '',
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

  // Load all objects linked to a specific event/project (for expanded view)
  const loadLinkedObjects = useCallback(async (itemId: string) => {
    if (!user) return

    // Get all connections involving this item
    const { data: canonConns } = await supabase
      .from('connections')
      .select('id, source_id, target_id, type')
      .eq('is_active', true)
      .or(`source_id.eq.${itemId},target_id.eq.${itemId}`)

    const { data: userConns } = await supabase
      .from('connections_overrides')
      .select('source_id, target_id, type')
      .eq('user_id', user.id)
      .is('connection_id', null)
      .or(`source_id.eq.${itemId},target_id.eq.${itemId}`)

    const { data: deactivated } = await supabase
      .from('connections_overrides')
      .select('connection_id')
      .eq('user_id', user.id)
      .not('connection_id', 'is', null)
      .eq('deactivated', true)

    const deactivatedIds = new Set((deactivated || []).map(d => d.connection_id))
    const filteredCanon = (canonConns || []).filter(c => !deactivatedIds.has(c.id))
    const allConns = [...filteredCanon, ...(userConns || [])]
    const otherMap = new Map<string, string>()  // otherId → connectionType
    for (const c of allConns) {
      const otherId = c.source_id === itemId ? c.target_id : c.source_id
      if (otherId && otherId !== object.id) otherMap.set(otherId, c.type)
    }

    if (otherMap.size === 0) {
      setLinkedObjects([])
      return
    }

    const { data: objs } = await supabase
      .from('user_objects')
      .select('id, name, class')
      .eq('user_id', user.id)
      .in('id', Array.from(otherMap.keys()))

    // Fallback for objects not in user_objects
    const foundIds = new Set((objs || []).map(o => o.id))
    const missingIds = Array.from(otherMap.keys()).filter(id => !foundIds.has(id))
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
      ...(objs || []).map(o => ({ id: o.id, name: o.name || '(unnamed)', class: o.class, connectionType: otherMap.get(o.id) || '' })),
      ...fallback.map(o => ({ ...o, connectionType: otherMap.get(o.id) || '' })),
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
  async function linkObjectToItem(itemId: string, targetObj: { id: string; name: string; class: string }, itemClass: 'project' | 'event') {
    if (!user) return
    // Determine connection type based on what we're linking
    const config = connectionConfig[targetObj.class]?.[itemClass]
    if (!config) return

    await supabase.from('connections_overrides').insert({
      user_id: user.id,
      source_id: config.nodeIsSource ? targetObj.id : itemId,
      target_id: config.nodeIsSource ? itemId : targetObj.id,
      type: config.type,
    })

    loadLinkedObjects(itemId)
    onObjectUpdated?.()
  }

  // Link existing project to current node (feature A: name matching picked an existing project)
  async function linkExistingItem(existingId: string, targetClass: 'project' | 'event') {
    if (!user) return
    setSaving(true)

    const config = connectionConfig[object.class]?.[targetClass]
    if (config) {
      await supabase.from('connections_overrides').insert({
        user_id: user.id,
        source_id: config.nodeIsSource ? object.id : existingId,
        target_id: config.nodeIsSource ? existingId : object.id,
        type: config.type,
      })

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
    setDateInputActive(false)
    setLinkedObjects([])
    setShowLinkSearch(false)
    setNewItemLinks([])
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
    await supabase
      .from('objects_overrides')
      .update({
        name: headerValues.name.trim() || null,
        title: headerValues.title.trim() || null,
      })
      .eq('object_id', object.id)
      .eq('user_id', user.id)
    setHeaderEditing(false)
    onObjectUpdated?.()
  }

  async function saveTypes() {
    if (!user) return
    await supabase
      .from('objects_types_overrides')
      .delete()
      .eq('object_id', object.id)
      .eq('user_id', user.id)
    if (editTypes.length > 0) {
      await supabase
        .from('objects_types_overrides')
        .insert(editTypes.map(typeId => ({ user_id: user.id, object_id: object.id, type_id: typeId })))
    }
    setShowTagInput(false)
    onObjectUpdated?.()
  }

  async function saveContact() {
    if (!user) return
    const cleaned = editContacts.filter(c => c.value.trim())
    const data = { ...(object.data || {}), contacts: cleaned.length > 0 ? cleaned : undefined }
    await supabase
      .from('objects_overrides')
      .update({ data: Object.keys(data).length > 0 ? data : null })
      .eq('object_id', object.id)
      .eq('user_id', user.id)
    setContactEditing(false)
    onObjectUpdated?.()
  }

  async function saveNotes() {
    if (!user) return
    await supabase
      .from('objects_overrides')
      .update({
        shared_notes: notesValues.shared_notes.trim() || null,
        private_notes: notesValues.private_notes.trim() || null,
      })
      .eq('object_id', object.id)
      .eq('user_id', user.id)
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

    // Get canonical connections involving this object
    const { data: canonConns } = await supabase
      .from('connections')
      .select('id, source_id, target_id, type')
      .eq('is_active', true)
      .or(`source_id.eq.${object.id},target_id.eq.${object.id}`)

    // Get user-created connections involving this object
    const { data: userConns } = await supabase
      .from('connections_overrides')
      .select('id, source_id, target_id, type')
      .eq('user_id', user.id)
      .or(`source_id.eq.${object.id},target_id.eq.${object.id}`)

    // Get deactivated canonical connection IDs so we can exclude them
    const { data: deactivated } = await supabase
      .from('connections_overrides')
      .select('connection_id')
      .eq('user_id', user.id)
      .eq('deactivated', true)
      .not('connection_id', 'is', null)

    const deactivatedIds = new Set((deactivated || []).map(d => d.connection_id))

    // Only count connections where the other endpoint is on the user's landscape
    // and the connection isn't already deactivated
    const visibleCanon = (canonConns || []).filter(c => {
      if (deactivatedIds.has(c.id)) return false
      const otherId = c.source_id === object.id ? c.target_id : c.source_id
      return userObjectIds.has(otherId)
    })

    const visibleUser = (userConns || []).filter(c => {
      if (c.connection_id) return false // deactivation overrides aren't real connections
      const otherId = c.source_id === object.id ? c.target_id : c.source_id
      return userObjectIds.has(otherId)
    })

    const totalConnections = visibleCanon.length + visibleUser.length

    // Find connected off-landscape objects (projects/events) that would be orphaned
    const allConnTypes = [...projectConnectionTypes, ...eventConnectionTypes]
    const allConns = [...(canonConns || []).filter(c => !deactivatedIds.has(c.id)), ...(userConns || []).filter(c => !c.connection_id)]
    const offLandscape = allConns.filter(c => allConnTypes.includes(c.type))

    const relatedIds = new Set<string>()
    for (const c of offLandscape) {
      const otherId = c.source_id === object.id ? c.target_id : c.source_id
      relatedIds.add(otherId)
    }

    // Check which are orphans (only connected to this object)
    let orphanedProjects = 0
    let orphanedEvents = 0
    for (const relId of relatedIds) {
      const { count: otherConns } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .or(`source_id.eq.${relId},target_id.eq.${relId}`)
        .neq('source_id', object.id)
        .neq('target_id', object.id)

      const { count: otherUserConns } = await supabase
        .from('connections_overrides')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('connection_id', null)
        .or(`source_id.eq.${relId},target_id.eq.${relId}`)
        .neq('source_id', object.id)
        .neq('target_id', object.id)

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

    // 1. Delete user-created connections involving this object
    await supabase
      .from('connections_overrides')
      .delete()
      .eq('user_id', user.id)
      .or(`source_id.eq.${object.id},target_id.eq.${object.id}`)

    // 2. Deactivate canonical connections (create override with deactivated=true)
    const { data: canonConns } = await supabase
      .from('connections')
      .select('id')
      .eq('is_active', true)
      .or(`source_id.eq.${object.id},target_id.eq.${object.id}`)

    if (canonConns?.length) {
      const deactivations = canonConns.map(c => ({
        user_id: user.id,
        connection_id: c.id,
        source_id: object.id, // placeholder — not used for deactivation overrides
        target_id: object.id,
        type: 'deactivated',
        deactivated: true,
      }))
      // Upsert to avoid duplicates if override already exists
      for (const d of deactivations) {
        const { data: existing } = await supabase
          .from('connections_overrides')
          .select('id')
          .eq('user_id', user.id)
          .eq('connection_id', d.connection_id)
          .maybeSingle()

        if (existing) {
          await supabase
            .from('connections_overrides')
            .update({ deactivated: true })
            .eq('id', existing.id)
        } else {
          // Need real source/target/type from the canonical connection
          const { data: conn } = await supabase
            .from('connections')
            .select('source_id, target_id, type')
            .eq('id', d.connection_id)
            .single()

          if (conn) {
            await supabase
              .from('connections_overrides')
              .insert({
                user_id: user.id,
                connection_id: d.connection_id,
                source_id: conn.source_id,
                target_id: conn.target_id,
                type: conn.type,
                deactivated: true,
              })
          }
        }
      }
    }

    // 3. Clean up orphaned off-landscape objects
    const allConnTypes = [...projectConnectionTypes, ...eventConnectionTypes]
    const { data: offConns } = await supabase
      .from('connections')
      .select('source_id, target_id')
      .eq('is_active', true)
      .or(`source_id.eq.${object.id},target_id.eq.${object.id}`)
      .in('type', allConnTypes)

    const { data: offUserConns } = await supabase
      .from('connections_overrides')
      .select('source_id, target_id')
      .eq('user_id', user.id)
      .is('connection_id', null)
      .or(`source_id.eq.${object.id},target_id.eq.${object.id}`)
      .in('type', allConnTypes)

    const orphanCandidates = new Set<string>()
    for (const c of [...(offConns || []), ...(offUserConns || [])]) {
      orphanCandidates.add(c.source_id === object.id ? c.target_id : c.source_id)
    }

    for (const orphanId of orphanCandidates) {
      // Delete connections to this orphan that go through our object
      // (already deleted above via user connections + deactivated canonical)
      // Check if truly orphaned now
      const { count: remaining } = await supabase
        .from('connections')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .or(`source_id.eq.${orphanId},target_id.eq.${orphanId}`)
        .neq('source_id', object.id)
        .neq('target_id', object.id)

      const { count: remainingUser } = await supabase
        .from('connections_overrides')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .is('connection_id', null)
        .or(`source_id.eq.${orphanId},target_id.eq.${orphanId}`)
        .neq('source_id', object.id)
        .neq('target_id', object.id)

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

    // 4. Delete the override (removes from user's landscape)
    await supabase
      .from('objects_overrides')
      .delete()
      .eq('object_id', object.id)
      .eq('user_id', user.id)

    // 5. If user-created, hard-delete the objects row too
    if (!object.is_canon && object.created_by === user.id) {
      await supabase.from('objects').delete().eq('id', object.id)
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
    await supabase.from('objects_overrides').insert(overridePayload)

    // 3. Create types overrides
    if (newItemTypes.length > 0) {
      await supabase
        .from('objects_types_overrides')
        .insert(newItemTypes.map(typeId => ({ user_id: user.id, object_id: newObj.id, type_id: typeId })))
    }

    // 4. Create connection to current node
    const config = connectionConfig[object.class]?.[targetClass]
    if (config) {
      await supabase.from('connections_overrides').insert({
        user_id: user.id,
        source_id: config.nodeIsSource ? object.id : newObj.id,
        target_id: config.nodeIsSource ? newObj.id : object.id,
        type: config.type,
      })
    }

    // 5. Create additional connections from the link picker
    for (const link of newItemLinks) {
      const linkConfig = connectionConfig[link.class]?.[targetClass]
      if (linkConfig) {
        await supabase.from('connections_overrides').insert({
          user_id: user.id,
          source_id: linkConfig.nodeIsSource ? link.id : newObj.id,
          target_id: linkConfig.nodeIsSource ? newObj.id : link.id,
          type: linkConfig.type,
        })
      }
    }

    // Reset and reload
    setSaving(false)
    setNewItemValues({ name: '', title: '', status: '', event_date: '' })
    setNewItemTypes([])
    setNewItemLinks([])
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
      await supabase
        .from('objects_types_overrides')
        .insert(editItemTypes.map(typeId => ({ user_id: user.id, object_id: itemId, type_id: typeId })))
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
      .or(`and(source_id.eq.${object.id},target_id.eq.${itemId}),and(source_id.eq.${itemId},target_id.eq.${object.id})`)

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
      .or(`and(source_id.eq.${object.id},target_id.eq.${itemId}),and(source_id.eq.${itemId},target_id.eq.${object.id})`)

    // Check if the item has any remaining connections for this user
    // Canonical connections not deactivated by this user
    const { data: allCanonConns } = await supabase
      .from('connections')
      .select('id')
      .eq('is_active', true)
      .or(`source_id.eq.${itemId},target_id.eq.${itemId}`)

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
      .or(`source_id.eq.${itemId},target_id.eq.${itemId}`)

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

  // Escape to close panel when nothing is being edited
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== 'Escape') return
      if (headerEditing || showTagInput || contactEditing || notesEditing || creatingProject || creatingEvent || editingItemId || showLinkSearch) return
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [headerEditing, showTagInput, contactEditing, notesEditing, creatingProject, creatingEvent, editingItemId, showLinkSearch, onClose])

  // Off-screen detection
  const nodeOffScreen = !nodeRect ||
    nodeRect.bottom < 0 || nodeRect.top > window.innerHeight ||
    nodeRect.right < 0 || nodeRect.left > window.innerWidth

  const [dateInputActive, setDateInputActive] = useState(false)

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
            onCancel={() => {
              setCreatingEvent(false)
              setNewItemValues({ name: '', title: '', status: '', event_date: '' })
              setNewItemTypes([])
              setNewItemLinks([])
              setDateInputActive(false)
            }}
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
            onCancel={() => {
              setCreatingProject(false)
              setNewItemValues({ name: '', title: '', status: '', event_date: '' })
              setNewItemTypes([])
              setNewItemLinks([])
            }}
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
                setNewItemValues({ name: '', title: '', status: '', event_date: '' })
                setNewItemTypes([])
                setNewItemLinks([])
                setDateInputActive(false)
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
              setNewItemValues({ name: '', title: '', status: '', event_date: '' })
              setNewItemTypes([])
              setNewItemLinks([])
              setDateInputActive(false)
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
                  <input
                    className={styles.createInput}
                    type="date"
                    value={newItemValues.event_date}
                    onChange={e => setNewItemValues(prev => ({ ...prev, event_date: e.target.value }))}
                    autoFocus={dateInputActive && !newItemValues.event_date}
                  />
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
              placeholder="Link to another person, company, or project..."
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
                  setNewItemValues({ name: '', title: '', status: '', event_date: '' })
                  setNewItemTypes([])
                  setNewItemLinks([])
                  setDateInputActive(false)
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
                      placeholder="Link to person, company, or project..."
                      onSelect={obj => linkObjectToItem(item.id, obj, targetClass)}
                      autoFocus
                    />
                  ) : null}

                  <div className={styles.itemActions}>
                    <button
                      className={styles.iconButtonSm}
                      onClick={() => setShowLinkSearch(!showLinkSearch)}
                      title="Link to another object"
                    >
                      <Link size={11} />
                    </button>
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
                      title="Edit"
                    >
                      <Pencil size={11} />
                    </button>
                    <button
                      className={styles.iconButtonSmDanger}
                      onClick={() => deleteConnectedItem(item.id, targetClass)}
                      title="Remove"
                    >
                      <X size={11} />
                    </button>
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
                    <input
                      className={styles.createInput}
                      type="date"
                      value={editItemValues.event_date}
                      onChange={e => setEditItemValues(prev => ({ ...prev, event_date: e.target.value }))}
                    />
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
    <div ref={panelRef} className={styles.panel} style={{ left: pos.left, top: pos.top, width: PANEL_WIDTH, visibility: nodeOffScreen ? 'hidden' : 'visible' } as CSSProperties}>
      {/* ===== HEADER ===== */}
      <div className={styles.header}>
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
            {showTagInput ? (
              <button className={styles.iconButtonSm} onClick={saveTypes} title="Save types">
                <Check size={12} />
              </button>
            ) : (
              <button className={styles.iconButtonSm} onClick={() => { setEditTypes(object.types || []); setShowTagInput(true) }} title="Edit types">
                <Plus size={12} />
              </button>
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
              <button className={styles.iconButton} onClick={saveHeader} title="Save">
                <Check size={14} />
              </button>
              <button className={styles.iconButton} onClick={() => { setHeaderValues({ name: object.name || '', title: object.title || '' }); setHeaderEditing(false) }} title="Cancel">
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <button className={styles.iconButton} onClick={() => setHeaderEditing(true)} title="Edit name & title">
                <Pencil size={12} />
              </button>
              <button className={styles.iconButton} onClick={initiateDelete} title="Remove from landscape">
                <Trash2 size={12} />
              </button>
              <button className={styles.iconButton} onClick={onClose} title="Close">
                <X size={14} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* ===== TAB BAR ===== */}
      <div className={styles.tabBar}>
        {tabs.map(tab => (
          <button
            key={tab.id}
            className={`${styles.tabButton} ${activeTab === tab.id ? styles.tabActive : ''}`}
            onClick={() => setActiveTab(tab.id)}
            title={tab.label}
          >
            <tab.Icon size={16} />
          </button>
        ))}
      </div>

      {/* ===== TAB CONTENT ===== */}
      <div className={styles.tabContent}>
        {/* CONTACT TAB */}
        {activeTab === 'contact' && (
          <div className={styles.tabSection}>
            <div className={styles.tabSectionHeader}>
              <h3 className={styles.tabHeading}>Contact Info</h3>
              {contactEditing ? (
                <>
                  <button className={styles.iconButtonSm} onClick={saveContact} title="Save"><Check size={12} /></button>
                  <button className={styles.iconButtonSm} onClick={() => {
                    setEditContacts(object.data?.contacts ?? [])
                    setContactEditing(false)
                  }} title="Cancel"><X size={12} /></button>
                </>
              ) : (
                <button className={styles.iconButtonSm} onClick={() => {
                  setEditContacts(object.data?.contacts ?? [])
                  setContactEditing(true)
                }} title="Edit contact info">
                  <Pencil size={12} />
                </button>
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
                    <button
                      className={styles.iconButtonSm}
                      onClick={() => setEditContacts(prev => prev.filter((_, j) => j !== i))}
                      title="Remove"
                    >
                      <X size={10} />
                    </button>
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
                {!(object.data?.contacts?.length) && (
                  <span className={styles.emptyState}>No contact info</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* NOTES TAB */}
        {activeTab === 'notes' && (
          <div className={styles.tabSection}>
            <div className={styles.tabSectionHeader}>
              <h3 className={styles.tabHeading}>Notes</h3>
              {notesEditing ? (
                <>
                  <button className={styles.iconButtonSm} onClick={saveNotes} title="Save"><Check size={12} /></button>
                  <button className={styles.iconButtonSm} onClick={() => {
                    setNotesValues({ shared_notes: object.shared_notes || '', private_notes: object.private_notes || '' })
                    setNotesEditing(false)
                  }} title="Cancel"><X size={12} /></button>
                </>
              ) : (
                <button className={styles.iconButtonSm} onClick={() => setNotesEditing(true)} title="Edit notes">
                  <Pencil size={12} />
                </button>
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
                {!object.shared_notes && !object.private_notes && (
                  <span className={styles.emptyState}>No notes</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* PROJECTS TAB */}
        {activeTab === 'projects' && (
          <div className={styles.tabSection}>
            <div className={styles.tabSectionHeader}>
              <h3 className={styles.tabHeading}>Projects</h3>
              {!creatingProject && (
                <button className={styles.iconButtonSm} onClick={() => {
                  setNewItemValues({ name: '', title: '', status: '', event_date: '' })
                  setNewItemTypes([])
                  setCreatingProject(true)
                }} title="Add project">
                  <Plus size={12} />
                </button>
              )}
            </div>
            {creatingProject && renderCreateForm('project')}
            {renderItemList(connectedProjects, 'project')}
          </div>
        )}

        {/* EVENTS TAB */}
        {activeTab === 'events' && (
          <div className={styles.tabSection}>
            <div className={styles.tabSectionHeader}>
              <h3 className={styles.tabHeading}>Events</h3>
              {!creatingEvent && (
                <button className={styles.iconButtonSm} onClick={() => {
                  setNewItemValues({ name: '', title: '', status: '', event_date: '' })
                  setNewItemTypes([])
                  setCreatingEvent(true)
                }} title="Add event">
                  <Plus size={12} />
                </button>
              )}
            </div>
            {creatingEvent && renderCreateForm('event')}
            {renderItemList(connectedEvents, 'event')}
          </div>
        )}
      </div>

      {/* Dual-select relationship action */}
      {peerObject && (
        <div className={styles.relationshipAction}>
          <button className={styles.relationshipButton}>
            &#x2194; Link to {peerObject.name}
          </button>
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
