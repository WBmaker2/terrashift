# TerraShift — Implementation Plan

**Project name:** TerraShift
**Folder:** `/Volumes/ External Drive 256G/Dev2/opencode/terrashift`
**Type:** Static educational SPA/PWA
**Runtime AI:** None. No LLM/API calls after build. All geology runs in the browser.
**Target learners:** Grades 7–11 (Korean 중1~고2)
**Subject:** Earth science — plate tectonics, landforms, earthquakes, volcanoes
**MVP duration:** 4–5 weeks

---

## 0. One-page summary

TerraShift is a 3D plate-tectonics time machine built around a single question: **why do mountains, trenches, rifts, earthquakes, and volcanoes appear where they do?**

Students orbit a stylized Earth, select a plate boundary, and scrub through millions of years. Divergent boundaries open rifts and mid-ocean ridges. Convergent boundaries produce trenches, volcanic arcs, and mountain belts depending on whether the plates are oceanic or continental. Transform boundaries produce faults and shallow earthquakes without volcanoes. A cross-section inset shows the crust and mantle beneath the selected boundary.

The app is **not** an AI tutor and **not** an earthquake predictor. Every landform and event comes from a deterministic rule model with a visible "concept model" label. There are no real-time data feeds, no generated explanations, and no network calls.

**Why this is a strong build**

- 3D plus simulation: a spherical heightfield, plate motion vectors, boundary classification, terrain deformation, event catalogs, and a cross-section all in one scene.
- Real, testable earth science: boundary types, relative motion, landform signatures, and event distributions have clear expected outcomes.
- Clear misconceptions to target: "plates move because of earthquakes", "all boundaries look the same", "volcanoes occur everywhere", "earthquakes are predictable".
- The hard part is the coupled model, not the art. That makes it a strong showcase for a coding model that can integrate geometry, math, and rendering.

**MVP shape**

- A stylized globe with 10–12 simplified plates.
- Boundary types: divergent, convergent (three subtypes), transform.
- Time range 0–200 Myr with a scrubber and playback.
- Terrain deformation at 1 Myr resolution, cached every 5 Myr.
- Earthquake and volcano layers generated from deterministic rules.
- A schematic cross-section for the selected boundary.
- Six missions, local progress, teacher mode, PWA.

---

## 1. Product definition

### 1.1 Learning problem

Plate tectonics is usually taught as a static map with arrows. Students memorize "convergent means mountains" but cannot explain why an oceanic–continental boundary produces a trench and a volcanic arc while a continental–continental boundary produces a high mountain belt. They also confuse the cause (mantle convection and plate motion) with the result (earthquakes), and they often think earthquakes can be predicted.

### 1.2 Learning goals

By the end of the core missions, a student should be able to:

- Identify divergent, convergent, and transform boundaries from landforms and event patterns.
- Explain the difference between oceanic–continental, oceanic–oceanic, and continental–continental convergence.
- Explain why earthquakes occur at all three boundary types but volcanoes cluster at convergent and divergent boundaries.
- Explain why the Ring of Fire follows the Pacific plate boundary.
- Describe how a continental rift can become an ocean basin over millions of years.
- Distinguish a scientific model from a real earthquake forecast.
- Use the cross-section to connect surface landforms to processes at depth.

### 1.3 Core learning loop

1. **Predict** — the mission shows a boundary or landform and asks what will happen.
2. **Set** — the student selects a boundary, changes the time, or toggles a layer.
3. **Observe** — the globe, events, and cross-section update.
4. **Explain** — the student answers a short question using the evidence.
5. **Connect** — a one-sentence takeaway links the process to a real place.

### 1.4 Success criteria

- A student can classify all three boundary types from a map and an event layer.
- A student can predict the landforms of each convergence subtype.
- A student can explain why transform boundaries have earthquakes but no volcanoes.
- A student can explain why the Ring of Fire is a ring.
- A student can describe the rift-to-ocean transition.
- A teacher can reset progress, reveal answers, and print a worksheet without code changes.

---

## 2. Scope

### MVP (must ship)

- Stylized 3D globe with a simplified 10–12 plate mosaic.
- Plate types: oceanic and continental.
- Boundary types: divergent, convergent (oceanic–continental, oceanic–oceanic, continental–continental), transform.
- Time range 0–200 Myr; scrubber, play/pause, speed presets, jump to scenario start.
- Heightfield terrain with boundary-driven uplift, subsidence, rifting, and mountain building.
- Ocean depth shading and a simple land color ramp.
- Crust-age shading near divergent boundaries (optional layer).
- Earthquake markers with magnitude and depth categories.
- Volcano markers with eruption pulses.
- Plate labels and boundary-type labels.
- Selected-boundary cross-section with crust, mantle, slab, magma, and surface features.
- Six missions with prediction gates and explanations.
- Local progress, teacher reset, printable worksheet.
- Responsive layout, keyboard alternative, reduced motion.
- PWA install and offline cache.

### Later (do not build in the first pass)

- Real geodetic plate polygons and Euler poles.
- True topographic and bathymetric data.
- Slab geometry with depth contours and Wadati–Benioff zones.
- Hotspot chains and absolute plate motion.
- Paleoclimate and paleogeography.
- Supercontinent reconstruction.
- Real earthquake catalogs as an optional, labeled layer.
- Classroom accounts or teacher dashboards.

### Out of scope

- Real earthquake prediction or forecasting.
- Real-time seismic or volcanic data.
- Hazard assessment or evacuation advice.
- Political maps or country boundaries.
- Any server, database, login, or analytics.
- Any runtime AI or generated explanations.
- Claims that the model reproduces real geologic history.

---

## 3. Tech stack

| Layer | Choice | Reason |
|---|---|---|
| Build | Vite + TypeScript | Static output, fast iteration |
| 3D | Three.js | Sphere mesh, shaders, markers, camera |
| Terrain | CPU heightfield + BufferGeometry updates | Small grid, deterministic, easy to test |
| 2D cross-section | Canvas 2D or SVG overlay | Clear schematic, cheap to render |
| Math tests | Vitest | Spherical geometry, classification, terrain rules |
| Browser tests | Playwright | Boundary selection, time scrub, missions |
| PWA | `vite-plugin-pwa` | Offline classroom use |
| Hosting | GitHub Pages / Cloudflare Pages | No server |

**Constraints**

- Node.js 20+.
- No backend, no API keys, no runtime network calls.
- No external map tiles, topographic data, or textures. Use procedural terrain and hand-authored plate polygons.
- Target 60 fps on a mid-range laptop and ≥ 30 fps on a school tablet.
- Initial gzip bundle under 900 KB.
- Terrain updates must be deterministic for a fixed seed and time step.

---

## 4. Architecture

### 4.1 Module map

```text
src/
  main.ts
  app/
    App.ts
    state.ts
    routes.ts
  geo/
    constants.ts          Earth radius, time scale, grid resolution
    sphere.ts             lat/lon ↔ unit vector, great-circle math
    plates.ts             plate polygons, types, motion vectors
    raster.ts             plate-id raster and boundary extraction
    boundaries.ts         boundary segments and classification
    terrain.ts            heightfield generation and deformation
    events.ts             deterministic earthquake/volcano catalog
    time.ts               time model and keyframe cache
    crossSection.ts       schematic cross-section geometry
  render/
    Globe.ts
    TerrainMesh.ts
    PlateOverlay.ts
    EventMarkers.ts
    CrossSectionView.ts
    Labels.ts
    CameraRig.ts
    shaders/
      terrain.glsl
      ocean.glsl
  features/
    timeline/
    layers/
    missions/
    teacher/
  data/
    plates.json
    missions.json
  ui/
    components/
    styles/
  storage/
    progress.ts
  tests/
    unit/
    e2e/
```

### 4.2 Coordinate frames and units

- Use a right-handed Earth-centered frame with **Y up**.
- Latitude `φ` and longitude `λ` map to:

```text
x = cos(φ) × cos(λ)
y = sin(φ)
z = cos(φ) × sin(λ)
```

- Display radius: 1 scene unit = 1 Earth radius; exaggerate terrain height by a fixed visual factor (e.g., 40×) and label it.
- Distance: great-circle distance in radians × Earth radius (6,371 km).
- Time: millions of years (Myr).
- Plate motion: centimeters per year (cm/yr).
- Never mix display exaggeration into the physical calculations.

### 4.3 State

```ts
interface AppState {
  route: 'explore' | 'missions' | 'teacher';
  time: {
    myr: number;              // 0..200
    playing: boolean;
    speed: number;            // Myr per second
  };
  selection: {
    boundaryId: string | null;
    plateId: string | null;
  };
  view: 'globe' | 'cross-section';
  layers: {
    boundaries: boolean;
    labels: boolean;
    earthquakes: boolean;
    volcanoes: boolean;
    crustAge: boolean;
    plateColors: boolean;
  };
  mission: {
    currentId: string | null;
    answers: Record<string, string>;
    completed: string[];
  };
  preferences: {
    reducedMotion: boolean;
    showScaleWarning: boolean;
  };
}
```

### 4.4 Persistence

- `localStorage` key: `terrashift.progress.v1`.
- Store completed missions, answers, last time, last selection, and layer preferences.
- Do not store the generated terrain; regenerate deterministically from the seed.
- Teacher reset clears progress after confirmation.
- No personal data.

---

## 5. Data model

### 5.1 Plate

```ts
interface Plate {
  id: string;
  nameKo: string;
  nameEn: string;
  type: 'oceanic' | 'continental';
  color: string;
  polygon: { lat: number; lon: number }[]; // simplified spherical polygon
  motion: {
    eastCmYr: number;   // positive east
    northCmYr: number;  // positive north
  };
}
```

The MVP ships 10–12 plates: Pacific, North American, South American, African, Eurasian, Indo-Australian, Antarctic, Nazca, Cocos, Philippine, Arabian, and Caribbean. Polygons are simplified and explicitly labeled as a teaching mosaic, not geodetic data.

### 5.2 Boundary segment

```ts
interface BoundarySegment {
  id: string;
  plateA: string;
  plateB: string;
  type: 'divergent' | 'convergent' | 'transform' | 'inactive';
  subtype:
    | 'oceanic-oceanic'
    | 'oceanic-continental'
    | 'continental-continental'
    | 'ridge'
    | 'rift'
    | 'transform'
    | 'inactive';
  points: { lat: number; lon: number }[];
  relativeVelocityCmYr: number;
  normalComponent: number;  // positive = convergence
  tangentialComponent: number;
}
```

### 5.3 Mission

```ts
interface Mission {
  id: string;
  titleKo: string;
  concept: 'boundary' | 'convergence' | 'transform' | 'rift' | 'ring-of-fire' | 'scale';
  promptKo: string;
  setup: {
    myr: number;
    boundaryId?: string;
    layers: Partial<AppState['layers']>;
    camera?: 'globe' | 'cross-section';
  };
  options: string[];
  answer: string;
  explanationKo: string;
  takeawayKo: string;
  difficulty: 1 | 2 | 3;
}
```

### 5.4 Constants

```ts
const EARTH_RADIUS_KM = 6371;
const MAX_TIME_MYR = 200;
const TIME_STEP_MYR = 1;
const KEYFRAME_INTERVAL_MYR = 5;
const TERRAIN_LAT_SEGMENTS = 96;
const TERRAIN_LON_SEGMENTS = 192;
const VISUAL_HEIGHT_EXAGGERATION = 40;
const MIN_RELATIVE_SPEED = 0.2;       // cm/yr; below this the boundary is inactive
const CONVERGENCE_THRESHOLD = 0.8;   // cm/yr normal component
const TRANSFORM_RATIO = 1.2;          // tangential / normal
const EVENT_SEED = 20261028;
```

Keep these in one file with comments. Do not scatter magic numbers.

### 5.5 Plate data

- `plates.json` stores simplified polygons and motion vectors.
- Motion vectors are hand-authored from published plate-motion summaries and rounded for teaching. They are not a geodetic solution.
- Each polygon has 8–30 vertices; the rasterizer fills a 1° plate-id grid.
- The polygons are checked for overlap and coverage at build time by a unit test.

---

### 5.6 Mission content

The six missions are stored in `missions.json`. Each has a prediction gate and an explanation gate, and each sets a time, boundary, and layer configuration.

1. `boundary-id` — **경계를 읽어라**: given a landform and an event pattern, identify the boundary as divergent, convergent, or transform.
2. `continental-collision` — **히말라야는 왜 높을까?**: set a continental–continental convergence. Predict the landform; observe the mountain belt and crustal thickening.
3. `ocean-continent` — **안데스형 경계**: set an oceanic–continental convergence. Predict the trench, mountain belt, and volcanic arc; compare their positions.
4. `transform` — **샌안드레아스 단층**: set a transform boundary. Predict earthquakes without volcanoes; explain the difference.
5. `rift` — **열곡에서 바다로**: start with a continental rift. Scrub forward and predict when the rift drops below sea level.
6. `ring-of-fire` — **불의 고리**: select the Pacific boundary. Explain why volcanoes and earthquakes form a ring around the ocean.

---

## 6. Core algorithms

### 6.1 Spherical geometry

- Convert lat/lon to unit vectors and back.
- Great-circle distance: `acos(clamp(dot(a, b), -1, 1))`.
- Point-in-spherical-polygon: project the polygon and point into a tangent plane around the polygon centroid, then use a 2D even–odd ray cast. This is accurate enough for the small, simplified polygons in the MVP.
- Boundary extraction: for every pair of adjacent cells with different plate ids, emit a boundary segment. Merge collinear segments into polylines.
- Boundary tangent at a point: normalize the difference between the next and previous points.
- Boundary normal in the tangent plane: `normalize(cross(up, tangent))`, oriented from plate A to plate B.

### 6.2 Plate motion and boundary classification

Convert each plate's east/north motion to a 3D tangent vector at the boundary point:

```text
east = normalize(cross(up, northPole))
north = cross(up, east)
v = eastCmYr × east + northCmYr × north
```

Relative velocity at the boundary:

```text
vRel = vA - vB
normalSpeed = dot(vRel, boundaryNormal)   // positive = A moves toward B
tangentSpeed = dot(vRel, boundaryTangent)
```

Classification:

```text
if |vRel| < MIN_RELATIVE_SPEED:
  inactive
else if |normalSpeed| < CONVERGENCE_THRESHOLD and |tangentSpeed| > TRANSFORM_RATIO × |normalSpeed|:
  transform
else if normalSpeed > 0:
  convergent
else:
  divergent
```

Subtype:

- Divergent: `ridge` if both plates are oceanic, `rift` if at least one is continental.
- Convergent:
  - oceanic + continental → `oceanic-continental`
  - oceanic + oceanic → `oceanic-oceanic`
  - continental + continental → `continental-continental`
- Transform: `transform`.
- Inactive: `inactive` (shown as "활동이 약한 경계"; not used in the six missions).

**Orientation matters.** The classification must be invariant to swapping plate A and plate B: flip the normal when swapping, and re-run. Add a unit test for this.

### 6.3 Terrain model

The terrain is a heightfield sampled on a 96 × 192 lat/lon grid. Base elevation comes from plate type:

```text
continental base: +0.4 km
oceanic base:    -4.0 km
```

Add a low-frequency procedural continent shape and fractal noise for visual variety. The noise is seeded and deterministic.

Boundary deformation is applied per time step:

- **Divergent ridge (oceanic–oceanic):** a narrow uplift (+1.5 km) at the ridge axis, with a broad shallow rise and a rift valley (−1.0 km) at the center. New crust is young at the ridge and ages away from it.
- **Continental rift:** a rift valley (−1.5 km) with shoulder uplift (+0.8 km) on both sides. Over time, the rift widens and can drop below sea level.
- **Oceanic–continental convergence:** a trench (−6 km) on the oceanic side, a mountain belt (+3 km) on the continental side, and a volcanic arc (+2 km) inland from the trench.
- **Oceanic–oceanic convergence:** a trench (−6 km) and an island arc (+2 km) on the overriding plate.
- **Continental–continental convergence:** broad crustal thickening (+4 km) with a plateau and a fold-and-thrust belt.
- **Transform:** minor uplift (+0.3 km) and a narrow fault trough (−0.3 km); no large mountain belt.

Use a Gaussian falloff from the boundary:

```text
weight = exp(-(distance / sigma)²)
height += amplitude × weight × timeFactor
```

Apply the deformation incrementally at 1 Myr steps and cache keyframes every 5 Myr. Linear interpolation between keyframes gives smooth scrubbing without recomputing 200 times per interaction.

**Performance:** 96 × 192 = 18,432 vertices. Updating positions on the CPU at a keyframe is cheap; upload only the position and normal attributes when the keyframe changes. Do not rebuild the geometry.

**Honesty:** the height exaggeration is a visual aid. The model is not a topographic reconstruction.

### 6.4 Crust age

- At divergent boundaries, assign age 0 at the ridge and increase with distance.
- Store a per-vertex age field; color it with a simple ramp from red (young) to blue (old).
- This layer is optional and is a powerful way to show seafloor spreading.

### 6.5 Earthquake catalog

Generate a deterministic catalog once at load:

1. For each boundary segment, compute a rate proportional to `max(0.2, relativeVelocityCmYr)`.
2. Use a seeded Poisson process over 0–200 Myr to generate event times.
3. Assign magnitude from a truncated exponential distribution (roughly 4.0–8.5).
4. Assign depth:
   - transform: 0–30 km
   - divergent: 0–15 km
   - convergent: 0–700 km, increasing with distance from the trench
5. Store `{ id, timeMyr, lat, lon, magnitude, depthKm, boundaryId }`.

Filter by a visible time window (e.g., ±2 Myr around the current time) so the globe is not flooded. The UI shows counts by boundary type.

**This is a distribution model, not a forecast.** The UI must say so.

### 6.6 Volcano catalog

- Place volcanoes at:
  - convergent oceanic–continental and oceanic–oceanic boundaries, inland from the trench;
  - divergent ridges, sparsely;
  - a small number of fixed hotspot chains (optional later).
- Assign eruption pulses with a seeded random schedule.
- Do not place volcanoes on transform boundaries.
- The volcano layer is a set of small cones with an emissive pulse; cap the visible count for performance.

### 6.7 Time model

- `myr` ranges from 0 to 200.
- The default scenario starts at 0 Myr with present-day-like plate positions; the model runs forward.
- Playback speeds: 0.5, 1, 5, 20 Myr/s.
- The terrain keyframe cache is generated lazily on first use and stored in memory.
- A "reset to present" button returns to 0 Myr.
- Time is displayed as "0 Myr (현재)" to "200 Myr (미래)" and clearly labeled as a model, not a prediction of the real future.

### 6.8 Cross-section

The cross-section is a 2D schematic for the selected boundary, drawn with Canvas 2D or SVG:

- Crust layer with thickness based on plate type.
- Mantle below.
- For convergence: a descending slab, a trench, a volcanic arc, and a magma path.
- For divergence: a ridge, a rift valley, and upwelling mantle arrows.
- For transform: a vertical fault with lateral arrows.
- Time changes the slab length, mountain height, and rift width.
- Labels in Korean with short explanatory captions.

The cross-section is a diagram, not a computed finite-element slice. Label it "개념 단면도".

### 6.9 Selection and picking

- Raycast against the globe to get a lat/lon.
- Map the lat/lon to the nearest boundary segment within a threshold.
- Highlight the boundary polyline and open the cross-section.
- Clicking a plate highlights the plate and shows its motion vector.
- Keyboard users can cycle boundaries with `[` and `]`.

### 6.10 Determinism

- All randomness uses a seeded PRNG (e.g., mulberry32) with a fixed seed.
- Terrain keyframes, event catalogs, and volcano pulses must be identical across runs.
- Tests compare exact event counts and terrain heights for a fixed seed.
- Floating-point comparisons use a tolerance of 1e-6 for heights and 1e-9 for vectors.

---

## 7. Screens and UX

### 7.1 Explore screen

- **Center:** 3D globe with plate colors, boundary lines, earthquake rings, and volcano cones.
- **Top:** time display, play/pause, speed, reset.
- **Bottom:** timeline scrubber with era markers.
- **Left:** layer toggles and plate list.
- **Right:** selected boundary card and cross-section preview.
- **Click:** select a boundary or plate; double-click to focus the camera.

### 7.2 Cross-section screen

- Full-width schematic of the selected boundary.
- Surface features, crust, mantle, slab, and magma.
- A time slider scoped to the selected scenario.
- A short "what to notice" list.
- A "back to globe" button.

### 7.3 Mission screen

- Mission card with a prediction question.
- The globe or cross-section is set to the scenario.
- The student explores, then answers the explanation question.
- Completion award and a one-sentence takeaway.
- Hints point to the boundary type, relative motion, and event layer, not the answer.

### 7.4 Teacher mode

- Mission list with concepts, answers, and explanations.
- Preset scenarios for the Himalaya, Andes, East African Rift, San Andreas, and the Ring of Fire.
- Reset progress.
- Print a worksheet with a blank map and event-count table.
- Toggle labels and the scale warning for classroom projection.

### 7.5 Responsive layout

**Desktop (≥ 1024 px)**

- Globe with a left layer panel and a right boundary panel.

**Tablet (768–1023 px)**

- Globe with collapsible drawers; timeline at the bottom.

**Phone (< 768 px)**

- Globe at the top; bottom sheet tabs: Time | Layers | Mission.
- Larger touch targets for boundary selection.
- Pinch to zoom; two-finger orbit.

### 7.6 Accessibility

- Keyboard: `Space` play/pause, arrow keys scrub time, `[`/`]` cycle boundaries, `L` toggle labels, `1`/`2` switch globe/cross-section.
- Every globe state has a text summary: time, selected boundary, boundary type, event counts, and the cross-section description.
- Respect `prefers-reduced-motion`: no auto-rotation, no pulsing markers, instant camera cuts.
- Do not encode boundary type by color alone; use line style and labels.
- Provide a "read the map" panel that lists plates, boundaries, and events in words.
- Ensure the timeline is a native range input or has full ARIA support.

---

## 8. Implementation milestones

### M0 — Setup (0.5 day)

- Scaffold Vite + TypeScript + Three.js.
- Add Vitest, Playwright, ESLint, Prettier, PWA plugin.
- Create the module map and a textured sphere.
- **Verify:** dev server, build, and tests run.

### M1 — Spherical geometry and plate data (3–4 days)

- Implement lat/lon conversion, great-circle distance, point-in-polygon, and boundary extraction.
- Author the simplified plate polygons and motion vectors.
- Rasterize plate ids and validate coverage.
- **Verify:** every cell has a plate id; no overlaps; boundary segments are continuous.

### M2 — Boundary classification (2–3 days)

- Implement relative velocity, normal/tangential decomposition, and classification.
- Add subtype rules and orientation invariance.
- **Verify:** unit tests for all three boundary types and all convergence subtypes.

### M3 — Terrain (4–5 days)

- Implement the base heightfield, noise, and boundary deformation rules.
- Generate keyframes every 5 Myr and interpolate.
- Add the ocean/land color ramp and crust-age layer.
- **Verify:** terrain heights are deterministic and within bounds; keyframes blend smoothly.

### M4 — Events and globe rendering (3–4 days)

- Generate the earthquake and volcano catalogs.
- Add markers, labels, plate colors, and boundary highlights.
- Implement selection and camera controls.
- **Verify:** events cluster at the correct boundary types; transform boundaries have no volcanoes.

### M5 — Cross-section (2–3 days)

- Draw the three boundary-type cross-sections with time-dependent features.
- Add labels and the "concept diagram" notice.
- **Verify:** the cross-section matches the selected boundary and updates with time.

### M6 — Missions and teacher mode (2–3 days)

- Author six missions with prediction and explanation gates.
- Add progress persistence, teacher reset, and the printable worksheet.
- **Verify:** each mission can be completed from a fresh state.

### M7 — Responsive, accessibility, PWA, QA (3 days)

- Implement the three layouts.
- Add keyboard controls, text summaries, reduced motion.
- Configure offline caching.
- Run screenshot checks and a low-end tablet test.
- Deploy.
- **Verify:** acceptance criteria below are met.

---

## 9. Testing and verification

### Unit tests (Vitest)

- Lat/lon ↔ unit vector round trip.
- Great-circle distance for known city pairs.
- Point-in-spherical-polygon for inside, outside, and edge cases.
- Plate raster coverage: every cell assigned; no overlaps.
- Boundary classification for divergent, convergent, and transform cases.
- Orientation invariance when swapping plate A and B.
- Subtype rules for all convergence combinations.
- Terrain height bounds and deterministic keyframes.
- Ridge uplift, trench subsidence, and rift valley sign checks.
- Earthquake catalog determinism and time filtering.
- No volcanoes on transform boundaries.
- Time interpolation between keyframes.

### Interaction tests (Playwright)

- Scrub the timeline and confirm the terrain changes.
- Select each boundary type and confirm the cross-section updates.
- Toggle earthquake and volcano layers.
- Complete a boundary-classification mission correctly and incorrectly.
- Complete the Ring of Fire mission.
- Reset progress in teacher mode.
- Keyboard-only path through the boundary mission.

### Visual tests

- Screenshot the globe at 0, 50, 100, and 200 Myr.
- Screenshot each cross-section type.
- Run at 1440×900, 1024×768, and 390×844.
- Check that the height-exaggeration and concept-model badges are visible.

### Accessibility checks

- `axe-core` scan with no critical issues.
- Keyboard reaches every control.
- Reduced motion disables auto-rotation and marker pulses.
- Text summary matches the current globe state.
- Boundary type is not conveyed by color alone.

### Performance budget

- 60 fps on a mid-range laptop; ≥ 30 fps on a school tablet.
- Terrain keyframe generation < 300 ms on a mid-range laptop.
- No per-frame geometry rebuild.
- Cap visible earthquake markers at 300 and volcanoes at 120.
- Pause rendering when the tab is hidden.
- DPR clamp to 2.
- Initial load < 3 s on simulated 4G.

---

## 10. Acceptance criteria / Go-No-Go

- [ ] The globe shows a continuous plate mosaic with no gaps or overlaps.
- [ ] All three boundary types are classified correctly.
- [ ] All three convergence subtypes produce the correct landform signature.
- [ ] A continental rift widens and can drop below sea level over time.
- [ ] Earthquakes cluster at all boundary types; volcanoes do not appear on transform boundaries.
- [ ] The Ring of Fire is visually recognizable.
- [ ] The cross-section matches the selected boundary and updates with time.
- [ ] The timeline runs from 0 to 200 Myr and scrubs smoothly.
- [ ] Six missions are playable, scored, and saved locally.
- [ ] Teacher reset works.
- [ ] Keyboard-only mission completion works.
- [ ] Reduced motion is respected.
- [ ] The app works offline after the first load.
- [ ] No runtime network calls to an AI service or backend.
- [ ] "Concept model, not a forecast" is visible wherever events are shown.

If the boundary classification or terrain sign tests fail, stop and fix the model before adding missions.

---

## 11. Risks and mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Simplified plates are mistaken for real geodetic data | False claims | Persistent "simplified teaching mosaic" label; no real coordinates or forecasts |
| Boundary classification is orientation-dependent | Wrong landforms | Swap-invariance unit test; explicit normal orientation |
| Terrain deformation produces spikes or holes | Unusable globe | Height clamps, Gaussian falloff, keyframe validation, screenshot tests |
| Event catalog looks like a real forecast | Safety misconception | "Concept model, not a forecast" badge; no real dates or locations |
| 18k-vertex updates stutter on tablets | Poor classroom performance | Keyframes every 5 Myr, attribute updates only, quality tiers |
| Cross-section is mistaken for a computed slice | Overclaim | Label it "개념 단면도"; keep it schematic |
| Plate polygons overlap or leave gaps | Broken boundaries | Build-time raster validation; coverage tests |
| Time scale is misread as real future history | Misconception | Label "model time"; start at 0 Myr and explain the range |
| Labels clutter the globe | Confusing UI | Hide labels by default on phone; tap to reveal |

---

## 12. AI build guide

Use the AI coding agent for scaffolding, spherical math, the plate rasterizer, terrain rules, event generation, tests, and screenshot-driven fixes. Earth science is easy to make visually plausible but wrong, so tests and teacher review are mandatory.

### Recommended build order

1. Scaffold Vite + TypeScript + Three.js with tests.
2. Implement spherical geometry and plate data; validate the raster.
3. Implement boundary classification and unit tests.
4. Build the base globe and camera.
5. Add terrain deformation and keyframes.
6. Add events, selection, and layers.
7. Add the cross-section.
8. Add missions and teacher mode.
9. Do responsive/accessibility passes.
10. Use screenshots at three viewports and fix visual regressions.

### Prompt rules

- State the constraint: “No backend, no runtime AI, no network calls, no real data feeds.”
- Require a test for every boundary rule and terrain sign.
- Ask the agent to explain the normal/tangential decomposition before coding.
- Use a fixed seed and exact expected event counts in tests.
- Never let the app claim to predict real earthquakes or eruptions.
- Provide screenshots when fixing globe or cross-section issues.

### What not to delegate

- The decision that the simplified tectonic model is pedagogically acceptable.
- The final review of boundary classification and landform examples.
- Accessibility judgment.
- Classroom pilot feedback.

### Definition of done

- All geometry, classification, terrain, and interaction tests pass.
- The acceptance checklist is complete.
- A teacher can run the six missions without developer help.
- The model's simplifications are visible in the UI.

---

## 13. Future extensions

- Real geodetic plate polygons and Euler poles.
- True topographic and bathymetric data as an optional, labeled layer.
- Slab depth contours and Wadati–Benioff zone visualization.
- Hotspot chains and absolute plate motion.
- Paleogeographic reconstruction and supercontinent scenarios.
- Real earthquake catalogs as an optional, labeled layer.
- Classroom worksheet generator.
- Localization.

---

## 14. References

- USGS — Plate tectonics: https://www.usgs.gov/programs/earthquake-hazards/plate-tectonics
- USGS — Earthquake hazards: https://www.usgs.gov/programs/earthquake-hazards
- Smithsonian Global Volcanism Program: https://volcano.si.edu/
- NASA Earth Observatory: https://earthobservatory.nasa.gov/
- Three.js documentation: https://threejs.org/docs/
- WCAG 2.2 quick reference: https://www.w3.org/WAI/WCAG22/quickref/

---

**Plan version:** 1.0
**Created:** 2026-10-28
**Next step:** scaffold the project, then implement M1 (spherical geometry + plate raster + tests) before building the globe.
