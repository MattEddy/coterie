import { useTheme } from '../contexts/ThemeContext'
import Frame from './Frame'
import styles from './SettingsFrame.module.css'

type ThemeOption = 'light' | 'dark' | 'auto'

const themeOptions: { value: ThemeOption; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'auto', label: 'Auto' },
]

interface SettingsFrameProps {
  onClose: () => void
}

export default function SettingsFrame({ onClose }: SettingsFrameProps) {
  const { theme, setTheme } = useTheme()

  return (
    <Frame title="Settings" onClose={onClose} initialPosition={{ x: 60, y: 240 }} width={320}>
      <div className={styles.section}>
        <span className={styles.label}>Appearance</span>
        <div className={styles.segmented}>
          {themeOptions.map(opt => (
            <button
              key={opt.value}
              className={`${styles.segmentedBtn} ${theme === opt.value ? styles.segmentedActive : ''}`}
              onClick={() => setTheme(opt.value)}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.footer}>
        <p className={styles.copyright}>Coterie &copy; 2026 Buckethead, Inc.</p>
      </div>
    </Frame>
  )
}
