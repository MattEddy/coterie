import type { ObjectNodeData } from './ObjectNode'
import styles from './DetailPanel.module.css'

interface DetailPanelProps {
  object: ObjectNodeData
  position: { x: number; y: number }
  onClose: () => void
  peerObject?: ObjectNodeData
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

export default function DetailPanel({ object, position, onClose, peerObject }: DetailPanelProps) {
  return (
    <div className={styles.panel} style={{ left: position.x + 12, top: position.y }}>
      <div className={styles.header}>
        <h2 className={styles.name}>{object.name}</h2>
        <button className={styles.close} onClick={onClose}>&times;</button>
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
