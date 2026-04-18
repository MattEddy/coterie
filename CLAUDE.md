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
- **Email**: AWS SES via shared `send-email` Edge Function (hosted on this project's Supabase)
- **Dev**: Supabase local (Docker), single migration file during early dev
- **Schema**: `supabase/migrations/20260203000000_pro_schema.sql` (edit directly, `supabase db reset` to rebuild)

## Email Infrastructure

This Supabase project hosts the **shared `send-email` Edge Function** used by all of Matt's apps (Bossword, Vivi, Subscriptix, Survival Box). AWS SES credentials are stored as Supabase secrets (`AWS_SES_ACCESS_KEY_ID`, `AWS_SES_SECRET_ACCESS_KEY`).

**Edge Functions:**
- `send-email` — Generic email sender. Accepts `{ app, to, subject, html, text }`. Maps `app` to sender address. Requires service_role JWT auth.
- `send-invite-email` — Coterie-specific. Triggered by webhook on `maps_invitations` INSERT. Calls `send-email` internally. Sends branded invitation with map name, sender name, and invite link.

**Sending domain:** `coteriepro.com` (verified in SES, DKIM + MAIL FROM DNS at Porkbun)
**Sender address:** `Coterie <noreply@coteriepro.com>`

Four tiers planned — building in order:

1. **Pro** (in development): Web app, full features (maps, sharing, intel). Standard encryption (AES-256 at rest via AWS/Supabase, TLS in transit, RLS access control) — matches Google/Apple/Outlook security model.
2. **Secure** (Pro add-on): E2EE on `objects_overrides.data.contacts` only. Client-side encryption with per-user keypair + map group keys for shared contacts. Exceeds Proton (they leave email unencrypted; we encrypt ALL personal reachability). Canon layer unaffected — contact info is structurally excluded by CHECK constraint, so E2EE has zero impact on platform features. Identity fields (name, title, types) remain plaintext.
3. **Studio** (Pro + AI): AI-powered contact intelligence, classification, etc.
4. **Free** (later, marketing funnel): Standalone local app (Tauri + React + SQLite). No auth, no server, no sharing — just the landscape tool. Upgrade trigger = sharing/backup/sync. Sync via PowerSync (Supabase ↔ local SQLite). Same React UI wrapped in Tauri.

## Data Model (Graph-based)

### Class + Types

Every entity has ONE **class** and MULTIPLE **types**:

```
Classes (fixed):     company, person, project, event, note
Landscape-visible:   company, person (on the canvas)
Off-landscape:       project, event, note (shown in detail panels, connected to landscape objects)

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

### Map Sharing

Maps are the sharing primitive. "Coterie" is purely the brand name, not a feature. The coterie abstraction was collapsed into maps on 2026-04-14 (migration `20260415000000`).

**origin_map_id model:**
- `maps.origin_map_id` — self-referential for the origin map (points to own ID), points to origin for recipient copies, NULL for unshared standalone maps
- **Membership is derived**, not stored: `SELECT user_id FROM maps WHERE origin_map_id = :origin` returns all members including the owner. No membership table needed.
- Origin map owner = admin. No role types beyond that.
- Supporting tables: `maps_invitations`, `maps_shares`, `maps_reviews`

**Sharing flow:**
- User A shares Map X → B gets Map Y (`origin_map_id = X`), C gets Map Z (`origin_map_id = X`). A's map has `origin_map_id = X` (self-ref).
- Each recipient gets a **copy** — their own `maps` row, `maps_objects`, `objects_overrides` with positions + data. Not linked, not synced.
- Three sharing channels:
  - **Channel 1 — Intel** (passive): notes shared via `maps_shares` on shared objects, attributed. Pure query pattern.
  - **Channel 2 — Updates** (diff-based): structural differences surface as dissonances. Self-correcting — reversed changes evaporate automatically.
  - **Channel 3 — Explicit shares** (`maps_shares` table): per-map, per-item sharing of contacts, projects, and events. One row = "I share this thing with this map's share group." Private by default, explicit opt-in.
- Five dissonance types: `new_object`, `new_connection`, `deactivated_connection`, `career_move`, `type_change`

**SECURITY DEFINER helpers:** `is_map_admin(origin_map_id)`, `is_map_member(origin_map_id)`, `is_map_invitee(origin_map_id)`, `is_shared_via_map(object_id, target_user_id)`, `is_map_shared_with_user(map_id)`. NEVER raw-query `maps` from an RLS policy — always use helpers.

**RPCs:** `share_map` (idempotent — works for initial share + adding invites), `accept_map_invitation` + `place_shared_objects` (two-step for placement UX), `get_dissonances`, `get_shared_intel`, `get_invitation_by_token`.

**Invitations as work queue:** `maps_invitations` has NO status column. Rows exist only while pending. Accept = DELETE + create recipient map. Decline = DELETE. Re-inviting someone just inserts a fresh row (no conflict). When the last member exits a shared map, the owner's `origin_map_id` auto-reverts to NULL (map becomes unshared again).

**Exit sharing UX:** Members can "Exit map sharing" — disconnects from the group but keeps the map and its objects as a standalone personal map. Admin cannot exit (must delete). Tooltip: "Exit map sharing", button: "Stop Sharing".

**Frontend:** `SharePicker` component for per-object sharing toggles (filtered to only show maps containing the object), `UpdatesFrame` for dissonance viewer. Sharing UI lives in `MapsFrame` — share button opens email form (same flow for first share and subsequent invites). `CoteriesFrame` no longer exists.

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
| `data.color` | Per-user hex override | Per-user hex override | — | — |
| `data.size` | Size tier index 0-4 | Size tier index 0-4 | — | — |

**Per-pill appearance** (`data.color`, `data.size`) lives in `objects_overrides.data` JSONB. Absent keys = use default (user's chosen default color, size tier 0 = S). Never stored as `null` — `commitStyle` in `Canvas.tsx` `delete`s the key when user picks the default. Five size tiers follow a **geometric progression** (1.00x, 1.32x, 1.73x, 2.28x, 3.00x — ~32% per step) defined in `src/constants/palettes.ts`. Two 8-color palette families: **warm** for orgs (Garnet/Rose/Saffron/Umber/Persimmon/Brick/Cinnabar/Cognac), **cool** for people (Dusty Teal/Slate Blue/Moss/Glacier/Deep Teal/Ash Violet/Indigo/Pewter).

### Guiding Tenet: No Person Private Reachability in Canonical Records

**Coterie shares WHO someone is, not HOW to reach them.** Person contact info (phone, email, address) is NEVER stored in canonical `objects.data`. Public URLs allowed. Enforced by CHECK constraint. Company contact info CAN be canonical. The anti-ZoomInfo stance, enforced by schema.

## Key Design Decisions

- **Deletion**: Canonical tables use soft delete (`is_active`) — `objects`, `connections`. User tables use hard delete. Maps use hard delete (no `is_active`). Orphaned user-created objects are hard-deleted. `connections_overrides.deactivated` boolean for canonical overrides only.
- **Option B storage**: user-created objects = skeleton `objects` row + all content in `objects_overrides`
- **Every object gets a registry row** — `is_canon` distinguishes vetted from user-created
- **`objects_overrides.object_id` always set** — overrides always point to an `objects` row
- **Coordinates always in overrides**, never canonical
- **Connections direction-agnostic** — `object_a_id`/`object_b_id`, no ordering; `connections_overrides` has no FK
- **UUID PKs for vocabulary** — `types` and `roles` prevent slug collisions; views join to `display_name`
- **Map sharing replaces coteries** — the 1:1 map-coterie model made the coterie abstraction redundant. Maps are now the sharing primitive directly. `origin_map_id` (self-ref for origin, points to origin for copies, NULL for unshared) is the sole connective tissue. Membership derived from query, not a join table. "Coterie" = brand only.
- **Sharing is diff-based** — self-correcting when changes reversed
- **Shared intel is a query pattern** — join members' overrides via shared map group
- **Maps are catalogs, not canvases** — collections with optional relative positioning
- **All FKs reference `profiles(user_id)`** not `auth.users(id)`
- **`created_by` is provenance, not a FK** — `types.created_by`, `roles.created_by`, `objects.created_by` have no FK constraint. NULL = platform-seeded, UUID = user-created (preserved after user deletion). `is_canon` is the authoritative flag, not `created_by`.
- **Account deletion** — must cascade cleanly through `auth.users` → `profiles` → all user data. Shared maps persist (origin transfers or orphans). `created_by` columns have no FK (provenance preserved). Apple 5.1.1(v) compliant.
- **Invite lookup for anonymous users** — `get_invitation_by_token()` SECURITY DEFINER RPC, callable by anon. No anon SELECT policy on invitations table (would expose emails).
- **Auto-create profile + subscription on signup** via trigger
- **Subscriptions table** tracks trial/payment status per user — `user_tier(uid)` returns `'pro'`/`'trial'`/`'free'`
- **VIP status** for internal users (billing-exempt, full Pro access) — just a subscription status value, not a separate role
- **RLS helper functions** — all cross-table membership/visibility checks MUST use SECURITY DEFINER helpers to avoid RLS recursion. PostgreSQL flags re-entry on the same table as infinite recursion, even across different policy types (e.g., INSERT policy → queries table B → B's SELECT policy → queries original table). Helpers will be rewritten from coterie-scoped to map-scoped during migration. NEVER raw-query membership tables from an RLS policy — always use helpers.
- **Invite acceptance RPCs** — two-step: accept invitation (creates recipient map copy + overrides, returns placement data as JSONB) then place objects (user picks anchor point, positions finalized). Ghost placement UX.
- **`get_dissonances()` is SECURITY DEFINER** — reads across multiple users' overrides; RLS would be prohibitively complex. Scopes to calling user's shared map groups.
- **`get_shared_intel()` is SECURITY DEFINER** — reads peers' overrides and `maps_shares` to find shared contacts/projects/events.
- **`maps_shares` table** (was `coteries_shares`) — universal per-map-group, per-item intel sharing. Schema: `(map_id, user_id, object_id, share_type)` where `map_id` = origin map. `share_type` in ('contacts', 'project', 'event', 'note'). Private by default.
- **Notes are objects** — class='note', `landscape_visible=false`. Connected to parent via 'note_on' connection. Text stored in `objects_overrides.name`. Each note independently shareable per map group via `maps_shares`. Replaced old `shared_notes`/`private_notes` TEXT columns (dropped from `objects_overrides` and `connections_overrides`).
- **Server-side RPCs for all multi-step operations** — SECURITY DEFINER functions for all multi-step DB orchestration. Every future client (iPad, etc.) gets this logic for free. 23 RPCs total after the 2026-04-15 offloading session (migration `20260416000000`): `create_object`, `upsert_connection`, `deactivate_connection`, `get_user_maps`, `get_pending_invites`, `get_connected_items`, `preflight_delete_object`, `set_object_types`, `accept_dissonance`, `leave_shared_map`, `get_share_picker_state` + the 12 originals.
- **Contact info stays JSONB** — contacts in `objects_overrides.data.contacts` are shared all-or-nothing per person per map group. Intentionally NOT objectified — the access pattern (read/write as a group) doesn't benefit from per-item granularity.
- **Cross-platform input** — Canvas multi-select checks both `metaKey` (Mac Cmd) and `ctrlKey` (Windows Ctrl). `multiSelectionKeyCode` is platform-detected. Pan via middle-click drag or Space+drag.
- **Per-user default pill colors** — `PillColorsContext` (`src/contexts/PillColorsContext.tsx`) stores `defaultOrgColor` + `defaultPersonColor` in localStorage. `useDefaultColorFor(class)` is the authoritative fallback for pill rendering; `getDefaultColor()` in `constants/palettes.ts` is a pure helper for non-React contexts only (e.g., `/dev/palettes` preview). Users pick their defaults from the 8-swatch rows in `SettingsFrame`. The style picker's leftmost "default" slot is reordered via `orderPaletteByDefault()` so the user's current default is always on the left of the divider.
- **Colored-surface text rule** — any UI with a saturated pill-colored background (ObjectNode, DetailPanel header, DemoDetailCard) uses off-white (`#f5f3f0`) as the base text color and layers **opacity** for hierarchy (primary 100%, title 82%, muted/types 72-75%, icons 70% → full on hover). Never color-based hierarchy on colored surfaces — it's unreadable on half the palette.
- **Pill-anchored UI must be scale-aware** — anything positioned from a pill's rect (DetailPanel, StyleToolbar, ResizeHandle) must multiply `NODE_WIDTH`/`NODE_HEIGHT` by the pill's effective scale (`sizeIndexToScale(data.size)`). Pills grow down-right from their top-left (which is scale-stable); the right/bottom edges require the scale multiplier. Remaining places still unscaled: `PlacementOverlay`, `ConnectionRoleForm` midpoint, `MultiSelectPanel` bounding box (tracked, low-priority).

## Known Gotchas

### RLS Recursion — The #1 Gotcha
PostgreSQL detects **any** policy re-entry on the same table as infinite recursion — even if it's a SELECT policy checking during an INSERT. The chain `table_A INSERT → policy queries table_B → table_B SELECT policy queries table_A` = crash. Fix: ALL cross-table checks in RLS policies must use SECURITY DEFINER helper functions. We hit this on membership tables and `maps` before creating the full set of helpers. If adding new RLS policies, NEVER raw-query `maps` or sharing tables — always use helpers.

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

### Stale Closures in useEffect Keydown Handlers
If a `useEffect` registers a `keydown` listener, every piece of state read inside the handler MUST be in the dependency array. Otherwise the handler captures a stale snapshot. Hit this with `deleteConfirm` in DetailPanel — Enter key triggered edit mode instead of confirming delete because the handler always saw `deleteConfirm` as null.

### Delete RPCs Must Clean Up maps_objects
`delete_object_with_cleanup` and `delete_multiple_objects` must explicitly `DELETE FROM maps_objects WHERE object_ref_id = ... AND map_id IN (user's maps)`. The FK CASCADE on `maps_objects.object_ref_id → objects.id` only fires when the `objects` row is hard-deleted, which doesn't happen for canonical objects. Without explicit cleanup, `get_user_maps` reports inflated object counts.

### Coterie Acceptance Must Copy Override Data
When accepting a shared map, the recipient's `objects_overrides` must include `name`, `title`, `status` from the owner's overrides — not just `map_x`/`map_y`. User-created objects have `objects.name = NULL` (skeleton row), so without copying, they render as blank shapes. Same for `connections_overrides`: owner's user-created connections (`connection_id IS NULL`) must be duplicated for the recipient to avoid spurious `new_connection` dissonances.

### Vercel Build is Stricter than Local `npm run check`
The `npm run check` script runs `tsc --noEmit` which tolerates unused imports. Vercel runs `npm run build` → `tsc -b && vite build`, and `tsc -b` (project references mode) **errors on `TS6133: declared but never read`**. Shipped a production deploy failure this way (`useEffect` import in `PillColorsContext` that wasn't called). Run `npx tsc -b` locally before merging to main when you suspect unused-import risk.

### Hook-Import Desync After Refactor
When removing internal component state during a refactor, double-check the hook imports. Dropped `useState` from StyleToolbar's import line while deleting one state call but forgot another still in the file — Vite's dev transform silently missed it but the runtime crashed with `useState is not defined`, blanking every selected pill's click handler. `npm run check` passed because TypeScript resolved the global React type. Moral: a green type-check doesn't mean the module loads.

## UI Architecture

### Frame System
All UI panels use a shared `Frame` component: draggable, resizable, z-index-on-click (starts at 100, NavBar at 200). Key props: `actions`, `headerContent`, `titleClassName`, `resizable`, `persistKey` (localStorage + Supabase), `titleTooltip`. Double-click title bar to collapse/expand. `forwardRef` support.

NavBar: fixed top-right (account dropdown, hamburger menu, logo SVG). Hotkeys: N/S/M/, (toggle, suppressed in inputs).

### Logo Assets
SVG logos in `src/assets/`: `logo-name.svg` (dark), `logo-name-light.svg` (light), `logo-icon.svg`/`logo-icon-light.svg`, `logo-name-motto.svg` (with "Map your professional world" — marketing pages only). Two golds from the logo ARE the accent colors: `#d4b468` (lighter, dark-mode primary) and `#a68830` (darker, light-mode primary). Theme-aware via `useTheme().resolvedTheme`.

Canvas exposes `zoomToNode(nodeId)`, `clearSelection()`, `triggerCreate()` via `forwardRef`.

See `docs/UI_REFERENCE.md` for MapsFrame architecture, workspace persistence, color scheme tables, project structure, and schema overview.

### Theming
`data-theme` attribute on `<html>`, dark default. `ThemeContext` manages preference (light/dark/auto), persists to localStorage. Flash prevention via inline script in `index.html`. Most colors are CSS variables — no hardcoded colors for surfaces/text. **Pills are a deliberate exception**: landscape pills render with a **theme-invariant saturated fill** (same bold look in both modes) — hex values live in `ObjectNode.module.css` and `src/constants/palettes.ts`, not CSS vars. Gold accent, person pills use a full-capsule `border-radius: 9999px`. See `src/styles/global.css` for vars.

### Style Picker & Pill Appearance
`ObjectNode` renders a pill with `background` = `previewColor ?? data.color ?? userDefaultColor` and `--pill-scale` CSS var driving width/height/font/padding via `calc()`. When a single pill is selected, Canvas renders:
- **`StyleToolbar`** (`src/components/StyleToolbar.tsx`) — a small floating frame with a palette icon, smart-placed at the opposite corner from DetailPanel (matches panel's vertical extent, opposite horizontal side). Locks a fixed offset from the pill on first placement and follows it on drag/pan/zoom.
- **`ResizeHandle`** (`src/components/ResizeHandle.tsx`) — a corner drag knob always visible when a pill is selected. `mousedown` enters resize mode (hides DetailPanel + palette icon); drag emits continuous scale via `onPreviewScale`; `mouseup` snaps to the nearest tier and commits via `onCommitIndex`.

**Two canvas-level sticky modes** — `resizeModeNodeId` and `colorModeNodeId` in `Canvas.tsx`. Both stay active after a commit so users can cycle colors or resize repeatedly; outside-click or Esc exits everything (selection + both modes + preview). Selection switching also resets both modes. Preview state (`stylePreview: { nodeId, color?, scale? }`) is pushed into node data via a `useEffect` so `ObjectNode` re-renders live; commits keep the preview visible through the DB round-trip to prevent flicker.

**Dev preview page** `/dev/palettes` (`src/pages/PalettePreview.tsx`) renders all candidate palettes as real pills with light/dark toggle. Useful for picking/validating palettes.

### Typography
- **Urbanist** (`--font-sans`): primary display font — everything by default
- **Inter** (`--font-data`): data/functional text only (type labels, data fields in DetailPanel, pill subtitles). 2px smaller for x-height match.

### Keyboard UX
- **Frame** (`Frame.tsx`): ESC closes, Tab focus-trapped (cycles within panel), auto-focuses on mount/click
- **DetailPanel**: Tab focus-trapped, Enter toggles edit mode (opens when idle, saves when editing), Delete/Backspace triggers delete confirmation
- **MultiSelectPanel**: Delete/Backspace triggers bulk delete confirmation
- **MapsFrame**: Right arrow opens detail card from list item
- **NavBar**: Hotkey hints shown on menu items (S/M/,)

## Running Locally

```bash
# Local dev
supabase start              # Requires Docker
open http://127.0.0.1:54323 # Studio UI
supabase db reset           # Reset after schema changes (wipes local data)
npm run dev                 # → http://localhost:5173
npm test                    # 17 RPC integration tests (requires local Supabase)
npm run check               # TypeScript + Vite build verification

# OTP codes for local dev: check Mailpit at http://127.0.0.1:54324
# Test accounts: matt@test.com, billy@test.com

# Cloud: Supabase project "coterie" in Buckethead org (sbgxgveornxaxxiowwsh, us-west-1)
# Auth: 6-digit email OTP (no passwords) — works for both signup and login
```

**Dev workflow:** Work on `dev` branch → push to GitHub (safe backup, not live). When ready to ship: `npm test` + `npm run check` → `supabase db push` (migrations to cloud) → merge `dev` into `main` with `--no-ff` (triggers Vercel deploy).

**`.env.local`** controls which DB localhost talks to. Currently pointed at **local Supabase**. Say "switch to cloud" or "switch to local" to toggle. coteriepro.com always uses cloud (env vars in Vercel dashboard).

Deploy: Supabase Cloud (`supabase db push`) + Vercel (auto-deploys from GitHub push to main).
Production: `https://coteriepro.com` (Vercel) + Supabase Cloud (sbgxgveornxaxxiowwsh, us-west-1).
Domain DNS: Porkbun → A record `76.76.21.21` + CNAME `www` → `cname.vercel-dns.com`.

## Status

Full build history: `docs/IMPLEMENTATION_STATUS.md`

### Next Up
- [x] "Accept and place" UX — ghost placement with drag interaction, tested and working
- [x] Supabase Cloud deployment + OTP auth
- [x] Non-user invitation flow — landing page, join page, auth handoff, welcome modal
- [x] Subscriptions table + `user_tier()` function
- [x] Edge Function for invite emails (migrated from Resend to AWS SES, deployed 2026-04-14)
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
- [x] Notes as objects — per-note coterie sharing, replaced old shared_notes/private_notes columns
- [x] Server-side RPCs — 12 functions replacing ~970 lines of frontend DB orchestration
- [x] DetailPanel UI polish — persistent add buttons, themed controls, consistent save/cancel, expandable intel
- [x] Help button — floating `?` reference card with controls/shortcuts/panel keys
- [x] Cross-platform input fixes — Ctrl+click multi-select on Windows, platform-detected lasso modifier
- [x] 1:1 map-coterie model — dropped `coteries_maps`, bidirectional object sharing via `source_coterie_id`
- [x] Collapse coteries into maps — origin_map_id model, drop coterie tables, maps become sharing primitive
- [x] Code review + RPC offloading — 11 new RPCs replacing ~60 round trips, bug fixes, invitations as queue
- [x] Test suite — Vitest RPC integration tests (17 tests), `npm test` / `npm run check`
- [x] Dev branch workflow — work on `dev`, merge to `main` with `--no-ff` to deploy
- [x] Per-pill color + size style picker — 8-color palettes (warm/cool), 5 size tiers, selection-attached toolbar + corner resize knob, sticky color/resize modes, user-configurable defaults in Settings
- [x] Bolder theme-invariant pills + full-capsule person shape + beefier edges
- [x] DetailPanel + DemoDetailCard header uses object color with off-white opacity hierarchy
- [x] Favicon — Coterie logo on black square, served from `public/favicon.svg`
- [ ] Stripe integration for subscription billing
- [ ] DetailPanel migration to Frame component (back burner)
- [ ] Light mode polish (back burner)
- [ ] Map packages (store) — later, possibly post-launch
- [ ] Scale-aware pill-anchored UI for remaining spots (PlacementOverlay, ConnectionRoleForm midpoint, MultiSelectPanel bbox) — low-priority

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
