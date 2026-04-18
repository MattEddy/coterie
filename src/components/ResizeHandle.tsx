import { forwardRef, useCallback, useEffect, useMemo, useRef } from 'react'
import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { SIZE_SCALES, scaleToNearestSizeIndex } from '../constants/palettes'
import { NODE_WIDTH, NODE_HEIGHT } from './Canvas'
import styles from './ResizeHandle.module.css'

export interface ResizeHandleProps {
  nodeId: string
  currentScale: number
  // Fires on mousedown to enter resize mode (hides toolbar + detail panel)
  onEnterResizeMode: () => void
  // Called continuously during drag with a raw float scale (no snap)
  onPreviewScale: (scale: number) => void
  // Called once on mouseup with the tier-snapped size index
  onCommitIndex: (sizeIndex: number) => void
}

const MIN_SCALE = SIZE_SCALES[0]
const MAX_SCALE = SIZE_SCALES[SIZE_SCALES.length - 1]

const ResizeHandle = forwardRef<HTMLDivElement, ResizeHandleProps>(function ResizeHandle(
  { nodeId, currentScale, onEnterResizeMode, onPreviewScale, onCommitIndex },
  ref
) {
  const { flowToScreenPosition } = useReactFlow()
  const viewport = useViewport()
  const dragStart = useRef<{ x: number; y: number; scale: number } | null>(null)
  const liveScaleRef = useRef<number>(currentScale)

  const nodePosition = useStore(
    useCallback(s => s.nodeLookup.get(nodeId)?.position ?? null, [nodeId]),
    (a, b) => a?.x === b?.x && a?.y === b?.y
  )

  const nodeRect = useMemo(() => {
    if (!nodePosition) return null
    const topLeft = flowToScreenPosition(nodePosition)
    const bottomRight = flowToScreenPosition({
      x: nodePosition.x + NODE_WIDTH * currentScale,
      y: nodePosition.y + NODE_HEIGHT * currentScale,
    })
    return { left: topLeft.x, top: topLeft.y, right: bottomRight.x, bottom: bottomRight.y }
  }, [nodePosition, viewport, flowToScreenPosition, currentScale])

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    dragStart.current = { x: e.clientX, y: e.clientY, scale: liveScaleRef.current }
    onEnterResizeMode()
  }, [onEnterResizeMode])

  useEffect(() => {
    // Sync the ref with prop when no drag is active
    if (!dragStart.current) liveScaleRef.current = currentScale
  }, [currentScale])

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!dragStart.current) return
      const dx = e.clientX - dragStart.current.x
      const dy = e.clientY - dragStart.current.y
      // Sum both axes so any direction (up, left, diagonal) contributes signedly
      const delta = dx + dy
      const newScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, dragStart.current.scale + delta / NODE_WIDTH)
      )
      liveScaleRef.current = newScale
      onPreviewScale(newScale)
    }
    const handleUp = () => {
      if (!dragStart.current) return
      dragStart.current = null
      onCommitIndex(scaleToNearestSizeIndex(liveScaleRef.current))
    }
    window.addEventListener('mousemove', handleMove)
    window.addEventListener('mouseup', handleUp)
    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleUp)
    }
  }, [onPreviewScale, onCommitIndex])

  if (!nodeRect) return null

  const size = 16
  const x = nodeRect.right - size / 2
  const y = nodeRect.bottom - size / 2

  return (
    <div
      ref={ref}
      className={styles.handle}
      style={{ left: x, top: y, width: size, height: size }}
      onMouseDown={handleMouseDown}
    />
  )
})

export default ResizeHandle
