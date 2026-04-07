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
DROP TABLE IF EXISTS coteries_invitations CASCADE;
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
DROP TABLE IF EXISTS roles CASCADE;
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
-- CLASSES (fixed: org, person, project, event)
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
    ('org', 'Org', 'building.2', '#3B82F6', TRUE),
    ('person', 'Person', 'person.fill', '#10B981', TRUE),
    ('project', 'Project', 'film', '#F59E0B', FALSE),
    ('event', 'Event', 'calendar', '#DC2626', FALSE);

-- =============================================================================
-- TYPES (extensible variants within a class)
-- =============================================================================

CREATE TABLE types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    class TEXT NOT NULL REFERENCES classes(id),
    icon TEXT,
    color TEXT,
    is_canon BOOLEAN DEFAULT FALSE,
    created_by UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Org types (canonical)
INSERT INTO types (display_name, class, icon, color, is_canon) VALUES
    ('Studio', 'org', 'building.2.fill', '#3B82F6', TRUE),
    ('Parent Company', 'org', 'building.columns', '#1E40AF', TRUE),
    ('Network', 'org', 'tv', '#7C3AED', TRUE),
    ('Streamer', 'org', 'play.tv', '#DC2626', TRUE),
    ('Production Company', 'org', 'film.stack', '#059669', TRUE),
    ('Agency', 'org', 'person.3', '#EA580C', TRUE),
    ('Management', 'org', 'person.2', '#DB2777', TRUE),
    ('Financier', 'org', 'dollarsign.circle', '#CA8A04', TRUE),
    ('Distributor', 'org', 'shippingbox', '#0891B2', TRUE),
    ('Guild/Union', 'org', 'person.badge.shield.checkmark', '#6B7280', TRUE);

-- Person types (canonical)
INSERT INTO types (display_name, class, icon, color, is_canon) VALUES
    ('Executive', 'person', 'person.badge.key', '#1E40AF', TRUE),
    ('Producer', 'person', 'person.crop.rectangle', '#7C3AED', TRUE),
    ('Creative', 'person', 'pencil.and.outline', '#059669', TRUE),
    ('Talent', 'person', 'star', '#CA8A04', TRUE),
    ('Agent', 'person', 'briefcase', '#EA580C', TRUE),
    ('Manager', 'person', 'person.badge.clock', '#DB2777', TRUE),
    ('Lawyer', 'person', 'text.book.closed', '#6B7280', TRUE),
    ('Investor', 'person', 'chart.line.uptrend.xyaxis', '#0891B2', TRUE);

-- Project types (canonical)
INSERT INTO types (display_name, class, icon, color, is_canon) VALUES
    ('Feature', 'project', 'film', '#F59E0B', TRUE),
    ('TV Series', 'project', 'tv', '#7C3AED', TRUE),
    ('Limited Series', 'project', 'tv.inset.filled', '#DC2626', TRUE),
    ('Pilot', 'project', 'play.rectangle', '#059669', TRUE),
    ('Documentary', 'project', 'doc.text.image', '#3B82F6', TRUE),
    ('Short', 'project', 'film.stack', '#6B7280', TRUE),
    ('Unscripted', 'project', 'person.wave.2', '#EA580C', TRUE);

-- Event types (canonical)
INSERT INTO types (display_name, class, icon, color, is_canon) VALUES
    ('Meeting', 'event', 'person.2', '#DC2626', TRUE),
    ('Call', 'event', 'phone', '#3B82F6', TRUE),
    ('Email Exchange', 'event', 'envelope', '#10B981', TRUE),
    ('Pitch', 'event', 'presentation', '#F59E0B', TRUE),
    ('Screening', 'event', 'film', '#7C3AED', TRUE),
    ('Premiere', 'event', 'star', '#EA580C', TRUE),
    ('Introduction', 'event', 'person.badge.plus', '#059669', TRUE),
    ('General', 'event', 'note.text', '#6B7280', TRUE);

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
    title TEXT,                          -- subtitle/description: job title, org tagline, logline
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
    type_id UUID NOT NULL REFERENCES types(id),
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
-- ROLES (vocabulary for connection endpoints)
-- =============================================================================
-- Each connection has two objects and (optionally) a role for each side.
-- Roles describe what the object IS in the relationship: employee, client, parent, etc.
-- Direction-agnostic — the role labels tell you who's who.

CREATE TABLE roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    display_name TEXT NOT NULL,
    is_canon BOOLEAN DEFAULT FALSE,
    created_by UUID,               -- NULL = platform-seeded; FK added after profiles
    created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO roles (display_name, is_canon) VALUES
    ('Employee', TRUE),
    ('Employer', TRUE),
    ('Rep', TRUE),
    ('Client', TRUE),
    ('Parent', TRUE),
    ('Subsidiary', TRUE),
    ('Division', TRUE),
    ('Supervisor', TRUE),
    ('Direct Report', TRUE),
    ('Deal Partner', TRUE),
    ('Producer', TRUE),
    ('Production', TRUE),
    ('Talent', TRUE),
    ('Participant', TRUE),
    ('Venue', TRUE),
    ('Subject', TRUE),
    ('Collaborator', TRUE),
    ('Partner', TRUE),
    ('Related', TRUE);

-- =============================================================================
-- CONNECTIONS (canonical connections — the shared truth)
-- =============================================================================
-- Direction-agnostic: object_a/object_b have no implied ordering.
-- Roles are optional — a connection can be a bare line.

CREATE TABLE connections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    object_a_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    object_b_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    role_a UUID REFERENCES roles(id),   -- what object_a IS in this relationship
    role_b UUID REFERENCES roles(id),   -- what object_b IS in this relationship
    data JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Prevent exact duplicate connections (same objects, same roles)
-- Uses '00000000-0000-0000-0000-000000000000' as sentinel for NULL UUIDs
CREATE UNIQUE INDEX idx_connections_unique ON connections(
    object_a_id, object_b_id,
    COALESCE(role_a, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(role_b, '00000000-0000-0000-0000-000000000000'::UUID)
);

CREATE INDEX idx_connections_a ON connections(object_a_id);
CREATE INDEX idx_connections_b ON connections(object_b_id);
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
    workspace_layout JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Subscriptions — tracks trial, payment, and access tier per user
CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES profiles(user_id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'trialing'
        CHECK (status IN ('trialing', 'active', 'past_due', 'canceled', 'free', 'vip')),
    plan_id TEXT,
    trial_ends_at TIMESTAMPTZ,
    trial_duration_days INT NOT NULL DEFAULT 60,
    current_period_end TIMESTAMPTZ,
    coupon_code TEXT,
    stripe_customer_id TEXT,
    stripe_subscription_id TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);

-- user_tier() — returns 'pro' | 'trial' | 'free' for access gating
CREATE OR REPLACE FUNCTION user_tier(uid UUID)
RETURNS TEXT AS $$
DECLARE
    sub RECORD;
BEGIN
    SELECT status, trial_ends_at INTO sub
    FROM public.subscriptions
    WHERE user_id = uid;

    IF NOT FOUND THEN
        RETURN 'free';
    END IF;

    IF sub.status IN ('active', 'vip') THEN
        RETURN 'pro';
    END IF;

    IF sub.status = 'trialing' THEN
        IF sub.trial_ends_at IS NOT NULL AND sub.trial_ends_at > NOW() THEN
            RETURN 'trial';
        ELSE
            UPDATE public.subscriptions
            SET status = 'free', updated_at = NOW()
            WHERE user_id = uid AND status = 'trialing';
            RETURN 'free';
        END IF;
    END IF;

    IF sub.status = 'past_due' THEN
        RETURN 'pro';
    END IF;

    RETURN 'free';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Auto-create profile + subscription on signup
CREATE OR REPLACE FUNCTION create_profile_on_signup()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (user_id) VALUES (NEW.id);
    INSERT INTO public.subscriptions (user_id, status, trial_ends_at)
    VALUES (NEW.id, 'trialing', NOW() + INTERVAL '60 days');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION create_profile_on_signup();

-- Deferred FK: types.created_by → profiles (types created before profiles)
ALTER TABLE types ADD CONSTRAINT types_created_by_fkey
    FOREIGN KEY (created_by) REFERENCES profiles(user_id);

-- Deferred FK: roles.created_by → profiles (roles created before profiles)
ALTER TABLE roles ADD CONSTRAINT roles_created_by_fkey
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
    source_coterie_id UUID,              -- recipient's aggregated view of a coterie (FK added after coteries table)
    is_published BOOLEAN DEFAULT FALSE,
    auto_add BOOLEAN NOT NULL DEFAULT FALSE,
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

    -- No is_active — deleting an override = hard delete (user just sees canonical again)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One override per user per object
    UNIQUE(user_id, object_id)
);

CREATE INDEX idx_objects_overrides_user ON objects_overrides(user_id);
CREATE INDEX idx_objects_overrides_object ON objects_overrides(object_id);

-- =============================================================================
-- OBJECTS TYPES OVERRIDES (per-user type assignments)
-- =============================================================================
-- When a user edits types for an object, their overrides go here.
-- If any rows exist for a user+object, they take precedence over canonical objects_types.
-- If no rows exist, the user sees canonical types (via COALESCE in user_objects view).

CREATE TABLE objects_types_overrides (
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    object_id UUID NOT NULL REFERENCES objects(id) ON DELETE CASCADE,
    type_id UUID NOT NULL REFERENCES types(id),
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
--   2. User-created: connection_id is NULL. object_a/object_b are required.
--
-- Direction-agnostic, matching the connections table.

CREATE TABLE connections_overrides (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
    connection_id UUID REFERENCES connections(id) ON DELETE CASCADE,

    -- For user-created connections (connection_id IS NULL)
    object_a_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    object_b_id UUID REFERENCES objects(id) ON DELETE CASCADE,
    role_a UUID REFERENCES roles(id),
    role_b UUID REFERENCES roles(id),

    -- Overridable
    data JSONB,

    -- Coterie-visible fields
    shared_notes TEXT,                  -- visible to coterie, attributed

    -- Private fields (never shared)
    private_notes TEXT,                 -- never leaves your data

    -- For canonical connection overrides: user can deactivate a canonical connection
    -- For user-created connections: just hard delete the row
    deactivated BOOLEAN DEFAULT FALSE,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    UNIQUE(user_id, connection_id)
);

-- User-created connections must have both objects (roles are optional)
ALTER TABLE connections_overrides ADD CONSTRAINT user_created_connection_requires_objects
    CHECK (connection_id IS NOT NULL OR (object_a_id IS NOT NULL AND object_b_id IS NOT NULL));

CREATE INDEX idx_connections_overrides_user ON connections_overrides(user_id);
CREATE INDEX idx_connections_overrides_bond ON connections_overrides(connection_id);
CREATE INDEX idx_connections_overrides_a ON connections_overrides(object_a_id);
CREATE INDEX idx_connections_overrides_b ON connections_overrides(object_b_id);
CREATE INDEX idx_connections_overrides_deactivated ON connections_overrides(deactivated) WHERE deactivated = true;

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

-- Coterie invitations (pending invites, including non-users)
CREATE TABLE coteries_invitations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    coterie_id UUID NOT NULL REFERENCES coteries(id) ON DELETE CASCADE,
    invited_by UUID NOT NULL REFERENCES profiles(user_id),
    email TEXT NOT NULL,
    user_id UUID REFERENCES profiles(user_id),  -- set if email matches an existing user
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined')),
    token UUID DEFAULT gen_random_uuid(),         -- for invite links (non-users)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),

    -- One pending invite per email per coterie
    UNIQUE(coterie_id, email)
);

CREATE INDEX idx_coteries_invitations_email ON coteries_invitations(email);
CREATE INDEX idx_coteries_invitations_user ON coteries_invitations(user_id);
CREATE INDEX idx_coteries_invitations_coterie ON coteries_invitations(coterie_id);

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

-- maps.source_coterie_id references coteries, but maps is created before coteries.
ALTER TABLE maps ADD CONSTRAINT fk_maps_source_coterie
    FOREIGN KEY (source_coterie_id) REFERENCES coteries(id);

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
        array_agg(t.display_name) FILTER (WHERE t.display_name IS NOT NULL),
        '{}'::TEXT[]
    ) AS types
FROM objects o
LEFT JOIN objects_types ot ON ot.object_id = o.id
LEFT JOIN types t ON t.id = ot.type_id
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
        (SELECT array_agg(t.display_name) FROM objects_types_overrides oto
         JOIN types t ON t.id = oto.type_id
         WHERE oto.user_id = ov.user_id AND oto.object_id = o.id),
        (SELECT array_agg(t.display_name) FROM objects_types ot
         JOIN types t ON t.id = ot.type_id
         WHERE ot.object_id = o.id),
        '{}'::TEXT[]
    ) AS types
FROM objects_overrides ov
JOIN objects o ON o.id = ov.object_id
WHERE o.is_active = TRUE;

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

CREATE TRIGGER coteries_invitations_updated_at
    BEFORE UPDATE ON coteries_invitations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- =============================================================================
-- DISSONANCE DETECTION (diff engine for coterie updates)
-- =============================================================================
-- Returns all structural differences between a user's data and their coterie
-- members' data, scoped to objects in shared maps.
--
-- Four dissonance types:
--   new_object:              member has an object (on shared maps) that I don't
--   new_connection:          member created a connection between objects I both have
--   deactivated_connection:  member deactivated a canonical connection I still see
--   career_move:             member's effective name/title/status differs from mine
--
-- Dissonances are self-correcting: if a member reverses a change, the diff
-- evaporates automatically. Dismissed dissonances are tracked in coteries_reviews.

CREATE OR REPLACE FUNCTION get_dissonances(p_user_id UUID)
RETURNS TABLE (
    dissonance_type TEXT,
    coterie_id UUID,
    coterie_name TEXT,
    source_user_id UUID,
    source_user_name TEXT,
    -- Object context (new_object + career_move)
    object_id UUID,
    object_name TEXT,
    object_class TEXT,
    -- Connection context (new_connection + deactivated_connection)
    object_a_id UUID,
    object_a_name TEXT,
    object_b_id UUID,
    object_b_name TEXT,
    role_a_name TEXT,
    role_b_name TEXT,
    -- Career move context
    their_name TEXT,
    your_name TEXT,
    their_title TEXT,
    your_title TEXT,
    their_status TEXT,
    your_status TEXT,
    -- Type change context
    their_types TEXT[],
    your_types TEXT[],
    -- Dismissal tracking (maps to coteries_reviews)
    ref_type TEXT,
    ref_id UUID,
    is_dismissed BOOLEAN
)
LANGUAGE sql STABLE
AS $$
    WITH user_coteries AS (
        SELECT cm.coterie_id, c.name AS coterie_name
        FROM coteries_members cm
        JOIN coteries c ON c.id = cm.coterie_id
        WHERE cm.user_id = p_user_id AND c.is_active = TRUE
    ),
    co_members AS (
        SELECT uc.coterie_id, uc.coterie_name, cm.user_id AS member_id, p.display_name AS member_name
        FROM user_coteries uc
        JOIN coteries_members cm ON cm.coterie_id = uc.coterie_id
        JOIN profiles p ON p.user_id = cm.user_id
        WHERE cm.user_id != p_user_id
    ),
    -- Shared scope: all objects in maps linked to each coterie
    -- Includes both coteries_maps (sender's shared maps) and
    -- source_coterie_id maps (recipient's aggregated maps)
    shared_objects AS (
        SELECT DISTINCT sub.coterie_id, mo.object_ref_id AS object_id
        FROM (
            SELECT coterie_id, map_id FROM coteries_maps
            UNION ALL
            SELECT source_coterie_id, id FROM maps WHERE source_coterie_id IS NOT NULL
        ) sub
        JOIN maps_objects mo ON mo.map_id = sub.map_id
        WHERE sub.coterie_id IN (SELECT coterie_id FROM user_coteries)
    ),
    my_object_ids AS (
        SELECT object_id FROM objects_overrides WHERE user_id = p_user_id
    )

    -- 1. NEW OBJECTS: member has a shared-scope object I don't have on my landscape
    SELECT DISTINCT ON (com.coterie_id, com.member_id, so.object_id)
        'new_object'::TEXT,
        com.coterie_id, com.coterie_name, com.member_id, com.member_name,
        so.object_id,
        COALESCE(m_ov.name, o.name)::TEXT,
        o.class::TEXT,
        NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT[], NULL::TEXT[],
        'object_override'::TEXT,
        m_ov.id,
        EXISTS(
            SELECT 1 FROM coteries_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'object_override' AND cr.ref_id = m_ov.id
        )
    FROM co_members com
    JOIN shared_objects so ON so.coterie_id = com.coterie_id
    JOIN objects o ON o.id = so.object_id AND o.is_active = TRUE
    JOIN objects_overrides m_ov ON m_ov.user_id = com.member_id AND m_ov.object_id = so.object_id
    WHERE so.object_id NOT IN (SELECT object_id FROM my_object_ids)
    AND o.class IN (SELECT id FROM classes WHERE landscape_visible = TRUE)

    UNION ALL

    -- 2. NEW CONNECTIONS: member created a connection between two objects I have
    SELECT DISTINCT ON (com.coterie_id, com.member_id, m_co.id)
        'new_connection'::TEXT,
        com.coterie_id, com.coterie_name, com.member_id, com.member_name,
        NULL::UUID, NULL::TEXT, NULL::TEXT,
        m_co.object_a_id,
        COALESCE(u_ov_a.name, oa.name)::TEXT,
        m_co.object_b_id,
        COALESCE(u_ov_b.name, ob.name)::TEXT,
        ra.display_name::TEXT,
        rb.display_name::TEXT,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT[], NULL::TEXT[],
        'connection_override'::TEXT,
        m_co.id,
        EXISTS(
            SELECT 1 FROM coteries_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'connection_override' AND cr.ref_id = m_co.id
        )
    FROM co_members com
    JOIN connections_overrides m_co ON m_co.user_id = com.member_id
        AND m_co.connection_id IS NULL
        AND m_co.deactivated = FALSE
    JOIN shared_objects so_a ON so_a.coterie_id = com.coterie_id AND so_a.object_id = m_co.object_a_id
    JOIN shared_objects so_b ON so_b.coterie_id = com.coterie_id AND so_b.object_id = m_co.object_b_id
    JOIN my_object_ids mo_a ON mo_a.object_id = m_co.object_a_id
    JOIN my_object_ids mo_b ON mo_b.object_id = m_co.object_b_id
    JOIN objects oa ON oa.id = m_co.object_a_id
    JOIN objects ob ON ob.id = m_co.object_b_id
    LEFT JOIN objects_overrides u_ov_a ON u_ov_a.user_id = p_user_id AND u_ov_a.object_id = m_co.object_a_id
    LEFT JOIN objects_overrides u_ov_b ON u_ov_b.user_id = p_user_id AND u_ov_b.object_id = m_co.object_b_id
    LEFT JOIN roles ra ON ra.id = m_co.role_a
    LEFT JOIN roles rb ON rb.id = m_co.role_b
    WHERE NOT EXISTS (
        SELECT 1 FROM connections_overrides my_co
        WHERE my_co.user_id = p_user_id
        AND my_co.connection_id IS NULL
        AND (
            (my_co.object_a_id = m_co.object_a_id AND my_co.object_b_id = m_co.object_b_id)
            OR (my_co.object_a_id = m_co.object_b_id AND my_co.object_b_id = m_co.object_a_id)
        )
    )

    UNION ALL

    -- 3. DEACTIVATED CONNECTIONS: member says a canonical connection is dead
    SELECT DISTINCT ON (com.coterie_id, com.member_id, c.id)
        'deactivated_connection'::TEXT,
        com.coterie_id, com.coterie_name, com.member_id, com.member_name,
        NULL::UUID, NULL::TEXT, NULL::TEXT,
        c.object_a_id,
        COALESCE(u_ov_a.name, oa.name)::TEXT,
        c.object_b_id,
        COALESCE(u_ov_b.name, ob.name)::TEXT,
        ra.display_name::TEXT,
        rb.display_name::TEXT,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT[], NULL::TEXT[],
        'connection_override'::TEXT,
        m_deact.id,
        EXISTS(
            SELECT 1 FROM coteries_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'connection_override' AND cr.ref_id = m_deact.id
        )
    FROM co_members com
    JOIN connections_overrides m_deact ON m_deact.user_id = com.member_id
        AND m_deact.connection_id IS NOT NULL
        AND m_deact.deactivated = TRUE
    JOIN connections c ON c.id = m_deact.connection_id AND c.is_active = TRUE
    JOIN shared_objects so_a ON so_a.coterie_id = com.coterie_id AND so_a.object_id = c.object_a_id
    JOIN shared_objects so_b ON so_b.coterie_id = com.coterie_id AND so_b.object_id = c.object_b_id
    JOIN objects oa ON oa.id = c.object_a_id
    JOIN objects ob ON ob.id = c.object_b_id
    LEFT JOIN objects_overrides u_ov_a ON u_ov_a.user_id = p_user_id AND u_ov_a.object_id = c.object_a_id
    LEFT JOIN objects_overrides u_ov_b ON u_ov_b.user_id = p_user_id AND u_ov_b.object_id = c.object_b_id
    LEFT JOIN roles ra ON ra.id = c.role_a
    LEFT JOIN roles rb ON rb.id = c.role_b
    WHERE NOT EXISTS (
        SELECT 1 FROM connections_overrides my_deact
        WHERE my_deact.user_id = p_user_id
        AND my_deact.connection_id = m_deact.connection_id
        AND my_deact.deactivated = TRUE
    )

    UNION ALL

    -- 4. CAREER MOVES: member's effective name/title/status differs from mine
    SELECT DISTINCT ON (com.coterie_id, com.member_id, so.object_id)
        'career_move'::TEXT,
        com.coterie_id, com.coterie_name, com.member_id, com.member_name,
        so.object_id,
        COALESCE(u_ov.name, o.name)::TEXT,
        o.class::TEXT,
        NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        COALESCE(m_ov.name, o.name)::TEXT,
        COALESCE(u_ov.name, o.name)::TEXT,
        COALESCE(m_ov.title, o.title)::TEXT,
        COALESCE(u_ov.title, o.title)::TEXT,
        COALESCE(m_ov.status, o.status)::TEXT,
        COALESCE(u_ov.status, o.status)::TEXT,
        NULL::TEXT[], NULL::TEXT[],
        'object_override'::TEXT,
        m_ov.id,
        EXISTS(
            SELECT 1 FROM coteries_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'object_override' AND cr.ref_id = m_ov.id
        )
    FROM co_members com
    JOIN shared_objects so ON so.coterie_id = com.coterie_id
    JOIN objects o ON o.id = so.object_id AND o.is_active = TRUE
    JOIN objects_overrides m_ov ON m_ov.user_id = com.member_id AND m_ov.object_id = so.object_id
    JOIN objects_overrides u_ov ON u_ov.user_id = p_user_id AND u_ov.object_id = so.object_id
    WHERE o.class IN (SELECT id FROM classes WHERE landscape_visible = TRUE)
    AND (
        COALESCE(m_ov.name, o.name) IS DISTINCT FROM COALESCE(u_ov.name, o.name)
        OR COALESCE(m_ov.title, o.title) IS DISTINCT FROM COALESCE(u_ov.title, o.title)
        OR COALESCE(m_ov.status, o.status) IS DISTINCT FROM COALESCE(u_ov.status, o.status)
    )

    UNION ALL

    -- 5. TYPE CHANGES: member's effective types differ from mine
    SELECT DISTINCT ON (com.coterie_id, com.member_id, so.object_id)
        'type_change'::TEXT,
        com.coterie_id, com.coterie_name, com.member_id, com.member_name,
        so.object_id,
        COALESCE(u_ov.name, o.name)::TEXT,
        o.class::TEXT,
        NULL::UUID, NULL::TEXT, NULL::UUID, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT, NULL::TEXT,
        -- Their effective types
        COALESCE(
            (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types_overrides oto
             JOIN types t ON t.id = oto.type_id
             WHERE oto.user_id = com.member_id AND oto.object_id = so.object_id),
            (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types ot
             JOIN types t ON t.id = ot.type_id
             WHERE ot.object_id = so.object_id),
            '{}'::TEXT[]
        ),
        -- Your effective types
        COALESCE(
            (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types_overrides oto
             JOIN types t ON t.id = oto.type_id
             WHERE oto.user_id = p_user_id AND oto.object_id = so.object_id),
            (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types ot
             JOIN types t ON t.id = ot.type_id
             WHERE ot.object_id = so.object_id),
            '{}'::TEXT[]
        ),
        'object_override'::TEXT,
        m_ov.id,
        EXISTS(
            SELECT 1 FROM coteries_reviews cr
            WHERE cr.user_id = p_user_id AND cr.source_user_id = com.member_id
            AND cr.ref_type = 'object_override' AND cr.ref_id = m_ov.id
        )
    FROM co_members com
    JOIN shared_objects so ON so.coterie_id = com.coterie_id
    JOIN objects o ON o.id = so.object_id AND o.is_active = TRUE
    JOIN objects_overrides m_ov ON m_ov.user_id = com.member_id AND m_ov.object_id = so.object_id
    JOIN objects_overrides u_ov ON u_ov.user_id = p_user_id AND u_ov.object_id = so.object_id
    WHERE o.class IN (SELECT id FROM classes WHERE landscape_visible = TRUE)
    AND COALESCE(
        (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types_overrides oto
         JOIN types t ON t.id = oto.type_id
         WHERE oto.user_id = com.member_id AND oto.object_id = so.object_id),
        (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types ot
         JOIN types t ON t.id = ot.type_id
         WHERE ot.object_id = so.object_id),
        '{}'::TEXT[]
    ) IS DISTINCT FROM COALESCE(
        (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types_overrides oto
         JOIN types t ON t.id = oto.type_id
         WHERE oto.user_id = p_user_id AND oto.object_id = so.object_id),
        (SELECT array_agg(t.display_name ORDER BY t.display_name) FROM objects_types ot
         JOIN types t ON t.id = ot.type_id
         WHERE ot.object_id = so.object_id),
        '{}'::TEXT[]
    )
$$;

-- =============================================================================
-- REALTIME (live updates for coterie dissonances + invitations)
-- =============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE objects_overrides;
ALTER PUBLICATION supabase_realtime ADD TABLE connections_overrides;
ALTER PUBLICATION supabase_realtime ADD TABLE coteries_invitations;

-- RLS must be enabled for Realtime postgres_changes to fire.
-- Permissive policies for now — proper RLS deferred until deploy.
ALTER TABLE objects_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "objects_overrides_all" ON objects_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE connections_overrides ENABLE ROW LEVEL SECURITY;
CREATE POLICY "connections_overrides_all" ON connections_overrides FOR ALL TO authenticated USING (true) WITH CHECK (true);

ALTER TABLE coteries_invitations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "coteries_invitations_all" ON coteries_invitations FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Public invite lookup — callable by anon (no table-level anon policy needed)
CREATE OR REPLACE FUNCTION public.get_invitation_by_token(invite_token UUID)
RETURNS TABLE(
  invitation_id UUID,
  coterie_id UUID,
  status TEXT,
  email TEXT,
  coterie_name TEXT,
  sender_name TEXT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    ci.id,
    ci.coterie_id,
    ci.status::text,
    ci.email,
    c.name,
    p.display_name
  FROM coteries_invitations ci
  JOIN coteries c ON c.id = ci.coterie_id
  JOIN profiles p ON p.user_id = ci.invited_by
  WHERE ci.token = invite_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_invitation_by_token(UUID) TO anon, authenticated;

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
