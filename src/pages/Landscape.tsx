import { useRef, useState } from 'react'
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
      <Canvas ref={canvasRef} />
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
        <MapsFrame onClose={() => closeFrame('maps')} />
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
