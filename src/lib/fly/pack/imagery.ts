// src/lib/fly/pack/imagery.ts
// Stylized albedo from the offline world pack (world-albedo.pmtiles) as the imagery source,
// same shape as a network ImageryProvider (plan: "the loaders already take injectable
// fetchBlob/decode, so the cleanest design is a local-first provider in front of the network
// ones"). The manager's own ancestor/UV math (imageryFor, used in applyImage) already handles a
// coarser provider answering a finer request - that's exactly what GIBS_BLUE_MARBLE (maxZoom 8)
// already does, so this plugs into the same place.

import type { TileId } from '../earth/geo';
import { ancestorAt } from '../earth/imagery';
import { type TileSource, decodeTileImage } from './reader';

/** world-albedo.pmtiles covers z0-z6 (plan §1, same resolution ceiling as the terrain). */
export const PACK_ALBEDO_MAX_ZOOM = 6;

export async function loadImageFromPack(
	pack: TileSource,
	id: TileId,
	signal?: AbortSignal,
): Promise<{ image: ImageBitmap; tile: TileId } | null> {
	const tile = ancestorAt(id, PACK_ALBEDO_MAX_ZOOM);
	const bytes = await pack.getTileBytes(tile, signal);
	if (!bytes) return null;
	return { image: await decodeTileImage(bytes), tile };
}

/**
 * Network providers first (EOX/GIBS are finer than the pack's z6 ceiling, so online users get the
 * sharper imagery), falling back to the pack only once every network provider has failed or been
 * disabled for the session (`makeImageLoader`'s own retry/backoff). The pack's z0-z6 coverage is
 * global and bundled with the app, so this fallback never actually waits on a network timeout
 * loop once `makeImageLoader` has already given up - it is what makes the ground textured at all
 * offline, instead of the physically-motivated flat tint in tileMesh.ts.
 */
export function makeOfflineFirstImageLoader(
	pack: TileSource,
	networkLoadImage: (id: TileId, signal: AbortSignal) => Promise<{ image: ImageBitmap | HTMLImageElement; tile: TileId } | null>,
) {
	return async (id: TileId, signal: AbortSignal) => {
		const net = await networkLoadImage(id, signal).catch(() => null);
		if (net) return net;
		return loadImageFromPack(pack, id, signal).catch(() => null);
	};
}
