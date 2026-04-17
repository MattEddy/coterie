# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-15
**Branch:** dev (merged to main at end of session)

### Narrative

**Full code review + RPC offloading + test infrastructure + workflow improvements.** Big session covering code quality, performance, and dev process.

**Code review** (two parallel agents): Found 2 critical bugs, several high/medium issues, and 17 opportunities to move frontend queries to Supabase RPCs.

**Critical bug fixes:**
- `MultiSelectPanel.tsx` dispatched `coterie:refresh-canvas` (stale event name) — canvas never refreshed after multi-delete. Fixed to `sharing:refresh-canvas`.
- `DetailPanel.tsx` queried `maps.is_active` (column dropped in earlier migration) — Maps popover was always empty. Removed the filter.

**Other bug fixes:** HTML escaping in invite email template, optimistic toggle rollback on DB failure, email validation on share input, `navigator.platform` → `navigator.userAgent`, cosmetic coterie→map renames (CSS classes, persistKeys, import variables, comments).

**11 new RPCs** (migration `20260416000000_rpc_offloading.sql`): `create_object`, `upsert_connection`, `deactivate_connection`, `get_user_maps`, `get_pending_invites`, `get_connected_items`, `preflight_delete_object`, `set_object_types`, `accept_dissonance`, `leave_shared_map`, `get_share_picker_state`. Eliminates ~60 round trips from common user actions, adds transaction safety. All frontend files updated to call RPCs instead of direct queries.

**Test infrastructure:** Installed Vitest, created `tests/rpc.test.ts` (17 integration tests against local Supabase) and `tests/supabase.ts` (shared client). Added `npm test`, `npm run check`, `npm run test:watch` scripts. Tests caught a real bug in `upsert_connection` (ON CONFLICT on nonexistent unique constraint for roles). Matt asked about testing approach — agreed that RPC integration tests are high-value now, Playwright E2E should wait until UI stabilizes.

**Dev branch workflow:** Matt asked about backing up to GitHub without going live. Set up `dev` branch — day-to-day work pushes to `dev`, merge to `main` with `--no-ff` when ready to ship. Explained the `.env.local` toggle for local vs cloud Supabase.

**Local dev testing:** Switched `.env.local` to point at local Supabase. Matt tested the full app locally for the first time. Found several bugs during testing:
- **Delete modal + Enter key:** Pressing Enter toggled edit mode on the panel behind the delete confirmation instead of confirming the delete. Stale closure — `deleteConfirm` wasn't in the `useEffect` dependency array.
- **Map object count wrong after deletion:** `delete_object_with_cleanup` and `delete_multiple_objects` didn't clean up `maps_objects` rows for canonical objects (FK CASCADE only fires on hard-delete). Fixed in migration `20260416200000`.
- **Re-invite failure:** `maps_invitations` had unique constraint on `(map_id, email)`. After someone accepted and left, re-inviting them hit the constraint silently.

**Invitations as work queue:** Matt suggested deleting invitation rows after acceptance instead of keeping them with a status. This simplified everything — dropped the `status` column entirely (migration `20260416300000`). Rows exist only while pending. Accept = DELETE. Decline = DELETE. Re-invitations just INSERT fresh rows.

**Exit sharing UX:** Matt felt "Leave shared map" was wrong — should keep the map, just disconnect from sharing. Changed to "Exit map sharing" with confirmation "Stop sharing this map? You'll keep the map and its objects, but will stop receiving updates." Button label: "Stop Sharing". RPC keeps `maps_objects` intact.

**Auto-revert owner map:** Matt noticed that after everyone leaves a shared map, the owner's map still shows as "shared with nobody." Added logic to `leave_shared_map` RPC: when the last member exits, the owner's `origin_map_id` reverts to NULL automatically.

**Share picker filtering:** Matt asked about the share picker showing all shared maps vs only relevant ones. Changed `get_share_picker_state` to only show maps where the object is actually a member.

**Deployed:** All migrations pushed to Supabase Cloud, `dev` merged to `main` with `--no-ff`, auto-deployed to Vercel.

### Open Items / Next Steps
1. **Configure invite email webhook** — Supabase Dashboard → Webhooks → `maps_invitations` INSERT → `send-invite-email` Edge Function
2. **AWS SES production access** — submitted 2026-04-14, pending approval (sandbox mode limits sending)
3. **Stripe integration** — wire up Checkout, webhooks to update subscription status
4. **Polling → Realtime** — NotificationBoxes and UpdatesFrame poll at 30s
5. **DetailPanel → Frame migration** — back burner
6. **Light mode polish** — back burner
