// src/lib/fly/log.ts
// The flight logbook (docs/plan-fly-game-ux.md §4): every entry is numbers the sim already computes at touchdown -
// no invented scoring. Storage is injectable, same pattern as settings.ts, so this is unit-tested without a browser.

import { type StorageLike } from './settings';
import { greatCircle, rad } from './earth/geo';

export interface FlightLogEntry {
	date: string; // ISO timestamp
	kind: 'landed' | 'rough' | 'crash';
	touchdownSpeed: number; // m/s, the real impact speed contact() computed
	fuelUsedFraction: number; // 0..1
	distanceKm: number; // great-circle, from the flight trail
	flightTimeS: number;
	place: string | null; // a places.ts id, if the landing was within 5 km of one; otherwise null
}

const LOG_KEY = 'fly.log.v1';
const MAX_ENTRIES = 200;

function browserStorage(): StorageLike | null {
	try {
		return typeof window !== 'undefined' ? window.localStorage : null;
	} catch {
		return null;
	}
}

export function loadLog(storage: StorageLike | null = browserStorage()): FlightLogEntry[] {
	if (!storage) return [];
	try {
		const raw = storage.getItem(LOG_KEY);
		if (!raw) return [];
		const parsed: unknown = JSON.parse(raw);
		return Array.isArray(parsed) ? (parsed as FlightLogEntry[]) : [];
	} catch {
		return [];
	}
}

function saveLog(log: FlightLogEntry[], storage: StorageLike | null): void {
	if (!storage) return;
	try {
		storage.setItem(LOG_KEY, JSON.stringify(log));
	} catch {
		// quota exceeded or storage blocked - this flight's entry just won't be remembered
	}
}

/** Appends one entry, prunes to the oldest MAX_ENTRIES, saves, and returns the new log (oldest first). */
export function appendLogEntry(entry: FlightLogEntry, storage: StorageLike | null = browserStorage()): FlightLogEntry[] {
	const log = loadLog(storage);
	log.push(entry);
	if (log.length > MAX_ENTRIES) log.splice(0, log.length - MAX_ENTRIES);
	saveLog(log, storage);
	return log;
}

export interface KnownPlace {
	id: string;
	lat: number;
	lon: number;
}

/** The nearest known place within 5 km (a generous "landed roughly there" radius, e.g. a city vs. its airport), or null. Degrees in, like places.ts and the HUD. */
export function nearestPlace(lat: number, lon: number, places: readonly KnownPlace[]): string | null {
	let best: { id: string; d: number } | null = null;
	for (const p of places) {
		const d = greatCircle(rad(lat), rad(lon), rad(p.lat), rad(p.lon));
		if (!best || d < best.d) best = { id: p.id, d };
	}
	return best && best.d < 5000 ? best.id : null;
}
