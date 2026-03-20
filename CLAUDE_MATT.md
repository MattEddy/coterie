# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-19
**Branch:** main

### Narrative

Major session covering three big areas: Company → Org rename, the Frame/NavBar/Menu system (with search-to-zoom), and the color scheme redesign.

**Company → Org rename.** Matt explored alternatives to "company" (too narrow for unions, agencies, departments) — considered "organization" (too much of a mouthful), "group" (too generic), "outfit" (too colloquial). Landed on **"Org"** — short, universal, no baggage. Renamed across 9 files: schema class ID `'company'` → `'org'`, all 10 org types, seed data, CSS variables (`--color-company` → `--color-org`), all components. Type display names like "Production Company" and "Parent Company" stay as-is (they describe what kind of org, not the class). Database reset clean.

**CreateObjectForm polish.** Added "Create a new:" heading at top + × cancel button. Org placeholder simplified to just "Name" (not "Org Name").

**Frame system + NavBar + Menu — the navigation skeleton.** Matt pitched a UI concept: fixed nav bar in top-right (Account icon, Menu hamburger, Coterie logo), with each menu item opening a draggable Frame. Discussion refined it:
- Copyright removed from nav (noise → moved to Settings > About)
- Menu is a popover, not a frame (it's a launcher, not a destination)
- Shared Frame component for all panels (drag, close, z-index)
- Nav bar stays fixed, not moveable

Built: `Frame.tsx` (shared draggable, z-index-on-click), `NavBar.tsx` (fixed top-right with popover menu), `SearchFrame.tsx` (working search → zoom), `AccountFrame.tsx` (email + sign out), stubs for Maps/Coteries/Settings. Canvas exposes `zoomToNode(nodeId)` via `forwardRef`. Old top bar removed, canvas fills full viewport, React Flow Controls removed.

**Chrome positioning nightmare.** `position: fixed` elements slid off the right edge of the viewport in Chrome, proportional to window width. Safari worked fine. All dimension reports (offsetWidth, innerWidth, etc.) were correct. Tried: portals to body, absolute positioning, JS-computed left from window.innerWidth, viewport units — nothing worked. Researched: likely caused by Dark Reader extension injecting `filter` on html/body (creates containing block for fixed elements). Actual fix: **hard reload** (Shift+Cmd+R) — Vite's HMR wasn't fully flushing structural CSS changes from all the layout experiments. Added `darkreader-lock` meta tag but confirmed it wasn't needed (removed). Lesson: always hard reload after major layout CSS changes.

**Search frame polish.** Arrow keys navigate results list, Enter selects highlighted result, mouse hover syncs with keyboard highlight. Escape clears search input, second Escape closes frame.

**Event date "today" button.** CalendarCheck icon positioned inside the date input, just left of the native calendar picker. Both icons styled in accent blue. UTC bug: `new Date().toISOString().split('T')[0]` returns UTC date — after 5pm Pacific, it's tomorrow. Fixed with local `getFullYear/getMonth/getDate`.

**Color scheme redesign.** Built `color-schemes.html` with mockup panels showing different palettes in context. Three rounds of iteration:
1. Six gold-focused schemes (Gold & Charcoal, Gold & Midnight, Burnished Gold, Gold & Slate, Gold & Espresso, Gold & Obsidian)
2. Eight schemes adding purple/mauve (Gold Accent + Mauve Orgs, Warm Gold + Plum, Pale Gold + Lavender, Amber & Amethyst, Honey & Smoke, Antique Gold & Dusty Rose, Electric Gold & Violet, Champagne & Charcoal)
3. Variants of favorites: #6 with steel blue / warm amber people, #7 with teal blue / copper people, then #11 (Violet + Teal) with different golds

Matt kept returning to **#10 (Dusty Rose + Warm Amber)** — antique gold accent, dusty rose orgs, warm amber people, warm charcoal base. Implemented it. Tweaked surface colors from warm-tinted `#1a1818` to pure neutral `#1a1a1a` (warm brown was too close to amber person nodes). Node type labels colored by class (rose for orgs, amber for people). Class-specific node borders.

**Two-font system.** Tried Inter as secondary font for all body text — "looks worse." Rolled back. Then tried Inter for JUST type labels on object cards — worked well. Extended to DetailPanel data fields (title, types, contact values, notes, item names/dates, inputs) at 2px smaller. Urbanist stays for everything else (headings, names, labels, buttons).

### Files Modified
- `supabase/migrations/20260203000000_pro_schema.sql` — `'company'` → `'org'` class ID and type references
- `supabase/seed.sql` — `'company'` → `'org'` class values
- `src/styles/global.css` — Full color scheme redesign (scheme 10), `--font-sans` stays Urbanist
- `src/components/Canvas.tsx` — `forwardRef` + `useImperativeHandle` for `zoomToNode`, edge colors warmed, Controls removed, Panel import removed, background dots color adjusted
- `src/components/ObjectNode.tsx` — `company` → `org` in classStyles
- `src/components/ObjectNode.module.css` — `.company` → `.org`, class-specific borders, Inter font for types at 9px, type labels colored by class
- `src/components/CreateObjectForm.tsx` — `'company'` → `'org'`, "Create a new:" heading, cancel button
- `src/components/CreateObjectForm.module.css` — `.companyActive` → `.orgActive`, header/cancel styles
- `src/components/DetailPanel.tsx` — `company` → `org` in placeholders/queries, CalendarCheck today button, UTC date fix
- `src/components/DetailPanel.module.css` — Inter font + 2px smaller for data fields, today button styles, placeholder colors warmed
- `src/components/MultiSelectPanel.tsx` — `company` → `org`
- `src/components/RoleEdge.tsx` — Edge label fill color warmed
- `src/components/Frame.tsx` — New: shared draggable frame component
- `src/components/Frame.module.css` — New: frame styles, gold title
- `src/components/NavBar.tsx` — New: fixed nav bar with menu popover
- `src/components/NavBar.module.css` — New: nav bar styles, gold logo
- `src/components/SearchFrame.tsx` — New: search with keyboard nav, zoom-to-node
- `src/components/SearchFrame.module.css` — New: search input, results, class dots
- `src/components/AccountFrame.tsx` — New: account details + sign out
- `src/components/AccountFrame.module.css` — New: account frame styles
- `src/components/MapsFrame.tsx` — New: stub
- `src/components/CoteriesFrame.tsx` — New: stub
- `src/components/SettingsFrame.tsx` — New: stub with © info
- `src/pages/Landscape.tsx` — Overhauled: removed top bar, added NavBar + frame management
- `src/pages/Landscape.module.css` — Simplified to just height: 100%
- `src/pages/Login.module.css` — Urbanist for title (was briefly changed, reverted)
- `index.html` — Added Inter font import
- `color-schemes.html` — New: color scheme mockup explorer (16 schemes, not committed)

### Open Items / Next Steps
1. **Maps frame** — list user maps, create/edit, browse store packages
2. **Coteries frame** — list coteries, create/invite, share maps
3. **Settings frame** — real settings content
4. **DetailPanel → Frame migration** — make detail panels draggable (detach from node on drag)
5. **RLS policies** — deferred until features are complete, before deploy
