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
  const { data: result, error } = await supabase.rpc('accept_coterie_invitation', {
    p_user_id: userId,
    p_token: token,
  })
  if (error || !result || result.error) return false

  if (result.items && result.items.length > 0) {
    await supabase.rpc('place_coterie_objects', {
      p_user_id: userId,
      p_coterie_id: result.coterie_id,
      p_anchor_x: 0,
      p_anchor_y: 0,
      p_items: result.items,
    })
  }
  return true
}
