# UI Reference

Detailed UI architecture and design reference. Core concepts are in the main `CLAUDE.md`.

## Project Structure

```
coterie/
├── index.html                  # Vite entry point
├── package.json                # Dependencies (React 19, React Flow 12, Supabase)
├── vite.config.ts
├── .env.local                  # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (gitignored)
├── src/
│   ├── main.tsx                # Entry point
│   ├── App.tsx                 # Router + AuthProvider
│   ├── lib/supabase.ts         # Supabase client
│   ├── contexts/               # AuthContext, ThemeContext, WorkspaceContext
│   ├── hooks/                  # useWorkspaceLayout
│   ├── pages/
│   │   ├── Login.tsx           # Email/password login
│   │   └── Landscape.tsx       # Main canvas page (canvas + NavBar + frames)
│   ├── components/
│   │   ├── Canvas.tsx          # React Flow wrapper
│   │   ├── ObjectNode.tsx      # Custom node (card with name, title, types, class color)
│   │   ├── DetailPanel.tsx     # Floating panel (read/edit mode, tag input, reactive positioning)
│   │   ├── MultiSelectPanel.tsx  # Panel for 3+ selected nodes
│   │   ├── CreateObjectForm.tsx  # Inline form for double-click object creation
│   │   ├── ConnectionRoleForm.tsx # Role editor for connections
│   │   ├── RoleEdge.tsx          # Custom edge with role labels
│   │   ├── Tooltip.tsx           # Portal-rendered tooltip
│   │   ├── Frame.tsx             # Shared draggable frame
│   │   ├── NavBar.tsx            # Fixed top-right nav
│   │   ├── SearchFrame.tsx       # Search → zoom
│   │   ├── MapsFrame.tsx         # Maps CRUD + detail view + canvas filter
│   │   ├── CoteriesFrame.tsx     # Coteries management
│   │   ├── CoterieUpdatesFrame.tsx  # Dissonance view
│   │   ├── NotificationBoxes.tsx    # Floating notifications below NavBar
│   │   └── SettingsFrame.tsx     # Settings
│   ├── types.ts                # Shared types
│   └── styles/global.css       # CSS variables, reset, dark theme
├── Coterie/                    # SwiftUI Mac app (v0.1 prototype, legacy)
├── docs/                       # Product plan, sharing spec, this file
├── scripts/known_landscape.json  # Seed data
└── supabase/
    ├── migrations/20260203000000_pro_schema.sql
    └── seed.sql
```

## Platform Strategy (decided 2026-02-07)

**Web-first.** Vite + React, deployed to Vercel.

Rationale:
- Core UX is "search → see relationships → explore" — web's home turf
- React Flow canvas is solid for the use case
- Sharing is frictionless: "go to this URL" vs download and install
- Live dev iteration with hot reload
- Cross-platform for free (brother/writing partner doesn't need a Mac)

Gold standard references: **Figma** (infinite canvas web app), **Google Maps** (search → zoom → contextual info panel).

## MapsFrame Architecture

MapsFrame renders two independent Frame cards:
- **List card** (280px, `persistKey="maps"`): always visible. Click selects (gold highlights on canvas), double-click opens detail. Finder-like deselection.
- **Detail card** (320px, ephemeral): spawns to the right. Title = map name (white, not gold). Edit/delete in Frame header. `headerContent` for description + auto-add hint.

**Map selection highlights**: MapsFrame `mapObjectIds` → `onHighlightObjects` → Landscape `highlightedObjectIds` → Canvas syncs `mapHighlighted` flag → ObjectNode renders `.mapHighlighted` CSS class.

**Click-to-edit mode** (MousePointerClick icon): toggles objects in/out of map by clicking canvas. Canvas intercepts via `onMapEditClick`. Locks map selection. Suppresses selection borders (`nodesSelectable={false}`, `mapEditMode`). Auto-closes detail card.

**Map deselection**: global mousedown listener + custom `coterie:node-click` DOM event (React Flow pointer capture workaround). Drag-aware.

**Auto-add**: `maps.auto_add` boolean. New objects auto-inserted into auto-add maps.

## Workspace Layout Persistence

Frame positions/sizes persist across sessions and devices:
- **localStorage** (`coterie-workspace-layout`): instant restore, no network wait
- **Supabase** (`profiles.workspace_layout` JSONB): source of truth, hydrates on login
- 500ms debounce to Supabase on drag/resize end
- `WorkspaceProvider` context wraps Landscape
- `useWorkspaceLayout` hook manages in-memory cache + dual persistence
- Persistent frames: maps, search, coteries, settings, account. Ephemeral: map detail.

## Color Scheme: Dusty Rose + Teal

Palette evolved from iterative exploration (`color-schemes.html` in project root).

### Dark Mode (default)
| Role | Hex | CSS Variable |
|------|-----|-------------|
| Background | `#0f0e0e` | `--color-bg` |
| Surface | `#181a1e` | `--color-surface` (cool-tinted) |
| Surface 2 | `#22252a` | `--color-surface-2` |
| Border | `#333538` | `--color-border` |
| Text | `#e0dcd8` | `--color-text` |
| Muted text | `#7a7070` | `--color-text-muted` |
| Accent (gold) | `#d4b468` | `--color-accent` |
| Org | `#8a6070` | `--color-org` (dusty rose) |
| Org dim | `#382830` | `--color-org-dim` |
| Person | `#4a9ab0` | `--color-person` (teal) |
| Person dim | `#203038` | `--color-person-dim` |

### Light Mode
| Role | Hex |
|------|-----|
| Background | `#f5f3f0` |
| Surface | `#ffffff` |
| Accent (gold) | `#b89840` (deeper for white-bg legibility) |
| Org | `#8a5068` |
| Org dim | `#f4e8ec` |
| Person | `#2a88a0` |
| Person dim | `#e4f0f4` |

## Schema Overview

**Entity registry & taxonomy:**
```
sectors                -- entertainment, tech, finance, etc.
classes                -- company, person, project, event (fixed)
types                  -- UUID PK, display_name, class, is_canon, created_by
roles                  -- UUID PK, display_name, is_canon, created_by
objects                -- ALL entities (is_canon, created_by, event_date)
objects_sectors        -- many-to-many: object ↔ sectors
objects_types          -- many-to-many: object ↔ types (canonical)
connections            -- direction-agnostic (object_a, object_b, role_a, role_b, is_active)
```

**Maps:**
```
maps                   -- unified: packages, user maps, shared maps (auto_add boolean)
maps_objects           -- objects in each map + optional relative x/y
```

**User layer:**
```
profiles               -- extends Supabase auth (user_id PK, display_name, sector, workspace_layout)
objects_overrides       -- per-user: overrides + positions + shared/private notes
objects_types_overrides -- per-user: type overrides
connections_overrides   -- per-user: overrides + user-created connections
```

**Social:**
```
coteries, coteries_members, coteries_maps, coterie_invitations, coteries_reviews
maps.source_coterie_id -- recipient's aggregated coterie view
```

## User Experience Flow (Pro)

1. User signs up, picks sector → profile auto-created
2. Installs a map package → "stamps" onto Landscape
3. Customizes via overrides (drag, rename, add notes)
4. Creates new objects → fuzzy-match wizard ("Is this any of these existing objects?")
5. Creates user maps as filtered views ("Children's Animation", "Literary Agents")
6. Invites others into a Coterie → shares maps
7. Member "accepts and places" shared map
8. Sees coterie intel on shared objects
9. Reviews coterie dissonances — accept, dismiss, or sync all
10. Eventually: user-created objects promoted to canonical; operator dedup

## Market Position

Not a traditional CRM (no sales pipeline). A **relationship intelligence tool** / **professional landscape mapper**.

- **Studio System / IMDbPro**: Data but no graph visualization, read-only, enterprise pricing
- **Affinity / Attio**: Graph-based but for VC/sales, no entertainment awareness
- **Kumu**: Visual network canvas but no data model or domain intelligence
- **Personal CRMs (Dex, Clay)**: Track your contacts, not the landscape itself

Coterie's gap: visual relationship graph + structured data model + individual-scale + sector-aware.
