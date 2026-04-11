import { useState, useEffect, useRef } from 'react'
import { supabase } from '../lib/supabase'
import styles from './DetailPanel.module.css'

export interface ObjectSearchProps {
  userId: string
  targetClass?: string
  excludeIds?: string[]
  placeholder: string
  onSelect: (obj: { id: string; name: string; class: string }) => void
  onCreateNew?: (name: string) => void
  onCancel?: () => void
  onChange?: (value: string) => void
  autoFocus?: boolean
}

export default function ObjectSearch({ userId, targetClass, excludeIds = [], placeholder, onSelect, onCreateNew, onCancel, onChange, autoFocus }: ObjectSearchProps) {
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
      q = q.in('class', ['org', 'person', 'project'])
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
          onChange?.(e.target.value)
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
