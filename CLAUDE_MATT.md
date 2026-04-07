# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-03 through 2026-04-06
**Branch:** main

### Narrative

Major session spanning multiple days: built the complete non-user invitation flow (landing page → join/pricing page → auth handoff → welcome modal), added logo branding, subscriptions schema, and invite email Edge Function.

**Logo branding.** Matt created SVG logos in a design tool. Five variants saved to `src/assets/`: `logo-name.svg` (dark), `logo-name-light.svg` (light), `logo-icon.svg`/`logo-icon-light.svg`, `logo-name-motto.svg` (includes "Map your professional world" — marketing pages only). The two golds in the logo (`#d4b468` lighter, `#a68830` darker) became the only accent colors: dark mode uses lighter as primary/darker as hover, light mode reverses them. Logo replaced text "Coterie" in NavBar (27px, theme-aware) and Login page. NavBar icons also bumped 18→27.

**Muted text brightened again.** `--color-text-muted`: dark `#918888` → `#a89e9e`, light `#736b68` → `#635b58`. Matt's MacBook Pro screen was making it too faint.

**Invite landing page** (`src/pages/InviteLanding.tsx`, route `/invite/:token`). Validates token against `coteries_invitations`, fetches coterie name + sender name. Layout: sender invitation line → motto logo → two-paragraph pitch text → interactive demo canvas → coterie blurb → "Learn More / Join" CTA. Dev shortcut: `/invite/demo` shows sample data. The pitch copy went through several iterations — Matt landed on: "Intuitively and visually array people, organizations, and information — so you can truly understand and harness your interpersonal landscape. Then link up with trusted collaborators to share and sync your Coterie information, keeping each other up to date and in the loop."

**Interactive demo canvas.** Standalone React Flow instance (not the full Canvas component — too coupled to auth/Supabase). Uses real `ObjectNode` and `RoleEdge` components. Five demo nodes: Netflix, Ted Sarandos, 21 Laps Entertainment, Shawn Levy, WME — mix of orgs (rounded rect) and people (pill shape). Straight lines with role labels (Employer/Employee, Overall Deal, Company/Founder, Client/Rep). Edge click highlights + shows roles. Node click opens a demo detail card (top-right of canvas) with 4 clickable tabs: Contact, Notes, Projects, Events — populated with realistic demo data (Stranger Things 5, Deadpool & Wolverine, CinemaCon Keynote, etc.). Framed label at top: "Try it out – drag, click, explore:". Page designed for laptop screens (900px max-width).

**Join/pricing page** (`src/pages/InviteJoin.tsx`, route `/invite/:token/join`). Four horizontal feature cards with custom thumbnail SVGs Matt designed: Landscape, Details, Maps, Coteries. Each has gold-bordered thumbnail + title + description. Pricing section: "Start free. No card needed. Try Coterie free for 2 months — then continue for $3.99/month or $39/year." CTA: "Start Free Trial" button. Below: coterie-specific blurb + offline fallback note ("After your trial, you can continue using Coterie Free offline...").

**Subscriptions schema** (`supabase/migrations/20260406000000_subscriptions.sql`). New `subscriptions` table: `status` (trialing/active/past_due/canceled/free/vip), `plan_id` (future-proof for `pro_monthly_399` style IDs), `trial_ends_at`, `trial_duration_days` (default 60), `coupon_code`, `stripe_customer_id`/`stripe_subscription_id`, `metadata` JSONB. `user_tier(uid)` function returns `'pro'`/`'trial'`/`'free'` with lazy trial expiry downgrade. Signup trigger creates both profile + subscription row. Existing users backfilled as VIP. Pricing: $3.99/mo or $39/year (2 months free on annual). VIP status = billing-exempt full access for company owners/employees.

**Auth handoff** (`src/pages/Login.tsx`). Login reads `?invite=TOKEN&email=ADDRESS` params. Pre-fills email from invitation with "We'll send a code to **email**" + "Use a different email to join Coterie" link below. After OTP verification: existing users auto-accept invitation immediately, new users go through name step first then accept. `acceptInvitationByToken` utility (`src/lib/acceptInvitation.ts`) extracted from CoteriesFrame's acceptance logic — handles all steps: mark accepted, add to members, create aggregated map, fetch owner positions, compute centroid, create overrides with relative layout, copy owner's user-created connections. Sets `showWelcomeModal` flag in sessionStorage.

**Logged-in acceptance path** (`src/pages/Landscape.tsx`). On mount, checks sessionStorage for `pendingInviteToken` (already-logged-in user from invite flow) or `showWelcomeModal` flag (user who just came through Login). Accepts the invitation and shows the welcome modal.

**Welcome modal.** Centered overlay on Landscape: "Welcome to Coterie / This is your Landscape. Everything you add, change, or note is yours — [Sender] and your coterie will see shared notes, but your Landscape is your own. / [Got it]". Styled with `--color-surface` card, `--color-accent` button.

**Invite email Edge Function** (`supabase/functions/send-invite-email/index.ts`). Receives database webhook payload on `coteries_invitations` INSERT. Fetches coterie name + sender name from DB. Sends styled HTML email via Resend API with "View Invitation" CTA button. Graceful fallback: logs email content if `RESEND_API_KEY` not set. Not yet deployed — needs `supabase functions deploy`, secrets configuration, and webhook setup in Dashboard.

**Searched conversation history.** Matt asked to find prior design discussion about the landing page. Discovered that session transcripts are stored as JSONL files at `~/.claude/projects/<project-path>/`. Added a "Conversation History" section to the global `~/.claude/CLAUDE.md` documenting this. Found the original March 24-25 brainstorm with the full landing page wireframe, demo canvas concept, and welcome modal copy.

### Open Items / Next Steps
1. **RLS policies** — Matt wants to test the flow first, then lock down. Needed before any real users. Permissive placeholders currently.
2. **Test full invite flow** — create a real invitation in cloud DB, walk through landing → join → signup → acceptance → welcome modal
3. **Deploy Edge Function** — `supabase functions deploy send-invite-email`, set RESEND_API_KEY + APP_URL secrets, configure webhook in Dashboard
4. **Vercel deployment** — deploy web app, get a domain, configure DNS + Supabase redirect URLs
5. **Stripe integration** — wire up Checkout, webhooks to update subscription status
6. **Light-mode motto logo** — Matt needs to create the reversed-gold variant of `logo-name-motto.svg`
7. **DetailPanel → Frame migration** — back burner
8. **Light mode polish** — back burner
9. **Map packages (store)** — later, possibly post-launch
10. **Delete AccountFrame files** — unused cleanup
