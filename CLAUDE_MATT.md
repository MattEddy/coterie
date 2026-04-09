# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-07 → 2026-04-08
**Branch:** main

### Narrative

Marathon session spanning two days — overnight code review, then a full day of hardening, new features, and invite flow debugging.

**Overnight code review (Apr 6→7).** Matt asked for a full code review since the app was live with RLS. Ran parallel exploration agents across schema, components, hooks, services, and edge functions. Found ~15 real issues across three categories: bugs (missing error handling everywhere, fire-and-forget position saves, stale closures), performance (N+1 query loops, 3s polling of expensive `get_dissonances` RPC, sequential queries that could be parallel), security (edge function with no webhook signature verification, `private_notes` defense-in-depth gap). Fixed all in one commit (13 files, +298/-136). New migration added 4 missing indexes + `objects_types_overrides` updated_at trigger. All pushed to Supabase Cloud + Vercel.

**Invite-only mode (Apr 7 morning).** Matt realized the app was open to anyone. Built two layers: (a) landing page CTA changed from "Start Free Trial" to "Join the Waitlist" with email form (new `waitlist` table, anon INSERT policy), login link removed from nav; (b) auth gate in Login.tsx — `is_email_allowed()` SECURITY DEFINER RPC checks `auth.users` + `coteries_invitations` before sending OTP. Post-auth safety net kept as backup. Fixed case-sensitivity bug in email comparison (`lower(email) = lower(p_email)`). Fixed fail-open logic that was skipping `acceptAndRedirect` on profile query error. Fixed duplicate GoTrueClient warning (Home.tsx was creating its own Supabase client for waitlist — switched to shared client). Stabilized `signOut` reference with `useCallback`.

**Vercel env var issue.** Anon key was truncated (91 chars vs 209) — clipped during original paste into Vercel dashboard. Diagnosed by comparing `vercel env pull --environment production` with local `.env.local`. Fixed via `vercel env add --force` piping from `.env.local`. Redeployed with `vercel --prod`.

**RLS recursion — the major saga.** Three rounds of fixes:
1. `coteries_members_read` policy queried `coteries_members` in its own USING clause → infinite recursion. Fix: `is_coterie_member()` SECURITY DEFINER helper.
2. `coteries_read` policy only allowed members to read — but coterie creation inserts the row THEN adds the member. The `.select('id')` after INSERT was blocked. Fix: added `owner_id = auth.uid()` to read policy.
3. `coteries_maps` INSERT → policy queries `maps` → `maps_read` queries `coteries_maps` → recursion. Comprehensive fix: created `is_map_shared_with_user()` SECURITY DEFINER, replaced ALL raw cross-table membership queries in policies with helper functions. No raw `coteries_members` or `coteries_maps` references remain in any RLS policy.

**FK cascade audit.** Matt noticed hard-deleting coteries didn't cascade to invitations. Audited all 39 FKs. Fixed 12 that defaulted to NO ACTION: role FKs → SET NULL, type FKs → RESTRICT, source_map/source_coterie → SET NULL, taxonomy refs → RESTRICT.

**UI features and fixes:**
- Added "Create" button to new object form (gold accent, disabled until name entered)
- Inline type/role deletion — trash icon on hover for user-created entries in autocomplete dropdowns. Min 2-char guard on new type/role creation.
- Object pills now show title (e.g., "VP Production") instead of types when title is set. Falls back to types. Same bright class color for both.
- Bumped dim colors on object pills up a notch for better visibility.
- Maps popover in DetailPanel — map icon button next to pencil, dropdown shows all maps with checkmarks for membership, search to filter, click to toggle, click outside to close.
- Added `fitViewOptions={{ padding: 0.3 }}` so canvas feels less cramped on load.
- Fixed landing page scroll (nested `overflow-y: auto` on `.page` was creating a scroll-within-scroll).
- Fixed share-from-map-detail: blur/click race condition where `onBlur` cleared `shareEmailInput` before `handleShare` could read it. Also the Share button's `disabled` check didn't account for typed-but-not-added email.
- Fixed cross-panel refresh: `maps:refresh` dispatched after auto-add on object create, MapDetailCard listens for it. `coteries:refresh` dispatched after coterie creation from map detail.
- Fixed welcome modal: `coteries_members` query used `created_at` (doesn't exist) instead of `joined_at`. Also crashed on null `owner_id`.

**Landing page copy tweaks.** "Coterie is currently invite-only." (cut "for now" and rolling-out text). Cut "understand and" from explainer.

**Files modified (major):**
- `src/lib/acceptInvitation.ts` — full error handling, Promise.all for map objects
- `src/components/Canvas.tsx` — parallel connection queries, position save error logging, stale closure fix, fitView padding, maps:refresh dispatch, min 2-char roles
- `src/components/DetailPanel.tsx` — error handling on all saves, maps popover, private_notes comment
- `src/components/CoteriesFrame.tsx` — N+1 → Promise.all, error handling, pending email scoop-up
- `src/components/MapsFrame.tsx` — N+1 → Promise.all, error handling, share blur race fix, coteries:refresh dispatch, maps:refresh listener on detail card
- `src/components/ObjectNode.tsx` — title display with type fallback
- `src/components/TagInput.tsx` — inline delete for user-created types
- `src/components/ConnectionRoleForm.tsx` — inline delete for user-created roles
- `src/components/CreateObjectForm.tsx` — Create button
- `src/components/NotificationBoxes.tsx` — polling 3s → 30s
- `src/components/CoterieUpdatesFrame.tsx` — polling 3s → 30s, error handling
- `src/components/MultiSelectPanel.tsx` — error handling
- `src/contexts/AuthContext.tsx` — error handling, useCallback on signOut
- `src/pages/Login.tsx` — invite-only gate, pre-OTP email check, fail-open fix
- `src/pages/Home.tsx` — waitlist form, copy tweaks, removed duplicate Supabase client
- `src/pages/Landscape.tsx` — welcome modal fixes (joined_at, null owner)
- `src/hooks/useWorkspaceLayout.ts` — cache reset on user change, save error logging
- `src/styles/global.css` — bumped dim colors
- `supabase/functions/send-invite-email/index.ts` — webhook verification, Resend response validation
- New migrations: indexes+trigger, waitlist, email gate, RLS recursion fixes (3), FK cascade audit

### Open Items / Next Steps
1. **Invite flow testing** — welcome modal still needs verification. Matt hit Supabase email rate limit mid-test. Two tests so far: first showed delayed modal (browser throttling?), second showed no modal (fixed `joined_at` bug since then). Needs one more clean test.
2. **Supabase email rate limit** — hit the limit during invite testing. Need to wait or configure Resend for production email sending.
3. **Stripe integration** — wire up Checkout, webhooks to update subscription status
4. **Polling → Realtime** — NotificationBoxes and CoterieUpdatesFrame now poll at 30s instead of 3s, but should switch to Supabase Realtime for production
5. **Hard vs soft delete audit** — Matt mentioned wanting to revisit this across the schema
6. **DetailPanel → Frame migration** — back burner
7. **Light mode polish** — back burner
