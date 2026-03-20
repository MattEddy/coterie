import { memo } from 'react'
import { getStraightPath } from '@xyflow/react'
import type { EdgeProps } from '@xyflow/react'

function RoleEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  data,
  style,
}: EdgeProps) {
  const [edgePath] = getStraightPath({ sourceX, sourceY, targetX, targetY })

  const roleA = data?.role_a as string | null
  const roleB = data?.role_b as string | null
  const highlighted = data?.highlighted as boolean

  // Interpolate positions along the edge for labels
  const labelOffset = 0.2
  const labelAX = sourceX + (targetX - sourceX) * labelOffset
  const labelAY = sourceY + (targetY - sourceY) * labelOffset
  const labelBX = sourceX + (targetX - sourceX) * (1 - labelOffset)
  const labelBY = sourceY + (targetY - sourceY) * (1 - labelOffset)

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        style={style}
        className="react-flow__edge-path"
      />
      {/* Invisible wider hit area for easier clicking */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={20}
        className="react-flow__edge-interaction"
      />
      {highlighted && roleA && (
        <g transform={`translate(${labelAX}, ${labelAY})`}>
          <rect
            x={-measureText(roleA) / 2 - 6}
            y={-8}
            width={measureText(roleA) + 12}
            height={16}
            rx={4}
            fill="var(--color-bg)"
            fillOpacity={0.85}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontSize: 10, fill: '#fff', fontFamily: 'var(--font-sans)' }}
          >
            {roleA}
          </text>
        </g>
      )}
      {highlighted && roleB && (
        <g transform={`translate(${labelBX}, ${labelBY})`}>
          <rect
            x={-measureText(roleB) / 2 - 6}
            y={-8}
            width={measureText(roleB) + 12}
            height={16}
            rx={4}
            fill="var(--color-bg)"
            fillOpacity={0.85}
          />
          <text
            textAnchor="middle"
            dominantBaseline="central"
            style={{ fontSize: 10, fill: '#fff', fontFamily: 'var(--font-sans)' }}
          >
            {roleB}
          </text>
        </g>
      )}
    </>
  )
}

// Rough text width estimate (monospace-ish at 10px)
function measureText(text: string): number {
  return text.length * 6
}

export default memo(RoleEdge)
