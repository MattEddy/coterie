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
  // Accept invitation via SECURITY DEFINER RPC (RLS-safe: user is not yet a member)
  const { data: accepted, error: acceptError } = await supabase
    .rpc('accept_invitation_by_token', { p_token: token, p_user_id: userId })

  if (acceptError) {
    console.error('Failed to accept invitation:', acceptError)
    return false
  }

  const inv = accepted?.[0]
  if (!inv) return false

  // Add user as member
  const { error: memberError } = await supabase.from('coteries_members').insert({
    coterie_id: inv.coterie_id,
    user_id: userId,
    role: 'member',
  })
  if (memberError) {
    console.error('Failed to add coterie member:', memberError)
    return false
  }

  // Collect all objects from coterie's maps
  const { data: coterieMaps, error: mapsError } = await supabase
    .from('coteries_maps')
    .select('map_id')
    .eq('coterie_id', inv.coterie_id)

  if (mapsError) {
    console.error('Failed to load coterie maps:', mapsError)
    return false
  }

  const allObjectIds = new Set<string>()
  if (coterieMaps) {
    const mapObjResults = await Promise.all(
      coterieMaps.map(cm =>
        supabase.from('maps_objects').select('object_ref_id').eq('map_id', cm.map_id)
      )
    )
    for (const { data: mapObjs, error } of mapObjResults) {
      if (error) {
        console.error('Failed to load map objects:', error)
        continue
      }
      if (mapObjs) mapObjs.forEach(o => allObjectIds.add(o.object_ref_id))
    }
  }

  // Get coterie name for recipient map
  const { data: coterie, error: coterieError } = await supabase
    .from('coteries')
    .select('name, owner_id')
    .eq('id', inv.coterie_id)
    .single()

  if (coterieError) {
    console.error('Failed to load coterie:', coterieError)
    return false
  }

  // Create aggregated recipient map
  const { data: newMap, error: mapCreateError } = await supabase
    .from('maps')
    .insert({
      name: coterie?.name ?? 'Shared Map',
      user_id: userId,
      source_coterie_id: inv.coterie_id,
    })
    .select('id')
    .single()

  if (mapCreateError) {
    console.error('Failed to create recipient map:', mapCreateError)
    return false
  }

  if (newMap && allObjectIds.size > 0) {
    const { error: mapObjError } = await supabase.from('maps_objects').insert(
      Array.from(allObjectIds).map(objId => ({
        map_id: newMap.id,
        object_ref_id: objId,
      }))
    )
    if (mapObjError) {
      console.error('Failed to populate recipient map:', mapObjError)
    }
  }

  // Find objects the user doesn't already have
  const { data: existingOverrides, error: existingError } = await supabase
    .from('objects_overrides')
    .select('object_id')
    .eq('user_id', userId)

  if (existingError) {
    console.error('Failed to check existing overrides:', existingError)
    return false
  }

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
  const { error: overridesError } = await supabase.from('objects_overrides').insert(overrides)
  if (overridesError) {
    console.error('Failed to create object overrides:', overridesError)
    return false
  }

  // Copy owner's type overrides so recipient starts with the same effective types
  if (ownerId) {
    const { data: ownerTypes } = await supabase
      .from('objects_types_overrides')
      .select('object_id, type_id, is_primary')
      .eq('user_id', ownerId)
      .in('object_id', newObjectIds)
    if (ownerTypes && ownerTypes.length > 0) {
      const { error: typesError } = await supabase.from('objects_types_overrides').insert(
        ownerTypes.map(t => ({
          user_id: userId,
          object_id: t.object_id,
          type_id: t.type_id,
          is_primary: t.is_primary,
        }))
      )
      if (typesError) {
        console.error('Failed to copy type overrides:', typesError)
      }
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
      const { error: connsError } = await supabase.from('connections_overrides').insert(
        ownerConns.map(c => ({
          user_id: userId,
          object_a_id: c.object_a_id,
          object_b_id: c.object_b_id,
          role_a: c.role_a,
          role_b: c.role_b,
          deactivated: false,
        }))
      )
      if (connsError) {
        console.error('Failed to copy connections:', connsError)
      }
    }
  }

  return true
}
