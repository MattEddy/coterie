# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-02-08 (session 6b — continuation)
**Branch:** main

### Narrative

Short continuation session after session 6 ran out of context mid-handoff. Completed the handoff, then pivoted to research and meta discussion.

**Handoff completion.** The panel positioning code (proportional anchor algorithm, nodeRect-based selection, CSS transition removal) had been implemented in session 6 but never committed separately from the edit mode work. Committed it as its own commit (`476dff3`), then committed the CLAUDE.md session narrative update, pushed both.

**Contacts sync research.** Matt asked about options for syncing Coterie to device contacts. Explored the landscape:
- **Google People API**: OAuth, full read/write, sync tokens for efficient delta pulls, webhooks for push notifications. Free, no per-request charges.
- **Microsoft Graph API**: Similar capabilities via delta queries. Free for standard contact operations.
- **Apple/iCloud**: No public web API. Would require native shell (Capacitor) for Contacts framework access.
- **Contact Picker API**: Chrome-on-Android only. Dead end.
- **vCard import**: Universal fallback, zero OAuth.

**Product decision**: The killer feature would be *linking* a person object to a Google/Microsoft contact for one-way sync (contacts -> overrides). Fits the override architecture perfectly — contact data is inherently per-user. Matt wants a sync button + linked badge in the detail card header for person objects. Both import (contacts -> Coterie) and export (Coterie -> contacts) are on the roadmap, with live sync being the aspirational goal. Added to Planned items.

**Memory file discovery.** Matt learned about Claude Code's `~/.claude/projects/` directory — memory files, full session transcripts (.jsonl), session indexes. Decided to back up the entire `~/.claude/` directory to Google Drive. Tip shared: `Cmd+Shift+.` to show hidden folders in Mac file dialogs.

### Files Modified
- `src/components/Canvas.tsx` — Committed previously uncommitted panel positioning refactor (nodeRect, removed centerOnNode/avoidPanelOverlap)
- `src/components/DetailPanel.tsx` — Committed previously uncommitted smart positioning (proportional anchor, useLayoutEffect)
- `src/components/DetailPanel.module.css` — Committed previously uncommitted CSS transition removal
- `CLAUDE.md` — Session 6 narrative (earlier in this session), then this session 6b update. Added contacts sync to Planned items.

### Open Items / Next Steps
1. **Search -> zoom** — the core UX loop, highest-impact next feature
2. **Create new objects** — edit card infrastructure is ready to double as create card
3. **UI polish** — detail panel styling, type tag editing UX refinements
4. **RLS policies** — before multi-user
5. **Commit reminder** — nudge Matt after each meaningful chunk
