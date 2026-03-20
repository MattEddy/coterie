import { useState, useRef, useEffect, useCallback } from 'react'
import styles from './CreateObjectForm.module.css'

interface CreateObjectFormProps {
  screenPosition: { x: number; y: number }
  onSubmit: (className: string, name: string) => void
  onCancel: () => void
}

export default function CreateObjectForm({ screenPosition, onSubmit, onCancel }: CreateObjectFormProps) {
  const [selectedClass, setSelectedClass] = useState<'person' | 'org'>('person')
  const [name, setName] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.stopPropagation()
      onCancel()
    } else if (e.key === 'Enter' && name.trim()) {
      e.preventDefault()
      onSubmit(selectedClass, name.trim())
    } else if (e.key === 'Tab') {
      e.preventDefault()
      setSelectedClass(prev => prev === 'person' ? 'org' : 'person')
    }
  }, [name, selectedClass, onSubmit, onCancel])

  // Clamp position so the form doesn't overflow the viewport
  const formWidth = 220
  const formHeight = 115
  const x = Math.min(screenPosition.x, window.innerWidth - formWidth - 12)
  const y = Math.min(screenPosition.y, window.innerHeight - formHeight - 12)

  return (
    <div
      ref={containerRef}
      className={styles.container}
      style={{ left: x, top: y }}
      onKeyDown={handleKeyDown}
      onMouseDown={e => e.stopPropagation()}
    >
      <div className={styles.header}>
        <span className={styles.heading}>Create a new:</span>
        <button className={styles.cancelBtn} onClick={onCancel} type="button">&times;</button>
      </div>
      <div className={styles.classToggle}>
        <button
          className={`${styles.classBtn} ${selectedClass === 'person' ? styles.personActive : ''}`}
          onClick={() => setSelectedClass('person')}
          type="button"
        >
          Person
        </button>
        <button
          className={`${styles.classBtn} ${selectedClass === 'org' ? styles.orgActive : ''}`}
          onClick={() => setSelectedClass('org')}
          type="button"
        >
          Org
        </button>
      </div>
      <input
        ref={inputRef}
        className={styles.nameInput}
        type="text"
        placeholder={selectedClass === 'person' ? 'Name (First Last)' : 'Name'}
        value={name}
        onChange={e => setName(e.target.value)}
        autoComplete="off"
      />
    </div>
  )
}
