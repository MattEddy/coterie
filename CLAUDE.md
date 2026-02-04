# Coterie

Industry intelligence app — a relationship mapping tool for professional landscapes.

## Overview

Coterie maps relationships between companies, people, and projects. Designed for professionals who need to understand who's where, what's in development, and how it all connects.

**Industry-agnostic** data model, currently seeded for Hollywood/entertainment.

See `docs/PRODUCT_PLAN.md` for full product vision and roadmap.

## Architecture: Canonical + Override

The core architecture is a **shared canonical database** with **per-user overrides**:

- **Canonical tables** (`objects`, `relationships`) = shared truth, maintained/vetted
- **Override tables** (`objects_overrides`, `relationships_overrides`) = per-user customizations layered on top
- **What the user sees** = canonical + their overrides merged together

User-created entities live in the override tables with `object_id = NULL`. When corroborated by enough users, they get promoted to canonical.

Map coordinates are always per-user (in overrides), never canonical.

## Tier Structure

| Tier | Description | Status |
|------|-------------|--------|
| **Pro** | Cloud-synced, canonical data + user overrides, coterie sharing | **In development** |
| **Free** | Carved from Pro — local-only subset | Planned |
| **Studio** | Pro + AI-powered automation | Planned |

Strategy: build Pro first. Easier to carve a local Free tier out of a working networked app than to retrofit networking onto a local app.

## Tech Stack

- **Mac App**: SwiftUI
- **Local Storage**: SQLite (via SQLite3 C API) — Free tier / offline
- **Cloud Backend**: Supabase (PostgreSQL) — Pro/Studio tiers
- **AI**: Claude API (Haiku for classification)

## Project Structure

```
coterie/
├── Coterie/                    # Mac app source
│   ├── CoterieApp.swift        # App entry point
│   ├── Models/                 # SwiftData models (legacy, being replaced)
│   ├── Views/
│   │   ├── MapView.swift       # Visual relationship canvas (draggable cards, zoom/pan, shapes per class)
│   │   ├── SetupWizardView.swift  # Known landscape import wizard
│   │   ├── ContactPickerView.swift # Import contacts with fuzzy company matching
│   │   ├── NewsFeedView.swift  # RSS aggregation
│   │   └── ...
│   └── Services/
│       ├── LocalDatabase.swift    # SQLite local storage (Free tier)
│       ├── ContactsService.swift  # macOS Contacts access + fuzzy matching
│       ├── SupabaseService.swift  # Cloud API (Pro/Studio tiers)
│       ├── RSSFeedService.swift   # News parsing
│       ├── ClaudeAPIService.swift # AI classification
│       └── ...
├── docs/
│   ├── PRODUCT_PLAN.md         # Full product roadmap
│   └── STUDIO_CONTACT_INTELLIGENCE.md  # AI contact import design (Studio tier)
├── scripts/
│   └── known_landscape.json    # Seed data
└── supabase/
    ├── migrations/             # Database schema (Pro-tier)
    └── seed.sql                # Sample data
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

**Maps (curated packages):**
```
maps                   -- named packages ("Hollywood Majors", "NYC Indie")
map_objects            -- objects in each map + default x/y coordinates
```

**User layer:**
```
profiles               -- extends Supabase auth (display_name, industry)
user_maps              -- which maps a user has installed
objects_overrides       -- per-user: overrides (object_id set) + user-created (object_id NULL)
relationships_overrides -- per-user: overrides + user-created connections
```

**Social:**
```
coteries               -- sharing groups (named after the app!)
coterie_members        -- who's in which coterie (owner/member roles)
```

**Other:**
```
log_entries            -- per-user activity log
```

### Key design decisions

- **Soft delete** (`is_active`) on objects, relationships, and overrides — never lose data
- **Override tables do double duty**: `object_id = NULL` means user-created entity; `object_id` set means override of canonical
- **Map coordinates always live in overrides**, never canonical — everyone has their own layout
- **`relationships_overrides` source/target have no FK** — can reference either `objects.id` or `objects_overrides.id`; resolved at app layer
- **Industries scope onboarding**, not data — all users share one database, industry is a lens/filter

### Key Relationships

- `employed_by`: person → company
- `has_deal_at`: company → company
- `produces`: company → project
- `attached_to`: person → project
- `represents`: company → person
- `reports_to`: person → person

## Platform Strategy

**Now:** SwiftUI Mac app (power user, map building — immediate users are Hollywood/Mac people)
**Soon-ish:** iPad support (SwiftUI gives this almost for free)
**Later:** Web app (Vite + React) as cross-platform companion — responsive, works on phones/PCs/anything with a browser
**Probably never needed:** Native Android/Windows apps

Rationale: The Mac app is the power-user canvas (drag objects, build maps, do real work). The web client is a read-heavy companion (look up a person, check relationships before a meeting). They're different enough that sharing a UI framework wouldn't save much. Supabase as backend means both clients talk to the same API — the data layer is shared, only UI differs.

**Open question (as of 2026-02-03):** Matt is sleeping on whether to commit to this strategy vs. alternatives (Tauri+SvelteKit, React Native, full web-first). Decision pending.

## User Experience (Pro)

1. User signs up, picks their industry
2. Installs a map package → objects_overrides seeded with default coordinates
3. Customizes via overrides (drag, rename, add notes)
4. Creates new objects → fuzzy-match wizard ("Is this any of these existing objects?")
5. Invites others into a **Coterie** → shared visibility into each other's overrides
6. Eventually: user-created objects vetted and promoted to canonical
7. Eventually: users can check their maps against canonical for updates (diff/merge UI)

## Running Locally

```bash
# Run Mac app (no setup needed — uses local SQLite)
open Coterie.xcodeproj  # Cmd+R in Xcode

# Database location (sandboxed)
~/Library/Containers/com.sparrowstep.coterie/Data/Library/Application Support/Coterie/coterie.db

# Inspect database
sqlite3 "$HOME/Library/Containers/com.sparrowstep.coterie/Data/Library/Application Support/Coterie/coterie.db"
```

### For Pro/Studio development (cloud features)

```bash
# Start Supabase (requires Docker)
supabase start

# Supabase Studio UI
open http://127.0.0.1:54323
```

## Current Status

### Implemented (v0.1 — local Free tier)
- [x] Graph data model (class/type taxonomy)
- [x] Local SQLite database with seed data
- [x] LocalDatabase service (full CRUD + type assignments)
- [x] MapView with draggable cards, connections, zoom/pan
    - Distinct shapes per class (rectangles=companies, ovals=people, octagons=projects)
    - Connection nodules at card edges
    - Auto-layout algorithm (clusters by type, people near employers)
- [x] Setup wizard for known_landscape import
- [x] Contact import from macOS Contacts
    - Fuzzy company name matching (Levenshtein + normalization)
    - Auto-creates companies and employed_by relationships
- [x] News feed with RSS aggregation
- [x] Claude API integration for article classification
- [x] Pro-tier Supabase schema (canonical + overrides + maps + coteries)

### In Progress
- [ ] Pro-tier development (cloud-first architecture)
- [ ] CRUD UI for objects/relationships

### Planned
- [ ] Map packages with curated default layouts
- [ ] Coterie sharing (groups)
- [ ] Canonical promotion pipeline (user-created → vetted → canonical)
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

Coterie's gap: visual relationship graph + structured data model + individual-scale + industry-aware + local-first option.

## API Keys

- **Supabase**: Default local dev keys (no setup needed)
- **Claude API**: User provides in Settings (stored in Keychain)
