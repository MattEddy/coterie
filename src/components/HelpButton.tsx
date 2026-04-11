import { useState } from 'react'
import { HelpCircle, X } from 'lucide-react'
import styles from './HelpButton.module.css'

type HelpTab = 'canvas' | 'shortcuts' | 'panel'

const isMac = navigator.platform.includes('Mac')

export default function HelpButton() {
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<HelpTab>('canvas')

  return (
    <>
      <button
        className={styles.helpBtn}
        onClick={() => setOpen(!open)}
        title="Keyboard shortcuts & controls"
      >
        {open ? <X size={20} /> : <HelpCircle size={20} />}
      </button>
      {open && (
        <div className={styles.card}>
          <div className={styles.tabBar}>
            <button className={`${styles.tab} ${tab === 'canvas' ? styles.tabActive : ''}`} onClick={() => setTab('canvas')}>Canvas</button>
            <button className={`${styles.tab} ${tab === 'shortcuts' ? styles.tabActive : ''}`} onClick={() => setTab('shortcuts')}>Shortcuts</button>
            <button className={`${styles.tab} ${tab === 'panel' ? styles.tabActive : ''}`} onClick={() => setTab('panel')}>Panel</button>
          </div>

          {tab === 'canvas' && (
            <div className={styles.section}>
              <div className={styles.row}><span className={styles.keys}>Scroll</span><span>Zoom</span></div>
              <div className={styles.row}><span className={styles.keys}>Space (or middle-click) + drag</span><span>Pan</span></div>
              <div className={styles.row}><span className={styles.keys}>Click drag</span><span>Lasso select</span></div>
              <div className={styles.row}><span className={styles.keys}>{isMac ? '⌘' : 'Ctrl'} + click</span><span>Toggle select</span></div>
              <div className={styles.row}><span className={styles.keys}>Double-click</span><span>Create object</span></div>
            </div>
          )}

          {tab === 'shortcuts' && (
            <div className={styles.section}>
              <div className={styles.row}><span className={styles.key}>N</span><span>New object</span></div>
              <div className={styles.row}><span className={styles.key}>S</span><span>Search</span></div>
              <div className={styles.row}><span className={styles.key}>M</span><span>Maps</span></div>
              <div className={styles.row}><span className={styles.key}>C</span><span>Coteries</span></div>
              <div className={styles.row}><span className={styles.key}>,</span><span>Settings</span></div>
            </div>
          )}

          {tab === 'panel' && (
            <div className={styles.section}>
              <div className={styles.row}><span className={styles.key}>Enter</span><span>Edit header</span></div>
              <div className={styles.row}><span className={styles.key}>Esc</span><span>Close panel</span></div>
              <div className={styles.row}><span className={styles.key}>Del</span><span>Delete object</span></div>
            </div>
          )}
        </div>
      )}
    </>
  )
}
