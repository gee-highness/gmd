import { describe, expect, it } from 'vitest';
import { type FlightLogEntry, appendLogEntry, loadLog, nearestPlace } from './log';
import { type StorageLike } from './settings';

function fakeStorage(initial: Record<string, string> = {}): StorageLike {
	const data = new Map(Object.entries(initial));
	return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

const entry = (over: Partial<FlightLogEntry> = {}): FlightLogEntry => ({
	date: '2026-01-01T00:00:00.000Z', kind: 'landed', touchdownSpeed: 1, fuelUsedFraction: 0.1, distanceKm: 10, flightTimeS: 120, place: 'zurich', ...over,
});

describe('flight log', () => {
	it('starts empty, and stays empty with no storage', () => {
		expect(loadLog(fakeStorage())).toEqual([]);
		expect(loadLog(null)).toEqual([]);
	});
	it('appends and round-trips an entry', () => {
		const s = fakeStorage();
		appendLogEntry(entry(), s);
		expect(loadLog(s)).toEqual([entry()]);
	});
	it('keeps entries in append order (oldest first) and returns the updated log', () => {
		const s = fakeStorage();
		appendLogEntry(entry({ place: 'a' }), s);
		const r = appendLogEntry(entry({ place: 'b' }), s);
		expect(r.map((e) => e.place)).toEqual(['a', 'b']);
	});
	it('prunes to the oldest-dropped cap rather than growing without bound', () => {
		const s = fakeStorage();
		let last: FlightLogEntry[] = [];
		for (let i = 0; i < 210; i++) last = appendLogEntry(entry({ place: String(i) }), s);
		expect(last.length).toBe(200);
		expect(last[0].place).toBe('10'); // the first 10 (0..9) were pruned
		expect(last[last.length - 1].place).toBe('209');
	});
	it('a corrupt saved log reads back as empty rather than throwing', () => {
		expect(loadLog(fakeStorage({ 'fly.log.v1': 'not json' }))).toEqual([]);
		expect(loadLog(fakeStorage({ 'fly.log.v1': '{"not":"an array"}' }))).toEqual([]);
	});
});

describe('nearestPlace', () => {
	const places = [{ id: 'zurich', lat: 47.3769, lon: 8.5417 }, { id: 'london', lat: 51.5074, lon: -0.1278 }];
	it('finds the nearest place within 5 km', () => {
		expect(nearestPlace(47.377, 8.542, places)).toBe('zurich');
	});
	it('returns null when nothing is within 5 km', () => {
		expect(nearestPlace(0, 0, places)).toBeNull();
	});
	it('returns null for an empty place list', () => {
		expect(nearestPlace(47.3769, 8.5417, [])).toBeNull();
	});
});
