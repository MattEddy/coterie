import type { ObjectNodeData } from './ObjectNode'
import styles from './MultiSelectPanel.module.css'

interface MultiSelectItem {
  nodeId: string
  data: ObjectNodeData
}

interface MultiSelectPanelProps {
  items: MultiSelectItem[]
  position: { x: number; y: number }
  onClose: () => void
}

export default function MultiSelectPanel({ items, position, onClose }: MultiSelectPanelProps) {
  const counts: { label: string; count: number }[] = []
  const companies = items.filter(i => i.data.class === 'company').length
  const people = items.filter(i => i.data.class === 'person').length
  const projects = items.filter(i => i.data.class === 'project').length

  if (companies > 0) counts.push({ label: companies === 1 ? 'company' : 'companies', count: companies })
  if (people > 0) counts.push({ label: people === 1 ? 'person' : 'people', count: people })
  if (projects > 0) counts.push({ label: projects === 1 ? 'project' : 'projects', count: projects })

  return (
    <div
      className={styles.panel}
      style={{ left: position.x, top: position.y }}
    >
      <div className={styles.header}>
        <span className={styles.count}>{items.length} selected</span>
        <button className={styles.close} onClick={onClose}>&times;</button>
      </div>

      <div className={styles.breakdown}>
        {counts.map(c => (
          <span key={c.label} className={styles.tag}>{c.count} {c.label}</span>
        ))}
      </div>

      <div className={styles.actions}>
        <button className={styles.action}>New Map</button>
        <button className={styles.action}>Add to Map</button>
        {/* Future: Group on Canvas, Tag All, Compare */}
      </div>
    </div>
  )
}
