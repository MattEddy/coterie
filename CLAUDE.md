# Coterie

Sector intelligence app — a relationship mapping tool for professional landscapes.

## Overview

Coterie maps relationships between companies, people, and projects. Designed for professionals who need to understand who's where, what's in development, and how it all connects.

**Sector-agnostic** data model, currently seeded for Hollywood/entertainment.

The core UX: search for a person or company on your **Landscape** (the map), zoom to them, and instantly see their place in your world — relationships, notes, coterie intel — all floating contextually on the canvas. Think Google Maps for professional relationships.

See `docs/PRODUCT_PLAN.md` for full product vision and roadmap.

## Architecture: Entity Registry + Override

The core architecture is a **shared entity registry** with **per-user overrides**:

- **Registry tables** (`objects`, `connections`) = every known entity, with provenance tracking
- **Override tables** (`objects_overrides`, `connections_overrides`) = per-user customizations layered on top
- **What the user sees** = registry + their overrides merged together

Every object gets a row in the `objects` table from the moment it's created — whether by the platform operators or by a user. An `is_canon` boolean distinguishes vetted/maintained objects from user-created ones. A `created_by` column tracks who created the object (NULL = platform-seeded). This means `objects_overrides.object_id` is **always set** — there are no orphan objects without a registry parent.

Landscape coordinates are always per-user (in overrides), never canonical.

## Tech Stack

- **Web App**: Vite + React, deployed to Vercel
- **Backend**: Supabase (PostgreSQL), deployed to Supabase Cloud
- **AI**: Claude API (Haiku for classification)
- **Dev**: Supabase local (Docker), single migration file during early dev
- **Schema**: `supabase/migrations/20260203000000_pro_schema.sql` (edit directly, `supabase db reset` to rebuild)

Three tiers planned: **Pro** (in development), Free (carved from Pro), Studio (Pro + AI). Building Pro first.

## Data Model (Graph-based)

### Class + Types

Every entity has ONE **class** and MULTIPLE **types**:

```
Classes (fixed):     company, person, project, event
Landscape-visible:   company, person (on the canvas)
Off-landscape:       project, event (shown in detail panels, connected to landscape objects)

Types (extensible):
  company → studio, streamer, agency, production_company, ...
  person  → executive, producer, creative, agent, ...
  project → feature, tv_series, documentary, ...
  event   → meeting, call, email_exchange, pitch, screening, premiere, introduction, general
```

`classes` table has a `landscape_visible BOOLEAN` column controlling which classes render on the canvas.

### Events

Events are first-class objects (class=`event`) with `event_date DATE` column. Connected via roles: `participated_in`, `regarding`, `held_at`. Always user-created, off-landscape (shown in detail panels).

### The Landscape

The user's entire sector universe — one giant canvas. Every user has one Landscape. Positions live in `objects_overrides.map_x/map_y`.

### Maps

A **map** is a named collection of objects (`maps` + `maps_objects` tables). Serves three roles: store packages (curated, with relative coords), user maps (personal filtered views), and shared/installed maps (from packages or coteries). Installation = "accept and place" — user picks an anchor point, new objects positioned relative to it. `auto_add` boolean for auto-membership of new objects.

### Coterie Sharing

A **coterie** is a named trust circle for sharing relationship intelligence. Full spec: `docs/COTERIE_SHARING.md`.

**Core concepts:**
- Coteries require maps — sharing is map-based via `coteries_maps` join table
- Recipients get ONE aggregated map per coterie (`maps.source_coterie_id`)
- Two sharing channels activate once objects overlap between members:
  - **Channel 1 — Intel** (passive): shared_notes + contacts visible on shared objects, attributed. Pure query pattern, no extra tables. Contact adopt via `+` button + fingerprint tracking.
  - **Channel 2 — Updates** (diff-based): structural differences surface as dissonances. Self-correcting — reversed changes evaporate automatically.
- Five dissonance types: `new_object`, `new_connection`, `deactivated_connection`, `career_move`, `type_change`

### Connection Roles

Connections are **direction-agnostic** — `object_a`/`object_b` with optional **roles** describing each side (e.g. Employee/Employer, Rep/Client). `roles` table with UUID PKs, `is_canon` + `created_by`. Not class-restricted. Users create custom roles on the fly.

### Object Fields

Identity fields are real columns. Contact info lives in `data.contacts` as a typed/labeled array (`[{type, label, value}, ...]` — types: phone, email, url, address, social; labels: freeform).

| Column | Person | Company | Project | Event |
|---|---|---|---|---|
| `title` | VP Production | Major Studio | Sci-fi thriller | Brief description |
| `status` | Active / Left sector | Active / Defunct | Development / Released | — |
| `event_date` | — | — | — | 2025-01-25 |
| `data.contacts` | **Override only** | Phones, emails, website | — | — |

### Guiding Tenet: No Person Private Reachability in Canonical Records

**Coterie shares WHO someone is, not HOW to reach them.** Person contact info (phone, email, address) is NEVER stored in canonical `objects.data`. Public URLs allowed. Enforced by CHECK constraint. Company contact info CAN be canonical. The anti-ZoomInfo stance, enforced by schema.

## Key Design Decisions

- **Deletion**: Canonical tables use soft delete (`is_active`). User tables use hard delete. Orphaned user-created objects are hard-deleted. `connections_overrides.deactivated` boolean for canonical overrides only.
- **Option B storage**: user-created objects = skeleton `objects` row + all content in `objects_overrides`
- **Every object gets a registry row** — `is_canon` distinguishes vetted from user-created
- **`objects_overrides.object_id` always set** — overrides always point to an `objects` row
- **Coordinates always in overrides**, never canonical
- **Connections direction-agnostic** — `object_a_id`/`object_b_id`, no ordering; `connections_overrides` has no FK
- **UUID PKs for vocabulary** — `types` and `roles` prevent slug collisions; views join to `display_name`
- **Coterie sharing is diff-based** — self-correcting when changes reversed
- **Coterie intel is a query pattern** — join members' overrides, exclude `private_notes`
- **Maps are catalogs, not canvases** — collections with optional relative positioning
- **All FKs reference `profiles(user_id)`** not `auth.users(id)`
- **Auto-create profile on signup** via trigger

## Known Gotchas

### Supabase Realtime postgres_changes (Local Dev)
Unreliable in local dev (JWT/RLS issues, GitHub #21624). **Workaround:** polling every 3s. Swap to Broadcast/Realtime on Supabase Cloud.

### Supabase Auth Seeding (Local Dev)
- Must insert `auth.identities` alongside `auth.users`
- `email_change`, `email_change_token_new`, `recovery_token` must be `''` not NULL (GoTrue crash)
- `phone` must be NULL (UNIQUE constraint), `is_sso_user = false`
- Debug: `docker logs supabase_auth_coterie`

### React Flow v12 Multi-Select
`selectionOnDrag` eats Cmd-click. Fix: `useOnSelectionChange` hook as truth for lasso, manual Cmd/Shift-click in `onNodeClick`, `clickHandledRef` (50ms) to prevent overwrite.

### Reactive Panel Positioning
DetailPanel tracks nodes via `useViewport()` + `useStore()` with custom equality fn. Proportional anchor algorithm. Off-screen hiding. `preferredSide` for dual selection. **No CSS transitions on position** (causes "falling" from {0,0}).

### React Flow v12 Missing Events
No `onPaneDoubleClick` or `onEdgeDoubleClick`. Detect manually via timing (400ms window, 10px tolerance).

### React Flow `useOnSelectionChange` Fires on Mousedown
Skip single-node changes unless lasso in progress (`isLassoRef`). Let `onNodeClick` drive single-node panel opening.

### Stale Closures in React Flow Callbacks
Use `nodesRef` pattern — `useRef<Node[]>([])`, update on render, access `.current` in callbacks.

### CSS clip-path Stacking Context
`::before` with `z-index: -1` inside clip-path parent renders ABOVE parent background. Don't use for border effects.

### Chrome Extensions and `position: fixed`
Dark Reader injects `filter` creating new containing block. Fix: `<meta name="darkreader-lock" />`. Also: hard reload after structural CSS changes.

### Lucide `Map` Icon Shadows Native `Map`
Import as `{ Map as MapIcon }`.

## UI Architecture

### Frame System
All UI panels use a shared `Frame` component: draggable, resizable, z-index-on-click (starts at 100, NavBar at 200). Key props: `actions`, `headerContent`, `titleClassName`, `resizable`, `persistKey` (localStorage + Supabase), `titleTooltip`. Double-click title bar to collapse/expand. `forwardRef` support.

NavBar: fixed top-right (account dropdown, hamburger menu, "Coterie" wordmark). Hotkeys: N/S/M/C/, (toggle, suppressed in inputs).

Canvas exposes `zoomToNode(nodeId)`, `clearSelection()`, `triggerCreate()` via `forwardRef`.

See `docs/UI_REFERENCE.md` for MapsFrame architecture, workspace persistence, color scheme tables, project structure, and schema overview.

### Theming
`data-theme` attribute on `<html>`, dark default. `ThemeContext` manages preference (light/dark/auto), persists to localStorage. Flash prevention via inline script in `index.html`. All colors are CSS variables — no hardcoded colors. **Palette**: dusty rose (org) + teal (person), gold accent. See `src/styles/global.css`.

### Typography
- **Urbanist** (`--font-sans`): primary display font — everything by default
- **Inter**: data/functional text only (type labels, data fields in DetailPanel). 2px smaller for x-height match.

## Running Locally

```bash
supabase start              # Requires Docker
open http://127.0.0.1:54323 # Studio UI
supabase db reset           # Reset after schema changes
npm run dev                 # → http://localhost:5173
# Test: matt@test.com / password123, billy@test.com / password123
```

Deploy: Supabase Cloud (`supabase db push`) + Vercel.

## Status

Full build history: `docs/IMPLEMENTATION_STATUS.md`

### Next Up
- [ ] "Accept and place" UX — click canvas to position accepted objects
- [ ] DetailPanel migration to Frame component (draggable)
- [ ] Light mode polish
- [ ] Map packages (store) — browse + stamp placement

### Planned
- [ ] Operator dedup tooling
- [ ] Canon check / diff-merge UI
- [ ] RLS policies (before deploy)
- [ ] Free tier (carved from Pro)
- [ ] AI contact intelligence (see `docs/STUDIO_CONTACT_INTELLIGENCE.md`)
- [ ] Contact sync (Google/Microsoft APIs)

## Reference

- **Seed data**: `scripts/known_landscape.json` (~130 companies: majors, prodcos, agencies, management)
- **API keys**: Supabase default local dev keys; Claude API in Settings
- **Tooling**: `/backup-global` pushes `~/.claude/CLAUDE.md` to GitHub Gist; `gh` CLI installed
