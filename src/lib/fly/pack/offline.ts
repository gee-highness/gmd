// src/lib/fly/pack/offline.ts
// Registers public/sw-fly.js (scoped to /fly only, never the rest of the portfolio) and exposes a
// manual "check for updates" call: the service worker re-fetches packs/manifest.json and re-caches
// anything whose sha256 changed (docs/plan-offline-world.md §11, a simplified stand-in for the
// full chunked/resumable PackManager in ticket P3).

export interface PackUpdateResult {
	changed: string[];
}

/** No-op (resolves null) outside a browser, or if service workers aren't supported - never throws. */
export async function registerFlyServiceWorker(): Promise<ServiceWorkerRegistration | null> {
	if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return null;
	try {
		return await navigator.serviceWorker.register('/sw-fly.js', { scope: '/fly' });
	} catch {
		return null; // e.g. served over http in a dev sandbox without a secure context
	}
}

/**
 * Asks the active service worker to re-check packs/manifest.json against what it has cached and
 * re-cache anything that changed. Resolves `{ changed: [] }` if there is no active worker (nothing
 * installed yet, or the browser doesn't support this) rather than throwing - callers treat "no
 * update" and "can't check" the same way: nothing to show the user.
 */
export async function checkForPackUpdate(reg?: ServiceWorkerRegistration | null, timeoutMs = 15_000): Promise<PackUpdateResult> {
	const registration = reg ?? (typeof navigator !== 'undefined' && 'serviceWorker' in navigator ? await navigator.serviceWorker.ready.catch(() => null) : null);
	const worker = registration?.active;
	if (!worker || typeof navigator === 'undefined') return { changed: [] };
	return new Promise((resolve) => {
		let settled = false;
		const timer = setTimeout(() => { if (!settled) { settled = true; resolve({ changed: [] }); } }, timeoutMs);
		const onMessage = (event: MessageEvent) => {
			if (event.data?.type !== 'PACKS_UPDATED' && event.data?.type !== 'PACKS_UP_TO_DATE') return;
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			navigator.serviceWorker.removeEventListener('message', onMessage);
			resolve({ changed: event.data.changed ?? [] });
		};
		navigator.serviceWorker.addEventListener('message', onMessage);
		worker.postMessage({ type: 'SYNC_PACKS' });
	});
}
