// src/lib/fly/pack/reader.ts
// Thin wrapper around the `pmtiles` npm package for reading the offline world pack built by
// tools/world-pack/ (docs/plan-offline-world.md). One PackSource per PMTiles archive; tiles are
// WebP, read via HTTP range requests against a normal static URL so the browser's HTTP/service-
// worker cache already makes repeat reads free once the archive itself is cached offline.

import { PMTiles, FetchSource } from 'pmtiles';
import type { TileId } from '../earth/geo';

/** What heights.ts / imagery.ts actually need, so they can be unit-tested without a real PMTiles archive. */
export interface TileSource {
	getTileBytes(id: TileId, signal?: AbortSignal): Promise<Uint8Array | undefined>;
}

export class PackSource implements TileSource {
	private pm: PMTiles;
	constructor(url: string) {
		this.pm = new PMTiles(new FetchSource(url));
	}

	header() {
		return this.pm.getHeader();
	}

	/** Raw tile bytes (WebP), or undefined if the tile isn't in the archive (e.g. beyond its max zoom). */
	async getTileBytes(id: TileId, signal?: AbortSignal): Promise<Uint8Array | undefined> {
		const res = await this.pm.getZxy(id.z, id.x, id.y, signal);
		return res ? new Uint8Array(res.data) : undefined;
	}
}

export function decodeTileImage(bytes: Uint8Array): Promise<ImageBitmap> {
	return createImageBitmap(new Blob([bytes], { type: 'image/webp' }));
}

/** Decoded RGBA pixels of a tile, for data layers (height packed in R) rather than display imagery. */
export async function decodeTilePixels(bytes: Uint8Array): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
	const bmp = await decodeTileImage(bytes);
	try {
		const c: OffscreenCanvas | HTMLCanvasElement =
			typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(bmp.width, bmp.height) : Object.assign(document.createElement('canvas'), { width: bmp.width, height: bmp.height });
		const ctx = c.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
		ctx.drawImage(bmp, 0, 0);
		const img = ctx.getImageData(0, 0, bmp.width, bmp.height);
		return { data: img.data, width: bmp.width, height: bmp.height };
	} finally {
		bmp.close();
	}
}
