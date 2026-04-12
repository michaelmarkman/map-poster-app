const messageMap = {
  'Invalid login credentials': 'Incorrect email or password. Please try again.',
  'User already registered': 'An account with this email already exists.',
  'Email not confirmed': 'Please check your email and confirm your account first.',
  'Password should be at least 6 characters': 'Password must be at least 6 characters.',
}

export function friendlyError(err) {
  if (!err) return 'Something went wrong. Please try again.'

  const msg = err.message || String(err)

  for (const [key, friendly] of Object.entries(messageMap)) {
    if (msg.includes(key)) return friendly
  }

  if (/network|fetch|Failed to fetch|NetworkError|ECONNREFUSED/i.test(msg)) {
    return 'Unable to connect. Please check your internet and try again.'
  }

  if (/rate limit|too many requests|429/i.test(msg) || err.status === 429) {
    return 'Too many attempts. Please wait a moment and try again.'
  }

  return 'Something went wrong. Please try again.'
}
