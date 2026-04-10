# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-09
**Branch:** main

### Narrative

Matt tested the coterie share flow end-to-end and hit a persistent bug: the welcome modal sequence was wrong on first load. Specifically:
- **First load after invite signup**: app opened directly to "This is your Landscape" modal, skipping the "Enter your name" step. The coterie invite notification also lingered for several seconds.
- **On page reload**: the full welcome flow played correctly (name → landscape).

**First attempt — StrictMode theory.** Initially suspected React 18 StrictMode double-firing the Landscape effect, consuming one-shot sessionStorage flags (`needsDisplayName`, `showWelcomeModal`) on the first run, leaving nothing for the second. Added a `welcomeCheckedRef` guard to prevent double-execution, and replaced the `needsDisplayName` sessionStorage flag with a direct profile query (source of truth for whether display_name is set). Also removed the `needsDisplayName` sessionStorage from Login since Landscape now checks the profile directly. Added `coterie:refresh-notifications` event so NotificationBoxes clears immediately after invite acceptance instead of waiting for the 30s poll. Matt tested — same problem.

**Root cause found — Login Navigate race (redux).** The real issue was the documented "Login `<Navigate>` Races useEffect" gotcha, but the original fix was incomplete. The guard state `checkingProfile` was initialized to `true` (correct), but the effect's `if (!user) { setCheckingProfile(false); return }` branch undid it. When user transitioned from null → non-null (OTP verified), React re-rendered BEFORE the effect ran. The Navigate condition `user && !accepting && !checkingProfile` evaluated to true because `checkingProfile` was still `false` from the null-user cycle. Navigate fired prematurely — Login's `acceptAndRedirect` hadn't run yet, so `showWelcomeModal` wasn't in sessionStorage. Landscape mounted into a scrambled state.

**Fix:** Removed `setCheckingProfile(false)` from both the `!user` early-return and the `signOut()`/invite-only branch. Now `checkingProfile` is only set to `false` at the very end of the successful async path (after `acceptAndRedirect` has run and sessionStorage is properly set). The Navigate guard is harmless when user is null since the condition requires `user` to be truthy.

**Files modified:**
- `src/pages/Login.tsx` — removed premature `setCheckingProfile(false)` from two branches, removed `needsDisplayName` sessionStorage (no longer needed)
- `src/pages/Landscape.tsx` — added `welcomeCheckedRef` guard, replaced `needsDisplayName` sessionStorage with direct profile query, added `coterie:refresh-notifications` dispatch
- `src/components/NotificationBoxes.tsx` — listens for `coterie:refresh-notifications` event for immediate count refresh
- `CLAUDE.md` — updated the Navigate race gotcha with the full two-rule fix

### Open Items / Next Steps
1. **Invite flow re-test needed** — Matt was about to test the Login Navigate race fix. Needs confirmation that the name → landscape modal sequence works on first load.
2. **Stripe integration** — wire up Checkout, webhooks to update subscription status
3. **Polling → Realtime** — NotificationBoxes and CoterieUpdatesFrame poll at 30s, should switch to Supabase Realtime for production
4. **Hard vs soft delete audit** — Matt mentioned wanting to revisit this across the schema
5. **DetailPanel → Frame migration** — back burner
6. **Light mode polish** — back burner
