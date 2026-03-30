import { useStore } from '@xyflow/react'
import type { PlacementCluster } from '../types'

const NODE_WIDTH = 180
const NODE_HEIGHT = 60

interface PlacementOverlayProps {
  cluster: PlacementCluster
  anchor: { x: number; y: number }
  isGrabbed: boolean
  onGhostMouseDown: (e: React.MouseEvent) => void
}

export default function PlacementOverlay({ cluster, anchor, isGrabbed, onGhostMouseDown }: PlacementOverlayProps) {
  const transform = useStore(s => s.transform)
  const [tx, ty, zoom] = transform

  return (
    <svg
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'visible',
        zIndex: 5,
      }}
    >
      <g
        transform={`translate(${tx}, ${ty}) scale(${zoom})`}
        style={{ cursor: isGrabbed ? 'grabbing' : 'grab' }}
        onMouseDown={onGhostMouseDown}
      >
        {/* Connections */}
        {cluster.connections.map((conn, i) => {
          const src = cluster.items.find(it => it.objectId === conn.sourceId)
          const tgt = cluster.items.find(it => it.objectId === conn.targetId)
          if (!src || !tgt) return null
          const x1 = anchor.x + src.relativeX + NODE_WIDTH / 2
          const y1 = anchor.y + src.relativeY + NODE_HEIGHT / 2
          const x2 = anchor.x + tgt.relativeX + NODE_WIDTH / 2
          const y2 = anchor.y + tgt.relativeY + NODE_HEIGHT / 2
          return (
            <line
              key={`conn-${i}`}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="var(--color-accent)"
              strokeWidth={1.5 / zoom}
              opacity={0.3}
              style={{ pointerEvents: 'all' }}
            />
          )
        })}
        {/* Object silhouettes */}
        {cluster.items.map(item => {
          const x = anchor.x + item.relativeX
          const y = anchor.y + item.relativeY
          const isPerson = item.class === 'person'
          return (
            <g key={item.objectId} style={{ pointerEvents: 'all' }}>
              <rect
                x={x} y={y}
                width={NODE_WIDTH} height={NODE_HEIGHT}
                rx={isPerson ? 30 : 8} ry={isPerson ? 30 : 8}
                fill={isPerson ? 'var(--color-person-dim)' : 'var(--color-org-dim)'}
                stroke={isPerson ? 'var(--color-person-border)' : 'var(--color-org-border)'}
                strokeWidth={1.5 / zoom}
                opacity={0.6}
              />
              <text
                x={x + NODE_WIDTH / 2}
                y={y + NODE_HEIGHT / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fill="var(--color-text)"
                opacity={0.5}
                style={{ fontSize: 11, fontFamily: 'var(--font-sans)', fontWeight: 600, pointerEvents: 'none' }}
              >
                {item.name.length > 20 ? item.name.slice(0, 18) + '…' : item.name}
              </text>
            </g>
          )
        })}
      </g>
    </svg>
  )
}
