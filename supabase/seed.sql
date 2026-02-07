-- Seed data for Coterie

-- Sample Companies
INSERT INTO objects (id, class, name, title, website) VALUES
    ('11111111-1111-1111-1111-111111111111', 'company', 'Disney', 'Major Studio & Streamer', 'disney.com'),
    ('22222222-2222-2222-2222-222222222222', 'company', 'Warner Bros', 'Major Studio', 'warnerbros.com'),
    ('33333333-3333-3333-3333-333333333333', 'company', 'Netflix', 'Streamer & Studio', 'netflix.com'),
    ('44444444-4444-4444-4444-444444444444', 'company', 'CAA', 'Talent Agency', 'caa.com'),
    ('55555555-5555-5555-5555-555555555555', 'company', 'Bad Robot', 'Production Company', 'badrobot.com');

-- Assign types to companies (can have multiple!)
INSERT INTO objects_types (object_id, type_id, is_primary) VALUES
    -- Disney is a studio and parent company
    ('11111111-1111-1111-1111-111111111111', 'studio', true),
    ('11111111-1111-1111-1111-111111111111', 'parent_company', false),
    ('11111111-1111-1111-1111-111111111111', 'streamer', false),
    -- Warner Bros is a studio
    ('22222222-2222-2222-2222-222222222222', 'studio', true),
    -- Netflix is a streamer and studio
    ('33333333-3333-3333-3333-333333333333', 'streamer', true),
    ('33333333-3333-3333-3333-333333333333', 'studio', false),
    -- CAA is an agency
    ('44444444-4444-4444-4444-444444444444', 'agency', true),
    -- Bad Robot is a production company
    ('55555555-5555-5555-5555-555555555555', 'production_company', true);

-- Sample People
INSERT INTO objects (id, class, name, title, status) VALUES
    ('aaaa1111-1111-1111-1111-111111111111', 'person', 'Alan Bergman', 'Co-Chairman, Disney Entertainment', 'active'),
    ('aaaa2222-2222-2222-2222-222222222222', 'person', 'Dana Walden', 'Co-Chairman, Disney Entertainment', 'active'),
    ('aaaa3333-3333-3333-3333-333333333333', 'person', 'J.J. Abrams', 'Founder, Bad Robot', 'active'),
    ('aaaa4444-4444-4444-4444-444444444444', 'person', 'Bryan Lourd', 'Co-Chairman, CAA', 'active');

-- Assign types to people
INSERT INTO objects_types (object_id, type_id, is_primary) VALUES
    ('aaaa1111-1111-1111-1111-111111111111', 'executive', true),
    ('aaaa2222-2222-2222-2222-222222222222', 'executive', true),
    ('aaaa3333-3333-3333-3333-333333333333', 'producer', true),
    ('aaaa3333-3333-3333-3333-333333333333', 'creative', false),
    ('aaaa4444-4444-4444-4444-444444444444', 'agent', true),
    ('aaaa4444-4444-4444-4444-444444444444', 'executive', false);

-- Sample Projects
INSERT INTO objects (id, class, name, title, status) VALUES
    ('bbbb1111-1111-1111-1111-111111111111', 'project', 'Avatar 3', 'The next chapter in the Avatar saga', 'production'),
    ('bbbb2222-2222-2222-2222-222222222222', 'project', 'Stranger Things 5', 'Final season of the hit series', 'production');

-- Assign types to projects
INSERT INTO objects_types (object_id, type_id, is_primary) VALUES
    ('bbbb1111-1111-1111-1111-111111111111', 'feature', true),
    ('bbbb2222-2222-2222-2222-222222222222', 'tv_series', true);

-- Connections
INSERT INTO connections (source_id, target_id, type, data) VALUES
    -- People employed by companies
    ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 'employed_by', '{}'),
    ('aaaa2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 'employed_by', '{}'),
    ('aaaa3333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', 'employed_by', '{}'),
    ('aaaa4444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', 'employed_by', '{}'),
    -- Bad Robot has deal at Warner Bros
    ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', 'has_deal_at', '{}'),
    -- Disney produces Avatar 3
    ('11111111-1111-1111-1111-111111111111', 'bbbb1111-1111-1111-1111-111111111111', 'produces', '{}'),
    -- Netflix produces Stranger Things
    ('33333333-3333-3333-3333-333333333333', 'bbbb2222-2222-2222-2222-222222222222', 'produces', '{}'),
    -- CAA represents J.J. Abrams
    ('44444444-4444-4444-4444-444444444444', 'aaaa3333-3333-3333-3333-333333333333', 'represents', '{}');
