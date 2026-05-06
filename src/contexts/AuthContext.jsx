import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { setActiveProfile } from '../lib/entitlements'
import { validateAvatarFile } from '../lib/avatarValidation'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  // Phase 6 — keep the entitlements module-bridge in sync with the live
  // profile so non-React callers (useQueue, useSavedViews) read fresh tier
  // info on every render-submit. When Phase 6.2 lands and Stripe webhooks
  // start populating profile.tier, every gate auto-picks it up.
  useEffect(() => {
    setActiveProfile(profile)
  }, [profile])

  async function loadProfile(userId) {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()
      setProfile(data)
    } catch {
      setProfile(null)
    }
  }

  useEffect(() => {
    // Graceful fallback when Supabase isn't configured (no VITE_SUPABASE_ANON_KEY).
    // The editor still works — just without auth gating.
    if (!supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        setSession(session)
        setUser(session?.user ?? null)
        if (session?.user) loadProfile(session.user.id)
        setLoading(false)
      })
      .catch((err) => {
        // Defensive: getSession is documented to return { error } rather
        // than throw, but mis-configured envs (bad VITE_SUPABASE_URL),
        // unrefreshable expired tokens, and other JS-internal edge cases
        // can still bubble out. Without a catch the .then never fires,
        // setLoading(false) never runs, and ProtectedRoute on /profile +
        // /gallery shows a perpetual spinner. Treat the failure as
        // "no session" — the user can still use the app as a guest, sign
        // in, etc.
        console.error('[auth] getSession failed:', err)
        setSession(null)
        setUser(null)
        setLoading(false)
      })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      if (session?.user) {
        loadProfile(session.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) throw error
    return data
  }

  async function signUp(email, password, username) {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { username },
        // Land confirmed users straight in the editor. Without a
        // redirectTo, Supabase points the confirmation link at the
        // site root, which leaves a #access_token=… hash sitting
        // in the URL bar with no UI consuming it. /app already
        // handles guest-mode flow and gracefully transitions to
        // logged-in once the AuthContext picks up the new session.
        emailRedirectTo: `${window.location.origin}/app`,
      },
    })
    if (error) throw error
    return data
  }

  async function signOut() {
    try {
      await supabase.auth.signOut()
    } catch (err) {
      console.error('Sign out error:', err)
    }
  }

  async function resetPassword(email) {
    // Tell Supabase to put the post-click redirect at /reset-password,
    // where ResetPasswordPage takes over to set a new password. Without
    // this, the email link drops the user on the site root with a token
    // in the hash and no UI to consume it.
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw error
  }

  async function updatePassword(password) {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw error
  }

  async function updateProfile(updates) {
    const { data, error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select()
      .single()
    if (error) throw error
    setProfile(data)
    return data
  }

  async function uploadAvatar(file) {
    // Defensive validation lives in src/lib/avatarValidation.js so the
    // type+size+MIME-extension checks can be unit-tested without spinning
    // the AuthProvider up. validateAvatarFile throws on rejection and
    // returns the canonical extension to write into the storage path.
    const ext = validateAvatarFile(file)
    const path = `${user.id}/avatar.${ext}`
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(path, file, { upsert: true, contentType: file.type })
    if (uploadError) throw uploadError

    const { data: { publicUrl } } = supabase.storage
      .from('avatars')
      .getPublicUrl(path)

    await updateProfile({ avatar_url: publicUrl })
    return publicUrl
  }

  const value = {
    user,
    session,
    profile,
    loading,
    signIn,
    signUp,
    signOut,
    resetPassword,
    updatePassword,
    updateProfile,
    uploadAvatar,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
