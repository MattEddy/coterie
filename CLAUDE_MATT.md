# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-09
**Branch:** main

### Narrative

Big session — keyboard UX, deletion audit, and a major coterie sharing feature.

**Visual polish.** Swapped invite landing page logo from motto version to plain (`logo-name.svg`). Fixed object pill subtitle colors — `.type` spans were hardcoded to `var(--color-text-muted)`, overriding class-specific colors. Changed to `color: inherit`. Also moved pill subtitle font to Inter (both titles-as-subtitle and types-as-subtitle). Created `--font-data` CSS variable in `global.css` and consolidated all 17 Inter references across 5 files. Added "Log In" button to home page header nav.

**Soft/hard delete audit.** Reviewed every table's deletion strategy. Conclusion: keep `is_active` on `objects`, `connections`, `coteries` (canonical/shared data, needed for future operator tooling). Removed `is_active` from `maps` — user-owned data should hard delete. Converted `MapsFrame.handleDelete` from `update({ is_active: false })` to `delete()`, removed the filter. Created cloud migration `20260409000000_drop_maps_is_active.sql`.

**Keyboard UX overhaul.** Added focus trapping to `Frame.tsx` (Tab cycles within panel, ESC closes). DetailPanel got its own focus trap since it doesn't use Frame — `tabIndex={-1}`, auto-focus on mount/object change, keydown handler on the panel element. Initially had issues: Tab did nothing for many presses (hidden focusable elements), then escaped to navbar. Fixed by always `preventDefault` on Tab, filtering to visible elements only (`offsetParent !== null`), and manually tracking focus index. Also added: Enter toggles edit mode in DetailPanel, Delete/Backspace triggers delete confirmation (single and multi-select), right arrow opens detail cards in Maps/Coteries lists, hotkey hints (S/M/C/,) on NavBar menu items.

**Auto-add maps bug.** Found during the `is_active` removal — `Canvas.tsx:720` still filtered `.eq('is_active', true)` on a column that no longer existed, silently returning no rows. Same stale filter in `MultiSelectPanel.tsx:48`. Fixed both.

**Maps refresh on delete.** Object deletion in DetailPanel and MultiSelectPanel wasn't dispatching `maps:refresh`, so the maps list showed stale counts and the map detail showed stale object names. Added the event dispatch to both deletion paths.

**DetailPanel vertical expansion fix.** The proportional anchor algorithm recalculated `top` on every content change (expanding projects, editing, etc.), causing the panel to jump. Fixed by only calculating `top` on initial placement (tracked via `initialTopSet` ref keyed by `object.id`), then only updating `left` on subsequent re-renders.

**Coterie sharing — the big feature.** Matt wanted per-item, per-coterie control over sharing contacts, projects, and events. Went through three iterations:

1. **First attempt: `share_contacts` on `coteries_members`** — per-member toggle controlling whether your contacts are visible. Worked but was all-or-nothing per coterie.

2. **Second attempt: added `coterie_shared` on `objects_overrides`** — per-project/event boolean. Combined with share_contacts, gave two separate systems with different granularity. Matt realized both were too blunt.

3. **Final design: `coteries_shares` join table** — one universal table: `(coterie_id, user_id, object_id, share_type)`. One row = "I share this thing with this coterie." Same gesture everywhere, fully granular. Ripped out both previous flags and rebuilt.

Built `CoterieSharePicker` component — share icon (lights up gold when active) that opens a portal-rendered dropdown of the user's coteries with checkboxes. Wired into DetailPanel: contact section header, expanded project/event action bars. Created `get_coterie_shared_intel()` SECURITY DEFINER RPC for cross-user queries (needed because `connections_overrides` RLS requires both endpoints in shared maps, but projects/events aren't in maps). Intel renders in Coterie Intel sections of Contact, Projects, and Events tabs.

Had to fix the RPC — initial version filtered `cs.object_id = p_object_id` which only found contact shares (where the shared object IS the viewed person). Projects/events are different objects connected via `connections_overrides`. Split the query into `contact_results` (direct match) and `item_shares` (found via peer's connections).

Dropdown initially clipped by parent overflow — fixed with `createPortal` to render at document body level with fixed positioning. Gold indicator initially only showed after opening dropdown — fixed by loading share status eagerly on mount.

Renamed table from `coterie_shares` to `coteries_shares` for naming consistency.

**Files modified (key ones):**
- `src/components/Frame.tsx` — focus trap, ESC close, auto-focus
- `src/components/DetailPanel.tsx` — focus trap, Enter/Delete keys, coterie shares intel, fixed vertical expansion
- `src/components/DetailPanel.module.css` — coterieSharedToggle, coterieIntelItem styles
- `src/components/CoterieSharePicker.tsx` — new component
- `src/components/CoterieSharePicker.module.css` — new styles
- `src/components/MapsFrame.tsx` — right arrow, removed share_contacts
- `src/components/CoteriesFrame.tsx` — right arrow, removed share_contacts toggle
- `src/components/MultiSelectPanel.tsx` — Delete key, maps refresh, removed stale is_active
- `src/components/Canvas.tsx` — removed stale is_active on auto-add maps
- `src/components/NavBar.tsx` — hotkey hints on menu items
- `src/components/ObjectNode.module.css` — type color fix, font-data variable
- `src/styles/global.css` — added `--font-data` variable
- `src/pages/Home.tsx` — Login button in header
- `supabase/migrations/20260409300000_coterie_shares.sql` — coteries_shares table, RLS, RPC
- `supabase/migrations/20260409400000_rename_coteries_shares.sql` — rename

### Open Items / Next Steps
1. **Object detail UI cleanup** — Matt wants to clean up overlapping/redundant buttons in the detail panel
2. **Extend coteries_shares to notes** — discuss applying the same per-coterie sharing system to shared_notes (currently shared with ALL coterie members automatically)
3. **Shared project/event intel needs testing** — the RPC fix for project/event shares was deployed but Matt hadn't confirmed it working before ending session
4. **Stripe integration** — wire up Checkout, webhooks to update subscription status
5. **Polling → Realtime** — NotificationBoxes and CoterieUpdatesFrame poll at 30s
6. **DetailPanel → Frame migration** — back burner
7. **Light mode polish** — back burner
