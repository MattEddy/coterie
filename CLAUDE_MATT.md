# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-19
**Branch:** main

### Narrative

Huge session covering canvas CRUD (add/delete objects, create/edit/delete connections) and a major schema evolution from directional connection types to symmetric roles.

**Double-click to create objects.** Inline form appears at click position — Person/Company toggle (Tab key switches) + name input. Creates skeleton `objects` row + `objects_overrides` with name and map position. Detail panel auto-opens on the new node. React Flow v12 has no `onPaneDoubleClick` — detected via timing in `onPaneClick` (400ms window, 10px tolerance). Disabled the useless default double-click-to-zoom.

**Drag-opens-panel bug fixed.** `useOnSelectionChange` fires on mousedown (when React Flow internally selects a node), not mouseup. This caused the detail panel to open whenever you started dragging. Root cause fix: `useOnSelectionChange` now skips single-node changes unless a lasso is in progress (`isLassoRef` via `onSelectionStart`/`onSelectionEnd`). `onNodeClick` (mouseup, suppressed after drag) is the sole driver for single-node panel opening.

**Landscape deletion with cascade confirmation.** Trash icon in detail panel header. On click: queries blast radius (visible connections, orphaned projects/events — only counts connections where both endpoints are on the user's landscape). Confirmation overlay shows "Delete Name? This will also delete X connections and Y projects and Z events." Canonical objects: delete override (disappears from landscape). User-created objects: hard-delete override + object row. Orphaned off-landscape objects cleaned up.

**Connection model redesign — from directional types to symmetric roles.** Matt questioned whether connection types needed directionality, then whether types were needed at all, then landed on the two-role model. Each connection has `object_a_id`/`object_b_id` (no implied direction) and optional `role_a`/`role_b` describing what each object IS in the relationship (Employee/Employer, Rep/Client, etc.). The `connection_types` table was replaced by a `roles` vocabulary table. `connections` and `connections_overrides` updated throughout.

**UUID IDs for types and roles.** Matt asked "what if two users create the same custom role?" — the TEXT slug PK would collide. Same latent bug existed in the `types` table. Migrated both to UUID PKs. Views (`objects_with_types`, `user_objects`) now join through to `display_name`. TagInput works with display_names throughout, resolving to UUIDs when writing to `objects_types_overrides`. Seed data uses `SELECT id FROM types WHERE display_name = '...'` subqueries.

**Removed `valid_classes` from roles.** Matt: "Let people have control... a person could have a deal with a company, or another person." All roles available for all classes.

**Visual connection creation.** Drag handle-to-handle fires `onConnect` → ConnectionRoleForm appears at midpoint between nodes. Two rows: object name + role autocomplete input (filtered to canonical + user's custom roles). Roles optional — hit Connect for a bare line. Custom roles auto-created in the `roles` table with UUID PK. Canvas `refreshData` now loads both canonical connections and user-created connections from `connections_overrides`, filtering out deactivated.

**Connection editing.** Double-click an edge → ConnectionRoleForm opens pre-populated with current roles + Delete button. Save updates roles (user-created: direct update, canonical: creates/updates override). Delete removes connection (user-created: hard-delete, canonical: deactivates via override).

**Custom RoleEdge component.** Role labels positioned at 20%/80% along the edge (near each respective node) instead of a single label in the middle. Dark background pills for readability. Labels only visible when edge is highlighted (click or multi-select). Edges changed from bezier curves to straight lines (Matt prefers it).

**Stale closure bugs.** `handleEdgeClick` and `handleConnect` referenced `nodes` state captured at creation time (empty array). Crashes on `.find()`. Fixed with `nodesRef` pattern — `const nodesRef = useRef<Node[]>([]); nodesRef.current = nodes` — so callbacks always read current state.

**Autocomplete dropdown persistence bug.** ConnectionRoleForm's `useEffect` on `value` re-triggered fetch + reopened dropdown after Enter selection (value changes → fetch → show suggestions). Fixed with `isTyping` flag — only fetch when user is actively typing, not on programmatic value changes.

**Minor styling.** Muted text color unified to `var(--color-text-muted)` (was hardcoded `#777` on node types). Brightened from `#888` to `#999`. Type tag placeholders updated: person = "Tags (eg jobs, roles, etc.)", company = "Organization Type(s)".

**Company → Organization rename explored.** Matt felt "company" was too narrow — doesn't cover unions, government agencies, departments. Explored "Organization" but felt it was "a little sweaty." Sleeping on it.

### Files Modified
- `supabase/migrations/20260203000000_pro_schema.sql` — `connection_types` → `roles` table (UUID PK), `connections` direction-agnostic (`object_a_id`/`object_b_id`/`role_a`/`role_b`), `connections_overrides` same, `types` migrated to UUID PK, views join to `display_name`, removed `valid_classes` from roles
- `supabase/seed.sql` — Connections use role pairs via display_name subqueries, type assignments via display_name subqueries
- `src/components/Canvas.tsx` — Double-click create, `onConnect` + ConnectionRoleForm, edge double-click edit, `nodesRef` pattern, loads canonical + user-created connections, `isLassoRef` for drag fix, `zoomOnDoubleClick={false}`, custom `edgeTypes`
- `src/components/CreateObjectForm.tsx` — New: Person/Company toggle + name input
- `src/components/CreateObjectForm.module.css` — New: class-colored toggle buttons
- `src/components/ConnectionRoleForm.tsx` — New: two-slot role editor with autocomplete, edit mode, delete button
- `src/components/ConnectionRoleForm.module.css` — New: role input, suggestions dropdown, delete/connect buttons
- `src/components/RoleEdge.tsx` — New: custom edge with role labels near endpoints
- `src/components/DetailPanel.tsx` — Delete with cascade confirmation, `connectionConfig`/`projectConnectionTypes`/`eventConnectionTypes` removed, all queries updated `source_id`→`object_a_id` / `target_id`→`object_b_id`, TagInput uses display_names with UUID resolution on save, type creation uses UUID
- `src/components/DetailPanel.module.css` — Delete confirmation overlay styles
- `src/components/ObjectNode.tsx` — `is_canon` + `created_by` added to `ObjectNodeData`
- `src/components/ObjectNode.module.css` — Type color uses `var(--color-text-muted)`
- `src/styles/global.css` — `--color-text-muted` brightened to `#999`

### Open Items / Next Steps
1. **Company → Organization rename** — Matt sleeping on the exact word
2. **RLS policies** — before multi-user
3. **Search → zoom** — the core UX loop
4. **Map packages** (store) with stamp placement
5. **User maps** (filtered views of the Landscape)
