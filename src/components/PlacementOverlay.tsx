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
        {/* Glow filter */}
        <defs>
          <filter id="ghost-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
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
              stroke="white"
              strokeWidth={1.5 / zoom}
              opacity={0.4}
              filter="url(#ghost-glow)"
              style={{ pointerEvents: 'all' }}
            />
          )
        })}
        {/* Ghost outlines */}
        {cluster.items.map(item => {
          const x = anchor.x + item.relativeX
          const y = anchor.y + item.relativeY
          const isPerson = item.class === 'person'
          return (
            <rect
              key={item.objectId}
              x={x} y={y}
              width={NODE_WIDTH} height={NODE_HEIGHT}
              rx={isPerson ? 30 : 8} ry={isPerson ? 30 : 8}
              fill="none"
              stroke="white"
              strokeWidth={1.5 / zoom}
              opacity={0.7}
              filter="url(#ghost-glow)"
              style={{ pointerEvents: 'all' }}
            />
          )
        })}
      </g>
    </svg>
  )
}
