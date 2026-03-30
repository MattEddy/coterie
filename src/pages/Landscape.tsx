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
import styles from './Landscape.module.css'

export default function Landscape() {
  const canvasRef = useRef<CanvasRef>(null)
  const [openFrames, setOpenFrames] = useState<Set<FrameType>>(new Set())
  const [activeMapId, setActiveMapId] = useState<string | null>(null)
  const [highlightedObjectIds, setHighlightedObjectIds] = useState<string[] | null>(null)
  const [mapEditMode, setMapEditMode] = useState(false)
  const mapEditClickRef = useRef<((objectId: string) => void) | null>(null)

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

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
      <Canvas ref={canvasRef} activeMapId={activeMapId} highlightedObjectIds={highlightedObjectIds} mapEditMode={mapEditMode} onMapEditClick={handleMapEditClick} />
      <NavBar onOpenFrame={openFrame} />
      <NotificationBoxes
        onOpenCoteries={() => openFrame('coteries')}
        onOpenUpdates={() => openFrame('coterie-updates')}
      />

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
        <CoteriesFrame onClose={() => closeFrame('coteries')} onOpenUpdates={() => openFrame('coterie-updates')} />
      )}
      {openFrames.has('coterie-updates') && (
        <CoterieUpdatesFrame onClose={() => closeFrame('coterie-updates')} />
      )}
      {openFrames.has('settings') && (
        <SettingsFrame onClose={() => closeFrame('settings')} />
      )}
    </div>
  )
}
