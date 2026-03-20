import { useAuth } from '../contexts/AuthContext'
import Frame from './Frame'
import styles from './AccountFrame.module.css'

interface AccountFrameProps {
  onClose: () => void
}

export default function AccountFrame({ onClose }: AccountFrameProps) {
  const { user, signOut } = useAuth()

  return (
    <Frame title="Account" onClose={onClose} initialPosition={{ x: window.innerWidth - 340, y: 60 }} width={260}>
      <div className={styles.field}>
        <span className={styles.label}>Email</span>
        <span className={styles.value}>{user?.email}</span>
      </div>
      <button className={styles.signOut} onClick={signOut}>
        Sign Out
      </button>
    </Frame>
  )
}
