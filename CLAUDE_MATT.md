# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-27
**Branch:** main

### Narrative

Major session: built the complete coterie sharing pipeline — both channels (intel + updates) are now operational end-to-end. Also multiple UI polish fixes.

**Dissonance detection (`get_dissonances` SQL function).** Built a SQL function that computes all structural differences between a user's data and their coterie members' data, scoped to objects in shared maps. Originally 4 types (new_object, new_connection, deactivated_connection, career_move), later extended to 5 with `type_change`. The shared scope includes both `coteries_maps` (sender's shared maps) and `source_coterie_id` maps (recipient's aggregated maps). Each dissonance includes dismissal tracking via `coteries_reviews`. Seed data exercises all 5 types with Billy having divergent data from Matt.

**CoterieUpdatesFrame (standalone dissonance view).** Matt wanted dissonances in their own frame, not inside CoteriesFrame. Built `CoterieUpdatesFrame.tsx` with hover-reveal Accept/Ignore buttons (not visible by default — "so we don't have a column of accepts"). Accept handlers differ by type: new_object creates override + adds to aggregated map, new_connection copies the connection, deactivated_connection mirrors the deactivation, career_move syncs differing fields only, type_change replaces `objects_types_overrides`.

**NotificationBoxes.** Floating boxes below NavBar — one for coterie invitations (opens CoteriesFrame), one for coterie updates (opens CoterieUpdatesFrame). Only appear when there are notifications. Matt specifically asked for separate boxes per notification type, not a combined count.

**Per-coterie "updates" badge.** Gold pill badge next to coterie names in the CoteriesFrame list showing update count. Clicking opens CoterieUpdatesFrame. Matt asked for "a tiny bit more space" between name and badge (gap: 6px → 10px).

**Type changes as Channel 2 (5th dissonance type).** Matt proposed moving tag/type changes to Channel 2 (dissonances) instead of Channel 1 (intel). Reasoning: types are structural ("is this person an Executive or a Creative?"), not subjective commentary. The query compares sorted effective type arrays using the existing `objects_types_overrides` → `objects_types` fallback pattern. Accept copies the member's full type set. Render shows `+Added −Removed` format.

**Cross-user update mechanism.** Attempted Supabase Realtime postgres_changes — added tables to `supabase_realtime` publication and enabled RLS with permissive policies. Didn't work in local dev (known issue — Realtime container has JWT validation/RLS pipeline issues locally, GitHub #21624). Matt pushed for research before more fixes: "Can we do some research before we just keep trying fixes? This seems pretty fundamental." Research confirmed three options: postgres_changes (broken locally), Broadcast (requires manual send at every write point), polling (simple, works). Went with **3-second polling** as the pragmatic V1 solution, with a note to swap to Broadcast/postgres_changes on Supabase Cloud.

**Coterie Intel (Channel 1).** Built the passive intel display in DetailPanel. When viewing an object shared with coterie members, their `shared_notes` appear in the Notes tab and their `data.contacts` appear in the Contact tab — attributed to the author. `private_notes` is never selected. Query: find coterie peer user IDs via `coteries_members`, then query their `objects_overrides` for the same object.

**Contact adopt with fingerprint tracking.** Matt identified the dedup problem: automatic matching is unreliable (phone formats, address variations, personal labels). Proposed voluntary adoption: "give a way to add coterie data to MY data and remove it from the coterie list (for me)." Built a `+` button (hover-reveal) on each coterie intel contact. Clicking copies the contact to the user's `data.contacts` and stores a fingerprint (`"userId:type:value"`) in `data.adopted_intel`. Adopted contacts are filtered out of the intel display. Matt called the fingerprint approach "magic."

**Frame height persistence fix.** The Coteries frame was rendering tiny because Frame.tsx saved height on every drag (not just resize), locking auto-sized frames to stale heights. Fixed: only persist `h` on explicit resize. Height no longer restored from persisted layout — frames auto-size to content.

**DetailPanel types read-only.** Matt asked to hide the types `+` button until header edit mode is active. The `+` now only appears when the pencil icon is clicked. Cancelling or saving header edit also closes the tag picker.

**MapsFrame edit close button.** Two × buttons were showing during map detail edit (one to cancel edit, one to close panel). Matt wanted just the cancel-edit button. Fixed: Frame's `onClose` becomes cancel-edit when editing, removing the duplicate.

### Files Modified
- `supabase/migrations/20260203000000_pro_schema.sql` — `get_dissonances()` function (5 types), Realtime publication + RLS policies
- `supabase/seed.sql` — Billy's landscape, coterie scenario with all 5 dissonance types, coterie intel seed data
- `src/components/CoterieUpdatesFrame.tsx` — NEW: standalone dissonance frame
- `src/components/CoterieUpdatesFrame.module.css` — NEW: styling with hover-reveal actions
- `src/components/NotificationBoxes.tsx` — NEW: floating notification boxes with polling
- `src/components/NotificationBoxes.module.css` — NEW: positioning below NavBar
- `src/components/CoteriesFrame.tsx` — stripped dissonances, added update counts + badge, `onOpenUpdates` prop
- `src/components/CoteriesFrame.module.css` — updates badge styles, removed dissonance styles
- `src/components/DetailPanel.tsx` — coterie intel loading + display (notes + contacts), contact adopt with fingerprints, types read-only until edit mode
- `src/components/DetailPanel.module.css` — coterie intel section + adopt button styles
- `src/components/Frame.tsx` — height persistence fix (only on resize), `userResized` ref
- `src/components/MapsFrame.tsx` — single close button during edit
- `src/components/NavBar.tsx` — `'coterie-updates'` added to FrameType
- `src/pages/Landscape.tsx` — CoterieUpdatesFrame + NotificationBoxes wiring

### Open Items / Next Steps
1. **"Accept and place" UX** — click canvas to position accepted objects instead of auto-placing at member's coordinates
2. **Non-user invitation flow** — email sending, landing page with interactive demo, signup/payment. Needs deployment infrastructure.
3. **Swap polling for Broadcast/Realtime** — when deploying to Supabase Cloud where the Realtime pipeline works properly
4. **DetailPanel → Frame migration** — make detail panels draggable
5. **Light mode polish** — may need tuning
6. **RLS policies** — real policies before deploy (permissive placeholders currently on 3 tables)
