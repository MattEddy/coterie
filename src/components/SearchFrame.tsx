import { useState, useEffect, useRef } from 'react'
import { Search } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Frame from './Frame'
import styles from './SearchFrame.module.css'

interface SearchResult {
  id: string
  name: string
  class: string
  types: string[]
  title: string | null
}

interface SearchFrameProps {
  onClose: () => void
  onSelectResult: (nodeId: string) => void
}

export default function SearchFrame({ onClose, onSelectResult }: SearchFrameProps) {
  const { user } = useAuth()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Reset highlight when results change
  useEffect(() => {
    setHighlightIndex(0)
  }, [results])

  useEffect(() => {
    if (!query.trim() || !user) {
      setResults([])
      return
    }

    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('user_objects')
        .select('id, name, class, types, title')
        .eq('user_id', user.id)
        .in('class', ['org', 'person'])
        .ilike('name', `%${query}%`)
        .order('name')
        .limit(20)

      if (data) setResults(data)
    }, 200)

    return () => clearTimeout(timer)
  }, [query, user])

  return (
    <Frame title="Search" titleTooltip="Find and zoom to objects on your Landscape" onClose={onClose} initialPosition={{ x: 60, y: 60 }} width={300} persistKey="search">
      <div className={styles.searchInput}>
        <Search size={14} className={styles.searchIcon} />
        <input
          ref={inputRef}
          type="text"
          placeholder="Search your landscape..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Escape') {
              e.preventDefault()
              if (query) {
                setQuery('')
              } else {
                onClose()
              }
            } else if (e.key === 'ArrowDown') {
              e.preventDefault()
              setHighlightIndex(i => Math.min(i + 1, results.length - 1))
            } else if (e.key === 'ArrowUp') {
              e.preventDefault()
              setHighlightIndex(i => Math.max(i - 1, 0))
            } else if (e.key === 'Enter' && results.length > 0) {
              e.preventDefault()
              onSelectResult(results[highlightIndex].id)
            }
          }}
          autoComplete="off"
        />
      </div>

      <div className={styles.results}>
        {results.map((r, i) => (
          <button
            key={r.id}
            className={`${styles.result} ${i === highlightIndex ? styles.resultHighlighted : ''}`}
            onClick={() => onSelectResult(r.id)}
            onMouseEnter={() => setHighlightIndex(i)}
          >
            <span className={styles.classDot} data-class={r.class} />
            <div className={styles.resultInfo}>
              <span className={styles.resultName}>{r.name}</span>
              {r.title && <span className={styles.resultTitle}>{r.title}</span>}
            </div>
            {r.types.length > 0 && (
              <span className={styles.resultTypes}>
                {r.types.map(t => t.replace(/_/g, ' ')).join(' · ')}
              </span>
            )}
          </button>
        ))}
        {query.trim() && results.length === 0 && (
          <div className={styles.empty}>No results</div>
        )}
      </div>
    </Frame>
  )
}
