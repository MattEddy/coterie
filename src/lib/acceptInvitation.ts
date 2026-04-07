import { supabase } from './supabase'

/**
 * Accept a coterie invitation by token. Handles:
 * - Marking invitation accepted
 * - Adding user to coteries_members
 * - Creating aggregated recipient map
 * - Creating objects_overrides (auto-placed from owner's layout)
 * - Copying owner's user-created connections
 *
 * For first-time users (empty landscape), objects are auto-placed
 * using the owner's relative layout centered at (0, 0).
 */
export async function acceptInvitationByToken(userId: string, token: string): Promise<boolean> {
  // Fetch invitation
  const { data: inv } = await supabase
    .from('coteries_invitations')
    .select('id, coterie_id, status')
    .eq('token', token)
    .single()

  if (!inv || inv.status !== 'pending') return false

  // Mark accepted
  await supabase
    .from('coteries_invitations')
    .update({ status: 'accepted', user_id: userId })
    .eq('id', inv.id)

  // Add user as member
  await supabase.from('coteries_members').insert({
    coterie_id: inv.coterie_id,
    user_id: userId,
    role: 'member',
  })

  // Collect all objects from coterie's maps
  const { data: coterieMaps } = await supabase
    .from('coteries_maps')
    .select('map_id')
    .eq('coterie_id', inv.coterie_id)

  const allObjectIds = new Set<string>()
  if (coterieMaps) {
    for (const cm of coterieMaps) {
      const { data: mapObjs } = await supabase
        .from('maps_objects')
        .select('object_ref_id')
        .eq('map_id', cm.map_id)
      if (mapObjs) mapObjs.forEach(o => allObjectIds.add(o.object_ref_id))
    }
  }

  // Get coterie name for recipient map
  const { data: coterie } = await supabase
    .from('coteries')
    .select('name, owner_id')
    .eq('id', inv.coterie_id)
    .single()

  // Create aggregated recipient map
  const { data: newMap } = await supabase
    .from('maps')
    .insert({
      name: coterie?.name ?? 'Shared Map',
      user_id: userId,
      source_coterie_id: inv.coterie_id,
    })
    .select('id')
    .single()

  if (newMap && allObjectIds.size > 0) {
    await supabase.from('maps_objects').insert(
      Array.from(allObjectIds).map(objId => ({
        map_id: newMap.id,
        object_ref_id: objId,
      }))
    )
  }

  // Find objects the user doesn't already have
  const { data: existingOverrides } = await supabase
    .from('objects_overrides')
    .select('object_id')
    .eq('user_id', userId)
  const existingIds = new Set(existingOverrides?.map(o => o.object_id) ?? [])
  const newObjectIds = Array.from(allObjectIds).filter(id => !existingIds.has(id))

  if (newObjectIds.length === 0) return true

  // Get owner positions for relative layout
  const ownerId = coterie?.owner_id
  let ownerPositions = new Map<string, { x: number; y: number }>()
  if (ownerId) {
    const { data: ownerOv } = await supabase
      .from('objects_overrides')
      .select('object_id, map_x, map_y')
      .eq('user_id', ownerId)
      .in('object_id', newObjectIds)
    if (ownerOv) {
      for (const ov of ownerOv) {
        if (ov.map_x != null && ov.map_y != null) {
          ownerPositions.set(ov.object_id, { x: ov.map_x, y: ov.map_y })
        }
      }
    }
  }

  // Compute centroid
  const positions = Array.from(ownerPositions.values())
  const centroid = positions.length > 0
    ? {
        x: positions.reduce((s, p) => s + p.x, 0) / positions.length,
        y: positions.reduce((s, p) => s + p.y, 0) / positions.length,
      }
    : { x: 0, y: 0 }

  // Get owner's override data (name, title, status) for user-created objects
  const { data: ownerOverrideRows } = ownerId
    ? await supabase
        .from('objects_overrides')
        .select('object_id, name, title, status')
        .eq('user_id', ownerId)
        .in('object_id', newObjectIds)
    : { data: [] }
  const ownerOverrides = new Map((ownerOverrideRows ?? []).map(o => [o.object_id, o]))

  // Auto-place objects centered at (0, 0)
  const overrides = newObjectIds.map(id => {
    const ownerPos = ownerPositions.get(id)
    const oo = ownerOverrides.get(id)
    return {
      user_id: userId,
      object_id: id,
      map_x: ownerPos ? ownerPos.x - centroid.x : 0,
      map_y: ownerPos ? ownerPos.y - centroid.y : 0,
      ...(oo?.name && { name: oo.name }),
      ...(oo?.title && { title: oo.title }),
      ...(oo?.status && { status: oo.status }),
    }
  })
  await supabase.from('objects_overrides').insert(overrides)

  // Copy owner's type overrides so recipient starts with the same effective types
  if (ownerId) {
    const { data: ownerTypes } = await supabase
      .from('objects_types_overrides')
      .select('object_id, type_id, is_primary')
      .eq('user_id', ownerId)
      .in('object_id', newObjectIds)
    if (ownerTypes && ownerTypes.length > 0) {
      await supabase.from('objects_types_overrides').insert(
        ownerTypes.map(t => ({
          user_id: userId,
          object_id: t.object_id,
          type_id: t.type_id,
          is_primary: t.is_primary,
        }))
      )
    }
  }

  // Copy owner's user-created connections between these objects
  if (ownerId) {
    const { data: ownerConns } = await supabase
      .from('connections_overrides')
      .select('object_a_id, object_b_id, role_a, role_b')
      .eq('user_id', ownerId)
      .is('connection_id', null)
      .eq('deactivated', false)
      .in('object_a_id', newObjectIds)
      .in('object_b_id', newObjectIds)

    if (ownerConns && ownerConns.length > 0) {
      await supabase.from('connections_overrides').insert(
        ownerConns.map(c => ({
          user_id: userId,
          object_a_id: c.object_a_id,
          object_b_id: c.object_b_id,
          role_a: c.role_a,
          role_b: c.role_b,
          deactivated: false,
        }))
      )
    }
  }

  return true
}
