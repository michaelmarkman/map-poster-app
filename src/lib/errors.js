// Order matters — first match wins. Put the more specific Supabase
// strings before generic substrings so e.g. "Password should be at
// least N" doesn't get caught by something looser.
const messageMap = {
  'Invalid login credentials': 'Incorrect email or password. Please try again.',
  'User already registered': 'An account with this email already exists.',
  'Email not confirmed': 'Please check your email and confirm your account first.',
  // Supabase's "Password should be at least N characters" — `includes` matches
  // any digit so we don't need to enumerate every length.
  'Password should be at least': 'Password is too short — try a longer one.',
  // Supabase's email-format rejection.
  'Unable to validate email address': 'That email looks invalid — double-check the format.',
  'invalid email': 'That email looks invalid — double-check the format.',
  // Reset-link rate limit (Supabase's "for security purposes…").
  'For security purposes': 'Please wait a moment before trying again.',
  // Signup flow when email confirmations are required and the user enters
  // an existing-but-unverified email.
  'User not found': 'No account with that email — try signing up instead.',
  // Reset-password / verify-email link expired.
  'Token has expired': 'That link has expired. Request a new one and try again.',
  'Email link is invalid or has expired': 'That link has expired. Request a new one and try again.',
  // AuthContext throws this when supabase wasn't configured at boot.
  // Surfaced verbatim because the original message is already readable
  // and tells the operator exactly which env vars to set.
  'Auth is unavailable': 'Auth is unavailable — VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are not configured.',
}

export function friendlyError(err) {
  if (!err) return 'Something went wrong. Please try again.'

  const msg = err.message || String(err)

  for (const [key, friendly] of Object.entries(messageMap)) {
    if (msg.toLowerCase().includes(key.toLowerCase())) return friendly
  }

  if (/network|fetch|Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg)) {
    return 'Unable to connect. Please check your internet and try again.'
  }

  if (/rate limit|too many requests|429/i.test(msg) || err.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.'
  }

  return 'Something went wrong. Please try again.'
}
