# Map Poster App — Product Design Spec

> **[ARCHIVED]** — This spec describes the originally-conceived product
> (2D tile-based poster editor). The current implementation is the 3D
> photorealistic-tiles editor in `src/pages/editor/` — see
> `docs/superpowers/specs/2026-04-17-editor-react-migration-design.md`
> for the architecture that actually shipped. Kept here as historical
> context for the "search a place that matters" product thesis, which
> is still the north star.

## Concept

"Search a place that matters." A web app that turns meaningful locations into beautiful, print-ready map posters. Users search for a place, frame it on a map, pick a style, customize text, and export a high-resolution poster — either as a digital download or a physical print.

## Target Use Cases

These are the primary use cases driving design decisions, ordered by expected frequency:

1. **"Our Spot" / Favorite Bar** — street-level poster of a group's go-to place (bar, coffee shop, taco spot). Pin + place name. Inside joke as wall art.
2. **First Apartment / New Home** — housewarming gift of the exact block/neighborhood. Move-in date, address, coordinates.
3. **Where We Met** — the exact location where a couple or best friends' story started. Wedding gift, anniversary, Valentine's Day.
4. **Trip Memento** — a poster of a neighborhood from a memorable trip. Better than a fridge magnet.
5. **Multi-Pin Story Map** — multiple meaningful spots on one poster. "Every apartment we've lived in." "Where we met → first date → engaged → married."
6. **Race Route / Marathon** — actual race route overlaid on a city map with finish time (v1.5).

## Buyer Personas

- **The Thoughtful Friend** — shopping for a birthday/holiday gift, wants something personal, finds the app via social media.
- **The Couple Commemorating a Moment** — anniversary, moving in together, buying for themselves or each other.
- **The Experience Collector** — travelers, runners, building a gallery wall of meaningful places.

## User Flow (v1 Wizard)

### Step 1: Landing
- Hero: "Search a place that matters" + search bar
- Single clear action. No account required.
- Geocoding via Nominatim (free) or Mapbox geocoding API

### Step 2: Map & Frame
- Map loads centered on search result using MapLibre GL JS
- User pans and zooms to frame their poster
- Toggle between single-pin and multi-pin mode
- **Single-pin:** pin auto-placed at center (search result location)
- **Multi-pin:** additional search bar to add locations (max 5 pins). Auto-fit zoom to contain all pins with padding. Each pin gets a color from a preset palette.

### Step 3: Style
- Pick from 4-5 style presets:
  - Minimal Line (white bg, thin black lines, Scandinavian)
  - Dark & Bold (black bg, white/gold streets, colored water)
  - Color Blocked (saturated bg, contrasting fills for water/parks/land)
  - Vintage (aged paper tones, sepia, hand-drawn feel)
  - Blueprint (navy/white, technical drawing feel — good for architects/engineers)
  - Additional presets can be added as config objects without code changes
- One tap applies the style; poster re-renders live in preview

### Step 4: Text
- **Place name** — auto-filled from search, editable
- **Subtitle** — free text (date, "our spot", custom message, etc.)
- **Coordinates** — toggle on/off, auto-generated from pin location
- For multi-pin: legend auto-generated from pin labels

### Step 5: Preview
- Full poster preview at screen resolution
- What you see is what you get

### Step 6: Export
- **Digital download (free or low cost):** high-res PNG + PDF
- **Print order (paid, v1.5):** server-side render to print-ready PDF, fulfilled via Prodigi or Printful API

## Architecture

### Frontend
- Single-page React app
- Wizard steps are views within one page — no routing needed for v1
- Poster preview is a live-rendered component that updates as user makes choices

### Map Rendering — Hybrid Approach
- **Interactive step (search/frame):** MapLibre GL JS with standard tiles for the familiar map UX
- **Poster output:** SVG rendering pipeline from OpenStreetMap vector data
  - Fetch vector data via Overpass API for the framed bounding box
  - Convert to SVG layers (streets, water, parks, buildings, land)
  - Apply style preset as fills/strokes via config
  - This gives print-quality vector output and full creative control

### Style Presets
- Each preset is a config object: colors for streets, water, parks, land, background, text styling
- SVG renderer applies these as fills and strokes
- Adding new presets = adding a new config object, no code changes

### Data Sources
- **Map data:** OpenStreetMap via Overpass API (vector geometries)
- **Geocoding:** Nominatim (free) or Mapbox geocoding (better UX)
- **No database for v1** — everything is client-side until print ordering

### Export Pipeline
- **Digital download:** SVG → high-res PNG/PDF. Can start client-side (html-to-canvas / svg-to-png), move server-side for better quality if needed.
- **Print order (v1.5):** Server-side headless render to print-ready PDF → Prodigi/Printful fulfillment API

### Multi-Pin Additions
- Same SVG pipeline, multiple coordinates fed in
- Auto-fit bounding box to contain all pins with padding
- Color-coded pins from preset palette
- Optional dashed connecting line between pins (in order)
- Legend component renders below map area based on pin data

## Scope

### v1 (Launch)
- Wizard flow: search → frame → style → text → preview → export
- Single-pin posters
- Basic multi-pin (2-5 pins, auto-fit zoom, color-coded legend, dashed connecting line)
- 4-5 style presets
- Portrait format only
- Digital download (PNG + PDF)
- No accounts, no backend (fully client-side)

### v1.5 (Fast Follow)
- Print ordering via Prodigi/Printful
- Account creation (save designs, order history)
- Landscape + square formats
- Race route overlay (GPX file upload → route drawn on map)

### v2 (Editor Evolution)
- Open editor mode from any wizard result (wizard → editor growth path)
- Custom colors beyond presets
- Multiple paper/frame options for print orders
- Shareable links ("check out this poster I made")
- More presets, seasonal themes
