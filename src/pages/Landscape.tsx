import { useCallback, useRef, useState } from 'react'
import Canvas from '../components/Canvas'
import type { CanvasRef } from '../components/Canvas'
import NavBar from '../components/NavBar'
import type { FrameType } from '../components/NavBar'
import AccountFrame from '../components/AccountFrame'
import SearchFrame from '../components/SearchFrame'
import MapsFrame from '../components/MapsFrame'
import CoteriesFrame from '../components/CoteriesFrame'
import SettingsFrame from '../components/SettingsFrame'
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

  return (
    <div className={styles.container}>
      <Canvas ref={canvasRef} activeMapId={activeMapId} highlightedObjectIds={highlightedObjectIds} mapEditMode={mapEditMode} onMapEditClick={handleMapEditClick} />
      <NavBar onOpenFrame={openFrame} />

      {openFrames.has('account') && (
        <AccountFrame onClose={() => closeFrame('account')} />
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
        <CoteriesFrame onClose={() => closeFrame('coteries')} />
      )}
      {openFrames.has('settings') && (
        <SettingsFrame onClose={() => closeFrame('settings')} />
      )}
    </div>
  )
}
