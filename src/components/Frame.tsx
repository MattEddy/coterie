import { useState, useRef, useCallback, useEffect, forwardRef, type ReactNode } from 'react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import styles from './Frame.module.css'

let zCounter = 100
function getNextZ() { return ++zCounter }

const MIN_W = 200
const MIN_H = 100

const CURSORS: Record<string, string> = {
  n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize',
  ne: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize', sw: 'nesw-resize',
}

interface FrameProps {
  title: string
  onClose: () => void
  initialPosition: { x: number; y: number }
  width?: number
  children: ReactNode
  actions?: ReactNode
  titleClassName?: string
  headerContent?: ReactNode
  resizable?: boolean
  persistKey?: string
}

const Frame = forwardRef<HTMLDivElement, FrameProps>(function Frame(
  { title, onClose, initialPosition, width = 320, children, actions, titleClassName, headerContent, resizable, persistKey },
  externalRef
) {
  const { getLayout, saveLayout } = useWorkspace()
  const [position, setPosition] = useState(() => {
    if (persistKey) {
      const saved = getLayout(persistKey)
      if (saved) return { x: saved.x, y: saved.y }
    }
    return initialPosition
  })
  const [size, setSize] = useState<{ w: number; h: number | null }>(() => {
    if (persistKey) {
      const saved = getLayout(persistKey)
      if (saved) return { w: saved.w, h: saved.h ?? null }
    }
    return { w: width, h: null }
  })
  const [zIndex, setZIndex] = useState(getNextZ)
  const [collapsed, setCollapsed] = useState(false)
  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const lastClickTime = useRef(0)
  const frameRef = useRef<HTMLDivElement>(null)
  const persistKeyRef = useRef(persistKey)
  persistKeyRef.current = persistKey
  const saveLayoutRef = useRef(saveLayout)
  saveLayoutRef.current = saveLayout

  // Resize state
  const resizeDir = useRef<string | null>(null)
  const resizeStart = useRef({ mouseX: 0, mouseY: 0, left: 0, top: 0, w: 0, h: 0 })

  const setRef = useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node
    if (typeof externalRef === 'function') externalRef(node)
    else if (externalRef) (externalRef as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [externalRef])

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, input, textarea, label')) return

    const now = Date.now()
    if (now - lastClickTime.current < 300) {
      setCollapsed(c => !c)
      lastClickTime.current = 0
      return
    }
    lastClickTime.current = now

    isDragging.current = true
    const rect = frameRef.current?.getBoundingClientRect()
    if (rect) {
      dragOffset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top }
    }
    setZIndex(getNextZ())
    e.preventDefault()
  }, [])

  const handleResizeMouseDown = useCallback((dir: string, e: React.MouseEvent) => {
    const rect = frameRef.current?.getBoundingClientRect()
    if (!rect) return
    resizeDir.current = dir
    resizeStart.current = {
      mouseX: e.clientX, mouseY: e.clientY,
      left: rect.left, top: rect.top,
      w: rect.width, h: rect.height,
    }
    document.documentElement.style.cursor = CURSORS[dir] || ''
    setZIndex(getNextZ())
    e.preventDefault()
    e.stopPropagation()
  }, [])

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging.current) {
        setPosition({
          x: e.clientX - dragOffset.current.x,
          y: Math.max(0, e.clientY - dragOffset.current.y),
        })
      } else if (resizeDir.current) {
        const s = resizeStart.current
        const dx = e.clientX - s.mouseX
        const dy = e.clientY - s.mouseY
        const dir = resizeDir.current

        let newW = s.w, newH = s.h, newX = s.left, newY = s.top

        if (dir.includes('e')) newW = Math.max(MIN_W, s.w + dx)
        if (dir.includes('w')) {
          newW = Math.max(MIN_W, s.w - dx)
          newX = s.left + s.w - newW
        }
        if (dir.includes('s')) newH = Math.max(MIN_H, s.h + dy)
        if (dir.includes('n')) {
          newH = Math.max(MIN_H, s.h - dy)
          newY = s.top + s.h - newH
        }

        setSize({ w: newW, h: newH })
        setPosition({ x: newX, y: newY })
      }
    }
    const handleMouseUp = () => {
      const wasDragging = isDragging.current
      const wasResizing = !!resizeDir.current
      isDragging.current = false
      if (resizeDir.current) {
        resizeDir.current = null
        document.documentElement.style.cursor = ''
      }
      // Persist layout on drag/resize end
      if ((wasDragging || wasResizing) && persistKeyRef.current && frameRef.current) {
        const rect = frameRef.current.getBoundingClientRect()
        saveLayoutRef.current(persistKeyRef.current, {
          x: rect.left, y: rect.top, w: rect.width, h: rect.height,
        })
      }
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [])

  const bringToFront = useCallback(() => {
    setZIndex(getNextZ())
  }, [])

  return (
    <div
      ref={setRef}
      className={styles.frame}
      style={{
        left: position.x,
        top: position.y,
        width: size.w,
        ...(size.h ? { height: size.h } : {}),
        zIndex,
      }}
      onMouseDown={bringToFront}
    >
      <div className={`${styles.header} ${collapsed ? styles.headerCollapsed : ''}`} onMouseDown={handleHeaderMouseDown}>
        <div className={styles.headerTop}>
          <span className={`${styles.title} ${titleClassName ?? ''}`}>{title}</span>
          <div className={styles.headerRight}>
            {!collapsed && actions}
            <button className={styles.close} onClick={onClose}>&times;</button>
          </div>
        </div>
        {!collapsed && headerContent && (
          <div className={styles.headerContent}>
            {headerContent}
          </div>
        )}
      </div>
      {!collapsed && (
        <div className={styles.content}>
          {children}
        </div>
      )}
      {resizable && !collapsed && (
        <>
          <div className={styles.resizeEdge} style={{ top: -3, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} onMouseDown={e => handleResizeMouseDown('n', e)} />
          <div className={styles.resizeEdge} style={{ bottom: -3, left: 8, right: 8, height: 6, cursor: 'ns-resize' }} onMouseDown={e => handleResizeMouseDown('s', e)} />
          <div className={styles.resizeEdge} style={{ top: 8, right: -3, bottom: 8, width: 6, cursor: 'ew-resize' }} onMouseDown={e => handleResizeMouseDown('e', e)} />
          <div className={styles.resizeEdge} style={{ top: 8, left: -3, bottom: 8, width: 6, cursor: 'ew-resize' }} onMouseDown={e => handleResizeMouseDown('w', e)} />
          <div className={styles.resizeCorner} style={{ top: -3, left: -3, cursor: 'nwse-resize' }} onMouseDown={e => handleResizeMouseDown('nw', e)} />
          <div className={styles.resizeCorner} style={{ top: -3, right: -3, cursor: 'nesw-resize' }} onMouseDown={e => handleResizeMouseDown('ne', e)} />
          <div className={styles.resizeCorner} style={{ bottom: -3, right: -3, cursor: 'nwse-resize' }} onMouseDown={e => handleResizeMouseDown('se', e)} />
          <div className={styles.resizeCorner} style={{ bottom: -3, left: -3, cursor: 'nesw-resize' }} onMouseDown={e => handleResizeMouseDown('sw', e)} />
        </>
      )}
    </div>
  )
})

export default Frame
