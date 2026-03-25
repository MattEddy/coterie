# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-24
**Branch:** main

### Narrative

Major Maps panel overhaul — Finder-like UX, gold map highlights, click-to-edit mode, resizable frames, and workspace persistence.

**Frame enhancements.** Started with double-click title bar to collapse/expand. Then added `actions` prop (buttons in the header between title and close), `forwardRef` (so MapsFrame can read list frame position to place detail card), and `titleClassName` (white titles for entity names vs gold for panel names). Later added `headerContent` prop — content rendered inside the header div below the title row, above the border-bottom line. This was needed because Matt wanted map description and auto-add hint to appear "above the line" with the title. Initial attempts to do this via content-area padding adjustments failed ("we're going in circles") — the fix was putting the content literally inside the header.

**Finder-like Maps list.** Restructured MapsFrame from a single-panel list/detail toggle into two independent Frame cards. List card (280px) always visible. Single click selects a map (gold outline on the list item). Double-click opens the detail card to the right (positioned via list frame's `getBoundingClientRect()`). Matt explicitly wanted Mac Finder behavior: click to select, double-click to open, click outside to deselect.

**Gold map highlights.** When a map is selected in the list, all its objects light up with gold borders on the canvas. Data flow: MapsFrame tracks `mapObjectIds` → passes IDs up via `onHighlightObjects` → Landscape → Canvas syncs `mapHighlighted` flag into node data → ObjectNode renders `.mapHighlighted` class. CSS specificity matters — `.mapHighlighted` must come after `.org`/`.person` to override their border colors.

**Click-to-edit mode.** MousePointerClick icon button on selected map items. When active, clicking canvas objects toggles them in/out of the map. Optimistic updates with `mapObjectIdsRef` for rapid-click correctness. 400ms debounce prevents double-click from toggling twice. Edit mode locks map selection, auto-closes the detail card, replaces "+New Map" button with gold hint text: "Select objects to add/remove them from the {name} map." White selection borders are fully suppressed during edit mode (`nodesSelectable={false}` + `mapEditMode` flag in node data).

**Isolate button.** Focus icon on selected map items toggles `activeMapId` (same as the old "Show on Canvas" button, which was removed from the detail card).

**Deselection challenges.** Matt wanted true Finder-like deselection: clicking ANYWHERE outside the map tile deselects. Started with mousedown on document, but React Flow uses pointer capture for nodes, so global mouse listeners miss node clicks. Fix: dual mechanism — global mousedown for non-canvas clicks + custom `coterie:node-click` DOM event dispatched from Canvas's `onNodeClick`. Also needed drag awareness: mousedown fires before we know it's a drag, but `onNodeClick` doesn't fire after drags, so the custom event approach handles this naturally. Map selection clears canvas selection (`clearSelection()` on CanvasRef). Object clicks deselect the map.

**Object selection interactions.** Matt requested: (1) selecting a map clears object selection, (2) clicking an object (not dragging) deselects the map, (3) dragging should NOT deselect. Also: gold borders must suppress white selection during highlight — both when dragging highlighted nodes and in edit mode. Fix: ObjectNode checks `mapHighlighted` and `mapEditMode` before applying `.selected` class.

**Mac-style resize.** Matt asked if resize could work "like the Mac" — hover any edge/corner for resize cursor. Implemented with invisible hit zones on all 4 edges and 4 corners. Left/top edge resize moves position to keep opposite edge fixed. Cursor locked on `documentElement` during drag. Min 200×100.

**Workspace persistence.** Matt wanted frame layouts to persist across devices ("an assistant logs in at his boss's desk"). Discussed localStorage vs schema — went with both: `profiles.workspace_layout` JSONB column as source of truth, localStorage as instant cache. `WorkspaceProvider` context wraps Landscape. `useWorkspaceLayout` hook manages in-memory cache + dual persistence with 500ms debounce to Supabase. All main frames get `persistKey`; ephemeral detail cards don't.

**Auto-add maps setting.** Schema: `maps.auto_add BOOLEAN DEFAULT FALSE`. In Canvas's `handleCreateObject`, queries for auto-add maps and inserts new objects. Detail card shows gold hint "New objects will be automatically added" in read mode, checkbox in edit mode. Checkbox styled with `color-scheme: dark/light` to match theme.

**Detail card chevron.** Added ChevronRight icon button on selected map items as an alternative to double-click for opening the detail card.

### Files Modified
- `src/components/Frame.tsx` — collapse, actions, forwardRef, titleClassName, headerContent, Mac-style resize, persistKey + workspace context
- `src/components/Frame.module.css` — headerTop, headerContent, headerCollapsed, resizeEdge, resizeCorner
- `src/components/MapsFrame.tsx` — complete restructure: list/detail split, MapDetailCard component (forwardRef), map selection, gold highlights, click-to-edit mode, isolate, deselection, auto-add, chevron open
- `src/components/MapsFrame.module.css` — mapItemSelected, mapActions, mapActionBtn, detailMeta, inlineInput, editModeHint, autoAddHint, checkboxLabel, editForm
- `src/components/Canvas.tsx` — highlightedObjectIds, mapEditMode, onMapEditClick, clearSelection, coterie:node-click event, nodesSelectable, auto-add on create
- `src/components/ObjectNode.tsx` — mapHighlighted, mapEditMode flags, conditional .selected
- `src/components/ObjectNode.module.css` — .mapHighlighted class, specificity ordering
- `src/pages/Landscape.tsx` — highlightedObjectIds, mapEditMode coordination, handleMapEditModeChange, handleMapEditClick, onMapSelected
- `src/App.tsx` — WorkspaceProvider wrapping Landscape
- `src/hooks/useWorkspaceLayout.ts` — new: dual persistence hook
- `src/contexts/WorkspaceContext.tsx` — new: workspace layout context
- `src/components/CoteriesFrame.tsx` — resizable + persistKey
- `src/components/SearchFrame.tsx` — persistKey
- `src/components/SettingsFrame.tsx` — persistKey
- `src/components/AccountFrame.tsx` — persistKey
- `supabase/migrations/20260203000000_pro_schema.sql` — maps.auto_add, profiles.workspace_layout

### Open Items / Next Steps
1. **Coteries frame** — list coteries, create/invite, share maps
2. **DetailPanel → Frame migration** — make detail panels draggable
3. **Light mode polish** — may need tuning after real-world use
4. **Map packages (store)** — browse + "stamp" placement onto Landscape
5. **RLS policies** — deferred until features are complete, before deploy
6. **Map detail object list sync** — currently detail card closes on edit mode to avoid stale state; could sync reactively instead
