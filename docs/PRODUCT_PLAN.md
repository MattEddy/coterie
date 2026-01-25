# Coterie Product Plan

> Industry intelligence for your professional universe. Map the relationships between companies, people, and projects.

## Vision

Coterie is a personal CRM for tracking professional landscapes — starting with Hollywood, but applicable to any industry where relationships and movements matter.

The app helps users understand:
- Who's where (people → companies)
- What's happening (projects, deals)
- How it connects (relationships, hierarchies)
- What's changing (news, movements)

---

## Tier Structure

### Free Tier
**Local, self-maintained, private.**

- All data stored locally on user's Mac
- Setup wizard imports from curated seed data (known_landscape.json)
- News feed aggregation from public RSS sources
- Basic keyword matching to suggest map-relevant news
- Full graph model: objects, types, relationships
- No account required, no cloud sync
- Works entirely offline

**Value proposition:** A powerful personal tool at no cost. Capstone for power users who want full control.

### Pro Tier (Connected)
**Cloud-synced, crowd-vetted, collaborative.**

Everything in Free, plus:
- Cloud backup and sync (offline-first with sync)
- **Canonical object database**: shared, vetted data for known entities
- When you add "Netflix," you link to the canonical Netflix — always up-to-date
- **Personal overrides**: your notes, corrections, private data stay yours
- **Crowd-sourced corrections**: users can propose fixes; critical mass updates canonical
- **Friend connections**: share your map with trusted colleagues, see their additions
- Cross-device sync (Mac today, iOS later)

**Value proposition:** Your map stays current without manual maintenance. Network effects from the community.

### Studio Tier (AI-Powered)
**Pro + intelligent automation.**

Everything in Pro, plus:
- **AI news parsing**: Claude reads articles, extracts structured updates
- **Suggested updates**: "Dana Walden mentioned in this article — update her role?"
- **Map optimization**: "You track Disney execs but not their new hire — add them?"
- **Smart search**: natural language queries across your map
- Priority support

**Value proposition:** Your map maintains itself. AI handles the grunt work.

---

## Data Architecture

### Canonical Layer (Cloud — shared by all Pro/Studio users)

```sql
-- The shared truth, crowd-maintained
canonical_objects (
    id UUID PRIMARY KEY,
    class TEXT,  -- company, person, project
    name TEXT,
    data JSONB,
    verified BOOLEAN,
    created_at, updated_at
)

canonical_type_assignments (
    object_id UUID,
    type_id TEXT,
    is_primary BOOLEAN
)

canonical_relationships (
    id UUID,
    source_id UUID,
    target_id UUID,
    type TEXT,
    data JSONB,
    verified BOOLEAN
)

-- Proposed changes from users
corrections (
    id UUID,
    object_id UUID,
    field TEXT,
    proposed_value JSONB,
    proposed_by UUID,  -- user
    votes_for INT,
    votes_against INT,
    status TEXT,  -- pending, approved, rejected
    created_at
)
```

### User Layer (Cloud — per-user, row-level security)

```sql
-- Which canonical objects this user tracks
user_map (
    user_id UUID,
    canonical_object_id UUID,
    added_at TIMESTAMP,
    position_x, position_y  -- their map layout
)

-- Personal overrides (user's data > canonical)
user_overrides (
    user_id UUID,
    object_id UUID,  -- canonical or custom
    field TEXT,
    value JSONB,
    notes TEXT
)

-- Objects not yet in canonical DB
user_custom_objects (
    id UUID,
    user_id UUID,
    class TEXT,
    name TEXT,
    data JSONB,
    -- Could be promoted to canonical later
    promoted_to UUID  -- canonical_object_id if promoted
)

-- User's private relationships
user_relationships (
    user_id UUID,
    source_id UUID,
    target_id UUID,
    type TEXT,
    data JSONB
)

-- Friends/sharing
user_connections (
    user_id UUID,
    friend_id UUID,
    status TEXT,  -- pending, accepted
    share_level TEXT  -- view_only, full
)
```

### Local Layer (SQLite — cached on device)

```
Mirror of user's slice of the data:
- Canonical objects they've added
- Their overrides
- Their custom objects
- Their relationships
- Their map positions

Enables full offline functionality with sync queue.
```

---

## Implementation Phases

### Phase 1: Free Tier Foundation (Current → v1.0)

**Goal:** Fully functional local app with the graph data model.

- [x] Graph data model (objects, classes, types, relationships)
- [x] Supabase schema and migrations
- [x] SupabaseService for API communication
- [x] MapView with draggable cards and connections
- [x] Switch to local SQLite for Free tier (no Docker dependency)
- [x] News feed with RSS aggregation
- [ ] Setup wizard imports known_landscape.json
- [ ] Basic UI for all CRUD operations
- [ ] Polish and ship v1.0

**Tech stack:** SwiftUI, SQLite (local), no cloud required.

### Phase 2: Cloud Infrastructure

**Goal:** Foundation for connected tiers.

- [ ] Supabase Cloud project setup
- [ ] Authentication (Supabase Auth: email, Apple, Google)
- [ ] Row-level security policies
- [ ] Canonical vs user table structure
- [ ] Basic sync engine (local ↔ cloud)
- [ ] Subscription management (RevenueCat or Supabase + Stripe)

**Tech stack:** Supabase Cloud, Supabase Auth, RevenueCat.

### Phase 3: Pro Tier (Connected)

**Goal:** Collaborative, crowd-vetted data.

- [ ] Canonical object database (seeded from known_landscape + editorial work)
- [ ] "Add to my map" flow with fuzzy matching
- [ ] Override system (local edits stored separately)
- [ ] Correction proposals and voting
- [ ] Friend connections and sharing
- [ ] Conflict resolution UI
- [ ] Offline-first sync with queue

### Phase 4: Studio Tier (AI-Powered)

**Goal:** Intelligent automation.

- [ ] Claude API integration (already started)
- [ ] Article parsing → structured data extraction
- [ ] "Suggested updates" notification system
- [ ] Map optimization recommendations
- [ ] Natural language search
- [ ] Admin interface for canonical data management
- [ ] AI-assisted data vetting for admins

### Phase 5: Platform Expansion

**Goal:** Multi-platform, multi-industry.

- [ ] iOS app
- [ ] Industry-specific seed data packs
- [ ] API for third-party integrations
- [ ] Team/enterprise tier

---

## Pricing Strategy

### Model: Freemium + Subscription

| Tier | Price | Billing |
|------|-------|---------|
| Free | $0 | Forever |
| Pro | $9.99/mo | Monthly or $99/year (2 mo free) |
| Studio | $19.99/mo | Monthly or $199/year (2 mo free) |

### Trial
- 14-day free trial of Pro features for new users
- No credit card required to start
- Clear upgrade prompts when hitting Pro features

### Considerations
- Free tier is truly free (low marginal cost — local only)
- Annual discount incentivizes commitment
- Studio premium justified by AI costs (Claude API)
- Enterprise/team pricing TBD

---

## Revenue Infrastructure

### Options

1. **App Store only**
   - Simple, trusted by users
   - 30% cut (15% after year 1 for small business)
   - StoreKit 2 for subscriptions

2. **App Store + Direct (Stripe)**
   - Higher margins on direct sales
   - More complex to manage
   - Web payment portal needed

3. **RevenueCat**
   - Abstracts both App Store and Stripe
   - Good analytics, subscriber management
   - 1% fee (free under $2.5M/year through Indie plan)

**Recommendation:** Start with App Store only (simplest), add RevenueCat when ready for cross-platform or advanced analytics.

---

## Admin System (Future)

### Needs
- Manage canonical object database
- Review and approve user corrections
- Merge duplicate objects
- Verify high-profile entities
- Seed new industry data

### AI Assistance
- Claude helps vet proposed corrections
- Suggests merges for duplicates
- Flags suspicious data patterns
- Drafts canonical object entries from news

### Access
- Admin web interface (Supabase dashboard + custom views)
- Separate from user-facing app
- Role-based access for editorial team

---

## Technical Decisions

### Offline-First Architecture

The app works fully without internet. Data syncs when connected.

**Why:**
- Industry intel feels sensitive — users want it local
- Works on planes, in meetings, anywhere
- Free tier is already local — natural extension
- Sync conflicts are rare (single-user edits mostly)

**How:**
- SQLite as source of truth locally
- Sync queue for pending changes
- Conflict resolution: last-write-wins with user notification
- Canonical objects cached locally, refreshed on sync

### Object Identity

When a Pro user adds "Amazon":
1. Fuzzy search against canonical objects
2. If match found: create `user_map` entry linking to canonical
3. If no match: create `user_custom_object`
4. Custom objects can be "promoted" to canonical later

This prevents duplicate canonical entries while allowing user freedom.

---

## Platform Strategy

```
Phase 1: Mac (SwiftUI)     ← Best native experience for core users
Phase 2: iOS (SwiftUI)     ← Code sharing, same ecosystem
Phase 3: Web app           ← Covers Windows, Linux, everything
Phase 4: Native Windows    ← Only if real demand (unlikely)
```

**Rationale:**
- Target users (Hollywood) are overwhelmingly on Macs
- SwiftUI delivers premium native feel that cross-platform can't match
- Backend (Supabase) and local storage (SQLite) are already platform-agnostic
- Web app can serve Windows/Linux users without compromising Mac quality
- Don't water down Mac experience for hypothetical Windows users

---

## Open Questions

1. **Canonical data seeding**: How much editorial work before launch? MVP set vs. comprehensive?

2. **Correction threshold**: How many users must agree before canonical updates? Trust weighting?

3. **Private objects**: Can users mark objects as "never promote to canonical"?

4. **Industry expansion**: When to add non-Hollywood seed data? User demand driven?

5. **Team tier**: Shared maps for companies? Different pricing model?

---

## Success Metrics

### Phase 1 (Free Tier)
- Downloads
- Retention (D1, D7, D30)
- Objects created per user
- Session frequency

### Phase 3 (Pro)
- Free → Pro conversion rate
- Canonical objects in database
- Corrections submitted/approved
- Friend connections made

### Phase 4 (Studio)
- Pro → Studio conversion rate
- AI suggestions accepted rate
- Time saved (self-reported)

---

## Timeline (Rough)

| Phase | Target |
|-------|--------|
| Phase 1: Free Tier v1.0 | Q1 2026 |
| Phase 2: Cloud Infrastructure | Q2 2026 |
| Phase 3: Pro Tier | Q3 2026 |
| Phase 4: Studio Tier | Q4 2026 |
| Phase 5: iOS + Expansion | 2027 |

---

*Last updated: January 2026*
