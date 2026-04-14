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

-- Sample Orgs (is_canon = true for platform-seeded data)
-- Contact info lives in data.contacts as typed/labeled entries
INSERT INTO objects (id, class, name, title, data, is_canon) VALUES
    ('11111111-1111-1111-1111-111111111111', 'org', 'Disney', 'Major Studio & Streamer', '{"contacts": [{"type": "url", "label": "Website", "value": "disney.com"}]}', true),
    ('22222222-2222-2222-2222-222222222222', 'org', 'Warner Bros', 'Major Studio', '{"contacts": [{"type": "url", "label": "Website", "value": "warnerbros.com"}]}', true),
    ('33333333-3333-3333-3333-333333333333', 'org', 'Netflix', 'Streamer & Studio', '{"contacts": [{"type": "url", "label": "Website", "value": "netflix.com"}]}', true),
    ('44444444-4444-4444-4444-444444444444', 'org', 'CAA', 'Talent Agency', '{"contacts": [{"type": "url", "label": "Website", "value": "caa.com"}]}', true),
    ('55555555-5555-5555-5555-555555555555', 'org', 'Bad Robot', 'Production Company', '{"contacts": [{"type": "url", "label": "Website", "value": "badrobot.com"}]}', true);

-- Assign types to orgs — use individual INSERTs with subqueries (UUID type IDs)
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

INSERT INTO objects_overrides (user_id, object_id, map_x, map_y) VALUES
    -- Orgs
    ('cccc1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', 0, 0),
    ('cccc1111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222', 300, 0),
    ('cccc1111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333', 600, 0),
    ('cccc1111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444', 900, 100),
    ('cccc1111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555', 300, 250),
    -- People
    ('cccc1111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111', 50, 200),
    ('cccc1111-1111-1111-1111-111111111111', 'aaaa2222-2222-2222-2222-222222222222', -100, 200),
    ('cccc1111-1111-1111-1111-111111111111', 'aaaa3333-3333-3333-3333-333333333333', 450, 400),
    ('cccc1111-1111-1111-1111-111111111111', 'aaaa4444-4444-4444-4444-444444444444', 850, 300),
    -- Projects (no map position — off-landscape, shown in detail panels)
    ('cccc1111-1111-1111-1111-111111111111', 'bbbb1111-1111-1111-1111-111111111111', NULL, NULL),
    ('cccc1111-1111-1111-1111-111111111111', 'bbbb2222-2222-2222-2222-222222222222', NULL, NULL),
    -- Events (no map position — off-landscape, data lives in overrides per Option B)
    ('cccc1111-1111-1111-1111-111111111111', 'eeee1111-1111-1111-1111-111111111111', NULL, NULL),
    ('cccc1111-1111-1111-1111-111111111111', 'eeee2222-2222-2222-2222-222222222222', NULL, NULL);

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

-- =============================================================================
-- COTERIE SCENARIO (dissonance test data)
-- =============================================================================
-- Sets up a "Hollywood Tracking" coterie between Matt and Billy.
-- Billy has divergent data that creates all five dissonance types:
--   1. new_object:              Billy added Zack Van Amburg (Matt doesn't have him)
--   2. new_connection:          Billy connected J.J. Abrams ↔ Netflix (Matt hasn't)
--   3. deactivated_connection:  Billy says J.J. Abrams left Bad Robot
--   4. career_move:             Billy updated Alan Bergman's title
--   5. type_change:             Billy says Dana Walden is a Producer (not just Executive)

-- Billy's landscape (overlaps with Matt on most canonical objects)
INSERT INTO objects_overrides (user_id, object_id, map_x, map_y) VALUES
    ('cccc2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111', 100, 50),   -- Disney
    ('cccc2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222', 400, 50),   -- Warner Bros
    ('cccc2222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333', 700, 50),   -- Netflix
    ('cccc2222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444', 1000, 100), -- CAA
    ('cccc2222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555', 400, 250),  -- Bad Robot
    ('cccc2222-2222-2222-2222-222222222222', 'aaaa1111-1111-1111-1111-111111111111', 150, 250),  -- Alan Bergman
    ('cccc2222-2222-2222-2222-222222222222', 'aaaa2222-2222-2222-2222-222222222222', -50, 250),  -- Dana Walden
    ('cccc2222-2222-2222-2222-222222222222', 'aaaa3333-3333-3333-3333-333333333333', 550, 400),  -- J.J. Abrams
    ('cccc2222-2222-2222-2222-222222222222', 'aaaa4444-4444-4444-4444-444444444444', 950, 300);  -- Bryan Lourd

-- Coterie Intel: Billy has contacts and career diffs on shared objects
UPDATE objects_overrides SET
  title = 'Chairman, Disney Entertainment'
WHERE user_id = 'cccc2222-2222-2222-2222-222222222222'
  AND object_id = 'aaaa1111-1111-1111-1111-111111111111';

UPDATE objects_overrides SET
  data = '{"contacts": [{"type": "phone", "label": "Office", "value": "310-555-0199"}, {"type": "email", "label": "Asst", "value": "jj.office@badrobot.com"}]}'
WHERE user_id = 'cccc2222-2222-2222-2222-222222222222'
  AND object_id = 'aaaa3333-3333-3333-3333-333333333333';

-- Dissonance 5 (type_change): Billy says Dana Walden is also a Producer
-- Dana Walden's canonical type is just Executive. Billy overrides to Executive + Producer.
INSERT INTO objects_types_overrides (user_id, object_id, type_id, is_primary)
SELECT 'cccc2222-2222-2222-2222-222222222222', 'aaaa2222-2222-2222-2222-222222222222', id, true
FROM types WHERE display_name = 'Executive' AND class = 'person';
INSERT INTO objects_types_overrides (user_id, object_id, type_id, is_primary)
SELECT 'cccc2222-2222-2222-2222-222222222222', 'aaaa2222-2222-2222-2222-222222222222', id, false
FROM types WHERE display_name = 'Producer' AND class = 'person';

-- Dissonance 3 (deactivated_connection): Billy says J.J. Abrams left Bad Robot
INSERT INTO connections_overrides (user_id, connection_id, deactivated)
SELECT 'cccc2222-2222-2222-2222-222222222222', c.id, true
FROM connections c
WHERE c.object_a_id = 'aaaa3333-3333-3333-3333-333333333333'
  AND c.object_b_id = '55555555-5555-5555-5555-555555555555';

-- Dissonance 1 (new_object): Billy added Zack Van Amburg — Matt doesn't know him
INSERT INTO objects (id, class, is_canon, created_by) VALUES
    ('ff001111-1111-1111-1111-111111111111', 'person', false, 'cccc2222-2222-2222-2222-222222222222');
INSERT INTO objects_overrides (user_id, object_id, name, title, status, map_x, map_y)
VALUES ('cccc2222-2222-2222-2222-222222222222', 'ff001111-1111-1111-1111-111111111111',
        'Zack Van Amburg', 'Head of Video, Apple TV+', 'active', 600, 100);
INSERT INTO objects_types (object_id, type_id, is_primary)
SELECT 'ff001111-1111-1111-1111-111111111111', id, true
FROM types WHERE display_name = 'Executive' AND class = 'person';

-- Dissonance 2 (new_connection): Billy connected J.J. Abrams ↔ Netflix as Deal Partners
INSERT INTO connections_overrides (user_id, object_a_id, object_b_id, role_a, role_b)
VALUES (
    'cccc2222-2222-2222-2222-222222222222',
    'aaaa3333-3333-3333-3333-333333333333',  -- J.J. Abrams
    '33333333-3333-3333-3333-333333333333',  -- Netflix
    (SELECT id FROM roles WHERE display_name = 'Deal Partner'),
    (SELECT id FROM roles WHERE display_name = 'Deal Partner')
);

-- Matt's map shared via the coterie
INSERT INTO maps (id, name, description, user_id) VALUES
    ('aafe1111-1111-1111-1111-111111111111', 'Studio Landscape', 'Major studios and key people', 'cccc1111-1111-1111-1111-111111111111');

INSERT INTO maps_objects (map_id, object_ref_id) VALUES
    ('aafe1111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111'),  -- Disney
    ('aafe1111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222'),  -- Warner Bros
    ('aafe1111-1111-1111-1111-111111111111', '33333333-3333-3333-3333-333333333333'),  -- Netflix
    ('aafe1111-1111-1111-1111-111111111111', '44444444-4444-4444-4444-444444444444'),  -- CAA
    ('aafe1111-1111-1111-1111-111111111111', '55555555-5555-5555-5555-555555555555'),  -- Bad Robot
    ('aafe1111-1111-1111-1111-111111111111', 'aaaa1111-1111-1111-1111-111111111111'),  -- Alan Bergman
    ('aafe1111-1111-1111-1111-111111111111', 'aaaa2222-2222-2222-2222-222222222222'),  -- Dana Walden
    ('aafe1111-1111-1111-1111-111111111111', 'aaaa3333-3333-3333-3333-333333333333'),  -- J.J. Abrams
    ('aafe1111-1111-1111-1111-111111111111', 'aaaa4444-4444-4444-4444-444444444444');  -- Bryan Lourd

-- The coterie
INSERT INTO coteries (id, name, owner_id) VALUES
    ('dddd1111-1111-1111-1111-111111111111', 'Hollywood Tracking', 'cccc1111-1111-1111-1111-111111111111');

INSERT INTO coteries_members (coterie_id, user_id, role) VALUES
    ('dddd1111-1111-1111-1111-111111111111', 'cccc1111-1111-1111-1111-111111111111', 'owner'),
    ('dddd1111-1111-1111-1111-111111111111', 'cccc2222-2222-2222-2222-222222222222', 'member');

-- Link Matt's map to the coterie (owner's map gets source_coterie_id)
UPDATE maps SET source_coterie_id = 'dddd1111-1111-1111-1111-111111111111'
WHERE id = 'aafe1111-1111-1111-1111-111111111111';

-- Billy's aggregated recipient map (created on invitation acceptance)
INSERT INTO maps (id, name, user_id, source_coterie_id) VALUES
    ('aafe2222-2222-2222-2222-222222222222', 'Hollywood Tracking', 'cccc2222-2222-2222-2222-222222222222', 'dddd1111-1111-1111-1111-111111111111');

INSERT INTO maps_objects (map_id, object_ref_id) VALUES
    ('aafe2222-2222-2222-2222-222222222222', '11111111-1111-1111-1111-111111111111'),  -- Disney
    ('aafe2222-2222-2222-2222-222222222222', '22222222-2222-2222-2222-222222222222'),  -- Warner Bros
    ('aafe2222-2222-2222-2222-222222222222', '33333333-3333-3333-3333-333333333333'),  -- Netflix
    ('aafe2222-2222-2222-2222-222222222222', '44444444-4444-4444-4444-444444444444'),  -- CAA
    ('aafe2222-2222-2222-2222-222222222222', '55555555-5555-5555-5555-555555555555'),  -- Bad Robot
    ('aafe2222-2222-2222-2222-222222222222', 'aaaa1111-1111-1111-1111-111111111111'),  -- Alan Bergman
    ('aafe2222-2222-2222-2222-222222222222', 'aaaa2222-2222-2222-2222-222222222222'),  -- Dana Walden
    ('aafe2222-2222-2222-2222-222222222222', 'aaaa3333-3333-3333-3333-333333333333'),  -- J.J. Abrams
    ('aafe2222-2222-2222-2222-222222222222', 'aaaa4444-4444-4444-4444-444444444444'),  -- Bryan Lourd
    ('aafe2222-2222-2222-2222-222222222222', 'ff001111-1111-1111-1111-111111111111');  -- Zack Van Amburg (Billy's addition)
