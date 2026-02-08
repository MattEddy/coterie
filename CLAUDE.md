# Coterie

Industry intelligence app — a relationship mapping tool for professional landscapes.

## Overview

Coterie maps relationships between companies, people, and projects. Designed for professionals who need to understand who's where, what's in development, and how it all connects.

**Industry-agnostic** data model, currently seeded for Hollywood/entertainment.

The core UX: search for a person or company on your **Landscape** (the map), zoom to them, and instantly see their place in your world — relationships, notes, coterie intel — all floating contextually on the canvas. Think Google Maps for professional relationships.

See `docs/PRODUCT_PLAN.md` for full product vision and roadmap.

## Architecture: Entity Registry + Override

The core architecture is a **shared entity registry** with **per-user overrides**:

- **Registry tables** (`objects`, `connections`) = every known entity, with provenance tracking
- **Override tables** (`objects_overrides`, `connections_overrides`) = per-user customizations layered on top
- **What the user sees** = registry + their overrides merged together

Every object gets a row in the `objects` table from the moment it's created — whether by the platform operators or by a user. An `is_canon` boolean distinguishes vetted/maintained objects from user-created ones. A `created_by` column tracks who created the object (NULL = platform-seeded). This means `objects_overrides.object_id` is **always set** — there are no orphan objects without a registry parent.

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
├── index.html                  # Vite entry point
├── package.json                # Dependencies (React 19, React Flow 12, Supabase)
├── vite.config.ts
├── tsconfig.json
├── .env.local                  # VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY (gitignored)
├── src/
│   ├── main.tsx                # Entry point
│   ├── App.tsx                 # Router + AuthProvider
│   ├── lib/
│   │   └── supabase.ts        # Supabase client
│   ├── contexts/
│   │   └── AuthContext.tsx     # Auth state provider (signIn/signOut, session listener)
│   ├── pages/
│   │   ├── Login.tsx           # Email/password login
│   │   ├── Login.module.css
│   │   ├── Landscape.tsx       # Main canvas page (top bar + canvas)
│   │   └── Landscape.module.css
│   ├── components/
│   │   ├── Canvas.tsx          # React Flow wrapper (loads objects + connections, drag-to-save)
│   │   ├── Canvas.module.css
│   │   ├── ObjectNode.tsx      # Custom node (card with name, title, types, class color)
│   │   ├── ObjectNode.module.css
│   │   ├── DetailPanel.tsx     # Floating panel (object fields, notes — read-only)
│   │   └── DetailPanel.module.css
│   └── styles/
│       └── global.css          # CSS variables, reset, dark theme
├── Coterie/                    # SwiftUI Mac app (v0.1 prototype, legacy)
├── docs/
│   ├── PRODUCT_PLAN.md         # Full product roadmap
│   └── STUDIO_CONTACT_INTELLIGENCE.md  # AI contact import design (Studio tier)
├── scripts/
│   └── known_landscape.json    # Seed data
└── supabase/
    ├── migrations/
    │   └── 20260203000000_pro_schema.sql  # THE schema (edit directly during dev)
    └── seed.sql                # Test users + seed data
```

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

The **Landscape** is the user's entire industry universe — one giant canvas with all their objects, connections, and positions. It's not a table; it's the totality of canonical objects + the user's overrides. Every user has one Landscape. Positions live in `objects_overrides.map_x/map_y`.

### Maps (unified concept)

A **map** is a named collection of objects. One unified `maps` table serves three roles:

| Role | Description | `user_id` | `is_published` | Has relative coords |
|------|-------------|-----------|-----------------|---------------------|
| **Store package** | Curated catalog for purchase | NULL | TRUE | Yes |
| **User map** | Personal filtered view | Set | FALSE | No (just a filter) |
| **Shared/installed** | Born from a package or coterie share | Set | FALSE | Sometimes |

**Relative coordinates**: Store packages store relative positions in `maps_objects.relative_x/y` (internal geometry preserved, no owner Landscape to derive from). User maps do NOT store relative coords — they're derived on the fly from the owner's current `objects_overrides.map_x/map_y` at install time (subtract the centroid). This means recipients always get the owner's **current** layout, not a stale snapshot.

**Installation flow** (same mechanic for store packages AND coterie-shared maps — "accept and place"):
1. Compute relative coords: from `maps_objects` (packages) or from owner's Landscape positions (user maps)
2. User picks an anchor point on their Landscape
3. For each object: already on their Landscape → **skip** (their overrides win); new → create `objects_overrides` with `map_x = anchor.x + relative_x`
4. A user map is auto-created in their collection (linked via `source_map_id`)
5. The installed map becomes a named filter they can activate

User maps are the primary organizational unit for coterie sharing — "here's my Literary Agents map." Connected via `coteries_maps` join table.

### Coterie Sharing Model

#### Map Sharing

Sharing a map to a coterie writes one row to `coteries_maps`. Recipients see a pending shared map (like receiving a package). They **accept and place** it — same installation mechanic as store packages. Objects they already have stay untouched; new objects land at the placed position. A personal copy of the map is created (`source_map_id` links to the original).

Once objects overlap between coterie members (through shared maps), the two sharing channels activate.

#### Channel 1: Coterie Intel (passive)

Notes, tags, and factual data on shared objects are always visible to coterie members, attributed to the author. Read-only. No action needed — it just appears alongside your own data.

**Implementation:** Pure query pattern, no extra tables. When viewing an object, join against coterie members' `objects_overrides` for that `object_id`. Return their `shared_notes`, `tags`, and factual fields (title, status, phone, etc.), each attributed via `user_id` → `profiles.display_name`. The `private_notes` column is **never selected** in coterie queries.

#### Channel 2: Coterie Updates (diff-based)

Structural changes — new objects, new/changed connections, deactivated connections, career moves — surface as dissonances between coterie members' data. Detected via **diff queries** (comparing overrides across coterie members on shared objects), not stored events.

**Why diff-based:** Self-correcting. If Matt says Joe left Netflix, then realizes he was wrong and re-activates the connection, the dissonance evaporates automatically. No stale events to reconcile.

**Three states per dissonance:**
- **Unreviewed**: diff finds a dissonance, no `coterie_reviews` row exists
- **Dismissed**: diff finds a dissonance, `coterie_reviews` row says `dismissed` (subtle indicator persists — dissonance is always visible, never hidden)
- **Accepted**: `coterie_reviews` row says `accepted` — the change has been pulled into the recipient's overrides

**What "accept" does for each change type:**
- **New object**: Create an `objects_overrides` row pointing to the same `objects.id`, place on Landscape
- **Deactivated connection**: Create a `connections_overrides` row marking it inactive in your view
- **New connection**: Create a `connections_overrides` row with the same source/target/type

**The `coterie_reviews` table** (one new table) tracks review state:
```
coterie_reviews        -- per-user response to each dissonance
  user_id              -- the reviewer (Billy)
  source_user_id       -- whose change this is (Matt)
  ref_type             -- 'object_override' or 'connection_override'
  ref_id               -- the specific override row
  status               -- 'dismissed' or 'accepted'
  reviewed_at
```

#### Dissonance View

A dedicated view showing all places where your data differs from your coterie's — like `git diff` against your coterie. Includes both unreviewed and dismissed items. "Sync All" option for users who fully trust their coterie.

#### Data privacy tiers on overrides

- `shared_notes` — visible to coterie, attributed
- `private_notes` — never leaves your data, excluded from coterie queries
- `tags` — visible to coterie
- All other override fields (title, status, phone, etc.) — coterie-visible as factual data

#### Duplicate objects across coterie members

When two coterie members independently create the same real-world entity, the dissonance view surfaces both. This is a natural instance of the broader dedup problem. Resolution paths:
- **UX hint**: Fuzzy-match when surfacing dissonances ("Is this the same as your X?")
- **Operator dedup**: Platform operators identify duplicate `objects` rows (similar names, overlapping connections) and merge — pick the winner, UPDATE all references, soft-delete the loser
- **No schema changes needed** — merge is just UPDATE statements on `object_id` / `source_id` / `target_id` / `object_ref_id`

### Schema (Pro tier)

**Entity registry & taxonomy:**
```
industries             -- entertainment, tech, finance, etc.
classes                -- company, person, project (fixed)
types                  -- studio, executive, feature, etc. (extensible)
objects                -- ALL entities (is_canon boolean, created_by tracks origin)
objects_industries     -- many-to-many: object ↔ industries
objects_types          -- many-to-many: object ↔ types
connection_types       -- employed_by, produces, represents, etc.
connections            -- canonical connections (source, target, type, is_active)
```

**Maps:**
```
maps                   -- unified: packages, user maps, shared maps
maps_objects           -- objects in each map + optional relative x/y (packages only)
```

**User layer:**
```
profiles               -- extends Supabase auth (user_id PK, display_name, industry)
objects_overrides       -- per-user: overrides + Landscape positions + shared/private notes
connections_overrides   -- per-user: overrides + user-created connections + shared/private notes
```

**Social:**
```
coteries               -- sharing groups
coterie_members        -- who's in which coterie (owner/member roles)
coteries_maps          -- maps shared with coteries
coterie_reviews        -- per-user review state for coterie dissonances
```

**Other:**
```
log_entries            -- per-user activity log
```

### Object fields (hybrid: columns + JSONB)

Commonly displayed/filtered fields are real columns. Rare/variable fields live in `data` JSONB.

| Column | Person | Company | Project |
|---|---|---|---|
| `title` | VP Production | Major Studio & Streamer | Sci-fi thriller set in 2040 |
| `status` | Active / Left industry | Active / Acquired / Defunct | Development / Production / Released |
| `phone` | Cell | Main line | — |
| `phone_2` | Office | — | — |
| `email` | Personal/work | General inquiries | — |
| `website` | Personal site | Corporate site | Official page |
| `address` | Office address | HQ | — |
| `photo_url` | Headshot | Logo | Poster/key art |

### Key design decisions

- **Soft delete** (`is_active`) on objects, connections, and overrides — never lose data
- **Every object gets a registry row** — `objects` is an entity registry, not curated truth. `is_canon` boolean distinguishes vetted from user-created. No orphan objects, ever.
- **`objects_overrides.object_id` is always set** — no more `NULL` = user-created pattern. Overrides always point to an `objects` row.
- **Landscape coordinates always live in overrides**, never canonical — everyone has their own layout
- **`connections_overrides` source/target have no FK** — can reference any `objects.id`; flexible for user-created connections
- **`maps_objects.object_ref_id`** always references `objects.id` — no ambiguity about which table to look in
- **Coterie sharing is diff-based** — dissonances computed from comparing overrides, not stored events. Self-correcting when changes are reversed.
- **Coterie intel is a query pattern** — no extra table; join coterie members' overrides, exclude `private_notes`
- **Map installation = "accept and place"** — same mechanic for store packages and coterie-shared maps
- **Relative coords derived, not stored** (for user maps) — computed from owner's Landscape at install time; packages store them explicitly
- **Industries scope onboarding**, not data — all users share one database, industry is a lens/filter
- **Maps are catalogs, not canvases** — a map is a collection of objects (with optional relative positioning), not a separate coordinate space
- **All FKs reference `profiles(user_id)`** not `auth.users(id)` — keeps all relationships in the public schema
- **Auto-create profile on signup** via trigger on `auth.users`

### Key Connection Types

- `employed_by`: person → company
- `has_deal_at`: company → company
- `produces`: company → project
- `attached_to`: person → project
- `represents`: company → person
- `reports_to`: person → person

## User Experience (Pro)

1. User signs up, picks their industry → profile auto-created
2. Installs a map package → "stamps" it onto their Landscape, placing the cluster where they want
3. Customizes via overrides (drag, rename, add notes)
4. Creates new objects → `objects` row (`is_canon=false`, `created_by=user`) + `objects_overrides` row; fuzzy-match wizard ("Is this any of these existing objects?")
5. Creates user maps as filtered views of their Landscape ("Children's Animation", "Literary Agents")
6. Invites others into a **Coterie** → shares maps via `coteries_maps`
7. Coterie member "accepts and places" the shared map → same installation flow as packages
8. Sees coterie intel (shared notes, tags, factual data) on shared objects — always visible, attributed
9. Reviews coterie dissonances (structural differences) — accept, dismiss, or sync all
10. Checks Dissonance View to see where their data differs from coterie members
11. Eventually: user-created objects with enough corroboration get promoted (`is_canon = true`)
12. Eventually: operator dedup merges duplicate community objects into single canonical rows
13. Eventually: users can check their Landscape against canonical for updates (diff/merge UI)

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

```bash
# Start web app dev server
npm run dev    # → http://localhost:5173

# Test credentials
# matt@test.com / password123
# billy@test.com / password123
```

When ready to deploy:
1. Create Supabase cloud project
2. `supabase db push` to deploy migrations
3. Deploy web app to Vercel
4. Swap Supabase URL from local to cloud

## Current Status

### Implemented
- [x] Graph data model (class/type taxonomy)
- [x] Pro-tier Supabase schema (entity registry + overrides + unified maps + coteries)
- [x] Expanded object fields (title, status, phone, email, website, address, photo_url)
- [x] Shared/private notes split on override tables
- [x] Auto-create profile trigger
- [x] Coteries_maps join table for map sharing
- [x] Seed data demonstrating the model (test users with auth.identities)
- [x] Local Supabase running with Schema Visualizer
- [x] GitHub CLI (`gh`) installed, global CLAUDE.md backed up to gist
- [x] `/backup-global` skill for pushing CLAUDE.md to gist
- [x] Coterie sharing system fully designed (intel channel, updates channel, dissonance view)
- [x] Canonical promotion model: entity registry (all objects get `objects` row from birth, `is_canon` + `created_by`)
- [x] Vite + React + TypeScript web app scaffolded
- [x] Supabase client integration (.env.local with local keys)
- [x] Auth working (email/password login, AuthContext with session listener)
- [x] React Flow canvas rendering seed data (objects as nodes, connections as edges)
- [x] Custom ObjectNode component (class-based colors/icons, name, title, type badges)
- [x] DetailPanel (floating read-only panel showing object fields + notes)
- [x] Drag-to-reposition persists to Supabase (objects_overrides.map_x/map_y)
- [x] CSS Modules styling throughout, dark theme

### SwiftUI Prototype (v0.1 — legacy, in `Coterie/` dir)
- [x] MapView with draggable cards, connections, zoom/pan
- [x] Setup wizard for known_landscape import
- [x] Contact import from macOS Contacts (fuzzy matching)
- [x] News feed with RSS aggregation
- [x] Claude API integration for article classification
- [x] Local SQLite database

### Next Up
- [ ] UI polish (node design, canvas feel, detail panel, typography)
- [ ] Search → zoom → floating detail panel
- [ ] RLS policies (before multi-user)
- [ ] Merged view SQL (registry + user overrides)

### Planned
- [ ] Map packages (store) with relative coordinates + stamp placement
- [ ] User maps (filtered views of the Landscape)
- [ ] Coterie sharing implementation (intel queries, diff-based updates, coterie_reviews table)
- [ ] Dissonance View UI
- [ ] Operator dedup tooling (merge duplicate community objects)
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

## Tooling

- **Global CLAUDE.md backup**: `/backup-global` skill pushes `~/.claude/CLAUDE.md` to GitHub Gist `c3d658b951e148d8a93eed84bb0145ef`
- **GitHub CLI**: `gh` installed, authenticated via HTTPS

---

## Recent Session
**Date:** 2026-02-07 (session 3)
**Branch:** main

### Narrative

Continued from session 2 (coterie sharing design, entity registry model). This session **scaffolded the entire web app** and got it running end-to-end.

**Web app scaffold.** Built the full Vite + React + TypeScript app from scratch:
- Supabase client (`src/lib/supabase.ts`) with `.env.local` for local dev keys
- Auth system: `AuthContext` with session listener, `Login.tsx` with email/password form, `ProtectedRoute` wrapper in `App.tsx`
- React Flow canvas (`Canvas.tsx`): loads objects with types and overrides via Supabase query (inner join on `objects_overrides` filtered by `user_id`), renders nodes and edges, saves positions on drag-end
- Custom `ObjectNode` component with class-based colors (company=blue, person=green, project=yellow), emoji icons, name/title/type badges
- `DetailPanel` floating panel showing object fields and notes (read-only)
- Dark theme with CSS variables in `global.css`, CSS Modules throughout
- Styling: chose CSS Modules over Tailwind — Matt finds Tailwind overkill for this project

**Auth debugging.** Hit two issues with seeding test users into local Supabase:
1. Newer Supabase requires `auth.identities` rows (not just `auth.users`) — added INSERT for identity rows
2. GoTrue's Go code can't scan NULL into string columns — `email_change`, `email_change_token_new`, `recovery_token` needed explicit empty strings in the seed INSERT. `phone` must stay NULL (unique constraint). Diagnosed via `docker logs supabase_auth_coterie`.

**Result:** Login works, canvas renders all seed data (Disney, Warner Bros, Netflix, CAA, Bad Robot, people, projects) with connection edges. Drag-to-reposition persists to Supabase. Click a node → detail panel shows. Matt's reaction: "Holy macaroni. There it is. Wow."

### Gotcha: Seeding Supabase Auth Users
When inserting directly into `auth.users` for local dev, you MUST:
1. Also insert into `auth.identities` with matching `user_id`, `provider='email'`, `provider_id=email`, and `identity_data` containing `sub` and `email`
2. Set `email_change`, `email_change_token_new`, and `recovery_token` to `''` (empty string, not NULL) — GoTrue crashes on NULL string columns
3. Leave `phone` as NULL (has a UNIQUE constraint — empty strings collide)
4. Set `is_sso_user = false` explicitly

### Files Created
- `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json` — Vite + React + TS config
- `index.html` — Vite entry
- `.env.local` — Local Supabase URL + anon key (gitignored)
- `src/main.tsx`, `src/App.tsx`, `src/vite-env.d.ts`
- `src/lib/supabase.ts`
- `src/contexts/AuthContext.tsx`
- `src/pages/Login.tsx`, `src/pages/Login.module.css`, `src/pages/Landscape.tsx`, `src/pages/Landscape.module.css`
- `src/components/Canvas.tsx`, `src/components/Canvas.module.css`, `src/components/ObjectNode.tsx`, `src/components/ObjectNode.module.css`, `src/components/DetailPanel.tsx`, `src/components/DetailPanel.module.css`
- `src/styles/global.css`

### Files Modified
- `.gitignore` — Added node_modules, dist, .env.local
- `supabase/seed.sql` — Test users with auth.identities, GoTrue-compatible column values

### Open Items / Next Steps
1. **UI polish** — node design, canvas feel, detail panel, typography, spacing (starting now)
2. **Search → zoom** — search bar that finds objects and pans/zooms to them
3. **RLS policies** — before multi-user
4. **Merged view SQL** — registry + user overrides combined view
