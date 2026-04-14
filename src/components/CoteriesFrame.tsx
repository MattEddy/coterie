import { useState, useEffect, useRef, useCallback, forwardRef } from 'react'
import { Users, Plus, ChevronRight, Trash2, X, Map as MapIcon, UserPlus, LogOut } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'
import Frame from './Frame'
import Tooltip from './Tooltip'
import styles from './CoteriesFrame.module.css'
import type { PlacementCluster } from '../types'

// --- Types ---

interface CoterieRow {
  id: string
  name: string
  owner_id: string | null
  member_count: number
}

interface CoterieMember {
  user_id: string
  display_name: string | null
  role: string
}

interface CoterieMap {
  map_id: string
  name: string
  object_count: number
}

interface PendingInvite {
  id: string
  coterie_id: string
  coterie_name: string
  invited_by_name: string | null
  created_at: string
}

interface MapOption {
  id: string
  name: string
  object_count: number
}

interface PendingMember {
  email: string
}

// --- Coterie Detail Card ---

interface CoterieDetailCardProps {
  coterie: CoterieRow
  onClose: () => void
  onCoterieUpdated: (updated: CoterieRow) => void
  onCoterieDeleted: (coterieId: string) => void
  initialPosition: { x: number; y: number }
}

const CoterieDetailCard = forwardRef<HTMLDivElement, CoterieDetailCardProps>(function CoterieDetailCard(
  { coterie, onClose, onCoterieUpdated, onCoterieDeleted, initialPosition },
  ref
) {
  const { user } = useAuth()
  const [members, setMembers] = useState<CoterieMember[]>([])
  const [pendingMembers, setPendingMembers] = useState<PendingMember[]>([])
  const [maps, setMaps] = useState<CoterieMap[]>([])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [confirmLeave, setConfirmLeave] = useState(false)
  const [transferTargetId, setTransferTargetId] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')
  const isOwner = coterie.owner_id === user?.id
  const isAdmin = isOwner || !coterie.owner_id  // ownerless coteries: all members are admins

  const loadDetail = useCallback(async () => {
    // Load members
    const { data: memberData } = await supabase
      .from('coteries_members')
      .select('user_id, role, profiles(display_name)')
      .eq('coterie_id', coterie.id)
    if (memberData) {
      setMembers(memberData.map((m: any) => ({
        user_id: m.user_id,
        display_name: m.profiles?.display_name ?? 'Unknown',
        role: m.role,
      })))
    }

    // Load pending invitations for this coterie
    const { data: inviteData } = await supabase
      .from('coteries_invitations')
      .select('email')
      .eq('coterie_id', coterie.id)
      .eq('status', 'pending')
    if (inviteData) {
      setPendingMembers(inviteData.map((i: any) => ({ email: i.email })))
    }

    // Load linked map (1:1 — user's map with source_coterie_id)
    if (user) {
      const { data: mapData } = await supabase
        .from('maps')
        .select('id, name')
        .eq('user_id', user.id)
        .eq('source_coterie_id', coterie.id)
      if (mapData) {
        const mapRows = await Promise.all(
          mapData.map(async (m) => {
            const { count } = await supabase
              .from('maps_objects')
              .select('*', { count: 'exact', head: true })
              .eq('map_id', m.id)
            return {
              map_id: m.id,
              name: m.name ?? 'Unknown',
              object_count: count ?? 0,
            }
          })
        )
        setMaps(mapRows)
      }
    }
  }, [coterie.id, user])

  useEffect(() => {
    setConfirmDelete(false)
    setConfirmLeave(false)
    setTransferTargetId(null)
    setInviteEmail('')
    loadDetail()
  }, [coterie.id, loadDetail])

  const handleDelete = async () => {
    const { error } = await supabase.from('coteries').update({ is_active: false }).eq('id', coterie.id)
    if (error) { console.error('Failed to delete coterie:', error); return }
    onCoterieDeleted(coterie.id)
  }

  const handleLeave = async () => {
    if (!user) return

    // If owner, transfer ownership first
    if (isOwner && transferTargetId) {
      const { error: ownerError } = await supabase.from('coteries').update({ owner_id: transferTargetId }).eq('id', coterie.id)
      if (ownerError) { console.error('Failed to transfer ownership:', ownerError); return }
      const { error: roleError } = await supabase.from('coteries_members').update({ role: 'owner' }).eq('coterie_id', coterie.id).eq('user_id', transferTargetId)
      if (roleError) { console.error('Failed to update member role:', roleError); return }
    }

    // Remove self from members
    const { error: leaveError } = await supabase.from('coteries_members').delete().eq('coterie_id', coterie.id).eq('user_id', user.id)
    if (leaveError) { console.error('Failed to leave coterie:', leaveError); return }

    // Detach aggregated map (becomes personal map)
    await supabase.from('maps').update({ source_coterie_id: null }).eq('user_id', user.id).eq('source_coterie_id', coterie.id)

    onCoterieDeleted(coterie.id)
  }

  const handleInvite = async () => {
    const email = inviteEmail.trim().toLowerCase()
    if (!email || !user) return

    // Check if already a member or already invited
    const existingPending = pendingMembers.find(p => p.email === email)
    if (existingPending) return

    // Create the invitation (user_id resolved on acceptance)
    const { error } = await supabase.from('coteries_invitations').insert({
      coterie_id: coterie.id,
      invited_by: user.id,
      email,
    })
    if (error) { console.error('Invite error:', error); return }

    setPendingMembers(prev => [...prev, { email }])
    setInviteEmail('')
    onCoterieUpdated({ ...coterie, member_count: coterie.member_count + 1 })
  }

  const otherMembers = members.filter(m => m.user_id !== user?.id)

  const headerActions = (
    <>
      {(isOwner ? otherMembers.length > 0 : true) && (
        <Tooltip text="Leave coterie">
          <button className={styles.iconBtn} onClick={() => setConfirmLeave(true)}>
            <LogOut size={14} />
          </button>
        </Tooltip>
      )}
      {isAdmin && (
        <Tooltip text="Delete coterie">
          <button className={styles.iconBtn} onClick={() => setConfirmDelete(true)}>
            <Trash2 size={14} className={styles.iconBtnDanger} />
          </button>
        </Tooltip>
      )}
    </>
  )

  return (
    <Frame
      ref={ref}
      title={coterie.name}
      onClose={onClose}
      initialPosition={initialPosition}
      width={320}
      actions={headerActions}
      titleClassName={styles.entityName}
      resizable
    >
      {/* Delete confirmation */}
      {confirmDelete && (
        <div className={styles.deleteConfirm}>
          <span className={styles.deleteConfirmText}>
            Delete &ldquo;{coterie.name}&rdquo;? You&rsquo;ll keep your objects from the Coterie, but you&rsquo;ll lose the shared intel connection.
          </span>
          <div className={styles.deleteConfirmActions}>
            <button className={styles.formBtn} onClick={() => setConfirmDelete(false)}>Cancel</button>
            <button className={styles.deleteBtnConfirm} onClick={handleDelete}>Delete</button>
          </div>
        </div>
      )}

      {/* Leave confirmation */}
      {confirmLeave && (
        <div className={styles.deleteConfirm}>
          {isOwner ? (
            <>
              <span className={styles.deleteConfirmText}>
                Choose a new owner before leaving:
              </span>
              <div className={styles.memberList}>
                {otherMembers.map(m => (
                  <button
                    key={m.user_id}
                    className={`${styles.memberItem} ${transferTargetId === m.user_id ? styles.memberItemSelected : ''}`}
                    onClick={() => setTransferTargetId(m.user_id)}
                    style={{ cursor: 'pointer', border: 'none', background: transferTargetId === m.user_id ? 'var(--color-surface-2)' : 'none', borderRadius: 4, width: '100%', textAlign: 'left' }}
                  >
                    <span className={styles.memberName}>{m.display_name}</span>
                  </button>
                ))}
              </div>
              <div className={styles.deleteConfirmActions}>
                <button className={styles.formBtn} onClick={() => { setConfirmLeave(false); setTransferTargetId(null) }}>Cancel</button>
                <button className={styles.deleteBtnConfirm} onClick={handleLeave} disabled={!transferTargetId}>Leave</button>
              </div>
            </>
          ) : (
            <>
              <span className={styles.deleteConfirmText}>
                Leave &ldquo;{coterie.name}&rdquo;? You&rsquo;ll keep your objects, but you&rsquo;ll lose the shared intel connection.
              </span>
              <div className={styles.deleteConfirmActions}>
                <button className={styles.formBtn} onClick={() => setConfirmLeave(false)}>Cancel</button>
                <button className={styles.deleteBtnConfirm} onClick={handleLeave}>Leave</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Linked map banner */}
      {maps.length > 0 && (
        <div className={styles.linkedBanner}>
          <MapIcon size={12} className={styles.linkedBannerIcon} />
          <span>Linked to Map <strong>{maps[0].name}</strong></span>
        </div>
      )}

      {/* Members */}
      <div className={styles.detailSection}>
        <span className={styles.sectionLabel}>Members ({members.length})</span>
        <div className={styles.memberList}>
          {members.map(m => (
            <div key={m.user_id} className={styles.memberItem}>
              <span className={styles.memberName}>
                {m.display_name}
                {m.user_id === user?.id && ' (you)'}
              </span>
              <span className={styles.memberRole}>{m.role}</span>
            </div>
          ))}
          {pendingMembers.map(p => (
            <div key={p.email} className={styles.memberItem}>
              <span className={styles.memberName}>{p.email}</span>
              <span className={styles.pendingBadge}>pending</span>
            </div>
          ))}
        </div>
      </div>

      {/* Invite member */}
      {isAdmin && (
        <div className={styles.detailSection}>
          <div className={styles.emailTags} onClick={() => document.getElementById(`invite-${coterie.id}`)?.focus()}>
            <input
              id={`invite-${coterie.id}`}
              className={styles.emailInput}
              type="email"
              placeholder="Invite by email..."
              value={inviteEmail}
              onChange={e => setInviteEmail(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); handleInvite() }
              }}
            />
            {inviteEmail.trim() && (
              <button className={styles.acceptBtn} onClick={handleInvite}>
                <UserPlus size={12} />
              </button>
            )}
          </div>
        </div>
      )}

    </Frame>
  )
})

// --- Create Coterie Form ---

interface CreateCoterieFormProps {
  onCreated: () => void
  onCancel: () => void
}

function CreateCoterieForm({ onCreated, onCancel }: CreateCoterieFormProps) {
  const { user } = useAuth()
  const [name, setName] = useState('')
  const [emails, setEmails] = useState<string[]>([])
  const [emailInput, setEmailInput] = useState('')
  const [maps, setMaps] = useState<MapOption[]>([])
  const [selectedMapId, setSelectedMapId] = useState<string | null>(null)

  useEffect(() => {
    if (!user) return
    const load = async () => {
      const { data } = await supabase
        .from('maps')
        .select('id, name, source_coterie_id')
        .eq('user_id', user.id)
        .is('source_coterie_id', null)
        .order('name')
      if (!data) return
      const withCounts = await Promise.all(
        data.map(async (m) => {
          const { count } = await supabase
            .from('maps_objects')
            .select('*', { count: 'exact', head: true })
            .eq('map_id', m.id)
          return { id: m.id, name: m.name, object_count: count ?? 0 }
        })
      )
      setMaps(withCounts)
    }
    load()
  }, [user])

  const addEmail = () => {
    const email = emailInput.trim().toLowerCase()
    if (!email || emails.includes(email)) return
    setEmails(prev => [...prev, email])
    setEmailInput('')
  }

  const removeEmail = (email: string) => {
    setEmails(prev => prev.filter(e => e !== email))
  }

  const selectMap = (mapId: string) => {
    const newId = selectedMapId === mapId ? null : mapId
    setSelectedMapId(newId)
    // Auto-populate name from selected map
    if (newId && !name) {
      const map = maps.find(m => m.id === mapId)
      if (map) setName(`${map.name} Coterie`)
    }
  }

  const handleCreate = async () => {
    // Scoop up any email typed but not yet added
    const pendingEmail = emailInput.trim().toLowerCase()
    const finalEmails = pendingEmail && !emails.includes(pendingEmail)
      ? [...emails, pendingEmail]
      : emails
    if (!user || !name.trim() || !selectedMapId) return

    const { data: coterieId, error } = await supabase.rpc('create_coterie_with_map', {
      p_user_id: user.id,
      p_name: name.trim(),
      p_map_id: selectedMapId,
      p_emails: finalEmails,
    })
    if (error || !coterieId) { console.error('Coterie create error:', error); return }

    onCreated()
  }

  return (
    <div className={styles.createForm}>
      <div>
        <div className={styles.fieldLabel}>Name</div>
        <input
          className={styles.input}
          placeholder="e.g. Literary Agents Coterie"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
        />
      </div>

      <div>
        <div className={styles.fieldLabel}>Map</div>
        {maps.length > 0 ? (
          <div className={styles.mapPicker}>
            {maps.map(m => (
              <button
                key={m.id}
                className={`${styles.mapPickerItem} ${selectedMapId === m.id ? styles.mapPickerItemSelected : ''}`}
                onClick={() => selectMap(m.id)}
              >
                <MapIcon size={14} style={{ color: 'var(--color-accent)', flexShrink: 0 }} />
                <span className={styles.mapPickerName}>{m.name}</span>
                <span className={styles.mapPickerCount}>{m.object_count}</span>
              </button>
            ))}
          </div>
        ) : (
          <span className={styles.coterieMeta} style={{ fontSize: 12 }}>No maps yet. Create a map first.</span>
        )}
      </div>

      <div>
        <div className={styles.fieldLabel}>Invite members</div>
        <div className={styles.emailTags} onClick={() => document.getElementById('create-email-input')?.focus()}>
          {emails.map(e => (
            <span key={e} className={styles.emailTag}>
              {e}
              <button className={styles.emailTagRemove} onClick={() => removeEmail(e)}><X size={10} /></button>
            </span>
          ))}
          <input
            id="create-email-input"
            className={styles.emailInput}
            type="email"
            placeholder={emails.length ? '' : 'Enter email, press Enter'}
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); addEmail() }
              if (e.key === 'Backspace' && !emailInput && emails.length) {
                removeEmail(emails[emails.length - 1])
              }
            }}
            onBlur={() => { if (emailInput.trim()) addEmail() }}
          />
        </div>
      </div>

      <div className={styles.formActions}>
        <button className={styles.formBtn} onClick={onCancel}>Cancel</button>
        <button
          className={`${styles.formBtn} ${styles.formBtnPrimary}`}
          onClick={handleCreate}
          disabled={!name.trim() || !selectedMapId}
        >
          Create
        </button>
      </div>
    </div>
  )
}

// --- Main Coteries Frame ---

interface CoteriesFrameProps {
  onClose: () => void
  onOpenUpdates?: () => void
  onEnterPlacement?: (cluster: PlacementCluster) => void
}

export default function CoteriesFrame({ onClose, onOpenUpdates, onEnterPlacement }: CoteriesFrameProps) {
  const { user } = useAuth()
  const [coteries, setCoteries] = useState<CoterieRow[]>([])
  const [invitations, setInvitations] = useState<PendingInvite[]>([])
  const [selectedCoterieId, setSelectedCoterieId] = useState<string | null>(null)
  const [openedCoterie, setOpenedCoterie] = useState<CoterieRow | null>(null)
  const [creating, setCreating] = useState(false)
  const listFrameRef = useRef<HTMLDivElement>(null)
  const detailFrameRef = useRef<HTMLDivElement>(null)
  const [detailPosition, setDetailPosition] = useState({ x: 388, y: 180 })

  const loadCoteries = useCallback(async () => {
    if (!user) return

    // Get coteries the user is a member of
    const { data: memberRows } = await supabase
      .from('coteries_members')
      .select('coterie_id')
      .eq('user_id', user.id)
    if (!memberRows) return

    const coterieIds = memberRows.map(r => r.coterie_id)
    if (coterieIds.length === 0) { setCoteries([]); return }

    const { data: coterieData } = await supabase
      .from('coteries')
      .select('id, name, owner_id')
      .in('id', coterieIds)
      .eq('is_active', true)
      .order('name')
    if (!coterieData) return

    const rows = await Promise.all(
      coterieData.map(async (c) => {
        const { count: memberCount } = await supabase
          .from('coteries_members')
          .select('*', { count: 'exact', head: true })
          .eq('coterie_id', c.id)
        return { ...c, member_count: memberCount ?? 0 }
      })
    )
    setCoteries(rows)
  }, [user])

  const loadInvitations = useCallback(async () => {
    if (!user) return

    // Find invitations by email (look up user's email from auth)
    const { data: { user: authUser } } = await supabase.auth.getUser()
    if (!authUser?.email) return

    const { data: inviteData } = await supabase
      .from('coteries_invitations')
      .select('id, coterie_id, created_at, invited_by, coteries(name)')
      .eq('email', authUser.email)
      .eq('status', 'pending')
    if (!inviteData) return

    // Look up inviter names
    const inviterIds = [...new Set((inviteData as any[]).map(i => i.invited_by))]
    const { data: inviterProfiles } = inviterIds.length > 0
      ? await supabase.from('profiles').select('user_id, display_name').in('user_id', inviterIds)
      : { data: [] }
    const inviterNames = new Map((inviterProfiles ?? []).map(p => [p.user_id, p.display_name]))

    setInvitations(inviteData.map((i: any) => ({
      id: i.id,
      coterie_id: i.coterie_id,
      coterie_name: i.coteries?.name ?? 'Unknown',
      invited_by_name: inviterNames.get(i.invited_by) ?? 'Someone',
      created_at: i.created_at,
    })))
  }, [user])

  // Per-coterie dissonance counts for "Updates" badges
  const [updateCounts, setUpdateCounts] = useState<Map<string, number>>(new Map())

  const loadUpdateCounts = useCallback(async () => {
    if (!user) return
    const { data } = await supabase.rpc('get_dissonances', { p_user_id: user.id })
    if (!data) return
    const counts = new Map<string, number>()
    for (const d of (data as any[]).filter(d => !d.is_dismissed)) {
      counts.set(d.coterie_id, (counts.get(d.coterie_id) ?? 0) + 1)
    }
    setUpdateCounts(counts)
  }, [user])

  useEffect(() => { loadCoteries(); loadInvitations(); loadUpdateCounts() }, [loadCoteries, loadInvitations, loadUpdateCounts])

  // Refresh when new invites arrive (detected by NotificationBoxes polling)
  useEffect(() => {
    const handler = () => { loadInvitations(); loadCoteries() }
    document.addEventListener('coteries:refresh', handler)
    return () => document.removeEventListener('coteries:refresh', handler)
  }, [loadInvitations, loadCoteries])

  // Click anywhere outside coteries UI to deselect
  useEffect(() => {
    if (!selectedCoterieId) return

    const handleClickOutside = (e: MouseEvent) => {
      if (listFrameRef.current?.contains(e.target as Node)) return
      if (detailFrameRef.current?.contains(e.target as Node)) return
      setSelectedCoterieId(null)
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [selectedCoterieId])

  const handleAcceptInvite = async (invite: PendingInvite) => {
    if (!user) return

    // Step 1: Accept invitation and get placement data via RPC
    const { data: result, error } = await supabase.rpc('accept_coterie_invitation', {
      p_user_id: user.id,
      p_invitation_id: invite.id,
    })
    if (error || !result || result.error) { console.error('Accept error:', error || result?.error); return }

    // Step 2: If no new items to place, just refresh
    if (result.items.length === 0) {
      await loadCoteries(); await loadInvitations()
      document.dispatchEvent(new Event('coterie:refresh-canvas'))
      return
    }

    // Enter placement mode
    onEnterPlacement?.({
      label: result.coterie_name || 'Shared Map',
      items: result.items.map((item: any) => ({
        id: item.objectId,
        name: item.name,
        class: item.class,
        relativeX: item.relativeX,
        relativeY: item.relativeY,
      })),
      connections: result.connections || [],
      onConfirm: async (anchorX: number, anchorY: number) => {
        await supabase.rpc('place_coterie_objects', {
          p_user_id: user.id,
          p_coterie_id: result.coterie_id,
          p_anchor_x: anchorX,
          p_anchor_y: anchorY,
          p_items: result.items,
        })
        await loadCoteries(); await loadInvitations()
        document.dispatchEvent(new Event('coterie:refresh-canvas'))
      },
      onCancel: async () => {
        // Still place at default position
        await supabase.rpc('place_coterie_objects', {
          p_user_id: user.id,
          p_coterie_id: result.coterie_id,
          p_anchor_x: 0,
          p_anchor_y: 0,
          p_items: result.items,
        })
        await loadCoteries(); await loadInvitations()
        document.dispatchEvent(new Event('coterie:refresh-canvas'))
      },
    })
  }

  const handleDeclineInvite = async (invite: PendingInvite) => {
    await supabase
      .from('coteries_invitations')
      .update({ status: 'declined' })
      .eq('id', invite.id)
    await loadInvitations()
  }

  const computeDetailPosition = () => {
    const rect = listFrameRef.current?.getBoundingClientRect()
    if (rect) {
      setDetailPosition({ x: rect.right + 8, y: rect.top })
    }
  }

  const handleCoterieClick = (coterie: CoterieRow) => {
    const newId = selectedCoterieId === coterie.id ? null : coterie.id
    setSelectedCoterieId(newId)
    if (openedCoterie && newId && newId !== openedCoterie.id) {
      setOpenedCoterie(coterie)
    }
  }

  const handleCoterieDoubleClick = (coterie: CoterieRow) => {
    computeDetailPosition()
    setOpenedCoterie(coterie)
    setSelectedCoterieId(coterie.id)
  }

  const handleCoterieUpdated = (updated: CoterieRow) => {
    setOpenedCoterie(updated)
    setCoteries(prev => prev.map(c => c.id === updated.id ? updated : c))
  }

  const handleCoterieDeleted = (_coterieId: string) => {
    setOpenedCoterie(null)
    setSelectedCoterieId(null)
    loadCoteries()
    document.dispatchEvent(new Event('maps:refresh'))
  }

  return (
    <>
      <Frame ref={listFrameRef} title="Coteries" titleTooltip="Manage your trusted sharing circles" onClose={onClose} initialPosition={{ x: 60, y: 180 }} width={280} resizable persistKey="coteries">
        {/* Pending invitations */}
        {invitations.length > 0 && (
          <div className={styles.invitationsSection}>
            <span className={styles.sectionLabel}>Invitations</span>
            {invitations.map(inv => (
              <div key={inv.id} className={styles.inviteItem}>
                <div className={styles.inviteInfo}>
                  <span className={styles.inviteName}>{inv.coterie_name}</span>
                  <span className={styles.inviteFrom}>from {inv.invited_by_name}</span>
                </div>
                <div className={styles.inviteActions}>
                  <button className={styles.acceptBtn} onClick={() => handleAcceptInvite(inv)}>
                    Accept
                  </button>
                  <button className={styles.declineBtn} onClick={() => handleDeclineInvite(inv)}>
                    <X size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Coteries list */}
        {coteries.length > 0 ? (
          <div className={styles.coteriesList}>
            {coteries.map(c => (
              <button
                key={c.id}
                className={`${styles.coterieItem} ${selectedCoterieId === c.id ? styles.coterieItemSelected : ''}`}
                onClick={() => handleCoterieClick(c)}
                onDoubleClick={() => handleCoterieDoubleClick(c)}
                onKeyDown={e => { if (e.key === 'ArrowRight') { e.preventDefault(); handleCoterieDoubleClick(c) } }}
              >
                <Users size={14} className={styles.coterieIcon} />
                <div className={styles.coterieInfo}>
                  <div className={styles.coterieNameRow}>
                    <span className={styles.coterieName}>{c.name}</span>
                    {updateCounts.get(c.id) && onOpenUpdates && (
                      <Tooltip text="View coterie updates">
                        <span
                          role="button"
                          className={styles.updatesBadge}
                          onClick={e => { e.stopPropagation(); onOpenUpdates() }}
                        >
                          {updateCounts.get(c.id)} {updateCounts.get(c.id) === 1 ? 'update' : 'updates'}
                        </span>
                      </Tooltip>
                    )}
                  </div>
                  <span className={styles.coterieMeta}>
                    {c.member_count} {c.member_count === 1 ? 'member' : 'members'}
                  </span>
                </div>
                {selectedCoterieId === c.id && (
                  <div className={styles.coterieActions}>
                    <Tooltip text="Open coterie details">
                      <span
                        role="button"
                        className={styles.coterieActionBtn}
                        onClick={e => { e.stopPropagation(); handleCoterieDoubleClick(c) }}
                      >
                        <ChevronRight size={13} />
                      </span>
                    </Tooltip>
                  </div>
                )}
              </button>
            ))}
          </div>
        ) : !creating && invitations.length === 0 ? (
          <div className={styles.empty}>
            Create a coterie to share maps and intel with your trusted circle.
          </div>
        ) : null}

        {/* Create form or button */}
        {creating ? (
          <CreateCoterieForm
            onCreated={() => { setCreating(false); loadCoteries() }}
            onCancel={() => setCreating(false)}
          />
        ) : (
          <button className={styles.newCoterieBtn} onClick={() => setCreating(true)}>
            <Plus size={14} />
            Create Coterie
          </button>
        )}
      </Frame>

      {openedCoterie && (
        <CoterieDetailCard
          ref={detailFrameRef}
          coterie={openedCoterie}
          onClose={() => setOpenedCoterie(null)}
          onCoterieUpdated={handleCoterieUpdated}
          onCoterieDeleted={handleCoterieDeleted}
          initialPosition={detailPosition}
        />
      )}
    </>
  )
}
