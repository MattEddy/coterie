import { useState, useRef, useCallback, useEffect, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import styles from './Tooltip.module.css'

interface TooltipProps {
  text: string
  children: ReactNode
  delay?: number
  disabled?: boolean
}

export default function Tooltip({ text, children, delay = 400, disabled = false }: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState({ x: 0, y: 0, placement: 'above' as 'above' | 'below' })
  const triggerRef = useRef<HTMLSpanElement>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout>>()

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      const el = triggerRef.current
      if (!el) return

      let rect = el.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0 && el.firstElementChild) {
        rect = el.firstElementChild.getBoundingClientRect()
      }

      const centerX = rect.left + rect.width / 2
      const gap = 6
      const above = rect.top > 48

      setCoords({
        x: Math.max(8, Math.min(centerX, window.innerWidth - 8)),
        y: above ? rect.top - gap : rect.bottom + gap,
        placement: above ? 'above' : 'below',
      })
      setVisible(true)
    }, delay)
  }, [delay])

  const hide = useCallback(() => {
    clearTimeout(timerRef.current)
    setVisible(false)
  }, [])

  useEffect(() => {
    if (!visible) return
    window.addEventListener('scroll', hide, { capture: true })
    window.addEventListener('mousedown', hide)
    return () => {
      window.removeEventListener('scroll', hide, { capture: true })
      window.removeEventListener('mousedown', hide)
    }
  }, [visible, hide])

  useEffect(() => () => clearTimeout(timerRef.current), [])

  if (disabled || !text) return <>{children}</>

  return (
    <span
      ref={triggerRef}
      onMouseEnter={show}
      onMouseLeave={hide}
      style={{ display: 'inline-flex', alignItems: 'center' }}
    >
      {children}
      {visible && createPortal(
        <div
          className={`${styles.tooltip} ${styles[coords.placement]}`}
          style={{ left: coords.x, top: coords.y }}
        >
          {text}
        </div>,
        document.body
      )}
    </span>
  )
}
