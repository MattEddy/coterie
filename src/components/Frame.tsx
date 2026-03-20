import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import styles from './Frame.module.css'

let zCounter = 100
function getNextZ() { return ++zCounter }

interface FrameProps {
  title: string
  onClose: () => void
  initialPosition: { x: number; y: number }
  width?: number
  children: ReactNode
}

export default function Frame({ title, onClose, initialPosition, width = 320, children }: FrameProps) {
  const [position, setPosition] = useState(initialPosition)
  const [zIndex, setZIndex] = useState(getNextZ)
  const isDragging = useRef(false)
  const dragOffset = useRef({ x: 0, y: 0 })
  const frameRef = useRef<HTMLDivElement>(null)

  const handleHeaderMouseDown = useCallback((e: React.MouseEvent) => {
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
      ref={frameRef}
      className={styles.frame}
      style={{ left: position.x, top: position.y, width, zIndex }}
      onMouseDown={bringToFront}
    >
      <div className={styles.header} onMouseDown={handleHeaderMouseDown}>
        <span className={styles.title}>{title}</span>
        <button className={styles.close} onClick={onClose}>&times;</button>
      </div>
      <div className={styles.content}>
        {children}
      </div>
    </div>
  )
}
