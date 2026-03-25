import { useState, useRef, useCallback, useEffect, forwardRef, type ReactNode } from 'react'
import styles from './Frame.module.css'

let zCounter = 100
function getNextZ() { return ++zCounter }

interface FrameProps {
  title: string
  onClose: () => void
  initialPosition: { x: number; y: number }
  width?: number
  children: ReactNode
  actions?: ReactNode
  titleClassName?: string
  headerContent?: ReactNode
}

const Frame = forwardRef<HTMLDivElement, FrameProps>(function Frame(
  { title, onClose, initialPosition, width = 320, children, actions, titleClassName, headerContent },
  externalRef
) {
  const [position, setPosition] = useState(initialPosition)
  const [zIndex, setZIndex] = useState(getNextZ)
  const [collapsed, setCollapsed] = useState(false)
  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const lastClickTime = useRef(0)
  const frameRef = useRef<HTMLDivElement>(null)

  const setRef = useCallback((node: HTMLDivElement | null) => {
    frameRef.current = node
    if (typeof externalRef === 'function') externalRef(node)
    else if (externalRef) (externalRef as React.MutableRefObject<HTMLDivElement | null>).current = node
  }, [externalRef])

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
    // Don't start drag or toggle collapse from buttons or inputs
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

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging.current) return
      setPosition({
        x: e.clientX - dragOffset.current.x,
        y: Math.max(0, e.clientY - dragOffset.current.y),
      })
    }
    const handleMouseUp = () => {
      isDragging.current = false
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
      style={{ left: position.x, top: position.y, width, zIndex }}
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
    </div>
  )
})

export default Frame
