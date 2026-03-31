# CLAUDE_MATT.md

Matt's working document for Claude Code sessions on Coterie. This is where session handoffs and Matt-specific context live. The main `CLAUDE.md` has shared project architecture that any collaborator (and Claude) should know.

---

## Recent Session
**Date:** 2026-03-30
**Branch:** main

### Narrative

Strategy session — no code changes. Explored encryption options for contact data, landed on a tier structure with encryption details committed to CLAUDE.md.

**Encryption brainstorm.** Matt asked what encryption options Coterie could offer for contact privacy. Walked through the full spectrum: pgcrypto column encryption, server-side envelope encryption, client-side E2EE with user-held keys, and coterie-scoped group keys. Discussed tradeoffs — E2EE breaks server-side search, complicates the contact adopt flow, and introduces key recovery as a UX problem.

**Industry benchmarks.** Compared Google Contacts, Apple iCloud Contacts, Outlook, and Salesforce — all use AES-256 at rest + TLS in transit, none offer E2EE. Even Apple's Advanced Data Protection explicitly excludes Contacts. Matt asked about Proton — Proton Contacts does E2EE on phone/address/notes but leaves name and email unencrypted (needed for mail routing).

**Key insight: Coterie can exceed Proton.** Since canon objects never store contact info (CHECK constraint), and contact data only lives in `objects_overrides.data.contacts`, Coterie can E2EE ALL personal reachability (including email) while leaving identity fields plaintext. Proton can't do this because they need email addresses to route mail.

**Tier structure crystallized:**
- **Pro** (current work): standard encryption (AES-256 at rest via Supabase/AWS, TLS, RLS). Matches industry standard.
- **Secure** (paid add-on): E2EE on `data.contacts` only. Per-user keypair + coterie group keys for shared contacts. Exceeds Proton.
- **Studio**: Pro + AI intelligence features.
- **Free** (later, marketing funnel): standalone local app (Tauri + React + SQLite), no auth/server. PowerSync for Pro<->local sync.

**Build order confirmed:** Pro first (freight train), Secure next (natural extension), Free later (marketing tool). The Free tier's local-first architecture gets easier the longer it waits.

### Files Modified
- `CLAUDE.md` — updated Tech Stack with 4-tier roadmap + encryption details; reorganized Planned into "Planned (Pro)" and "Future Tiers"

### Open Items / Next Steps
1. **"Accept and place" UX** — click canvas to position accepted objects instead of auto-placing at member's coordinates
2. **Non-user invitation flow** — email sending, landing page with interactive demo, signup/payment. Needs deployment infrastructure.
3. **Swap polling for Broadcast/Realtime** — when deploying to Supabase Cloud where the Realtime pipeline works properly
4. **DetailPanel -> Frame migration** — make detail panels draggable
5. **Light mode polish** — may need tuning
6. **RLS policies** — real policies before deploy (permissive placeholders currently on 3 tables)
7. **Delete AccountFrame files** — now unused after account menu migration, left in place for cleanup
