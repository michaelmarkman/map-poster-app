import { supabase } from './supabase.js'

async function withRetry(fn, retries = 2) {
  let lastErr
  for (let i = 0; i <= retries; i++) {
    try {
      return await fn()
    } catch (err) {
      lastErr = err
      const msg = (err.message || '').toLowerCase()
      const retryable = /network|fetch|timeout|cors/i.test(msg) || err.code === 'PGRST301'
      if (!retryable || i === retries) throw lastErr
      await new Promise(r => setTimeout(r, 1000))
    }
  }
}

// ── Fetch posts ──
export async function fetchPosts({ sort = 'newest', limit = 30, offset = 0, search = '', location = '', creator = '', dateFrom = '', dateTo = '' } = {}) {
  let query = supabase
    .from('community_posts')
    .select('*, profiles(username, display_name, avatar_url)')
    .eq('is_public', true)

  // Text search on title/description
  if (search) {
    query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`)
  }

  // Location filter
  if (location) {
    query = query.ilike('location_name', `%${location}%`)
  }

  // Creator filter — match against joined profile username or display_name
  if (creator) {
    query = query.or(`username.ilike.%${creator}%,display_name.ilike.%${creator}%`, { referencedTable: 'profiles' })
  }

  // Date range
  if (dateFrom) {
    query = query.gte('created_at', new Date(dateFrom).toISOString())
  }
  if (dateTo) {
    const end = new Date(dateTo)
    end.setDate(end.getDate() + 1)
    query = query.lt('created_at', end.toISOString())
  }

  if (sort === 'newest') query = query.order('created_at', { ascending: false })
  else if (sort === 'most_liked') query = query.order('likes_count', { ascending: false })
  else if (sort === 'trending') query = query.order('likes_count', { ascending: false }).gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())

  query = query.range(offset, offset + limit - 1)

  return withRetry(async () => {
    const { data, error } = await query
    if (error) throw error
    return data
  })
}

export async function fetchPost(id) {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*, profiles(username, display_name, avatar_url)')
      .eq('id', id)
      .single()
    if (error) throw error
    return data
  })
}

export async function fetchUserPosts(username) {
  return withRetry(async () => {
    const { data, error } = await supabase
      .from('community_posts')
      .select('*, profiles!inner(username, display_name, avatar_url)')
      .eq('profiles.username', username)
      .eq('is_public', true)
      .order('created_at', { ascending: false })
    if (error) throw error
    return data
  })
}

export async function fetchProfile(username) {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('username', username)
    .single()
  if (error) throw error
  return data
}

// ── Create post ──
export async function createPost({ title, description, location_name, image_blob, saved_view_id, user_id }) {
  // Upload image to storage
  const filename = `${user_id}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`
  const { error: uploadError } = await supabase.storage
    .from('renders')
    .upload(filename, image_blob, { contentType: 'image/jpeg', upsert: false })
  if (uploadError) throw uploadError

  const { data: { publicUrl: image_url } } = supabase.storage.from('renders').getPublicUrl(filename)

  const { data, error } = await supabase
    .from('community_posts')
    .insert({
      user_id,
      title,
      description,
      location_name,
      image_url,
      saved_view_id: saved_view_id || null,
      is_public: true
    })
    .select()
    .single()
  if (error) throw error
  return data
}

// ── Likes ──
export async function toggleLike(postId, userId) {
  const { data: existing } = await supabase
    .from('likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await supabase.from('likes').delete().eq('id', existing.id)
    return false
  } else {
    await supabase.from('likes').insert({ post_id: postId, user_id: userId })
    return true
  }
}

export async function checkLiked(postId, userId) {
  if (!userId) return false
  const { data } = await supabase
    .from('likes')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

// ── Saves ──
export async function toggleSave(postId, userId) {
  const { data: existing } = await supabase
    .from('saves')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()

  if (existing) {
    await supabase.from('saves').delete().eq('id', existing.id)
    return false
  } else {
    await supabase.from('saves').insert({ post_id: postId, user_id: userId })
    return true
  }
}

export async function checkSaved(postId, userId) {
  if (!userId) return false
  const { data } = await supabase
    .from('saves')
    .select('id')
    .eq('post_id', postId)
    .eq('user_id', userId)
    .maybeSingle()
  return !!data
}

// ── Follows ──
export async function toggleFollow(targetUserId, currentUserId) {
  if (!currentUserId || !targetUserId || currentUserId === targetUserId) return false
  const { data: existing } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId)
    .maybeSingle()

  if (existing) {
    await supabase.from('follows').delete().eq('id', existing.id)
    return false
  } else {
    await supabase.from('follows').insert({ follower_id: currentUserId, following_id: targetUserId })
    return true
  }
}

export async function checkFollowing(targetUserId, currentUserId) {
  if (!currentUserId || !targetUserId) return false
  const { data } = await supabase
    .from('follows')
    .select('id')
    .eq('follower_id', currentUserId)
    .eq('following_id', targetUserId)
    .maybeSingle()
  return !!data
}

export async function getFollowerCount(userId) {
  if (!userId) return 0
  const { count } = await supabase
    .from('follows')
    .select('id', { count: 'exact', head: true })
    .eq('following_id', userId)
  return count || 0
}

export async function getFollowingCount(userId) {
  if (!userId) return 0
  const { count } = await supabase
    .from('follows')
    .select('id', { count: 'exact', head: true })
    .eq('follower_id', userId)
  return count || 0
}

// ── Notifications ──
export async function fetchNotifications(userId, limit = 20) {
  if (!userId) return []
  const { data, error } = await supabase
    .from('notifications')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) return []
  return data || []
}

export async function getUnreadCount(userId) {
  if (!userId) return 0
  const { count } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('is_read', false)
  return count || 0
}

export async function markNotificationsRead(userId) {
  if (!userId) return
  await supabase
    .from('notifications')
    .update({ is_read: true })
    .eq('user_id', userId)
    .eq('is_read', false)
}

// ── Share helpers ──
export function getPostUrl(postId) {
  return `${window.location.origin}/community.html?post=${postId}`
}

export function shareToTwitter(post) {
  const text = `Check out "${post.title}" on MapPoster`
  const url = getPostUrl(post.id)
  window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank')
}

export function shareToFacebook(post) {
  const url = getPostUrl(post.id)
  window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank')
}

export async function copyPostLink(postId) {
  const url = getPostUrl(postId)
  await navigator.clipboard.writeText(url)
  return url
}

// ── View encoding for share-this-view ──
export function encodeViewState(state) {
  const compact = {
    lat: state.latitude,
    lng: state.longitude,
    t: state.timeOfDay,
    sr: state.sunRotation,
  }
  return btoa(JSON.stringify(compact))
}

export function decodeViewState(encoded) {
  try {
    const obj = JSON.parse(atob(encoded))
    return { latitude: obj.lat, longitude: obj.lng, timeOfDay: obj.t, sunRotation: obj.sr }
  } catch { return null }
}
