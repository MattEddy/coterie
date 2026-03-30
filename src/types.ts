export interface NodeRect {
  left: number
  top: number
  right: number
  bottom: number
}

export interface PlacementItem {
  objectId: string
  name: string
  class: string
  relativeX: number
  relativeY: number
}

export interface PlacementConnection {
  sourceId: string
  targetId: string
}

export interface PlacementCluster {
  label: string
  items: PlacementItem[]
  connections: PlacementConnection[]
  onConfirm: (anchorX: number, anchorY: number) => Promise<void>
  onCancel: () => void
}
