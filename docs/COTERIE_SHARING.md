# Coterie Sharing Model

Full specification for the coterie sharing system. Core concepts are in the main `CLAUDE.md`.

## Coterie Creation & Map Sharing (decided 2026-03-25)

A **coterie** is a named trust circle — Hollywood "tracking group" model. Coteries require maps (no empty containers). Two creation paths:

1. **From map detail card** (primary): Share icon → coterie name pre-filled as "[Map Name] Coterie" (editable) → email invites. Born from a concrete sharing action.
2. **From CoteriesFrame**: Create Coterie → name + pick maps + email invites.

**The aggregated recipient map**: Regardless of how many maps the sender links to a coterie, the recipient gets **ONE map** named after the coterie. `maps.source_coterie_id` links it to the coterie. This solves:
- Sender sees their original N maps linked; recipient sees one clean package
- No organizational style imposition (Mr. Micro's 17 maps → 1 map for recipient)
- Uniform experience for both new and existing user invitations

**Sender view**: Maps A, B, C linked via `coteries_maps`. **Recipient view**: Map Z with `source_coterie_id = coterie_M`, populated with the union of all objects from A + B + C.

**Invitation flow**:
- **Existing user**: Email + in-app notification → CoteriesFrame shows pending invite → Accept → objects placed on Landscape (relative to owner's layout, centroid-anchored)
- **New user** (viral path): Email → landing page with interactive demo Landscape → signup (credit-card-free trial) → auto-placed objects → minimal welcome modal establishing autonomy ("This is your Landscape. Your changes are yours.")

**New objects after initial share**: When sender adds objects to linked maps, they surface as dissonances to recipients (diff-based, not events). Recipient accepts → added to Landscape + their aggregated map Z.

**`source_coterie_id` column jobs**: initial map creation, dissonance acceptance (knows which map to add to), UI treatment (coterie badge in MapsFrame), leaving a coterie (null out → becomes regular map), duplicate prevention.

Once objects overlap between coterie members (through shared maps), the two sharing channels activate.

## Channel 1: Coterie Intel (passive)

Notes, tags, and factual data on shared objects are always visible to coterie members, attributed to the author. Read-only. No action needed — it just appears alongside your own data.

**Implementation:** Pure query pattern, no extra tables. When viewing an object in DetailPanel, query coterie members' `objects_overrides` for that `object_id`. Return their `shared_notes` and `data.contacts`, attributed via `profiles.display_name`. The `private_notes` column is **never selected** in coterie queries. Tags are Channel 2 (type_change dissonance), not Channel 1.

**Contact adopt:** Coterie intel contacts have a `+` button (hover-reveal). Clicking copies the contact to the user's `data.contacts` and stores a fingerprint in `data.adopted_intel` (format: `"userId:type:value"`). Adopted contacts are filtered out of the intel display. This avoids unreliable automatic deduplication (phone formats, address variations, personal labels).

## Channel 2: Coterie Updates (diff-based)

Structural changes — new objects, new/changed connections, deactivated connections, career moves, type changes — surface as dissonances between coterie members' data. Detected via **diff queries** (comparing overrides across coterie members on shared objects), not stored events.

**Why diff-based:** Self-correcting. If Matt says Joe left Netflix, then realizes he was wrong and re-activates the connection, the dissonance evaporates automatically. No stale events to reconcile.

**Two states per dissonance:**
- **Unreviewed**: diff finds a dissonance, no `coteries_reviews` row exists
- **Dismissed**: diff finds a dissonance, `coteries_reviews` row exists (subtle indicator persists — dissonance is always visible, never hidden)

Accepted dissonances don't need a review row — the data change IS the record. Once the user's data matches, the diff query finds nothing and the dissonance evaporates.

**Five dissonance types:**
- **new_object**: member has an object (on shared maps) that I don't have on my Landscape
- **new_connection**: member created a connection between objects I both have
- **deactivated_connection**: member deactivated a canonical connection I still see
- **career_move**: member's effective name/title/status differs from mine
- **type_change**: member's effective types differ from mine (compares sorted type arrays)

**What "accept" does for each change type:**
- **New object**: Create an `objects_overrides` row pointing to the same `objects.id`, place on Landscape, add to aggregated map
- **New connection**: Create a `connections_overrides` row with the same source/target/roles
- **Deactivated connection**: Create a `connections_overrides` row marking it inactive in your view
- **Career move**: Update `objects_overrides` with member's effective name/title/status (only differing fields)
- **Type change**: Replace `objects_types_overrides` with member's type set

**The `coteries_reviews` table** tracks dismissals only (may be removed if dismissals prove rare in practice):
```
coteries_reviews        -- dismissal record for coterie dissonances
  user_id              -- who dismissed (Billy)
  source_user_id       -- whose change (Matt)
  ref_type             -- 'object_override' or 'connection_override'
  ref_id               -- the specific override row
  dismissed_at
```

## Dissonance View

A dedicated view showing all places where your data differs from your coterie's — like `git diff` against your coterie. Includes both unreviewed and dismissed items. "Sync All" option for users who fully trust their coterie.

## Data Privacy Tiers on Overrides

- `shared_notes` — visible to coterie, attributed
- `private_notes` — never leaves your data, excluded from coterie queries
- `tags` — visible to coterie
- All other override fields (title, status, phone, etc.) — coterie-visible as factual data

## Duplicate Objects Across Coterie Members

When two coterie members independently create the same real-world entity, the dissonance view surfaces both. Resolution paths:
- **UX hint**: Fuzzy-match when surfacing dissonances ("Is this the same as your X?")
- **Operator dedup**: Platform operators identify duplicate `objects` rows and merge — pick the winner, UPDATE all references, soft-delete the loser
- **No schema changes needed** — merge is just UPDATE statements on `object_id` / `source_id` / `target_id` / `object_ref_id`

## Maps Installation Flow

Same mechanic for store packages AND coterie-shared maps ("accept and place"):
1. Compute relative coords: from `maps_objects` (packages) or from owner's Landscape positions (user maps)
2. User picks an anchor point on their Landscape
3. For each object: already on their Landscape → **skip** (their overrides win); new → create `objects_overrides` with `map_x = anchor.x + relative_x`
4. A user map is auto-created in their collection (linked via `source_map_id`)
5. The installed map becomes a named filter they can activate

**Relative coordinates**: Store packages store relative positions in `maps_objects.relative_x/y`. User maps derive them on the fly from the owner's current Landscape (subtract centroid) — recipients always get the owner's **current** layout, not a stale snapshot.
