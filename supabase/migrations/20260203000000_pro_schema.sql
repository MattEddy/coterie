-- Migration: Pro-tier schema
-- Canonical + user override architecture, industry-agnostic, coterie sharing
--
-- Key concepts:
--   - objects/relationships = canonical truth (we maintain)
--   - objects_overrides/relationships_overrides = per-user layer (overrides + user-created)
--   - maps = curated packages of objects with default positions
--   - coteries = sharing groups
--   - industries = scoping for onboarding + map packages

-- =============================================================================
-- CLEAN SLATE
-- =============================================================================

DROP VIEW IF EXISTS objects_with_types CASCADE;
DROP TABLE IF EXISTS coterie_members CASCADE;
DROP TABLE IF EXISTS coteries CASCADE;
DROP TABLE IF EXISTS map_objects CASCADE;
DROP TABLE IF EXISTS maps CASCADE;
DROP TABLE IF EXISTS object_industries CASCADE;
DROP TABLE IF EXISTS relationships_overrides CASCADE;
DROP TABLE IF EXISTS objects_overrides CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;
DROP TABLE IF EXISTS log_entries CASCADE;
DROP TABLE IF EXISTS object_type_assignments CASCADE;
DROP TABLE IF EXISTS relationships CASCADE;
DROP TABLE IF EXISTS objects CASCADE;
DROP TABLE IF EXISTS relationship_types CASCADE;
DROP TABLE IF EXISTS object_types CASCADE;
DROP TABLE IF EXISTS object_classes CASCADE;
DROP TABLE IF EXISTS industries CASCADE;

-- Legacy cleanup
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
-- OBJECT CLASSES (fixed: company, person, project)
-- =============================================================================

CREATE TABLE object_classes (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    icon TEXT,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO object_classes (id, display_name, icon, color) VALUES
    ('company', 'Company', 'building.2', '#3B82F6'),
    ('person', 'Person', 'person.fill', '#10B981'),
    ('project', 'Project', 'film', '#F59E0B');

-- =============================================================================
-- OBJECT TYPES (extensible variants within a class)
-- =============================================================================

CREATE TABLE object_types (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    class TEXT NOT NULL REFERENCES object_classes(id),
    icon TEXT,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Company types
INSERT INTO object_types (id, display_name, class, icon, color) VALUES
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
INSERT INTO object_types (id, display_name, class, icon, color) VALUES
    ('executive', 'Executive', 'person', 'person.badge.key', '#1E40AF'),
    ('producer', 'Producer', 'person', 'person.crop.rectangle', '#7C3AED'),
    ('creative', 'Creative', 'person', 'pencil.and.outline', '#059669'),
    ('talent', 'Talent', 'person', 'star', '#CA8A04'),
    ('agent', 'Agent', 'person', 'briefcase', '#EA580C'),
    ('manager', 'Manager', 'person', 'person.badge.clock', '#DB2777'),
    ('lawyer', 'Lawyer', 'person', 'text.book.closed', '#6B7280'),
    ('investor', 'Investor', 'person', 'chart.line.uptrend.xyaxis', '#0891B2');

-- Project types
INSERT INTO object_types (id, display_name, class, icon, color) VALUES
    ('feature', 'Feature', 'project', 'film', '#F59E0B'),
    ('tv_series', 'TV Series', 'project', 'tv', '#7C3AED'),
    ('limited_series', 'Limited Series', 'project', 'tv.inset.filled', '#DC2626'),
    ('pilot', 'Pilot', 'project', 'play.rectangle', '#059669'),
    ('documentary', 'Documentary', 'project', 'doc.text.image', '#3B82F6'),
    ('short', 'Short', 'project', 'film.stack', '#6B7280'),
    ('unscripted', 'Unscripted', 'project', 'person.wave.2', '#EA580C');

-- =============================================================================
-- OBJECTS (canonical entities — the shared truth)
-- =============================================================================
-- No map coordinates here — position is per-user (lives in overrides).
-- No user ownership — canonical objects belong to everyone.

CREATE TABLE objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class TEXT NOT NULL REFERENCES object_classes(id),
    name TEXT NOT NULL,
    data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_objects_class ON objects(class);
CREATE INDEX idx_objects_name ON objects(name);
CREATE INDEX idx_objects_data ON objects USING GIN(data);
CREATE INDEX idx_objects_active ON objects(is_active);

-- =============================================================================
-- OBJECT INDUSTRIES (many-to-many: objects can span industries)
-- =============================================================================

CREATE TABLE object_industries (
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    industry_id TEXT NOT NULL REFERENCES industries(id),
    PRIMARY KEY (object_id, industry_id)
);

CREATE INDEX idx_object_industries_industry ON object_industries(industry_id);

-- =============================================================================
-- OBJECT TYPE ASSIGNMENTS (many-to-many: objects can have multiple types)
-- =============================================================================

CREATE TABLE object_type_assignments (
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    type_id TEXT NOT NULL REFERENCES object_types(id),
    is_primary BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (object_id, type_id)
);

CREATE INDEX idx_type_assignments_type ON object_type_assignments(type_id);

-- Ensure type matches object's class
CREATE OR REPLACE FUNCTION check_type_class_match()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM object_types ot
        JOIN objects o ON o.id = NEW.object_id
        WHERE ot.id = NEW.type_id AND ot.class = o.class
    ) THEN
        RAISE EXCEPTION 'Type % does not match object class', NEW.type_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER check_type_class_match_trigger
    BEFORE INSERT OR UPDATE ON object_type_assignments
    FOR EACH ROW EXECUTE FUNCTION check_type_class_match();

-- =============================================================================
-- RELATIONSHIP TYPES
-- =============================================================================

CREATE TABLE relationship_types (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    valid_source_classes TEXT[],
    valid_target_classes TEXT[],
    icon TEXT,
    color TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO relationship_types (id, display_name, valid_source_classes, valid_target_classes, icon) VALUES
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
-- RELATIONSHIPS (canonical connections — the shared truth)
-- =============================================================================

CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    type TEXT NOT NULL REFERENCES relationship_types(id),
    data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(source_id, target_id, type)
);

CREATE INDEX idx_relationships_source ON relationships(source_id);
CREATE INDEX idx_relationships_target ON relationships(target_id);
CREATE INDEX idx_relationships_type ON relationships(type);
CREATE INDEX idx_relationships_active ON relationships(is_active);

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
--   2. map_objects are copied from the source
--   3. Relative coords are translated to absolute Landscape positions (objects_overrides)
--   4. The map lives in the user's collection as a named filter

CREATE TABLE maps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    industry_id TEXT REFERENCES industries(id),
    source_map_id UUID REFERENCES maps(id),
    is_published BOOLEAN DEFAULT FALSE,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_maps_user ON maps(user_id);
CREATE INDEX idx_maps_published ON maps(is_published) WHERE is_published = TRUE;

CREATE TABLE map_objects (
    map_id UUID NOT NULL REFERENCES maps(id) ON DELETE CASCADE,
    object_ref_id UUID NOT NULL,  -- objects.id or objects_overrides.id (resolved at app layer)
    relative_x DOUBLE PRECISION,  -- NULL for filter-only maps, set for packages/shared
    relative_y DOUBLE PRECISION,
    PRIMARY KEY (map_id, object_ref_id)
);

-- =============================================================================
-- USER PROFILES
-- =============================================================================
-- Extends Supabase auth.users with app-specific data.

CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    industry_id TEXT REFERENCES industries(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- OBJECTS OVERRIDES (per-user layer on top of canonical)
-- =============================================================================
-- Two modes:
--   1. Override: object_id points to a canonical row. Nullable fields override
--      canonical values; NULL means "use canonical."
--   2. User-created: object_id is NULL. This entity exists only for this user
--      (and their coterie). class and name are required in this case.
--
-- Map coordinates always live here — every user has their own layout.

CREATE TABLE objects_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    object_id UUID REFERENCES objects(id) ON DELETE CASCADE,

    -- Overridable fields (NULL = use canonical value)
    -- For user-created objects (object_id IS NULL), class and name are required.
    name TEXT,
    class TEXT REFERENCES object_classes(id),
    data JSONB,

    -- Map position (always per-user)
    map_x DOUBLE PRECISION,
    map_y DOUBLE PRECISION,

    -- User-only fields
    notes TEXT,
    tags TEXT[],

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One override per user per canonical object (NULLs are exempt, allowing
    -- multiple user-created objects per user — which is correct)
    UNIQUE(user_id, object_id)
);

-- User-created objects must have class and name
ALTER TABLE objects_overrides ADD CONSTRAINT user_created_requires_class_name
    CHECK (object_id IS NOT NULL OR (class IS NOT NULL AND name IS NOT NULL));

CREATE INDEX idx_objects_overrides_user ON objects_overrides(user_id);
CREATE INDEX idx_objects_overrides_object ON objects_overrides(object_id);
CREATE INDEX idx_objects_overrides_active ON objects_overrides(is_active);

-- =============================================================================
-- RELATIONSHIPS OVERRIDES (per-user layer on top of canonical)
-- =============================================================================
-- Same two modes as objects_overrides:
--   1. Override: relationship_id points to canonical. Nullable fields override.
--   2. User-created: relationship_id is NULL. source/target/type are required.
--
-- Source and target are UUIDs that can reference either objects.id (canonical)
-- or objects_overrides.id (user-created). No FK constraint here — the app
-- resolves references against both tables. This is a pragmatic tradeoff:
-- referential integrity for user-created cross-table refs is enforced at the
-- app layer, not the DB layer.

CREATE TABLE relationships_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    relationship_id UUID REFERENCES relationships(id) ON DELETE CASCADE,

    -- For user-created relationships (relationship_id IS NULL)
    source_id UUID,
    target_id UUID,
    type TEXT REFERENCES relationship_types(id),

    -- Overridable
    data JSONB,

    -- User-only fields
    notes TEXT,

    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, relationship_id)
);

-- User-created relationships must have source, target, and type
ALTER TABLE relationships_overrides ADD CONSTRAINT user_created_rel_requires_fields
    CHECK (relationship_id IS NOT NULL OR (source_id IS NOT NULL AND target_id IS NOT NULL AND type IS NOT NULL));

CREATE INDEX idx_rel_overrides_user ON relationships_overrides(user_id);
CREATE INDEX idx_rel_overrides_relationship ON relationships_overrides(relationship_id);
CREATE INDEX idx_rel_overrides_source ON relationships_overrides(source_id);
CREATE INDEX idx_rel_overrides_target ON relationships_overrides(target_id);
CREATE INDEX idx_rel_overrides_active ON relationships_overrides(is_active);

-- =============================================================================
-- COTERIES (sharing groups)
-- =============================================================================

CREATE TABLE coteries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES auth.users(id),
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE coterie_members (
    coterie_id UUID NOT NULL REFERENCES coteries(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'member',  -- 'owner', 'member'
    joined_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (coterie_id, user_id)
);

CREATE INDEX idx_coterie_members_user ON coterie_members(user_id);

-- =============================================================================
-- LOG ENTRIES (per-user activity log)
-- =============================================================================

CREATE TABLE log_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
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

-- Canonical objects with their types as an array
CREATE VIEW objects_with_types AS
SELECT
    o.*,
    COALESCE(
        array_agg(ota.type_id) FILTER (WHERE ota.type_id IS NOT NULL),
        '{}'::TEXT[]
    ) AS types
FROM objects o
LEFT JOIN object_type_assignments ota ON ota.object_id = o.id
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

CREATE TRIGGER relationships_updated_at
    BEFORE UPDATE ON relationships
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER objects_overrides_updated_at
    BEFORE UPDATE ON objects_overrides
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER relationships_overrides_updated_at
    BEFORE UPDATE ON relationships_overrides
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
-- Canonical tables (objects, relationships, taxonomy): readable by all authenticated users
-- Override tables: users can read/write their own + read coterie members' overrides
-- Maps: readable by all authenticated users
-- Profiles: users can read all, write their own
-- Coteries: members can read, owner can write
