# Coterie

Industry intelligence app — a personal CRM for mapping professional landscapes.

## Overview

Coterie maps relationships between companies, people, and projects. Designed for professionals who need to understand who's where, what's in development, and how it all connects.

**Currently focused on Hollywood/entertainment**, but the data model is industry-agnostic.

See `docs/PRODUCT_PLAN.md` for full product vision and roadmap.

## Tier Structure

| Tier | Description | Status |
|------|-------------|--------|
| **Free** | Local-only, self-maintained | In development |
| **Pro** | Cloud-synced, crowd-vetted canonical data | Planned |
| **Studio** | Pro + AI-powered automation | Planned |

## Tech Stack

- **Mac App**: SwiftUI
- **Local Storage**: SQLite (via SQLite3 C API)
- **Cloud Backend**: Supabase (PostgreSQL) — for Pro/Studio tiers
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
    ├── migrations/             # Database schema
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

### Schema

```sql
object_classes     -- company, person, project
object_types       -- studio, executive, feature, etc.
objects            -- all entities (id, class, name, data, map_x, map_y)
object_type_assignments  -- many-to-many: object ↔ types
relationships      -- connects objects (source_id, target_id, type)
relationship_types -- employed_by, produces, represents, etc.
```

### Key Relationships

- `employed_by`: person → company
- `has_deal_at`: company → company
- `produces`: company → project
- `attached_to`: person → project
- `represents`: company → person
- `reports_to`: person → person

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

### Implemented
- [x] Graph data model (class/type taxonomy)
- [x] Local SQLite database with seed data (Free tier)
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
- [x] Supabase schema (for future Pro/Studio tiers)

### In Progress
- [ ] CRUD UI for objects/relationships (next up!)
- [ ] Polish and ship v1.0

### Planned (Pro/Studio)
- [ ] Cloud sync
- [ ] Canonical object database
- [ ] AI contact intelligence (see `docs/STUDIO_CONTACT_INTELLIGENCE.md`)
- [ ] Friend sharing

## Known Landscape

Curated seed data in `scripts/known_landscape.json`:
- **Majors** (~30): Studios, streamers
- **Top Prodcos** (~40): Production companies with deals
- **Notable** (~60): Genre specialists, independents
- **Agencies** (8): CAA, WME, UTA, etc.
- **Management** (8): Management 360, Brillstein, etc.

## API Keys

- **Supabase**: Default local dev keys (no setup needed)
- **Claude API**: User provides in Settings (stored in Keychain)
