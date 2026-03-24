# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-24
**Branch:** main

### Narrative

Built the full Maps feature — CRUD, object management, multi-select integration, and canvas filtering.

**MapsFrame CRUD.** Replaced the stub MapsFrame with a full implementation. List view shows maps with name + object count on the same line (Matt preferred single-line density over stacked), gold dot indicator for active map. Create form appears inline at the bottom of the list (replaces the "+ New Map" button in place — Matt requested this over the original top-of-frame position). Edit mode for name/description. Delete with confirmation ("removes the map, not the objects"). Empty state: just "Create a map to organize your landscape into filtered views." (Matt cut "No maps yet." — the hint is enough).

**Map detail view.** Click a map to see its objects with class-colored dots and hover-to-reveal remove buttons. Search input at the bottom for adding landscape objects (debounced, keyboard nav, filters already-added objects). "Show on Canvas" toggle button (gold when active) to activate the map as a canvas filter.

**Canvas filtering.** `activeMapId` state lives in Landscape.tsx, passed to both MapsFrame and Canvas. When active, Canvas queries `maps_objects` for the map's object IDs, then filters the `user_objects` results. Connections filter naturally since they're already scoped to visible nodes. Selected items that leave the filtered set get dropped from selection.

**MultiSelectPanel integration.** Wired up the existing "New Map" and "Add to Map" stub buttons. "New Map" shows an inline name input, creates the map, adds all selected nodes, shows gold checkmark feedback. "Add to Map" loads existing maps as a picker, upserts to avoid duplicate key errors. Both reset to default actions after completion.

**Lucide `Map` icon bug.** Maps were being created in the DB but never appeared in the UI. Root cause: `import { Map } from 'lucide-react'` shadowed JavaScript's native `Map` constructor. `new Map()` inside `loadMaps` tried to instantiate a React component instead of a JS Map, threw silently, and killed the entire create flow after the form had already dismissed. Fix: renamed to `import { Map as MapIcon }`.

**UI polish.** Map name and object count on same line with `align-items: baseline` and 8px gap. Create form slides in at bottom of list (same position as the New Map button it replaces) rather than appearing above the list.

### Files Modified
- `src/components/MapsFrame.tsx` — New: full CRUD, detail view with object management, search-to-add, canvas filter toggle, `MapIcon` alias for Lucide Map
- `src/components/MapsFrame.module.css` — New: list items, create form, detail view, object list, search, delete confirmation, map picker styles
- `src/components/MultiSelectPanel.tsx` — Rebuilt: "New Map" inline form, "Add to Map" picker, feedback messages, Supabase integration
- `src/components/MultiSelectPanel.module.css` — Added: inline form, map picker, feedback styles
- `src/components/Canvas.tsx` — Added `activeMapId` prop, map-based node filtering in `refreshData`, drops filtered-out items from selection
- `src/pages/Landscape.tsx` — Added `activeMapId` state, passes to Canvas and MapsFrame

### Open Items / Next Steps
1. **Coteries frame** — list coteries, create/invite, share maps
2. **DetailPanel → Frame migration** — make detail panels draggable
3. **Light mode polish** — may need tuning after real-world use
4. **Map packages (store)** — browse + "stamp" placement onto Landscape
5. **RLS policies** — deferred until features are complete, before deploy
