import Frame from './Frame'

interface CoteriesFrameProps {
  onClose: () => void
}

export default function CoteriesFrame({ onClose }: CoteriesFrameProps) {
  return (
    <Frame title="Coteries" onClose={onClose} initialPosition={{ x: 60, y: 180 }} width={320} resizable persistKey="coteries">
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
        Manage your coteries — share maps and see intel from your trusted network.
      </p>
    </Frame>
  )
}
