# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-10
**Branch:** main

### Narrative

Major session — notes-as-objects, DetailPanel UI overhaul, full RPC migration, cross-platform fixes, and a help button.

**Notes as first-class objects.** Matt wanted multi-note support with per-note coterie sharing. Jammed on two approaches: JSONB array in overrides vs notes-as-objects. Notes-as-objects won — zero schema changes to existing tables, just two vocabulary rows (`note` class with `landscape_visible=false`, `Note On` role). Each note = skeleton `objects` row + `objects_overrides` (text in `name`) + `connections_overrides` (link to parent). Sharing via `coteries_shares` with `share_type='note'` works out of the box since each note has its own UUID. Dropped old `shared_notes`/`private_notes` TEXT columns from both `objects_overrides` and `connections_overrides` (no data in them). Updated `user_objects` view and `get_coterie_shared_intel()` RPC. Migration: `20260410000000_notes_as_objects.sql`.

Contact info intentionally stays as JSONB (`data.contacts`) — the access pattern is read/write as a group, and per-contact-field sharing granularity isn't needed.

**DetailPanel UI overhaul.** Matt wanted the four tab sections (Contact, Notes, Projects, Events) to feel more like the Maps/Coteries lists:

- Replaced floating hover action buttons with permanent `+ Add` dashed buttons at the bottom of each tab section
- Replaced native `<select>` for contact types with a custom themed dropdown (native dropdown ignores dark mode)
- Adopted gold Save / ghost Cancel button pattern from CoteriesFrame (right-justified, Save disabled until valid data)
- Flattened project create form — all fields visible immediately when clicking `+ Add project` (eliminated the stutter step where you had to type a name and confirm before seeing description/status/tags fields). Added `onChange` callback to `ObjectSearch` to sync typed name to `newItemValues` as user types.
- Reordered action buttons across all tabs: Edit, Link, Share, Delete (trash icon instead of X)
- Moved type pills above description in view/edit/create modes
- Removed redundant status line from expanded project view (already shown in gold next to name in header)
- Removed item body border-top for seamless card feel
- Added spacing above "Also linked to" section
- Made coterie intel projects/events expandable with chevron (same pattern as user's own items)
- Gold "From Name:" attribution on coterie intel sources
- `CoterieSharePicker` got optional `tooltip` prop

**Server-side RPC migration.** Matt asked if frontend logic could move to Supabase for future multi-client support (iPad, etc.). Audited the entire frontend — found 11 multi-step DB operations totaling ~970 lines of orchestration code. Built 12 RPCs (accept_coterie_invitation split into prepare + place) in `20260410100000_rpc_operations.sql`. Updated 5 frontend files. JS bundle dropped from 768KB to 755KB. Key RPCs:

- `create_note`, `create_connected_item` — atomic object creation
- `delete_object_with_cleanup`, `delete_connected_item`, `delete_multiple_objects` — deletion with orphan cleanup (previously the most dangerous client-side operations)
- `create_coterie_with_maps`, `share_map_as_coterie` — coterie creation
- `accept_coterie_invitation` + `place_coterie_objects` — two-step for placement UX (was 15+ calls, duplicated in 2 files)
- `save_item_with_types`, `link_existing_item`, `create_map_with_objects` — simpler operations

Vercel deployment initially failed — two unused variables (`noteId`, `newId`) from RPC return values. Fixed and re-pushed.

**Cross-platform input fixes.** Audited Canvas.tsx for Windows/Linux compatibility. Found two bugs:
- `event.metaKey` without `event.ctrlKey` in multi-select click handler — Windows users couldn't Ctrl+click
- `multiSelectionKeyCode="Meta"` hardcoded — changed to platform-detected (`Meta` on Mac, `Control` on Windows)
- Pan is middle-click drag or Space+drag — Matt confirmed this is fine.

**Help button.** Matt wanted a `?` button in the bottom-right corner for controls reference. Built `HelpButton.tsx` — 38x38 rounded rectangle, z-index 150, three tabs (Canvas, Shortcuts, Panel). Hidden during placement mode. Iterative styling: started circular, Matt wanted rounded rectangle, then larger, then tighter padding, then tabbed instead of all-at-once.

**Bug fixes.**
- Coterie deletion didn't dispatch `maps:refresh` — MapsFrame showed stale coterie-linked maps. Fixed by adding event dispatch to `handleCoterieDeleted`.
- Map deletion blocked after parent coterie deleted — the delete button queried `source_coterie_id` coterie without checking `is_active`. Soft-deleted coterie still existed, so it still blocked. Added `.eq('is_active', true)` and `.maybeSingle()` to fall through to delete confirmation.
- Create coterie showed "No maps yet" despite maps existing — `CreateCoterieForm` queried `.eq('is_active', true)` on `maps` table, but `is_active` was dropped from maps in an earlier migration. Removed the stale filter.
- Enter key on save button double-fired `saveHeader()` — keyboard handler and native button click both triggered. Fixed by bailing out of keyboard handler when focus is on a button (`if (inInput || onButton) return`).

**Files modified (key ones):**
- `supabase/migrations/20260410000000_notes_as_objects.sql` — note class, role, column drops, view + RPC updates
- `supabase/migrations/20260410100000_rpc_operations.sql` — 12 server-side RPCs
- `src/components/DetailPanel.tsx` — notes UI, add buttons, save/cancel, action order, RPC calls (went from ~2100 to ~1800 lines)
- `src/components/DetailPanel.module.css` — addNewRow, noteCard, formBtn, contactType dropdown, linkedList spacing
- `src/components/CoterieSharePicker.tsx` — tooltip prop, 'note' share type
- `src/components/ObjectSearch.tsx` — onChange callback
- `src/components/Canvas.tsx` — metaKey + ctrlKey, platform-detected multiSelectionKeyCode
- `src/components/MultiSelectPanel.tsx` — RPC calls
- `src/components/MapsFrame.tsx` — RPC call, is_active fix on delete check
- `src/components/CoteriesFrame.tsx` — RPC calls, maps:refresh on delete, is_active fix on map query
- `src/lib/acceptInvitation.ts` — rewritten to use 2 RPCs (went from 229 to 31 lines)
- `src/components/HelpButton.tsx` + `.module.css` — new component
- `src/pages/Landscape.tsx` — HelpButton import + render
- `src/components/ObjectNode.tsx` — removed shared_notes/private_notes from interface
- `src/pages/Home.tsx`, `src/pages/InviteLanding.tsx` — removed shared_notes/private_notes from demo data

### Open Items / Next Steps
1. **Stripe integration** — wire up Checkout, webhooks to update subscription status
2. **Test RPC migration end-to-end** — all 12 RPCs deployed to cloud but only basic flows tested in-session
3. **Test coterie invitation acceptance** — the accept flow was significantly restructured (two-RPC approach)
4. **Polling → Realtime** — NotificationBoxes and CoterieUpdatesFrame poll at 30s
5. **DetailPanel → Frame migration** — back burner
6. **Light mode polish** — back burner
