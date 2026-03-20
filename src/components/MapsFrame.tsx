import Frame from './Frame'

interface MapsFrameProps {
  onClose: () => void
}

export default function MapsFrame({ onClose }: MapsFrameProps) {
  return (
    <Frame title="Maps" onClose={onClose} initialPosition={{ x: 60, y: 120 }} width={320}>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
        Create filtered views of your Landscape and browse map packages.
      </p>
    </Frame>
  )
}
