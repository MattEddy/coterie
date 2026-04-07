# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-06 (evening, continued)
**Branch:** main

### Narrative

Major deployment session — took Coterie from local-only to production at `coteriepro.com`, added RLS policies, fixed bugs, and built the public landing page. Two sub-sessions in one evening.

**Part 1 — Invite flow fixes + deployment prep.**

- Auth token question: confirmed Supabase localStorage-based auth means two regular Chrome windows share one session (last login wins). Separate Chrome profiles or incognito for multi-user testing.
- Invite landing copy trimmed: "Intuitively and visually" → "Visually", "Then link up with" → "Connect with". Fake demo data (Stranger Things, etc.) replaced with one-line descriptors matching contact/notes pattern.
- Welcome modal name step was being skipped. Root cause: `checkingProfile` in `Login.tsx` started `false`, so `<Navigate>` fired before `useEffect` could set `needsDisplayName`. Fix: initialize `checkingProfile` to `true`. The intro screen still showed via a different path (`pendingInviteToken` in Landscape Case 1).

**Part 2 — Vercel + domain + RLS.**

- Vercel deployment: linked repo, added env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`). First deploy failed on 18 pre-existing TS errors (unused vars, React 19 `useRef` args, React Flow `nodesSelectable` → `elementsSelectable`, `FrameLayout.h` type, RPC return types). All fixed.
- `vercel.json` created with SPA rewrite rule for React Router.
- Domain: `coteriepro.com` on Porkbun. Wildcard CNAME → `www` CNAME (conflict resolution), A record → `76.76.21.21`. Supabase Auth Site URL and redirect URLs updated.
- RLS: background agent wrote `supabase/migrations/20260407000000_rls_policies.sql` — 65 policies, 20 tables, helper functions (`is_coterie_admin`, `is_shared_via_coterie`), `accept_invitation_by_token` RPC. `acceptInvitation.ts` and `Landscape.tsx` updated for RLS-safe flows. Pushed to cloud.

**Part 3 — Landing page.**

- Built `src/pages/Home.tsx` + `Home.module.css` — public landing page at `/home` combining content from InviteLanding (overview + interactive demo) and InviteJoin (feature cards + pricing CTA).
- Structure: sticky header (logo left, nav right) → hero icon + headline + explainer → interactive ReactFlow demo → 4 feature cards → pricing/CTA footer.
- Router updated: unauthenticated `/` redirects to `/home` instead of `/login`. Nav links: Overview | Features | Plans | Login.
- ReactFlow canvas needed `min-height: 350px` — `aspect-ratio` alone gave zero height inside flex column.
- `global.css` has `overflow: hidden` on `html, body, #root` (for the canvas app). Landing page uses `overflow-y: auto` on its container to scroll.

**Files modified/created:**
- `src/pages/Home.tsx` + `Home.module.css` — new landing page
- `src/App.tsx` — added `/home` route, redirect unauthenticated to `/home`
- `src/pages/Login.tsx` — `checkingProfile` race fix
- `src/pages/InviteLanding.tsx` — copy trim, demo descriptors, RPC types
- `src/components/Canvas.tsx`, `CoteriesFrame.tsx`, `CoterieUpdatesFrame.tsx`, `Frame.tsx`, `MapsFrame.tsx`, `NotificationBoxes.tsx`, `Tooltip.tsx`, `InviteJoin.tsx`, `Landscape.tsx` — TS fixes
- `src/lib/acceptInvitation.ts` — RLS-safe RPC
- `supabase/migrations/20260407000000_rls_policies.sql` — full RLS
- `vercel.json` — SPA rewrite
- `.gitignore` — `.vercel`

### Open Items / Next Steps
1. **Test RLS end-to-end** — Matt is testing the flow on production tonight. Policies were agent-generated — verify invite→accept→share→intel works under RLS.
2. **Deploy Edge Function** — `supabase functions deploy send-invite-email`, set RESEND_API_KEY + APP_URL secrets. Without this, invites require manually sharing links.
3. **Stripe integration** — wire up Checkout, webhooks to update subscription status
4. **Charlotte coding setup** — Matt's 12-year-old daughter wants to start coding with Claude Code. Discussed isolation options: separate folder on same Mac vs. separate computer. Matt leaning toward the old computer. No action yet.
5. **DetailPanel → Frame migration** — back burner
6. **Light mode polish** — back burner
7. **Map packages (store)** — later, possibly post-launch
