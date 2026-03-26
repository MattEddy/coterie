# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-25
**Branch:** main

### Narrative

Major session: brainstormed and decided the coterie creation/sharing model, then built the entire coterie system end-to-end.

**Brainstorm (coterie creation & invitation model).** Explored three models: V1 (group-first coteries), V2 (map-first implicit groups), V2-B (bilateral sharing). Killed V2-B immediately — no compound intel. Stress-tested every simplification: pure overlap sharing is too narrow, per-group scoping is irreducible. Matt slept on V1 vs V2, came back firmly on V1: "Keep coteries. They afford flexibility, mirror real life, and have a cool 'in-crowd' vibe that elevates the app."

**Key design decisions from brainstorm:**
- Coteries require maps — no empty containers. Primary creation path is from a map's detail card (share icon), so the coterie is born from a concrete sharing action.
- Coterie name defaults to "[Map Name] Coterie", editable immediately.
- Share button should be an icon (not text).
- **The aggregated recipient map** — the breakthrough insight. Regardless of how many maps the sender links, the recipient gets ONE map named after the coterie. `maps.source_coterie_id` links it. Solves: Mr. Micro's 17 maps problem, non-user onboarding, CoteriesFrame creation uniformity. One column, five jobs (creation, dissonance acceptance, UI treatment, leaving, dedup prevention).
- New user viral path: email invite → landing page with interactive mini-Landscape demo (real seed objects, draggable/clickable) → credit-card-free trial → auto-placed objects → minimal welcome modal: "This is your Landscape. Your changes are yours." Two sentences establishing autonomy.
- Existing user path: email + in-app notification → accept in CoteriesFrame → "accept and place" with one click.
- Ongoing sync via dissonance detection (diff-based, not stored events) — already designed in schema, queries not yet built.

**Implementation — schema.** Added `source_coterie_id UUID REFERENCES coteries(id)` to `maps` table (deferred FK since maps is created before coteries). Created `coterie_invitations` table (coterie_id, invited_by, email, user_id, status, token). Updated DROP list, added updated_at trigger. `supabase db reset` verified clean.

**Implementation — CoteriesFrame.** Replaced stub with full UI. List of user's coteries (name, member count, map count). Pending invitations section with Accept/Decline. Create Coterie form with name input, map picker (horizontal wrap pills with gold border on select), email tags input (Enter to add, Backspace to remove last). Detail card (Finder-like double-click to open): members list with pending indicators, invite-by-email input, linked maps, delete with confirmation. Finder-like click-outside deselection.

**Implementation — map share icon.** Added Share2 icon to MapsFrame detail card header. Click opens inline form: coterie name (pre-filled), email tags. Creates coterie + member + map link + invitations.

**Implementation — invitation acceptance.** Full flow in `handleAcceptInvite`: marks invitation accepted, adds user as member, collects all objects from all coterie maps (union), creates aggregated recipient map with `source_coterie_id`, populates `maps_objects`, creates `objects_overrides` with positions derived from owner's layout (centroid-relative). Dispatches `coterie:refresh-canvas` DOM event so Canvas reloads.

**Bug: blank screen after adding refreshData to CanvasRef.** Adding `refreshData` to `useImperativeHandle`'s dependency array caused a render loop that killed both browser windows. Reverted the ref approach entirely. Replaced with DOM event pattern: `coterie:refresh-canvas` dispatched by CoteriesFrame, listened to by Canvas via `useEffect`. Same pattern as existing `coterie:node-click`. Much safer — no dependency array changes to `useImperativeHandle`.

**Bug: edge highlights persisting after selection clear.** The edge highlight `useEffect` only ran for `selectedItems.length >= 2` — never had an `else` to unhighlight. Added else branch that resets any `highlighted: true` edges back to default style.

**UX fixes:**
- Disabled button styling (`.formBtnPrimary:disabled` with opacity 0.35 + not-allowed cursor) on both CoteriesFrame and MapsFrame. The Create button was silently unclickable when no map was selected.
- Map picker pills: changed from vertical list to `flex-wrap` horizontal pills with `border-radius: 20px` and full `border-color` gold on selection (was `outline` which only showed corners).
- MultiSelectPanel: creating a map now dispatches `coterie:map-created` CustomEvent → MapsFrame listens, reloads, selects new map. Panel calls `onClose()` to clear selection.
- CoteriesFrame: click-outside deselection (same pattern as MapsFrame).

### Files Modified
- `supabase/migrations/20260203000000_pro_schema.sql` — `maps.source_coterie_id`, `coterie_invitations` table, deferred FK, updated_at trigger
- `src/components/CoteriesFrame.tsx` — complete rewrite: list, invitations, create form, detail card, acceptance flow
- `src/components/CoteriesFrame.module.css` — new: full styling for coteries UI
- `src/components/MapsFrame.tsx` — Share2 icon, share form (coterie creation from map), email tags state/handlers
- `src/components/MapsFrame.module.css` — disabled button, email tag styles
- `src/components/Canvas.tsx` — `coterie:refresh-canvas` listener, edge unhighlight on selection clear
- `src/components/MultiSelectPanel.tsx` — `coterie:map-created` event dispatch, `onClose()` after create
- `src/pages/Landscape.tsx` — (briefly added/reverted onDataChanged prop)

### Open Items / Next Steps
1. **Dissonance detection queries** — the diff engine comparing overrides across coterie members. Core of the ongoing intel sync. Next major build task.
2. **Coterie intel display** — showing shared notes/tags from coterie members on overlapping objects (pure query pattern, no new tables)
3. **Non-user invitation flow** — email sending, landing page with interactive demo, signup/payment. Needs deployment infrastructure (Vercel + Supabase Cloud + email service).
4. **"Accept and place" UX for existing users** — currently auto-places at centroid-relative (0,0). Should let user click canvas to set anchor point.
5. **DetailPanel → Frame migration** — make detail panels draggable
6. **Light mode polish** — may need tuning
7. **RLS policies** — before deploy
