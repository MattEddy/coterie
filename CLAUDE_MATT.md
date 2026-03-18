# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-18
**Branch:** main

### Narrative

Matt returned after a month away from Coterie (was deep in other projects). Started with a status review, then dove into a full Opus 4.6 audit of the codebase (originally written by Opus 4.5).

**Codebase audit.** Identified 8 items — 2 were self-corrected (sequential Supabase calls in `refreshData` are intentional because the connections query depends on object IDs; `.then()` is what triggers the Supabase request, not a no-op). Fixed the remaining 6: removed dead `classColors` map from ObjectNode, fixed `handleSave` to write types to `objects_types_overrides` instead of canonical `objects_types`, added `created_by` to `createAndAddTag`, made status editable for all classes.

**Four-class model redesign.** Major architectural decision: expanded from 3 classes (company, person, project) to 4 (company, person, project, event). Companies and people live on the Landscape; projects and events are off-landscape (connected to landscape objects, shown in detail panels). Added `landscape_visible` boolean to classes table. Canvas now filters to `.in('class', ['company', 'person'])`.

**Events replace log_entries.** Dropped the `log_entries` table entirely. Events are now first-class objects with class=`event`, connected via standard connection types (`participated_in`, `regarding`, `held_at`). Added `event_date DATE` column to objects for sortable event timeline. Added 8 event types (meeting, call, email_exchange, pitch, screening, premiere, introduction, general). Seed data updated with sample events.

**`objects_types_overrides` table.** Users can't edit canonical types, so added a per-user type override table. The `user_objects` view uses correlated subqueries: check user overrides first → fall back to canonical types → empty array. Reuses the existing type-class match trigger.

**Reactive panel positioning.** Rewrote DetailPanel to track its node through pan/zoom/drag using `useViewport()` and `useStore()` hooks instead of the old static `nodeRect` prop approach. Panel computes screen position reactively. Added off-screen detection (hides when node leaves viewport on any edge — fixed a bug where vertical scrolling left the panel stuck due to `Math.max(GAP, ...)` clamping).

**Dual-selection overlap fix.** Both panels were independently choosing the same side. Fixed with `preferredSide` prop — node positions compared, left node's panel opens left, right opens right.

**Multi-select bounding box.** 3+ selection panel was using centroid positioning (landed on top of nodes). Replaced with bounding box computation — panel goes beside the selection cluster, whichever side has more room.

**Selection highlight sync.** Only the latest-clicked node showed the selected border because React Flow's internal `selected` prop wasn't synced with our custom `selectedItems` state. Fixed with a `useEffect` that syncs our state → React Flow, with `changed ? next : current` optimization.

**Hover border killed.** Matt noticed the white border was only appearing on hover, not on selection. Root cause: `.selected` CSS class had `box-shadow` but no `border-color`. Fixed, then Matt asked to kill the hover border entirely — border now only appears when selected.

**Edge highlighting generalized.** Was gated on exactly 2 selected nodes. Generalized to `>= 2` — all connections between any selected nodes now highlight with white stroke and visible labels.

### Files Modified
- `supabase/migrations/20260203000000_pro_schema.sql` — Four-class model, event class, `landscape_visible`, `event_date`, `objects_types_overrides`, updated `user_objects` view, dropped `log_entries`
- `supabase/seed.sql` — Sample events, event connections, project positions set to NULL (off-landscape)
- `src/components/Canvas.tsx` — Landscape filter, reactive positioning support, selection sync, dual-side assignment, bounding box multi-panel, generalized edge highlighting
- `src/components/DetailPanel.tsx` — Reactive positioning via `useViewport()` + `useStore()`, `preferredSide` prop, off-screen detection, type saves to overrides
- `src/components/ObjectNode.tsx` — Removed dead `classColors` map
- `src/components/ObjectNode.module.css` — Selection border fix, hover border removed
- `src/components/MultiSelectPanel.module.css` — Fixed transform for bounding box positioning
- `src/types.ts` — New shared types file (NodeRect)
- `src/styles/global.css` — Added event color variables
- `CLAUDE.md` — Four-class model, events, `objects_types_overrides`, reactive positioning, updated status

### Open Items / Next Steps
1. **Search → zoom** — the core UX loop, highest-impact next feature
2. **Create new objects** — edit card infrastructure is ready to double as create card
3. **UI polish** — detail panel styling, type tag editing UX refinements
4. **RLS policies** — before multi-user
5. **Event timeline UI** — events exist in schema but no UI for viewing/creating them in detail panels yet
