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

Four tiers planned — building in order:

1. **Pro** (in development): Web app, full features (coteries, maps, sharing). Standard encryption (AES-256 at rest via AWS/Supabase, TLS in transit, RLS access control) — matches Google/Apple/Outlook security model.
2. **Secure** (Pro add-on): E2EE on `objects_overrides.data.contacts` only. Client-side encryption with per-user keypair + coterie group keys for shared contacts. Exceeds Proton (they leave email unencrypted; we encrypt ALL personal reachability). Canon layer unaffected — contact info is structurally excluded by CHECK constraint, so E2EE has zero impact on platform features. Identity fields (name, title, types) remain plaintext.
3. **Studio** (Pro + AI): AI-powered contact intelligence, classification, etc.
4. **Free** (later, marketing funnel): Standalone local app (Tauri + React + SQLite). No auth, no server, no coteries — just the landscape tool. Upgrade trigger = sharing/backup/sync. Sync via PowerSync (Supabase ↔ local SQLite). Same React UI wrapped in Tauri.

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
- Three sharing channels:
  - **Channel 1 — Intel** (passive): shared_notes visible on shared objects, attributed. Pure query pattern.
  - **Channel 2 — Updates** (diff-based): structural differences surface as dissonances. Self-correcting — reversed changes evaporate automatically.
  - **Channel 3 — Explicit shares** (`coteries_shares` table): per-coterie, per-item sharing of contacts, projects, and events. One row = "I share this thing with this coterie." Private by default, explicit opt-in. `get_coterie_shared_intel()` SECURITY DEFINER RPC fetches shared intel from peers. `CoterieSharePicker` component provides the UI (share icon → coterie dropdown with checkboxes).
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

- **Deletion**: Canonical tables use soft delete (`is_active`) — `objects`, `connections`, `coteries`. User tables use hard delete. Maps use hard delete (no `is_active`). Orphaned user-created objects are hard-deleted. `connections_overrides.deactivated` boolean for canonical overrides only.
- **Option B storage**: user-created objects = skeleton `objects` row + all content in `objects_overrides`
- **Every object gets a registry row** — `is_canon` distinguishes vetted from user-created
- **`objects_overrides.object_id` always set** — overrides always point to an `objects` row
- **Coordinates always in overrides**, never canonical
- **Connections direction-agnostic** — `object_a_id`/`object_b_id`, no ordering; `connections_overrides` has no FK
- **UUID PKs for vocabulary** — `types` and `roles` prevent slug collisions; views join to `display_name`
- **Coterie sharing is diff-based** — self-correcting when changes reversed
- **Coterie intel is a query pattern** — join members' overrides, exclude `private_notes`
- **Ownerless coteries** — when owner deletes their account, `owner_id` → NULL. All remaining members get admin privileges (invite, delete, manage maps). No forced ownership transfer. Coterie keeps working as a co-op.
- **Maps are catalogs, not canvases** — collections with optional relative positioning
- **All FKs reference `profiles(user_id)`** not `auth.users(id)`
- **`created_by` is provenance, not a FK** — `types.created_by`, `roles.created_by`, `objects.created_by` have no FK constraint. NULL = platform-seeded, UUID = user-created (preserved after user deletion). `is_canon` is the authoritative flag, not `created_by`.
- **Account deletion** — must cascade cleanly through `auth.users` → `profiles` → all user data. `coteries.owner_id` SET NULL, `coteries_invitations.invited_by` CASCADE, `created_by` columns have no FK (provenance preserved). Apple 5.1.1(v) compliant.
- **Invite lookup for anonymous users** — `get_invitation_by_token()` SECURITY DEFINER RPC, callable by anon. No anon SELECT policy on `coteries_invitations` (would expose emails).
- **Auto-create profile + subscription on signup** via trigger
- **Subscriptions table** tracks trial/payment status per user — `user_tier(uid)` returns `'pro'`/`'trial'`/`'free'`
- **VIP status** for internal users (billing-exempt, full Pro access) — just a subscription status value, not a separate role
- **RLS helper functions** — all cross-table membership/visibility checks MUST use SECURITY DEFINER helpers to avoid RLS recursion. PostgreSQL flags re-entry on the same table as infinite recursion, even across different policy types (e.g., INSERT policy → queries table B → B's SELECT policy → queries original table). Helpers: `is_coterie_admin(coterie_id)`, `is_coterie_member(coterie_id)`, `is_shared_via_coterie(object_id, target_user_id)`, `is_map_shared_with_user(map_id)`. NEVER raw-query `coteries_members` or `coteries_maps` from an RLS policy — always use the helper.
- **`private_notes` defense-in-depth** — RLS grants full-row SELECT on `objects_overrides` for coterie intel. Column filtering is app-side only (`select('user_id, shared_notes, data')` in DetailPanel). A `select('*')` bug would leak private notes. Prominent comment at the query site.
- **Invite acceptance RPC** — `accept_invitation_by_token(p_token, p_user_id)` SECURITY DEFINER, because the accepting user isn't a member yet and can't read/update invitations through member-based RLS policies.
- **`get_dissonances()` is SECURITY DEFINER** — reads across multiple users' overrides; RLS would be prohibitively complex. Function already scopes to calling user's coteries.
- **`get_coterie_shared_intel()` is SECURITY DEFINER** — reads peers' `connections_overrides` (RLS requires both endpoints in shared maps, but projects/events aren't in maps) and `coteries_shares` to find shared contacts/projects/events.
- **`coteries_shares` table** — universal per-coterie, per-item intel sharing. Replaces earlier `share_contacts` (on `coteries_members`) and `coterie_shared` (on `objects_overrides`) flags which were too blunt. Schema: `(coterie_id, user_id, object_id, share_type)` with `share_type` in ('contacts', 'project', 'event'). Private by default.

## Known Gotchas

### RLS Recursion — The #1 Gotcha
PostgreSQL detects **any** policy re-entry on the same table as infinite recursion — even if it's a SELECT policy checking during an INSERT. The chain `table_A INSERT → policy queries table_B → table_B SELECT policy queries table_A` = crash. Fix: ALL cross-table checks in RLS policies must use SECURITY DEFINER helper functions. We hit this on `coteries_members`, `coteries_maps`, and `maps` before creating the full set of helpers. If adding new RLS policies, NEVER raw-query `coteries_members`, `coteries_maps`, or `maps` — use `is_coterie_member()`, `is_map_shared_with_user()`, etc.

### Supabase Realtime postgres_changes (Local Dev)
Unreliable in local dev (JWT/RLS issues, GitHub #21624). **Workaround:** polling every 30s. Swap to Broadcast/Realtime on Supabase Cloud.

### Supabase Auth Seeding (Local Dev)
- Must insert `auth.identities` alongside `auth.users`
- `email_change`, `email_change_token_new`, `recovery_token` must be `''` not NULL (GoTrue crash)
- `phone` must be NULL (UNIQUE constraint), `is_sso_user = false`
- Debug: `docker logs supabase_auth_coterie`

### Supabase Cloud: SECURITY DEFINER Functions Need search_path
`SECURITY DEFINER` functions on Supabase Cloud don't default to `public` schema. Bare table names (e.g., `INSERT INTO profiles`) fail silently. Fix: always use `public.profiles` AND add `SET search_path = public` to the function definition. Discovered when `create_profile_on_signup` trigger caused "Database error saving new user" on OTP signup.

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

### React Flow Edge Click + `useOnSelectionChange` Race
`onEdgeClick` → `setSelectedItems([])` triggers the selection-change effect which clears edge highlights. `useOnSelectionChange` fires asynchronously after the initial render, so a boolean ref guard gets consumed too early. Fix: use a persistent `edgeClickedRef` that stays true until explicitly cleared in `handleNodeClick` or `handlePaneClick` — don't reset it inside the effect.

### Login `<Navigate>` Races useEffect
`<Navigate>` renders synchronously, but `useEffect` runs after render. Two rules for guard states like `checkingProfile`: (1) initialize to `true` (`useState(true)`), and (2) **only set `false` at the end of the successful async path** — never in early-return branches like `if (!user) return` or after `signOut()`. If the null-user branch sets `checkingProfile=false`, then when user transitions from null→non-null, the render fires Navigate before the effect can set it back to `true`. The effect's `setCheckingProfile(true)` runs too late. Discovered twice: first the initial state, then the early-return reset.

### Coterie Acceptance Must Copy Override Data
When accepting a shared map, the recipient's `objects_overrides` must include `name`, `title`, `status` from the owner's overrides — not just `map_x`/`map_y`. User-created objects have `objects.name = NULL` (skeleton row), so without copying, they render as blank shapes. Same for `connections_overrides`: owner's user-created connections (`connection_id IS NULL`) must be duplicated for the recipient to avoid spurious `new_connection` dissonances.

## UI Architecture

### Frame System
All UI panels use a shared `Frame` component: draggable, resizable, z-index-on-click (starts at 100, NavBar at 200). Key props: `actions`, `headerContent`, `titleClassName`, `resizable`, `persistKey` (localStorage + Supabase), `titleTooltip`. Double-click title bar to collapse/expand. `forwardRef` support.

NavBar: fixed top-right (account dropdown, hamburger menu, logo SVG). Hotkeys: N/S/M/C/, (toggle, suppressed in inputs).

### Logo Assets
SVG logos in `src/assets/`: `logo-name.svg` (dark), `logo-name-light.svg` (light), `logo-icon.svg`/`logo-icon-light.svg`, `logo-name-motto.svg` (with "Map your professional world" — marketing pages only). Two golds from the logo ARE the accent colors: `#d4b468` (lighter, dark-mode primary) and `#a68830` (darker, light-mode primary). Theme-aware via `useTheme().resolvedTheme`.

Canvas exposes `zoomToNode(nodeId)`, `clearSelection()`, `triggerCreate()` via `forwardRef`.

See `docs/UI_REFERENCE.md` for MapsFrame architecture, workspace persistence, color scheme tables, project structure, and schema overview.

### Theming
`data-theme` attribute on `<html>`, dark default. `ThemeContext` manages preference (light/dark/auto), persists to localStorage. Flash prevention via inline script in `index.html`. All colors are CSS variables — no hardcoded colors. **Palette**: dusty rose (org) + teal (person), gold accent. See `src/styles/global.css`.

### Typography
- **Urbanist** (`--font-sans`): primary display font — everything by default
- **Inter** (`--font-data`): data/functional text only (type labels, data fields in DetailPanel, pill subtitles). 2px smaller for x-height match.

### Keyboard UX
- **Frame** (`Frame.tsx`): ESC closes, Tab focus-trapped (cycles within panel), auto-focuses on mount/click
- **DetailPanel**: Tab focus-trapped, Enter toggles edit mode (opens when idle, saves when editing), Delete/Backspace triggers delete confirmation
- **MultiSelectPanel**: Delete/Backspace triggers bulk delete confirmation
- **MapsFrame/CoteriesFrame**: Right arrow opens detail card from list item
- **NavBar**: Hotkey hints shown on menu items (S/M/C/,)

## Running Locally

```bash
# Local dev
supabase start              # Requires Docker
open http://127.0.0.1:54323 # Studio UI
supabase db reset           # Reset after schema changes
npm run dev                 # → http://localhost:5173

# Cloud: Supabase project "coterie" in Buckethead org (sbgxgveornxaxxiowwsh, us-west-1)
# .env.local has cloud credentials (local config commented out for switching)
# Auth: 6-digit email OTP (no passwords) — works for both signup and login
```

Deploy: Supabase Cloud (`supabase db push`) + Vercel (`vercel --prod`).
Production: `https://coteriepro.com` (Vercel) + Supabase Cloud (sbgxgveornxaxxiowwsh, us-west-1).
Domain DNS: Porkbun → A record `76.76.21.21` + CNAME `www` → `cname.vercel-dns.com`.

## Status

Full build history: `docs/IMPLEMENTATION_STATUS.md`

### Next Up
- [x] "Accept and place" UX — ghost placement with drag interaction, tested and working
- [x] Supabase Cloud deployment + OTP auth
- [x] Non-user invitation flow — landing page, join page, auth handoff, welcome modal
- [x] Subscriptions table + `user_tier()` function
- [x] Edge Function for invite emails (Resend, not yet deployed/configured)
- [x] RLS policies — 65 policies across 20 tables, helper functions, SECURITY DEFINER RPCs
- [x] Vercel deployment + domain — coteriepro.com, SPA rewrites, env vars configured
- [x] Landing page (`/home`) — hero, interactive demo, features, waitlist CTA
- [x] Invite-only auth gate — `is_email_allowed()` pre-OTP check + post-auth safety net
- [x] Waitlist table + landing page form
- [x] Full code review — error handling, N+1 fixes, parallel queries, security hardening
- [x] RLS recursion fixes — SECURITY DEFINER helpers for all cross-table policy checks
- [x] FK cascade audit — all 39 FKs reviewed, 12 fixed (SET NULL / RESTRICT as appropriate)
- [x] Inline type/role deletion — trash icon in autocomplete dropdowns, min 2-char creation guard
- [x] Maps popover in DetailPanel — toggle map membership from object detail
- [x] Object pill titles — show title on landscape pills, fall back to types
- [ ] Stripe integration for subscription billing
- [ ] DetailPanel migration to Frame component (back burner)
- [ ] Light mode polish (back burner)
- [ ] Map packages (store) — later, possibly post-launch

### Planned (Pro)
- [ ] Operator dedup tooling
- [ ] Canon check / diff-merge UI
- [ ] Contact sync (Google/Microsoft APIs)

### Future Tiers
- [ ] **Secure**: E2EE contacts — per-user keypair (OpenPGP/ECC), coterie group keys, client-side encrypt/decrypt of `data.contacts` field
- [ ] **Studio**: AI contact intelligence (see `docs/STUDIO_CONTACT_INTELLIGENCE.md`)
- [ ] **Free**: Tauri desktop app, local SQLite, PowerSync for Pro↔local sync

## Reference

- **Seed data**: `scripts/known_landscape.json` (~130 companies: majors, prodcos, agencies, management)
- **API keys**: Supabase default local dev keys; Claude API in Settings
- **Tooling**: `/backup-global` pushes `~/.claude/CLAUDE.md` to GitHub Gist; `gh` CLI installed
