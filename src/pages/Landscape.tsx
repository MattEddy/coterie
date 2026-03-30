import { useCallback, useEffect, useRef, useState } from 'react'
import Canvas from '../components/Canvas'
import type { CanvasRef } from '../components/Canvas'
import NavBar from '../components/NavBar'
import type { FrameType } from '../components/NavBar'
import SearchFrame from '../components/SearchFrame'
import MapsFrame from '../components/MapsFrame'
import CoteriesFrame from '../components/CoteriesFrame'
import SettingsFrame from '../components/SettingsFrame'
import CoterieUpdatesFrame from '../components/CoterieUpdatesFrame'
import NotificationBoxes from '../components/NotificationBoxes'
import PlacementBar from '../components/PlacementBar'
import type { PlacementCluster } from '../types'
import styles from './Landscape.module.css'

export default function Landscape() {
  const canvasRef = useRef<CanvasRef>(null)
  const [openFrames, setOpenFrames] = useState<Set<FrameType>>(new Set())
  const [activeMapId, setActiveMapId] = useState<string | null>(null)
  const [highlightedObjectIds, setHighlightedObjectIds] = useState<string[] | null>(null)
  const [mapEditMode, setMapEditMode] = useState(false)
  const mapEditClickRef = useRef<((objectId: string) => void) | null>(null)

  // Placement mode state
  const [placementCluster, setPlacementCluster] = useState<PlacementCluster | null>(null)
  const savedOpenFramesRef = useRef<Set<FrameType> | null>(null)
  const placementClusterRef = useRef<PlacementCluster | null>(null)
  placementClusterRef.current = placementCluster

  const handleMapEditModeChange = useCallback((active: boolean, handler: ((objectId: string) => void) | null) => {
    setMapEditMode(active)
    mapEditClickRef.current = handler
  }, [])

  const handleMapEditClick = useCallback((objectId: string) => {
    mapEditClickRef.current?.(objectId)
  }, [])

  const openFrame = (type: FrameType) => {
    setOpenFrames(prev => new Set(prev).add(type))
  }

  const closeFrame = (type: FrameType) => {
    setOpenFrames(prev => {
      const next = new Set(prev)
      next.delete(type)
      return next
    })
  }

  const handleSearchSelect = (nodeId: string) => {
    canvasRef.current?.zoomToNode(nodeId)
  }

  const toggleFrame = useCallback((type: FrameType) => {
    setOpenFrames(prev => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }, [])

  // Enter placement mode: hide all frames, pass cluster to Canvas
  const enterPlacementMode = useCallback((cluster: PlacementCluster) => {
    savedOpenFramesRef.current = new Set(openFrames)
    setOpenFrames(new Set())
    setPlacementCluster(cluster)
  }, [openFrames])

  // Exit placement mode: restore frames
  const exitPlacementMode = useCallback(() => {
    setPlacementCluster(null)
    if (savedOpenFramesRef.current) {
      setOpenFrames(savedOpenFramesRef.current)
      savedOpenFramesRef.current = null
    }
  }, [])

  const handlePlace = useCallback(() => {
    const cluster = placementClusterRef.current
    const anchor = canvasRef.current?.getPlacementAnchor()
    if (!anchor || !cluster) return

    cluster.onConfirm(anchor.x, anchor.y).then(() => {
      const items = cluster.items
      exitPlacementMode()
      document.dispatchEvent(new Event('coterie:refresh-canvas'))
      // Zoom to placed cluster after nodes render
      setTimeout(() => {
        const minX = Math.min(...items.map(i => i.relativeX))
        const minY = Math.min(...items.map(i => i.relativeY))
        const maxX = Math.max(...items.map(i => i.relativeX))
        const maxY = Math.max(...items.map(i => i.relativeY))
        canvasRef.current?.fitBoundsAnimated({
          x: anchor.x + minX - 50,
          y: anchor.y + minY - 50,
          width: maxX - minX + 280,
          height: maxY - minY + 160,
        })
      }, 300)
    })
  }, [exitPlacementMode])

  const handlePlaceCancel = useCallback(() => {
    placementClusterRef.current?.onCancel()
    exitPlacementMode()
    canvasRef.current?.restoreViewport()
    document.dispatchEvent(new Event('coterie:refresh-canvas'))
  }, [exitPlacementMode])

  // Hotkeys — suppressed during placement mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (placementClusterRef.current) return
      const tag = (e.target as HTMLElement).tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return
      if (e.metaKey || e.ctrlKey || e.altKey) return

      switch (e.key.toLowerCase()) {
        case 'n': canvasRef.current?.triggerCreate(); break
        case 's': toggleFrame('search'); break
        case 'm': toggleFrame('maps'); break
        case 'c': toggleFrame('coteries'); break
        case ',': toggleFrame('settings'); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleFrame])

  return (
    <div className={styles.container}>
      <Canvas ref={canvasRef} activeMapId={activeMapId} highlightedObjectIds={highlightedObjectIds} mapEditMode={mapEditMode} onMapEditClick={handleMapEditClick} placementCluster={placementCluster} />

      {!placementCluster && <NavBar onOpenFrame={openFrame} />}
      {!placementCluster && (
        <NotificationBoxes
          onOpenCoteries={() => openFrame('coteries')}
          onOpenUpdates={() => openFrame('coterie-updates')}
        />
      )}

      {placementCluster && (
        <PlacementBar
          label={placementCluster.label}
          onPlace={handlePlace}
          onCancel={handlePlaceCancel}
        />
      )}

      {openFrames.has('search') && (
        <SearchFrame
          onClose={() => closeFrame('search')}
          onSelectResult={handleSearchSelect}
        />
      )}
      {openFrames.has('maps') && (
        <MapsFrame
          onClose={() => closeFrame('maps')}
          activeMapId={activeMapId}
          onActivateMap={setActiveMapId}
          onHighlightObjects={setHighlightedObjectIds}
          onMapEditModeChange={handleMapEditModeChange}
          onMapSelected={() => canvasRef.current?.clearSelection()}
        />
      )}
      {openFrames.has('coteries') && (
        <CoteriesFrame onClose={() => closeFrame('coteries')} onOpenUpdates={() => openFrame('coterie-updates')} onEnterPlacement={enterPlacementMode} />
      )}
      {openFrames.has('coterie-updates') && (
        <CoterieUpdatesFrame onClose={() => closeFrame('coterie-updates')} onEnterPlacement={enterPlacementMode} />
      )}
      {openFrames.has('settings') && (
        <SettingsFrame onClose={() => closeFrame('settings')} />
      )}
    </div>
  )
}
