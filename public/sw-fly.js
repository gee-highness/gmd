// public/sw-fly.js
// Offline shell for the /fly route only (docs/plan-offline-world.md §11). Registered with scope
// '/fly' from src/lib/fly/pack/offline.ts, so it never touches the rest of the portfolio - the
// 30 MB of site assets outside /fly are deliberately NOT precached here (plan-offline-fly.md B1).
//
// Strategy:
//   - pack files (public/packs/*.pmtiles + manifest.json): cache-first. They are the offline data
//     itself, not something that should ever block on a network round trip once installed.
//   - everything else under /fly (the route's JS/CSS/HTML): network-first with a cache fallback,
//     so a stale shell still loads offline but a reachable network always gets the latest build.
//
// Updates: the page checks public/packs/manifest.json's sha256 against what's cached (see
// offline.ts's checkForPackUpdate) and, when they differ, re-fetches only the changed files into
// this same cache - "get updates if they exist" without needing the full chunked/resumable
// download manager from plan §11 ticket P3.

const PACK_CACHE = 'fly-packs-v1';
const SHELL_CACHE = 'fly-shell-v1';
const PACK_PATH_PREFIX = '/packs/';

self.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			// The SW does not control the page that registered it until the *next* navigation, so the
			// very first visit's /fly document is never seen by the fetch handler below and would
			// otherwise be missing from the cache the first time the device goes offline. Precache it
			// explicitly here, the same way an app-shell precache would.
			const shell = await caches.open(SHELL_CACHE);
			try {
				const docRes = await fetch('/fly', { cache: 'no-store' });
				if (docRes.ok) await shell.put('/fly', docRes);
			} catch {
				// offline at install time: nothing to precache now, the fetch handler's cache fallback
				// will serve whatever a previous install already stored.
			}

			const cache = await caches.open(PACK_CACHE);
			try {
				const manifestRes = await fetch(PACK_PATH_PREFIX + 'manifest.json', { cache: 'no-store' });
				if (manifestRes.ok) {
					await cache.put(PACK_PATH_PREFIX + 'manifest.json', manifestRes.clone());
					const manifest = await manifestRes.json();
					const files = Object.keys(manifest.files || {});
					await Promise.all(
						files.map(async (name) => {
							const res = await fetch(PACK_PATH_PREFIX + name);
							if (res.ok) await cache.put(PACK_PATH_PREFIX + name, res);
						}),
					);
				}
			} catch {
				// No network at install time (e.g. installed once, visited again offline later): fine,
				// whatever is already in the cache from a previous install stays; nothing to precache now.
			}
			self.skipWaiting();
		})(),
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			const keys = await caches.keys();
			await Promise.all(keys.filter((k) => k !== PACK_CACHE && k !== SHELL_CACHE && (k.startsWith('fly-packs-') || k.startsWith('fly-shell-'))).map((k) => caches.delete(k)));
			await self.clients.claim();
		})(),
	);
});

self.addEventListener('fetch', (event) => {
	const url = new URL(event.request.url);
	if (url.origin !== self.location.origin) return; // never intercept cross-origin (imagery/elevation CDNs)

	if (url.pathname.startsWith(PACK_PATH_PREFIX)) {
		event.respondWith(cacheFirst(event.request, PACK_CACHE));
		return;
	}
	if (url.pathname === '/fly' || url.pathname.startsWith('/fly/') || url.pathname.startsWith('/_next/')) {
		event.respondWith(networkFirst(event.request, SHELL_CACHE));
	}
});

/**
 * pmtiles reads tiles via byte-range `fetch()` calls, and its FetchSource explicitly rejects a 200
 * response whose Content-Length exceeds the requested range (it has no way to know whether a
 * range-ignorant server sent the whole file by mistake). The Cache API has no native Range
 * support: cache.match() always returns the whole stored response as a plain 200. So the pack
 * cache always stores exactly one full-file 200 entry per URL (keyed by the URL alone, ignoring
 * any Range header, so different ranges for the same file share one entry instead of each
 * overwriting it with a mismatched partial response), and every read - cache hit or a fresh
 * network fetch - is sliced here into a proper 206 Partial Content response when the request asked
 * for a range. That is what makes offline pmtiles reads actually work, not just the raw fetch.
 */
async function cacheFirst(request, cacheName) {
	const cache = await caches.open(cacheName);
	let full = await cache.match(request.url);
	if (!full) {
		const headers = new Headers(request.headers);
		headers.delete('range');
		const res = await fetch(new Request(request.url, { headers }));
		if (!res.ok) return res;
		await cache.put(request.url, res.clone());
		full = res;
	}
	const range = request.headers.get('range');
	return range ? sliceRange(full, range) : full;
}

async function sliceRange(response, rangeHeader) {
	const buf = await response.clone().arrayBuffer();
	const total = buf.byteLength;
	const m = /bytes=(\d+)-(\d*)/.exec(rangeHeader);
	if (!m) return response;
	const start = parseInt(m[1], 10);
	const end = m[2] ? Math.min(parseInt(m[2], 10), total - 1) : total - 1;
	const slice = buf.slice(start, end + 1);
	return new Response(slice, {
		status: 206,
		statusText: 'Partial Content',
		headers: {
			'Content-Type': response.headers.get('Content-Type') || 'application/octet-stream',
			'Content-Range': `bytes ${start}-${end}/${total}`,
			'Content-Length': String(slice.byteLength),
			'Accept-Ranges': 'bytes',
		},
	});
}

async function networkFirst(request, cacheName) {
	const cache = await caches.open(cacheName);
	try {
		const res = await fetch(request);
		if (res.ok) cache.put(request, res.clone());
		return res;
	} catch (e) {
		const cached = await cache.match(request);
		if (cached) return cached;
		throw e;
	}
}

// Message channel: the page can ask for an explicit re-check/re-cache of pack files without
// waiting for the next install (e.g. "Check for updates" button while already running /fly).
self.addEventListener('message', (event) => {
	if (event.data?.type !== 'SYNC_PACKS') return;
	event.waitUntil(
		(async () => {
			const cache = await caches.open(PACK_CACHE);
			const manifestRes = await fetch(PACK_PATH_PREFIX + 'manifest.json', { cache: 'no-store' });
			if (!manifestRes.ok) return;
			const manifest = await manifestRes.json();
			const cachedManifestRes = await cache.match(PACK_PATH_PREFIX + 'manifest.json');
			const cachedManifest = cachedManifestRes ? await cachedManifestRes.json() : null;
			const changed = Object.entries(manifest.files || {}).filter(
				([name, meta]) => !cachedManifest || cachedManifest.files?.[name]?.sha256 !== meta.sha256,
			);
			await cache.put(PACK_PATH_PREFIX + 'manifest.json', manifestRes.clone());
			await Promise.all(
				changed.map(async ([name]) => {
					const res = await fetch(PACK_PATH_PREFIX + name, { cache: 'no-store' });
					if (res.ok) await cache.put(PACK_PATH_PREFIX + name, res);
				}),
			);
			const clients = await self.clients.matchAll();
			for (const client of clients) client.postMessage({ type: changed.length ? 'PACKS_UPDATED' : 'PACKS_UP_TO_DATE', changed: changed.map(([n]) => n) });
		})(),
	);
});
