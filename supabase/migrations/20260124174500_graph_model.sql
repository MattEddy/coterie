-- Migration: Graph-based data model with Class/Type taxonomy
-- Class = broad category (company, person, project)
-- Type = specific variant (studio, executive, feature) - objects can have multiple

-- Drop old schema
DROP TABLE IF EXISTS object_type_assignments CASCADE;
DROP TABLE IF EXISTS log_entries CASCADE;
DROP TABLE IF EXISTS relationships CASCADE;
DROP TABLE IF EXISTS objects CASCADE;
DROP TABLE IF EXISTS relationship_types CASCADE;
DROP TABLE IF EXISTS object_types CASCADE;
DROP TABLE IF EXISTS object_classes CASCADE;

-- Legacy cleanup
DROP TABLE IF EXISTS projects CASCADE;
DROP TABLE IF EXISTS people CASCADE;
DROP TABLE IF EXISTS companies CASCADE;
DROP TYPE IF EXISTS company_type CASCADE;
DROP TYPE IF EXISTS project_type CASCADE;
DROP TYPE IF EXISTS project_status CASCADE;
DROP TYPE IF EXISTS relationship_type CASCADE;

-- =============================================================================
-- OBJECT CLASSES (fixed categories: company, person, project)
-- =============================================================================

CREATE TABLE object_classes (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    icon TEXT,  -- SF Symbol name
    color TEXT, -- Hex color for UI
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO object_classes (id, display_name, icon, color) VALUES
    ('company', 'Company', 'building.2', '#3B82F6'),
    ('person', 'Person', 'person.fill', '#10B981'),
    ('project', 'Project', 'film', '#F59E0B');

-- =============================================================================
-- OBJECT TYPES (specific variants within a class, extensible)
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
-- OBJECTS (the universal entity table)
-- =============================================================================

CREATE TABLE objects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    class TEXT NOT NULL REFERENCES object_classes(id),
    name TEXT NOT NULL,
    data JSONB DEFAULT '{}',  -- Flexible fields (title, website, logline, etc.)

    -- Map position (for visual layout)
    map_x DOUBLE PRECISION,
    map_y DOUBLE PRECISION,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_objects_class ON objects(class);
CREATE INDEX idx_objects_name ON objects(name);
CREATE INDEX idx_objects_data ON objects USING GIN(data);

-- =============================================================================
-- OBJECT TYPE ASSIGNMENTS (many-to-many: objects can have multiple types)
-- =============================================================================

CREATE TABLE object_type_assignments (
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    type_id TEXT NOT NULL REFERENCES object_types(id),
    is_primary BOOLEAN DEFAULT FALSE,  -- Optional: mark the primary type
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
-- RELATIONSHIP TYPES (natural key = id)
-- =============================================================================

CREATE TABLE relationship_types (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,

    -- Constraints on which classes can participate
    valid_source_classes TEXT[],  -- NULL = any class allowed
    valid_target_classes TEXT[],  -- NULL = any class allowed

    -- Display
    icon TEXT,
    color TEXT,

    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO relationship_types (id, display_name, valid_source_classes, valid_target_classes, icon) VALUES
    -- Company relationships
    ('owns', 'Owns', '{company}', '{company}', 'arrow.down.circle'),
    ('division_of', 'Division Of', '{company}', '{company}', 'square.grid.2x2'),

    -- Employment
    ('employed_by', 'Employed By', '{person}', '{company}', 'briefcase'),
    ('reports_to', 'Reports To', '{person}', '{person}', 'arrow.up.circle'),

    -- Deals & Representation
    ('has_deal_at', 'Has Deal At', '{company}', '{company}', 'doc.text'),
    ('represents', 'Represents', '{company}', '{person}', 'person.badge.shield.checkmark'),
    ('represented_by', 'Represented By', '{person}', '{company}', 'person.badge.shield.checkmark'),

    -- Projects
    ('set_up_at', 'Set Up At', '{project}', '{company}', 'building.2'),
    ('attached_to', 'Attached To', '{person}', '{project}', 'paperclip'),
    ('produces', 'Produces', '{company}', '{project}', 'film'),

    -- Generic
    ('related_to', 'Related To', NULL, NULL, 'link');

-- =============================================================================
-- RELATIONSHIPS (the universal connection table)
-- =============================================================================

CREATE TABLE relationships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    source_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    target_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,

    type TEXT NOT NULL REFERENCES relationship_types(id),

    -- Flexible metadata (role, start_date, notes, etc.)
    data JSONB DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(source_id, target_id, type)
);

CREATE INDEX idx_relationships_source ON relationships(source_id);
CREATE INDEX idx_relationships_target ON relationships(target_id);
CREATE INDEX idx_relationships_type ON relationships(type);

-- =============================================================================
-- LOG ENTRIES
-- =============================================================================

CREATE TABLE log_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    content TEXT NOT NULL,
    entry_date DATE DEFAULT CURRENT_DATE,

    -- Can be linked to any object
    linked_objects UUID[] DEFAULT '{}',

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_log_entries_date ON log_entries(entry_date);
CREATE INDEX idx_log_entries_linked ON log_entries USING GIN(linked_objects);

-- =============================================================================
-- HELPER VIEWS
-- =============================================================================

-- Objects with their types as an array
CREATE VIEW objects_with_types AS
SELECT
    o.*,
    COALESCE(
        array_agg(ota.type_id) FILTER (WHERE ota.type_id IS NOT NULL),
        '{}'::TEXT[]
    ) AS types
FROM objects o
LEFT JOIN object_type_assignments ota ON ota.object_id = o.id
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

CREATE TRIGGER log_entries_updated_at
    BEFORE UPDATE ON log_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
