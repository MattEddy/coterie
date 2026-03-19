-- Migration: Pro-tier schema
-- Entity registry + user override architecture, sector-agnostic, coterie sharing
--
-- Key concepts:
--   - objects = entity registry (is_canon distinguishes vetted from user-created)
--   - connections = canonical connections between objects
--   - objects_overrides/connections_overrides = per-user layer (overrides + user-created)
--   - maps = unified: store packages, user maps, shared maps
--   - coteries = sharing groups with diff-based dissonance detection
--   - coteries_reviews = tracks user responses to dissonances
--   - sectors = scoping for onboarding + map packages

-- =============================================================================
-- CLEAN SLATE
-- =============================================================================

DROP VIEW IF EXISTS user_objects CASCADE;
DROP VIEW IF EXISTS objects_with_types CASCADE;
DROP TABLE IF EXISTS coteries_reviews CASCADE;
DROP TABLE IF EXISTS coteries_maps CASCADE;
DROP TABLE IF EXISTS coteries_members CASCADE;
DROP TABLE IF EXISTS coteries CASCADE;
DROP TABLE IF EXISTS maps_objects CASCADE;
DROP TABLE IF EXISTS maps CASCADE;
DROP TABLE IF EXISTS objects_sectors CASCADE;
DROP TABLE IF EXISTS objects_types_overrides CASCADE;
DROP TABLE IF EXISTS connections_overrides CASCADE;
DROP TABLE IF EXISTS objects_overrides CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS objects_types CASCADE;
DROP TABLE IF EXISTS connections CASCADE;
DROP TABLE IF EXISTS objects CASCADE;
DROP TABLE IF EXISTS connection_types CASCADE;
DROP TABLE IF EXISTS types CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS sectors CASCADE;

-- Legacy cleanup
DROP TABLE IF EXISTS log_entries CASCADE;
DROP TABLE IF EXISTS object_type_assignments CASCADE;
DROP TABLE IF EXISTS object_sectors CASCADE;
DROP TABLE IF EXISTS map_objects CASCADE;
DROP TABLE IF EXISTS relationship_types CASCADE;
DROP TABLE IF EXISTS relationships_overrides CASCADE;
DROP TABLE IF EXISTS relationships CASCADE;
DROP TABLE IF EXISTS object_types CASCADE;
DROP TABLE IF EXISTS object_classes CASCADE;
DROP TABLE IF EXISTS user_maps CASCADE;
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS people CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TYPE IF EXISTS company_type CASCADE;
DROP TYPE IF EXISTS project_type CASCADE;
DROP TYPE IF EXISTS project_status CASCADE;
DROP TYPE IF EXISTS relationship_type CASCADE;

-- =============================================================================
-- SECTORS
-- =============================================================================

CREATE TABLE sectors (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO sectors (id, display_name, icon, color) VALUES
    ('entertainment', 'Entertainment', 'film', '#F59E0B'),
    ('tech', 'Tech', 'cpu', '#3B82F6'),
    ('finance', 'Finance', 'chart.line.uptrend.xyaxis', '#10B981'),
    ('politics', 'Politics', 'building.columns.fill', '#DC2626'),
    ('media', 'Media & Journalism', 'newspaper', '#7C3AED');

-- =============================================================================
-- CLASSES (fixed: company, person, project)
-- =============================================================================

CREATE TABLE classes (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    landscape_visible BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO classes (id, display_name, icon, color, landscape_visible) VALUES
    ('company', 'Company', 'building.2', '#3B82F6', TRUE),
    ('person', 'Person', 'person.fill', '#10B981', TRUE),
    ('project', 'Project', 'film', '#F59E0B', FALSE),
    ('event', 'Event', 'calendar', '#DC2626', FALSE);

-- =============================================================================
-- TYPES (extensible variants within a class)
-- =============================================================================

CREATE TABLE types (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    class TEXT NOT NULL REFERENCES classes(id),
    icon TEXT,
    color TEXT,
    is_canon BOOLEAN DEFAULT FALSE,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company types (canonical)
INSERT INTO types (id, display_name, class, icon, color, is_canon) VALUES
    ('studio', 'Studio', 'company', 'building.2.fill', '#3B82F6', TRUE),
    ('parent_company', 'Parent Company', 'company', 'building.columns', '#1E40AF', TRUE),
    ('network', 'Network', 'company', 'tv', '#7C3AED', TRUE),
    ('streamer', 'Streamer', 'company', 'play.tv', '#DC2626', TRUE),
    ('production_company', 'Production Company', 'company', 'film.stack', '#059669', TRUE),
    ('agency', 'Agency', 'company', 'person.3', '#EA580C', TRUE),
    ('management', 'Management', 'company', 'person.2', '#DB2777', TRUE),
    ('financier', 'Financier', 'company', 'dollarsign.circle', '#CA8A04', TRUE),
    ('distributor', 'Distributor', 'company', 'shippingbox', '#0891B2', TRUE),
    ('guild_union', 'Guild/Union', 'company', 'person.badge.shield.checkmark', '#6B7280', TRUE);

-- Person types (canonical)
INSERT INTO types (id, display_name, class, icon, color, is_canon) VALUES
    ('executive', 'Executive', 'person', 'person.badge.key', '#1E40AF', TRUE),
    ('producer', 'Producer', 'person', 'person.crop.rectangle', '#7C3AED', TRUE),
    ('creative', 'Creative', 'person', 'pencil.and.outline', '#059669', TRUE),
    ('talent', 'Talent', 'person', 'star', '#CA8A04', TRUE),
    ('agent', 'Agent', 'person', 'briefcase', '#EA580C', TRUE),
    ('manager', 'Manager', 'person', 'person.badge.clock', '#DB2777', TRUE),
    ('lawyer', 'Lawyer', 'person', 'text.book.closed', '#6B7280', TRUE),
    ('investor', 'Investor', 'person', 'chart.line.uptrend.xyaxis', '#0891B2', TRUE);

-- Project types (canonical)
INSERT INTO types (id, display_name, class, icon, color, is_canon) VALUES
    ('feature', 'Feature', 'project', 'film', '#F59E0B', TRUE),
    ('tv_series', 'TV Series', 'project', 'tv', '#7C3AED', TRUE),
    ('limited_series', 'Limited Series', 'project', 'tv.inset.filled', '#DC2626', TRUE),
    ('pilot', 'Pilot', 'project', 'play.rectangle', '#059669', TRUE),
    ('documentary', 'Documentary', 'project', 'doc.text.image', '#3B82F6', TRUE),
    ('short', 'Short', 'project', 'film.stack', '#6B7280', TRUE),
    ('unscripted', 'Unscripted', 'project', 'person.wave.2', '#EA580C', TRUE);

-- Event types (canonical)
INSERT INTO types (id, display_name, class, icon, color, is_canon) VALUES
    ('meeting', 'Meeting', 'event', 'person.2', '#DC2626', TRUE),
    ('call', 'Call', 'event', 'phone', '#3B82F6', TRUE),
    ('email_exchange', 'Email Exchange', 'event', 'envelope', '#10B981', TRUE),
    ('pitch', 'Pitch', 'event', 'presentation', '#F59E0B', TRUE),
    ('screening', 'Screening', 'event', 'film', '#7C3AED', TRUE),
    ('premiere', 'Premiere', 'event', 'star', '#EA580C', TRUE),
    ('introduction', 'Introduction', 'event', 'person.badge.plus', '#059669', TRUE),
    ('general', 'General', 'event', 'note.text', '#6B7280', TRUE);

-- =============================================================================
-- OBJECTS (entity registry — all entities, vetted and user-created)
-- =============================================================================
-- Every object gets a row here from the moment it's created.
-- is_canon = true for vetted/maintained entities, false for user-created.
-- created_by tracks who created it (NULL = platform-seeded).
-- No Landscape coordinates here — position is per-user (lives in overrides).

CREATE TABLE objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class TEXT NOT NULL REFERENCES classes(id),
    name TEXT,                           -- NULL for user-created objects (data lives in overrides)
    title TEXT,                          -- subtitle/description: job title, company tagline, logline
    status TEXT,                         -- lifecycle: active, development, released, defunct, etc.
    photo_url TEXT,                      -- headshot / logo / poster
    event_date DATE,                    -- when the event occurred (events only)
    data JSONB DEFAULT '{}',            -- contacts array, plus any class-specific metadata
    is_canon BOOLEAN DEFAULT FALSE,     -- vetted/maintained by platform operators
    created_by UUID,                    -- NULL = platform-seeded; FK to profiles added after profiles table exists
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- GUIDING TENET: Person private reachability is NEVER canonical.
    -- Coterie shares who someone is, not how to reach them.
    -- Phone, email, address contacts live in objects_overrides only.
    -- Public URLs (website, YouTube, etc.) are allowed canonically.
    CONSTRAINT person_no_canonical_private_contacts CHECK (
        class != 'person' OR NOT jsonb_path_exists(
            data,
            '$.contacts[*] ? (@.type == "phone" || @.type == "email" || @.type == "address")'
        )
    )
);

CREATE INDEX idx_objects_class ON objects(class);
CREATE INDEX idx_objects_name ON objects(name);
CREATE INDEX idx_objects_data ON objects USING GIN(data);
CREATE INDEX idx_objects_active ON objects(is_active);
CREATE INDEX idx_objects_canon ON objects(is_canon);
CREATE INDEX idx_objects_created_by ON objects(created_by);

-- =============================================================================
-- OBJECTS_SECTORS (many-to-many: objects can span sectors)
-- =============================================================================

CREATE TABLE objects_sectors (
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    sector_id TEXT NOT NULL REFERENCES sectors(id),
    PRIMARY KEY (object_id, sector_id)
);

CREATE INDEX idx_objects_sectors_sector ON objects_sectors(sector_id);

-- =============================================================================
-- OBJECTS_TYPES (many-to-many: objects can have multiple types)
-- =============================================================================

CREATE TABLE objects_types (
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    type_id TEXT NOT NULL REFERENCES types(id),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (object_id, type_id)
);

CREATE INDEX idx_objects_types_type ON objects_types(type_id);

-- Ensure type matches object's class
CREATE OR REPLACE FUNCTION check_type_class_match()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM types t
        JOIN objects o ON o.id = NEW.object_id
        WHERE t.id = NEW.type_id AND t.class = o.class
    ) THEN
        RAISE EXCEPTION 'Type % does not match object class', NEW.type_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_type_class_match_trigger
    BEFORE INSERT OR UPDATE ON objects_types
    FOR EACH ROW EXECUTE FUNCTION check_type_class_match();

-- =============================================================================
-- CONNECTION TYPES (kinds of connections between objects)
-- =============================================================================

CREATE TABLE connection_types (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    valid_source_classes TEXT[],
    valid_target_classes TEXT[],
    icon TEXT,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO connection_types (id, display_name, valid_source_classes, valid_target_classes, icon) VALUES
    ('owns', 'Owns', '{company}', '{company}', 'arrow.down.circle'),
    ('division_of', 'Division Of', '{company}', '{company}', 'square.grid.2x2'),
    ('employed_by', 'Employed By', '{person}', '{company}', 'briefcase'),
    ('reports_to', 'Reports To', '{person}', '{person}', 'arrow.up.circle'),
    ('has_deal_at', 'Has Deal At', '{company}', '{company}', 'doc.text'),
    ('represents', 'Represents', '{company}', '{person}', 'person.badge.shield.checkmark'),
    ('represented_by', 'Represented By', '{person}', '{company}', 'person.badge.shield.checkmark'),
    ('set_up_at', 'Set Up At', '{project}', '{company}', 'building.2'),
    ('attached_to', 'Attached To', '{person}', '{project}', 'paperclip'),
    ('produces', 'Produces', '{company}', '{project}', 'film'),
    ('related_to', 'Related To', NULL, NULL, 'link'),
    ('participated_in', 'Participated In', '{person}', '{event}', 'person.badge.clock'),
    ('regarding', 'Regarding', '{event}', '{project}', 'doc.text'),
    ('held_at', 'Held At', '{event}', '{company}', 'building.2');

-- =============================================================================
-- CONNECTIONS (canonical connections — the shared truth)
-- =============================================================================

CREATE TABLE connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    type TEXT NOT NULL REFERENCES connection_types(id),
    data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, target_id, type)
);

CREATE INDEX idx_connections_source ON connections(source_id);
CREATE INDEX idx_connections_target ON connections(target_id);
CREATE INDEX idx_connections_type ON connections(type);
CREATE INDEX idx_connections_active ON connections(is_active);

-- =============================================================================
-- USER PROFILES
-- =============================================================================
-- Extends Supabase auth.users with app-specific data.
-- All other tables FK to profiles.user_id (keeps relationships in public schema).

CREATE TABLE profiles (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    sector_id TEXT REFERENCES sectors(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO profiles (user_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION create_profile_on_signup();

-- Deferred FK: types.created_by → profiles (types created before profiles)
ALTER TABLE types ADD CONSTRAINT types_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(user_id);

-- =============================================================================
-- MAPS (unified: store packages, user maps, shared maps)
-- =============================================================================
-- A map is a named collection of objects. Can be:
--   - Store package: user_id IS NULL, is_published = TRUE, has relative coords
--   - User map: user_id set, is a filter/subset of the user's Landscape
--   - Installed/shared: user_id set, source_map_id points to the original
--
-- When a user installs a package or accepts a shared map:
--   1. A new maps row is created (user_id = them, source_map_id = original)
--   2. maps_objects are copied from the source
--   3. Relative coords are translated to absolute Landscape positions (objects_overrides)
--   4. The map lives in the user's collection as a named filter

CREATE TABLE maps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    user_id UUID REFERENCES profiles(user_id) ON DELETE CASCADE,
    sector_id TEXT REFERENCES sectors(id),
    source_map_id UUID REFERENCES maps(id),
    is_published BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_maps_user ON maps(user_id);
CREATE INDEX idx_maps_published ON maps(is_published) WHERE is_published = TRUE;

CREATE TABLE maps_objects (
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    object_ref_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,  -- always objects.id (entity registry model)
    relative_x DOUBLE PRECISION,  -- NULL for user maps (derived at install time), set for store packages
    relative_y DOUBLE PRECISION,
    PRIMARY KEY (map_id, object_ref_id)
);

-- =============================================================================
-- OBJECTS OVERRIDES (per-user layer on top of the entity registry)
-- =============================================================================
-- Every override points to an objects row (object_id is always set).
-- Nullable fields override registry values; NULL means "use registry value."
-- Landscape coordinates always live here — every user has their own layout.

CREATE TABLE objects_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

    -- Overridable fields (NULL = use registry value)
    name TEXT,
    title TEXT,
    status TEXT,
    photo_url TEXT,
    event_date DATE,                    -- when the event occurred (events only)
    data JSONB,                         -- contacts array, plus any class-specific metadata

    -- Landscape position (always per-user)
    map_x DOUBLE PRECISION,
    map_y DOUBLE PRECISION,

    -- Coterie-visible fields
    shared_notes TEXT,                  -- visible to coterie, attributed
    tags TEXT[],                        -- visible to coterie

    -- Private fields (never shared)
    private_notes TEXT,                 -- never leaves your data

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One override per user per object
    UNIQUE(user_id, object_id)
);

CREATE INDEX idx_objects_overrides_user ON objects_overrides(user_id);
CREATE INDEX idx_objects_overrides_object ON objects_overrides(object_id);
CREATE INDEX idx_objects_overrides_active ON objects_overrides(is_active);

-- =============================================================================
-- OBJECTS TYPES OVERRIDES (per-user type assignments)
-- =============================================================================
-- When a user edits types for an object, their overrides go here.
-- If any rows exist for a user+object, they take precedence over canonical objects_types.
-- If no rows exist, the user sees canonical types (via COALESCE in user_objects view).

CREATE TABLE objects_types_overrides (
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    type_id TEXT NOT NULL REFERENCES types(id),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (user_id, object_id, type_id)
);

CREATE INDEX idx_objects_types_overrides_object ON objects_types_overrides(object_id);
CREATE INDEX idx_objects_types_overrides_user ON objects_types_overrides(user_id);

-- Reuse the same class-match trigger to enforce type/class consistency
CREATE TRIGGER check_type_override_class_match_trigger
    BEFORE INSERT OR UPDATE ON objects_types_overrides
    FOR EACH ROW EXECUTE FUNCTION check_type_class_match();

-- =============================================================================
-- CONNECTIONS OVERRIDES (per-user layer on top of canonical)
-- =============================================================================
-- Two modes:
--   1. Override: connection_id points to canonical. Nullable fields override.
--   2. User-created: connection_id is NULL. source/target/type are required.
--
-- Source and target always reference objects.id (entity registry model).

CREATE TABLE connections_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,

    -- For user-created connections (connection_id IS NULL)
    source_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    target_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    type TEXT REFERENCES connection_types(id),

    -- Overridable
    data JSONB,

    -- Coterie-visible fields
    shared_notes TEXT,                  -- visible to coterie, attributed

    -- Private fields (never shared)
    private_notes TEXT,                 -- never leaves your data

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, connection_id)
);

-- User-created connections must have source, target, and type
ALTER TABLE connections_overrides ADD CONSTRAINT user_created_connection_requires_fields
    CHECK (connection_id IS NOT NULL OR (source_id IS NOT NULL AND target_id IS NOT NULL AND type IS NOT NULL));

CREATE INDEX idx_connections_overrides_user ON connections_overrides(user_id);
CREATE INDEX idx_connections_overrides_bond ON connections_overrides(connection_id);
CREATE INDEX idx_connections_overrides_source ON connections_overrides(source_id);
CREATE INDEX idx_connections_overrides_target ON connections_overrides(target_id);
CREATE INDEX idx_connections_overrides_active ON connections_overrides(is_active);

-- =============================================================================
-- COTERIES (sharing groups)
-- =============================================================================

CREATE TABLE coteries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES profiles(user_id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE coteries_members (
    coterie_id UUID NOT NULL REFERENCES coteries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',  -- 'owner', 'member'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (coterie_id, user_id)
);

CREATE INDEX idx_coteries_members_user ON coteries_members(user_id);

-- Maps shared with coteries
CREATE TABLE coteries_maps (
    coterie_id UUID NOT NULL REFERENCES coteries(id) ON DELETE CASCADE,
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    shared_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (coterie_id, map_id)
);

-- Coterie dissonance review states (diff-based updates channel)
-- Tracks how a user has responded to each structural dissonance.
-- Dissonances are detected via diff queries, not stored events.
-- No row = unreviewed. Row with status = review state.
-- Dismissal-only: if a row exists, the user has dismissed that dissonance.
-- No row = unreviewed (the diff query determines if a dissonance exists).
-- Accepted dissonances don't need a row — the data change IS the record.
--
-- NOTE: This table may go away. Dismissed dissonances are likely rare in practice
-- (most get resolved one way or the other). If dismissals are uncommon enough,
-- we could drop this table and let unresolved dissonances simply persist in the
-- Dissonance View without a "dismiss" affordance.
CREATE TABLE coteries_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    source_user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    ref_type TEXT NOT NULL CHECK (ref_type IN ('object_override', 'connection_override')),
    ref_id UUID NOT NULL,             -- objects_overrides.id or connections_overrides.id
    dismissed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, source_user_id, ref_type, ref_id)
);

CREATE INDEX idx_coteries_reviews_user ON coteries_reviews(user_id);
CREATE INDEX idx_coteries_reviews_source ON coteries_reviews(source_user_id);

-- =============================================================================
-- DEFERRED FOREIGN KEYS
-- =============================================================================
-- objects.created_by references profiles, but objects is created before profiles.
ALTER TABLE objects ADD CONSTRAINT fk_objects_created_by
    FOREIGN KEY (created_by) REFERENCES profiles(user_id);

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- Objects with their types as an array (canonical only, no user layer)
CREATE VIEW objects_with_types AS
SELECT
    o.id, o.class, o.name, o.title, o.status,
    o.photo_url, o.event_date,
    o.data, o.is_canon, o.created_by, o.is_active, o.created_at, o.updated_at,
    COALESCE(
        array_agg(ot.type_id) FILTER (WHERE ot.type_id IS NOT NULL),
        '{}'::TEXT[]
    ) AS types
FROM objects o
LEFT JOIN objects_types ot ON ot.object_id = o.id
WHERE o.is_active = TRUE
GROUP BY o.id;

-- User's merged reality: canonical objects + their overrides + types
-- COALESCE = use override if set, fall back to canonical
-- Types: user's objects_types_overrides take precedence; falls back to canonical objects_types
-- This is what the app queries — one row per object per user
CREATE VIEW user_objects AS
SELECT
    ov.user_id,
    o.id,
    o.class,
    COALESCE(ov.name, o.name) AS name,
    COALESCE(ov.title, o.title) AS title,
    COALESCE(ov.status, o.status) AS status,
    COALESCE(ov.photo_url, o.photo_url) AS photo_url,
    COALESCE(ov.event_date, o.event_date) AS event_date,
    COALESCE(ov.data, o.data) AS data,
    o.is_canon,
    o.created_by,
    ov.map_x,
    ov.map_y,
    ov.shared_notes,
    ov.private_notes,
    ov.tags,
    COALESCE(
        (SELECT array_agg(oto.type_id) FROM objects_types_overrides oto
         WHERE oto.user_id = ov.user_id AND oto.object_id = o.id),
        (SELECT array_agg(ot.type_id) FROM objects_types ot
         WHERE ot.object_id = o.id),
        '{}'::TEXT[]
    ) AS types
FROM objects_overrides ov
JOIN objects o ON o.id = ov.object_id
WHERE ov.is_active = TRUE AND o.is_active = TRUE;

-- =============================================================================
-- UPDATE TRIGGERS
-- =============================================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER objects_updated_at
    BEFORE UPDATE ON objects
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER connections_updated_at
    BEFORE UPDATE ON connections
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER objects_overrides_updated_at
    BEFORE UPDATE ON objects_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER connections_overrides_updated_at
    BEFORE UPDATE ON connections_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER maps_updated_at
    BEFORE UPDATE ON maps
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER coteries_updated_at
    BEFORE UPDATE ON coteries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- TODO: Row Level Security (RLS)
-- =============================================================================
-- Registry tables (objects, connections, taxonomy): readable by all authenticated users
-- Override tables: users can read/write their own + read coterie members' overrides
--   (excluding private_notes — NEVER returned for other users)
-- Maps: readable by all authenticated users
-- Profiles: users can read all, write their own
-- Coteries: members can read, owner can write
-- Coterie reviews: users can read/write their own
