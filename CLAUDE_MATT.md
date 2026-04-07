# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-06
**Branch:** main

### Narrative

End-to-end testing session for the invite/share flow. Fixed a chain of bugs, upgraded logos, redesigned the signup welcome experience, and solved user deletion constraints.

**Login blank screen fix.** `useCallback` was imported in the welcome modal commit but never added to the React import line in `Login.tsx`. Vite's dev server threw a runtime ReferenceError, rendering the login page blank black.

**Logo V2 upgrade.** Matt provided 6 new SVG files (icon/name/motto × dark/light). Copied into `src/assets/` replacing V1 versions. New file: `logo-name-motto-light.svg` (didn't exist before). All three pages using the motto logo (Login, InviteLanding, InviteJoin) now theme-switch between dark/light variants via `useTheme`. NavBar was already theme-aware so file copy handled it.

**Login page redesign.** Added "Welcome to" text above logo, doubled logo height (28→56px), changed subtitle to "Please login to get started." Later switched from motto logo back to name-only logo — "a little busy with the motto, and we don't need to sell at this point."

**Frame viewport clamping fix.** Settings menu appeared to not open — the Frame was rendering off-screen at a persisted position. Added `clampToViewport()` that ensures the full frame stays within viewport bounds when restoring saved positions. Applies to all Frame-based panels. Started at 40px margin, Matt bumped to 100px, then asked for full frame clamping — no reason not to.

**Invite flow "not found" bug.** Anonymous visitors couldn't look up invitations because the `coteries_invitations` RLS policy only granted access to `authenticated`. Instead of adding a blanket anon SELECT (would expose emails), created `get_invitation_by_token()` SECURITY DEFINER RPC callable by anon. InviteLanding and InviteJoin now use this single RPC instead of 3 separate queries.

**Table rename.** `coterie_invitations` → `coteries_invitations` for naming consistency. Renamed across 10 files (schema, components, docs). Cloud migration uses guarded `DO $$ IF EXISTS` block since local schema already has the new name. Fixed subscriptions migration idempotency (`IF NOT EXISTS`) that was breaking `db reset`.

**Display name bug.** Members showed as UUIDs in coterie panel because `profiles.display_name` was null. Root cause: the Login page's name step was being skipped — the `<Navigate>` guard fired synchronously before `useEffect` could check the profile and switch to the name step.

**Two-step welcome modal.** Replaced the Login page name step + separate Landscape welcome modal with a unified two-step modal on Landscape: (1) "Welcome to Coterie. Please enter your name to get started." with name input, (2) "This is your Landscape. It's private and unique to you..." with coterie/double-click guidance. Login now always redirects after auth, signals `needsDisplayName` via sessionStorage. Non-invite signups also get both steps.

**Editable display name in account dropdown.** NavBar account popover now shows display name above email with pencil icon to edit. Loads from profiles, saves on enter/blur. Shows "Set your name" prompt if unset.

**Type overrides missing on share.** When a coterie was shared, the recipient's objects didn't get the owner's `objects_types_overrides`, so types surfaced as `type_change` dissonances. Added type override copying to both `acceptInvitation.ts` and all three placement paths in `CoteriesFrame.tsx`.

**Account deletion FK cascade.** Deleting a user from Supabase Auth failed due to FK constraints. Design discussion:
- `created_by` columns (types, roles, objects) — dropped FK entirely. These are provenance/audit, not structural. `is_canon` is the real signal. UUID preserved after deletion.
- `coteries.owner_id` — nullable + `ON DELETE SET NULL`. "Ownerless coteries" model: all remaining members get admin privileges. No forced ownership transfer, no surprise notifications. Apple 5.1.1(v) compliant.
- `coteries_invitations.invited_by` — CASCADE (clean up orphaned invites).
- `coteries_invitations.user_id` — SET NULL.
- Cloud migration needed dynamic constraint name lookup (table rename didn't update FK names). First migration used static names that missed; second migration (`20260406400000`) used `pg_constraint` lookup.

**CoteriesFrame admin logic.** Added `isAdmin = isOwner || !coterie.owner_id` — ownerless coteries grant all members delete/invite privileges. `owner_id` type updated to `string | null`.

### Open Items / Next Steps
1. **RLS policies** — needed before any real users. Permissive placeholders currently.
2. **Deploy Edge Function** — `supabase functions deploy send-invite-email`, set RESEND_API_KEY + APP_URL secrets, configure webhook in Dashboard
3. **Vercel deployment** — deploy web app, get a domain, configure DNS + Supabase redirect URLs
4. **Stripe integration** — wire up Checkout, webhooks to update subscription status
5. **Matt had "two things to work out"** — only got to the first (type overrides bug + welcome modal). Second item not yet discussed.
6. **DetailPanel → Frame migration** — back burner
7. **Light mode polish** — back burner
8. **Map packages (store)** — later, possibly post-launch
