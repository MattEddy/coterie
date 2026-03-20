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
UPDATE profiles SET display_name = 'Matt', sector_id = 'entertainment' WHERE user_id = 'cccc1111-1111-1111-1111-111111111111';
UPDATE profiles SET display_name = 'Billy', sector_id = 'entertainment' WHERE user_id = 'cccc2222-2222-2222-2222-222222222222';

-- Sample Companies (is_canon = true for platform-seeded data)
-- Contact info lives in data.contacts as typed/labeled entries
INSERT INTO objects (id, class, name, title, data, is_canon) VALUES
    ('11111111-1111-1111-1111-111111111111', 'company', 'Disney', 'Major Studio & Streamer', '{"contacts": [{"type": "url", "label": "Website", "value": "disney.com"}]}', true),
    ('22222222-2222-2222-2222-222222222222', 'company', 'Warner Bros', 'Major Studio', '{"contacts": [{"type": "url", "label": "Website", "value": "warnerbros.com"}]}', true),
    ('33333333-3333-3333-3333-333333333333', 'company', 'Netflix', 'Streamer & Studio', '{"contacts": [{"type": "url", "label": "Website", "value": "netflix.com"}]}', true),
    ('44444444-4444-4444-4444-444444444444', 'company', 'CAA', 'Talent Agency', '{"contacts": [{"type": "url", "label": "Website", "value": "caa.com"}]}', true),
    ('55555555-5555-5555-5555-555555555555', 'company', 'Bad Robot', 'Production Company', '{"contacts": [{"type": "url", "label": "Website", "value": "badrobot.com"}]}', true);

-- Assign types to companies — use individual INSERTs with subqueries (UUID type IDs)
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT '11111111-1111-1111-1111-111111111111', id, true FROM types WHERE display_name = 'Studio';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT '11111111-1111-1111-1111-111111111111', id, false FROM types WHERE display_name = 'Parent Company';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT '11111111-1111-1111-1111-111111111111', id, false FROM types WHERE display_name = 'Streamer';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT '22222222-2222-2222-2222-222222222222', id, true FROM types WHERE display_name = 'Studio';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT '33333333-3333-3333-3333-333333333333', id, true FROM types WHERE display_name = 'Streamer';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT '33333333-3333-3333-3333-333333333333', id, false FROM types WHERE display_name = 'Studio';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT '44444444-4444-4444-4444-444444444444', id, true FROM types WHERE display_name = 'Agency';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT '55555555-5555-5555-5555-555555555555', id, true FROM types WHERE display_name = 'Production Company';

-- Sample People
INSERT INTO objects (id, class, name, title, status, is_canon) VALUES
    ('aaaa1111-1111-1111-1111-111111111111', 'person', 'Alan Bergman', 'Co-Chairman, Disney Entertainment', 'active', true),
    ('aaaa2222-2222-2222-2222-222222222222', 'person', 'Dana Walden', 'Co-Chairman, Disney Entertainment', 'active', true),
    ('aaaa3333-3333-3333-3333-333333333333', 'person', 'J.J. Abrams', 'Founder, Bad Robot', 'active', true),
    ('aaaa4444-4444-4444-4444-444444444444', 'person', 'Bryan Lourd', 'Co-Chairman, CAA', 'active', true);

-- Assign types to people
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT 'aaaa1111-1111-1111-1111-111111111111', id, true FROM types WHERE display_name = 'Executive';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT 'aaaa2222-2222-2222-2222-222222222222', id, true FROM types WHERE display_name = 'Executive';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT 'aaaa3333-3333-3333-3333-333333333333', id, true FROM types WHERE display_name = 'Producer' AND class = 'person';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT 'aaaa3333-3333-3333-3333-333333333333', id, false FROM types WHERE display_name = 'Creative';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT 'aaaa4444-4444-4444-4444-444444444444', id, true FROM types WHERE display_name = 'Agent';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT 'aaaa4444-4444-4444-4444-444444444444', id, false FROM types WHERE display_name = 'Executive';

-- Sample Projects
INSERT INTO objects (id, class, name, title, status, is_canon) VALUES
    ('bbbb1111-1111-1111-1111-111111111111', 'project', 'Avatar 3', 'The next chapter in the Avatar saga', 'production', true),
    ('bbbb2222-2222-2222-2222-222222222222', 'project', 'Stranger Things 5', 'Final season of the hit series', 'production', true);

INSERT INTO objects_types (object_id, type_id, is_primary) SELECT 'bbbb1111-1111-1111-1111-111111111111', id, true FROM types WHERE display_name = 'Feature';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT 'bbbb2222-2222-2222-2222-222222222222', id, true FROM types WHERE display_name = 'TV Series';

-- Sample Events (user-created, not canonical — skeleton rows, data lives in overrides)
INSERT INTO objects (id, class, is_canon, created_by) VALUES
    ('eeee1111-1111-1111-1111-111111111111', 'event', false, 'cccc1111-1111-1111-1111-111111111111'),
    ('eeee2222-2222-2222-2222-222222222222', 'event', false, 'cccc1111-1111-1111-1111-111111111111');

INSERT INTO objects_types (object_id, type_id, is_primary) SELECT 'eeee1111-1111-1111-1111-111111111111', id, true FROM types WHERE display_name = 'Meeting';
INSERT INTO objects_types (object_id, type_id, is_primary) SELECT 'eeee2222-2222-2222-2222-222222222222', id, true FROM types WHERE display_name = 'Meeting';

-- Connections (direction-agnostic with role UUIDs looked up by display_name)
INSERT INTO connections (object_a_id, object_b_id, role_a, role_b) VALUES
    ('aaaa1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', (SELECT id FROM roles WHERE display_name = 'Employee'), (SELECT id FROM roles WHERE display_name = 'Employer')),
    ('aaaa2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', (SELECT id FROM roles WHERE display_name = 'Employee'), (SELECT id FROM roles WHERE display_name = 'Employer')),
    ('aaaa3333-3333-3333-3333-333333333333', '55555555-5555-5555-5555-555555555555', (SELECT id FROM roles WHERE display_name = 'Employee'), (SELECT id FROM roles WHERE display_name = 'Employer')),
    ('aaaa4444-4444-4444-4444-444444444444', '44444444-4444-4444-4444-444444444444', (SELECT id FROM roles WHERE display_name = 'Employee'), (SELECT id FROM roles WHERE display_name = 'Employer')),
    ('55555555-5555-5555-5555-555555555555', '22222222-2222-2222-2222-222222222222', (SELECT id FROM roles WHERE display_name = 'Deal Partner'), (SELECT id FROM roles WHERE display_name = 'Deal Partner')),
    ('11111111-1111-1111-1111-111111111111', 'bbbb1111-1111-1111-1111-111111111111', (SELECT id FROM roles WHERE display_name = 'Producer'), (SELECT id FROM roles WHERE display_name = 'Production')),
    ('33333333-3333-3333-3333-333333333333', 'bbbb2222-2222-2222-2222-222222222222', (SELECT id FROM roles WHERE display_name = 'Producer'), (SELECT id FROM roles WHERE display_name = 'Production')),
    ('44444444-4444-4444-4444-444444444444', 'aaaa3333-3333-3333-3333-333333333333', (SELECT id FROM roles WHERE display_name = 'Rep'), (SELECT id FROM roles WHERE display_name = 'Client')),
    ('aaaa1111-1111-1111-1111-111111111111', 'eeee1111-1111-1111-1111-111111111111', (SELECT id FROM roles WHERE display_name = 'Participant'), NULL),
    ('eeee2222-2222-2222-2222-222222222222', 'bbbb1111-1111-1111-1111-111111111111', NULL, (SELECT id FROM roles WHERE display_name = 'Subject')),
    ('eeee2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', NULL, (SELECT id FROM roles WHERE display_name = 'Venue'));

-- =============================================================================
-- MATT'S LANDSCAPE (objects_overrides with positions)
-- =============================================================================
-- Layout: studios top-left, people center, agencies right

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
    -- Projects (no map position — off-landscape, shown in detail panels)
    ('cccc1111-1111-1111-1111-111111111111', 'bbbb1111-1111-1111-1111-111111111111', NULL, NULL, NULL),
    ('cccc1111-1111-1111-1111-111111111111', 'bbbb2222-2222-2222-2222-222222222222', NULL, NULL, NULL),
    -- Events (no map position — off-landscape, data lives in overrides per Option B)
    ('cccc1111-1111-1111-1111-111111111111', 'eeee1111-1111-1111-1111-111111111111', NULL, NULL, NULL),
    ('cccc1111-1111-1111-1111-111111111111', 'eeee2222-2222-2222-2222-222222222222', NULL, NULL, NULL);

-- Event data in overrides (Option B: user-created object data lives in overrides)
UPDATE objects_overrides SET
    name = 'Sundance Meeting',
    title = 'Ran into Alan Bergman at a screening',
    event_date = '2025-01-25'
WHERE user_id = 'cccc1111-1111-1111-1111-111111111111'
  AND object_id = 'eeee1111-1111-1111-1111-111111111111';

UPDATE objects_overrides SET
    name = 'Avatar 3 Development Update',
    title = 'Discussed production timeline with Disney team',
    event_date = '2025-03-10'
WHERE user_id = 'cccc1111-1111-1111-1111-111111111111'
  AND object_id = 'eeee2222-2222-2222-2222-222222222222';
