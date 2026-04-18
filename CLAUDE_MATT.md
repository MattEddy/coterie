# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-17
**Branch:** dev (repeatedly merged to main throughout — live on coteriepro.com)

### Narrative

**The "take the app to a new level" session.** Started with small UI fixes, morphed into a full visual-design overhaul: per-pill color + size customization, a whole palette system, and a selection-attached restyle toolbar. Matt's biggest compliment at the end: "AMAZING AMAZING AMAZING."

**Warm-up fixes.**
- Chrome autofill was rendering fields bright-white in dark mode on the share-map form. Fixed globally in `global.css` with `-webkit-box-shadow inset` trick + `-webkit-text-fill-color` to override Chrome's forced color.
- Standardized Map Detail action order per Matt's new rule: **Edit → Link → Share → Delete → Close**. Applied to `MapsFrame.tsx`.
- Swapped the `&times;` text glyph in `Frame.tsx` for a Lucide `<X size={16} />` so the close icon reads as slightly larger than the 14px action icons, matching the DetailPanel's relationship.

**Map-hide feature — killed before shipping.** Matt pitched "hide a map (graveyard) so its objects disappear." We jammed on the intersection case (object in hidden map + visible map → which wins?) and together concluded: not worth the complexity tax, existing Focus/Isolate already solves the pragmatic need. Matt's own instinct was right. Shelved.

**DetailPanel drag-follow bug.** Matt noticed the panel follows the pill left-right but stays fixed vertically. Root cause in `DetailPanel.tsx:451-460`: intentional lock after first placement (to prevent content-growth jumps) was over-scoped — it also suppressed Y updates when the node moved. Rewrote as **"compute once, follow forever"**: placement key `${object.id}|${preferredSide}`, record offset on first placement, subsequently `panel = nodeRect + offset`. Same pattern reused later for StyleToolbar.

**The big feature arc — per-pill style customization.**

Matt's pitch: *"users will end up with a vast sea of visually nearly identical greenish and pinkish shapes... could we add the ability to change a pill's color and size?"* We jammed on the product philosophy first (utility vs living artifact — Matt's building the artifact). Then specifics:

- **Size = hierarchy channel, tiered not continuous.** Initially Matt wanted continuous smooth resize; I pushed back because continuous kills the "these 5 pills are L" visual grouping. Landed on **hybrid**: drag feels continuous, snaps to nearest tier on release. Geometric progression, not linear — 1x / 1.32x / 1.73x / 2.28x / 3.00x, ~32% per step, because the eye perceives size logarithmically.
- **Color = per-class palette families.** Matt's elegant solve: warm colors for orgs, cool for people — preserves class identity as silent background grammar while giving expressive freedom within. 8 swatches per family.
- **Theme-invariant pills.** Matt wanted bolder, not "faded light-mode pills" — switched from the `-dim` class var system to hardcoded saturated hex values (`#8e4a52` Garnet default for orgs, `#4a9ab0` Dusty Teal for people). Off-white text (`#f5f3f0`) at varying opacity for hierarchy on colored surfaces.

**Palette picking jam session.** Built a `/dev/palettes` preview page (`src/pages/PalettePreview.tsx`) rendering candidate palettes as real pills with light/dark toggle. Proposed 4 palettes; Matt iterated — "Warm A but replace Terracotta with Garnet and Antique Gold with Cognac" → Warm C. Then "Mauve is too cool, can we get a red that's different from Garnet?" → added **Cinnabar**. Cool C = Sea Stone base with Deep Teal + Indigo swapped in. Locked.

**Interactive picker UI.** Matt's original pitch had a small frame with recolor + resize icons floating at the opposite corner from DetailPanel. Implementation went through several iterations:

1. Built frame with both icons + separate drag handle behind a mode toggle
2. Matt: *"do we even need a resize button? What if the knob is always visible on the pill, grabbing it enters resize mode in one gesture?"* — great call. Removed the resize icon; ResizeHandle now renders whenever single-selected, mousedown enters resize mode.
3. Matt: *"resize mode should stay active until click-away, not exit on release"* — made resize sticky.
4. Matt: *"color mode should work the same way"* — lifted `mode` state from StyleToolbar internal to a Canvas-level `colorModeNodeId`. Click palette icon → swatch row replaces everything (DetailPanel + knob vanish); click swatches freely; click-away exits. Sticky parallel to resize mode.

**Bugs squashed along the way.**
- After the color-mode refactor, clicking *any* pill blanked the entire screen. I'd removed `useState` from StyleToolbar imports while deleting the internal `mode` state, forgetting that another `useState` call (for `pos`) was still in the file. TypeScript passed because React global type satisfied it, but Vite's runtime module didn't have it. Lesson: **a green `tsc --noEmit` doesn't mean the module loads.**
- Drag math was `Math.max(dx, dy)` which picks the less-negative on inward drags — shrink only worked on certain angles. Fixed to `dx + dy` for proper signed direction.
- Jerky drag was snapping the preview to tiers every frame, causing teleport + CSS transition fights. Rewrote preview to carry a raw float `scale` during drag; snap only on mouseup.
- Removed Cancel X and Done buttons per Matt's spec — outside-click + Esc handle everything.

**Visual polish pass.**
- DetailPanel header uses `object.data?.color ?? userDefault` as background. Applied the "on colored surface, everything is off-white; hierarchy via opacity" rule (primary 100%, title 82%, muted/types 72-75%, icons 70%). Matt caught one spot where `.title` was still rendering at `--color-text-muted` gray — fixed.
- Person pills now `border-radius: 9999px` (full capsule) — stays oval at every size tier instead of looking rectangular when enlarged.
- Edges bumped: `--color-edge` `#2e2e30 → #555559` (dark), `#c8c4c0 → #a8a39f` (light); `strokeWidth: 1.5 → 2`. Now reads as connective tissue, not ghost lines.
- DetailPanel scale-aware: `nodeRect` now uses `NODE_WIDTH * effectiveScale` so panel opens flush against the *actual* pill edge, not the un-scaled one. Flagged remaining unscaled positions (PlacementOverlay, ConnectionRoleForm, MultiSelectPanel bbox) as low-priority cleanup.

**User-configurable defaults.** Matt's "last crazy request": *"can users pick their default pill colors in Settings?"* Built `PillColorsContext` (`src/contexts/PillColorsContext.tsx`) following the ThemeContext pattern — localStorage-persisted, exposes `defaultOrgColor` + `defaultPersonColor` via `useDefaultColorFor(class)` hook. SettingsFrame gained two swatch rows. All pill-rendering consumers (ObjectNode, StyleToolbar, DetailPanel) now use the hook. `orderPaletteByDefault()` helper ensures the style picker's leftmost slot is always the user's current default. Changing the default instantly recolors all default-colored pills on the landscape; per-object overrides stay untouched.

**Marketing demos updated.** Home and InviteLanding interactive demos extended `demoNode` to accept `{color, size}`. Final sizes per Matt: Netflix XL (Brick), WME L (Cognac), 21 Laps M (Saffron), Shawn Levy M (default), Ted Sarandos S (Amethyst). Repositioned 21 Laps and WME to clear the enlarged Netflix. DemoDetailCard reads the pill's color for header. Copy tweak: "No contact information yet" → "Store contact information." (active affordance framing).

**Favicon.** Was serving Vercel default because no `<link rel="icon">` existed. Created `public/favicon.svg` — first as the raw gold logo (melted into Chrome's light blue tab bar), then on a black circle (Matt: *"icon's too small when shrunk"*), finally settled on **black square with icon at native scale** for maximum visibility at 16x16.

**Vercel build fix.** Four production deploys failed on `TS6133: 'useEffect' is declared but its value is never read` in `PillColorsContext`. Local `npm run check` (`tsc --noEmit`) is lenient; Vercel runs `tsc -b` (project references) which is strict. Dropped the unused import, documented in CLAUDE.md. Future rule: run `npx tsc -b` locally before merging when there's unused-import risk.

**Files created this session:**
- `src/constants/palettes.ts` — palette entries + size scale helpers
- `src/contexts/PillColorsContext.tsx` — user default color prefs
- `src/components/StyleToolbar.tsx` + `.module.css`
- `src/components/ResizeHandle.tsx` + `.module.css`
- `src/pages/PalettePreview.tsx` — dev-only palette comparison at `/dev/palettes`
- `public/favicon.svg`

**Files modified (major):**
- `src/components/Canvas.tsx` — stylePreview + mode state, commit handler, outside-click effect
- `src/components/ObjectNode.tsx` + `.module.css` — reads color/size, capsule shape, scaled CSS vars
- `src/components/DetailPanel.tsx` + `.module.css` — drag-follow fix, scale-aware nodeRect, header color match, off-white opacity rules
- `src/components/SettingsFrame.tsx` + `.module.css` — default color swatch rows
- `src/styles/global.css` — edge color bump + autofill fix
- `src/pages/Home.tsx`, `Home.module.css`, `InviteLanding.tsx`, `InviteLanding.module.css` — demo styling
- `index.html` — favicon link

**Closing polish pass (after the first /handoff this session):**
- Swapped in Matt's freshly-exported marketing thumbnails (`src/assets/thumb-landscape.svg`, `thumb-details.svg`) showing the new pill palette.
- Shrank `.heroIcon` from 80px → 56px (~30% smaller) on Home page.
- New tagline: "Map your professional world" → **"Map your interpersonal landscape."** Updated headline on Home + explainer copy on both Home and InviteLanding (InviteLanding dropped "understand and" to match new phrasing → "harness the relationships in your world").
- Retired the motto logo entirely. Swapped `logo-name-motto` → `logo-name` in the last two usages in `InviteJoin.tsx`. The "Map your professional world" phrase no longer appears anywhere in the app.
- Confirmed invite flow has a baked-in demo mode — navigate to `/invite/demo` (landing) or `/invite/demo/join` (post-verify) to preview without a real invitation. The `token === 'demo'` short-circuits the API call and renders mock data.

### Open Items / Next Steps
1. **Configure invite email webhook** (still pending from last session) — Supabase Dashboard → Webhooks → `maps_invitations` INSERT → `send-invite-email` Edge Function
2. **AWS SES production access** — still pending approval
3. **Stripe integration** — wire up Checkout + subscription webhook
4. **Polling → Realtime** — swap to Supabase Broadcast on cloud
5. **Scale-aware UI cleanup** — remaining pill-anchored spots (PlacementOverlay, ConnectionRoleForm, MultiSelectPanel) still hardcoded to 180×60
6. **DetailPanel → Frame migration** — back burner
7. **Light mode polish** — back burner
