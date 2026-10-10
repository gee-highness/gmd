# Plan: the best game and the best UI/UX /fly can be

Status: proposed. Nothing in this plan is implemented yet.

## 0. Framing - what "best" means for this project specifically

`/fly` already has a binding identity, written before this plan: `docs/fly/09-physicality-charter.md`
says **"everything real and physical"** and rules out any effect "driven by a hand-set timer or a
distance threshold alone" (its rule 1), and `docs/fly/05-ui-hud-spec.md` already specifies a calm,
instrument-panel HUD, not a scoreboard. So "best game" here does **not** mean adding scores, lives,
power-ups or arbitrary difficulty curves - that would contradict the project's own charter. It means:

1. **Close the gap between what's already specified and what's built.** `05-ui-hud-spec.md` and
   `09-physicality-charter.md` describe a HUD and a feel that `EarthFlight.tsx` only partly
   implements today (audited in §1-§3 below). Building the rest of the existing spec *is* "best
   UI/UX" - the project already defined the target.
2. **Turn the existing, real telemetry into objectives**, the way a flight sim does: precision
   landings, point-to-point legs, altitude/speed records - all scored from numbers the sim already
   computes (impact speed, g-load, fuel used, time), never from an invented mechanic. §4.
3. **Finish the sensory feedback loop** (audio, haptics, camera) so the physically-real inputs the
   charter already demands are actually felt, not just computed. §5.

This plan is scoped to what exists and flies today - the Earth world (`EarthFlight.tsx`), the
hangar (`Hangar.tsx`) and the flight arena (`FlightArena.tsx`). The bigger ambitions already
written down (big ship, other worlds, the streaming residency manager) stay in `docs/plan-fly.md`'s
F0-F12 roadmap and are not repeated or re-promised here - see §8.

## 1. What's already there vs. what the HUD spec promises

Audited `EarthFlight.tsx` (current) against `docs/fly/05-ui-hud-spec.md` section by section:

| Spec element (`05-ui-hud-spec.md`) | Built? | Gap |
|---|---|---|
| Top bar, back, view toggle, place picker | ✅ | - |
| Bottom flight strip (speed/alt/fuel/throttle) | ✅ | - |
| Details panel (LAT/LON/ALT/AGL/SPD/Mach/V-S/HDG/THR/PITCH/FUEL) | ✅ | - |
| Orbit panel (AP/PE/V/IN ORBIT) | ✅ | - |
| Warnings | Partial | One muted text line (`earth-data-note`), not the spec's top-centre pill with an **action** ("Pitch up", "Slow down") |
| **Pause menu (`Esc`)** | ❌ | No pause at all; `Esc` is unbound. Spec: resume/controls/quality/comfort/audio/exit, sim freezes |
| **Comfort settings** (motion intensity, FOV kick, camera shake, text size) | ❌ | `reducedMotion` is auto-detected (`matchMedia`) but never user-togglable, and there is no settings surface to put it in |
| **Settings persistence** | ❌ | No `localStorage` anywhere in `src/components/fly` or `src/lib/fly` - every toggle (imagery, buildings, labels, minimap, assists) resets on reload |
| **Photo mode (`P`)** | ❌ | Not built |
| **Reality dial** (Cinematic/Physical/Strict, `09-…` §1.8) | ❌ | Not exposed anywhere; assists are on/off checkboxes with no named preset |
| **Physics lens (`F3`)** | ❌ | Not built - no way to see the forces/ρ/q/T driving what's on screen |
| **Recall card** (damage > 120%, modal) | ❌ | Crash just sets `event: 'crash'` and respawns; no explanation card |
| `aria-live` announcements | Partial | One region covers landed/rough/crash; tier/assist/warning changes are silent |
| Target card / "Go to…" | ❌ | The `<Select>` teleports instantly; no distance/heading-to-target readout en route |

This table **is** the backlog for "best UI/UX": it is not new design, it is finishing a design
Gee already approved as binding. §2 and §3 turn the gaps into tickets.

## 2. Phase 1: settings, persistence and the pause menu (do first)

Everything else in this plan wants a place to live and a way to be remembered - build that first.

1. **`lib/fly/settings.ts`**: a small typed store - `{ reality: 'cinematic'|'physical'|'strict',
   reducedMotion: 'auto'|'on'|'off', cameraShake: 0-1, fov: number, uiScale: 'normal'|'large',
   audio: { master: number, muted: boolean } }` - read/write through `localStorage`, wrapped in
   try/catch (private browsing can throw), with sane defaults when it's empty or corrupt. Pure
   functions, unit-testable without a browser (same bar as the rest of `lib/fly`).
2. **Pause menu** (`Esc`, and a button next to the existing hide-UI control): freezes the sim loop
   (skip the physics step, keep rendering/input for the menu itself), shows Resume / Controls /
   Comfort / Audio / Reality dial / Exit to hangar. Reuses the existing `glass` panel style and
   `Checkbox`/`Select` components already used in the HUD help panel - this is assembly, not new
   visual design.
3. **Wire existing toggles to the store**: `imageryOn`, `buildingsOn`, `labelsOn`, `minimapOn`,
   `hoverAssist`, `levelAssist` already exist as React state in `EarthFlight.tsx` (and the `M`/`H`
   keys already in plan-fly-map-data.md and the street-names work) - initialize them from
   `settings.ts` and write through on change, instead of plain `useState`.
4. **Comfort settings panel**: motion intensity (maps to `CameraRig`'s existing `reducedMotion`
   flag, currently hard-wired to `matchMedia` only - make it a three-state override), camera-shake
   intensity multiplier, text size. All read from the same store.

**Verification:** unit tests for `settings.ts` (round-trip, corrupt-JSON fallback, quota-exceeded
fallback); a Playwright check that a toggle set, then a reload, keeps its value; `prefers-reduced-motion`
respected both automatically and via the manual override (axe pass on the pause menu, like the
existing a11y e2e coverage for other pages).

**Effort:** medium. **Risk:** low - additive, and every existing control keeps working if the
store is empty (defaults match current hard-coded values).

## 3. Phase 2: warnings, physics lens, reality dial and recall card

Closes the rest of the HUD-spec gap table, now that Phase 1 gives them somewhere to live.

1. **Unified warnings pill** (top-centre, per spec): replace the single muted `earth-data-note`
   line with a small queue of `{ level: 'caution'|'warning', text, action }` pills, each driven by
   an existing telemetry threshold already computed in `earthflight.ts`/the HUD object (high-G,
   MAX-Q, hull heat, low fuel, terrain-data-unreachable) - **never a new timer**, per the charter's
   rule 1: every pill's trigger is a physical quantity already in `hud`.
2. **Physics lens (`F3`)**: a toggleable overlay printing the forces/quantities already computed
   each frame (thrust, drag, lift, g, q, ρ, T) next to the ship - almost all of it is already in
   the `Hud` interface or one step removed in `earthflight.ts`'s internal state; this is a read-out,
   not new physics.
3. **Reality dial**: three named presets (Cinematic/Physical/Strict, `09-…` §1.8) that set
   `hoverAssist`/`levelAssist` and a new fuel-forgiveness flag together, instead of toggling them
   one by one - stored via `settings.ts`. Default stays today's behaviour (≈ Physical).
4. **Recall/crash card**: on `event.kind === 'crash'`, a modal explaining *what exceeded what*
   (impact speed vs. the gear's tolerance - already computed in `earthflight.ts`'s touchdown
   classification, just not surfaced) instead of a silent respawn, with a clear "Back to takeoff"
   action (reusing the existing `respawn()`).
5. **`aria-live` coverage**: extend the one existing region to also announce tier/assist changes
   and new warnings, throttled to ≤ 1 per 2 s per the spec's own accessibility checklist (§6 there).

**Verification:** unit tests for the warning-threshold logic (table-driven, like the rest of
`lib/fly`'s physics tests) and the touchdown-classification-to-copy mapping; axe pass on the new
overlays; manual check that the physics-lens numbers match the HUD's own displayed values (they
read from the same `hud` object, so this is mostly a rendering check).

**Effort:** medium. **Risk:** low-medium (the warnings pill replaces a load-bearing a11y element,
so the accessibility checklist needs a full re-pass, not just a glance).

## 4. Phase 3: objectives from real telemetry (the "game" part)

Nothing here is a new mechanic - every objective below scores a number the sim already produces.
This keeps faith with the charter's rule 7 (determinism) and rule 1 (physical driver): no hidden
randomness, no arbitrary pass/fail line that isn't already a physical threshold in the sim.

1. **Flight log** (`lib/fly/log.ts`, persisted via `settings.ts`'s storage layer): on every landing
   event, record `{ place, touchdownSpeed, gLoad, fuelUsed, flightTimeS, date }`. A small "Logbook"
   panel (reachable from the pause menu) lists past flights - distance comes free once
   `plan-fly-map-data.md`'s Phase 3 (flight trail) exists, since it already computes haversine
   distance over the flown path.
2. **Precision landing**: the sim already classifies every touchdown as `landed`/`rough`/`crash`
   (`earthflight.ts`'s impact-speed thresholds) - surface that classification as the objective
   itself ("smooth landing", "rough landing", shown via the recall-card work in Phase 2) rather than
   inventing a separate scoring scale.
3. **Point-to-point legs**: pick a start and destination from the existing 18 `places.ts` entries
   (or, once `plan-fly-map-data.md` Phase 1 lands, any airport); the HUD shows great-circle distance
   and bearing to the target (reuses `geo.ts`'s existing math) and a timer starts on departure and
   stops on landing. No pass/fail threshold invented - it's just a stopwatch and a logged time,
   comparable against your own past attempts from the logbook.
4. **Milestone badges**, computed, not awarded by a designer's arbitrary rule: reached orbit (the
   HUD's existing `inOrbit` flag), landed at every one of the 18 places (set membership over the
   logbook), flown faster than Mach N at sea level (max observed `hud.mach` while `agl < 1000`).
   Each badge's condition is a boolean over already-logged telemetry - no new simulation needed.
5. **Ghost replay** (stretch, depends on Phase 1 of `plan-fly-map-data.md`'s flight-trail work):
   render a past flight's recorded path as a faint line on the minimap during a new attempt of the
   same leg, for a visual "beat your own time" without adding competitive/online features (none of
   which this plan proposes - everything here is local and solo, consistent with §8 of the HUD spec,
   "no telemetry sent anywhere").

**Verification:** unit tests for the log's append/prune logic and each badge's boolean condition
(table-driven against recorded fixture flights); a Playwright flight that lands, checks the logbook
gained one entry with the right fields.

**Effort:** medium (log + precision landing + legs); the badge set and ghost replay are each small
additions once the log exists. **Risk:** low - all local, all derived from existing telemetry, no
new physics and no network calls.

## 5. Phase 4: game feel - audio, haptics, camera

The charter already requires every effect to be "computed from a simulated physical quantity"
(rule 1) - this phase is specifically the sensory layer that rule was written for, and right now
**/fly has no audio at all** (confirmed: no `Audio`/`AudioContext` anywhere in `src/components/fly`
or `src/lib/fly`) and no gamepad rumble (the gamepad library already supports it,
`src/lib/input/gamepad.ts`/`hub.ts`, but `EarthFlight.tsx` never calls it).

1. **Engine/wind audio**: Web Audio, driven by `hud.throttle`/`hud.speed`/`hud.pressure` each
   frame - engine pitch and volume from throttle and thrust, wind noise from airspeed and dynamic
   pressure `q`, cut to near-silence in vacuum (ties directly to the charter's atmosphere model, not
   a flat "engine sound"). Respects `settings.ts`'s audio volume/mute.
2. **Touchdown/impact sound**, keyed to the same impact-speed value that already classifies
   landed/rough/crash - one more read-out of existing physics, not a new system.
3. **Gamepad haptics**: wire the existing rumble API (already in `lib/input/hub.ts`) to g-load
   spikes and touchdown impact - short, physically-triggered pulses, not decorative "haptic
   feedback on every button press".
4. **Camera shake from turbulence/g, not from a timer**: `CameraRig` already exists
   (`lib/fly/camera.ts`); add a shake term driven by `q` (dynamic pressure) and g-load magnitude,
   scaled by the comfort setting from Phase 1, zero under `prefers-reduced-motion`.
5. **Photo mode (`P`)**, from the HUD spec: freeze physics (reuses the pause-menu freeze from
   Phase 1), free camera, FOV slider, hide HUD, capture the canvas only.

**Verification:** the audio/haptic trigger functions are pure (`volume(throttle, speed, pressure):
number` etc.) and unit-testable without a browser, same pattern as the rest of `lib/fly`'s physics
modules; manual listening/feel check in a real browser (this phase is inherently the one area unit
tests can't fully cover - say so plainly rather than claiming more than was checked).

**Effort:** medium-large (audio is the biggest net-new subsystem in this whole plan). **Risk:**
medium - Web Audio autoplay policies need a user-gesture unlock (the "Take it flying" button already
provides one), and every new sound must respect the charter's "no effect without a physical driver"
rule, which is an extra discipline, not just "add sound files".

## 6. Phase 5: onboarding and first flight

There is currently no tutorial; the controls help panel exists and defaults open, which is
adequate but not a first-flight experience.

1. **First-flight overlay**: on first visit (flag in `settings.ts`), a short, skippable sequence
   (take off → climb → look around → land) with the spec's required **Pause/Skip/Exit always
   visible** (§5 of `05-…`). Dismissible permanently via the pause menu's Controls panel.
2. **Contextual hints**, not a wall of text: the existing help panel's keybind list stays as
   reference; the first-flight sequence instead shows one instruction at a time tied to what the
   player is doing (e.g. "climb" hint clears once `agl > 50`), each condition read from existing
   `hud` fields - again, no invented triggers.

**Verification:** Playwright walkthrough asserting each step's hint clears on the right telemetry
condition, and that Skip/Exit work at every step (keyboard and touch).

**Effort:** small-medium. **Risk:** low.

## 7. Mobile/touch UX audit

Per the spec's mobile section (`05-…` §3), largely already built - dual virtual sticks exist
(`TouchControls.tsx`, left = thrust/strafe, right = yaw/pitch, 44px+ targets, safe-area insets) -
but not yet audited against the rest of this plan:

1. Pause menu, comfort settings and the warnings pill (Phases 1-2) need a mobile layout pass
   (bottom sheet, per spec, rather than the desktop panel position).
2. Photo mode and the physics lens are desktop-shaped by nature (FOV slider, dense numeric
   overlay) - decide per-feature whether they appear on touch at all, or in a simplified form,
   rather than assuming parity.
3. Haptics (Phase 4) map naturally to touch devices' own vibration API as well as gamepad rumble -
   worth the same trigger functions driving both.

**Effort:** small, once the phases above exist (this is a layout pass on top of them, not new
logic). **Risk:** low.

## 8. Explicitly not in this plan

- **Big ship (Meridian), other worlds, the streaming residency manager** - tracked in
  `docs/plan-fly.md` tickets F4-F8 and F12; this plan doesn't touch them or re-promise a timeline.
- **Any score/currency/power-up/unlock system** - would contradict the physicality charter's rule 1
  (no effect without a physical driver) and rule 7 (determinism); deliberately excluded.
- **Multiplayer/leaderboards/online anything** - the HUD spec is explicit that no telemetry leaves
  the device (§8); the logbook/badges in §4 are local-only by design, not a stepping stone to a
  server.
- **Minimap data additions** (airports, search, flight trail) - already their own plan,
  `docs/plan-fly-map-data.md`; §4.1 and §4.5 here lean on its Phase 3 (flight trail) once built, but
  this document doesn't duplicate it.

## 9. Suggested order

1 (settings/pause - foundation everything else needs) → 2 (close the HUD-spec gaps) → 4 (audio/feel
- the single biggest felt improvement) → 3 (objectives, builds on the log Phase 1's storage layer
makes trivial) → 5 (onboarding) → 6 (mobile audit, once the desktop versions exist). Phases 1-2 are
a real dependency (everything else wants settings storage and the pause-menu surface); 3-6 can be
reordered freely after that.
