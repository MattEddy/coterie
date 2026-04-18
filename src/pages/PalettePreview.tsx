import { useTheme } from '../contexts/ThemeContext'

type Swatch = { name: string; hex: string }
type Palette = { title: string; subtitle: string; shape: 'org' | 'person'; swatches: Swatch[] }

const PALETTES: Palette[] = [
  {
    title: 'Warm A — Desert Souk',
    subtitle: 'earth & spice, linen-and-rust',
    shape: 'org',
    swatches: [
      { name: 'Dusty Rose', hex: '#8a6070' },
      { name: 'Terracotta', hex: '#9c6352' },
      { name: 'Saffron', hex: '#b08a4a' },
      { name: 'Umber', hex: '#7a5540' },
      { name: 'Persimmon', hex: '#a86852' },
      { name: 'Brick', hex: '#8a4d45' },
      { name: 'Mauve', hex: '#7a5770' },
      { name: 'Antique Gold', hex: '#a48650' },
    ],
  },
  {
    title: 'Warm B — Velvet Library',
    subtitle: 'jewel-adjacent, old leather & wine',
    shape: 'org',
    swatches: [
      { name: 'Dusty Rose', hex: '#8a6070' },
      { name: 'Garnet', hex: '#8e4a52' },
      { name: 'Amber', hex: '#b07545' },
      { name: 'Mulberry', hex: '#754858' },
      { name: 'Copper', hex: '#a0684a' },
      { name: 'Paprika', hex: '#9c5540' },
      { name: 'Plum', hex: '#6a455a' },
      { name: 'Cognac', hex: '#8e6040' },
    ],
  },
  {
    title: 'Cool A — Sea Stone',
    subtitle: 'Nordic fog, sea glass, contemplative',
    shape: 'person',
    swatches: [
      { name: 'Dusty Teal', hex: '#4a9ab0' },
      { name: 'Slate Blue', hex: '#5a7590' },
      { name: 'Moss', hex: '#5a8075' },
      { name: 'Glacier', hex: '#6a90a8' },
      { name: 'Steel', hex: '#607580' },
      { name: 'Ash Violet', hex: '#706890' },
      { name: 'Sage', hex: '#6a8575' },
      { name: 'Pewter', hex: '#6a7480' },
    ],
  },
  {
    title: 'Cool B — Twilight Silk',
    subtitle: 'jewel-cool, dusk sky, deep water',
    shape: 'person',
    swatches: [
      { name: 'Dusty Teal', hex: '#4a9ab0' },
      { name: 'Sapphire', hex: '#4a6d9c' },
      { name: 'Amethyst', hex: '#7860a0' },
      { name: 'Deep Teal', hex: '#3a7080' },
      { name: 'Periwinkle', hex: '#6a7aa0' },
      { name: 'Indigo', hex: '#52558c' },
      { name: 'Plum Navy', hex: '#554670' },
      { name: 'Dusky Lavender', hex: '#806a95' },
    ],
  },
  {
    title: 'Warm C — Souk + Library',
    subtitle: 'Souk base, swaps garnet/cognac/cinnabar',
    shape: 'org',
    swatches: [
      { name: 'Dusty Rose', hex: '#8a6070' },
      { name: 'Garnet', hex: '#8e4a52' },
      { name: 'Saffron', hex: '#b08a4a' },
      { name: 'Umber', hex: '#7a5540' },
      { name: 'Persimmon', hex: '#a86852' },
      { name: 'Brick', hex: '#8a4d45' },
      { name: 'Cinnabar', hex: '#a04a38' },
      { name: 'Cognac', hex: '#8e6040' },
    ],
  },
  {
    title: 'Cool C — Sea Stone + Silk',
    subtitle: 'Sea Stone base, deep teal for steel, indigo for sage',
    shape: 'person',
    swatches: [
      { name: 'Dusty Teal', hex: '#4a9ab0' },
      { name: 'Slate Blue', hex: '#5a7590' },
      { name: 'Moss', hex: '#5a8075' },
      { name: 'Glacier', hex: '#6a90a8' },
      { name: 'Deep Teal', hex: '#3a7080' },
      { name: 'Ash Violet', hex: '#706890' },
      { name: 'Indigo', hex: '#52558c' },
      { name: 'Pewter', hex: '#6a7480' },
    ],
  },
]

const SAMPLE_NAMES: Record<'org' | 'person', string[]> = {
  org: ['A24', 'CAA', 'Netflix', 'Plan B', 'Apple TV+', 'Blumhouse', 'Searchlight', 'WME'],
  person: ['Greta Gerwig', 'Barry Jenkins', 'Ari Aster', 'Chloé Zhao', 'Mike Flanagan', 'Celine Song', 'Dan Kwan', 'Julia Ducournau'],
}

function Pill({ hex, shape, name }: { hex: string; shape: 'org' | 'person'; name: string }) {
  return (
    <div
      style={{
        background: hex,
        color: '#f5f3f0',
        width: 180,
        height: 60,
        borderRadius: shape === 'person' ? 30 : 8,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: 13,
        fontFamily: 'Urbanist, sans-serif',
        border: '1.5px solid rgba(255,255,255,0.12)',
        padding: '0 16px',
        overflow: 'hidden',
        whiteSpace: 'nowrap',
        textOverflow: 'ellipsis',
      }}
    >
      {name}
    </div>
  )
}

function PaletteSection({ palette, index }: { palette: Palette; index: number }) {
  const names = SAMPLE_NAMES[palette.shape]
  return (
    <section style={{ marginBottom: 56 }}>
      <h2 style={{ fontSize: 18, fontWeight: 600, margin: '0 0 4px', color: 'var(--color-text)' }}>
        {palette.title}
      </h2>
      <p style={{ fontSize: 13, color: 'var(--color-text-muted)', margin: '0 0 20px' }}>
        {palette.subtitle}
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, maxWidth: 840 }}>
        {palette.swatches.map((sw, i) => (
          <div key={sw.hex} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
            <Pill hex={sw.hex} shape={palette.shape} name={names[i % names.length]} />
            <div style={{ fontSize: 11, color: 'var(--color-text-muted)', fontFamily: 'Inter, sans-serif' }}>
              <strong style={{ color: 'var(--color-text)', fontWeight: 500 }}>{sw.name}</strong>
              {i === 0 && <span style={{ marginLeft: 4, opacity: 0.6 }}>(default)</span>}
              <div style={{ opacity: 0.6 }}>{sw.hex}</div>
            </div>
          </div>
        ))}
      </div>
      {index % 2 === 1 && index < PALETTES.length - 1 && (
        <hr style={{ marginTop: 48, border: 'none', borderTop: '1px solid var(--color-border)' }} />
      )}
    </section>
  )
}

export default function PalettePreview() {
  const { resolvedTheme, setTheme } = useTheme()

  return (
    <div style={{
      height: '100vh',
      background: 'var(--color-bg)',
      color: 'var(--color-text)',
      padding: '40px 48px',
      overflowY: 'auto',
      fontFamily: 'Urbanist, sans-serif',
    }}>
      <header style={{ marginBottom: 40, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 700, margin: '0 0 8px' }}>Palette Preview</h1>
          <p style={{ fontSize: 14, color: 'var(--color-text-muted)', margin: 0 }}>
            Pills render identically in light and dark mode. Toggle to compare.
          </p>
        </div>
        <button
          onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
          style={{
            background: 'var(--color-surface)',
            border: '1px solid var(--color-border)',
            color: 'var(--color-text)',
            padding: '8px 14px',
            borderRadius: 6,
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          Switch to {resolvedTheme === 'dark' ? 'light' : 'dark'} mode
        </button>
      </header>
      {PALETTES.map((p, i) => <PaletteSection key={p.title} palette={p} index={i} />)}
    </div>
  )
}
