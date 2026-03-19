# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-07-08
**Branch:** main

### Narrative

Massive session — detail panel redesign, schema overhaul, and full projects/events implementation. Matt came back rusty on the schema and we spent good time re-grounding before building.

**Schema review & Option B storage.** Walked through the four-class model and how user-created objects (events, projects) store data. Landed on "Option B": user-created objects get a skeleton `objects` row (just id, class, is_canon, created_by) with ALL content in `objects_overrides`. This makes the merge-to-canonical flow clean — just repoint overrides. Updated `objects.name` to nullable, added `event_date` to `objects_overrides`, updated `user_objects` view to COALESCE `event_date`. Seed data updated so events use skeleton rows + override UPDATEs.

**JSONB contacts model.** Matt questioned the rigid contact columns (phone, phone_2, email, website, address). Researched best practices — landed on the vCard/Apple Contacts pattern: `data.contacts` array of `{type, label, value}` entries. Dropped all fixed contact columns from both `objects` and `objects_overrides`. Person private reachability CHECK constraint preserved via `jsonb_path_exists` on the JSONB. Company public contact info (website, switchboard) can be canonical; person phone/email/address is override-only. The `data` JSONB column serves double duty — contacts for people/companies, future metadata for projects/events.

**Detail panel redesign.** Complete overhaul from a flat read/edit panel to a structured tabbed layout:
- **Header**: photo (optional) + name + title (editable via pencil) + types (editable via +)
- **Tab bar**: Contact Info, Notes, Projects, Events (icon buttons)
- **Per-section editing**: each tab has its own edit toggle, no global edit mode
- Contact tab renders dynamic typed/labeled entries from `data.contacts`
- Notes tab has "Shared with Coteries" and "Private (Not Shared)" sections with per-block scroll boundaries
- UX details: auto-focus tag input, `field-sizing: content` on textareas, `white-space: pre-wrap` for line breaks, address uses textarea, `autoComplete="off"` everywhere, dark date picker via `color-scheme: dark`

**Projects/Events tabs — full implementation.** The big feature. Connected projects/events load lazily when the tab activates. Connection type mapping handles directionality (person→project via `attached_to`, company→project via `produces`, event→company via `held_at` where event is source). Items render as expandable cards with chevron, name, date/status pill. Create form: events lead with Event Type(s), projects lead with Project name. Project creation uses ObjectSearch with name matching — search existing projects to link, or "Create [name]" to make new. Multi-object linking via "Also link to..." search in both create form and expanded view. Edit mode inline with same fields as creation.

**ObjectSearch component.** Reusable autocomplete that searches `user_objects` by name. Configurable: `targetClass` filter, `excludeIds`, `onSelect` callback, `onCreateNew` for creating from typed text, `onCancel` for Escape. Used for project name matching and the link-to search in both create and expanded views.

**Hard delete for user tables.** Matt questioned whether soft delete (`is_active`) is always worth it. Concluded: canonical tables keep soft delete (admin editorial control), user tables (overrides) use hard delete (no zombies, simpler queries). Removed `is_active` from `objects_overrides` and `connections_overrides`. Added `deactivated BOOLEAN` on `connections_overrides` specifically for overriding canonical connections. Updated `user_objects` view to drop the `ov.is_active` filter.

**Orphan cleanup on delete.** When removing a connection: hard-delete user-created connections, deactivate canonical ones. Then check remaining connections — if none left, hard-delete the `objects_overrides` row (removes from view/autocomplete). If the user created the object and it's not canonical, hard-delete the `objects` row too. True cleanup, no zombies.

**`coteries_reviews` simplified.** Accepted dissonances don't need a row — the data change IS the record. Table now stores dismissals only (may be removed entirely if dismissals prove rare). Renamed from `coterie_reviews` to `coteries_reviews` for consistency (also renamed `coterie_members` → `coteries_members`).

**Landscape deletion design decided.** Option #3: cascade with confirmation. Show the user what they'll lose (X connections, Y events, Z projects), one click to proceed. Not built yet — next session.

**Canvas refresh bug fixed.** `refreshData` was replacing all nodes without preserving `selected` state, causing React Flow to fire spurious selection changes and blank the screen. Fixed with `selectedItemsRef` to preserve selection through the refresh cycle.

**Escape key layering.** Escape from create forms closes the form. Escape from the panel (no edit active) closes the panel. `onCancel` prop added to both TagInput and ObjectSearch.

**TagInput auto-highlight.** First suggestion is now pre-highlighted (index 0), so typing "me" + Enter selects "meeting" instead of creating a "me" type. Matt's muscle memory was expecting autocomplete behavior.

### Files Modified
- `supabase/migrations/20260203000000_pro_schema.sql` — Dropped contact columns, JSONB contacts CHECK constraint, Option B (nullable name), `event_date` on overrides, `is_active` removed from override tables, `deactivated` on connections_overrides, `coteries_members`/`coteries_reviews` renames, simplified coteries_reviews
- `supabase/seed.sql` — Event skeleton rows, company contacts in `data.contacts` JSONB
- `src/components/DetailPanel.tsx` — Complete rewrite: tabbed layout, per-section editing, JSONB contacts UI, Projects/Events tabs with create/edit/delete/search/link, ObjectSearch component, TagInput enhancements (onCancel, autoFocus prop, auto-highlight), Escape key layering
- `src/components/DetailPanel.module.css` — New styles for header/tabs/contact rows/item list/create form/linked objects/search input
- `src/components/ObjectNode.tsx` — ContactEntry interface, ObjectNodeData updated (dropped contact columns, added data field)
- `src/components/Canvas.tsx` — Selection preservation in refreshData (selectedItemsRef), data mapping updated for new ObjectNodeData shape
- `CLAUDE.md` — Option B storage, JSONB contacts, deletion strategy, landscape deletion design, updated status

### Open Items / Next Steps
1. **Search → zoom** — the core UX loop, highest-impact next feature
2. **Add new objects to the Landscape** (people, companies)
3. **Landscape object deletion** with cascade confirmation (design decided, not built)
4. **Visual connection creation** via drag handles (both landscape and detail panel)
5. **RLS policies** — before multi-user
