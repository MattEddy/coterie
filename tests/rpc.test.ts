/**
 * Integration tests for Supabase RPCs.
 * Run against local Supabase (`supabase start` + `supabase db reset` first).
 *
 * Usage: npm test
 */
import { describe, it, expect, afterAll } from 'vitest'
import { supabase, MATT, BILLY, SHARED_MAP } from './supabase'

// Track objects/connections created during tests for cleanup
const createdObjectIds: string[] = []
const createdConnectionOverrideIds: string[] = []
const createdMapIds: string[] = []

afterAll(async () => {
  // Clean up in reverse dependency order
  for (const id of createdConnectionOverrideIds) {
    await supabase.from('connections_overrides').delete().eq('id', id)
  }
  for (const id of createdObjectIds) {
    await supabase.from('objects_overrides').delete().eq('object_id', id)
    await supabase.from('objects_types_overrides').delete().eq('object_id', id)
    await supabase.from('maps_objects').delete().eq('object_ref_id', id)
    await supabase.from('objects').delete().eq('id', id)
  }
  for (const id of createdMapIds) {
    await supabase.from('maps_objects').delete().eq('map_id', id)
    await supabase.from('maps').delete().eq('id', id)
  }
})

// ─── create_object ───────────────────────────────────────────────────────────

describe('create_object', () => {
  it('creates skeleton + override + returns UUID', async () => {
    const { data: objId, error } = await supabase.rpc('create_object', {
      p_user_id: MATT.id,
      p_class: 'person',
      p_name: 'Test Person',
      p_map_x: 100,
      p_map_y: 200,
    })

    expect(error).toBeNull()
    expect(objId).toBeTruthy()
    createdObjectIds.push(objId)

    // Verify skeleton row
    const { data: obj } = await supabase
      .from('objects').select('*').eq('id', objId).single()
    expect(obj.class).toBe('person')
    expect(obj.is_canon).toBe(false)
    expect(obj.created_by).toBe(MATT.id)

    // Verify override row
    const { data: ov } = await supabase
      .from('objects_overrides').select('*')
      .eq('object_id', objId).eq('user_id', MATT.id).single()
    expect(ov.name).toBe('Test Person')
    expect(ov.map_x).toBe(100)
    expect(ov.map_y).toBe(200)
  })

  it('auto-adds to maps with auto_add enabled', async () => {
    // Create a map with auto_add
    const { data: mapData } = await supabase
      .from('maps')
      .insert({ name: 'Auto Map', user_id: MATT.id, auto_add: true })
      .select('id')
      .single()
    createdMapIds.push(mapData!.id)

    const { data: objId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id,
      p_class: 'org',
      p_name: 'Auto Corp',
      p_map_x: 0,
      p_map_y: 0,
    })
    createdObjectIds.push(objId)

    // Verify it was added to the auto_add map
    const { data: moData } = await supabase
      .from('maps_objects')
      .select('object_ref_id')
      .eq('map_id', mapData!.id)
      .eq('object_ref_id', objId)
    expect(moData?.length).toBe(1)
  })
})

// ─── upsert_connection ──────────────────────────────────────────────────────

describe('upsert_connection', () => {
  it('creates a new connection with role resolution', async () => {
    // Create two objects to connect
    const { data: aId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'person', p_name: 'Person A', p_map_x: 0, p_map_y: 0,
    })
    const { data: bId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'org', p_name: 'Company B', p_map_x: 100, p_map_y: 0,
    })
    createdObjectIds.push(aId, bId)

    const { error } = await supabase.rpc('upsert_connection', {
      p_user_id: MATT.id,
      p_object_a_id: aId,
      p_object_b_id: bId,
      p_role_a_name: 'Employee',
      p_role_b_name: 'Employer',
    })
    expect(error).toBeNull()

    // Verify connection override was created
    const { data: conn } = await supabase
      .from('connections_overrides')
      .select('id, role_a, role_b')
      .eq('user_id', MATT.id)
      .eq('object_a_id', aId)
      .eq('object_b_id', bId)
      .single()
    expect(conn).toBeTruthy()
    createdConnectionOverrideIds.push(conn!.id)

    // Roles should have been resolved to UUIDs
    expect(conn!.role_a).toBeTruthy()
    expect(conn!.role_b).toBeTruthy()
  })

  it('creates new custom roles when they do not exist', async () => {
    const { data: aId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'person', p_name: 'Person C', p_map_x: 0, p_map_y: 0,
    })
    const { data: bId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'person', p_name: 'Person D', p_map_x: 100, p_map_y: 0,
    })
    createdObjectIds.push(aId, bId)

    const customRoleName = `TestRole_${Date.now()}`

    const { error } = await supabase.rpc('upsert_connection', {
      p_user_id: MATT.id,
      p_object_a_id: aId,
      p_object_b_id: bId,
      p_role_a_name: customRoleName,
      p_role_b_name: null,
    })
    expect(error).toBeNull()

    // Verify the custom role was created
    const { data: role } = await supabase
      .from('roles').select('id').eq('display_name', customRoleName).single()
    expect(role).toBeTruthy()

    // Clean up custom role
    await supabase.from('roles').delete().eq('display_name', customRoleName)
  })

  it('rejects roles shorter than 2 characters', async () => {
    const { data: aId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'person', p_name: 'Short Role A', p_map_x: 0, p_map_y: 0,
    })
    const { data: bId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'person', p_name: 'Short Role B', p_map_x: 100, p_map_y: 0,
    })
    createdObjectIds.push(aId, bId)

    await supabase.rpc('upsert_connection', {
      p_user_id: MATT.id,
      p_object_a_id: aId,
      p_object_b_id: bId,
      p_role_a_name: 'X', // too short — should be ignored
      p_role_b_name: null,
    })

    const { data: conn } = await supabase
      .from('connections_overrides')
      .select('role_a')
      .eq('user_id', MATT.id)
      .eq('object_a_id', aId)
      .single()

    // Role should be null since 'X' is too short to create
    expect(conn!.role_a).toBeNull()
  })
})

// ─── get_user_maps ──────────────────────────────────────────────────────────

describe('get_user_maps', () => {
  it('returns maps with object counts and member counts', async () => {
    const { data, error } = await supabase.rpc('get_user_maps', { p_user_id: MATT.id })

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data.length).toBeGreaterThan(0)

    const map = data[0]
    expect(map).toHaveProperty('id')
    expect(map).toHaveProperty('name')
    expect(map).toHaveProperty('object_count')
    expect(map).toHaveProperty('member_count')
    expect(map).toHaveProperty('is_admin')
  })

  it('correctly identifies admin status', async () => {
    const { data: mattMaps } = await supabase.rpc('get_user_maps', { p_user_id: MATT.id })
    const { data: billyMaps } = await supabase.rpc('get_user_maps', { p_user_id: BILLY.id })

    const mattShared = mattMaps?.find((m: any) => m.origin_map_id === SHARED_MAP.origin_map_id)
    const billyShared = billyMaps?.find((m: any) => m.origin_map_id === SHARED_MAP.origin_map_id)

    expect(mattShared?.is_admin).toBe(true)
    expect(billyShared?.is_admin).toBe(false)
  })
})

// ─── get_pending_invites ────────────────────────────────────────────────────

describe('get_pending_invites', () => {
  it('returns empty for email with no invites', async () => {
    const { data, error } = await supabase.rpc('get_pending_invites', {
      p_email: 'nobody@test.com',
    })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

// ─── get_connected_items ────────────────────────────────────────────────────

describe('get_connected_items', () => {
  it('returns connected items with merged override data', async () => {
    // Get a canonical person object that has connections
    const { data: objects } = await supabase
      .from('objects').select('id').eq('class', 'person').eq('is_canon', true).limit(1)

    if (!objects?.length) return // skip if no canon persons

    const { data, error } = await supabase.rpc('get_connected_items', {
      p_user_id: MATT.id,
      p_object_id: objects[0].id,
      p_class: 'event',
    })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
  })

  it('returns empty array when no connections exist', async () => {
    const { data: objId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'person', p_name: 'Isolated', p_map_x: 0, p_map_y: 0,
    })
    createdObjectIds.push(objId)

    const { data, error } = await supabase.rpc('get_connected_items', {
      p_user_id: MATT.id,
      p_object_id: objId,
      p_class: 'project',
    })

    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

// ─── set_object_types ───────────────────────────────────────────────────────

describe('set_object_types', () => {
  it('sets types by display name and replaces existing', async () => {
    const { data: objId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'person', p_name: 'Typed Person', p_map_x: 0, p_map_y: 0,
    })
    createdObjectIds.push(objId)

    // Get a valid type display_name for 'person'
    const { data: types } = await supabase
      .from('types').select('display_name').eq('class', 'person').limit(2)
    if (!types?.length) return

    // Set types
    const { error } = await supabase.rpc('set_object_types', {
      p_user_id: MATT.id,
      p_object_id: objId,
      p_class: 'person',
      p_type_names: types.map(t => t.display_name),
    })
    expect(error).toBeNull()

    // Verify
    const { count } = await supabase
      .from('objects_types_overrides')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', MATT.id)
      .eq('object_id', objId)
    expect(count).toBe(types.length)

    // Set again with fewer types — should replace
    await supabase.rpc('set_object_types', {
      p_user_id: MATT.id,
      p_object_id: objId,
      p_class: 'person',
      p_type_names: [types[0].display_name],
    })

    const { count: newCount } = await supabase
      .from('objects_types_overrides')
      .select('*', { count: 'exact', head: true })
      .eq('user_id', MATT.id)
      .eq('object_id', objId)
    expect(newCount).toBe(1)
  })
})

// ─── preflight_delete_object ────────────────────────────────────────────────

describe('preflight_delete_object', () => {
  it('returns connection count and orphan counts', async () => {
    // Create a person and a connected project
    const { data: personId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'person', p_name: 'Deletable', p_map_x: 0, p_map_y: 0,
    })
    const { data: projectId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'project', p_name: 'Orphanable', p_map_x: 50, p_map_y: 50,
    })
    createdObjectIds.push(personId, projectId)

    // Connect them
    await supabase.rpc('upsert_connection', {
      p_user_id: MATT.id,
      p_object_a_id: personId,
      p_object_b_id: projectId,
    })

    const { data, error } = await supabase.rpc('preflight_delete_object', {
      p_user_id: MATT.id,
      p_object_id: personId,
    })

    expect(error).toBeNull()
    expect(data).toBeTruthy()
    expect(data.connections).toBeGreaterThanOrEqual(1)
    expect(data.orphanedProjects).toBeGreaterThanOrEqual(1)
    expect(typeof data.orphanedEvents).toBe('number')
  })

  it('returns zeros for unconnected object', async () => {
    const { data: objId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'person', p_name: 'Loner', p_map_x: 0, p_map_y: 0,
    })
    createdObjectIds.push(objId)

    const { data } = await supabase.rpc('preflight_delete_object', {
      p_user_id: MATT.id,
      p_object_id: objId,
    })

    expect(data.connections).toBe(0)
    expect(data.orphanedProjects).toBe(0)
    expect(data.orphanedEvents).toBe(0)
  })
})

// ─── deactivate_connection ──────────────────────────────────────────────────

describe('deactivate_connection', () => {
  it('creates deactivation override via upsert', async () => {
    // Get a canonical connection
    const { data: conn } = await supabase
      .from('connections').select('id, object_a_id, object_b_id').limit(1).single()
    if (!conn) return

    const { error } = await supabase.rpc('deactivate_connection', {
      p_user_id: MATT.id,
      p_connection_id: conn.id,
      p_object_a_id: conn.object_a_id,
      p_object_b_id: conn.object_b_id,
    })
    expect(error).toBeNull()

    // Verify override exists
    const { data: ov } = await supabase
      .from('connections_overrides')
      .select('deactivated')
      .eq('user_id', MATT.id)
      .eq('connection_id', conn.id)
      .single()
    expect(ov?.deactivated).toBe(true)

    // Calling again should not error (upsert)
    const { error: error2 } = await supabase.rpc('deactivate_connection', {
      p_user_id: MATT.id,
      p_connection_id: conn.id,
      p_object_a_id: conn.object_a_id,
      p_object_b_id: conn.object_b_id,
    })
    expect(error2).toBeNull()

    // Clean up
    await supabase.from('connections_overrides')
      .delete().eq('user_id', MATT.id).eq('connection_id', conn.id)
  })
})

// ─── leave_shared_map ───────────────────────────────────────────────────────

describe('leave_shared_map', () => {
  it('prevents admin from leaving their own shared map', async () => {
    const { error } = await supabase.rpc('leave_shared_map', {
      p_user_id: MATT.id,
      p_map_id: SHARED_MAP.matt_map_id,
    })
    // Should fail — Matt is the admin (origin_map_id = self)
    expect(error).toBeTruthy()
    expect(error!.message).toContain('Admin cannot leave')
  })
})

// ─── get_share_picker_state ─────────────────────────────────────────────────

describe('get_share_picker_state', () => {
  it('returns shared map options for user', async () => {
    // Create an object to check share state for
    const { data: objId } = await supabase.rpc('create_object', {
      p_user_id: MATT.id, p_class: 'person', p_name: 'Shareable', p_map_x: 0, p_map_y: 0,
    })
    createdObjectIds.push(objId)

    const { data, error } = await supabase.rpc('get_share_picker_state', {
      p_user_id: MATT.id,
      p_object_id: objId,
      p_share_type: 'contacts',
    })

    expect(error).toBeNull()
    expect(Array.isArray(data)).toBe(true)
    // Matt has a shared map, so should have at least one option
    if (data.length > 0) {
      expect(data[0]).toHaveProperty('origin_map_id')
      expect(data[0]).toHaveProperty('map_name')
      expect(data[0]).toHaveProperty('shared')
      expect(data[0].shared).toBe(false) // not shared yet
    }
  })
})

// ─── accept_dissonance ──────────────────────────────────────────────────────

describe('accept_dissonance', () => {
  it('rejects unknown dissonance type', async () => {
    const { error } = await supabase.rpc('accept_dissonance', {
      p_user_id: MATT.id,
      p_dissonance_type: 'nonexistent_type',
      p_ref_id: '00000000-0000-0000-0000-000000000000',
    })
    expect(error).toBeTruthy()
  })
})
