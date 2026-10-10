// src/lib/fly/earth/geocode.ts
// Place-name search for the toolbar (docs/plan-fly-map-data.md §2), backed by Nominatim
// (OpenStreetMap's free geocoder: https://nominatim.org/release-docs/latest/api/Search/). Its usage
// policy caps unauthenticated callers at ~1 request/second, which is why the debounced searcher
// below aborts any in-flight request before starting a new one rather than letting them pile up.

export interface GeocodeResult {
	lat: number;
	lon: number;
	label: string;
}

export interface GeocodeIO {
	fetchJson(url: string, signal: AbortSignal): Promise<unknown>;
}

export const browserGeocodeIO: GeocodeIO = {
	async fetchJson(url, signal) {
		const res = await fetch(url, { signal, headers: { Accept: 'application/json' }, referrerPolicy: 'no-referrer' });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.json();
	},
};

export function searchPlaceUrl(query: string): string {
	return `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`;
}

/** Resolves [] for a too-short query (never fires a request) or when nothing matched; throws only on a real fetch/parse failure. */
export async function searchPlace(query: string, signal: AbortSignal, io: GeocodeIO = browserGeocodeIO): Promise<GeocodeResult[]> {
	const q = query.trim();
	if (q.length < 2) return [];
	const raw = await io.fetchJson(searchPlaceUrl(q), signal);
	if (!Array.isArray(raw)) return [];
	return raw
		.map((r) => {
			const o = r as Record<string, unknown>;
			return { lat: Number(o.lat), lon: Number(o.lon), label: String(o.display_name ?? '') };
		})
		.filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lon) && r.label.length > 0);
}

export interface DebouncedSearcher {
	(query: string): void;
	cancel(): void;
}

/**
 * Wraps `search` so that only the LAST call in a burst of keystrokes ever reaches the network: each call restarts
 * the debounce timer and aborts whatever request the previous call had in flight, so a fast typist never queues up
 * requests Nominatim's rate limit would otherwise choke on. `onResult` is never called for a call that was
 * superseded or aborted - only for the one query that actually "won".
 */
export function makeDebouncedSearcher(
	search: (query: string, signal: AbortSignal) => Promise<GeocodeResult[]>,
	onResult: (results: GeocodeResult[], query: string) => void,
	delayMs = 400,
): DebouncedSearcher {
	let timer: ReturnType<typeof setTimeout> | null = null;
	let controller: AbortController | null = null;
	const cancel = () => {
		if (timer) clearTimeout(timer);
		timer = null;
		controller?.abort();
		controller = null;
	};
	const fn = ((query: string) => {
		cancel();
		timer = setTimeout(() => {
			const ac = new AbortController();
			controller = ac;
			search(query, ac.signal)
				.then((r) => { if (!ac.signal.aborted) onResult(r, query); })
				.catch(() => { /* a failed/aborted search just leaves the dropdown empty */ });
		}, delayMs);
	}) as DebouncedSearcher;
	fn.cancel = cancel;
	return fn;
}
