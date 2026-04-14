import { useState, useRef, useEffect, useCallback } from 'react'
import { User, Menu, Search, Map, Settings, LogOut, Pencil, Check } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import Tooltip from './Tooltip'
import { useTheme } from '../contexts/ThemeContext'
import logoNameDark from '../assets/logo-name.svg'
import logoNameLight from '../assets/logo-name-light.svg'
import styles from './NavBar.module.css'

export type FrameType = 'search' | 'maps' | 'updates' | 'settings'

const menuItems: { type: FrameType; Icon: typeof Search; label: string; hotkey: string }[] = [
  { type: 'search', Icon: Search, label: 'Search', hotkey: 'S' },
  { type: 'maps', Icon: Map, label: 'Maps', hotkey: 'M' },
  { type: 'settings', Icon: Settings, label: 'Settings', hotkey: ',' },
]

interface NavBarProps {
  onOpenFrame: (type: FrameType) => void
}

export default function NavBar({ onOpenFrame }: NavBarProps) {
  const { user, signOut } = useAuth()
  const { resolvedTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [editingName, setEditingName] = useState(false)
  const [nameInput, setNameInput] = useState('')
  const nameInputRef = useRef<HTMLInputElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const accountRef = useRef<HTMLDivElement>(null)

  // Load display name
  useEffect(() => {
    if (!user) return
    supabase
      .from('profiles')
      .select('display_name')
      .eq('user_id', user.id)
      .single()
      .then(({ data }) => {
        if (data?.display_name) setDisplayName(data.display_name)
      })
  }, [user])

  const saveName = useCallback(async () => {
    const trimmed = nameInput.trim()
    if (!trimmed || !user) { setEditingName(false); return }
    await supabase
      .from('profiles')
      .update({ display_name: trimmed })
      .eq('user_id', user.id)
    setDisplayName(trimmed)
    setEditingName(false)
  }, [nameInput, user])

  const startEditing = useCallback(() => {
    setNameInput(displayName || '')
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 0)
  }, [displayName])

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
            <div className={styles.accountName}>
              {editingName ? (
                <form className={styles.nameEditRow} onSubmit={e => { e.preventDefault(); saveName() }}>
                  <input
                    ref={nameInputRef}
                    className={styles.nameInput}
                    value={nameInput}
                    onChange={e => setNameInput(e.target.value)}
                    onBlur={saveName}
                    placeholder="Your name"
                  />
                  <button type="submit" className={styles.nameEditBtn}><Check size={13} /></button>
                </form>
              ) : (
                <div className={styles.nameRow}>
                  <span>{displayName || 'Set your name'}</span>
                  <button className={styles.nameEditBtn} onClick={startEditing}><Pencil size={12} /></button>
                </div>
              )}
            </div>
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
            {menuItems.map(({ type, Icon, label, hotkey }) => (
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
                <kbd className={styles.hotkey}>{hotkey}</kbd>
              </button>
            ))}
          </div>
        )}
      </div>

      <img src={resolvedTheme === 'light' ? logoNameLight : logoNameDark} alt="Coterie" className={styles.logo} />
    </div>
  )
}
