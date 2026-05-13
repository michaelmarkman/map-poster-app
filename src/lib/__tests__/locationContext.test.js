import { describe, it, expect } from 'vitest'
import { classifyLocation } from '../locationContext'

// Fixtures shaped like real Nominatim reverse-geocode responses
// (subset — only the fields the classifier reads). Built from actual
// queries against nominatim.openstreetmap.org so the tests pin
// real-world tag combinations.

describe('classifyLocation', () => {
  it('returns null for missing or invalid input', () => {
    expect(classifyLocation(null)).toBeNull()
    expect(classifyLocation(undefined)).toBeNull()
    expect(classifyLocation('not an object')).toBeNull()
  })

  it('classifies natural category as nature', () => {
    // Mount Fuji peak
    const fuji = {
      category: 'natural',
      type: 'peak',
      address: { natural: 'peak', state: 'Yamanashi', country: 'Japan' },
    }
    expect(classifyLocation(fuji)).toBe('nature')
  })

  it('classifies leisure park as nature', () => {
    // Edge of Yellowstone (leisure=nature_reserve in OSM)
    const park = {
      category: 'leisure',
      type: 'nature_reserve',
      address: { leisure: 'nature_reserve', state: 'Wyoming' },
    }
    expect(classifyLocation(park)).toBe('nature')
  })

  it('classifies water category as nature', () => {
    const lake = {
      category: 'water',
      type: 'lake',
      address: { water: 'Lake Tahoe' },
    }
    expect(classifyLocation(lake)).toBe('nature')
  })

  it('classifies landuse=forest as nature', () => {
    const forest = {
      category: 'landuse',
      type: 'forest',
      address: { state: 'Oregon', country: 'United States' },
    }
    expect(classifyLocation(forest)).toBe('nature')
  })

  it('classifies highway category as urban', () => {
    // 5th Avenue, Manhattan
    const fifth = {
      category: 'highway',
      type: 'secondary',
      address: { road: 'Fifth Avenue', suburb: 'Manhattan', city: 'New York' },
    }
    expect(classifyLocation(fifth)).toBe('urban')
  })

  it('classifies building category as urban', () => {
    const empireState = {
      category: 'building',
      type: 'house',
      address: { road: '5th Avenue', suburb: 'Manhattan' },
    }
    expect(classifyLocation(empireState)).toBe('urban')
  })

  it('classifies amenity category as urban', () => {
    const cafe = {
      category: 'amenity',
      type: 'cafe',
      address: { road: 'Mulberry St', suburb: 'Little Italy' },
    }
    expect(classifyLocation(cafe)).toBe('urban')
  })

  it('returns mixed when both signals present in address', () => {
    // Central Park — leisure=park BUT surrounded by neighbourhood +
    // suburb tags. Top-level category resolves first; if address has
    // both signals it's mixed.
    const centralParkInterior = {
      category: 'place',  // not in either set
      type: 'square',
      address: {
        leisure: 'park',          // nature signal
        neighbourhood: 'Central Park', // urban signal
        suburb: 'Manhattan',      // urban signal
      },
    }
    expect(classifyLocation(centralParkInterior)).toBe('mixed')
  })

  it('falls back to scoring address tags when category is ambiguous', () => {
    // Suburban residential street — category=place, no clear leaning
    const suburb = {
      category: 'place',
      type: 'village',
      address: { road: 'Oak Lane', suburb: 'Riverdale', city: 'Bronx' },
    }
    expect(classifyLocation(suburb)).toBe('urban')
  })

  it('falls back to nature when nature tags outweigh urban tags', () => {
    const mostlyNature = {
      category: 'place',
      type: 'island',
      address: { natural: 'wood', water: 'Lake' }, // 2 nature, 0 urban
    }
    expect(classifyLocation(mostlyNature)).toBe('nature')
  })

  it('returns null when no signals are present', () => {
    // Open ocean — no tags whatsoever
    const ocean = {
      category: 'place',
      type: 'sea',
      address: {},
    }
    expect(classifyLocation(ocean)).toBeNull()
  })

  it('handles missing address gracefully', () => {
    expect(classifyLocation({ category: 'highway' })).toBe('urban')
    expect(classifyLocation({ category: 'natural' })).toBe('nature')
    expect(classifyLocation({ category: 'foo' })).toBeNull()
  })
})
