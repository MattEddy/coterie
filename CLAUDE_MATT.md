# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-13/14
**Branch:** main

### Narrative

**1:1 map-coterie model.** Matt walked through a scenario where Person A shares a coterie map with Person B, and identified a fundamental gap: B couldn't add objects to the coterie. The old model had `coteries_maps` (N:M join table) defining scope, making the owner the sole broadcaster. After jamming on two approaches (multi-contributor maps vs explicit `coteries_objects` table), we landed on: **one map, one coterie**. The map IS the shared workspace. `source_coterie_id` on `maps` is the sole link — set on both the owner's map (at coterie creation) and each recipient's map (at acceptance). The `coteries_maps` join table was dropped entirely.

Key design decisions explored:
- Multi-map coteries rejected — two use cases tested ("3 maps at creation" and "add a second map later") both felt messy. Different trust circles = different coteries.
- One map per coterie, one coterie per map. Enforced structurally by `source_coterie_id` being a single UUID column.
- If a user wants to share overlapping objects with different groups, they create separate maps (objects are cheap `maps_objects` rows).

**Schema migration** (`20260413000000_one_map_one_coterie.sql`):
- Dropped `coteries_maps` table and its 3 RLS policies
- Added `is_coterie_invitee()` SECURITY DEFINER helper — lets invited (non-member) users see coterie name in the invitation list. Without it, the Supabase join `coteries(name)` returned null because `coteries_read` required membership.
- Updated `coteries_read` policy to include `is_coterie_invitee(id)`
- Replaced `create_coterie_with_maps(UUID[])` with `create_coterie_with_map(UUID)` — sets `source_coterie_id` on owner's map
- Updated `share_map_as_coterie` wrapper
- Updated `accept_coterie_invitation` — queries `maps WHERE source_coterie_id = coterie_id` instead of `coteries_maps`; adds ALL objects to recipient's `maps_objects` (even ones they already have — their overrides win, but map membership is comprehensive)
- Simplified `get_dissonances` `shared_objects` CTE — single query on `maps.source_coterie_id`

**Fixup migration** (`20260414000000_fix_shared_via_coterie.sql`):
- `is_shared_via_coterie()` still referenced dropped `coteries_maps`. Updated to use `maps.source_coterie_id`. This was blocking dissonance acceptance — B couldn't read A's `objects_overrides` via the coterie RLS policy.

**Frontend changes:**
- `CoteriesFrame.tsx` — single-map picker in `CreateCoterieForm` (was multi-select), calls `create_coterie_with_map` (singular), `loadDetail` queries maps by `source_coterie_id`, removed `map_count` from `CoterieRow`, replaced "Maps" section with "Linked to Map **X**" banner above Members
- `MapsFrame.tsx` — removed `coteries_maps` lookup block in `loadMaps()`, all coterie name resolution via `source_coterie_id`. Updated banner text to "Linked to Coterie **X**"
- `CoteriesFrame.module.css` — replaced `mapList`/`mapItem`/`mapItemIcon`/`mapItemName` classes with `linkedBanner`/`linkedBannerIcon`
- `supabase/seed.sql` — replaced `coteries_maps` INSERT with `source_coterie_id` UPDATE, removed stale `shared_notes` column references

**Bugs found during testing:**
- "Unknown" coterie name on invitation — `coteries_read` RLS blocked non-members from seeing coterie. Fixed with `is_coterie_invitee()` SECURITY DEFINER helper.
- Create coterie from CoteriesFrame did nothing — cloud DB didn't have new RPC yet (`create_coterie_with_map`). Needed `supabase db push`.
- Coterie detail showed "0 Maps" — `loadDetail` callback had `user` in closure but not in `useCallback` dependency array. Fixed by adding `user` to deps.
- Accept dissonance did nothing — `is_shared_via_coterie()` still referenced `coteries_maps`. Fixed with separate migration.
- Stale Vercel bundle — user was testing on coteriepro.com instead of localhost. Cloud DB had the migration but JS bundle was old.

### Open Items / Next Steps
1. **Push to GitHub** — Vercel will rebuild with new frontend code (cloud DB already has migrations)
2. **Stripe integration** — wire up Checkout, webhooks to update subscription status
3. **Polling → Realtime** — NotificationBoxes and CoterieUpdatesFrame poll at 30s
4. **DetailPanel → Frame migration** — back burner
5. **Light mode polish** — back burner
