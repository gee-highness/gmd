// src/lib/fly/sim/earthflight.ts
// Flight on the real Earth: position and velocity are kept in ECEF (Earth-fixed, rotating) doubles, so the ship can take off and land anywhere on
// the globe and a ship parked on the ground is simply at rest. Physical effects, all from simulated quantities (docs/fly/09):
//   • gravity: point mass + J2 oblateness (WGS84), falling off with the inverse square of the true distance;
//   • the rotating frame: Coriolis −2Ω×v and centrifugal −Ω×(Ω×r) (eastward drop deflection, Eötvös effect, orbits in the rotating frame);
//   • drag from the 1976 standard atmosphere with a transonic drag rise, no air above ~100 km;
//   • propellant mass flow ṁ = F/(Isp·g0), so mass falls as it burns;
//   • ground contact against the real terrain heights, with slope, friction and touchdown classification.
// NOT modelled yet (stated in the HUD and docs): wind, weather, re-entry heating damage, geoid (heights are MSL used as ellipsoid height),
// water buoyancy (the sea surface is treated as ground).

import * as THREE from 'three';
import { G0, KESTREL, type ShipSpec } from '../ships/specs';
import { EARTH, WGS84, type Vec3, ecefToGeodetic, enuBasis, geodeticToEcef, gravityEcef, rad, deg } from '../earth/geo';
import { airAt, dynamicPressure } from '../earth/atmosphere';
import { type OrbitInfo, orbitOf } from '../earth/orbit';
import { FOOT_OFFSET, MAX_RATE, RCS_FORCE, RETRO_FRACTION, axes } from './flight';

export interface EarthState {
	/** ECEF position, metres (doubles). */
	pos: THREE.Vector3;
	/** Velocity relative to the rotating Earth, m/s, in ECEF axes. */
	vel: THREE.Vector3;
	/** Body → ECEF orientation. Body axes: +X forward, +Y up, +Z right. */
	q: THREE.Quaternion;
	/** Body angular rates (see flight.ts for the sign conventions). */
	w: THREE.Vector3;
	propellant: number;
	gear: boolean;
	landed: boolean;
	time: number;
	event: null | { kind: 'landed' | 'rough' | 'crash'; speed: number; time: number };
	hover: number;
	main: number;
	/** Forward thrust, newtons, signed (negative while braking). */
	mainSigned: number;
	/** Flight mode: the thrusters aim aft for fast forward flight and the wings carry the weight. Hover mode is the VTOL default. */
	flightMode: boolean;
	/** Throttle lever 0…1 in flight mode (W/S move it, like an aircraft). */
	throttle: number;
	/** Horizon-hold: the pitch angle above the local horizon (rad) the nose is held at, or null when the pilot is steering. */
	pitchHold: number | null;
}

export interface TerrainQuery {
	/** Ground height above sea level (m) at lat/lon radians, or null when that terrain is not loaded yet (the ship then holds). */
	height(lat: number, lon: number): number | null;
}

export interface EarthOptions {
	spec?: ShipSpec;
	hoverAssist?: boolean;
	levelAssist?: boolean;
	/** Override the air density (kg/m³) — tests only. */
	rho?: number;
	/** Switch the rotating-frame terms off — tests only. */
	inertialFrame?: boolean;
}


export const totalMass = (s: EarthState, spec: ShipSpec = KESTREL) => spec.mass.dry + s.propellant;

export interface Geo { lat: number; lon: number; h: number; up: Vec3; east: Vec3; north: Vec3 }
export function geoOf(p: THREE.Vector3): Geo {
	const g = ecefToGeodetic(p.x, p.y, p.z);
	const b = enuBasis(g.lat, g.lon);
	return { lat: g.lat, lon: g.lon, h: g.h, up: b.up, east: b.east, north: b.north };
}

/** A ship standing on the ground at lat/lon (degrees), nose toward headingDeg (clockwise from north), gear down. */
export function spawnOnGround(latDeg: number, lonDeg: number, headingDeg: number, groundHeight: number, spec: ShipSpec = KESTREL): EarthState {
	const lat = rad(latDeg), lon = rad(lonDeg);
	const p = geodeticToEcef(lat, lon, groundHeight + FOOT_OFFSET.down);
	const s: EarthState = {
		pos: new THREE.Vector3(...p), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(),
		propellant: spec.mass.propellant, gear: true, landed: true, time: 0, event: null, hover: 0, main: 0, mainSigned: 0, flightMode: false, throttle: 0, pitchHold: null,
	};
	setAttitude(s.q, lat, lon, rad(headingDeg), 0);
	return s;
}

/** Orient the body so it is level at (lat,lon) facing `heading` (rad clockwise from north) with `pitch` nose-up. */
export function setAttitude(q: THREE.Quaternion, lat: number, lon: number, heading: number, pitch: number) {
	const { east, north, up } = enuBasis(lat, lon);
	const E = new THREE.Vector3(...east), N = new THREE.Vector3(...north), U = new THREE.Vector3(...up);
	const fwd = N.clone().multiplyScalar(Math.cos(heading)).addScaledVector(E, Math.sin(heading));
	const right = new THREE.Vector3().crossVectors(fwd, U).normalize(); // forward × up = right
	const upL = new THREE.Vector3().crossVectors(right, fwd).normalize();
	if (pitch) { fwd.applyAxisAngle(right, pitch); upL.applyAxisAngle(right, pitch); }
	const m = new THREE.Matrix4().makeBasis(fwd, upL, right);
	q.setFromRotationMatrix(m).normalize();
}

/** Transonic drag multiplier on C_D: rises through Mach 0.8–1.2 and settles slightly above subsonic (published trends, approximate). */
export function dragRise(m: number): number {
	const peak = 2.2 * Math.exp(-(((m - 1.05) / 0.28) ** 2));
	const supersonic = m > 1.2 ? 0.25 * Math.exp(-(m - 1.2) / 3) : 0;
	return 1 + peak + supersonic;
}

/** Stagnation-point convective heat flux q = k·√(ρ/Rn)·v³ (Sutton–Graves, k = 1.7415e-4 for Earth air), W/m², nose radius Rn. */
export function heatFlux(altitude: number, speed: number, noseRadius = 1.5): number {
	return 1.7415e-4 * Math.sqrt(airAt(altitude).density / noseRadius) * speed ** 3;
}

/** Altitude above the ellipsoid from ECEF without iteration (geocentric-latitude radius; metre-level error is irrelevant to density). */
function altitudeApprox(p: Vec3): number {
	const r = Math.hypot(p[0], p[1], p[2]);
	const sinPsi = p[2] / r, cosPsi = Math.sqrt(1 - sinPsi * sinPsi);
	const a = WGS84.a, b = WGS84.b;
	return r - (a * b) / Math.sqrt((b * cosPsi) ** 2 + (a * sinPsi) ** 2);
}

/**
 * Aerodynamics of the airframe (GAMEPLAY values, tagged G in docs/fly/11): the body is streamlined nose-on and blunt broadside, and the
 * fuselage and fins act as a lifting body. Drag is applied per body axis; lift follows the angle of attack; induced drag follows lift².
 */
export const AERO = {
	/** Drag area C_D·A nose-on (m²); the vertical axis uses the ship's `cdA` (broadside from above), the lateral axis `Cz`. */
	Cx: 7,
	Cz: 40,
	/** Lifting area (m²), lift-curve slope (per rad), induced-drag factor. */
	S: 16,
	slope: 4.2,
	k: 0.08,
};

/** Lift coefficient vs angle of attack (rad): linear to 0.3 rad, then a stall that sheds lift. */
export function liftCoefficient(alpha: number): number {
	const a = Math.abs(alpha);
	const c = a < 0.3 ? AERO.slope * a : Math.max(0.35, AERO.slope * 0.3 - 2.4 * (a - 0.3));
	return Math.sign(alpha) * c;
}

/** In hover mode the forward thrust fades out between 30 and 50 m/s: the pods are configured for lift, so fast flight needs flight mode. */
const HOVER_MODE_LIMIT = (vx: number, scale = 1) => Math.min(1, Math.max(0, (50 * scale - vx) / (20 * scale)));

interface Body { fwd: Vec3; up: Vec3; right: Vec3; brake: number }

const T = { e: new THREE.Euler(), qd: new THREE.Quaternion(), f: new THREE.Vector3(), u: new THREE.Vector3(), r: new THREE.Vector3(), n: new THREE.Vector3() };

function accel(pos: Vec3, vel: Vec3, thrustPerMass: Vec3, spec: ShipSpec, mass: number, opts: EarthOptions, body?: Body): Vec3 {
	const g = gravityEcef(pos[0], pos[1], pos[2]);
	let ax = g[0] + thrustPerMass[0], ay = g[1] + thrustPerMass[1], az = g[2] + thrustPerMass[2];
	if (!opts.inertialFrame) {
		const w = EARTH.omega;
		// Coriolis −2Ω×v with Ω = (0,0,ω); centrifugal −Ω×(Ω×r) = ω²(x, y, 0)
		ax += 2 * w * vel[1] + w * w * pos[0];
		ay += -2 * w * vel[0] + w * w * pos[1];
	}
	const speed = Math.hypot(vel[0], vel[1], vel[2]);
	if (speed > 0) {
		const alt = altitudeApprox(pos);
		const a = airAt(alt);
		const rho = opts.rho ?? a.density;
		if (rho > 0 && !body) {
			const k = (-0.5 * rho * spec.cdA * dragRise(speed / a.speedOfSound) * speed) / mass;
			ax += k * vel[0]; ay += k * vel[1]; az += k * vel[2];
		} else if (rho > 0 && body) {
			const dot = (u: Vec3) => vel[0] * u[0] + vel[1] * u[1] + vel[2] * u[2];
			const vx = dot(body.fwd), vy = dot(body.up), vz = dot(body.right);
			const half = 0.5 * rho * speed;
			const dk = spec.perf?.drag ?? 1; // tuned ships: drag on every axis scales together (`cdA` already carries it for the vertical axis)
			const cx = AERO.Cx * dk * (1 + 3 * body.brake) * dragRise(speed / a.speedOfSound);
			// drag along each body axis
			let fx = -half * cx * vx, fy = -half * spec.cdA * vy, fz = -half * AERO.Cz * dk * vz;
			// wing lift (along the body's up axis) and induced drag, from the angle of attack
			if (vx > 0.5) {
				const q = 0.5 * rho * vx * vx * AERO.S, cl = liftCoefficient(Math.atan2(-vy, vx));
				fy += q * cl; fx -= q * AERO.k * cl * cl;
			}
			ax += (fx * body.fwd[0] + fy * body.up[0] + fz * body.right[0]) / mass;
			ay += (fx * body.fwd[1] + fy * body.up[1] + fz * body.right[1]) / mass;
			az += (fx * body.fwd[2] + fy * body.up[2] + fz * body.right[2]) / mass;
		}
	}
	return [ax, ay, az];
}

/** Advance `s` by `dt` seconds. While the terrain under the ship is not loaded the ship holds (returns false). */
export function stepEarth(s: EarthState, input: import('./flight').FlightInput, dt: number, terrain: TerrainQuery, opts: EarthOptions = {}): boolean {
	let remaining = dt;
	while (remaining > 1e-9) {
		const geo = geoOf(s.pos);
		const gnd = terrain.height(geo.lat, geo.lon);
		if (gnd === null && geo.h < 20000) return false; // wait for the ground before moving near it
		const alt = geo.h - (gnd ?? 0);
		const speed = s.vel.length();
		// Smaller steps near the ground and at speed; large steps in space (RK4 stays accurate for orbits).
		const h = Math.min(remaining, Math.max(1 / 240, Math.min(0.5, (0.12 * Math.max(alt, 1)) / Math.max(speed, 1)), 1 / 60) * (alt > 20000 ? 8 : 1));
		substep(s, input, h, geo, gnd ?? 0, terrain, opts);
		remaining -= h;
	}
	return true;
}

function substep(s: EarthState, input: import('./flight').FlightInput, dt: number, geo: Geo, ground: number, terrain: TerrainQuery, opts: EarthOptions) {
	const spec = opts.spec ?? KESTREL;
	const clamp1 = (v: number) => Math.max(-1, Math.min(1, Number.isFinite(v) ? v : 0));
	const inp = { collective: clamp1(input.collective), forward: clamp1(input.forward), strafe: clamp1(input.strafe), yaw: clamp1(input.yaw), pitch: clamp1(input.pitch), roll: clamp1(input.roll) };
	const m = totalMass(s, spec);
	const n = T.n.set(...geo.up);
	const { fwd, up, right } = axes(s.q);
	const hasFuel = s.propellant > 0;
	// What a flight computer's accelerometer reads: gravity plus the centrifugal term, along the local vertical.
	const gv = gravityEcef(s.pos.x, s.pos.y, s.pos.z);
	const gLocal = -((gv[0] + EARTH.omega ** 2 * s.pos.x) * n.x + (gv[1] + EARTH.omega ** 2 * s.pos.y) * n.y + gv[2] * n.z);

	// ---- flight mode: thrusters aimed aft, throttle lever, wings carry the weight, tail stabiliser keeps the nose on the flight path
	const flight = s.flightMode && !s.landed;
	const vx = s.vel.dot(fwd), vzB = s.vel.dot(right), vUp0 = s.vel.dot(n), sp = s.vel.length();
	const rho0 = opts.rho ?? airAt(geo.h).density;
	if (flight) s.throttle = Math.min(1, Math.max(0, s.throttle + inp.forward * dt * 0.45)); else s.throttle = 0;
	const qDyn = 0.5 * rho0 * vx * vx;
	// The path-hold assist only works where there is air to fly on and the pilot is not pitching; steeper than ~25° (a climb to space) the nose just holds.
	const gamma0 = Math.asin(Math.max(-1, Math.min(1, vUp0 / Math.max(1, sp))));
	const flightAssist = flight && (opts.hoverAssist ?? true) && vx > 25 && qDyn > 1500 && inp.pitch === 0 && Math.abs(gamma0) < 0.6;

	// attitude: first-order rate response, optional levelling toward the true local vertical
	let cmdRoll = inp.roll * MAX_RATE.roll, cmdPitch = inp.pitch * MAX_RATE.pitch;
	let cmdYaw = -inp.yaw * MAX_RATE.yaw;
	if ((opts.levelAssist ?? true) && !s.landed) {
		if (inp.roll === 0) cmdRoll += right.dot(n) * 1.6;
		if (inp.pitch === 0 && !flight) cmdPitch += -fwd.dot(n) * 1.6;
	}
	if (flightAssist) {
		// Hold the flight path: aim the nose at (flight-path angle + the angle of attack that makes lift equal weight), correcting climb rate.
		const q = Math.max(1, 0.5 * rho0 * vx * vx);
		const gamma = Math.asin(Math.max(-1, Math.min(1, vUp0 / Math.max(1, sp))));
		const alphaTrim = Math.min(0.28, Math.max(0, (m * gLocal * Math.cos(gamma)) / (q * AERO.S * AERO.slope)));
		// shallow flight returns to level and holds altitude; a deliberate steep climb or dive (> ~17°) holds its flight-path angle
		const gammaCmd = Math.abs(gamma) < 0.3 ? Math.max(-0.12, Math.min(0.12, -0.04 * vUp0)) : gamma;
		const theta = Math.asin(Math.max(-1, Math.min(1, fwd.dot(n))));
		cmdPitch = Math.max(-MAX_RATE.pitch, Math.min(MAX_RATE.pitch, 2.5 * (gamma + alphaTrim + 1.5 * (gammaCmd - gamma) - theta)));
	}
	if (flight && !flightAssist && (opts.levelAssist ?? true)) {
		// Horizon hold: out of the air (or in a steep climb) the nose keeps the pitch angle it had when the pilot let go, measured from the LOCAL horizon.
		// Without it the nose, fixed in space, drifts up as the Earth curves away beneath a fast ship and an orbit insertion burn climbs instead of circularising.
		const theta = Math.asin(Math.max(-1, Math.min(1, fwd.dot(n))));
		if (inp.pitch !== 0) s.pitchHold = null;
		else {
			if (s.pitchHold === null) s.pitchHold = theta;
			cmdPitch = Math.max(-MAX_RATE.pitch, Math.min(MAX_RATE.pitch, 2 * (s.pitchHold - theta)));
		}
	} else s.pitchHold = null;
	if (flight && sp > 20) cmdYaw += -Math.max(-0.6, Math.min(0.6, 2 * Math.atan2(vzB, Math.max(1, vx)))); // the tail fin weathervanes the nose into the airflow
	const k = 1 - Math.exp(-dt / 0.25);
	s.w.x += (cmdRoll - s.w.x) * k; s.w.y += (cmdYaw - s.w.y) * k; s.w.z += (cmdPitch - s.w.z) * k;
	if (s.landed) { s.w.x *= 0.2; s.w.z *= 0.2; }
	T.e.set(s.w.x * dt, s.w.y * dt, s.w.z * dt, 'XYZ'); T.qd.setFromEuler(T.e);
	s.q.multiply(T.qd).normalize();

	// thrust
	const vUp = s.vel.dot(n);
	let hover = 0;
	const blend = flight ? Math.min(1, Math.max(0, 1 - (vx - 25) / 60)) : 1; // lift engines fade out as the wings take over (25 → 85 m/s)
	if (flight && !(opts.hoverAssist ?? true)) {
		hover = 0; // pure aircraft: no lift engines
	} else if (flight) {
		const vzCmd = inp.collective * 8, aCmd = gLocal + 2.2 * (vzCmd - vUp);
		hover = (blend * (m * aCmd)) / Math.max(0.25, up.dot(n));
	} else if ((opts.hoverAssist ?? true) && s.landed && inp.collective <= 0.05) {
		hover = 0; // engines idle on the ground: the weight rests on the gear and no propellant is burned
	} else if (opts.hoverAssist ?? true) {
		const vzCmd = inp.collective * 8;
		const aCmd = gLocal + 2.2 * (vzCmd - vUp);
		hover = (m * aCmd) / Math.max(0.25, up.dot(n));
	} else hover = spec.thrust.hover * (0.5 + 0.5 * inp.collective);
	hover = hasFuel ? Math.min(spec.thrust.hover, Math.max(0, hover)) : 0;
	const mainCmd = flight
		? (inp.forward < 0 && s.throttle <= 0.001 ? inp.forward * spec.thrust.main * RETRO_FRACTION : s.throttle * spec.thrust.main) // throttle lever; at idle, S swings the thrusters forward to brake
		: inp.forward >= 0 ? inp.forward * spec.thrust.main * HOVER_MODE_LIMIT(vx, spec.perf?.speed) : inp.forward * spec.thrust.main * RETRO_FRACTION; // hover mode is speed-limited (30 → 50 m/s): switch to flight mode to go faster
	const main = hasFuel ? mainCmd : 0;
	const brake = flight ? Math.max(0, -inp.collective) * (1 - blend) : 0; // Shift is the airbrake once the wings are carrying the ship
	const rcs = hasFuel ? inp.strafe * RCS_FORCE * (spec.perf?.thrust ?? 1) : 0;
	const tpm: Vec3 = [
		(up.x * hover + fwd.x * main + right.x * rcs) / m,
		(up.y * hover + fwd.y * main + right.y * rcs) / m,
		(up.z * hover + fwd.z * main + right.z * rcs) / m,
	];

	// RK4 on (position, velocity) with thrust and attitude held over the step
	const p0: Vec3 = [s.pos.x, s.pos.y, s.pos.z], v0: Vec3 = [s.vel.x, s.vel.y, s.vel.z];
	const add = (a: Vec3, b: Vec3, f: number): Vec3 => [a[0] + b[0] * f, a[1] + b[1] * f, a[2] + b[2] * f];
	const bodyAxes: Body = { fwd: [fwd.x, fwd.y, fwd.z], up: [up.x, up.y, up.z], right: [right.x, right.y, right.z], brake };
	const a1 = accel(p0, v0, tpm, spec, m, opts, bodyAxes);
	const p2 = add(p0, v0, dt / 2), v2 = add(v0, a1, dt / 2), a2 = accel(p2, v2, tpm, spec, m, opts, bodyAxes);
	const p3 = add(p0, v2, dt / 2), v3 = add(v0, a2, dt / 2), a3 = accel(p3, v3, tpm, spec, m, opts, bodyAxes);
	const p4 = add(p0, v3, dt), v4 = add(v0, a3, dt), a4 = accel(p4, v4, tpm, spec, m, opts, bodyAxes);
	for (let i = 0; i < 3; i++) {
		const dp = (dt / 6) * (v0[i] + 2 * v2[i] + 2 * v3[i] + v4[i]);
		const dv = (dt / 6) * (a1[i] + 2 * a2[i] + 2 * a3[i] + a4[i]);
		if (i === 0) { s.pos.x += dp; s.vel.x += dv; } else if (i === 1) { s.pos.y += dp; s.vel.y += dv; } else { s.pos.z += dp; s.vel.z += dv; }
	}

	// propellant: ṁ = F/(Isp g0)
	s.propellant = Math.max(0, s.propellant - ((Math.abs(hover) + Math.abs(main) + Math.abs(rcs) * 0.2) / (spec.isp * G0)) * dt);
	s.hover = hover; s.main = Math.abs(main); s.mainSigned = main;

	contact(s, geo, ground, terrain, spec, dt, m, gLocal, hover);
	s.time += dt;
}

/** Ground slope normal (ECEF) from four neighbouring height samples ~20 m away; returns the geodetic up if terrain is unknown. */
export function groundNormal(lat: number, lon: number, terrain: TerrainQuery, d = 20): Vec3 {
	const b = enuBasis(lat, lon);
	const dLat = d / 6371000, dLon = d / (6371000 * Math.max(0.05, Math.cos(lat)));
	const hE = terrain.height(lat, lon + dLon), hW = terrain.height(lat, lon - dLon), hN = terrain.height(lat + dLat, lon), hS = terrain.height(lat - dLat, lon);
	if (hE === null || hW === null || hN === null || hS === null) return b.up;
	const sx = (Math.max(0, hE) - Math.max(0, hW)) / (2 * d), sy = (Math.max(0, hN) - Math.max(0, hS)) / (2 * d); // slopes toward east, north
	const nx = -sx, ny = -sy, nz = 1, l = Math.hypot(nx, ny, nz);
	return [0, 1, 2].map((i) => (b.east[i] * nx + b.north[i] * ny + b.up[i] * nz) / l) as Vec3;
}

function contact(s: EarthState, geo: Geo, ground: number, terrain: TerrainQuery, spec: ShipSpec, dt: number, m: number, gLocal: number, hover: number) {
	const g2 = geoOf(s.pos);
	const gh = Math.max(0, terrain.height(g2.lat, g2.lon) ?? ground); // the sea surface is solid ground here
	const foot = s.gear ? FOOT_OFFSET.down : FOOT_OFFSET.up;
	const clearance = g2.h - (gh + foot);
	const nUp = new THREE.Vector3(...g2.up);
	const { up } = axes(s.q);
	if (clearance <= 0) {
		const nGround = new THREE.Vector3(...groundNormal(g2.lat, g2.lon, terrain));
		const vn = s.vel.dot(nGround);
		const impact = -vn;
		if (!s.landed && impact > 0.05) {
			const vt = s.vel.clone().addScaledVector(nGround, -vn).length();
			const tilt = (Math.acos(Math.min(1, Math.max(-1, up.dot(nGround)))) * 180) / Math.PI;
			const bad = Math.max(impact / spec.landing.maxVz, vt / 2.5, tilt / (spec.landing.maxSlopeDeg * 1.2));
			const kind = !s.gear ? (impact > 1.5 ? 'crash' : 'rough') : bad > 2 ? 'crash' : bad > 1 ? 'rough' : 'landed';
			const rank = { landed: 0, rough: 1, crash: 2 } as const;
			if (!s.event || rank[kind] > rank[s.event.kind]) s.event = { kind, speed: impact, time: s.time };
		}
		s.pos.addScaledVector(nUp, -clearance); // seat the feet on the ground along the vertical
		if (vn < 0) s.vel.addScaledVector(nGround, -vn * (impact > 2 ? 1.12 : 1)); // remove the normal component (small bounce when hard)
		// Friction: Coulomb μ ≈ 0.6 (rubber/skid on rock); on steeper slopes the ship slides.
		const mu = 0.6, slopeCos = Math.min(1, Math.max(-1, nGround.dot(nUp)));
		const vt = s.vel.clone().addScaledVector(nGround, -s.vel.dot(nGround));
		const sp = vt.length();
		const decel = mu * gLocal * slopeCos * (s.gear ? 1 : 1.6);
		if (sp > 0) { const newSp = Math.max(0, sp - decel * dt); s.vel.addScaledVector(vt, (newSp - sp) / sp); }
		const tanSlope = Math.sqrt(Math.max(0, 1 - slopeCos * slopeCos)) / Math.max(1e-6, slopeCos);
		const sticks = tanSlope < mu;
		if (sticks && s.vel.length() < 0.3 && hover < m * gLocal * 1.02) s.vel.set(0, 0, 0);
		s.landed = s.vel.dot(nUp) <= 0.2 && up.dot(nUp) > 0.7 && hover < m * gLocal * 1.02;
	} else if (clearance > 0.3) s.landed = false;
}

export interface EarthTelemetry {
	hoverN: number; mainN: number; flightMode: boolean; throttle: number;
	lat: number; lon: number; altitudeMsl: number; altitudeAgl: number;
	speed: number; verticalSpeed: number; groundSpeed: number; heading: number; pitch: number;
	mach: number; q: number; gForce: number; heatFlux: number; fuelFraction: number; mass: number; hover: number; main: number;
	air: { temperature: number; pressure: number; density: number };
	inSpace: boolean;
	orbit: OrbitInfo;
}

export function earthTelemetry(s: EarthState, terrain: TerrainQuery, spec: ShipSpec = KESTREL): EarthTelemetry {
	const g = geoOf(s.pos);
	const n = new THREE.Vector3(...g.up), E = new THREE.Vector3(...g.east), N = new THREE.Vector3(...g.north);
	const foot = s.gear ? FOOT_OFFSET.down : FOOT_OFFSET.up;
	const gnd = Math.max(0, terrain.height(g.lat, g.lon) ?? 0);
	const vz = s.vel.dot(n);
	const horiz = s.vel.clone().addScaledVector(n, -vz);
	const { fwd } = axes(s.q);
	const a = airAt(g.h);
	const speed = s.vel.length();
	return {
		hoverN: s.hover, mainN: s.mainSigned, flightMode: s.flightMode, throttle: s.throttle,
		lat: deg(g.lat), lon: deg(g.lon), altitudeMsl: g.h - foot, altitudeAgl: Math.max(0, g.h - foot - gnd),
		speed, verticalSpeed: vz, groundSpeed: horiz.length(),
		heading: ((deg(Math.atan2(fwd.dot(E), fwd.dot(N))) % 360) + 360) % 360,
		pitch: deg(Math.asin(Math.max(-1, Math.min(1, fwd.dot(n))))),
		mach: speed / a.speedOfSound, q: dynamicPressure(g.h, speed),
		gForce: 0, heatFlux: heatFlux(g.h, speed), fuelFraction: s.propellant / spec.mass.propellant, mass: totalMass(s, spec),
		hover: s.hover / spec.thrust.hover, main: s.main / spec.thrust.main,
		air: { temperature: a.temperature, pressure: a.pressure, density: a.density },
		inSpace: g.h > EARTH.karman,
		orbit: orbitOf([s.pos.x, s.pos.y, s.pos.z], [s.vel.x, s.vel.y, s.vel.z]),
	};
}
