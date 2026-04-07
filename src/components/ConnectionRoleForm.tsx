import { useState, useRef, useEffect, useCallback } from 'react'
import { Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import styles from './ConnectionRoleForm.module.css'

interface RoleOption {
  id: string
  display_name: string
  is_canon: boolean
  created_by: string | null
}

interface ConnectionRoleFormProps {
  objectA: { id: string; name: string; class: string }
  objectB: { id: string; name: string; class: string }
  userId: string
  screenPosition: { x: number; y: number }
  onSubmit: (roleA: string | null, roleB: string | null) => void
  onDelete?: () => void
  onCancel: () => void
  initialRoleA?: string
  initialRoleB?: string
}

function RoleInput({ userId, value, onChange, onSubmit, autoFocus }: {
  userId: string
  value: string
  onChange: (val: string) => void
  onSubmit: () => void
  autoFocus?: boolean
}) {
  const [suggestions, setSuggestions] = useState<RoleOption[]>([])
  const [highlightIndex, setHighlightIndex] = useState(0)
  const [showSuggestions, setShowSuggestions] = useState(false)
  const [isTyping, setIsTyping] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!isTyping) return

    async function load() {
      if (!value.trim()) {
        setSuggestions([])
        setShowSuggestions(false)
        return
      }

      const { data } = await supabase
        .from('roles')
        .select('id, display_name, is_canon, created_by')
        .ilike('display_name', `%${value}%`)
        .or(`is_canon.eq.true,created_by.eq.${userId}`)
        .order('is_canon', { ascending: false })
        .limit(8)

      const results = data || []
      setSuggestions(results)
      setHighlightIndex(0)
      setShowSuggestions(results.length > 0)
    }
    load()
  }, [value, userId, isTyping])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex(i => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (showSuggestions && suggestions.length > 0) {
        onChange(suggestions[highlightIndex].display_name)
        setShowSuggestions(false)
        setIsTyping(false)
      } else {
        onSubmit()
      }
    } else if (e.key === 'Tab') {
      if (showSuggestions && suggestions.length > 0) {
        e.preventDefault()
        onChange(suggestions[highlightIndex].display_name)
        setShowSuggestions(false)
        setIsTyping(false)
      }
    }
  }

  return (
    <div className={styles.roleInputWrapper}>
      <input
        ref={inputRef}
        className={styles.roleInput}
        type="text"
        placeholder="Role (optional)"
        value={value}
        onChange={e => { setIsTyping(true); onChange(e.target.value) }}
        onKeyDown={handleKeyDown}
        onFocus={() => value.trim() && suggestions.length > 0 && setShowSuggestions(true)}
        onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
        autoComplete="off"
      />
      {showSuggestions && (
        <div className={styles.suggestions}>
          {suggestions.map((s, i) => (
            <button
              key={s.id}
              className={`${styles.suggestion} ${i === highlightIndex ? styles.highlighted : ''}`}
              onMouseDown={e => { e.preventDefault(); setIsTyping(false); onChange(s.display_name); setShowSuggestions(false) }}
              onMouseEnter={() => setHighlightIndex(i)}
              type="button"
            >
              <span>{s.display_name}</span>
              {!s.is_canon && s.created_by === userId && (
                <span
                  className={styles.deleteRole}
                  onMouseDown={async e => {
                    e.stopPropagation()
                    e.preventDefault()
                    const { error } = await supabase.from('roles').delete().eq('id', s.id)
                    if (!error) setSuggestions(prev => prev.filter(r => r.id !== s.id))
                  }}
                  title="Delete this role"
                >
                  <Trash2 size={10} />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default function ConnectionRoleForm({ objectA, objectB, userId, screenPosition, onSubmit, onDelete, onCancel, initialRoleA, initialRoleB }: ConnectionRoleFormProps) {
  const [roleA, setRoleA] = useState(initialRoleA || '')
  const [roleB, setRoleB] = useState(initialRoleB || '')
  const isEditing = !!(initialRoleA || initialRoleB || onDelete)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleSubmit = useCallback(() => {
    onSubmit(roleA.trim() || null, roleB.trim() || null)
  }, [roleA, roleB, onSubmit])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    }
  }, [onCancel])

  // Clamp position
  const formWidth = 300
  const formHeight = 120
  const x = Math.min(Math.max(12, screenPosition.x - formWidth / 2), window.innerWidth - formWidth - 12)
  const y = Math.min(Math.max(12, screenPosition.y - formHeight / 2), window.innerHeight - formHeight - 12)

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{ left: x, top: y }}
      onKeyDown={handleKeyDown}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className={styles.row}>
        <span className={styles.objectName}>{objectA.name}</span>
        <RoleInput
          userId={userId}
          value={roleA}
          onChange={setRoleA}
          onSubmit={handleSubmit}
          autoFocus
        />
      </div>
      <div className={styles.divider} />
      <div className={styles.row}>
        <span className={styles.objectName}>{objectB.name}</span>
        <RoleInput
          userId={userId}
          value={roleB}
          onChange={setRoleB}
          onSubmit={handleSubmit}
        />
      </div>
      <div className={styles.actions}>
        {onDelete && (
          <button className={styles.deleteBtn} onClick={onDelete} type="button">Delete</button>
        )}
        <div className={styles.actionsSpacer} />
        <button className={styles.cancelBtn} onClick={onCancel} type="button">Cancel</button>
        <button className={styles.connectBtn} onClick={handleSubmit} type="button">{isEditing ? 'Save' : 'Connect'}</button>
      </div>
    </div>
  )
}
