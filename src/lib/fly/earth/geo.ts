// src/lib/fly/earth/geo.ts
// WGS84 geodesy for the Earth world: geodetic ↔ ECEF, local east/up/south frames, Web-Mercator tile maths, great-circle helpers, Earth gravity.
// All SI units, radians unless a name says Deg. Doubles throughout: ECEF coordinates are ~6.4e6 m and must not be stored in float32.

export const WGS84 = {
	a: 6378137,
	f: 1 / 298.257223563,
	get b() { return this.a * (1 - this.f); },
	get e2() { return this.f * (2 - this.f); },
} as const;

export const EARTH = {
	/** Gravitational parameter GM (m³/s², WGS84). */
	mu: 3.986004418e14,
	/** Second zonal harmonic. */
	J2: 1.08262668e-3,
	/** Sidereal rotation rate (rad/s). */
	omega: 7.292115e-5,
	/** Mean radius (m). */
	R: 6371008.8,
	/** Kármán line (m). */
	karman: 100_000,
} as const;

export const rad = (d: number) => (d * Math.PI) / 180;
export const deg = (r: number) => (r * 180) / Math.PI;

export type Vec3 = [number, number, number];

export function geodeticToEcef(lat: number, lon: number, h = 0): Vec3 {
	const s = Math.sin(lat), c = Math.cos(lat);
	const N = WGS84.a / Math.sqrt(1 - WGS84.e2 * s * s);
	return [(N + h) * c * Math.cos(lon), (N + h) * c * Math.sin(lon), (N * (1 - WGS84.e2) + h) * s];
}

/** Closed-form-ish iterative inverse (Bowring, 3 iterations: sub-millimetre everywhere above and below the surface). */
export function ecefToGeodetic(x: number, y: number, z: number): { lat: number; lon: number; h: number } {
	const { a, e2 } = WGS84;
	const lon = Math.atan2(y, x);
	const p = Math.hypot(x, y);
	if (p < 1e-9) { // on the polar axis
		const b = WGS84.b;
		return { lat: z >= 0 ? Math.PI / 2 : -Math.PI / 2, lon: 0, h: Math.abs(z) - b };
	}
	let lat = Math.atan2(z, p * (1 - e2));
	let h = 0;
	for (let i = 0; i < 5; i++) {
		const s = Math.sin(lat);
		const N = a / Math.sqrt(1 - e2 * s * s);
		h = p / Math.cos(lat) - N;
		lat = Math.atan2(z, p * (1 - (e2 * N) / (N + h)));
	}
	const s = Math.sin(lat);
	const N = a / Math.sqrt(1 - e2 * s * s);
	h = Math.abs(Math.cos(lat)) > 1e-6 ? p / Math.cos(lat) - N : Math.abs(z) / Math.abs(s) - N * (1 - e2);
	return { lat, lon, h };
}

/** Geodetic surface normal (the local "up") in ECEF. */
export function upAt(lat: number, lon: number): Vec3 {
	const cl = Math.cos(lat);
	return [cl * Math.cos(lon), cl * Math.sin(lon), Math.sin(lat)];
}

/** Local frame at a point: east, north, up as ECEF unit vectors. */
export function enuBasis(lat: number, lon: number): { east: Vec3; north: Vec3; up: Vec3 } {
	const sl = Math.sin(lat), cl = Math.cos(lat), so = Math.sin(lon), co = Math.cos(lon);
	return { east: [-so, co, 0], north: [-sl * co, -sl * so, cl], up: [cl * co, cl * so, sl] };
}

/** Distance along the great circle on the mean sphere (m). */
export function greatCircle(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const dφ = lat2 - lat1, dλ = lon2 - lon1;
	const a = Math.sin(dφ / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dλ / 2) ** 2;
	return 2 * EARTH.R * Math.asin(Math.min(1, Math.sqrt(a)));
}

/** Initial bearing, radians clockwise from north in [0, 2π). */
export function bearing(lat1: number, lon1: number, lat2: number, lon2: number): number {
	const dλ = lon2 - lon1;
	const y = Math.sin(dλ) * Math.cos(lat2);
	const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dλ);
	return (Math.atan2(y, x) + 2 * Math.PI) % (2 * Math.PI);
}

/** Sum of consecutive great-circle legs along a flown path (m): the flight-trail "distance flown" readout. Degrees in, like the HUD and `places.ts`. */
export function trailDistanceDeg(points: readonly (readonly [number, number])[]): number {
	let total = 0;
	for (let i = 1; i < points.length; i++) {
		const [lat1, lon1] = points[i - 1], [lat2, lon2] = points[i];
		total += greatCircle(rad(lat1), rad(lon1), rad(lat2), rad(lon2));
	}
	return total;
}

// ---------- gravity ----------

/** Gravitational acceleration (no centrifugal term) at ECEF position: point mass plus J2 oblateness. */
export function gravityEcef(x: number, y: number, z: number): Vec3 {
	const r2 = x * x + y * y + z * z, r = Math.sqrt(r2);
	const k = -EARTH.mu / (r2 * r);
	const j = 1.5 * EARTH.J2 * (WGS84.a / r) ** 2;
	const zr2 = (z * z) / r2;
	return [k * x * (1 + j * (1 - 5 * zr2)), k * y * (1 + j * (1 - 5 * zr2)), k * z * (1 + j * (3 - 5 * zr2))];
}

/** Effective gravity magnitude felt on the rotating surface (gravity + centrifugal) at latitude, height. */
export function effectiveGravity(lat: number, h = 0): number {
	const [x, y, z] = geodeticToEcef(lat, 0, h);
	const [gx, gy, gz] = gravityEcef(x, y, z);
	const ax = gx + EARTH.omega ** 2 * x, ay = gy + EARTH.omega ** 2 * y;
	return Math.hypot(ax, ay, gz);
}

/** Circular-orbit speed at radius r (m/s). */
export const circularSpeed = (r: number) => Math.sqrt(EARTH.mu / r);

// ---------- Web-Mercator tiles (XYZ scheme, the layout of Terrarium and most imagery) ----------

export const MAX_MERCATOR_LAT = 85.0511287798;

export interface TileId { z: number; x: number; y: number }

export const tileKey = (t: TileId) => `${t.z}/${t.x}/${t.y}`;

export function lonLatToTile(z: number, lonDeg: number, latDeg: number): TileId {
	const n = 2 ** z;
	const lat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, latDeg));
	const x = Math.floor(((lonDeg + 180) / 360) * n);
	const sinφ = Math.sin(rad(lat));
	const y = Math.floor((0.5 - Math.log((1 + sinφ) / (1 - sinφ)) / (4 * Math.PI)) * n);
	return { z, x: Math.max(0, Math.min(n - 1, x)), y: Math.max(0, Math.min(n - 1, y)) };
}

/** Longitude (deg) of tile column edge x at zoom z. */
export const tileLon = (z: number, x: number) => (x / 2 ** z) * 360 - 180;
/** Latitude (deg) of tile row edge y at zoom z. */
export const tileLat = (z: number, y: number) => deg(Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / 2 ** z))));

export function tileBounds(t: TileId) {
	return { west: tileLon(t.z, t.x), east: tileLon(t.z, t.x + 1), north: tileLat(t.z, t.y), south: tileLat(t.z, t.y + 1) };
}

/** Fractional position (0–1) inside the world tile grid for a lat/lon, plus the tile it falls in. */
export function lonLatToFraction(z: number, lonDeg: number, latDeg: number): { fx: number; fy: number } {
	const n = 2 ** z;
	const lat = Math.max(-MAX_MERCATOR_LAT, Math.min(MAX_MERCATOR_LAT, latDeg));
	const sinφ = Math.sin(rad(lat));
	return { fx: ((lonDeg + 180) / 360) * n, fy: (0.5 - Math.log((1 + sinφ) / (1 - sinφ)) / (4 * Math.PI)) * n };
}

/** Ground width of a tile at the equator at zoom z (m). */
export const tileSpanEquator = (z: number) => (2 * Math.PI * WGS84.a) / 2 ** z;

export function parentOf(t: TileId): TileId | null {
	return t.z === 0 ? null : { z: t.z - 1, x: t.x >> 1, y: t.y >> 1 };
}
export function childrenOf(t: TileId): TileId[] {
	const z = t.z + 1, x = t.x * 2, y = t.y * 2;
	return [{ z, x, y }, { z, x: x + 1, y }, { z, x, y: y + 1 }, { z, x: x + 1, y: y + 1 }];
}
