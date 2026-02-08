import { useAuth } from '../contexts/AuthContext'
import Canvas from '../components/Canvas'
import styles from './Landscape.module.css'

export default function Landscape() {
  const { user, signOut } = useAuth()

  return (
    <div className={styles.container}>
      <div className={styles.topBar}>
        <span className={styles.logo}>Coterie</span>
        <button className={styles.signOut} onClick={signOut}>
          {user?.email} — Sign Out
        </button>
      </div>
      <div className={styles.canvas}>
        <Canvas />
      </div>
    </div>
  )
}
