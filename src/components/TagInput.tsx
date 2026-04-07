import { useState, useEffect, useRef } from 'react'
import { X, Trash2 } from 'lucide-react'
import { supabase } from '../lib/supabase'
import styles from './DetailPanel.module.css'

export interface TagInputProps {
  tags: string[]
  onChange: (tags: string[]) => void
  objectClass: string
  placeholder: string
  userId: string
  autoFocus?: boolean
  onCancel?: () => void
}

export default function TagInput({ tags, onChange, objectClass, placeholder, userId, autoFocus: shouldAutoFocus = true, onCancel }: TagInputProps) {
  const [inputValue, setInputValue] = useState('')
  const [suggestions, setSuggestions] = useState<{ id: string; display_name: string; is_canon: boolean; created_by: string | null }[]>([])
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
      .select('id, display_name, is_canon, created_by')
      .eq('class', objectClass)
      .ilike('display_name', `%${query}%`)
      .or(`is_canon.eq.true,created_by.eq.${userId}`)
      .order('is_canon', { ascending: false })
      .order('display_name')
      .limit(8)
      .then(({ data }) => {
        if (data) {
          setSuggestions(data.filter(t => !tags.includes(t.display_name)))
        }
      })
  }, [inputValue, objectClass, tags, userId])

  function addTag(displayName: string) {
    if (!tags.includes(displayName)) {
      onChange([...tags, displayName])
    }
    setInputValue('')
    setSuggestions([])
    setHighlightIndex(-1)
    inputRef.current?.focus()
  }

  function removeTag(displayName: string) {
    onChange(tags.filter(t => t !== displayName))
  }

  async function deleteType(typeId: string) {
    const { error } = await supabase.from('types').delete().eq('id', typeId)
    if (error) {
      console.error('Failed to delete type (may be in use):', error)
      return
    }
    setSuggestions(prev => prev.filter(s => s.id !== typeId))
  }

  async function createAndAddTag(name: string) {
    const trimmed = name.trim()
    if (!trimmed || trimmed.length < 2 || tags.includes(trimmed)) return

    const { data: existing } = await supabase
      .from('types')
      .select('id')
      .eq('display_name', trimmed)
      .eq('class', objectClass)
      .maybeSingle()

    if (!existing) {
      await supabase.from('types').insert({
        display_name: trimmed,
        class: objectClass,
        is_canon: false,
        created_by: userId,
      })
    }

    addTag(trimmed)
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
        addTag(suggestions[highlightIndex].display_name)
      } else if (inputValue.trim()) {
        const exact = suggestions.find(s => s.display_name.toLowerCase() === inputValue.trim().toLowerCase())
        if (exact) {
          addTag(exact.display_name)
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
            {t}
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
              onMouseDown={() => addTag(s.display_name)}
              type="button"
            >
              <span>{s.display_name}</span>
              <span className={styles.suggestionActions}>
                {s.is_canon && <span className={styles.canonBadge}>canon</span>}
                {!s.is_canon && s.created_by === userId && (
                  <span
                    className={styles.deleteType}
                    onMouseDown={e => { e.stopPropagation(); deleteType(s.id) }}
                    title="Delete this type"
                  >
                    <Trash2 size={10} />
                  </span>
                )}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
