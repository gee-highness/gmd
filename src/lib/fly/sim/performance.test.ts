import { describe, expect, it } from 'vitest';
import { enuBasis, geodeticToEcef, rad } from '../earth/geo';
import { KESTREL, KESTREL_FAST, PERFORMANCE, deltaV, thrustToWeight, tuneShip } from '../ships/specs';
import { NO_INPUT } from './flight';
import { type EarthState, type TerrainQuery, earthTelemetry, geoOf, spawnOnGround, stepEarth } from './earthflight';

const sea: TerrainQuery = { height: () => 0 };
const DT = 1 / 60;

/** Flight mode over the sea at `alt`, heading east at `speed`, throttle lever set to `throttle`. */
function cruise(spec: typeof KESTREL, alt: number, speed: number, throttle: number): EarthState {
	const s = spawnOnGround(0, 10, 90, 0, spec);
	s.pos.set(...geodeticToEcef(0, rad(10), alt)); s.landed = false; s.flightMode = true; s.throttle = throttle;
	const e = enuBasis(0, rad(10)).east; s.vel.set(e[0] * speed, e[1] * speed, e[2] * speed);
	return s;
}
const fly = (s: EarthState, spec: typeof KESTREL, secs: number, on = (_t: number) => {}) => {
	for (let t = 0; t < secs - 1e-9; t += DT) { stepEarth(s, { ...NO_INPUT, forward: 1 }, DT, sea, { spec }); on(t); }
	return s;
};

describe('tuned Kestrel (PERFORMANCE dial)', () => {
	it('the stock Kestrel is untouched; the tuned one scales main thrust, drag area and Isp, and leaves the lift engines alone', () => {
		expect(KESTREL.thrust.main).toBe(120_000); expect(KESTREL.perf).toBeUndefined();
		expect(KESTREL_FAST.thrust.main).toBe(120_000 * PERFORMANCE.thrust);
		expect(KESTREL_FAST.thrust.hover).toBe(KESTREL.thrust.hover);
		expect(KESTREL_FAST.cdA).toBeCloseTo(KESTREL.cdA * PERFORMANCE.drag, 10);
		expect(KESTREL_FAST.isp).toBe(KESTREL.isp * PERFORMANCE.thrust * PERFORMANCE.fuel);
		expect(KESTREL_FAST.mass).toEqual(KESTREL.mass);
		expect(deltaV(KESTREL_FAST) / deltaV(KESTREL)).toBeCloseTo(100, 6);
		expect(thrustToWeight(KESTREL_FAST, 9.81)).toBeGreaterThan(thrustToWeight(KESTREL, 9.81) * 5);
		expect(tuneShip(KESTREL, { thrust: 1, drag: 1, fuel: 1 }).thrust).toEqual(KESTREL.thrust);
	});

	it('accelerates at least 10× harder (full throttle, 100 m/s, flight mode)', () => {
		const gain = (spec: typeof KESTREL) => { const s = cruise(spec, 1500, 100, 1), v0 = s.vel.length(); fly(s, spec, 1); return s.vel.length() - v0; };
		expect(gain(KESTREL_FAST) / gain(KESTREL)).toBeGreaterThan(10);
		expect(gain(KESTREL_FAST)).toBeGreaterThan(100); // m/s², about 14 g at the engine, drag included
	});

	it('flies about 10× faster after the same time at full throttle, holding its altitude, on a tenth of the fuel', () => {
		const run = (spec: typeof KESTREL) => { const s = cruise(spec, 1500, 100, 1); fly(s, spec, 300); return { v: s.vel.length(), h: geoOf(s.pos).h, fuel: earthTelemetry(s, sea, spec).fuelFraction }; };
		const stock = run(KESTREL), fast = run(KESTREL_FAST);
		expect(fast.v / stock.v).toBeGreaterThan(9); expect(fast.v / stock.v).toBeLessThan(12);
		expect(Math.abs(fast.h - 1500)).toBeLessThan(300); // the flight assist still holds the path at Mach 5
		// the tank lasts 10× longer: a tenth of the propellant is burned over the same time, at 10× the speed
		expect(1 - fast.fuel).toBeCloseTo((1 - stock.fuel) / PERFORMANCE.fuel, 2);
	});

	it('hover mode is no longer choked at 50 m/s: the limit scales with the dial', () => {
		const run = (spec: typeof KESTREL) => {
			const s = spawnOnGround(0, 10, 90, 0, spec);
			s.pos.set(...geodeticToEcef(0, rad(10), 1500)); s.landed = false; s.flightMode = false;
			for (let t = 0; t < 40; t += DT) stepEarth(s, { ...NO_INPUT, forward: 1 }, DT, sea, { spec });
			return s.vel.length();
		};
		expect(run(KESTREL)).toBeLessThan(60);
		expect(run(KESTREL_FAST)).toBeGreaterThan(300);
	});
});
