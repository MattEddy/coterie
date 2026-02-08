-- Seed data for Coterie

-- =============================================================================
-- TEST USERS (local dev only)
-- =============================================================================
-- Password for both: password123
-- The auto-create profile trigger will create profiles automatically.

INSERT INTO auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new, is_sso_user, raw_app_meta_data, raw_user_meta_data)
VALUES
    ('cccc1111-1111-1111-1111-111111111111', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'matt@test.com', crypt('password123', gen_salt('bf')), NOW(), NOW(), NOW(), '', '', '', '', false, '{"provider": "email", "providers": ["email"]}', '{}'),
    ('cccc2222-2222-2222-2222-222222222222', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'billy@test.com', crypt('password123', gen_salt('bf')), NOW(), NOW(), NOW(), '', '', '', '', false, '{"provider": "email", "providers": ["email"]}', '{}');

-- Auth identities (required by newer Supabase for sign-in)
INSERT INTO auth.identities (id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at)
VALUES
    (gen_random_uuid(), 'cccc1111-1111-1111-1111-111111111111', 'matt@test.com', 'email', '{"sub": "cccc1111-1111-1111-1111-111111111111", "email": "matt@test.com"}', NOW(), NOW(), NOW()),
    (gen_random_uuid(), 'cccc2222-2222-2222-2222-222222222222', 'billy@test.com', 'email', '{"sub": "cccc2222-2222-2222-2222-222222222222", "email": "billy@test.com"}', NOW(), NOW(), NOW());

-- Set display names on profiles (trigger created them with just user_id)
UPDATE profiles SET display_name = 'Matt', industry_id = 'entertainment' WHERE user_id = 'cccc1111-1111-1111-1111-111111111111';
UPDATE profiles SET display_name = 'Billy', industry_id = 'entertainment' WHERE user_id = 'cccc2222-2222-2222-2222-222222222222';

-- Sample Companies (is_canon = true for platform-seeded data)
INSERT INTO objects (id, class, name, title, website, is_canon) VALUES
    ('11111111-1111-1111-1111-111111111111', 'company', 'Disney', 'Major Studio & Streamer', 'disney.com', true),
    ('22222222-2222-2222-2222-222222222222', 'company', 'Warner Bros', 'Major Studio', 'warnerbros.com', true),
    ('33333333-3333-3333-3333-333333333333', 'company', 'Netflix', 'Streamer & Studio', 'netflix.com', true),
    ('44444444-4444-4444-4444-444444444444', 'company', 'CAA', 'Talent Agency', 'caa.com', true),
    ('55555555-5555-5555-5555-555555555555', 'company', 'Bad Robot', 'Production Company', 'badrobot.com', true);

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
INSERT INTO objects (id, class, name, title, status, is_canon) VALUES
    ('aaaa1111-1111-1111-1111-111111111111', 'person', 'Alan Bergman', 'Co-Chairman, Disney Entertainment', 'active', true),
    ('aaaa2222-2222-2222-2222-222222222222', 'person', 'Dana Walden', 'Co-Chairman, Disney Entertainment', 'active', true),
    ('aaaa3333-3333-3333-3333-333333333333', 'person', 'J.J. Abrams', 'Founder, Bad Robot', 'active', true),
    ('aaaa4444-4444-4444-4444-444444444444', 'person', 'Bryan Lourd', 'Co-Chairman, CAA', 'active', true);

-- Assign types to people
INSERT INTO objects_types (object_id, type_id, is_primary) VALUES
    ('aaaa1111-1111-1111-1111-111111111111', 'executive', true),
    ('aaaa2222-2222-2222-2222-222222222222', 'executive', true),
    ('aaaa3333-3333-3333-3333-333333333333', 'producer', true),
    ('aaaa3333-3333-3333-3333-333333333333', 'creative', false),
    ('aaaa4444-4444-4444-4444-444444444444', 'agent', true),
    ('aaaa4444-4444-4444-4444-444444444444', 'executive', false);

-- Sample Projects
INSERT INTO objects (id, class, name, title, status, is_canon) VALUES
    ('bbbb1111-1111-1111-1111-111111111111', 'project', 'Avatar 3', 'The next chapter in the Avatar saga', 'production', true),
    ('bbbb2222-2222-2222-2222-222222222222', 'project', 'Stranger Things 5', 'Final season of the hit series', 'production', true);

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

-- =============================================================================
-- MATT'S LANDSCAPE (objects_overrides with positions)
-- =============================================================================
-- Layout: studios top-left, people center, agencies right, projects bottom

INSERT INTO objects_overrides (user_id, object_id, map_x, map_y, shared_notes) VALUES
    -- Companies
    ('cccc1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 0, 0, 'Great relationships here'),
    ('cccc1111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 300, 0, NULL),
    ('cccc1111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 600, 0, 'Expanding original film slate'),
    ('cccc1111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 900, 100, NULL),
    ('cccc1111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 300, 250, NULL),
    -- People
    ('cccc1111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111', 50, 200, 'Met at Sundance 2025'),
    ('cccc1111-1111-1111-1111-111111111111', 'aaaa2222-2222-2222-2222-222222222222', -100, 200, NULL),
    ('cccc1111-1111-1111-1111-111111111111', 'aaaa3333-3333-3333-3333-333333333333', 450, 400, 'Very engaged on sci-fi projects'),
    ('cccc1111-1111-1111-1111-111111111111', 'aaaa4444-4444-4444-4444-444444444444', 850, 300, NULL),
    -- Projects
    ('cccc1111-1111-1111-1111-111111111111', 'bbbb1111-1111-1111-1111-111111111111', -50, 400, NULL),
    ('cccc1111-1111-1111-1111-111111111111', 'bbbb2222-2222-2222-2222-222222222222', 650, 250, NULL);
