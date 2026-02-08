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

const classStyles: Record<string, string> = {
  company: styles.company,
  person: styles.person,
  project: styles.project,
}

function ObjectNode({ data, selected }: NodeProps) {
  const nodeData = data as unknown as ObjectNodeData
  const shapeClass = classStyles[nodeData.class] || ''

  return (
    <>
      <Handle type="target" position={Position.Top} id="top" className={styles.handle} />
      <Handle type="target" position={Position.Left} id="left" className={styles.handle} />
      <Handle type="source" position={Position.Top} id="top" className={styles.handle} />
      <Handle type="source" position={Position.Left} id="left" className={styles.handle} />
      <div
        className={`${styles.card} ${shapeClass} ${selected ? styles.selected : ''}`}
      >
        <span className={styles.name}>{nodeData.name}</span>
        {nodeData.types.length > 0 && (
          <div className={styles.types}>
            {nodeData.types.map((t, i) => (
              <span key={t} className={styles.type}>
                {i > 0 && ' · '}{t.replace(/_/g, ' ')}
              </span>
            ))}
          </div>
        )}
      </div>
      <Handle type="target" position={Position.Bottom} id="bottom" className={styles.handle} />
      <Handle type="target" position={Position.Right} id="right" className={styles.handle} />
      <Handle type="source" position={Position.Bottom} id="bottom" className={styles.handle} />
      <Handle type="source" position={Position.Right} id="right" className={styles.handle} />
    </>
  )
}

export default memo(ObjectNode)
