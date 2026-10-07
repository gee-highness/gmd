import { describe, expect, it } from 'vitest';
import { PLACES } from './places';
import { bearingDeg, destination, distanceM, formatDistance, formatEta, nearest, normalizeLatLon, turnTo } from './nav';

const zurich = { lat: 47.3769, lon: 8.5417 }, london = { lat: 51.5074, lon: -0.1278 }, newYork = { lat: 40.7128, lon: -74.006 };

describe('great-circle navigation', () => {
	it('Zurich → London is about 777 km, New York → London about 5 570 km', () => {
		expect(distanceM(zurich, london) / 1000).toBeGreaterThan(770); expect(distanceM(zurich, london) / 1000).toBeLessThan(785);
		expect(distanceM(newYork, london) / 1000).toBeGreaterThan(5550); expect(distanceM(newYork, london) / 1000).toBeLessThan(5590);
	});
	it('distance is symmetric and zero to itself; a quarter of the equator is ≈ 10 008 km', () => {
		expect(distanceM(zurich, zurich)).toBe(0);
		expect(distanceM(zurich, london)).toBeCloseTo(distanceM(london, zurich), 6);
		expect(distanceM({ lat: 0, lon: 0 }, { lat: 0, lon: 90 }) / 1000).toBeCloseTo(10007.5, 0);
	});
	it('cardinal bearings', () => {
		expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 10, lon: 0 })).toBeCloseTo(0, 6);
		expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: 10 })).toBeCloseTo(90, 6);
		expect(bearingDeg({ lat: 0, lon: 0 }, { lat: -10, lon: 0 })).toBeCloseTo(180, 6);
		expect(bearingDeg({ lat: 0, lon: 0 }, { lat: 0, lon: -10 })).toBeCloseTo(270, 6);
	});
	it('Zurich → London heads about north-west, and New York → London about north-east', () => {
		expect(bearingDeg(zurich, london)).toBeGreaterThan(300); expect(bearingDeg(zurich, london)).toBeLessThan(320);
		expect(bearingDeg(newYork, london)).toBeGreaterThan(45); expect(bearingDeg(newYork, london)).toBeLessThan(60);
	});
	it('turnTo takes the short way round and signs right as positive', () => {
		expect(turnTo(350, 10)).toBeCloseTo(20, 9); expect(turnTo(10, 350)).toBeCloseTo(-20, 9);
		expect(turnTo(90, 90)).toBe(0); expect(turnTo(0, 180)).toBe(180); expect(turnTo(180, 0)).toBe(180);
	});
	it('destination undoes bearing + distance, including across the antimeridian', () => {
		const d = destination(zurich, bearingDeg(zurich, london), distanceM(zurich, london));
		expect(d.lat).toBeCloseTo(london.lat, 4); expect(d.lon).toBeCloseTo(london.lon, 4);
		const w = destination({ lat: 0, lon: 179 }, 90, 222_000);
		expect(w.lon).toBeLessThan(-178); expect(w.lon).toBeGreaterThan(-180);
	});
});

describe('formatting and helpers', () => {
	it('distance units step from m to km', () => {
		expect(formatDistance(420)).toBe('420 m'); expect(formatDistance(1500)).toBe('1.5 km'); expect(formatDistance(250_000)).toBe('250 km'); expect(formatDistance(1_234_000)).toBe('1,234 km');
		expect(formatDistance(NaN)).toBe('—');
	});
	it('ETA is hidden when nearly stationary, m:ss under an hour, h:mm over', () => {
		expect(formatEta(10_000, 2)).toBeNull(); expect(formatEta(6000, 100)).toBe('1:00'); expect(formatEta(1_000_000, 100)).toBe('2:46 h');
	});
	it('nearest place', () => {
		const n = nearest({ lat: 46.0, lon: 7.7 }, PLACES)!;
		expect(PLACES).toContain(n.place); expect(n.distance).toBeGreaterThanOrEqual(0);
		expect(nearest({ lat: 0, lon: 0 }, [])).toBeNull();
	});
	it('map clicks after panning the world are wrapped and clamped', () => {
		expect(normalizeLatLon(10, 190)).toEqual({ lat: 10, lon: -170 }); expect(normalizeLatLon(10, -190)).toEqual({ lat: 10, lon: 170 });
		expect(normalizeLatLon(95, 0).lat).toBeCloseTo(85.0511, 4); expect(normalizeLatLon(-95, 0).lat).toBeCloseTo(-85.0511, 4);
	});
});
