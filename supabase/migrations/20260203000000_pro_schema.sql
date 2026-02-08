-- Migration: Pro-tier schema
-- Entity registry + user override architecture, industry-agnostic, coterie sharing
--
-- Key concepts:
--   - objects = entity registry (is_canon distinguishes vetted from user-created)
--   - connections = canonical connections between objects
--   - objects_overrides/connections_overrides = per-user layer (overrides + user-created)
--   - maps = unified: store packages, user maps, shared maps
--   - coteries = sharing groups with diff-based dissonance detection
--   - coterie_reviews = tracks user responses to dissonances
--   - industries = scoping for onboarding + map packages

-- =============================================================================
-- CLEAN SLATE
-- =============================================================================

DROP VIEW IF EXISTS objects_with_types CASCADE;
DROP TABLE IF EXISTS coterie_reviews CASCADE;
DROP TABLE IF EXISTS coteries_maps CASCADE;
DROP TABLE IF EXISTS coterie_members CASCADE;
DROP TABLE IF EXISTS coteries CASCADE;
DROP TABLE IF EXISTS maps_objects CASCADE;
DROP TABLE IF EXISTS maps CASCADE;
DROP TABLE IF EXISTS objects_industries CASCADE;
DROP TABLE IF EXISTS connections_overrides CASCADE;
DROP TABLE IF EXISTS objects_overrides CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS log_entries CASCADE;
DROP TABLE IF EXISTS objects_types CASCADE;
DROP TABLE IF EXISTS connections CASCADE;
DROP TABLE IF EXISTS objects CASCADE;
DROP TABLE IF EXISTS connection_types CASCADE;
DROP TABLE IF EXISTS types CASCADE;
DROP TABLE IF EXISTS classes CASCADE;
DROP TABLE IF EXISTS industries CASCADE;

-- Legacy cleanup
DROP TABLE IF EXISTS object_type_assignments CASCADE;
DROP TABLE IF EXISTS object_industries CASCADE;
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
-- INDUSTRIES
-- =============================================================================

CREATE TABLE industries (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO industries (id, display_name, icon, color) VALUES
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
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO classes (id, display_name, icon, color) VALUES
    ('company', 'Company', 'building.2', '#3B82F6'),
    ('person', 'Person', 'person.fill', '#10B981'),
    ('project', 'Project', 'film', '#F59E0B');

-- =============================================================================
-- TYPES (extensible variants within a class)
-- =============================================================================

CREATE TABLE types (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    class TEXT NOT NULL REFERENCES classes(id),
    icon TEXT,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company types
INSERT INTO types (id, display_name, class, icon, color) VALUES
    ('studio', 'Studio', 'company', 'building.2.fill', '#3B82F6'),
    ('parent_company', 'Parent Company', 'company', 'building.columns', '#1E40AF'),
    ('network', 'Network', 'company', 'tv', '#7C3AED'),
    ('streamer', 'Streamer', 'company', 'play.tv', '#DC2626'),
    ('production_company', 'Production Company', 'company', 'film.stack', '#059669'),
    ('agency', 'Agency', 'company', 'person.3', '#EA580C'),
    ('management', 'Management', 'company', 'person.2', '#DB2777'),
    ('financier', 'Financier', 'company', 'dollarsign.circle', '#CA8A04'),
    ('distributor', 'Distributor', 'company', 'shippingbox', '#0891B2'),
    ('guild_union', 'Guild/Union', 'company', 'person.badge.shield.checkmark', '#6B7280');

-- Person types
INSERT INTO types (id, display_name, class, icon, color) VALUES
    ('executive', 'Executive', 'person', 'person.badge.key', '#1E40AF'),
    ('producer', 'Producer', 'person', 'person.crop.rectangle', '#7C3AED'),
    ('creative', 'Creative', 'person', 'pencil.and.outline', '#059669'),
    ('talent', 'Talent', 'person', 'star', '#CA8A04'),
    ('agent', 'Agent', 'person', 'briefcase', '#EA580C'),
    ('manager', 'Manager', 'person', 'person.badge.clock', '#DB2777'),
    ('lawyer', 'Lawyer', 'person', 'text.book.closed', '#6B7280'),
    ('investor', 'Investor', 'person', 'chart.line.uptrend.xyaxis', '#0891B2');

-- Project types
INSERT INTO types (id, display_name, class, icon, color) VALUES
    ('feature', 'Feature', 'project', 'film', '#F59E0B'),
    ('tv_series', 'TV Series', 'project', 'tv', '#7C3AED'),
    ('limited_series', 'Limited Series', 'project', 'tv.inset.filled', '#DC2626'),
    ('pilot', 'Pilot', 'project', 'play.rectangle', '#059669'),
    ('documentary', 'Documentary', 'project', 'doc.text.image', '#3B82F6'),
    ('short', 'Short', 'project', 'film.stack', '#6B7280'),
    ('unscripted', 'Unscripted', 'project', 'person.wave.2', '#EA580C');

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
    name TEXT NOT NULL,
    title TEXT,                          -- subtitle/description: job title, company tagline, logline
    status TEXT,                         -- lifecycle: active, development, released, defunct, etc.
    phone TEXT,                          -- primary phone
    phone_2 TEXT,                        -- secondary phone
    email TEXT,                          -- primary email
    website TEXT,                        -- primary URL
    address TEXT,                        -- free-form location
    photo_url TEXT,                      -- headshot / logo / poster
    data JSONB DEFAULT '{}',            -- long tail: social links, genre, etc.
    is_canon BOOLEAN DEFAULT FALSE,     -- vetted/maintained by platform operators
    created_by UUID,                    -- NULL = platform-seeded; FK to profiles added after profiles table exists
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_objects_class ON objects(class);
CREATE INDEX idx_objects_name ON objects(name);
CREATE INDEX idx_objects_data ON objects USING GIN(data);
CREATE INDEX idx_objects_active ON objects(is_active);
CREATE INDEX idx_objects_canon ON objects(is_canon);
CREATE INDEX idx_objects_created_by ON objects(created_by);

-- =============================================================================
-- OBJECTS_INDUSTRIES (many-to-many: objects can span industries)
-- =============================================================================

CREATE TABLE objects_industries (
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    industry_id TEXT NOT NULL REFERENCES industries(id),
    PRIMARY KEY (object_id, industry_id)
);

CREATE INDEX idx_objects_industries_industry ON objects_industries(industry_id);

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
    ('related_to', 'Related To', NULL, NULL, 'link');

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
    industry_id TEXT REFERENCES industries(id),
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
    industry_id TEXT REFERENCES industries(id),
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
    phone TEXT,
    phone_2 TEXT,
    email TEXT,
    website TEXT,
    address TEXT,
    photo_url TEXT,
    data JSONB,

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

CREATE TABLE coterie_members (
    coterie_id UUID NOT NULL REFERENCES coteries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',  -- 'owner', 'member'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (coterie_id, user_id)
);

CREATE INDEX idx_coterie_members_user ON coterie_members(user_id);

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
CREATE TABLE coterie_reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    source_user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    ref_type TEXT NOT NULL CHECK (ref_type IN ('object_override', 'connection_override')),
    ref_id UUID NOT NULL,             -- objects_overrides.id or connections_overrides.id
    status TEXT NOT NULL CHECK (status IN ('dismissed', 'accepted')),
    reviewed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, source_user_id, ref_type, ref_id)
);

CREATE INDEX idx_coterie_reviews_user ON coterie_reviews(user_id);
CREATE INDEX idx_coterie_reviews_source ON coterie_reviews(source_user_id);

-- =============================================================================
-- DEFERRED FOREIGN KEYS
-- =============================================================================
-- objects.created_by references profiles, but objects is created before profiles.
ALTER TABLE objects ADD CONSTRAINT fk_objects_created_by
    FOREIGN KEY (created_by) REFERENCES profiles(user_id);

-- =============================================================================
-- LOG ENTRIES (per-user activity log)
-- =============================================================================

CREATE TABLE log_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    entry_date DATE DEFAULT CURRENT_DATE,
    linked_objects UUID[] DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_log_entries_user ON log_entries(user_id);
CREATE INDEX idx_log_entries_date ON log_entries(entry_date);
CREATE INDEX idx_log_entries_linked ON log_entries USING GIN(linked_objects);

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- Objects with their types as an array
CREATE VIEW objects_with_types AS
SELECT
    o.id, o.class, o.name, o.title, o.status,
    o.phone, o.phone_2, o.email, o.website, o.address, o.photo_url,
    o.data, o.is_canon, o.created_by, o.is_active, o.created_at, o.updated_at,
    COALESCE(
        array_agg(ot.type_id) FILTER (WHERE ot.type_id IS NOT NULL),
        '{}'::TEXT[]
    ) AS types
FROM objects o
LEFT JOIN objects_types ot ON ot.object_id = o.id
WHERE o.is_active = TRUE
GROUP BY o.id;

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

CREATE TRIGGER log_entries_updated_at
    BEFORE UPDATE ON log_entries
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
