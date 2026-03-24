# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-23
**Branch:** main

### Narrative

Extended session focused on color refinement and light mode implementation. This session was a continuation of the previous session's color work, iterating on the palette and then building a full theming system.

**Color tuning — card visibility.** Cards were blending into the background. Iteratively bumped org-dim and person-dim backgrounds up three notches (from `#221a1e`/`#241e14` to `#382830`/`#203038`). Brightened class-specific node borders and type label colors to match.

**Person amber → teal.** Matt noticed the person amber (`#b89060`) was too close to the gold accent (`#d4b468`). Swapped to teal (`#4a9ab0`) from color scheme sample 13 (Violet + Teal). This gives cool/warm contrast between person (teal) and org (rose) nodes, with gold as the warm accent bridging them.

**Cool-tinted panel surfaces.** Panel surface colors were pure neutral gray (`#1a1a1a`). Tried slight cool tint (`#191a1c`) — "muddy." Went more (`#181a1e`) — Matt liked it. Gives panels visual separation from the warm-tinted canvas background.

**Brighter borders.** Global border color bumped from `#2a2626` to `#333538` with slight cool tint to match panel surfaces.

**Brighter accent gold.** `--color-accent` bumped from `#bfa058` to `#d4b468` for better visibility on frame headers and the Coterie wordmark.

**Light mode implementation.** Matt asked for Light/Dark/Auto theme toggle. Built the full system:
- **CSS architecture**: `data-theme` attribute on `<html>`, dark as default `:root`, light overrides in `[data-theme="light"]`
- **ThemeContext** (`src/contexts/ThemeContext.tsx`): manages preference, localStorage persistence (`"coterie-theme"` key), system preference listener for Auto mode
- **Flash prevention**: inline `<script>` in `index.html` reads localStorage and sets `data-theme` before React mounts
- **All hardcoded colors extracted to CSS variables**: org/person borders, type colors, edge strokes, background dots, placeholders, danger colors, `color-scheme` on date inputs — everything now theme-aware
- **SettingsFrame**: Light/Dark/Auto segmented control (replaces stub), copyright info at bottom
- **Light palette**: warm off-white background (`#f5f3f0`), white panels, deeper gold/rose/teal for contrast on light backgrounds

**Hardcoded color sweep**: extracted `#dc2626` danger colors from DetailPanel, ConnectionRoleForm, AccountFrame, and Login to `var(--color-danger)`. Extracted `#5a5252` placeholder colors to `var(--color-placeholder)`. Extracted edge colors, dot colors, node borders, and type colors to new CSS variables.

### Files Modified
- `src/styles/global.css` — Full rewrite: added new CSS variables (org-border, person-border, org-type, person-type, edge, edge-highlight, dots, placeholder, danger, color-scheme), added complete `[data-theme="light"]` block, updated surface colors (cool-tinted), border color, accent gold, person color (amber→teal), card dim backgrounds
- `src/contexts/ThemeContext.tsx` — New: ThemeProvider with localStorage, system preference listener, DOM attribute sync
- `src/main.tsx` — Wrapped App in ThemeProvider
- `index.html` — Added flash-prevention script, Inter font import
- `src/components/SettingsFrame.tsx` — Rebuilt: Light/Dark/Auto segmented control + copyright
- `src/components/SettingsFrame.module.css` — New: segmented control styles, section layout
- `src/components/ObjectNode.module.css` — Borders and type colors use CSS variables
- `src/components/Canvas.tsx` — Edge strokes and background dots use CSS variables
- `src/components/RoleEdge.tsx` — Label fills use CSS variable
- `src/components/DetailPanel.module.css` — Placeholder colors, danger colors, color-scheme use CSS variables
- `src/components/ConnectionRoleForm.module.css` — Danger colors use CSS variable
- `src/components/AccountFrame.module.css` — Danger color uses CSS variable
- `src/pages/Login.module.css` — Error color uses CSS variable

### Open Items / Next Steps
1. **Light mode polish** — may need tuning after real-world use (contrast, readability)
2. **Maps frame** — list user maps, create/edit, browse store packages
3. **Coteries frame** — list coteries, create/invite, share maps
4. **DetailPanel → Frame migration** — make detail panels draggable
5. **RLS policies** — deferred until features are complete, before deploy
