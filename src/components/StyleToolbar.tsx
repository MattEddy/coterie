import { forwardRef, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useReactFlow, useStore, useViewport } from '@xyflow/react'
import { Palette } from 'lucide-react'
import Tooltip from './Tooltip'
import { getPalette } from '../constants/palettes'
import { useDefaultColorFor, orderPaletteByDefault } from '../contexts/PillColorsContext'
import { NODE_WIDTH, NODE_HEIGHT } from './Canvas'
import styles from './StyleToolbar.module.css'

export interface StyleToolbarProps {
  nodeId: string
  objectClass: string
  currentColor: string | null | undefined
  currentScale: number
  colorMode: boolean
  onEnterColorMode: () => void
  onPreviewColor: (hex: string | null) => void
  onCommitColor: (hex: string | null) => void
}

const TOOLBAR_APPROX = { w: 38, h: 34 }
const PALETTE_APPROX = { w: 260, h: 42 }

function computePosition(
  nodeRect: { left: number; top: number; right: number; bottom: number },
  toolbarSize: { w: number; h: number }
) {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const nodeCenterX = (nodeRect.left + nodeRect.right) / 2
  const nodeCenterY = (nodeRect.top + nodeRect.bottom) / 2
  const GAP = 8

  const panelOnRight = (vw - nodeRect.right) >= nodeRect.left
  const anchorRatio = nodeCenterY / vh

  let x: number
  let y: number

  if (anchorRatio >= 0.4 && anchorRatio <= 0.6) {
    // Panel centers vertically on pill → default below
    y = nodeRect.bottom + GAP
    x = panelOnRight ? nodeRect.left : nodeRect.right - toolbarSize.w
  } else {
    // Toolbar matches panel's vertical half (below if panel extends down, above if panel extends up)
    const panelExtendsDown = anchorRatio < 0.4
    y = panelExtendsDown ? nodeRect.bottom + GAP : nodeRect.top - toolbarSize.h - GAP
    x = panelOnRight ? nodeRect.left : nodeRect.right - toolbarSize.w
  }

  if (x < GAP) x = Math.max(GAP, nodeCenterX - toolbarSize.w / 2)
  x = Math.max(GAP, Math.min(x, vw - toolbarSize.w - GAP))
  y = Math.max(GAP, Math.min(y, vh - toolbarSize.h - GAP))

  return { x, y }
}

const StyleToolbar = forwardRef<HTMLDivElement, StyleToolbarProps>(function StyleToolbar(
  { nodeId, objectClass, currentColor, currentScale, colorMode, onEnterColorMode, onPreviewColor, onCommitColor },
  ref
) {
  const mode: 'idle' | 'color' = colorMode ? 'color' : 'idle'
  const { flowToScreenPosition } = useReactFlow()
  const viewport = useViewport()
  const defaultHex = useDefaultColorFor(objectClass)
  const palette = orderPaletteByDefault(getPalette(objectClass), defaultHex)
  const effectiveColor = currentColor ?? defaultHex

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

  // Compute-once, follow-forever: smart-place on initial mount (or mode flip),
  // then lock a fixed offset from the pill and follow it on drag/pan/zoom.
  const placementKey = useRef<string | null>(null)
  const offsetRef = useRef<{ dx: number; dy: number }>({ dx: 0, dy: 0 })
  const [pos, setPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 })

  useLayoutEffect(() => {
    if (!nodeRect) return
    const key = `${nodeId}|${mode}`
    if (placementKey.current !== key) {
      const size = mode === 'color' ? PALETTE_APPROX : TOOLBAR_APPROX
      const computed = computePosition(nodeRect, size)
      offsetRef.current = { dx: computed.x - nodeRect.left, dy: computed.y - nodeRect.top }
      placementKey.current = key
      setPos(computed)
    } else {
      const { dx, dy } = offsetRef.current
      setPos({ x: nodeRect.left + dx, y: nodeRect.top + dy })
    }
  }, [nodeRect, nodeId, mode])

  if (!nodeRect) return null

  return (
    <div ref={ref} className={styles.toolbar} style={{ left: pos.x, top: pos.y }}>
      {mode === 'idle' ? (
        <Tooltip text="Recolor"><button className={styles.btn} onClick={onEnterColorMode}><Palette size={14} /></button></Tooltip>
      ) : (
        <>
          <button
            className={`${styles.swatch} ${effectiveColor.toLowerCase() === defaultHex.toLowerCase() ? styles.swatchActive : ''}`}
            style={{ background: defaultHex }}
            title={palette[0].name + ' (default)'}
            onMouseEnter={() => onPreviewColor(defaultHex)}
            onMouseLeave={() => onPreviewColor(null)}
            onClick={() => onCommitColor(null)}
          />
          <div className={styles.divider} />
          {palette.slice(1).map(entry => (
            <button
              key={entry.hex}
              className={`${styles.swatch} ${effectiveColor.toLowerCase() === entry.hex.toLowerCase() ? styles.swatchActive : ''}`}
              style={{ background: entry.hex }}
              title={entry.name}
              onMouseEnter={() => onPreviewColor(entry.hex)}
              onMouseLeave={() => onPreviewColor(null)}
              onClick={() => onCommitColor(entry.hex)}
            />
          ))}
        </>
      )}
    </div>
  )
})

export default StyleToolbar
