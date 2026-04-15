# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-14
**Branch:** main

### Narrative

**Designed and implemented the coterie→map collapse.** Session started as a design jam (Matt: "I had a crazy thought") and progressed to full implementation in a single session.

**Design phase:** Validated that the coterie abstraction was pure indirection after the 1:1 migration. Every coterie concept maps 1:1 to a map concept. Matt emphasized the brand benefit — "coterie" as both app name and feature name made marketing copy awkward. Landed on `origin_map_id` (self-ref for origin, NULL for unshared) as the connective tissue. Matt specifically asked NULL vs self-ref for the owner — self-ref won because every query becomes `WHERE origin_map_id = :origin` (no OR clause needed).

**Implementation:** Full stack in one session:
- **SQL migration** (`20260415000000_collapse_coteries_into_maps.sql`): Added `origin_map_id` to maps, migrated data from coterie relationships, renamed `coteries_invitations`/`coteries_shares`/`coteries_reviews` → `maps_*`, dropped `coteries` + `coteries_members`, rewrote all 5 SECURITY DEFINER helpers and all RPCs, rewrote all RLS policies. Hit a cloud-vs-local policy naming issue (cloud had `coterie_shares_*` without the 's', local had `coteries_shares_*`) — fixed with `DROP POLICY IF EXISTS` for both variants.
- **Frontend** (22 files, net -1,767 lines): Deleted `CoteriesFrame` entirely. `MapsFrame` absorbed sharing UI — members list, pending invitations with accept/place flow, share action. Renamed `CoterieUpdatesFrame` → `UpdatesFrame`, `CoterieSharePicker` → `SharePicker`. Updated all event names (`coterie:*` → `sharing:*`/`canvas:*`/`maps:*`). Updated `DetailPanel` (RPC + labels), `NavBar` (removed C hotkey), `Landscape` (removed coteries frame type), `NotificationBoxes`, invitation pages, Home page.
- **Edge function** (`send-invite-email`): Updated to reference `maps_invitations` + `maps` table.

**Bugs found during testing:**
- `authUser` doesn't exist in `useAuth()` — the Supabase `User` object (with `.email`) is just `user`. Fixed.
- Cloud migration failed first attempt due to policy name mismatch — policies on cloud were `coterie_shares_*` (from an earlier rename migration) vs `coteries_shares_*` locally. Fixed by adding both naming variants to DROP POLICY statements.
- Matt flagged: after sharing a map, the inline "Invite by email" input stayed visible with no submit button. Simplified: share button is always available in the header — opens email form for both initial sharing and adding more collaborators. Removed the inline invite input entirely.
- Matt flagged: redundant "Shared map — 1 member" banner above Members section. Removed — the section label already says "Members (N)".

**Deployed:** Migration pushed to Supabase Cloud, frontend pushed to GitHub/Vercel. Webhook for invite emails was never configured on cloud (noted as future task).

### Open Items / Next Steps
1. **Configure invite email webhook** — Supabase Dashboard → Webhooks → `maps_invitations` INSERT → `send-invite-email` Edge Function (+ Resend API key)
2. **Stripe integration** — wire up Checkout, webhooks to update subscription status
3. **Polling → Realtime** — NotificationBoxes and UpdatesFrame poll at 30s
4. **DetailPanel → Frame migration** — back burner
5. **Light mode polish** — back burner
