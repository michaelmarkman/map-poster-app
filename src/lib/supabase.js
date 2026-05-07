import { createClient } from '@supabase/supabase-js'

// Both env vars must be present to instantiate the client. The URL had a
// hardcoded project fallback in source — no functional purpose (the client
// only initializes when the anon key is also set, which it never was when
// the URL fallback would activate) and it leaked the project identifier
// into git. Set VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY to wire auth;
// without them the editor still works, just without sign-in / sync.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null
