# Coterie

Industry intelligence app — a relationship mapping tool for professional landscapes.

## Overview

Coterie maps relationships between companies, people, and projects. Designed for professionals who need to understand who's where, what's in development, and how it all connects.

**Industry-agnostic** data model, currently seeded for Hollywood/entertainment.

The core UX: search for a person or company on your **Landscape** (the map), zoom to them, and instantly see their place in your world — relationships, notes, coterie intel — all floating contextually on the canvas. Think Google Maps for professional relationships.

See `docs/PRODUCT_PLAN.md` for full product vision and roadmap.

## Architecture: Canonical + Override

The core architecture is a **shared canonical database** with **per-user overrides**:

- **Canonical tables** (`objects`, `relationships`) = shared truth, maintained/vetted
- **Override tables** (`objects_overrides`, `relationships_overrides`) = per-user customizations layered on top
- **What the user sees** = canonical + their overrides merged together

User-created entities live in the override tables with `object_id = NULL`. When corroborated by enough users, they get promoted to canonical.

Landscape coordinates are always per-user (in overrides), never canonical.

## Tier Structure

| Tier | Description | Status |
|------|-------------|--------|
| **Pro** | Cloud-synced, canonical data + user overrides, coterie sharing | **In development** |
| **Free** | Carved from Pro — local-only subset | Planned |
| **Studio** | Pro + AI-powered automation | Planned |

Strategy: build Pro first. Easier to carve a local Free tier out of a working networked app than to retrofit networking onto a local app.

## Tech Stack

- **Web App**: Vite + React (primary client)
- **Cloud Backend**: Supabase (PostgreSQL)
- **Deployment**: Vercel (web app) + Supabase Cloud (backend)
- **AI**: Claude API (Haiku for classification)
- **Local Dev**: Supabase local (Docker) — single migration file during early dev

The SwiftUI Mac app (`Coterie/` directory) was the v0.1 prototype. Development has pivoted to web-first.

## Platform Strategy (decided 2026-02-07)

**Web-first.** Vite + React, deployed to Vercel.

Rationale:
- The core UX is "search → see relationships → explore" — web's home turf for presenting rich, interconnected information
- The map canvas (React Flow) is solid and usable for the use case — doesn't need to be Figma-level smooth
- Sharing is frictionless: "go to this URL" vs download and install
- Live dev iteration with hot reload — critical for Matt's workflow
- Cross-platform for free (brother/writing partner doesn't need a Mac)

Gold standard references: **Figma** (infinite canvas web app), **Google Maps** (search → zoom → contextual info panel). Coterie's UX paradigm is closest to Google Maps — search zooms to an object on the map, clicking opens a floating detail panel, explore by expanding nearby nodes.

## Project Structure

```
coterie/
├── Coterie/                    # SwiftUI Mac app (v0.1 prototype, legacy)
├── docs/
│   ├── PRODUCT_PLAN.md         # Full product roadmap
│   └── STUDIO_CONTACT_INTELLIGENCE.md  # AI contact import design (Studio tier)
├── scripts/
│   └── known_landscape.json    # Seed data
└── supabase/
    ├── migrations/
    │   └── 20260203000000_pro_schema.sql  # THE schema (edit directly during dev)
    └── seed.sql                # Sample data
```

Web app (Vite + React) has not been scaffolded yet.

## Data Model (Graph-based)

### Core Concept: Class + Types

Every entity has ONE **class** and MULTIPLE **types**:

```
Classes (fixed):     company, person, project

Types (extensible):
  company → studio, streamer, agency, production_company, ...
  person  → executive, producer, creative, agent, ...
  project → feature, tv_series, documentary, ...
```

Example: Netflix is class=`company` with types=[`streamer`, `studio`]

### The Landscape

The **Landscape** is the user's entire industry universe — one giant canvas with all their objects, relationships, and positions. It's not a table; it's the totality of canonical objects + the user's overrides. Every user has one Landscape. Positions live in `objects_overrides.map_x/map_y`.

### Maps (unified concept)

A **map** is a named collection of objects. One unified `maps` table serves three roles:

| Role | Description | `user_id` | `is_published` | Has relative coords |
|------|-------------|-----------|-----------------|---------------------|
| **Store package** | Curated catalog for purchase | NULL | TRUE | Yes |
| **User map** | Personal filtered view | Set | FALSE | No (just a filter) |
| **Shared/installed** | Born from a package or coterie share | Set | FALSE | Sometimes |

**Relative coordinates**: Store packages and shared maps use relative positions (internal geometry preserved). When installed, the user "places" the cluster on their Landscape like a stamp — the relative coords translate to absolute positions. This prevents purchased maps from scattering objects in insane locations relative to the user's existing layout.

When a user installs a package:
1. New objects get seeded into their Landscape (objects_overrides)
2. Objects they already have → untouched (their overrides win)
3. A user map is auto-created in their collection (linked via `source_map_id`)
4. The installed map becomes a named filter they can activate

User maps are the primary organizational unit for coterie sharing — "here's my Literary Agents map."

### Schema (Pro tier)

**Taxonomy & canonical data:**
```
industries             -- entertainment, tech, finance, etc.
object_classes         -- company, person, project (fixed)
object_types           -- studio, executive, feature, etc. (extensible)
objects                -- canonical entities (name, class, data, is_active)
object_industries      -- many-to-many: object ↔ industries
object_type_assignments -- many-to-many: object ↔ types
relationship_types     -- employed_by, produces, represents, etc.
relationships          -- canonical connections (source, target, type, is_active)
```

**Maps:**
```
maps                   -- unified: packages, user maps, shared maps
map_objects            -- objects in each map + optional relative x/y
```

**User layer:**
```
profiles               -- extends Supabase auth (display_name, industry)
objects_overrides       -- per-user: overrides + user-created + Landscape positions
relationships_overrides -- per-user: overrides + user-created connections
```

**Social:**
```
coteries               -- sharing groups
coterie_members        -- who's in which coterie (owner/member roles)
```

**Other:**
```
log_entries            -- per-user activity log
```

### Key design decisions

- **Soft delete** (`is_active`) on objects, relationships, and overrides — never lose data
- **Override tables do double duty**: `object_id = NULL` means user-created entity; `object_id` set means override of canonical
- **Landscape coordinates always live in overrides**, never canonical — everyone has their own layout
- **`relationships_overrides` source/target have no FK** — can reference either `objects.id` or `objects_overrides.id`; resolved at app layer
- **`map_objects.object_ref_id` has no FK** — same flexible reference pattern as relationships_overrides
- **Industries scope onboarding**, not data — all users share one database, industry is a lens/filter
- **Maps are catalogs, not canvases** — a map is a collection of objects (with optional relative positioning), not a separate coordinate space

### Key Relationships

- `employed_by`: person → company
- `has_deal_at`: company → company
- `produces`: company → project
- `attached_to`: person → project
- `represents`: company → person
- `reports_to`: person → person

## User Experience (Pro)

1. User signs up, picks their industry
2. Installs a map package → "stamps" it onto their Landscape, placing the cluster where they want
3. Customizes via overrides (drag, rename, add notes)
4. Creates new objects → fuzzy-match wizard ("Is this any of these existing objects?")
5. Creates user maps as filtered views of their Landscape ("Children's Animation", "Literary Agents")
6. Invites others into a **Coterie** → shares maps, sees coterie members' overrides/notes
7. Eventually: user-created objects vetted and promoted to canonical
8. Eventually: users can check their Landscape against canonical for updates (diff/merge UI)

## Running Locally

```bash
# Start Supabase (requires Docker running)
supabase start

# Supabase Studio UI (includes Schema Visualizer)
open http://127.0.0.1:54323

# Reset database after schema changes
supabase db reset

# Database connection
postgresql://postgres:postgres@127.0.0.1:54322/postgres
```

### Development workflow (current)

Single migration file (`20260203000000_pro_schema.sql`) — edit directly, `supabase db reset` to rebuild. No incremental migrations until production deployment. Seed data in `seed.sql` re-applied on every reset.

When ready to deploy:
1. Create Supabase cloud project
2. `supabase db push` to deploy migrations
3. Deploy web app to Vercel
4. Swap Supabase URL from local to cloud

## Current Status

### Implemented
- [x] Graph data model (class/type taxonomy)
- [x] Pro-tier Supabase schema (canonical + overrides + unified maps + coteries)
- [x] Seed data demonstrating the model
- [x] Local Supabase running with Schema Visualizer

### SwiftUI Prototype (v0.1 — legacy, in `Coterie/` dir)
- [x] MapView with draggable cards, connections, zoom/pan
- [x] Setup wizard for known_landscape import
- [x] Contact import from macOS Contacts (fuzzy matching)
- [x] News feed with RSS aggregation
- [x] Claude API integration for article classification
- [x] Local SQLite database

### Next Up
- [ ] Scaffold Vite + React web app
- [ ] Supabase client integration
- [ ] Map canvas with React Flow
- [ ] Search → zoom → floating detail panel
- [ ] Auth (email/password for local dev)
- [ ] RLS policies (before multi-user)

### Planned
- [ ] Map packages (store) with relative coordinates + stamp placement
- [ ] User maps (filtered views of the Landscape)
- [ ] Coterie sharing
- [ ] Canonical promotion pipeline
- [ ] Canon check / diff-merge UI
- [ ] Free tier (carved from Pro)
- [ ] AI contact intelligence (see `docs/STUDIO_CONTACT_INTELLIGENCE.md`)

## Known Landscape

Curated seed data in `scripts/known_landscape.json`:
- **Majors** (~30): Studios, streamers
- **Top Prodcos** (~40): Production companies with deals
- **Notable** (~60): Genre specialists, independents
- **Agencies** (8): CAA, WME, UTA, etc.
- **Management** (8): Management 360, Brillstein, etc.

## Market Position

Not a traditional CRM (no sales pipeline). Coterie is a **relationship intelligence tool** / **professional landscape mapper**. Closest comparisons:

- **Studio System / IMDbPro**: Have the data but no graph visualization, read-only, enterprise pricing
- **Affinity / Attio**: Graph-based relationship tools but for VC/sales, no entertainment awareness
- **Kumu**: Visual network canvas but no data model or domain intelligence
- **Personal CRMs (Dex, Clay)**: Track your contacts, not the landscape itself

Coterie's gap: visual relationship graph + structured data model + individual-scale + industry-aware.

## API Keys

- **Supabase**: Default local dev keys (no setup needed)
- **Claude API**: User provides in Settings (stored in Keychain)

---

## Last Session: 2026-02-07

> When starting a new session, read this section for continuity. At handoff, fold any lasting decisions into the sections above, then replace this section with the new session's conversation.

### What we did

1. **Platform decision: web-first** — Evaluated SwiftUI vs web for Coterie's core UX. Matt clarified the primary interaction isn't map-tweaking but "I have a meeting with X — search, see their world." That's web's strength. The map matters (it IS the interface, Google Maps style — search zooms to objects, details float contextually), but doesn't need native-level rendering. Key factors:
   - "Go to this URL" sharing vs app install — critical for onboarding coterie members
   - Live hot-reload dev workflow (like Vivi with Expo) — Vite gives this in the browser
   - Canvas libraries (React Flow) handle the map use case solidly

2. **Local-first development** — Decided to build against local Supabase (Docker), deploy to cloud later. Single migration file during dev, `supabase db reset` to iterate. Proper incremental migrations start at production deployment.

3. **The Landscape concept** — Named the user's entire industry universe "the Landscape." One canvas per user. Not a table — it's the totality of canonical + overrides.

4. **Maps redesign (big one)** — Identified three distinct concepts that were tangled:
   - **The Landscape**: user's entire universe, one canvas, absolute positions
   - **User Maps**: named filtered subsets of the Landscape ("Children's Animation"). Same positions, just hides non-members. Users will work in these a lot.
   - **Map Packages**: curated catalogs for purchase/sharing

   **Key insight**: purchased maps with absolute default positions would create chaos on an existing Landscape. Solution: **relative coordinates**. Packages are "stamps" — preserved internal geometry that the user places on their Landscape. Drop point becomes the anchor, relative coords translate to absolute.

5. **Unified maps table** — Realized packages, user maps, and shared maps are the same concept at different lifecycle stages. One `maps` table with `user_id` (NULL=store, set=user), `is_published`, and `source_map_id` (self-referencing for installed/shared). Dropped the old `user_maps` join table. `map_objects` now has nullable `relative_x/y`.

6. **Schema updated and deployed** — Updated migration, ran `supabase db reset`, Schema Visualizer working at `localhost:54323`.

### Open threads for next session

1. **Scaffold the web app** — Vite + React, connect to local Supabase
2. **React Flow canvas** — map rendering, zoom/pan, search-to-zoom
3. **Floating detail panel UX** — what shows when you click an object?
4. **Auth** — set up local Supabase auth for dev (email/password, test users)
5. **RLS policies** — write before multi-user (comments in migration stub the plan)
6. **Merged view** — SQL view combining canonical + user overrides (needed for app queries)
7. **Canonical promotion pipeline** — how quorum works (manual review first? automated later?)
8. **Canon check UX** — diff/merge UI for users to sync against canonical updates
