// src/lib/fly/achievements.ts
// Badges (docs/plan-fly-game-ux.md §4): each one is a boolean over telemetry/log data the sim already produces -
// no invented mechanic. Two of the three ("reached orbit", "flown faster than Mach 1 at low altitude") need a
// running record across the whole session/history (a single flight might not show the peak at the moment the HUD
// happens to sample it), so they're tracked here as they happen, not recomputed after the fact from the log.

import { type StorageLike } from './settings';
import { PLACES } from './earth/places';

export interface AchievementState {
	reachedOrbit: boolean;
	/** Highest Mach number ever observed while AGL < 1000 m (the "fast and low" badge). */
	maxMachLowAltitude: number;
	/** places.ts ids landed at at least once (for "landed everywhere"). */
	placesLanded: string[];
}

const KEY = 'fly.achievements.v1';
const DEFAULTS: AchievementState = { reachedOrbit: false, maxMachLowAltitude: 0, placesLanded: [] };

function browserStorage(): StorageLike | null {
	try {
		return typeof window !== 'undefined' ? window.localStorage : null;
	} catch {
		return null;
	}
}

export function loadAchievements(storage: StorageLike | null = browserStorage()): AchievementState {
	if (!storage) return { ...DEFAULTS, placesLanded: [] };
	try {
		const raw = storage.getItem(KEY);
		if (!raw) return { ...DEFAULTS, placesLanded: [] };
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return { ...DEFAULTS, placesLanded: [] };
		const p = parsed as Partial<AchievementState>;
		return { ...DEFAULTS, ...p, placesLanded: Array.isArray(p.placesLanded) ? p.placesLanded : [] };
	} catch {
		return { ...DEFAULTS, placesLanded: [] };
	}
}

function save(state: AchievementState, storage: StorageLike | null): void {
	if (!storage) return;
	try { storage.setItem(KEY, JSON.stringify(state)); } catch { /* not persisted this session */ }
}

/** Call every HUD tick (cheap - two comparisons and an early-out); only writes to storage when something actually changed. */
export function recordTick(mach: number, agl: number, inOrbit: boolean, storage: StorageLike | null = browserStorage()): AchievementState {
	const s = loadAchievements(storage);
	let changed = false;
	if (inOrbit && !s.reachedOrbit) { s.reachedOrbit = true; changed = true; }
	if (agl < 1000 && mach > s.maxMachLowAltitude) { s.maxMachLowAltitude = mach; changed = true; }
	if (changed) save(s, storage);
	return s;
}

/** Call on every landing (any kind - a rough landing still counts as having been there). */
export function recordLanding(placeId: string | null, storage: StorageLike | null = browserStorage()): AchievementState {
	if (!placeId) return loadAchievements(storage);
	const s = loadAchievements(storage);
	if (!s.placesLanded.includes(placeId)) { s.placesLanded = [...s.placesLanded, placeId]; save(s, storage); }
	return s;
}

export interface Badge {
	id: string;
	label: string;
	achieved: boolean;
	/** For an unachieved progress badge ("landed at every place"): e.g. "7 / 18". Omitted for a plain on/off badge. */
	progress?: string;
}

export function computeBadges(state: AchievementState): Badge[] {
	return [
		{ id: 'orbit', label: 'Reached orbit', achieved: state.reachedOrbit },
		{ id: 'low-and-fast', label: 'Supersonic below 1,000 m', achieved: state.maxMachLowAltitude > 1 },
		{ id: 'everywhere', label: 'Landed at every place', achieved: state.placesLanded.length >= PLACES.length, progress: `${state.placesLanded.length} / ${PLACES.length}` },
	];
}
