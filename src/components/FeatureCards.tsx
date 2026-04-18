import thumbLandscape from '../assets/thumb-landscape.svg'
import thumbDetails from '../assets/thumb-details.svg'
import thumbMaps from '../assets/thumb-maps.svg'
import thumbSharedMaps from '../assets/thumb-coteries.svg'
import styles from './FeatureCards.module.css'

const features = [
  {
    thumb: thumbLandscape,
    title: 'Landscape',
    description:
      'Visually array the people, organizations, and interrelationships in your world on a single, intuitive canvas.',
  },
  {
    thumb: thumbDetails,
    title: 'Details',
    description:
      'Add contact info and notes, track projects, and log your events — all linked to specific people and organizations.',
  },
  {
    thumb: thumbMaps,
    title: 'Maps',
    description:
      'Organize your Landscape into focused subsections — by project, by sector, by whatever makes sense to you.',
  },
  {
    thumb: thumbSharedMaps,
    title: 'Shared Maps',
    description:
      'Share maps with trusted collaborators to sync contact intel and keep each other in the loop — in real time.',
  },
]

export default function FeatureCards() {
  return (
    <div className={styles.features}>
      {features.map(f => (
        <div key={f.title} className={styles.featureCard}>
          <img src={f.thumb} alt={f.title} className={styles.featureThumb} />
          <h3 className={styles.featureTitle}>{f.title}</h3>
          <p className={styles.featureDesc}>{f.description}</p>
        </div>
      ))}
    </div>
  )
}
