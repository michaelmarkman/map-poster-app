import { supabase } from './supabase.js'

// ── Fetch posts ──
export async function fetchPosts({ sort = 'newest', limit = 30, offset = 0 } = {}) {
  let query = supabase
    .from('community_posts')
    .select('*, profiles(username, display_name, avatar_url)')
    .eq('is_public', true)
    .range(offset, offset + limit - 1)

  if (sort === 'newest') query = query.order('created_at', { ascending: false })
  else if (sort === 'most_liked') query = query.order('like_count', { ascending: false })
  else if (sort === 'trending') query = query.order('like_count', { ascending: false }).gte('created_at', new Date(Date.now() - 7 * 86400000).toISOString())

  const { data, error } = await query
  if (error) throw error
  return data
}

export async function fetchPost(id) {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*, profiles(username, display_name, avatar_url)')
    .eq('id', id)
    .single()
  if (error) throw error
  return data
}

export async function fetchUserPosts(username) {
  const { data, error } = await supabase
    .from('community_posts')
    .select('*, profiles!inner(username, display_name, avatar_url)')
    .eq('profiles.username', username)
    .eq('is_public', true)
    .order('created_at', { ascending: false })
  if (error) throw error
  return data
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
