# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-31
**Branch:** main

### Narrative

Bug fix and UX polish session focused on coterie sharing, placement flow, and edge selection. All coterie sharing tested and confirmed working end-to-end.

**Encryption strategy jam (carried over from previous session).** Tier roadmap with encryption details already committed to CLAUDE.md: Pro (standard), Secure (E2EE contacts add-on), Studio (AI), Free (local Tauri app).

**Edge selection bug.** Clicking a relationship line did nothing — the highlight was set by `handleEdgeClick` but immediately cleared by the `useEffect` reacting to `setSelectedItems([])`. Added `edgeClickedRef` guard. First version had a second bug: the ref got consumed on the first effect run, but `useOnSelectionChange` fired asynchronously triggering a second run. Fix: don't reset the ref in the effect — only clear it in `handleNodeClick` and `handlePaneClick`.

**Map objects showing "Unknown" for user-created objects.** `MapsFrame.loadMapObjects` queried `objects` directly (where user-created rows have `name = NULL`). Switched to query through `user_objects` view which coalesces overrides — consistent with rest of app.

**Coterie sharing: blank shapes + spurious dissonances.** The acceptance flow in `CoteriesFrame.handleAcceptInvite` only wrote `map_x`/`map_y` to the recipient's `objects_overrides`. User-created objects (skeleton `objects` row) rendered as blank shapes because `COALESCE(NULL, NULL) = NULL`. Fix: fetch owner's overrides (name, title, status) and copy them into recipient's overrides on insert. Also: owner's user-created connections (`connections_overrides` with `connection_id IS NULL`) weren't being copied, causing 8 spurious `new_connection` dissonances. Fix: fetch and duplicate those connection overrides for the recipient.

**Ghost placement UX overhaul.**
- Visual: changed from dim colored silhouettes with text labels to white outline shapes with SVG glow filter (`feGaussianBlur` + `feMerge`). No fill, no text — just ghostline outlines.
- Interaction: replaced click-to-grab/click-to-release with standard Mac drag (mousedown to grab, mousemove to drag, mouseup to release).
- PlacementBar text: "Drag to place **Coterie Name** objects." for multiple items, "Drag to place **Object Name**." for single items. Added `itemCount` prop.

### Files Modified
- `src/components/Canvas.tsx` — `edgeClickedRef` for edge selection race fix, cleared in `handleNodeClick`/`handlePaneClick`; placement drag changed from mousedown-to-drop to mouseup-to-drop
- `src/components/RoleEdge.tsx` — unchanged (already correct)
- `src/components/MapsFrame.tsx` — `loadMapObjects` switched from `objects` table to `user_objects` view
- `src/components/CoteriesFrame.tsx` — acceptance flow copies owner's name/title/status into recipient overrides; fetches and copies owner's user-created connections; ghost preview includes user-created connections
- `src/components/PlacementOverlay.tsx` — white outline ghost shapes with glow filter, no text labels
- `src/components/PlacementBar.tsx` — dynamic text based on `itemCount` prop
- `src/pages/Landscape.tsx` — passes `itemCount` to PlacementBar
- `CLAUDE.md` — edge click gotcha, coterie acceptance data copy gotcha, accept-and-place marked done

### Open Items / Next Steps
1. **DetailPanel -> Frame migration** — make detail panels draggable
2. **Light mode polish** — may need tuning
3. **Map packages (store)** — browse + stamp placement
4. **Non-user invitation flow** — email sending, landing page with interactive demo, signup/payment
5. **Swap polling for Broadcast/Realtime** — when deploying to Supabase Cloud
6. **RLS policies** — real policies before deploy (permissive placeholders currently on 3 tables)
7. **Delete AccountFrame files** — now unused after account menu migration
