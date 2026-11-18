# Marble League

A browser-based, spectator-first 3D physics sports simulation built with **React**, **TypeScript**, **Three.js**, and **cannon-es**.

Outcomes emerge strictly from rigid-body physics and deterministic seeded randomness — never predetermined scripts.

---

## Architecture & Tech Stack

- **Application UI**: React 19, TypeScript, Tailwind CSS (`src/App.tsx`, `src/components/*`).
- **3D Broadcast Rendering**: Three.js (`src/render/SprintTrackScene.ts`, `src/render/textures.ts`) with procedural marble swirl textures, PMREM reflections, contact shadows, dynamic camera presets (`Follow`, `Overhead`, `Finish`, `Gate`), and sub-tick position/quaternion interpolation (`lerp` / `slerp`) between fixed physics steps.
- **Headless 3D Physics Engine**: `cannon-es` (`src/engine/sprintSimulation.ts`) decoupled completely from Three.js, DOM, and React.
- **Centralised Physics Config**: `src/engine/sprintConfig.ts` (`SPRINT_PHYSICS_CONFIG`).
- **Deterministic PRNG**: Mulberry32 (`src/engine/prng.ts`). Zero `Math.random()` in simulation, roster balancing, or rendering.
- **League Management & Persistence**: Fixed 8-team / 32-marble roster (`src/engine/roster.ts`), equal-weight two-stage Championship scoring (`src/engine/scoring.ts`), and `localStorage` persistence (`src/engine/storage.ts`, key `marble_league_persistent_state_v1`).

---

## Sprint Physics Model & Hardening (Phase 2)

### 1. Fixed Timestep & Determinism
- Physics steps at a constant **`FIXED_PHYSICS_DT = 1 / 120` s (120 Hz)** using `cannon-es` with `SAPBroadphase` sorted along the track Z-axis (`axisIndex = 2`) and 6 Gauss-Seidel solver iterations.
- The render loop (`SprintBroadcastView.tsx`) accumulates frame `dt`, advances discrete `1/120s` physics sub-steps (supporting `0.5x`, `1x`, `2x`, `4x` playback speeds without altering physical outcomes), clamps extreme tab-stall accumulator backlogs, and renders smoothly via sub-step interpolation (`alpha = accumulator / FIXED_PHYSICS_DT`).
- Given identical race seed, venue configuration, and competitor lineup/lanes, races are 100% deterministic across runs and replay speeds. (Note: cross-platform IEEE-754 transcendental differences across different CPU architectures/JS engines are minimized by fixed timestep and Mulberry32 PRNG, though exact bit-level identity is guaranteed per runtime/device.)

### 2. Gravity, Rolling Friction & Natural Spin
- Gravity (`-9.81 m/s²`) drives acceleration down the steep launch ramp (`12.5°` at Velocity Park, `14.5°` at Stratos Straightaway) and gentle main straightaway (`2.1°` / `2.4°`).
- Artificial per-tick `angularVelocity.x` overwrites and hard `vMax` speed clamps were removed. Raising track-marble friction (`0.30`) allows rigid-body contact torque to spin all three axes naturally (`ω_x * R ≈ v_z`).
- Forward equilibrium (~10.5–12.0 m/s) emerges continuously from forward rolling drive balanced against quadratic aerodynamic drag (`aeroDragCoeff * v²`) and linear rolling resistance.

### 3. Launch-Chute Dividers to Open Straightaway & Real Collisions
- **Launch Chute (`z = -3m` to `rampLengthMeters + 1.5m`)**: 7 inner polycarbonate lane dividers establish clean gate separation down the ramp.
- **Open Straightaway (`z > rampLengthMeters + 1.5m`)**: Physical inner walls end cleanly with visual stanchions aligned identically in `SprintTrackScene.ts` and `SprintSimulation.ts`, transitioning onto painted 8-lane markings bounded by full-length metallic outer containment rails.
- **Soft Lane Guidance & Drafting**: Rigid lane-centering (`6.5` spring) was replaced with gentle straightaway guidance (`openSpringK = 0.09`) plus slipstream drafting (`maxDragReduction = 0.28` within `0.65m–4.8m` behind a leader), enabling lateral drift, pack compression, genuine glass-on-glass collisions (`restitution = 0.62`), and collision-linked overtakes without runaway pinball chaos or track escapes.

### 4. Attribute Influence (`SPRINT_PHYSICS_CONFIG.attributes`)
All four physical attributes (`52–92` balanced range) influence Sprint outcomes:
- **Acceleration (`ACC`)**: Controls starting-gate launch impulse and early ramp drive efficiency (`accelSensitivity = 0.0032`).
- **Top Speed (`SPD`)**: Reduces quadratic aerodynamic drag coefficient at high speed (`topSpeedAeroSensitivity = 0.0037`).
- **Handling (`HND`)**: Reduces rolling resistance, mitigates lateral-velocity scrubbing in traffic, and improves slipstream line agility (`handlingSensitivity = 0.0062`).
- **Stability (`STB`)**: Absorbs deterministic track seam impulses and micro-turbulence gusts (`stabilitySensitivity = 0.0075`), preserving momentum over rough surface joints.

---

## Admin Controls & Broadcast Polish (Phase 3)

### 1. Options & Administrative Current-Season Reset
- Added **Options** (`src/components/OptionsView.tsx`) to primary navigation with:
  - **General**: Application overview, current season number, live league status, roster count, and archived season count.
  - **Administration**: **`RESET CURRENT SEASON`** control protected by a clear confirmation dialog.
- `resetCurrentSeason()` (`src/engine/storage.ts`) resets the active season calendar back to Round 1 (`scheduled`, results cleared) and updates `localStorage` immediately while preserving the season number, all 8 teams, 32 marbles, custom display names, custom team logos, physical attributes, career statistics, venue records, and completed historical season archives.

### 2. Team Logo Customisation (`TeamsView.tsx` & `src/utils/logoImage.ts`)
- Each team profile includes **Edit Logo** supporting **PNG, JPG, and WEBP** uploads with live preview before saving, **Save Logo**, **Cancel**, and **Restore Default Logo**.
- Uploaded images are normalised client-side into lightweight square `160×160` transparent assets using aspect-preserving `contain` scaling (never distorted) and stored under permanent team IDs (`team.logoDataUrl`) so logos persist across reloads and appear consistently across Team Profiles, League Hub, Standings, Calendar results, Live Leaderboards, and Official Classifications.

### 3. Default Overhead Camera & Broadcast Camera Modes (`src/engine/broadcastConfig.ts`, `SprintTrackScene.ts`)
- Every Sprint broadcast (including initial load, Replay Seed, and New Seed) opens in the **Overhead** camera (`DEFAULT_CAMERA_MODE = 'overhead'`).
- Four smooth, wall-clock damped camera modes remain available at all race speeds with track-deck clearance clamping:
  - **Overhead** *(default)*: Dynamic pack-centered high-angle framing that expands cleanly as the pack stretches.
  - **Follow**: High 3/4 crane angle tracking the leading pack anchor without snapping backward as early finishers cross the line.
  - **Finish**: Reverse photo-finish angle looking cleanly through the checkered arch toward incoming contenders.
  - **Gate**: Prominent starting-grid composition framing all 8 lanes, the starting gate bar, and the 3-stage light pod.

### 4. Deliberate ~5-Second Starting Countdown (`SPRINT_COUNTDOWN_SCHEDULE`)
- Races open with a managed timer sequence (`READY` `1.5s` → `3` `1.0s` → `2` `1.0s` → `1` `1.0s` → `GO` at `4.5s` with distinct audio tone and emerald emphasis).
- Physics simulation remains paused and the starting gate stays physically closed until `GO`, with automatic timer cleanup on exit, replay, or seed change.

---

## Commands & Verification

```bash
# Install dependencies
npm install

# Run development server (port 3000)
npm run dev

# Typecheck & production build
npm run lint
npm run build

# Run automated unit tests (roster, scoring, Sprint physics, determinism, collisions)
npm test

# Run large-scale headless Sprint audit batches (default 1,000 + 1,000 = 2,000 races)
npm run audit:sprint
```

---

## Simulation Audit & Competitive Balancing Results (Baseline vs. Phase 2)

Results below are measured across **2,000 headless races** per snapshot (`1,000` Sprint Representatives races + `1,000` All-32-Marbles Mixed-Field races) via `npm run audit:sprint`.

### 1. Sprint Representatives (1,000 Races)

| Metric | Baseline (Pre-Hardening) | Phase 2 (Final) |
| --- | --- | --- |
| Stuck / Escaped Marbles | `0` / `0` | `0` / `0` |
| Finish Time Range | `10.335s – 11.797s` | `9.280s – 13.064s` |
| Peak Speed | `11.12 m/s` | `11.32 m/s` |
| Marble-to-Marble Contacts / Race | `0.00` (`0.00` significant) | `5.41` (`4.42` significant, avg impact `0.83 m/s`) |
| Wall Contacts / Race | `0.00` | `6.02` |
| Overtakes / Race | `2.65` | `22.28` |
| Lead Changes / Race | `0.04` | `1.90` |
| Collision-Linked Rank Shifts / Race | `0.00` | `3.24` |
| Unique Race Winners | `3 / 8` (Jinx `56.0%`, Blaze `23.7%`, Turbo `20.3%`) | `8 / 8` (`7.7% – 18.7%` spread) |
| Unique Podium Finishers | `5 / 8` | `8 / 8` |

**Phase 2 Representative Win Shares (1,000 Races):**
- Jinx (`18.7%`, avg pos `3.99`) · Kodiak (`15.9%`, `4.18`) · Vex (`13.1%`, `4.39`) · Turbo (`12.6%`, `4.46`) · Voltage (`12.4%`, `4.57`) · Blaze (`11.3%`, `4.63`) · Riot (`8.3%`, `4.91`) · Orion (`7.7%`, `4.88`).

### 2. All 32 Marbles Mixed Field (1,000 Races)

| Metric | Baseline (Pre-Hardening) | Phase 2 (Final) |
| --- | --- | --- |
| Stuck / Escaped Marbles | `0` / `0` | `0` / `0` |
| Finish Time Range | `10.351s – 12.167s` | `9.294s – 13.011s` |
| Peak Speed | `11.15 m/s` | `11.85 m/s` |
| Marble-to-Marble Contacts / Race | `0.00` | `4.66` (`3.76` significant, avg impact `0.80 m/s`) |
| Overtakes / Race | `3.47` | `19.61` |
| Lead Changes / Race | `0.06` | `1.56` |
| Collision-Linked Rank Shifts / Race | `0.00` | `2.39` |
| Unique Race Winners | `9 / 32` | `28 / 32` |
| Unique Podium Finishers | `17 / 32` | `32 / 32` |
| Attribute Rank Correlations (`ACC / SPD / HND / STB`, negative = better finish) | `-0.717 / -0.721 / +0.194 / +0.355` | `-0.279 / -0.284 / -0.125 / -0.033` |

