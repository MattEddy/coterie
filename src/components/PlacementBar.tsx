import { useEffect } from 'react'
import styles from './PlacementBar.module.css'

interface PlacementBarProps {
  label: string
  onPlace: () => void
  onCancel: () => void
}

export default function PlacementBar({ label, onPlace, onCancel }: PlacementBarProps) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') { e.preventDefault(); onPlace() }
      if (e.key === 'Escape') { e.preventDefault(); onCancel() }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onPlace, onCancel])

  return (
    <div className={styles.bar}>
      <span className={styles.label}>Placing: <strong>{label}</strong></span>
      <div className={styles.actions}>
        <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
        <button className={styles.placeBtn} onClick={onPlace}>Place</button>
      </div>
    </div>
  )
}
