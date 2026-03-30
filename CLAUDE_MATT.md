# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-28/29
**Branch:** main

### Narrative

UI polish session focused on discoverability: tooltips, tab labels, account menu, and hotkeys.

**Tooltip system.** Matt asked about adding hover tooltips to buttons and panel headers. Discussed 4 options (native title, CSS-only, React component, Radix library). Chose Option C (custom React component) because it gives full control over delay, disabling, long descriptions, and positioning. Built `Tooltip.tsx` — portal-rendered, smart above/below positioning based on viewport space, configurable `delay` (default 400ms), `disabled` prop, `text` prop (empty = passthrough), small directional arrow, 100ms fade-in. Dismisses on scroll and mousedown.

Added tooltips to every icon button across all components: NavBar, Frame (close button + `titleTooltip` prop for frame headings at 600ms delay), DetailPanel (header actions, types edit, tab bar, contact/notes/projects/events section buttons, today buttons, intel adopt), MapsFrame (select mode with dynamic text, isolate, open, share, edit, delete, remove from map), CoteriesFrame (delete, updates badge, open). Used 3 background agents for the big files (DetailPanel, MapsFrame, CoteriesFrame) while directly editing the smaller files.

**Tab bar fix.** The Tooltip's `<span style="display: inline-flex">` wrapper broke the tab bar layout — buttons became narrow instead of spreading evenly. The `.tabButton` had `flex: 1` but the Tooltip span (now the flex child of `.tabBar`) didn't inherit it. Fixed with `.tabBar > * { flex: 1; }` in CSS.

**Tab labels replace section headings.** Matt suggested moving section headings (Contact Info, Notes, Projects, Events) into the tab buttons themselves — visible only on the active tab. Each tab button now renders icon + label in a `flex-direction: column` layout. Label uses `visibility: hidden` on inactive tabs (preserves height stability). Removed the `<h3>` headings from inside each tab content section. Edit buttons right-aligned via `justify-content: flex-end` on `.tabSectionHeader`. Tooltips disabled on active tab (label is already visible). Cleaned up unused `heading` field from tab data.

**Account menu.** Matt felt the Account button opening a draggable Frame was inconsistent — "the Menu button next to it opens a menu, but this opens a panel." Converted to a dropdown popover matching the hamburger menu pattern. NavBar now handles account state internally with `useAuth()` — email display + sign out button. Opening one menu closes the other. Removed AccountFrame rendering from Landscape.tsx. Removed 'account' from FrameType. AccountFrame files left in place but unused.

**Hotkeys.** Matt asked "how can hotkeys work in our app?" Explained the canvas-app pattern: single-key hotkeys suppressed when focus is in an input. Wired up in a `useEffect` in Landscape.tsx: N (new object — triggers `canvasRef.current.triggerCreate()`), S (search), M (maps), C (coteries), , (settings). All toggle behavior (press again to close). Added `triggerCreate()` to CanvasRef — opens the create form at viewport center. Modifier keys (Cmd/Ctrl/Alt) bypass the handler.

### Files Modified
- `src/components/Tooltip.tsx` — NEW: custom tooltip component
- `src/components/Tooltip.module.css` — NEW: tooltip styles with arrow + fade-in
- `src/components/Frame.tsx` — `titleTooltip` prop, Tooltip on close button
- `src/components/NavBar.tsx` — account dropdown menu (replaced onOpenFrame('account')), useAuth, LogOut icon, both menus dismiss each other, Tooltip disabled when menu open
- `src/components/NavBar.module.css` — `.accountEmail`, `.menuDivider` styles
- `src/components/DetailPanel.tsx` — Tooltip on all icon buttons + tabs, tab labels (icon + label column layout), removed section headings, cleaned up `heading` field
- `src/components/DetailPanel.module.css` — `.tabLabel`, `.tabActive .tabLabel`, `.tabBar > *` flex fix, `.tabButton` column layout (44px height), `.tabSectionHeader` justify-content: flex-end, removed `.tabHeading` rules
- `src/components/MapsFrame.tsx` — Tooltip on all actions + `titleTooltip` on Frame
- `src/components/CoteriesFrame.tsx` — Tooltip on all actions + `titleTooltip` on Frame
- `src/components/CoterieUpdatesFrame.tsx` — `titleTooltip` on Frame
- `src/components/SearchFrame.tsx` — `titleTooltip` on Frame
- `src/components/SettingsFrame.tsx` — `titleTooltip` on Frame
- `src/components/AccountFrame.tsx` — `titleTooltip` on Frame (now unused)
- `src/components/Canvas.tsx` — `triggerCreate()` added to CanvasRef
- `src/pages/Landscape.tsx` — hotkey handler, `toggleFrame` helper, removed AccountFrame import/rendering

### CLAUDE.md Audit (2026-03-30)

Short session — audited the project CLAUDE.md (784 lines) and slimmed it to 202 lines (74% reduction). Offloaded reference material into three side docs:

- `docs/COTERIE_SHARING.md` (100 lines) — full coterie sharing spec (accept behavior per type, reviews table, privacy tiers, dedup, installation flow)
- `docs/UI_REFERENCE.md` (172 lines) — MapsFrame architecture, workspace persistence, color scheme tables, schema overview, project structure, platform strategy, market position
- `docs/IMPLEMENTATION_STATUS.md` (166 lines) — complete build history checklist

Main CLAUDE.md retains: architecture, data model concepts, key design decisions, guiding tenet, all known gotchas, UI frame system, theming/typography, dev setup, and status/roadmap. Side docs are referenced inline so Claude knows where to look for detail.

### Open Items / Next Steps
1. **"Accept and place" UX** — click canvas to position accepted objects instead of auto-placing at member's coordinates
2. **Non-user invitation flow** — email sending, landing page with interactive demo, signup/payment. Needs deployment infrastructure.
3. **Swap polling for Broadcast/Realtime** — when deploying to Supabase Cloud where the Realtime pipeline works properly
4. **DetailPanel → Frame migration** — make detail panels draggable
5. **Light mode polish** — may need tuning
6. **RLS policies** — real policies before deploy (permissive placeholders currently on 3 tables)
7. **Delete AccountFrame files** — now unused after account menu migration, left in place for cleanup
