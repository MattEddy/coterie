import { useState, useEffect, useLayoutEffect, useRef, type CSSProperties } from 'react'
import { Pencil, Check, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import type { ObjectNodeData } from './ObjectNode'
import styles from './DetailPanel.module.css'

interface NodeRect {
  left: number
  top: number
  right: number
  bottom: number
}

interface DetailPanelProps {
  object: ObjectNodeData
  nodeRect: NodeRect
  onClose: () => void
  onObjectUpdated?: () => void
  peerObject?: ObjectNodeData
}

const readFields: { key: string; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'phone', label: 'Phone' },
  { key: 'phone_2', label: 'Phone 2' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'address', label: 'Address' },
]

// Class-specific placeholders for the top fields
const classPlaceholders: Record<string, { name: string; title: string; status: string }> = {
  company: { name: 'Company Name', title: 'Description', status: 'Status' },
  person:  { name: 'Name (First Last)', title: 'Title', status: 'Status' },
  project: { name: 'Project Name', title: 'Description', status: 'e.g. Development, Production' },
}

const typeTagPlaceholders: Record<string, string> = {
  company: 'e.g. studio, streamer, agency...',
  person:  'e.g. executive, producer, creative...',
  project: 'e.g. feature, tv series, documentary...',
}

interface EditFieldDef {
  key: string
  label: string
  placeholder: string
  type: 'text' | 'textarea'
  group: string
}

const contactFields: EditFieldDef[] = [
  { key: 'phone', label: 'Phone', placeholder: 'Phone', type: 'text', group: 'Contact' },
  { key: 'phone_2', label: 'Phone 2', placeholder: 'Phone 2', type: 'text', group: 'Contact' },
  { key: 'email', label: 'Email', placeholder: 'Email', type: 'text', group: 'Contact' },
  { key: 'website', label: 'Website', placeholder: 'Website URL', type: 'text', group: 'Contact' },
  { key: 'address', label: 'Address', placeholder: 'Address', type: 'text', group: 'Contact' },
]

const mediaFields: EditFieldDef[] = [
  { key: 'photo_url', label: 'Photo URL', placeholder: 'Photo URL', type: 'text', group: 'Media' },
]

const notesFields: EditFieldDef[] = [
  { key: 'shared_notes', label: 'Shared Notes', placeholder: 'Notes visible to your coterie...', type: 'textarea', group: 'Notes' },
  { key: 'private_notes', label: 'Private Notes', placeholder: 'Private notes (never shared)...', type: 'textarea', group: 'Notes' },
]

type EditValues = Record<string, string>

function getEditValues(obj: ObjectNodeData): EditValues {
  const keys = ['name', 'title', 'status', 'phone', 'phone_2', 'email', 'website', 'address', 'photo_url', 'shared_notes', 'private_notes']
  const values: EditValues = {}
  for (const k of keys) {
    values[k] = (obj[k] as string) ?? ''
  }
  return values
}

// --- Tag Input Component ---

interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  objectClass: string
  placeholder: string
}

function TagInput({ tags, onChange, objectClass, placeholder }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<{ id: string; display_name: string; is_canon: boolean }[]>([])
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [highlightIndex, setHighlightIndex] = useState(-1)
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

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
          // Filter out types already added
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

    // Check if this type already exists
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
        // Check if input matches an existing suggestion exactly
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
            // Delay to allow click on suggestion
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
const READ_WIDTH = 280
const EDIT_WIDTH = 320

export default function DetailPanel({ object, nodeRect, onClose, onObjectUpdated, peerObject }: DetailPanelProps) {
  const { user } = useAuth()
  const panelRef = useRef<HTMLDivElement>(null)
  const [isEditing, setIsEditing] = useState(false)
  const [editValues, setEditValues] = useState<EditValues>(() => getEditValues(object))
  const [editTypes, setEditTypes] = useState<string[]>(object.types || [])
  const [saving, setSaving] = useState(false)
  const [pos, setPos] = useState({ left: 0, top: 0 })
  const readTopRef = useRef(0)

  const placeholders = classPlaceholders[object.class] || classPlaceholders.company
  const panelWidth = isEditing ? EDIT_WIDTH : READ_WIDTH

  // Single positioning effect — measures real DOM, runs before paint
  useLayoutEffect(() => {
    const el = panelRef.current
    if (!el) return

    const vw = window.innerWidth
    const vh = window.innerHeight
    const nodeCenterY = (nodeRect.top + nodeRect.bottom) / 2
    const w = isEditing ? EDIT_WIDTH : READ_WIDTH
    const h = el.scrollHeight

    // Horizontal: open toward whichever side has more room
    const left = (vw - nodeRect.right) >= nodeRect.left
      ? nodeRect.right + GAP
      : nodeRect.left - w - GAP

    let top: number
    if (!isEditing) {
      // Proportional anchor: ratio 0 at top (grow down), 1 at bottom (grow up)
      const anchorRatio = Math.max(0, Math.min(1, nodeCenterY / vh))
      top = nodeCenterY - (h * anchorRatio)
      top = Math.max(GAP, Math.min(top, vh - h - GAP))
      readTopRef.current = top
    } else {
      // Keep read-mode top, push up minimum needed to fit on screen
      top = Math.min(readTopRef.current, vh - h - GAP)
      top = Math.max(GAP, top)
    }

    setPos({ left, top })
  }, [nodeRect, isEditing, object.id])

  // Reset edit state when the selected object changes
  useEffect(() => {
    setIsEditing(false)
    setEditValues(getEditValues(object))
    setEditTypes(object.types || [])
  }, [object.id])

  function handleEdit() {
    setEditValues(getEditValues(object))
    setEditTypes(object.types || [])
    setIsEditing(true)
  }

  function handleCancel() {
    setEditValues(getEditValues(object))
    setEditTypes(object.types || [])
    setIsEditing(false)
  }

  async function handleSave() {
    if (!user) return
    setSaving(true)

    const payload: Record<string, string | null> = {}
    const keys = ['name', 'title', 'status', 'phone', 'phone_2', 'email', 'website', 'address', 'photo_url', 'shared_notes', 'private_notes']
    for (const k of keys) {
      payload[k] = editValues[k]?.trim() || null
    }

    await supabase
      .from('objects_overrides')
      .update(payload)
      .eq('object_id', object.id)
      .eq('user_id', user.id)

    await supabase
      .from('objects_types')
      .delete()
      .eq('object_id', object.id)

    if (editTypes.length > 0) {
      await supabase
        .from('objects_types')
        .insert(editTypes.map(typeId => ({ object_id: object.id, type_id: typeId })))
    }

    setSaving(false)
    setIsEditing(false)
    onObjectUpdated?.()
  }

  function handleChange(key: string, value: string) {
    setEditValues(prev => ({ ...prev, [key]: value }))
  }

  const panelClass = `${styles.panel} ${isEditing ? styles.editing : ''}`

  const fieldGroups = [
    { name: 'Contact', fields: contactFields },
    { name: 'Media', fields: mediaFields },
    { name: 'Notes', fields: notesFields },
  ]

  return (
    <div ref={panelRef} className={panelClass} style={{ left: pos.left, top: pos.top, width: panelWidth } as CSSProperties}>
      <div className={styles.header}>
        {isEditing ? (
          <input
            className={styles.nameInput}
            value={editValues.name}
            onChange={e => handleChange('name', e.target.value)}
            placeholder={placeholders.name}
            autoFocus
          />
        ) : (
          <h2 className={styles.name}>{object.name}</h2>
        )}
        <div className={styles.headerActions}>
          {isEditing ? (
            <>
              <button className={styles.iconButton} onClick={handleSave} title="Save" disabled={saving}>
                <Check size={16} />
              </button>
              <button className={styles.iconButton} onClick={handleCancel} title="Cancel">
                <X size={16} />
              </button>
            </>
          ) : (
            <>
              <button className={styles.iconButton} onClick={handleEdit} title="Edit">
                <Pencil size={14} />
              </button>
              <button className={styles.iconButton} onClick={onClose} title="Close">
                <X size={16} />
              </button>
            </>
          )}
        </div>
      </div>

      {!isEditing && (
        <>
          <div className={styles.types}>
            {object.types.map(t => (
              <span key={t} className={styles.type}>{t.replace(/_/g, ' ')}</span>
            ))}
          </div>

          <div className={styles.fields}>
            {readFields.map(f => {
              const value = object[f.key]
              if (!value) return null
              return (
                <div key={f.key} className={styles.field}>
                  <span className={styles.label}>{f.label}</span>
                  <span className={styles.value}>{String(value)}</span>
                </div>
              )
            })}
          </div>

          {object.shared_notes && (
            <div className={styles.notes}>
              <span className={styles.label}>Notes</span>
              <p className={styles.noteText}>{object.shared_notes}</p>
            </div>
          )}

          {object.private_notes && (
            <div className={styles.notes}>
              <span className={styles.label}>Private Notes</span>
              <p className={styles.noteText}>{object.private_notes}</p>
            </div>
          )}

          {peerObject && (
            <div className={styles.relationshipAction}>
              <button className={styles.relationshipButton}>
                &#x2194; Link to {peerObject.name}
              </button>
            </div>
          )}
        </>
      )}

      {isEditing && (
        <div className={styles.editBody}>
          {/* Top fields — no group label, no field labels, just placeholders */}
          <div className={styles.topFields}>
            <input
              className={styles.editInput}
              value={editValues.title}
              onChange={e => handleChange('title', e.target.value)}
              placeholder={placeholders.title}
            />
            {object.class === 'project' && (
              <input
                className={styles.editInput}
                value={editValues.status}
                onChange={e => handleChange('status', e.target.value)}
                placeholder={placeholders.status}
              />
            )}
          </div>

          {/* Type tags */}
          <div className={styles.editField}>
            <TagInput
              tags={editTypes}
              onChange={setEditTypes}
              objectClass={object.class}
              placeholder={typeTagPlaceholders[object.class] || 'Add types...'}
            />
          </div>

          {/* Labeled field groups */}
          {fieldGroups.map(group => (
            <div key={group.name} className={styles.fieldGroup}>
              <span className={styles.groupLabel}>{group.name}</span>
              {group.fields.map(f => (
                <div key={f.key} className={styles.editField}>
                  <label className={styles.label}>{f.label}</label>
                  {f.type === 'textarea' ? (
                    <textarea
                      className={styles.editTextarea}
                      value={editValues[f.key]}
                      onChange={e => handleChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                      rows={3}
                    />
                  ) : (
                    <input
                      className={styles.editInput}
                      value={editValues[f.key]}
                      onChange={e => handleChange(f.key, e.target.value)}
                      placeholder={f.placeholder}
                    />
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
