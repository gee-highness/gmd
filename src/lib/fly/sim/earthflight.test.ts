import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { EARTH, WGS84, circularSpeed, enuBasis, geodeticToEcef, rad } from '../earth/geo';
import { airAt } from '../earth/atmosphere';
import { KESTREL, terminalSpeed } from '../ships/specs';
import { NO_INPUT } from './flight';
import { type EarthState, type TerrainQuery, dragRise, earthTelemetry, geoOf, groundNormal, heatFlux, setAttitude, spawnOnGround, stepEarth, totalMass } from './earthflight';

const sea: TerrainQuery = { height: () => 0 };
const run = (s: EarthState, secs: number, input = NO_INPUT, terrain: TerrainQuery = sea, opts = {}, dt = 1 / 60) => { for (let t = 0; t < secs - 1e-9; t += dt) stepEarth(s, input, dt, terrain, opts); return s; };
const noFuel = (s: EarthState) => { s.propellant = 0; s.landed = false; return s; };

describe('standing, taking off and landing anywhere', () => {
	it('a ship on the ground stays put (co-rotating with the Earth: at rest in ECEF)', () => {
		const s = spawnOnGround(46, 8, 0, 0);
		const p0 = s.pos.clone();
		run(s, 10);
		expect(s.pos.distanceTo(p0)).toBeLessThan(0.05); expect(s.vel.length()).toBeLessThan(0.05); expect(s.landed).toBe(true);
	});
	it('works at every latitude and longitude, including the poles and the date line', () => {
		for (const [la, lo] of [[0, 0], [89.9, 10], [-89.9, -170], [37, 180], [-33.9, 151.2], [64, -22]] as const) {
			const s = spawnOnGround(la, lo, 90, 0); run(s, 3);
			expect(s.landed).toBe(true); expect(s.vel.length()).toBeLessThan(0.1);
			expect(geoOf(s.pos).h).toBeCloseTo(2.03, 1);
		}
	});
	it('holds still, with no motion, while the terrain below is not loaded', () => {
		const s = spawnOnGround(10, 10, 0, 0), p = s.pos.clone();
		expect(stepEarth(s, { ...NO_INPUT, collective: 1 }, 1, { height: () => null })).toBe(false);
		expect(s.pos.distanceTo(p)).toBe(0);
	});
	it('climbs on the collective, burns propellant (mass falls) and lands gently on the gear', () => {
		const s = spawnOnGround(45, -100, 0, 300);
		const m0 = totalMass(s);
		const high: TerrainQuery = { height: () => 300 };
		run(s, 12, { ...NO_INPUT, collective: 1 }, high);
		expect(earthTelemetry(s, high).altitudeAgl).toBeGreaterThan(60);
		expect(totalMass(s)).toBeLessThan(m0);
		run(s, 40, { ...NO_INPUT, collective: -0.35 }, high);
		expect(s.landed).toBe(true); expect(s.event?.kind).toBe('landed');
	});
	it('a free fall into the ground at speed is a crash', () => {
		const s = spawnOnGround(0, 0, 0, 0); s.pos.copy(new THREE.Vector3(...geodeticToEcef(0, 0, 400))); noFuel(s); s.landed = false;
		run(s, 40);
		expect(s.event?.kind).toBe('crash');
	});
});

describe('the physics of a rotating planet (measured effects)', () => {
	it('a 4 s drop in vacuum at 45° latitude deflects ≈ 11 mm east (Coriolis: ⅓Ωg t³ cos φ)', () => {
		const lat = rad(45), lon = rad(10), b = enuBasis(lat, lon);
		const s = noFuel(spawnOnGround(45, 10, 0, 0));
		s.pos.set(...geodeticToEcef(lat, lon, 200));
		const p0 = s.pos.clone();
		run(s, 4, NO_INPUT, sea, { rho: 0 }, 1 / 120);
		const d = s.pos.clone().sub(p0);
		const east = d.x * b.east[0] + d.y * b.east[1] + d.z * b.east[2];
		const expected = (1 / 3) * EARTH.omega * 9.806 * 64 * Math.cos(lat);
		expect(east).toBeGreaterThan(expected * 0.85); expect(east).toBeLessThan(expected * 1.15);
	});
	it('falls 78.5 m in 4 s (½ g t²) at 45°', () => {
		const s = noFuel(spawnOnGround(45, 10, 0, 0)); s.pos.set(...geodeticToEcef(rad(45), rad(10), 200));
		const h0 = geoOf(s.pos).h; run(s, 4, NO_INPUT, sea, { rho: 0 }, 1 / 120);
		expect(h0 - geoOf(s.pos).h).toBeCloseTo(0.5 * 9.806 * 16, 0);
	});
	it('a 400 km equatorial circular orbit holds for a quarter orbit (period 92.4 min)', () => {
		const r = WGS84.a + 400000, vc = circularSpeed(r);
		const s = noFuel(spawnOnGround(0, 0, 90, 0));
		s.pos.set(r, 0, 0); s.vel.set(0, vc - EARTH.omega * r, 0); // prograde inertial circular speed expressed in the rotating frame
		let minH = 1e9, maxH = -1e9;
		const quarter = (2 * Math.PI * r) / vc / 4;
		for (let t = 0; t < quarter; t += 4) { stepEarth(s, NO_INPUT, 4, sea); const h = geoOf(s.pos).h; minH = Math.min(minH, h); maxH = Math.max(maxH, h); }
		expect(minH).toBeGreaterThan(385000); expect(maxH).toBeLessThan(415000);
	});
	it('the eastward launch bonus: the surface itself moves at 465 m/s at the equator in the inertial frame', () => {
		expect(EARTH.omega * WGS84.a).toBeCloseTo(465.1, 0);
	});
});

describe('atmosphere and drag', () => {
	it('terminal speed of a ballistic fall matches √(2βg/ρ) near the ground (≈ 50 m/s)', () => {
		const s = noFuel(spawnOnGround(40, 0, 0, 0)); s.pos.set(...geodeticToEcef(rad(40), 0, 3000));
		let v = 0;
		for (let t = 0; t < 120; t += 1 / 60) { stepEarth(s, NO_INPUT, 1 / 60, sea); const h = geoOf(s.pos).h; if (h < 400) { v = s.vel.length(); break; } }
		const dryKestrel = { ...KESTREL, mass: { ...KESTREL.mass, propellant: 0 } }; // the test ship has no propellant
		const expected = terminalSpeed(dryKestrel, 9.8, airAt(400).density);
		expect(v).toBeGreaterThan(expected * 0.93); expect(v).toBeLessThan(expected * 1.07);
	});
	it('no air above the Kármán line: a coasting ship keeps its speed', () => {
		const s = noFuel(spawnOnGround(0, 0, 0, 0)); s.pos.set(...geodeticToEcef(0, 0, 150000)); s.vel.set(0, 3000, 0);
		const v0 = s.vel.length(); run(s, 5, NO_INPUT, sea, {}, 1 / 10);
		expect(Math.abs(s.vel.length() - v0) / v0).toBeLessThan(0.01);
	});
	it('transonic drag rise peaks near Mach 1 and drops after', () => {
		expect(dragRise(0.3)).toBeCloseTo(1, 2); expect(dragRise(1.05)).toBeGreaterThan(3); expect(dragRise(3)).toBeLessThan(dragRise(1.05));
	});
	it('stagnation heating at re-entry speed is in the published tens-of-W/cm² range', () => {
		const q = heatFlux(70000, 7500) / 1e4; // W/cm²
		expect(q).toBeGreaterThan(20); expect(q).toBeLessThan(120);
		expect(heatFlux(5000, 100)).toBeLessThan(1000);
	});
});

describe('slopes', () => {
	const slope = (deg: number): TerrainQuery => ({ height: (lat, lon) => Math.tan(rad(deg)) * (lon - rad(10)) * 6371000 * Math.cos(rad(45)) + 5000 + 0 * lat });
	it('ground normal matches a 11.3° eastward-rising plane', () => {
		const n = groundNormal(rad(45), rad(10), { height: (_la, lo) => 0.2 * (lo - rad(10)) * 6371000 * Math.cos(rad(45)) + 2000 });
		const u = enuBasis(rad(45), rad(10)).up;
		const tilt = Math.acos(n[0] * u[0] + n[1] * u[1] + n[2] * u[2]) * 180 / Math.PI;
		expect(tilt).toBeCloseTo(11.3, 0);
	});
	it('stays on a 10° slope but slides down a 40° slope', () => {
		const gentle = slope(10), steep = slope(40);
		const a = spawnOnGround(45, 10, 0, 5000); run(a, 8, NO_INPUT, gentle);
		const b = spawnOnGround(45, 10, 0, 5000); run(b, 8, NO_INPUT, steep);
		expect(a.vel.length()).toBeLessThan(0.5);
		expect(b.vel.length()).toBeGreaterThan(1);
	});
});

describe('telemetry', () => {
	it('reports lat/lon, heading and air state', () => {
		const s = spawnOnGround(47.37, 8.54, 90, 410);
		const t = earthTelemetry(s, { height: () => 410 });
		expect(t.lat).toBeCloseTo(47.37, 2); expect(t.lon).toBeCloseTo(8.54, 2);
		expect(t.heading).toBeCloseTo(90, 0); expect(t.altitudeAgl).toBeLessThan(1); expect(t.inSpace).toBe(false);
		expect(t.air.pressure).toBeGreaterThan(90000);
	});
});

describe('felt g-force (what the accelerometer reads, docs/plan-fly-game-ux.md §2)', () => {
	const airborneState = (altitude: number, propellant: number): EarthState => {
		const p = geodeticToEcef(rad(0), rad(0), altitude);
		return { pos: new THREE.Vector3(...p), vel: new THREE.Vector3(), q: new THREE.Quaternion(), w: new THREE.Vector3(), propellant, gear: false, landed: false, time: 0, event: null, hover: 0, main: 0, mainSigned: 0, flightMode: false, throttle: 0, pitchHold: null, gForce: 1 };
	};
	it('reads 1 g standing still on the ground, before and after a step', () => {
		const s = spawnOnGround(0, 0, 0, 0);
		expect(s.gForce).toBe(1);
		stepEarth(s, NO_INPUT, 0.1, { height: () => 0 });
		expect(s.gForce).toBeCloseTo(1, 6);
	});
	it('reads close to 0 g in free fall: no thrust (no propellant), clear of the ground', () => {
		const s = airborneState(2000, 0);
		stepEarth(s, NO_INPUT, 0.05, { height: () => -1e5 });
		expect(s.gForce).toBeLessThan(0.05);
	});
	it('reads measurably more than 1 g while hover assist commands a hard climb against gravity', () => {
		const s = airborneState(2000, KESTREL.mass.propellant);
		stepEarth(s, { ...NO_INPUT, collective: 1 }, 0.05, { height: () => -1e5 });
		expect(s.gForce).toBeGreaterThan(1.1);
	});
});

import { AERO, liftCoefficient } from './earthflight';
import { podTargets } from '../ship/pods';

/** An airborne ship at altitude over the sea, heading east, in hover or flight mode. */
function airborne(flightMode: boolean, alt = 1500, speed = 0) {
	const s = spawnOnGround(0, 10, 90, 0);
	s.pos.set(...geodeticToEcef(0, rad(10), alt)); s.landed = false; s.flightMode = flightMode;
	if (speed) { const e = enuBasis(0, rad(10)).east; s.vel.set(e[0] * speed, e[1] * speed, e[2] * speed); }
	return s;
}
const alt = (s: EarthState) => geoOf(s.pos).h;
const podTilt = (s: EarthState) => podTargets({ hoverN: s.hover, mainN: s.mainSigned, yaw: 0, roll: 0 }, 100_000).left;

describe('flight mode (thrusters aft, wings carry the weight)', () => {
	it('lift curve: linear, symmetric, and it stalls past ~17°', () => {
		expect(liftCoefficient(0.1)).toBeCloseTo(0.42, 5); expect(liftCoefficient(-0.1)).toBeCloseTo(-0.42, 5);
		expect(Math.abs(liftCoefficient(0.5))).toBeLessThan(Math.abs(liftCoefficient(0.3))); expect(AERO.S).toBeGreaterThan(0);
	});
	it('is much faster than hover mode, the lift engines hand over to the wings, and the pods end up pointing aft', () => {
		const hover = airborne(false), flight = airborne(true);
		for (let t = 0; t < 70; t += 1 / 60) {
			stepEarth(hover, { ...NO_INPUT, forward: 1 }, 1 / 60, sea);
			stepEarth(flight, { ...NO_INPUT, forward: 1 }, 1 / 60, sea);
		}
		const vh = hover.vel.length(), vf = flight.vel.length();
		expect(vh).toBeLessThan(75); expect(vf).toBeGreaterThan(vh * 1.8); expect(vf).toBeGreaterThan(130);
		expect(flight.hover).toBeLessThan(5_000); // wings carry it: almost no lift-engine thrust left
		expect(podTilt(flight)).toBeGreaterThan(1.4); // exhaust swung nearly horizontal, aft
		expect(Math.abs(podTilt(hover))).toBeLessThan(1.2);
	});
	it('holds its altitude on its own while accelerating through the transition (flight assist)', () => {
		const s = airborne(true, 1500);
		let minA = 1e9, maxA = -1e9;
		for (let t = 0; t < 80; t += 1 / 60) { stepEarth(s, { ...NO_INPUT, forward: 1 }, 1 / 60, sea); const a = alt(s); minA = Math.min(minA, a); maxA = Math.max(maxA, a); }
		expect(minA).toBeGreaterThan(1500 - 220); expect(maxA).toBeLessThan(1500 + 220);
	});
	it('the throttle is a lever: W raises it, S lowers it, and it resets in hover mode', () => {
		const s = airborne(true);
		for (let t = 0; t < 1; t += 1 / 60) stepEarth(s, { ...NO_INPUT, forward: 1 }, 1 / 60, sea);
		expect(s.throttle).toBeGreaterThan(0.35); expect(s.throttle).toBeLessThan(0.55);
		for (let t = 0; t < 3; t += 1 / 60) stepEarth(s, { ...NO_INPUT, forward: -1 }, 1 / 60, sea);
		expect(s.throttle).toBe(0);
		s.throttle = 0.8; s.flightMode = false; stepEarth(s, NO_INPUT, 1 / 60, sea); expect(s.throttle).toBe(0);
	});
	it('at idle throttle, S swings the thrusters forward to brake', () => {
		const s = airborne(true, 1500, 90);
		for (let t = 0; t < 4; t += 1 / 60) stepEarth(s, { ...NO_INPUT, forward: -1 }, 1 / 60, sea);
		expect(s.mainSigned).toBeLessThan(0); expect(podTilt(s)).toBeLessThan(0);
	});
	it('switching back to hover mode at speed keeps flying: the pods drop to point down and the ship slows without falling', () => {
		const s = airborne(true, 1500, 110);
		for (let t = 0; t < 6; t += 1 / 60) stepEarth(s, { ...NO_INPUT, forward: 1 }, 1 / 60, sea);
		s.flightMode = false;
		let minA = 1e9;
		for (let t = 0; t < 25; t += 1 / 60) { stepEarth(s, { ...NO_INPUT, forward: -0.3 }, 1 / 60, sea); minA = Math.min(minA, alt(s)); }
		expect(minA).toBeGreaterThan(1000); expect(s.vel.length()).toBeLessThan(80);
	});
	it('the tail stabiliser turns a skewed nose into the airflow (sideslip shrinks)', () => {
		const s = airborne(true, 1500, 100);
		setAttitude(s.q, 0, rad(10), rad(90) + 0.35, 0.05); // nose 20° off the flight path
		const side = () => { const f = new THREE.Vector3(1, 0, 0).applyQuaternion(s.q), r = new THREE.Vector3(0, 0, 1).applyQuaternion(s.q); return Math.abs(Math.atan2(s.vel.dot(r), s.vel.dot(f))); };
		const before = side();
		for (let t = 0; t < 6; t += 1 / 60) stepEarth(s, { ...NO_INPUT, forward: 0.5 }, 1 / 60, sea);
		expect(before).toBeGreaterThan(0.25); expect(side()).toBeLessThan(before * 0.45);
	});
});
