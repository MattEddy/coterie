export interface PaletteEntry {
  name: string
  hex: string
}

export const ORG_PALETTE: PaletteEntry[] = [
  { name: 'Garnet', hex: '#8e4a52' },
  { name: 'Dusty Rose', hex: '#8a6070' },
  { name: 'Saffron', hex: '#b08a4a' },
  { name: 'Umber', hex: '#7a5540' },
  { name: 'Persimmon', hex: '#a86852' },
  { name: 'Brick', hex: '#8a4d45' },
  { name: 'Cinnabar', hex: '#a04a38' },
  { name: 'Cognac', hex: '#8e6040' },
]

export const PERSON_PALETTE: PaletteEntry[] = [
  { name: 'Dusty Teal', hex: '#4a9ab0' },
  { name: 'Slate Blue', hex: '#5a7590' },
  { name: 'Moss', hex: '#5a8075' },
  { name: 'Glacier', hex: '#6a90a8' },
  { name: 'Deep Teal', hex: '#3a7080' },
  { name: 'Ash Violet', hex: '#706890' },
  { name: 'Indigo', hex: '#52558c' },
  { name: 'Pewter', hex: '#6a7480' },
]

export function getPalette(objectClass: string): PaletteEntry[] {
  return objectClass === 'person' ? PERSON_PALETTE : ORG_PALETTE
}

export function getDefaultColor(objectClass: string): string {
  return getPalette(objectClass)[0].hex
}

// Size tiers: geometric progression S → XXL (1.00x → 3.00x, ~1.32x per step)
export const SIZE_SCALES = [1.00, 1.32, 1.73, 2.28, 3.00] as const
export const SIZE_LABELS = ['S', 'M', 'L', 'XL', 'XXL'] as const
export const DEFAULT_SIZE_INDEX = 0

export function sizeIndexToScale(idx: number | null | undefined): number {
  if (idx == null) return SIZE_SCALES[DEFAULT_SIZE_INDEX]
  const clamped = Math.max(0, Math.min(SIZE_SCALES.length - 1, Math.round(idx)))
  return SIZE_SCALES[clamped]
}

export function scaleToNearestSizeIndex(scale: number): number {
  let bestIdx = 0
  let bestDist = Infinity
  for (let i = 0; i < SIZE_SCALES.length; i++) {
    const d = Math.abs(scale - SIZE_SCALES[i])
    if (d < bestDist) { bestDist = d; bestIdx = i }
  }
  return bestIdx
}
