import { useState, useRef, useEffect } from 'react'
import { User, Menu, Search, Map, Users, Settings, LogOut } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import Tooltip from './Tooltip'
import { useTheme } from '../contexts/ThemeContext'
import logoNameDark from '../assets/logo-name.svg'
import logoNameLight from '../assets/logo-name-light.svg'
import styles from './NavBar.module.css'

export type FrameType = 'search' | 'maps' | 'coteries' | 'coterie-updates' | 'settings'

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
  const { user, signOut } = useAuth()
  const { resolvedTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!menuOpen && !accountOpen) return
    const handleClick = (e: MouseEvent) => {
      if (menuOpen && menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
      if (accountOpen && accountRef.current && !accountRef.current.contains(e.target as Node)) {
        setAccountOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [menuOpen, accountOpen])

  return (
    <div className={styles.navBar}>
      <div ref={accountRef} className={styles.menuContainer}>
        <Tooltip text="Account" disabled={accountOpen}>
          <button
            className={`${styles.navBtn} ${accountOpen ? styles.navBtnActive : ''}`}
            onClick={() => { setAccountOpen(!accountOpen); setMenuOpen(false) }}
          >
            <User size={27} />
          </button>
        </Tooltip>

        {accountOpen && (
          <div className={styles.popover}>
            <div className={styles.accountEmail}>{user?.email}</div>
            <div className={styles.menuDivider} />
            <button
              className={styles.menuItem}
              onClick={() => { signOut(); setAccountOpen(false) }}
            >
              <LogOut size={15} />
              <span>Sign Out</span>
            </button>
          </div>
        )}
      </div>

      <div ref={menuRef} className={styles.menuContainer}>
        <Tooltip text="Menu" disabled={menuOpen}>
          <button
            className={`${styles.navBtn} ${menuOpen ? styles.navBtnActive : ''}`}
            onClick={() => { setMenuOpen(!menuOpen); setAccountOpen(false) }}
          >
            <Menu size={27} />
          </button>
        </Tooltip>

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

      <img src={resolvedTheme === 'light' ? logoNameLight : logoNameDark} alt="Coterie" className={styles.logo} />
    </div>
  )
}
