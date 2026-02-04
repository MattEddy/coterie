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

---

## Last Session: 2026-02-03

> When starting a new session, read this section for continuity. At handoff, fold any lasting decisions into the sections above, then replace this section with the new session's conversation.

### What we did

1. **Full project refresher** — walked through the codebase, all views/services/models, what's built vs. planned.

2. **Market research** — investigated whether Coterie is a "CRM" (it isn't — no sales pipeline). Researched competitors across five categories:
   - **Studio System / IMDbPro**: Have entertainment data but no graph visualization, read-only, enterprise pricing
   - **Personal CRMs (Dex, Clay)**: Flat contact lists, no relationship-between-entities modeling
   - **Affinity / Attio**: Graph-based relationship tools for VC/sales. Attio raised $116M proving graph CRM is viable. Neither has entertainment awareness or a visual canvas.
   - **Kumu**: Beautiful network canvas but it's a blank diagramming tool — no data model, no domain intelligence
   - **Coterie's gap**: Nobody combines visual relationship graph + structured data model + individual-scale + industry-aware. Studio System has the data but no graph UI. Kumu has the canvas but no data model.

3. **Strategic decision: build Pro first** — easier to carve a local Free tier out of a working networked app than the reverse. First use case: Matt sharing data with his brother (who is also his writing partner).

4. **Industry-agnostic design** — `industries` table scopes onboarding, but all users share one database. Industry is a lens/filter, not a silo.

5. **Canonical + override architecture** — the big architectural breakthrough:
   - `objects` / `relationships` = canonical shared truth
   - `objects_overrides` / `relationships_overrides` = per-user layer (same fields, nullable, plus user-only fields like notes/tags)
   - User sees canonical merged with their overrides
   - User-created entities: `objects_overrides` rows with `object_id = NULL` — keeps canonical table pure. Promotion to canonical happens when enough users corroborate the same entity.
   - Deduplication at creation: fuzzy-match wizard ("Is this any of these existing objects?")

6. **Maps table** — curated packages of objects with default x/y coordinates. Solves onboarding, monetization (sell map packages), and the spaghetti-map problem. No `map_relationships` needed — infer from which objects are present.

7. **Soft delete** — `is_active BOOLEAN DEFAULT TRUE` on objects, relationships, and override tables. Needed for canonical promotion flow and audit trail. Not on taxonomy tables.

8. **Wrote and committed the Pro schema** — `20260203000000_pro_schema.sql` with 15 tables. Deleted old migration. Pushed to GitHub.

9. **Platform strategy discussion** — evaluated SwiftUI-only, Tauri+SvelteKit, React Native, web-first, and SwiftUI+web-later. Claude recommended SwiftUI for Mac (power canvas) + Vite/React web client later (cross-platform companion). **Matt is sleeping on this decision.**

### Open threads for next session

1. **Platform strategy decision** — commit to SwiftUI + web later? Or pivot?
2. **RLS policies** — stubbed as TODO in migration, need writing before multi-user
3. **Canon check UX (Step 8)** — diff/merge UI for users to sync against canonical updates. TBD.
4. **Canonical promotion pipeline** — how does quorum work? Manual review first? Automated later?
5. **LocalDatabase.swift** — needs to be updated/replaced with Supabase service layer once Pro dev starts
6. **Handoff skill** — wasn't loading in this session. Matt should check Claude Code settings for the Coterie project directory.
