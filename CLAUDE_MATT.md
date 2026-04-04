# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-03
**Branch:** main

### Narrative

Big session: DetailPanel refactor, UI redesign, coterie map protections, cross-frame refresh, Supabase Cloud deployment, and passwordless auth.

**DetailPanel refactor.** Extracted `TagInput` (153 lines) and `ObjectSearch` (114 lines) into their own files. Created `src/lib/connections.ts` with `getEffectiveConnections()` helper that replaces the repeated 3-query pattern (canon + user + deactivated connections) used in `loadConnectedItems`, `loadLinkedObjects`, and `initiateDelete`. Removed debug `console.log`s from `executeDelete`. Added `resetCreateForm()` helper (replaced 7 copy-pasted reset blocks) and `todayDateString()` helper. DetailPanel went from 2181 → 1787 lines.

**DetailPanel header redesign.** Header is now a colored "subcard" matching the object card — rose (`--color-org-dim`) for companies, teal (`--color-person-dim`) for people. Type chips use class-specific colors with `color-mix` tinted backgrounds. Divider line between header and tabs removed. Panel padding tightened from 16px → 10px, subcard internal padding 6px.

**Tab action buttons.** Moved edit/add buttons from a dedicated row (wasted vertical space) to floating overlays in the top-right corner of tab content, visible on hover only. `.tabFloatingAction` with `opacity: 0` → `1` on `.tabSection:hover`.

**Brighter muted text.** `--color-text-muted` bumped up: dark `#7a7070` → `#918888`, light `#8a8280` → `#736b68`.

**Coterie map protections.** Maps linked to coteries now show a `Users` icon badge in the map list (size 13, gold accent) and a persistent "Linked to **[coterie name]**" banner in the map detail card. Delete is blocked on coterie-linked maps — clicking trash shows the banner expanding to "Leave the **[coterie name]** coterie before deleting this map." Both sender maps (via `coteries_maps` join table) and recipient maps (via `source_coterie_id`) are detected. `loadMaps` resolves coterie names from both paths.

**Cross-frame refresh.** CustomEvent pattern for live updates:
- `maps:refresh` — fired after sharing a map as a coterie and after accepting a coterie invite. MapsFrame reloads and syncs `coterie_name` into open detail card.
- `coteries:refresh` — fired by NotificationBoxes when invite count changes. CoteriesFrame reloads invitations and coteries.

**Detail card switching.** Single-clicking a different item in Maps or Coteries list while a detail card is open now switches to the clicked item (previously required double-click to open, single-click only selected).

**Supabase Cloud deployment.** Created `coterie` project in Buckethead org (`sbgxgveornxaxxiowwsh`, us-west-1). Pushed schema via `supabase db push`. Fixed `create_profile_on_signup` trigger — needed `SET search_path = public` for cloud compatibility (separate migration `20260403000000_fix_profile_trigger.sql`). `.env.local` updated to cloud credentials (local config commented out for easy switching).

**Passwordless OTP auth.** Replaced email/password login with 6-digit email OTP via `supabase.auth.signInWithOtp` / `verifyOtp`. Three-step flow: enter email → enter code (6 individual inputs with auto-advance, paste support, auto-submit) → enter name (new users only, checks `profiles.display_name`). AuthContext exports `sendOtp`/`verifyOtp` instead of `signIn`. Works for both signup and login. Tested successfully — Matt's first real object (Netflix) created on cloud.

### Open Items / Next Steps
1. **`/invite/:token` landing page** — public route, validates token, shows coterie name + sender + canvas preview, CTA to sign up
2. **Edge Function for invitation emails** — triggered on `coterie_invitations` insert, sends email with invite link
3. **Vercel deployment** — deploy web app, get a domain, configure DNS + Supabase redirect URLs
4. **RLS policies** — real policies before wider access (permissive placeholders currently)
5. **Trial/payment system** — deferred until invite flow works end-to-end
6. **DetailPanel → Frame migration** — back burner, wants to use the app first
7. **Light mode polish** — back burner
8. **Map packages (store)** — later, possibly post-launch
9. **Delete AccountFrame files** — unused cleanup
