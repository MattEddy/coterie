import { useTheme } from '../contexts/ThemeContext'
import { usePillColors } from '../contexts/PillColorsContext'
import { ORG_PALETTE, PERSON_PALETTE, type PaletteEntry } from '../constants/palettes'
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

function SwatchRow({
  palette,
  activeHex,
  onPick,
}: {
  palette: PaletteEntry[]
  activeHex: string
  onPick: (hex: string) => void
}) {
  return (
    <div className={styles.swatchRow}>
      {palette.map(entry => (
        <button
          key={entry.hex}
          className={`${styles.swatch} ${entry.hex.toLowerCase() === activeHex.toLowerCase() ? styles.swatchActive : ''}`}
          style={{ background: entry.hex }}
          title={entry.name}
          onClick={() => onPick(entry.hex)}
        />
      ))}
    </div>
  )
}

export default function SettingsFrame({ onClose }: SettingsFrameProps) {
  const { theme, setTheme } = useTheme()
  const { defaultOrgColor, defaultPersonColor, setDefaultOrgColor, setDefaultPersonColor } = usePillColors()

  return (
    <Frame title="Settings" titleTooltip="App preferences and appearance" onClose={onClose} initialPosition={{ x: 60, y: 240 }} width={320} persistKey="settings">
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

      <div className={styles.section}>
        <span className={styles.label}>Default Organization Color</span>
        <SwatchRow palette={ORG_PALETTE} activeHex={defaultOrgColor} onPick={setDefaultOrgColor} />
      </div>

      <div className={styles.section}>
        <span className={styles.label}>Default Person Color</span>
        <SwatchRow palette={PERSON_PALETTE} activeHex={defaultPersonColor} onPick={setDefaultPersonColor} />
      </div>

      <div className={styles.footer}>
        <p className={styles.copyright}>Coterie &copy; 2026 Buckethead, Inc.</p>
      </div>
    </Frame>
  )
}
