import { supabase } from './supabase'

interface EffectiveConnection {
  id: string
  object_a_id: string
  object_b_id: string
  role_a?: string | null
  role_b?: string | null
  isUserCreated: boolean
}

/**
 * Fetches the effective set of connections for an object from the current user's
 * perspective: canonical (minus deactivated) + user-created.
 */
export async function getEffectiveConnections(objectId: string, userId: string): Promise<EffectiveConnection[]> {
  const { data: canonConns } = await supabase
    .from('connections')
    .select('id, object_a_id, object_b_id, role_a, role_b')
    .eq('is_active', true)
    .or(`object_a_id.eq.${objectId},object_b_id.eq.${objectId}`)

  const { data: userConns } = await supabase
    .from('connections_overrides')
    .select('id, object_a_id, object_b_id, role_a, role_b')
    .eq('user_id', userId)
    .is('connection_id', null)
    .or(`object_a_id.eq.${objectId},object_b_id.eq.${objectId}`)

  const { data: deactivated } = await supabase
    .from('connections_overrides')
    .select('connection_id')
    .eq('user_id', userId)
    .not('connection_id', 'is', null)
    .eq('deactivated', true)

  const deactivatedIds = new Set((deactivated || []).map(d => d.connection_id))

  return [
    ...(canonConns || []).filter(c => !deactivatedIds.has(c.id)).map(c => ({ ...c, isUserCreated: false })),
    ...(userConns || []).map(c => ({ ...c, isUserCreated: true })),
  ]
}

/** Returns the "other" object ID from a connection relative to the given objectId. */
export function otherObjectId(conn: { object_a_id: string; object_b_id: string }, objectId: string): string {
  return conn.object_a_id === objectId ? conn.object_b_id : conn.object_a_id
}
