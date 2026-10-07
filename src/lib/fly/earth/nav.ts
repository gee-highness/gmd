// src/lib/fly/earth/nav.ts
// Navigation maths for the map and the waypoint readout: great-circle distance and bearing on the WGS84 mean sphere. Pure, no DOM.
// A sphere is good to ~0.3 % (≤ ~20 km over 10 000 km), which is far below what a flight HUD shows; the HUD says "≈".

import { deg, rad } from './geo';

/** Mean Earth radius, metres (IUGG). */
export const R_MEAN = 6_371_008.8;

export interface LatLon { lat: number; lon: number }

/** Great-circle distance in metres (haversine). */
export function distanceM(a: LatLon, b: LatLon): number {
	const p1 = rad(a.lat), p2 = rad(b.lat), dp = p2 - p1, dl = rad(b.lon - a.lon);
	const h = Math.sin(dp / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(dl / 2) ** 2;
	return 2 * R_MEAN * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Initial great-circle bearing from `a` to `b`, degrees clockwise from true north, 0…360. */
export function bearingDeg(a: LatLon, b: LatLon): number {
	const p1 = rad(a.lat), p2 = rad(b.lat), dl = rad(b.lon - a.lon);
	const y = Math.sin(dl) * Math.cos(p2), x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl);
	return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Signed turn (−180…180] from a heading to a bearing: positive means turn right. */
export function turnTo(headingDeg: number, bearing: number): number {
	const d = (((bearing - headingDeg) % 360) + 540) % 360 - 180;
	return d === -180 ? 180 : d;
}

/** Point reached from `a` after `distance` metres on initial bearing `brg` (degrees). Used for the heading line on the map. */
export function destination(a: LatLon, brg: number, distance: number): LatLon {
	const d = distance / R_MEAN, t = rad(brg), p1 = rad(a.lat), l1 = rad(a.lon);
	const p2 = Math.asin(Math.sin(p1) * Math.cos(d) + Math.cos(p1) * Math.sin(d) * Math.cos(t));
	const l2 = l1 + Math.atan2(Math.sin(t) * Math.sin(d) * Math.cos(p1), Math.cos(d) - Math.sin(p1) * Math.sin(p2));
	return { lat: deg(p2), lon: ((deg(l2) + 540) % 360) - 180 };
}

/** Distance for the HUD: metres below 1 km, then km with one decimal below 100 km, whole km above. */
export function formatDistance(m: number): string {
	if (!Number.isFinite(m)) return '—';
	if (m < 1000) return `${Math.round(m)} m`;
	const km = m / 1000;
	return km < 100 ? `${km.toFixed(1)} km` : `${Math.round(km).toLocaleString('en-US')} km`;
}

/** Time to go at the current ground speed, "m:ss" or "h:mm", or null when too slow to matter. */
export function formatEta(distanceMeters: number, groundSpeed: number): string | null {
	if (!Number.isFinite(distanceMeters) || groundSpeed < 5) return null;
	const s = Math.round(distanceMeters / groundSpeed);
	if (s >= 3600) return `${Math.floor(s / 3600)}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')} h`;
	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The nearest named place, with its distance. */
export function nearest<T extends LatLon>(p: LatLon, places: readonly T[]): { place: T; distance: number } | null {
	let best: { place: T; distance: number } | null = null;
	for (const q of places) { const d = distanceM(p, q); if (!best || d < best.distance) best = { place: q, distance: d }; }
	return best;
}

/** Clamp a latitude to the Web-Mercator limit and wrap a longitude into ±180 (what a map click can return after panning around the world). */
export function normalizeLatLon(lat: number, lon: number): LatLon {
	return { lat: Math.max(-85.0511, Math.min(85.0511, lat)), lon: ((((lon + 180) % 360) + 360) % 360) - 180 };
}
