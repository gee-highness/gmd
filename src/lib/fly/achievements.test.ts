import { describe, expect, it } from 'vitest';
import { computeBadges, loadAchievements, recordLanding, recordTick } from './achievements';
import { PLACES } from './earth/places';
import { type StorageLike } from './settings';

function fakeStorage(initial: Record<string, string> = {}): StorageLike {
	const data = new Map(Object.entries(initial));
	return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('achievements', () => {
	it('starts at the defaults (nothing achieved)', () => {
		const s = loadAchievements(fakeStorage());
		expect(s).toEqual({ reachedOrbit: false, maxMachLowAltitude: 0, placesLanded: [] });
		expect(computeBadges(s).every((b) => !b.achieved)).toBe(true);
	});
	it('reaching orbit once sticks, even after returning to the ground', () => {
		const storage = fakeStorage();
		recordTick(0.1, 100, true, storage);
		recordTick(0.1, 0, false, storage); // landed again, not in orbit any more
		expect(loadAchievements(storage).reachedOrbit).toBe(true);
	});
	it('tracks the highest Mach number seen below 1000 m AGL, ignoring a higher Mach seen higher up', () => {
		const storage = fakeStorage();
		recordTick(2.5, 15000, false, storage); // fast, but not "low"
		expect(loadAchievements(storage).maxMachLowAltitude).toBe(0);
		recordTick(1.2, 500, false, storage);
		expect(loadAchievements(storage).maxMachLowAltitude).toBe(1.2);
		recordTick(0.9, 500, false, storage); // a later, slower reading never lowers the recorded peak
		expect(loadAchievements(storage).maxMachLowAltitude).toBe(1.2);
	});
	it('records a landed place once, not duplicated on a repeat landing there', () => {
		const storage = fakeStorage();
		recordLanding('zurich', storage);
		recordLanding('zurich', storage);
		recordLanding('london', storage);
		expect(loadAchievements(storage).placesLanded.sort()).toEqual(['london', 'zurich']);
	});
	it('recordLanding(null, …) is a no-op (no match within 5 km)', () => {
		const storage = fakeStorage();
		recordLanding(null, storage);
		expect(loadAchievements(storage).placesLanded).toEqual([]);
	});
	it('computeBadges reports progress for the "everywhere" badge and flips achieved once every place is logged', () => {
		const storage = fakeStorage();
		for (const p of PLACES) recordLanding(p.id, storage);
		const badges = computeBadges(loadAchievements(storage));
		const everywhere = badges.find((b) => b.id === 'everywhere')!;
		expect(everywhere.achieved).toBe(true);
		expect(everywhere.progress).toBe(`${PLACES.length} / ${PLACES.length}`);
	});
	it('a corrupt saved achievements record reads back as the defaults rather than throwing', () => {
		expect(loadAchievements(fakeStorage({ 'fly.achievements.v1': 'not json' }))).toEqual({ reachedOrbit: false, maxMachLowAltitude: 0, placesLanded: [] });
	});
});
