# Matt's Working Context — Coterie

## Session: 2026-02-03

### What happened this session

Matt came back after a few days away and wanted to get reoriented. The session evolved from "remind me what this is" into a major product strategy jam. Here's the full thread:

---

### 1. Project Refresher

Reviewed the full codebase. Coterie is a Mac app (SwiftUI + SQLite) for mapping professional landscapes — companies, people, projects, and the relationships between them. v0.1 is built: graph data model, interactive map canvas with draggable cards, setup wizard, contact import with fuzzy matching, RSS news feed, Claude API integration for article classification.

### 2. Database Schema Review

Walked through the existing schema — 6 tables: `object_classes`, `object_types`, `objects`, `object_type_assignments`, `relationship_types`, `relationships`. Plus `log_entries`. Two versions exist: local SQLite (what the app uses) and Supabase/Postgres (for future Pro tier). They mirror each other with minor type differences (UUID vs TEXT ids, JSONB vs TEXT for JSON).

### 3. "Is this a CRM?" — Market Research

Matt asked whether Coterie is basically a CRM and what competition exists. Did deep research. Key findings:

- **CRM = Customer Relationship Management.** It's about tracking YOUR interactions with customers through a sales pipeline. Coterie is not a CRM — it maps the landscape itself regardless of whether you've interacted with anyone. Better described as a **relationship intelligence tool** or **professional landscape mapper**.

- **Competitive landscape:**
  - **Studio System / IMDbPro**: Have entertainment data but no graph visualization, read-only, enterprise pricing (Studio System is six figures/year)
  - **Personal CRMs (Dex, Clay, Monica)**: Track your contacts, not the landscape. Flat lists, no graph.
  - **Affinity / Attio**: Graph-based relationship tools, closest architecturally, but built for VC/sales. Affinity is interaction-based (infers from email). Attio raised $116M proving graph CRM concept is viable.
  - **Kumu**: Visual network canvas but it's a blank diagramming tool — no data model, no domain intelligence.

- **Coterie's novel gap:** Nobody combines visual relationship graph + structured data model + individual-scale + industry-aware + local-first. Studio System has the data but no graph UI. Kumu has the canvas but no data model. Coterie has both.

- **Risk:** Entertainment is a small market. But the underlying concept (professional landscape mapping) applies to VC, politics, journalism, lobbying. Data model is already industry-agnostic.

### 4. Strategic Decision: Build Pro First

Matt decided to develop Pro tier first instead of Free tier. Reasoning: easier to carve a local Free app out of a functioning networked app than to retrofit networking onto a local app. The first use case is sharing data with his brother (who is also his writing partner).

### 5. Industry-Agnostic Design

Matt wants to design for multiple industries from the start. Decided on:
- An `industries` table controlling an `industry_id` that scopes onboarding
- Industry is a **lens/filter**, not a silo — all users share one database
- A person could build a network across industries
- The industry selection drives which map packages are offered during onboarding

### 6. Canonical + Override Architecture

This was the big architectural breakthrough of the session. Matt's mental model:

- **`objects` table is canonical** — shared truth, vetted, maintained
- **`objects_overrides` table** — per-user layer with the same fields (nullable except for overrides), plus `user_id`, `notes`, `tags`
- Same pattern for **`relationships` + `relationships_overrides`**
- **What the user sees = canonical + their overrides merged**

**User-created objects:** Matt's key insight — user-created objects don't go in the canonical table at all. They stay as `objects_overrides` rows with `object_id = NULL`. The canonical table stays pure. When enough users independently create the same entity (quorum), it gets promoted to a real canonical `objects` row and the existing overrides get rekeyed to it. This avoids polluting canonical with a `status` field and `WHERE status = 'canonical'` on every query.

**Deduplication at creation:** When a user creates a new object, a fuzzy-match wizard asks "Is this new object any of these existing objects?" before allowing creation.

### 7. Maps Table

Matt added the concept of **maps** — curated packages of objects with default coordinates. This solves three problems:
- **Onboarding**: "Pick your map" is better than "download everything tagged entertainment"
- **Monetization**: sell map packages ("Hollywood Majors", "NYC Indie Scene", etc.)
- **The spaghetti problem**: default coordinates mean the first thing you see is a readable layout, not a hairball

Structure: `maps` table + `map_objects` join table with `default_x`/`default_y`. When a user installs a map, the default coordinates copy into their `objects_overrides` as starting positions.

No `map_relationships` table needed — if both objects in a relationship are in the map, show the relationship. Simple rule.

### 8. Soft Delete

Decided on `is_active BOOLEAN DEFAULT TRUE` rather than hard delete. Reasons specific to Coterie:
- Canonical promotion flow needs it (can't nuke a row other users reference)
- Audit trail matters for crowd-sourced data
- Simpler than `deleted_at` timestamp — can add that later if needed
- Applied to `objects`, `relationships`, `objects_overrides`, `relationships_overrides`
- NOT on taxonomy tables (admin-controlled, rarely change)

### 9. The New Schema — Written and Committed

Wrote a complete new Supabase migration (`20260203000000_pro_schema.sql`) with 15 tables:

**Taxonomy & canonical:** `industries`, `object_classes`, `object_types`, `objects`, `object_industries`, `object_type_assignments`, `relationship_types`, `relationships`

**Maps:** `maps`, `map_objects`

**User layer:** `profiles`, `user_maps`, `objects_overrides`, `relationships_overrides`

**Social:** `coteries`, `coterie_members`

**Other:** `log_entries` (now per-user)

Key constraints:
- `objects_overrides` has CHECK: if `object_id IS NULL` (user-created), `class` and `name` are required
- `UNIQUE(user_id, object_id)` — PostgreSQL exempts NULLs, so multiple user-created objects are fine
- `relationships_overrides` source/target have no FK — can reference either `objects.id` or `objects_overrides.id`, resolved at app layer
- RLS stubbed as TODO

Old migration (`20260124174500_graph_model.sql`) was deleted. Both changes committed and pushed.

### 10. Platform Strategy Discussion (OPEN — sleeping on it)

Matt asked about platform agnosticism. Discussed options:

| Approach | Pros | Cons |
|---|---|---|
| Stay native SwiftUI | Best Mac experience, iPad/iPhone easy | No Android/Windows ever |
| Tauri + SvelteKit | Desktop cross-platform | No native mobile |
| React Native | Covers everything | Medium-high rewrite effort |
| Web app (Vite + React) | Everywhere instantly | Less native feel on Mac |
| **SwiftUI + web client later** | Best of both — native power app + universal companion | Two codebases |

Claude's recommendation was **keep SwiftUI for Mac, add a web client (Vite + React) later** for cross-platform. Reasoning:
- Immediate users are Mac people — native feels better
- The web covers everything else (PC users, phone-before-a-meeting use case)
- Supabase makes it natural — both clients talk to same API
- The two use cases are different enough (power canvas vs. read-heavy lookup) that shared UI framework wouldn't save much
- Matt already knows Vite + React

**Matt is sleeping on this decision.** It's marked as an open question in CLAUDE.md.

---

### Commits this session

- `7c33825` — Replace graph model migration with Pro-tier schema
- `8094c5d` — Update CLAUDE.md with Pro-tier architecture and strategy

### Open threads for next session

1. **Platform strategy decision** — SwiftUI + web later? Or pivot to something cross-platform now?
2. **RLS policies** — Stubbed in the migration, need to be written before multi-user
3. **Step 8 of the user experience** — "Canon check" / diff-merge UI for users to sync against canonical. TBD.
4. **Canonical promotion pipeline** — How exactly does quorum work? Manual review at first? Automated later?
5. **The handoff skill isn't loading** — Matt should check his Claude Code settings to make sure it's configured for the Coterie project directory
6. **LocalDatabase.swift** needs to be updated/replaced with a Supabase service layer once Pro development starts
