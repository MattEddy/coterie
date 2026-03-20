import Frame from './Frame'

interface SettingsFrameProps {
  onClose: () => void
}

export default function SettingsFrame({ onClose }: SettingsFrameProps) {
  return (
    <Frame title="Settings" onClose={onClose} initialPosition={{ x: 60, y: 240 }} width={320}>
      <p style={{ color: 'var(--color-text-muted)', fontSize: 13 }}>
        Settings coming soon.
      </p>
      <div style={{ marginTop: 24, paddingTop: 12, borderTop: '1px solid var(--color-border)' }}>
        <p style={{ color: 'var(--color-text-muted)', fontSize: 11, textAlign: 'center' }}>
          Coterie &copy; 2026 Buckethead, Inc.
        </p>
      </div>
    </Frame>
  )
}
