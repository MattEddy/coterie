import { memo } from 'react'
import { Handle, Position } from '@xyflow/react'
import type { NodeProps } from '@xyflow/react'
import styles from './ObjectNode.module.css'

export interface ObjectNodeData {
  id: string
  name: string
  title: string | null
  class: string
  status: string | null
  types: string[]
  phone: string | null
  phone_2: string | null
  email: string | null
  website: string | null
  address: string | null
  photo_url: string | null
  shared_notes: string | null
  private_notes: string | null
  tags: string[] | null
  [key: string]: unknown
}

const classColors: Record<string, string> = {
  company: 'var(--color-company)',
  person: 'var(--color-person)',
  project: 'var(--color-project)',
}

const classIcons: Record<string, string> = {
  company: '🏢',
  person: '👤',
  project: '🎬',
}

function ObjectNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ObjectNodeData
  const color = classColors[nodeData.class] || '#888'

  return (
    <>
      <Handle type="target" position={Position.Top} className={styles.handle} />
      <div
        className={`${styles.card} ${selected ? styles.selected : ''}`}
        style={{ borderColor: selected ? color : 'var(--color-border)' }}
      >
        <div className={styles.header}>
          <span className={styles.icon}>{classIcons[nodeData.class] || '•'}</span>
          <span className={styles.name}>{nodeData.name}</span>
        </div>
        {nodeData.title && (
          <p className={styles.title}>{nodeData.title}</p>
        )}
        {nodeData.types.length > 0 && (
          <div className={styles.types}>
            {nodeData.types.map(t => (
              <span key={t} className={styles.type} style={{ color }}>{t.replace(/_/g, ' ')}</span>
            ))}
          </div>
        )}
      </div>
      <Handle type="source" position={Position.Bottom} className={styles.handle} />
    </>
  )
}

export default memo(ObjectNode)
