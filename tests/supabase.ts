/**
 * Shared Supabase client for integration tests.
 * Connects to local Supabase instance with service_role key
 * to bypass RLS (tests exercise RPC logic, not policies).
 */
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = 'http://127.0.0.1:54321'
// service_role key from `supabase status` — local dev only, not a secret
const SERVICE_ROLE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU'

export const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY)

// Seeded test users (from supabase/seed.sql)
export const MATT = {
  id: 'cccc1111-1111-1111-1111-111111111111',
  email: 'matt@test.com',
}

export const BILLY = {
  id: 'cccc2222-2222-2222-2222-222222222222',
  email: 'billy@test.com',
}

// Seeded shared map (Matt = admin, Billy = member)
export const SHARED_MAP = {
  matt_map_id: 'aafe1111-1111-1111-1111-111111111111',
  billy_map_id: 'aafe2222-2222-2222-2222-222222222222',
  origin_map_id: 'aafe1111-1111-1111-1111-111111111111',
}
