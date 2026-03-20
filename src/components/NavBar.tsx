import { useState, useRef, useEffect } from 'react'
import { User, Menu, Search, Map, Users, Settings } from 'lucide-react'
import styles from './NavBar.module.css'

export type FrameType = 'account' | 'search' | 'maps' | 'coteries' | 'settings'

const menuItems: { type: FrameType; Icon: typeof Search; label: string }[] = [
  { type: 'search', Icon: Search, label: 'Search' },
  { type: 'maps', Icon: Map, label: 'Maps' },
  { type: 'coteries', Icon: Users, label: 'Coteries' },
  { type: 'settings', Icon: Settings, label: 'Settings' },
]

interface NavBarProps {
  onOpenFrame: (type: FrameType) => void
}

export default function NavBar({ onOpenFrame }: NavBarProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen])

  return (
    <div className={styles.navBar}>
      <button
        className={styles.navBtn}
        onClick={() => onOpenFrame('account')}
        title="Account"
      >
        <User size={18} />
      </button>

      <div ref={menuRef} className={styles.menuContainer}>
        <button
          className={`${styles.navBtn} ${menuOpen ? styles.navBtnActive : ''}`}
          onClick={() => setMenuOpen(!menuOpen)}
          title="Menu"
        >
          <Menu size={18} />
        </button>

        {menuOpen && (
          <div className={styles.popover}>
            {menuItems.map(({ type, Icon, label }) => (
              <button
                key={type}
                className={styles.menuItem}
                onClick={() => {
                  onOpenFrame(type)
                  setMenuOpen(false)
                }}
              >
                <Icon size={15} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <span className={styles.logo}>Coterie</span>
    </div>
  )
}
