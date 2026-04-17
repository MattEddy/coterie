import { useState, useRef, useCallback, useEffect, forwardRef, type ReactNode } from 'react'
import { X } from 'lucide-react'
import { useWorkspace } from '../contexts/WorkspaceContext'
import Tooltip from './Tooltip'
import styles from './Frame.module.css'

let zCounter = 100
function getNextZ() { return ++zCounter }

const MIN_W = 200
const MIN_H = 100
function clampToViewport(x: number, y: number, w: number): { x: number; y: number } {
  const vw = window.innerWidth
  const vh = window.innerHeight
  return {
    x: Math.max(0, Math.min(x, vw - w)),
    y: Math.max(0, Math.min(y, vh - MIN_H)),
  }
}

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
  titleTooltip?: string
}

const Frame = forwardRef<HTMLDivElement, FrameProps>(function Frame(
  { title, onClose, initialPosition, width = 320, children, actions, titleClassName, headerContent, resizable, persistKey, titleTooltip },
  externalRef
) {
  const { getLayout, saveLayout } = useWorkspace()
  const [size, setSize] = useState<{ w: number; h?: number }>(() => {
    if (persistKey) {
      const saved = getLayout(persistKey)
      if (saved) return { w: saved.w || width }
    }
    return { w: width }
  })
  const [position, setPosition] = useState(() => {
    if (persistKey) {
      const saved = getLayout(persistKey)
      if (saved) return clampToViewport(saved.x, saved.y, saved.w || width)
    }
    return initialPosition
  })
  // Track whether the user explicitly resized (so we only persist h from resize)
  const userResized = useRef(false)
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
    userResized.current = true
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
      // Only save height on explicit resize — drag should not lock auto-sized frames
      if ((wasDragging || wasResizing) && persistKeyRef.current && frameRef.current) {
        const rect = frameRef.current.getBoundingClientRect()
        saveLayoutRef.current(persistKeyRef.current, {
          x: rect.left, y: rect.top, w: rect.width,
          ...(wasResizing ? { h: rect.height } : { h: null }),
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
    // Auto-focus the frame so keyboard events work immediately
    frameRef.current?.focus()
  }, [])

  // Focus the frame on mount so Tab works without clicking first
  useEffect(() => {
    frameRef.current?.focus()
  }, [])

  // Keyboard: ESC to close, TAB focus trap
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
      return
    }
    if (e.key !== 'Tab') return
    e.preventDefault()
    const el = frameRef.current
    if (!el) return
    // Only visible, non-hidden focusable elements
    const all = el.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )
    const focusable = Array.from(all).filter(
      node => node.offsetParent !== null && !node.closest('[hidden]')
    )
    if (focusable.length === 0) return
    const active = document.activeElement
    const idx = focusable.indexOf(active as HTMLElement)
    if (e.shiftKey) {
      focusable[idx <= 0 ? focusable.length - 1 : idx - 1].focus()
    } else {
      focusable[idx < 0 || idx >= focusable.length - 1 ? 0 : idx + 1].focus()
    }
  }, [onClose])

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
      tabIndex={-1}
      onMouseDown={bringToFront}
      onKeyDown={handleKeyDown}
    >
      <div className={`${styles.header} ${collapsed ? styles.headerCollapsed : ''}`} onMouseDown={handleHeaderMouseDown}>
        <div className={styles.headerTop}>
          <span className={`${styles.title} ${titleClassName ?? ''}`}>
            {titleTooltip ? (
              <Tooltip text={titleTooltip} delay={600}>
                <span>{title}</span>
              </Tooltip>
            ) : title}
          </span>
          <div className={styles.headerRight}>
            {!collapsed && actions}
            <Tooltip text="Close">
              <button className={styles.close} onClick={onClose}><X size={16} /></button>
            </Tooltip>
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
