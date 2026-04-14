import { supabase } from './supabase'

/**
 * Accept a shared map invitation by token. Handles:
 * - Marking invitation accepted
 * - Creating recipient map copy (origin_map_id -> origin)
 * - Creating objects_overrides (auto-placed from owner's layout)
 * - Copying owner's user-created connections
 *
 * For first-time users (empty landscape), objects are auto-placed
 * using the owner's relative layout centered at (0, 0).
 */
export async function acceptInvitationByToken(userId: string, token: string): Promise<boolean> {
  const { data: result, error } = await supabase.rpc('accept_map_invitation', {
    p_user_id: userId,
    p_token: token,
  })
  if (error || !result || result.error) return false

  if (result.items && result.items.length > 0) {
    await supabase.rpc('place_shared_objects', {
      p_user_id: userId,
      p_origin_map_id: result.origin_map_id,
      p_anchor_x: 0,
      p_anchor_y: 0,
      p_items: result.items,
    })
  }
  return true
}
