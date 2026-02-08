import type { ObjectNodeData } from './ObjectNode'
import styles from './DetailPanel.module.css'

interface DetailPanelProps {
  object: ObjectNodeData
  onClose: () => void
}

const fields: { key: string; label: string }[] = [
  { key: 'title', label: 'Title' },
  { key: 'status', label: 'Status' },
  { key: 'phone', label: 'Phone' },
  { key: 'phone_2', label: 'Phone 2' },
  { key: 'email', label: 'Email' },
  { key: 'website', label: 'Website' },
  { key: 'address', label: 'Address' },
]

export default function DetailPanel({ object, onClose }: DetailPanelProps) {
  return (
    <div className={styles.panel}>
      <div className={styles.header}>
        <h2 className={styles.name}>{object.name}</h2>
        <button className={styles.close} onClick={onClose}>×</button>
      </div>

      <div className={styles.types}>
        {object.types.map(t => (
          <span key={t} className={styles.type}>{t.replace(/_/g, ' ')}</span>
        ))}
      </div>

      <div className={styles.fields}>
        {fields.map(f => {
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
    </div>
  )
}
