# Map Poster App v1 Implementation Plan

> **[ARCHIVED]** — This is the v1 (2D) plan. The app pivoted to the 3D
> photorealistic-tiles approach (v2, v3) and then through a React SPA
> migration documented in `docs/superpowers/plans/2026-04-17-editor-react-migration-plan.md`.
> Kept as historical context.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a client-side web app where users search a location, frame it on a map, pick a style preset, customize text, and export a high-resolution map poster as PNG/PDF — supporting both single-pin and multi-pin (2-5 locations) posters.

**Architecture:** React SPA with a wizard flow (search → frame → style → text → preview → export). MapLibre GL JS handles the interactive map for framing. Overpass API fetches OSM vector data for the selected area, which is rendered as styled SVG for the poster output. Style presets are config objects that drive SVG fill/stroke colors. Fully client-side, no backend.

**Tech Stack:** React 18, TypeScript, Vite, MapLibre GL JS, Overpass API, Nominatim geocoding, Vitest + React Testing Library, html-to-image (for PNG export), jsPDF (for PDF export)

**Reference:** Design spec at `docs/superpowers/specs/2026-03-31-map-poster-app-design.md`. Prototype HTML files in `prototypes/` for visual reference (especially `2d-flat.html` for the SVG rendering approach and `3d-real.html` for the MapLibre UI).

---

## File Structure

```
src/
├── main.tsx                          # App entry point
├── App.tsx                           # Root component, wizard state machine
├── types.ts                          # Shared types (PosterConfig, Pin, StylePreset, etc.)
│
├── services/
│   ├── geocoding.ts                  # Nominatim geocoding API (search → coordinates)
│   ├── overpass.ts                   # Overpass API client (bbox → OSM features)
│   └── export.ts                     # SVG → PNG/PDF export pipeline
│
├── presets/
│   ├── index.ts                      # Preset registry (all presets exported)
│   ├── minimal.ts                    # Minimal Line preset config
│   ├── dark-bold.ts                  # Dark & Bold preset config
│   ├── color-blocked.ts              # Color Blocked preset config
│   ├── vintage.ts                    # Vintage preset config
│   └── blueprint.ts                  # Blueprint preset config
│
├── components/
│   ├── wizard/
│   │   ├── WizardShell.tsx           # Step navigation chrome (progress bar, back/next)
│   │   ├── SearchStep.tsx            # Step 1: landing + search bar
│   │   ├── FrameStep.tsx             # Step 2: MapLibre map for framing + pin mode
│   │   ├── StyleStep.tsx             # Step 3: preset picker grid
│   │   ├── TextStep.tsx              # Step 4: place name, subtitle, coords toggle
│   │   ├── PreviewStep.tsx           # Step 5: full poster preview
│   │   └── ExportStep.tsx            # Step 6: download PNG/PDF buttons
│   │
│   ├── poster/
│   │   ├── PosterCanvas.tsx          # Poster layout container (aspect ratio, margins)
│   │   ├── MapSvg.tsx                # SVG map renderer (OSM data → styled paths)
│   │   ├── PinMarker.tsx             # Single pin SVG element
│   │   ├── PinLegend.tsx             # Multi-pin legend (color dots + labels)
│   │   └── PosterText.tsx            # Title, subtitle, coordinates text block
│   │
│   └── ui/
│       ├── SearchBar.tsx             # Autocomplete search input
│       └── PresetCard.tsx            # Style preset thumbnail + label
│
├── hooks/
│   ├── useGeocoding.ts               # Debounced geocoding search hook
│   ├── useOverpassData.ts            # Fetch + cache OSM data for bbox
│   └── usePosterConfig.ts            # Central poster state (pins, style, text, bounds)
│
└── lib/
    ├── osm-to-svg.ts                 # Transform OSM JSON → SVG path data
    ├── bounds.ts                     # Bbox utilities (fit-to-pins, padding, aspect ratio)
    └── colors.ts                     # Color manipulation helpers (if needed)

index.html                            # Vite HTML entry
vite.config.ts                        # Vite config
tsconfig.json                         # TypeScript config
package.json                          # Dependencies
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/types.ts`

- [ ] **Step 1: Initialize the project with Vite**

```bash
npm create vite@latest . -- --template react-ts
```

Select "React" and "TypeScript" if prompted interactively. If the directory isn't empty, confirm overwrite.

- [ ] **Step 2: Install dependencies**

```bash
npm install maplibre-gl html-to-image jspdf
npm install -D vitest @testing-library/react @testing-library/jest-dom jsdom @types/node
```

- [ ] **Step 3: Configure Vitest**

Add to `vite.config.ts`:

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test-setup.ts',
  },
})
```

Create `src/test-setup.ts`:

```ts
import '@testing-library/jest-dom/vitest'
```

- [ ] **Step 4: Define core types**

Write `src/types.ts`:

```ts
export interface LatLng {
  lat: number
  lng: number
}

export interface BBox {
  north: number
  south: number
  east: number
  west: number
}

export interface Pin {
  id: string
  location: LatLng
  label: string
  color: string
}

export interface StylePreset {
  id: string
  name: string
  colors: {
    background: string
    water: string
    land: string
    park: string
    building: string
    streetMajor: string
    streetMinor: string
    text: string
    textSecondary: string
    pin: string
  }
  streetWidths: {
    major: number
    minor: number
  }
}

export interface PosterText {
  title: string
  subtitle: string
  showCoordinates: boolean
}

export type WizardStep = 'search' | 'frame' | 'style' | 'text' | 'preview' | 'export'

export type PinMode = 'single' | 'multi'

export interface PosterConfig {
  pins: Pin[]
  pinMode: PinMode
  bbox: BBox | null
  preset: StylePreset | null
  text: PosterText
}

export interface GeocodingResult {
  displayName: string
  lat: number
  lng: number
  boundingBox: BBox
}

export interface OsmFeature {
  type: 'street' | 'water' | 'park' | 'building' | 'land'
  importance: 'major' | 'minor'
  geometry: Array<[number, number]>  // [lng, lat] pairs
  tags: Record<string, string>
}
```

- [ ] **Step 5: Write minimal App shell**

Replace `src/App.tsx`:

```tsx
import { useState } from 'react'
import type { WizardStep, PosterConfig } from './types'

const initialConfig: PosterConfig = {
  pins: [],
  pinMode: 'single',
  bbox: null,
  preset: null,
  text: { title: '', subtitle: '', showCoordinates: true },
}

export default function App() {
  const [step, setStep] = useState<WizardStep>('search')
  const [config, setConfig] = useState<PosterConfig>(initialConfig)

  return (
    <div className="app">
      <h1>Map Poster</h1>
      <p>Step: {step}</p>
    </div>
  )
}
```

- [ ] **Step 6: Verify the app runs**

```bash
npm run dev
```

Expected: Vite dev server starts, browser shows "Map Poster" heading with "Step: search".

- [ ] **Step 7: Verify tests run**

Create `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders app shell', () => {
  render(<App />)
  expect(screen.getByText('Map Poster')).toBeInTheDocument()
})
```

```bash
npx vitest run
```

Expected: 1 test passes.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "scaffold React + Vite + TypeScript project with core types"
```

---

## Task 2: Geocoding Service

**Files:**
- Create: `src/services/geocoding.ts`, `src/services/geocoding.test.ts`

- [ ] **Step 1: Write failing test for geocoding search**

```ts
// src/services/geocoding.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { searchPlaces } from './geocoding'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('searchPlaces', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  it('returns parsed results from Nominatim', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => [
        {
          display_name: 'Brooklyn, Kings County, New York, USA',
          lat: '40.6501',
          lon: '-73.9496',
          boundingbox: ['40.5707', '40.7395', '-74.0421', '-73.8334'],
        },
      ],
    })

    const results = await searchPlaces('Brooklyn')

    expect(results).toEqual([
      {
        displayName: 'Brooklyn, Kings County, New York, USA',
        lat: 40.6501,
        lng: -73.9496,
        boundingBox: {
          south: 40.5707,
          north: 40.7395,
          west: -74.0421,
          east: -73.8334,
        },
      },
    ])

    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('nominatim.openstreetmap.org/search'),
      expect.objectContaining({
        headers: expect.objectContaining({
          'Accept': 'application/json',
        }),
      }),
    )
  })

  it('returns empty array on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    const results = await searchPlaces('zzzzz')
    expect(results).toEqual([])
  })

  it('returns empty array for empty query', async () => {
    const results = await searchPlaces('')
    expect(results).toEqual([])
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/services/geocoding.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement geocoding service**

```ts
// src/services/geocoding.ts
import type { GeocodingResult } from '../types'

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search'

export async function searchPlaces(query: string): Promise<GeocodingResult[]> {
  if (!query.trim()) return []

  const params = new URLSearchParams({
    q: query,
    format: 'json',
    limit: '5',
    addressdetails: '0',
  })

  try {
    const response = await fetch(`${NOMINATIM_URL}?${params}`, {
      headers: { 'Accept': 'application/json' },
    })

    if (!response.ok) return []

    const data = await response.json()

    return data.map((item: {
      display_name: string
      lat: string
      lon: string
      boundingbox: [string, string, string, string]
    }) => ({
      displayName: item.display_name,
      lat: parseFloat(item.lat),
      lng: parseFloat(item.lon),
      boundingBox: {
        south: parseFloat(item.boundingbox[0]),
        north: parseFloat(item.boundingbox[1]),
        west: parseFloat(item.boundingbox[2]),
        east: parseFloat(item.boundingbox[3]),
      },
    }))
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/services/geocoding.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/geocoding.ts src/services/geocoding.test.ts
git commit -m "add geocoding service with Nominatim integration"
```

---

## Task 3: Geocoding Hook + Search Bar

**Files:**
- Create: `src/hooks/useGeocoding.ts`, `src/components/ui/SearchBar.tsx`, `src/components/ui/SearchBar.test.tsx`

- [ ] **Step 1: Write the geocoding hook**

```ts
// src/hooks/useGeocoding.ts
import { useState, useEffect, useRef } from 'react'
import { searchPlaces } from '../services/geocoding'
import type { GeocodingResult } from '../types'

export function useGeocoding(query: string, debounceMs = 300) {
  const [results, setResults] = useState<GeocodingResult[]>([])
  const [loading, setLoading] = useState(false)
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    if (!query.trim()) {
      setResults([])
      return
    }

    setLoading(true)
    clearTimeout(timeoutRef.current)

    timeoutRef.current = setTimeout(async () => {
      const data = await searchPlaces(query)
      setResults(data)
      setLoading(false)
    }, debounceMs)

    return () => clearTimeout(timeoutRef.current)
  }, [query, debounceMs])

  return { results, loading }
}
```

- [ ] **Step 2: Write failing test for SearchBar**

```tsx
// src/components/ui/SearchBar.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { SearchBar } from './SearchBar'

test('renders input and calls onSelect when result clicked', async () => {
  const onSelect = vi.fn()
  const mockResults = [
    {
      displayName: 'Brooklyn, New York',
      lat: 40.65,
      lng: -73.95,
      boundingBox: { south: 40.57, north: 40.74, west: -74.04, east: -73.83 },
    },
  ]

  render(
    <SearchBar
      results={mockResults}
      loading={false}
      query=""
      onQueryChange={() => {}}
      onSelect={onSelect}
    />
  )

  expect(screen.getByPlaceholderText('Search a place that matters')).toBeInTheDocument()

  fireEvent.click(screen.getByText('Brooklyn, New York'))
  expect(onSelect).toHaveBeenCalledWith(mockResults[0])
})
```

- [ ] **Step 3: Run test to verify it fails**

```bash
npx vitest run src/components/ui/SearchBar.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement SearchBar**

```tsx
// src/components/ui/SearchBar.tsx
import type { GeocodingResult } from '../../types'

interface SearchBarProps {
  query: string
  onQueryChange: (query: string) => void
  results: GeocodingResult[]
  loading: boolean
  onSelect: (result: GeocodingResult) => void
  placeholder?: string
}

export function SearchBar({ query, onQueryChange, results, loading, onSelect, placeholder = 'Search a place that matters' }: SearchBarProps) {
  return (
    <div className="search-bar">
      <input
        type="text"
        placeholder={placeholder}
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
      />
      {loading && <div className="search-loading">Searching...</div>}
      {results.length > 0 && (
        <ul className="search-results">
          {results.map((result, i) => (
            <li key={i} onClick={() => onSelect(result)}>
              {result.displayName}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run src/components/ui/SearchBar.test.tsx
```

Expected: 1 test passes.

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useGeocoding.ts src/components/ui/SearchBar.tsx src/components/ui/SearchBar.test.tsx
git commit -m "add SearchBar component and geocoding hook"
```

---

## Task 4: Style Presets

**Files:**
- Create: `src/presets/minimal.ts`, `src/presets/dark-bold.ts`, `src/presets/color-blocked.ts`, `src/presets/vintage.ts`, `src/presets/blueprint.ts`, `src/presets/index.ts`, `src/presets/presets.test.ts`

- [ ] **Step 1: Write failing test for presets**

```ts
// src/presets/presets.test.ts
import { describe, it, expect } from 'vitest'
import { presets, getPreset } from './index'
import type { StylePreset } from '../types'

describe('presets', () => {
  it('exports exactly 5 presets', () => {
    expect(presets).toHaveLength(5)
  })

  it('each preset has required color fields', () => {
    const requiredColors = [
      'background', 'water', 'land', 'park', 'building',
      'streetMajor', 'streetMinor', 'text', 'textSecondary', 'pin',
    ] as const

    for (const preset of presets) {
      for (const key of requiredColors) {
        expect(preset.colors[key], `${preset.id} missing colors.${key}`).toBeTruthy()
      }
      expect(preset.streetWidths.major).toBeGreaterThan(0)
      expect(preset.streetWidths.minor).toBeGreaterThan(0)
    }
  })

  it('getPreset returns preset by id', () => {
    const preset = getPreset('minimal')
    expect(preset).toBeDefined()
    expect(preset!.name).toBe('Minimal Line')
  })

  it('getPreset returns undefined for unknown id', () => {
    expect(getPreset('nonexistent')).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/presets/presets.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Write all 5 preset configs**

```ts
// src/presets/minimal.ts
import type { StylePreset } from '../types'

export const minimal: StylePreset = {
  id: 'minimal',
  name: 'Minimal Line',
  colors: {
    background: '#ffffff',
    water: '#e6f0f5',
    land: '#ffffff',
    park: '#e8f2e0',
    building: '#f0f0f0',
    streetMajor: '#222222',
    streetMinor: '#cccccc',
    text: '#222222',
    textSecondary: '#888888',
    pin: '#e74c3c',
  },
  streetWidths: { major: 1.2, minor: 0.4 },
}
```

```ts
// src/presets/dark-bold.ts
import type { StylePreset } from '../types'

export const darkBold: StylePreset = {
  id: 'dark-bold',
  name: 'Dark & Bold',
  colors: {
    background: '#0a0a0a',
    water: '#0d2137',
    land: '#0a0a0a',
    park: '#0a2a1a',
    building: '#141414',
    streetMajor: '#f0f0f0',
    streetMinor: '#333333',
    text: '#f0f0f0',
    textSecondary: '#666666',
    pin: '#e8c468',
  },
  streetWidths: { major: 1.5, minor: 0.5 },
}
```

```ts
// src/presets/color-blocked.ts
import type { StylePreset } from '../types'

export const colorBlocked: StylePreset = {
  id: 'color-blocked',
  name: 'Color Blocked',
  colors: {
    background: '#1a5276',
    water: '#0e3a5c',
    land: '#1a5276',
    park: '#2ecc71',
    building: '#1f6090',
    streetMajor: '#e8e8e8',
    streetMinor: 'rgba(255,255,255,0.3)',
    text: '#e8e8e8',
    textSecondary: 'rgba(255,255,255,0.5)',
    pin: '#f39c12',
  },
  streetWidths: { major: 1.8, minor: 0.6 },
}
```

```ts
// src/presets/vintage.ts
import type { StylePreset } from '../types'

export const vintage: StylePreset = {
  id: 'vintage',
  name: 'Vintage',
  colors: {
    background: '#f5e6c8',
    water: '#c8d8e0',
    land: '#f5e6c8',
    park: '#c8d4a8',
    building: '#e8d5b5',
    streetMajor: '#6b5b47',
    streetMinor: '#c4b49a',
    text: '#4a3c2e',
    textSecondary: '#8a7a6a',
    pin: '#8b4513',
  },
  streetWidths: { major: 1.0, minor: 0.4 },
}
```

```ts
// src/presets/blueprint.ts
import type { StylePreset } from '../types'

export const blueprint: StylePreset = {
  id: 'blueprint',
  name: 'Blueprint',
  colors: {
    background: '#1a2744',
    water: '#132040',
    land: '#1a2744',
    park: '#1e3050',
    building: '#1f2d4d',
    streetMajor: '#f0f0f0',
    streetMinor: 'rgba(255,255,255,0.2)',
    text: '#ffffff',
    textSecondary: 'rgba(255,255,255,0.5)',
    pin: '#ff6b35',
  },
  streetWidths: { major: 0.8, minor: 0.3 },
}
```

```ts
// src/presets/index.ts
import type { StylePreset } from '../types'
import { minimal } from './minimal'
import { darkBold } from './dark-bold'
import { colorBlocked } from './color-blocked'
import { vintage } from './vintage'
import { blueprint } from './blueprint'

export const presets: StylePreset[] = [minimal, darkBold, colorBlocked, vintage, blueprint]

export function getPreset(id: string): StylePreset | undefined {
  return presets.find((p) => p.id === id)
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/presets/presets.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/presets/
git commit -m "add 5 style presets: minimal, dark-bold, color-blocked, vintage, blueprint"
```

---

## Task 5: Bounding Box Utilities

**Files:**
- Create: `src/lib/bounds.ts`, `src/lib/bounds.test.ts`

- [ ] **Step 1: Write failing tests for bounds utilities**

```ts
// src/lib/bounds.test.ts
import { describe, it, expect } from 'vitest'
import { fitBoundsToPoints, padBBox, constrainToAspectRatio } from './bounds'
import type { LatLng } from '../types'

describe('fitBoundsToPoints', () => {
  it('returns bbox containing all points', () => {
    const points: LatLng[] = [
      { lat: 40.7, lng: -74.0 },
      { lat: 40.8, lng: -73.9 },
      { lat: 40.65, lng: -73.95 },
    ]
    const bbox = fitBoundsToPoints(points)
    expect(bbox.south).toBe(40.65)
    expect(bbox.north).toBe(40.8)
    expect(bbox.west).toBe(-74.0)
    expect(bbox.east).toBe(-73.9)
  })

  it('handles single point', () => {
    const bbox = fitBoundsToPoints([{ lat: 40.7, lng: -74.0 }])
    expect(bbox.south).toBe(40.7)
    expect(bbox.north).toBe(40.7)
    expect(bbox.west).toBe(-74.0)
    expect(bbox.east).toBe(-74.0)
  })
})

describe('padBBox', () => {
  it('expands bbox by percentage', () => {
    const bbox = { south: 40.0, north: 41.0, west: -74.0, east: -73.0 }
    const padded = padBBox(bbox, 0.1)
    expect(padded.south).toBeCloseTo(39.9)
    expect(padded.north).toBeCloseTo(41.1)
    expect(padded.west).toBeCloseTo(-74.1)
    expect(padded.east).toBeCloseTo(-72.9)
  })
})

describe('constrainToAspectRatio', () => {
  it('widens bbox to match portrait ratio (3:4)', () => {
    const bbox = { south: 40.0, north: 40.04, west: -74.0, east: -73.99 }
    const constrained = constrainToAspectRatio(bbox, 3 / 4)
    const width = constrained.east - constrained.west
    const height = constrained.north - constrained.south
    expect(width / height).toBeCloseTo(3 / 4, 1)
  })

  it('tallens bbox to match portrait ratio (3:4)', () => {
    const bbox = { south: 40.0, north: 40.01, west: -74.0, east: -73.9 }
    const constrained = constrainToAspectRatio(bbox, 3 / 4)
    const width = constrained.east - constrained.west
    const height = constrained.north - constrained.south
    expect(width / height).toBeCloseTo(3 / 4, 1)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/bounds.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement bounds utilities**

```ts
// src/lib/bounds.ts
import type { BBox, LatLng } from '../types'

export function fitBoundsToPoints(points: LatLng[]): BBox {
  const lats = points.map((p) => p.lat)
  const lngs = points.map((p) => p.lng)
  return {
    south: Math.min(...lats),
    north: Math.max(...lats),
    west: Math.min(...lngs),
    east: Math.max(...lngs),
  }
}

export function padBBox(bbox: BBox, fraction: number): BBox {
  const latPad = (bbox.north - bbox.south) * fraction
  const lngPad = (bbox.east - bbox.west) * fraction
  return {
    south: bbox.south - latPad,
    north: bbox.north + latPad,
    west: bbox.west - lngPad,
    east: bbox.east + lngPad,
  }
}

export function constrainToAspectRatio(bbox: BBox, widthOverHeight: number): BBox {
  const height = bbox.north - bbox.south
  const width = bbox.east - bbox.west
  const currentRatio = width / height

  if (currentRatio < widthOverHeight) {
    // Too tall — widen
    const targetWidth = height * widthOverHeight
    const expand = (targetWidth - width) / 2
    return { ...bbox, west: bbox.west - expand, east: bbox.east + expand }
  } else {
    // Too wide — tallen
    const targetHeight = width / widthOverHeight
    const expand = (targetHeight - height) / 2
    return { ...bbox, south: bbox.south - expand, north: bbox.north + expand }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/bounds.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/bounds.ts src/lib/bounds.test.ts
git commit -m "add bounding box utilities for pin fitting and aspect ratio"
```

---

## Task 6: Overpass API Service

**Files:**
- Create: `src/services/overpass.ts`, `src/services/overpass.test.ts`

- [ ] **Step 1: Write failing test for Overpass data fetching**

```ts
// src/services/overpass.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { fetchMapData } from './overpass'
import type { BBox } from '../types'

const mockFetch = vi.fn()
global.fetch = mockFetch

describe('fetchMapData', () => {
  beforeEach(() => {
    mockFetch.mockReset()
  })

  const bbox: BBox = { south: 40.7, north: 40.72, west: -74.01, east: -73.99 }

  it('fetches and parses OSM data into typed features', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        elements: [
          {
            type: 'way',
            tags: { highway: 'primary', name: 'Broadway' },
            geometry: [
              { lat: 40.71, lon: -74.005 },
              { lat: 40.715, lon: -74.002 },
            ],
          },
          {
            type: 'way',
            tags: { natural: 'water' },
            geometry: [
              { lat: 40.705, lon: -74.008 },
              { lat: 40.706, lon: -74.006 },
              { lat: 40.705, lon: -74.008 },
            ],
          },
          {
            type: 'way',
            tags: { leisure: 'park' },
            geometry: [
              { lat: 40.71, lon: -74.0 },
              { lat: 40.712, lon: -73.998 },
              { lat: 40.71, lon: -74.0 },
            ],
          },
        ],
      }),
    })

    const features = await fetchMapData(bbox)

    expect(features.length).toBe(3)
    expect(features[0].type).toBe('street')
    expect(features[0].importance).toBe('major')
    expect(features[1].type).toBe('water')
    expect(features[2].type).toBe('park')
  })

  it('returns empty array on error', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false })
    const features = await fetchMapData(bbox)
    expect(features).toEqual([])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/services/overpass.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement Overpass service**

```ts
// src/services/overpass.ts
import type { BBox, OsmFeature } from '../types'

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter'

function buildQuery(bbox: BBox): string {
  const b = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
  return `
    [out:json][timeout:30];
    (
      way["highway"](${b});
      way["natural"="water"](${b});
      way["waterway"](${b});
      way["leisure"="park"](${b});
      way["landuse"="grass"](${b});
      way["building"](${b});
      relation["natural"="water"](${b});
    );
    out geom;
  `
}

const MAJOR_HIGHWAYS = new Set([
  'motorway', 'trunk', 'primary', 'secondary', 'tertiary',
  'motorway_link', 'trunk_link', 'primary_link',
])

function classifyFeature(tags: Record<string, string>): { type: OsmFeature['type']; importance: OsmFeature['importance'] } | null {
  if (tags.highway) {
    return {
      type: 'street',
      importance: MAJOR_HIGHWAYS.has(tags.highway) ? 'major' : 'minor',
    }
  }
  if (tags.natural === 'water' || tags.waterway) return { type: 'water', importance: 'major' }
  if (tags.leisure === 'park' || tags.landuse === 'grass') return { type: 'park', importance: 'major' }
  if (tags.building) return { type: 'building', importance: 'minor' }
  return null
}

export async function fetchMapData(bbox: BBox): Promise<OsmFeature[]> {
  try {
    const response = await fetch(OVERPASS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `data=${encodeURIComponent(buildQuery(bbox))}`,
    })

    if (!response.ok) return []

    const data = await response.json()
    const features: OsmFeature[] = []

    for (const element of data.elements) {
      if (!element.tags || !element.geometry) continue

      const classification = classifyFeature(element.tags)
      if (!classification) continue

      features.push({
        ...classification,
        geometry: element.geometry.map((g: { lat: number; lon: number }) => [g.lon, g.lat]),
        tags: element.tags,
      })
    }

    return features
  } catch {
    return []
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/services/overpass.test.ts
```

Expected: 2 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/overpass.ts src/services/overpass.test.ts
git commit -m "add Overpass API service for fetching OSM map data"
```

---

## Task 7: OSM-to-SVG Transformer

**Files:**
- Create: `src/lib/osm-to-svg.ts`, `src/lib/osm-to-svg.test.ts`

- [ ] **Step 1: Write failing test for coordinate-to-SVG projection**

```ts
// src/lib/osm-to-svg.test.ts
import { describe, it, expect } from 'vitest'
import { projectToSvg, featuresToSvgPaths } from './osm-to-svg'
import type { BBox, OsmFeature, StylePreset } from '../types'

const bbox: BBox = { south: 40.7, north: 40.72, west: -74.01, east: -73.99 }
const svgSize = { width: 600, height: 800 }

describe('projectToSvg', () => {
  it('projects lat/lng to SVG pixel coordinates', () => {
    // Bottom-left corner of bbox → (0, 800)
    const bottomLeft = projectToSvg(-74.01, 40.7, bbox, svgSize)
    expect(bottomLeft.x).toBeCloseTo(0, 0)
    expect(bottomLeft.y).toBeCloseTo(800, 0)

    // Top-right corner of bbox → (600, 0)
    const topRight = projectToSvg(-73.99, 40.72, bbox, svgSize)
    expect(topRight.x).toBeCloseTo(600, 0)
    expect(topRight.y).toBeCloseTo(0, 0)

    // Center → (300, 400)
    const center = projectToSvg(-74.0, 40.71, bbox, svgSize)
    expect(center.x).toBeCloseTo(300, 0)
    expect(center.y).toBeCloseTo(400, 0)
  })
})

describe('featuresToSvgPaths', () => {
  it('converts street features to SVG path strings with correct styles', () => {
    const features: OsmFeature[] = [
      {
        type: 'street',
        importance: 'major',
        geometry: [[-74.01, 40.7], [-73.99, 40.72]],
        tags: { highway: 'primary' },
      },
    ]

    const preset: StylePreset = {
      id: 'test',
      name: 'Test',
      colors: {
        background: '#fff', water: '#00f', land: '#fff', park: '#0f0',
        building: '#ccc', streetMajor: '#000', streetMinor: '#999',
        text: '#000', textSecondary: '#666', pin: '#f00',
      },
      streetWidths: { major: 2, minor: 0.5 },
    }

    const paths = featuresToSvgPaths(features, bbox, svgSize, preset)

    expect(paths).toHaveLength(1)
    expect(paths[0].d).toContain('M')
    expect(paths[0].d).toContain('L')
    expect(paths[0].stroke).toBe('#000')
    expect(paths[0].strokeWidth).toBe(2)
    expect(paths[0].fill).toBe('none')
  })

  it('converts water/park features to filled closed paths', () => {
    const features: OsmFeature[] = [
      {
        type: 'water',
        importance: 'major',
        geometry: [[-74.005, 40.71], [-74.0, 40.715], [-73.995, 40.71], [-74.005, 40.71]],
        tags: { natural: 'water' },
      },
    ]

    const preset: StylePreset = {
      id: 'test', name: 'Test',
      colors: {
        background: '#fff', water: '#0055aa', land: '#fff', park: '#0f0',
        building: '#ccc', streetMajor: '#000', streetMinor: '#999',
        text: '#000', textSecondary: '#666', pin: '#f00',
      },
      streetWidths: { major: 2, minor: 0.5 },
    }

    const paths = featuresToSvgPaths(features, bbox, svgSize, preset)

    expect(paths).toHaveLength(1)
    expect(paths[0].fill).toBe('#0055aa')
    expect(paths[0].stroke).toBe('none')
    expect(paths[0].d).toContain('Z')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/lib/osm-to-svg.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement OSM-to-SVG transformer**

```ts
// src/lib/osm-to-svg.ts
import type { BBox, OsmFeature, StylePreset } from '../types'

export interface SvgSize {
  width: number
  height: number
}

export interface SvgPath {
  d: string
  fill: string
  stroke: string
  strokeWidth: number
  layer: OsmFeature['type']
}

export function projectToSvg(
  lng: number,
  lat: number,
  bbox: BBox,
  size: SvgSize,
): { x: number; y: number } {
  const x = ((lng - bbox.west) / (bbox.east - bbox.west)) * size.width
  const y = ((bbox.north - lat) / (bbox.north - bbox.south)) * size.height
  return { x, y }
}

function geometryToPath(
  geometry: Array<[number, number]>,
  bbox: BBox,
  size: SvgSize,
  closed: boolean,
): string {
  const points = geometry.map(([lng, lat]) => projectToSvg(lng, lat, bbox, size))
  if (points.length === 0) return ''

  const parts = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(2)},${p.y.toFixed(2)}`)
  if (closed) parts.push('Z')
  return parts.join(' ')
}

function getStyle(
  feature: OsmFeature,
  preset: StylePreset,
): { fill: string; stroke: string; strokeWidth: number } {
  switch (feature.type) {
    case 'street':
      return {
        fill: 'none',
        stroke: feature.importance === 'major' ? preset.colors.streetMajor : preset.colors.streetMinor,
        strokeWidth: feature.importance === 'major' ? preset.streetWidths.major : preset.streetWidths.minor,
      }
    case 'water':
      return { fill: preset.colors.water, stroke: 'none', strokeWidth: 0 }
    case 'park':
      return { fill: preset.colors.park, stroke: 'none', strokeWidth: 0 }
    case 'building':
      return { fill: preset.colors.building, stroke: 'none', strokeWidth: 0 }
    case 'land':
      return { fill: preset.colors.land, stroke: 'none', strokeWidth: 0 }
  }
}

export function featuresToSvgPaths(
  features: OsmFeature[],
  bbox: BBox,
  size: SvgSize,
  preset: StylePreset,
): SvgPath[] {
  return features.map((feature) => {
    const closed = feature.type !== 'street'
    const style = getStyle(feature, preset)
    return {
      d: geometryToPath(feature.geometry, bbox, size, closed),
      ...style,
      layer: feature.type,
    }
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/lib/osm-to-svg.test.ts
```

Expected: 4 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/osm-to-svg.ts src/lib/osm-to-svg.test.ts
git commit -m "add OSM-to-SVG transformer for map rendering pipeline"
```

---

## Task 8: Poster Components (MapSvg, PinMarker, PinLegend, PosterText, PosterCanvas)

**Files:**
- Create: `src/components/poster/MapSvg.tsx`, `src/components/poster/PinMarker.tsx`, `src/components/poster/PinLegend.tsx`, `src/components/poster/PosterText.tsx`, `src/components/poster/PosterCanvas.tsx`, `src/components/poster/PosterCanvas.test.tsx`

- [ ] **Step 1: Write failing test for PosterCanvas**

```tsx
// src/components/poster/PosterCanvas.test.tsx
import { render, screen } from '@testing-library/react'
import { PosterCanvas } from './PosterCanvas'
import type { PosterConfig } from '../../types'
import { minimal } from '../../presets/minimal'

test('renders poster with title and subtitle', () => {
  const config: PosterConfig = {
    pins: [{ id: '1', location: { lat: 40.7, lng: -74.0 }, label: 'The Wren', color: '#e74c3c' }],
    pinMode: 'single',
    bbox: { south: 40.69, north: 40.71, west: -74.01, east: -73.99 },
    preset: minimal,
    text: { title: 'The Wren', subtitle: 'Bowery, New York', showCoordinates: true },
  }

  render(<PosterCanvas config={config} features={[]} />)

  expect(screen.getByText('The Wren')).toBeInTheDocument()
  expect(screen.getByText('Bowery, New York')).toBeInTheDocument()
})

test('renders pin legend in multi mode with multiple pins', () => {
  const config: PosterConfig = {
    pins: [
      { id: '1', location: { lat: 40.7, lng: -74.0 }, label: 'Where we met', color: '#e74c3c' },
      { id: '2', location: { lat: 40.72, lng: -73.98 }, label: 'First date', color: '#3498db' },
    ],
    pinMode: 'multi',
    bbox: { south: 40.69, north: 40.73, west: -74.02, east: -73.97 },
    preset: minimal,
    text: { title: 'Our Story', subtitle: 'New York City', showCoordinates: false },
  }

  render(<PosterCanvas config={config} features={[]} />)

  expect(screen.getByText('Where we met')).toBeInTheDocument()
  expect(screen.getByText('First date')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/components/poster/PosterCanvas.test.tsx
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement MapSvg**

```tsx
// src/components/poster/MapSvg.tsx
import type { BBox, OsmFeature, StylePreset } from '../../types'
import { featuresToSvgPaths, type SvgSize } from '../../lib/osm-to-svg'

interface MapSvgProps {
  features: OsmFeature[]
  bbox: BBox
  preset: StylePreset
  size: SvgSize
}

const LAYER_ORDER: OsmFeature['type'][] = ['land', 'water', 'park', 'building', 'street']

export function MapSvg({ features, bbox, preset, size }: MapSvgProps) {
  const paths = featuresToSvgPaths(features, bbox, size, preset)

  const grouped = LAYER_ORDER.map((layer) => ({
    layer,
    paths: paths.filter((p) => p.layer === layer),
  }))

  return (
    <svg
      viewBox={`0 0 ${size.width} ${size.height}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ width: '100%', height: '100%' }}
    >
      <rect width={size.width} height={size.height} fill={preset.colors.land} />
      {grouped.map(({ layer, paths }) => (
        <g key={layer} data-layer={layer}>
          {paths.map((path, i) => (
            <path
              key={i}
              d={path.d}
              fill={path.fill}
              stroke={path.stroke}
              strokeWidth={path.strokeWidth}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ))}
        </g>
      ))}
    </svg>
  )
}
```

- [ ] **Step 4: Implement PinMarker**

```tsx
// src/components/poster/PinMarker.tsx
import type { LatLng, BBox } from '../../types'
import { projectToSvg, type SvgSize } from '../../lib/osm-to-svg'

interface PinMarkerProps {
  location: LatLng
  color: string
  bbox: BBox
  size: SvgSize
  label?: string
  index?: number
}

export function PinMarker({ location, color, bbox, size, index }: PinMarkerProps) {
  const { x, y } = projectToSvg(location.lng, location.lat, bbox, size)

  return (
    <g>
      <circle cx={x} cy={y} r={8} fill={color} opacity={0.25} />
      <circle cx={x} cy={y} r={4} fill={color} />
      {index !== undefined && (
        <text
          x={x + 12}
          y={y + 4}
          fill={color}
          fontSize={10}
          fontWeight={600}
          fontFamily="Inter, sans-serif"
        >
          {index + 1}
        </text>
      )}
    </g>
  )
}
```

- [ ] **Step 5: Implement PinLegend**

```tsx
// src/components/poster/PinLegend.tsx
import type { Pin } from '../../types'

interface PinLegendProps {
  pins: Pin[]
  textColor: string
  secondaryColor: string
}

export function PinLegend({ pins, textColor, secondaryColor }: PinLegendProps) {
  if (pins.length <= 1) return null

  return (
    <div className="pin-legend" style={{ display: 'flex', justifyContent: 'center', gap: 12, flexWrap: 'wrap' }}>
      {pins.map((pin) => (
        <div
          key={pin.id}
          style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: secondaryColor }}
        >
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: pin.color,
              display: 'inline-block',
            }}
          />
          {pin.label}
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 6: Implement PosterText**

```tsx
// src/components/poster/PosterText.tsx
import type { PosterText as PosterTextType, LatLng } from '../../types'

interface PosterTextProps {
  text: PosterTextType
  location: LatLng
  textColor: string
  secondaryColor: string
}

function formatCoords(lat: number, lng: number): string {
  const latDir = lat >= 0 ? 'N' : 'S'
  const lngDir = lng >= 0 ? 'E' : 'W'
  return `${Math.abs(lat).toFixed(4)}° ${latDir}, ${Math.abs(lng).toFixed(4)}° ${lngDir}`
}

export function PosterText({ text, location, textColor, secondaryColor }: PosterTextProps) {
  return (
    <div className="poster-text" style={{ textAlign: 'center' }}>
      <div
        style={{
          fontSize: 18,
          fontWeight: 300,
          letterSpacing: 6,
          textTransform: 'uppercase' as const,
          color: textColor,
          marginBottom: 4,
          fontFamily: "'Playfair Display', serif",
        }}
      >
        {text.title}
      </div>
      {text.subtitle && (
        <div
          style={{
            fontSize: 10,
            letterSpacing: 2,
            textTransform: 'uppercase' as const,
            color: secondaryColor,
            marginBottom: 2,
          }}
        >
          {text.subtitle}
        </div>
      )}
      {text.showCoordinates && (
        <div
          style={{
            fontSize: 8,
            fontFamily: "'Space Mono', monospace",
            letterSpacing: 1.5,
            color: secondaryColor,
            opacity: 0.7,
          }}
        >
          {formatCoords(location.lat, location.lng)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 7: Implement PosterCanvas**

```tsx
// src/components/poster/PosterCanvas.tsx
import type { PosterConfig, OsmFeature } from '../../types'
import { MapSvg } from './MapSvg'
import { PinMarker } from './PinMarker'
import { PinLegend } from './PinLegend'
import { PosterText } from './PosterText'
import { projectToSvg, type SvgSize } from '../../lib/osm-to-svg'

interface PosterCanvasProps {
  config: PosterConfig
  features: OsmFeature[]
}

const SVG_SIZE: SvgSize = { width: 600, height: 800 }
const POSTER_ASPECT = '3 / 4'

export function PosterCanvas({ config, features }: PosterCanvasProps) {
  const { pins, pinMode, bbox, preset, text } = config

  if (!bbox || !preset) return null

  const primaryPin = pins[0]

  return (
    <div
      className="poster-canvas"
      id="poster-export-target"
      style={{
        aspectRatio: POSTER_ASPECT,
        background: preset.colors.background,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        position: 'relative',
        maxHeight: '80vh',
      }}
    >
      <div style={{ flex: 1, position: 'relative' }}>
        <MapSvg features={features} bbox={bbox} preset={preset} size={SVG_SIZE} />
        <svg
          viewBox={`0 0 ${SVG_SIZE.width} ${SVG_SIZE.height}`}
          style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }}
        >
          {pinMode === 'multi' && pins.length > 1 && (
            <path
              d={pins
                .map((pin, i) => {
                  const { x, y } = projectToSvg(pin.location.lng, pin.location.lat, bbox, SVG_SIZE)
                  return `${i === 0 ? 'M' : 'L'}${x.toFixed(2)},${y.toFixed(2)}`
                })
                .join(' ')}
              fill="none"
              stroke="rgba(255,255,255,0.2)"
              strokeWidth={1.5}
              strokeDasharray="6 4"
            />
          )}
          {pins.map((pin, i) => (
            <PinMarker
              key={pin.id}
              location={pin.location}
              color={pin.color}
              bbox={bbox}
              size={SVG_SIZE}
              index={pinMode === 'multi' ? i : undefined}
            />
          ))}
        </svg>
      </div>

      <div style={{ padding: '12px 16px 16px' }}>
        {pinMode === 'multi' && (
          <PinLegend
            pins={pins}
            textColor={preset.colors.text}
            secondaryColor={preset.colors.textSecondary}
          />
        )}
        <PosterText
          text={text}
          location={primaryPin?.location ?? { lat: 0, lng: 0 }}
          textColor={preset.colors.text}
          secondaryColor={preset.colors.textSecondary}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Run tests to verify they pass**

```bash
npx vitest run src/components/poster/PosterCanvas.test.tsx
```

Expected: 2 tests pass.

- [ ] **Step 9: Commit**

```bash
git add src/components/poster/
git commit -m "add poster rendering components: MapSvg, PinMarker, PinLegend, PosterText, PosterCanvas"
```

---

## Task 9: Export Service (PNG + PDF)

**Files:**
- Create: `src/services/export.ts`, `src/services/export.test.ts`

- [ ] **Step 1: Write failing test for export service**

```ts
// src/services/export.test.ts
import { describe, it, expect, vi } from 'vitest'
import { generateFilename } from './export'

describe('generateFilename', () => {
  it('generates filename from title', () => {
    expect(generateFilename('The Wren', 'png')).toBe('the-wren-poster.png')
  })

  it('handles special characters', () => {
    expect(generateFilename("Joe's Bar & Grill", 'pdf')).toBe('joes-bar--grill-poster.pdf')
  })

  it('handles empty title', () => {
    expect(generateFilename('', 'png')).toBe('map-poster.png')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/services/export.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement export service**

```ts
// src/services/export.ts
import { toPng } from 'html-to-image'
import { jsPDF } from 'jspdf'

export function generateFilename(title: string, ext: string): string {
  if (!title.trim()) return `map-poster.${ext}`
  const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')
  return `${slug}-poster.${ext}`
}

export async function exportPng(elementId: string, title: string): Promise<void> {
  const element = document.getElementById(elementId)
  if (!element) throw new Error(`Element #${elementId} not found`)

  const dataUrl = await toPng(element, {
    pixelRatio: 3,
    quality: 1,
  })

  const link = document.createElement('a')
  link.download = generateFilename(title, 'png')
  link.href = dataUrl
  link.click()
}

export async function exportPdf(elementId: string, title: string): Promise<void> {
  const element = document.getElementById(elementId)
  if (!element) throw new Error(`Element #${elementId} not found`)

  const dataUrl = await toPng(element, {
    pixelRatio: 3,
    quality: 1,
  })

  // 18x24 inch poster at 72 DPI for PDF
  const pdf = new jsPDF({
    orientation: 'portrait',
    unit: 'in',
    format: [18, 24],
  })

  pdf.addImage(dataUrl, 'PNG', 0, 0, 18, 24)
  pdf.save(generateFilename(title, 'pdf'))
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/services/export.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/export.ts src/services/export.test.ts
git commit -m "add export service for PNG and PDF download"
```

---

## Task 10: Poster Config Hook

**Files:**
- Create: `src/hooks/usePosterConfig.ts`, `src/hooks/usePosterConfig.test.ts`

- [ ] **Step 1: Write failing test for poster config hook**

```tsx
// src/hooks/usePosterConfig.test.ts
import { renderHook, act } from '@testing-library/react'
import { usePosterConfig } from './usePosterConfig'

describe('usePosterConfig', () => {
  it('initializes with empty config', () => {
    const { result } = renderHook(() => usePosterConfig())
    expect(result.current.config.pins).toEqual([])
    expect(result.current.config.preset).toBeNull()
  })

  it('addPin adds a pin with auto-generated color', () => {
    const { result } = renderHook(() => usePosterConfig())

    act(() => {
      result.current.addPin({ lat: 40.7, lng: -74.0 }, 'The Wren')
    })

    expect(result.current.config.pins).toHaveLength(1)
    expect(result.current.config.pins[0].label).toBe('The Wren')
    expect(result.current.config.pins[0].color).toBeTruthy()
  })

  it('removePin removes by id', () => {
    const { result } = renderHook(() => usePosterConfig())

    act(() => {
      result.current.addPin({ lat: 40.7, lng: -74.0 }, 'Pin A')
      result.current.addPin({ lat: 40.8, lng: -73.9 }, 'Pin B')
    })

    const idToRemove = result.current.config.pins[0].id

    act(() => {
      result.current.removePin(idToRemove)
    })

    expect(result.current.config.pins).toHaveLength(1)
    expect(result.current.config.pins[0].label).toBe('Pin B')
  })

  it('enforces max 5 pins', () => {
    const { result } = renderHook(() => usePosterConfig())

    act(() => {
      for (let i = 0; i < 6; i++) {
        result.current.addPin({ lat: 40 + i * 0.01, lng: -74 }, `Pin ${i}`)
      }
    })

    expect(result.current.config.pins).toHaveLength(5)
  })

  it('setPreset updates preset', () => {
    const { result } = renderHook(() => usePosterConfig())
    const preset = {
      id: 'test', name: 'Test',
      colors: {
        background: '#fff', water: '#00f', land: '#fff', park: '#0f0',
        building: '#ccc', streetMajor: '#000', streetMinor: '#999',
        text: '#000', textSecondary: '#666', pin: '#f00',
      },
      streetWidths: { major: 2, minor: 0.5 },
    }

    act(() => {
      result.current.setPreset(preset)
    })

    expect(result.current.config.preset).toEqual(preset)
  })

  it('setText updates text fields', () => {
    const { result } = renderHook(() => usePosterConfig())

    act(() => {
      result.current.setText({ title: 'Brooklyn', subtitle: 'Our Home', showCoordinates: false })
    })

    expect(result.current.config.text.title).toBe('Brooklyn')
    expect(result.current.config.text.showCoordinates).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run src/hooks/usePosterConfig.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement poster config hook**

```ts
// src/hooks/usePosterConfig.ts
import { useState, useCallback } from 'react'
import type { PosterConfig, Pin, LatLng, StylePreset, PosterText, BBox, PinMode } from '../types'

const PIN_COLORS = ['#e74c3c', '#3498db', '#2ecc71', '#f39c12', '#9b59b6']
const MAX_PINS = 5

const initialConfig: PosterConfig = {
  pins: [],
  pinMode: 'single',
  bbox: null,
  preset: null,
  text: { title: '', subtitle: '', showCoordinates: true },
}

let pinCounter = 0

export function usePosterConfig() {
  const [config, setConfig] = useState<PosterConfig>(initialConfig)

  const addPin = useCallback((location: LatLng, label: string) => {
    setConfig((prev) => {
      if (prev.pins.length >= MAX_PINS) return prev
      const pin: Pin = {
        id: `pin-${++pinCounter}`,
        location,
        label,
        color: PIN_COLORS[prev.pins.length % PIN_COLORS.length],
      }
      return { ...prev, pins: [...prev.pins, pin] }
    })
  }, [])

  const removePin = useCallback((id: string) => {
    setConfig((prev) => ({
      ...prev,
      pins: prev.pins.filter((p) => p.id !== id),
    }))
  }, [])

  const setPinMode = useCallback((pinMode: PinMode) => {
    setConfig((prev) => ({ ...prev, pinMode }))
  }, [])

  const setBBox = useCallback((bbox: BBox) => {
    setConfig((prev) => ({ ...prev, bbox }))
  }, [])

  const setPreset = useCallback((preset: StylePreset) => {
    setConfig((prev) => ({ ...prev, preset }))
  }, [])

  const setText = useCallback((text: PosterText) => {
    setConfig((prev) => ({ ...prev, text }))
  }, [])

  const reset = useCallback(() => {
    setConfig(initialConfig)
  }, [])

  return { config, addPin, removePin, setPinMode, setBBox, setPreset, setText, reset }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run src/hooks/usePosterConfig.test.ts
```

Expected: 5 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/usePosterConfig.ts src/hooks/usePosterConfig.test.ts
git commit -m "add usePosterConfig hook for central poster state management"
```

---

## Task 11: Overpass Data Hook

**Files:**
- Create: `src/hooks/useOverpassData.ts`

- [ ] **Step 1: Implement the hook**

```ts
// src/hooks/useOverpassData.ts
import { useState, useEffect, useRef } from 'react'
import { fetchMapData } from '../services/overpass'
import type { BBox, OsmFeature } from '../types'

export function useOverpassData(bbox: BBox | null) {
  const [features, setFeatures] = useState<OsmFeature[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastBBoxRef = useRef<string>('')

  useEffect(() => {
    if (!bbox) return

    const bboxKey = `${bbox.south},${bbox.west},${bbox.north},${bbox.east}`
    if (bboxKey === lastBBoxRef.current) return
    lastBBoxRef.current = bboxKey

    let cancelled = false
    setLoading(true)
    setError(null)

    fetchMapData(bbox).then((data) => {
      if (cancelled) return
      if (data.length === 0) {
        setError('No map data found for this area')
      }
      setFeatures(data)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [bbox])

  return { features, loading, error }
}
```

- [ ] **Step 2: Commit**

```bash
git add src/hooks/useOverpassData.ts
git commit -m "add useOverpassData hook for fetching map features"
```

---

## Task 12: Wizard Steps (SearchStep, FrameStep, StyleStep, TextStep, PreviewStep, ExportStep)

**Files:**
- Create: `src/components/wizard/WizardShell.tsx`, `src/components/wizard/SearchStep.tsx`, `src/components/wizard/FrameStep.tsx`, `src/components/wizard/StyleStep.tsx`, `src/components/wizard/TextStep.tsx`, `src/components/wizard/PreviewStep.tsx`, `src/components/wizard/ExportStep.tsx`, `src/components/ui/PresetCard.tsx`

- [ ] **Step 1: Implement WizardShell**

```tsx
// src/components/wizard/WizardShell.tsx
import type { WizardStep } from '../../types'

const STEPS: { key: WizardStep; label: string }[] = [
  { key: 'search', label: 'Search' },
  { key: 'frame', label: 'Frame' },
  { key: 'style', label: 'Style' },
  { key: 'text', label: 'Text' },
  { key: 'preview', label: 'Preview' },
  { key: 'export', label: 'Export' },
]

interface WizardShellProps {
  currentStep: WizardStep
  onBack: () => void
  onNext: () => void
  canGoNext: boolean
  children: React.ReactNode
}

export function WizardShell({ currentStep, onBack, onNext, canGoNext, children }: WizardShellProps) {
  const currentIndex = STEPS.findIndex((s) => s.key === currentStep)

  return (
    <div className="wizard-shell">
      <nav className="wizard-nav">
        {STEPS.map((step, i) => (
          <div
            key={step.key}
            className={`wizard-step-indicator ${i === currentIndex ? 'active' : ''} ${i < currentIndex ? 'completed' : ''}`}
          >
            <span className="step-number">{i + 1}</span>
            <span className="step-label">{step.label}</span>
          </div>
        ))}
      </nav>

      <div className="wizard-content">{children}</div>

      <div className="wizard-actions">
        {currentIndex > 0 && (
          <button className="btn-back" onClick={onBack}>Back</button>
        )}
        {currentIndex < STEPS.length - 1 && (
          <button className="btn-next" onClick={onNext} disabled={!canGoNext}>
            Next
          </button>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Implement SearchStep**

```tsx
// src/components/wizard/SearchStep.tsx
import { useState } from 'react'
import { SearchBar } from '../ui/SearchBar'
import { useGeocoding } from '../../hooks/useGeocoding'
import type { GeocodingResult, LatLng, BBox } from '../../types'

interface SearchStepProps {
  onSelect: (location: LatLng, name: string, bbox: BBox) => void
}

export function SearchStep({ onSelect }: SearchStepProps) {
  const [query, setQuery] = useState('')
  const { results, loading } = useGeocoding(query)

  function handleSelect(result: GeocodingResult) {
    const name = result.displayName.split(',')[0]
    onSelect({ lat: result.lat, lng: result.lng }, name, result.boundingBox)
  }

  return (
    <div className="search-step">
      <h1 className="hero-title">Search a place that matters</h1>
      <SearchBar
        query={query}
        onQueryChange={setQuery}
        results={results}
        loading={loading}
        onSelect={handleSelect}
      />
    </div>
  )
}
```

- [ ] **Step 3: Implement FrameStep**

```tsx
// src/components/wizard/FrameStep.tsx
import { useState, useEffect, useRef } from 'react'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import { SearchBar } from '../ui/SearchBar'
import { useGeocoding } from '../../hooks/useGeocoding'
import type { BBox, LatLng, PinMode, GeocodingResult } from '../../types'

interface FrameStepProps {
  initialCenter: LatLng
  initialBBox: BBox
  pinMode: PinMode
  onPinModeChange: (mode: PinMode) => void
  onBBoxChange: (bbox: BBox) => void
  onAddPin: (location: LatLng, label: string) => void
  pins: Array<{ location: LatLng; color: string; label: string }>
}

export function FrameStep({
  initialCenter,
  initialBBox,
  pinMode,
  onPinModeChange,
  onBBoxChange,
  onAddPin,
  pins,
}: FrameStepProps) {
  const mapContainer = useRef<HTMLDivElement>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const [addQuery, setAddQuery] = useState('')
  const { results: addResults, loading: addLoading } = useGeocoding(addQuery)

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return

    const map = new maplibregl.Map({
      container: mapContainer.current,
      style: 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
      center: [initialCenter.lng, initialCenter.lat],
      zoom: 13,
    })

    map.fitBounds(
      [[initialBBox.west, initialBBox.south], [initialBBox.east, initialBBox.north]],
      { padding: 40 },
    )

    map.on('moveend', () => {
      const bounds = map.getBounds()
      onBBoxChange({
        south: bounds.getSouth(),
        north: bounds.getNorth(),
        west: bounds.getWest(),
        east: bounds.getEast(),
      })
    })

    mapRef.current = map

    return () => { map.remove() }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function handleAddPinSelect(result: GeocodingResult) {
    const name = result.displayName.split(',')[0]
    onAddPin({ lat: result.lat, lng: result.lng }, name)
    setAddQuery('')
  }

  return (
    <div className="frame-step">
      <div className="frame-controls">
        <label>
          <input
            type="radio"
            checked={pinMode === 'single'}
            onChange={() => onPinModeChange('single')}
          />
          Single Pin
        </label>
        <label>
          <input
            type="radio"
            checked={pinMode === 'multi'}
            onChange={() => onPinModeChange('multi')}
          />
          Multi Pin
        </label>
      </div>

      {pinMode === 'multi' && (
        <div className="multi-pin-controls">
          <SearchBar
            query={addQuery}
            onQueryChange={setAddQuery}
            results={addResults}
            loading={addLoading}
            onSelect={handleAddPinSelect}
            placeholder="Add another location..."
          />
          <div className="pin-list">
            {pins.map((pin) => (
              <span key={pin.label} className="pin-tag" style={{ borderColor: pin.color, color: pin.color }}>
                {pin.label}
              </span>
            ))}
          </div>
          {pins.length >= 5 && <p className="pin-limit-hint">Maximum 5 pins reached</p>}
        </div>
      )}

      <div ref={mapContainer} className="map-container" style={{ width: '100%', height: 500 }} />
      <p className="frame-hint">Pan and zoom to frame your poster</p>
    </div>
  )
}
```

- [ ] **Step 4: Implement PresetCard and StyleStep**

```tsx
// src/components/ui/PresetCard.tsx
import type { StylePreset } from '../../types'

interface PresetCardProps {
  preset: StylePreset
  selected: boolean
  onClick: () => void
}

export function PresetCard({ preset, selected, onClick }: PresetCardProps) {
  return (
    <button
      className={`preset-card ${selected ? 'selected' : ''}`}
      onClick={onClick}
      style={{
        background: preset.colors.background,
        border: selected ? '2px solid #a78bfa' : '2px solid transparent',
        borderRadius: 8,
        padding: 12,
        cursor: 'pointer',
        minWidth: 120,
      }}
    >
      <div style={{ width: 80, height: 100, position: 'relative', margin: '0 auto 8px' }}>
        <svg viewBox="0 0 80 100" style={{ width: '100%', height: '100%' }}>
          <rect width={80} height={100} fill={preset.colors.land} />
          <rect y={70} width={80} height={30} fill={preset.colors.water} />
          <rect x={20} y={30} width={25} height={20} rx={2} fill={preset.colors.park} />
          <line x1={0} y1={50} x2={80} y2={50} stroke={preset.colors.streetMajor} strokeWidth={preset.streetWidths.major} />
          <line x1={40} y1={0} x2={40} y2={100} stroke={preset.colors.streetMajor} strokeWidth={preset.streetWidths.major} />
          <line x1={0} y1={25} x2={80} y2={25} stroke={preset.colors.streetMinor} strokeWidth={preset.streetWidths.minor} />
          <line x1={20} y1={0} x2={20} y2={100} stroke={preset.colors.streetMinor} strokeWidth={preset.streetWidths.minor} />
          <line x1={65} y1={0} x2={65} y2={100} stroke={preset.colors.streetMinor} strokeWidth={preset.streetWidths.minor} />
        </svg>
      </div>
      <div style={{ color: preset.colors.text, fontSize: 12, fontWeight: 500 }}>{preset.name}</div>
    </button>
  )
}
```

```tsx
// src/components/wizard/StyleStep.tsx
import { presets } from '../../presets'
import { PresetCard } from '../ui/PresetCard'
import type { StylePreset } from '../../types'

interface StyleStepProps {
  selected: StylePreset | null
  onSelect: (preset: StylePreset) => void
}

export function StyleStep({ selected, onSelect }: StyleStepProps) {
  return (
    <div className="style-step">
      <h2>Choose a style</h2>
      <div className="preset-grid" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', justifyContent: 'center' }}>
        {presets.map((preset) => (
          <PresetCard
            key={preset.id}
            preset={preset}
            selected={selected?.id === preset.id}
            onClick={() => onSelect(preset)}
          />
        ))}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Implement TextStep**

```tsx
// src/components/wizard/TextStep.tsx
import type { PosterText } from '../../types'

interface TextStepProps {
  text: PosterText
  onChange: (text: PosterText) => void
}

export function TextStep({ text, onChange }: TextStepProps) {
  return (
    <div className="text-step">
      <h2>Customize text</h2>
      <div className="text-fields" style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 400 }}>
        <label>
          Place name
          <input
            type="text"
            value={text.title}
            onChange={(e) => onChange({ ...text, title: e.target.value })}
            placeholder="e.g. Brooklyn"
          />
        </label>
        <label>
          Subtitle
          <input
            type="text"
            value={text.subtitle}
            onChange={(e) => onChange({ ...text, subtitle: e.target.value })}
            placeholder="e.g. Our Home • 2024"
          />
        </label>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="checkbox"
            checked={text.showCoordinates}
            onChange={(e) => onChange({ ...text, showCoordinates: e.target.checked })}
          />
          Show coordinates
        </label>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Implement PreviewStep and ExportStep**

```tsx
// src/components/wizard/PreviewStep.tsx
import { PosterCanvas } from '../poster/PosterCanvas'
import type { PosterConfig, OsmFeature } from '../../types'

interface PreviewStepProps {
  config: PosterConfig
  features: OsmFeature[]
}

export function PreviewStep({ config, features }: PreviewStepProps) {
  return (
    <div className="preview-step" style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 450, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <PosterCanvas config={config} features={features} />
      </div>
    </div>
  )
}
```

```tsx
// src/components/wizard/ExportStep.tsx
import { useState } from 'react'
import { PosterCanvas } from '../poster/PosterCanvas'
import { exportPng, exportPdf } from '../../services/export'
import type { PosterConfig, OsmFeature } from '../../types'

interface ExportStepProps {
  config: PosterConfig
  features: OsmFeature[]
}

export function ExportStep({ config, features }: ExportStepProps) {
  const [exporting, setExporting] = useState(false)

  async function handleExport(format: 'png' | 'pdf') {
    setExporting(true)
    try {
      if (format === 'png') {
        await exportPng('poster-export-target', config.text.title)
      } else {
        await exportPdf('poster-export-target', config.text.title)
      }
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="export-step" style={{ display: 'flex', gap: 32, justifyContent: 'center', padding: 24 }}>
      <div style={{ maxWidth: 350, width: '100%', boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
        <PosterCanvas config={config} features={features} />
      </div>
      <div className="export-actions" style={{ display: 'flex', flexDirection: 'column', gap: 12, justifyContent: 'center' }}>
        <h2>Download your poster</h2>
        <button
          className="btn-export"
          onClick={() => handleExport('png')}
          disabled={exporting}
        >
          {exporting ? 'Generating...' : 'Download PNG'}
        </button>
        <button
          className="btn-export"
          onClick={() => handleExport('pdf')}
          disabled={exporting}
        >
          {exporting ? 'Generating...' : 'Download PDF'}
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Commit**

```bash
git add src/components/wizard/ src/components/ui/PresetCard.tsx
git commit -m "add all wizard step components: search, frame, style, text, preview, export"
```

---

## Task 13: Wire Up App.tsx (Full Wizard Flow)

**Files:**
- Modify: `src/App.tsx`
- Create: `src/App.css`

- [ ] **Step 1: Implement full App with wizard flow**

Replace `src/App.tsx`:

```tsx
import { useState, useCallback } from 'react'
import type { WizardStep, BBox, LatLng, OsmFeature } from './types'
import { usePosterConfig } from './hooks/usePosterConfig'
import { useOverpassData } from './hooks/useOverpassData'
import { constrainToAspectRatio, padBBox, fitBoundsToPoints } from './lib/bounds'
import { WizardShell } from './components/wizard/WizardShell'
import { SearchStep } from './components/wizard/SearchStep'
import { FrameStep } from './components/wizard/FrameStep'
import { StyleStep } from './components/wizard/StyleStep'
import { TextStep } from './components/wizard/TextStep'
import { PreviewStep } from './components/wizard/PreviewStep'
import { ExportStep } from './components/wizard/ExportStep'
import { presets } from './presets'
import './App.css'

const STEP_ORDER: WizardStep[] = ['search', 'frame', 'style', 'text', 'preview', 'export']

export default function App() {
  const [step, setStep] = useState<WizardStep>('search')
  const [initialCenter, setInitialCenter] = useState<LatLng | null>(null)
  const [initialBBox, setInitialBBox] = useState<BBox | null>(null)

  const { config, addPin, removePin, setPinMode, setBBox, setPreset, setText, reset } = usePosterConfig()

  const posterBBox = config.bbox
    ? constrainToAspectRatio(config.bbox, 3 / 4)
    : null
  const { features, loading: mapLoading } = useOverpassData(posterBBox)

  const goNext = useCallback(() => {
    const i = STEP_ORDER.indexOf(step)
    if (i < STEP_ORDER.length - 1) setStep(STEP_ORDER[i + 1])
  }, [step])

  const goBack = useCallback(() => {
    const i = STEP_ORDER.indexOf(step)
    if (i > 0) setStep(STEP_ORDER[i - 1])
  }, [step])

  function handleSearchSelect(location: LatLng, name: string, bbox: BBox) {
    addPin(location, name)
    setBBox(bbox)
    setText({ title: name, subtitle: '', showCoordinates: true })
    setInitialCenter(location)
    setInitialBBox(bbox)
    if (!config.preset) setPreset(presets[0])
    goNext()
  }

  function handleBBoxChange(bbox: BBox) {
    setBBox(bbox)
  }

  function canGoNext(): boolean {
    switch (step) {
      case 'search': return config.pins.length > 0
      case 'frame': return config.bbox !== null
      case 'style': return config.preset !== null
      case 'text': return config.text.title.trim().length > 0
      case 'preview': return true
      default: return false
    }
  }

  return (
    <div className="app">
      <WizardShell
        currentStep={step}
        onBack={goBack}
        onNext={goNext}
        canGoNext={canGoNext()}
      >
        {step === 'search' && (
          <SearchStep onSelect={handleSearchSelect} />
        )}

        {step === 'frame' && initialCenter && initialBBox && (
          <FrameStep
            initialCenter={initialCenter}
            initialBBox={initialBBox}
            pinMode={config.pinMode}
            onPinModeChange={setPinMode}
            onBBoxChange={handleBBoxChange}
            onAddPin={addPin}
            pins={config.pins}
          />
        )}

        {step === 'style' && (
          <StyleStep selected={config.preset} onSelect={setPreset} />
        )}

        {step === 'text' && (
          <TextStep text={config.text} onChange={setText} />
        )}

        {step === 'preview' && (
          <>
            {mapLoading && <div className="loading">Loading map data...</div>}
            <PreviewStep config={{ ...config, bbox: posterBBox }} features={features} />
          </>
        )}

        {step === 'export' && (
          <ExportStep config={{ ...config, bbox: posterBBox }} features={features} />
        )}
      </WizardShell>
    </div>
  )
}
```

- [ ] **Step 2: Add base CSS**

Create `src/App.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Playfair+Display:wght@300;400;600;700&family=Space+Mono&display=swap');

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: 'Inter', sans-serif;
  background: #111113;
  color: #e4e4e7;
  min-height: 100vh;
}

.app {
  max-width: 960px;
  margin: 0 auto;
  padding: 24px;
}

/* Wizard Shell */
.wizard-nav {
  display: flex;
  justify-content: center;
  gap: 4px;
  margin-bottom: 32px;
}

.wizard-step-indicator {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 20px;
  font-size: 12px;
  color: #52525b;
}

.wizard-step-indicator.active {
  background: rgba(167, 139, 250, 0.15);
  color: #a78bfa;
}

.wizard-step-indicator.completed {
  color: #71717a;
}

.step-number {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  border: 1px solid currentColor;
}

.wizard-actions {
  display: flex;
  justify-content: space-between;
  margin-top: 32px;
  padding-top: 16px;
  border-top: 1px solid rgba(255, 255, 255, 0.06);
}

/* Buttons */
.btn-next,
.btn-back,
.btn-export {
  padding: 10px 24px;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}

.btn-next {
  background: #a78bfa;
  color: #111;
  margin-left: auto;
}

.btn-next:hover { background: #b9a0fb; }
.btn-next:disabled { opacity: 0.4; cursor: not-allowed; }

.btn-back {
  background: transparent;
  color: #71717a;
  border: 1px solid #333;
}

.btn-export {
  background: #a78bfa;
  color: #111;
  width: 200px;
}

.btn-export:hover { background: #b9a0fb; }
.btn-export:disabled { opacity: 0.6; cursor: wait; }

/* Search */
.search-step {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 80px 0;
}

.hero-title {
  font-family: 'Playfair Display', serif;
  font-size: 36px;
  font-weight: 300;
  margin-bottom: 32px;
  text-align: center;
}

.search-bar {
  position: relative;
  width: 100%;
  max-width: 480px;
}

.search-bar input {
  width: 100%;
  padding: 14px 18px;
  border-radius: 12px;
  border: 1px solid #333;
  background: #18181b;
  color: #e4e4e7;
  font-size: 16px;
  outline: none;
}

.search-bar input:focus {
  border-color: #a78bfa;
}

.search-results {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  list-style: none;
  background: #18181b;
  border: 1px solid #333;
  border-top: none;
  border-radius: 0 0 12px 12px;
  overflow: hidden;
  z-index: 10;
}

.search-results li {
  padding: 12px 18px;
  cursor: pointer;
  font-size: 14px;
  color: #a1a1aa;
}

.search-results li:hover {
  background: rgba(167, 139, 250, 0.1);
  color: #e4e4e7;
}

.search-loading {
  padding: 8px 18px;
  font-size: 12px;
  color: #71717a;
}

/* Frame */
.frame-step { text-align: center; }
.frame-controls {
  display: flex;
  gap: 16px;
  justify-content: center;
  margin-bottom: 16px;
}
.frame-controls label {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 14px;
  cursor: pointer;
}
.frame-hint {
  margin-top: 12px;
  font-size: 12px;
  color: #71717a;
}
.map-container { border-radius: 8px; overflow: hidden; }

/* Style */
.style-step { text-align: center; }
.style-step h2 { margin-bottom: 24px; }
.preset-card { transition: transform 0.15s, border-color 0.15s; }
.preset-card:hover { transform: scale(1.03); }

/* Text */
.text-step { max-width: 500px; margin: 0 auto; }
.text-step h2 { margin-bottom: 24px; }
.text-step label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 13px;
  color: #a1a1aa;
}
.text-step input[type="text"] {
  padding: 10px 14px;
  border-radius: 8px;
  border: 1px solid #333;
  background: #18181b;
  color: #e4e4e7;
  font-size: 15px;
  outline: none;
}
.text-step input[type="text"]:focus {
  border-color: #a78bfa;
}

/* Loading */
.loading {
  text-align: center;
  padding: 16px;
  color: #71717a;
  font-size: 14px;
}

/* Poster */
.poster-canvas {
  border-radius: 2px;
}
```

- [ ] **Step 3: Update App test**

Replace `src/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import App from './App'

test('renders search step on load', () => {
  render(<App />)
  expect(screen.getByText('Search a place that matters')).toBeInTheDocument()
  expect(screen.getByPlaceholderText('Search a place that matters')).toBeInTheDocument()
})
```

- [ ] **Step 4: Run all tests**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 5: Run the dev server and verify the wizard loads**

```bash
npm run dev
```

Expected: App loads, shows "Search a place that matters" with a search bar. The full wizard flow is functional.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.css src/App.test.tsx
git commit -m "wire up complete wizard flow: search → frame → style → text → preview → export"
```

---

## Task 14: End-to-End Smoke Test

**Files:**
- Create: `src/integration.test.tsx`

- [ ] **Step 1: Write integration test for wizard flow**

```tsx
// src/integration.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { vi } from 'vitest'
import App from './App'

// Mock fetch for geocoding
const mockFetch = vi.fn()
global.fetch = mockFetch

test('full wizard flow: search → select → navigate to frame step', async () => {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => [
      {
        display_name: 'Brooklyn, Kings County, New York, USA',
        lat: '40.6501',
        lon: '-73.9496',
        boundingbox: ['40.5707', '40.7395', '-74.0421', '-73.8334'],
      },
    ],
  })

  render(<App />)

  // Step 1: Search
  const input = screen.getByPlaceholderText('Search a place that matters')
  fireEvent.change(input, { target: { value: 'Brooklyn' } })

  // Wait for results
  await waitFor(() => {
    expect(screen.getByText('Brooklyn, Kings County, New York, USA')).toBeInTheDocument()
  })

  // Select result
  fireEvent.click(screen.getByText('Brooklyn, Kings County, New York, USA'))

  // Should advance to frame step (look for frame UI elements)
  await waitFor(() => {
    expect(screen.getByText('Single Pin')).toBeInTheDocument()
    expect(screen.getByText('Pan and zoom to frame your poster')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run integration test**

```bash
npx vitest run src/integration.test.tsx
```

Expected: Test passes (MapLibre may need a mock in jsdom — if it fails on MapLibre initialization, add this at the top of the test file):

```tsx
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(() => ({
      fitBounds: vi.fn(),
      on: vi.fn(),
      remove: vi.fn(),
      getBounds: vi.fn(() => ({
        getSouth: () => 40.57,
        getNorth: () => 40.74,
        getWest: () => -74.04,
        getEast: () => -73.83,
      })),
    })),
  },
}))
```

- [ ] **Step 3: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/integration.test.tsx
git commit -m "add integration smoke test for wizard search-to-frame flow"
```

---

## Task 15: Clean Up + Final Verification

- [ ] **Step 1: Remove Vite default boilerplate**

Delete these files if they exist from the Vite scaffold:
- `src/assets/react.svg`
- `public/vite.svg`
- `src/index.css` (if unused — our styles are in App.css)

Update `index.html` to reference the app properly (remove Vite favicon link if present, update `<title>` to "Map Poster").

- [ ] **Step 2: Verify clean build**

```bash
npm run build
```

Expected: Build succeeds with no TypeScript errors.

- [ ] **Step 3: Run full test suite one final time**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "clean up boilerplate, verify build and tests"
```
