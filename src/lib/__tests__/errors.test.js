import { describe, it, expect } from 'vitest'
import { friendlyError } from '../errors'

// friendlyError is the only thing standing between Supabase's raw
// auth-server messages and the customer-facing forms. It maps known
// strings to readable copy and falls back to a generic message for
// everything else. These tests pin the mapping shape so a refactor
// doesn't silently regress to "Something went wrong" for everything.

describe('friendlyError', () => {
  it('returns the generic fallback for null / undefined / empty', () => {
    expect(friendlyError(null)).toMatch(/something went wrong/i)
    expect(friendlyError(undefined)).toMatch(/something went wrong/i)
    expect(friendlyError({})).toMatch(/something went wrong/i)
  })

  it('maps "Invalid login credentials" to a clear retry prompt', () => {
    const err = new Error('Invalid login credentials')
    expect(friendlyError(err)).toMatch(/incorrect email or password/i)
  })

  it('maps "User already registered" to an account-exists hint', () => {
    const err = new Error('User already registered')
    expect(friendlyError(err)).toMatch(/already exists/i)
  })

  it('maps "Email not confirmed" to a confirmation reminder', () => {
    const err = new Error('Email not confirmed')
    expect(friendlyError(err)).toMatch(/confirm your account/i)
  })

  it('maps Supabase password-too-short variants', () => {
    expect(friendlyError(new Error('Password should be at least 6 characters'))).toMatch(/too short/i)
    expect(friendlyError(new Error('Password should be at least 12 characters'))).toMatch(/too short/i)
  })

  it('maps Supabase email-format rejections', () => {
    expect(friendlyError(new Error('Unable to validate email address: invalid format'))).toMatch(/email looks invalid/i)
    expect(friendlyError(new Error('Invalid email'))).toMatch(/email looks invalid/i)
  })

  it('maps Supabase rate-limit / "For security purposes" messages', () => {
    const err = new Error('For security purposes, you can only request this after 60 seconds')
    expect(friendlyError(err)).toMatch(/wait a moment/i)
  })

  it('maps expired-token / link errors', () => {
    expect(friendlyError(new Error('Token has expired'))).toMatch(/link has expired/i)
    expect(friendlyError(new Error('Email link is invalid or has expired'))).toMatch(/link has expired/i)
  })

  it('detects network failures by message regex', () => {
    expect(friendlyError(new Error('Failed to fetch'))).toMatch(/check your internet/i)
    expect(friendlyError(new Error('NetworkError when attempting to fetch'))).toMatch(/check your internet/i)
  })

  it('detects rate-limit / 429 by status field too', () => {
    const err = { message: 'whatever', status: 429 }
    expect(friendlyError(err)).toMatch(/too many attempts/i)
  })

  it('falls back to the generic message for unmapped errors', () => {
    expect(friendlyError(new Error('Something completely novel'))).toMatch(/something went wrong/i)
  })

  it('matching is case-insensitive (Supabase varies in capitalization)', () => {
    expect(friendlyError(new Error('USER ALREADY REGISTERED'))).toMatch(/already exists/i)
  })
})
