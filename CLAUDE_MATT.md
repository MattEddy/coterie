# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-04-14
**Branch:** main

### Narrative

**Collapsing coteries into maps.** Pure design session — no code changes. Matt opened with "I had a crazy thought" and proposed eliminating the coterie abstraction entirely. His reasoning: now that maps and coteries have a 1:1 relationship (from last session's migration), the coterie is just an extra indirection layer. Why not share maps directly?

We validated the idea by mapping every coterie concept to its map equivalent:
- Named trust circle → map already has a name
- Members list → "shared with" list on the map
- Invitations, shares, dissonances → all re-scopeable to map instead of coterie
- No functional daylight between the two abstractions

**Brand benefit:** Matt noted the double "coterie" meaning (app name + feature name) was always awkward for marketing copy. Collapsing makes "Coterie" purely the brand — *you're* in a coterie when you use Coterie, you don't create coteries inside Coterie.

**The connective tissue question.** Matt identified the key design challenge: coteries used to be the hub connecting multiple users' map copies into one share group. Without coteries, how do the copies relate? We explored options and landed on:

**Origin map model with self-referential ID:**
- `maps.origin_map_id` — self-ref for the origin (points to own ID), points to origin for copies, NULL for unshared
- User A shares Map X → B gets Map Y (`origin_map_id = X`), C gets Map Z (`origin_map_id = X`). A's map: `origin_map_id = X` (self-ref)
- Membership derived from single query: `WHERE origin_map_id = :origin` — covers everyone including owner. No `maps_members` table needed.
- Matt specifically asked whether NULL or self-ref was better for the owner. Self-ref wins because every query becomes a single `WHERE origin_map_id = :origin` instead of `WHERE id = :origin OR origin_map_id = :origin`. NULL means "not shared," self-ref means "I'm the origin." Clean semantic split.
- No role types needed — origin map owner = admin, everyone else = member.

**Tables to drop:** `coteries`, `coteries_members`, `coteries_invitations`, `coteries_shares`
**Tables to add/rename:** `maps_invitations`, `maps_shares`; `origin_map_id` column on `maps` replaces `source_coterie_id`
**UI:** CoteriesFrame goes away. MapsFrame grows a sharing section.

**Functionality explicitly preserved (Matt's emphasis):** recipients get a *copy* not a link, they see the share list (active + pending), their changes become dissonances/intel for others and vice versa. Everything works exactly as before, just without the coterie middleman.

### Open Items / Next Steps
1. **Implement coterie→map collapse** — schema migration, RPC rewrites, RLS helper updates, frontend (drop CoteriesFrame, enhance MapsFrame with sharing)
2. **Stripe integration** — wire up Checkout, webhooks to update subscription status
3. **Polling → Realtime** — NotificationBoxes and CoterieUpdatesFrame poll at 30s
4. **DetailPanel → Frame migration** — back burner
5. **Light mode polish** — back burner
