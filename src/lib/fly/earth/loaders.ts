// src/lib/fly/earth/loaders.ts
// Browser-side data loaders with the provider fallback chain. Fetch and decode are injectable so the fallback logic is unit-tested without a
// browser; the defaults use the real fetch and createImageBitmap.

import { type TileId } from './geo';
import { type ImageryProvider, ancestorAt } from './imagery';

export interface LoaderIO {
	fetchBlob(url: string, signal: AbortSignal): Promise<Blob>;
	decode(blob: Blob): Promise<ImageBitmap>;
}

export const browserIO: LoaderIO = {
	async fetchBlob(url, signal) {
		const res = await fetch(url, { signal, mode: 'cors', referrerPolicy: 'no-referrer' });
		if (!res.ok) throw new Error(`HTTP ${res.status}`);
		return res.blob();
	},
	decode: (blob) => createImageBitmap(blob),
};

const DISABLE_AFTER = 3;

/**
 * Tries each provider in order. A provider that fails three times in a row is switched off for the session (no hammering a blocked host);
 * a coarser provider answers with an ancestor tile, and the manager maps the right window of it. Resolves null when nothing worked.
 */
export function makeImageLoader(providers: ImageryProvider[], io: LoaderIO = browserIO) {
	const fails = new Map<string, number>();
	const loader = async (id: TileId, signal: AbortSignal): Promise<{ image: ImageBitmap; tile: TileId } | null> => {
		for (const p of providers) {
			if ((fails.get(p.id) ?? 0) >= DISABLE_AFTER) continue;
			const tile = ancestorAt(id, p.maxZoom);
			try {
				const bmp = await io.decode(await io.fetchBlob(p.url(tile), signal));
				fails.set(p.id, 0);
				return { image: bmp, tile };
			} catch {
				if (signal.aborted) return null;
				fails.set(p.id, (fails.get(p.id) ?? 0) + 1);
			}
		}
		return null;
	};
	loader.failures = (id: string) => fails.get(id) ?? 0;
	return loader;
}

/** Draws `base` then `label` (on top, transparent background) into a same-size canvas and returns the composite. Injectable for tests. */
export interface LabelCompositor {
	compose(base: ImageBitmap, label: ImageBitmap): Promise<ImageBitmap>;
}

export const canvasCompositor: LabelCompositor = {
	async compose(base, label) {
		const w = base.width, h = base.height;
		const canvas: OffscreenCanvas | HTMLCanvasElement =
			typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(w, h) : Object.assign(document.createElement('canvas'), { width: w, height: h });
		const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D | null;
		if (!ctx) throw new Error('2D canvas context unavailable');
		ctx.drawImage(base, 0, 0, w, h);
		ctx.drawImage(label, 0, 0, w, h);
		return createImageBitmap(canvas as OffscreenCanvas);
	},
};

/**
 * Wraps a base image loader with an optional place/street-names overlay: when `isEnabled()` is true at fetch time,
 * fetches the label provider's tile at the SAME (z, x, y) the base loader actually answered with (an ancestor when
 * the base provider was coarser than requested) and composites it on top, so the manager's existing UV mapping for
 * that tile (`imageryFor`) still applies unchanged. The label provider's own maxZoom just needs to cover every base
 * tile zoom the app ever requests - no separate window math. Labels are a nice-to-have: any failure (network,
 * abort, decode) silently falls back to the unlabeled base image rather than failing the tile.
 */
export function makeLabeledImageLoader(
	base: (id: TileId, signal: AbortSignal) => Promise<{ image: ImageBitmap | HTMLImageElement; tile: TileId } | null>,
	labelsProvider: ImageryProvider,
	isEnabled: () => boolean,
	io: LoaderIO = browserIO,
	compositor: LabelCompositor = canvasCompositor,
) {
	return async (id: TileId, signal: AbortSignal): Promise<{ image: ImageBitmap | HTMLImageElement; tile: TileId } | null> => {
		const res = await base(id, signal);
		if (!res || !isEnabled()) return res;
		try {
			const tile = ancestorAt(res.tile, labelsProvider.maxZoom);
			const labelImg = await io.decode(await io.fetchBlob(labelsProvider.url(tile), signal));
			const composed = await compositor.compose(res.image as ImageBitmap, labelImg);
			if ('close' in labelImg) labelImg.close();
			return { image: composed, tile: res.tile };
		} catch {
			if (signal.aborted) return null;
			return res;
		}
	};
}
