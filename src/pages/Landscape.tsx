import { useCallback, useEffect, useRef, useState } from 'react'
import Canvas from '../components/Canvas'
import type { CanvasRef } from '../components/Canvas'
import NavBar from '../components/NavBar'
import type { FrameType } from '../components/NavBar'
import SearchFrame from '../components/SearchFrame'
import MapsFrame from '../components/MapsFrame'
import SettingsFrame from '../components/SettingsFrame'
import UpdatesFrame from '../components/UpdatesFrame'
import NotificationBoxes from '../components/NotificationBoxes'
import PlacementBar from '../components/PlacementBar'
import HelpButton from '../components/HelpButton'
import { useAuth } from '../contexts/AuthContext'
import { supabase } from '../lib/supabase'
import { acceptInvitationByToken } from '../lib/acceptInvitation'
import type { PlacementCluster } from '../types'
import styles from './Landscape.module.css'

interface WelcomeState {
  senderName: string
  needsName: boolean
  step: 'name' | 'intro'
}

export default function Landscape() {
  const { user } = useAuth()
  const canvasRef = useRef<CanvasRef>(null)
  const [openFrames, setOpenFrames] = useState<Set<FrameType>>(new Set())
  const [welcomeModal, setWelcomeModal] = useState<WelcomeState | null>(null)
  const [welcomeName, setWelcomeName] = useState('')
  const [welcomeSaving, setWelcomeSaving] = useState(false)
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
      document.dispatchEvent(new Event('sharing:refresh-canvas'))
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
    document.dispatchEvent(new Event('sharing:refresh-canvas'))
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
        case ',': toggleFrame('settings'); break
        default: return
      }
      e.preventDefault()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [toggleFrame])

  // Check for pending invite (logged-in user from invite flow) or welcome modal flag (from Login)
  // Ref guard: sessionStorage flags are one-shot — StrictMode double-fires effects, and user
  // reference changes can re-trigger. Without this, the second run finds empty sessionStorage.
  const welcomeCheckedRef = useRef(false)
  useEffect(() => {
    if (!user) return
    if (welcomeCheckedRef.current) return
    welcomeCheckedRef.current = true

    async function checkAndShowWelcome() {
      // Check profile directly (resilient to StrictMode, no sessionStorage dependency)
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name')
        .eq('user_id', user!.id)
        .single()
      const needsName = !profile?.display_name

      // Case 1: Already-logged-in user with a pending invite token
      const pendingToken = sessionStorage.getItem('pendingInviteToken')
      if (pendingToken) {
        sessionStorage.removeItem('pendingInviteToken')

        // Use SECURITY DEFINER RPC to look up invitation by token (RLS-safe)
        const { data: invData } = await supabase
          .rpc('get_invitation_by_token', { invite_token: pendingToken })

        const inv = invData?.[0]
        if (!inv || inv.status !== 'pending') return

        const senderName = inv.sender_name || 'Someone'

        const accepted = await acceptInvitationByToken(user!.id, pendingToken)
        if (accepted) {
          document.dispatchEvent(new Event('sharing:refresh-canvas'))
          document.dispatchEvent(new Event('sharing:refresh-notifications'))
          setWelcomeModal({ senderName, needsName, step: needsName ? 'name' : 'intro' })
        }
        return
      }

      // Case 2: User just came through Login which already accepted the invite
      const showWelcome = sessionStorage.getItem('showWelcomeModal')
      if (showWelcome) {
        sessionStorage.removeItem('showWelcomeModal')
        let senderName = 'Someone'

        // Find the most recently joined shared map and get the origin owner's name
        const { data: sharedMap } = await supabase
          .from('maps')
          .select('origin_map_id')
          .eq('user_id', user!.id)
          .not('origin_map_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()

        if (sharedMap?.origin_map_id) {
          const { data: originMap } = await supabase
            .from('maps')
            .select('user_id')
            .eq('id', sharedMap.origin_map_id)
            .single()

          if (originMap?.user_id) {
            const { data: sender } = await supabase
              .from('profiles')
              .select('display_name')
              .eq('user_id', originMap.user_id)
              .single()
            if (sender?.display_name) senderName = sender.display_name
          }
        }

        document.dispatchEvent(new Event('sharing:refresh-notifications'))
        setWelcomeModal({ senderName, needsName, step: needsName ? 'name' : 'intro' })
        return
      }

      // Case 3: New user who signed up directly (no invite) — still needs name
      if (needsName) {
        setWelcomeModal({ senderName: '', needsName: true, step: 'name' })
      }
    }
    checkAndShowWelcome()
  }, [user])

  return (
    <div className={styles.container}>
      <Canvas ref={canvasRef} activeMapId={activeMapId} highlightedObjectIds={highlightedObjectIds} mapEditMode={mapEditMode} onMapEditClick={handleMapEditClick} placementCluster={placementCluster} />

      {!placementCluster && <NavBar onOpenFrame={openFrame} />}
      {!placementCluster && (
        <NotificationBoxes
          onOpenMaps={() => openFrame('maps')}
          onOpenUpdates={() => openFrame('updates')}
        />
      )}

      {placementCluster && (
        <PlacementBar
          label={placementCluster.label}
          itemCount={placementCluster.items.length}
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
          onEnterPlacement={enterPlacementMode}
        />
      )}
      {openFrames.has('updates') && (
        <UpdatesFrame onClose={() => closeFrame('updates')} onEnterPlacement={enterPlacementMode} />
      )}
      {openFrames.has('settings') && (
        <SettingsFrame onClose={() => closeFrame('settings')} />
      )}

      {!placementCluster && <HelpButton />}

      {welcomeModal && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalCard}>
            {welcomeModal.step === 'name' ? (
              <>
                <h2 className={styles.modalTitle}>Welcome to Coterie</h2>
                <p className={styles.modalText}>
                  Please enter your name to get started.
                </p>
                <form onSubmit={async (e) => {
                  e.preventDefault()
                  if (!welcomeName.trim() || !user) return
                  setWelcomeSaving(true)
                  await supabase
                    .from('profiles')
                    .update({ display_name: welcomeName.trim() })
                    .eq('user_id', user.id)
                  setWelcomeSaving(false)
                  setWelcomeModal({ ...welcomeModal, step: 'intro' })
                }} className={styles.modalForm}>
                  <input
                    className={styles.modalInput}
                    type="text"
                    placeholder="Your name"
                    value={welcomeName}
                    onChange={e => setWelcomeName(e.target.value)}
                    autoFocus
                  />
                  <button
                    className={styles.modalButton}
                    type="submit"
                    disabled={welcomeSaving || !welcomeName.trim()}
                  >
                    {welcomeSaving ? 'Saving...' : 'Continue'}
                  </button>
                </form>
              </>
            ) : (
              <>
                <h2 className={styles.modalTitle}>This is your Landscape</h2>
                <p className={styles.modalText}>
                  It's private and unique to you. Change it, add to it, make it your own.
                </p>
                <p className={styles.modalText}>
                  For shared maps, collaborators are notified of each
                  other&rsquo;s updates. You&rsquo;ll have the option to synchronize each change.
                </p>
                <p className={styles.modalText}>
                  Double click on an empty spot to create a new object.
                </p>
                <button
                  className={styles.modalButton}
                  onClick={() => setWelcomeModal(null)}
                >
                  Got it
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
