import { useState, useEffect, useLayoutEffect, useRef, useCallback, useMemo, type CSSProperties } from 'react'
import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { Pencil, Check, X, Phone, FileText, Clipboard, Calendar, Plus } from 'lucide-react'
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
  company: 'e.g. studio, streamer, agency...',
  person:  'e.g. executive, producer, creative...',
  project: 'e.g. feature, tv series, documentary...',
  event:   'e.g. meeting, call, pitch...',
}

const contactTypes = ['phone', 'email', 'url', 'address', 'social']

const emptyContact = (): ContactEntry => ({ type: 'phone', label: '', value: '' })

// --- Tag Input Component ---

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  objectClass: string
  placeholder: string
  userId: string
}

function TagInput({ tags, onChange, objectClass, placeholder, userId }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<{ id: string; display_name: string; is_canon: boolean }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

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
            setHighlightIndex(-1)
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

  const placeholders = classPlaceholders[object.class] || classPlaceholders.company

  // Reset all state when object changes
  useEffect(() => {
    setHeaderEditing(false)
    setShowTagInput(false)
    setContactEditing(false)
    setNotesEditing(false)
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
  }, [nodeRect, activeTab, headerEditing, contactEditing, notesEditing, showTagInput, object.id])

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
    // Filter out empty entries
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

  // Off-screen detection
  const nodeOffScreen = !nodeRect ||
    nodeRect.bottom < 0 || nodeRect.top > window.innerHeight ||
    nodeRect.right < 0 || nodeRect.left > window.innerWidth

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
            </div>
            <span className={styles.emptyState}>No projects yet</span>
          </div>
        )}

        {/* EVENTS TAB */}
        {activeTab === 'events' && (
          <div className={styles.tabSection}>
            <div className={styles.tabSectionHeader}>
              <h3 className={styles.tabHeading}>Events</h3>
            </div>
            <span className={styles.emptyState}>No events yet</span>
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
    </div>
  )
}
