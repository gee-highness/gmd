import { describe, expect, it, vi } from 'vitest';
import type { TileId } from '../earth/geo';
import type { HeightTile } from '../earth/terrarium';
import { PACK_TERRAIN_MAX_ZOOM, loadHeightsFromPack, makeOfflineFirstHeightLoader } from './heights';
import type { TileSource } from './reader';

// A tiny 2x2 "tile" encoded as an actual WebP via the DOM canvas is unavailable under vitest/node,
// so these tests use a stub TileSource + stub decodeTilePixels is not possible without mocking the
// module; instead we go through loadHeightsFromPack with a fake pack whose getTileBytes resolves
// to a sentinel the decode step can't touch - so we test at the makeOfflineFirstHeightLoader level
// (network fallback) and leave pixel-sampling coverage to decodeTilePixels's own canvas round trip,
// which is a browser-only path.

describe('makeOfflineFirstHeightLoader', () => {
	const id: TileId = { z: 10, x: 3, y: 4 };

	it('uses the network loader when it succeeds', async () => {
		const expected: HeightTile = { id, size: 2, heights: new Float32Array([1, 2, 3, 4]) };
		const network = vi.fn().mockResolvedValue(expected);
		const pack: TileSource = { getTileBytes: vi.fn() };
		const load = makeOfflineFirstHeightLoader(pack, network);
		expect(await load(id)).toBe(expected);
		expect(pack.getTileBytes).not.toHaveBeenCalled();
	});

	it('falls back to the pack when the network loader throws', async () => {
		const network = vi.fn().mockRejectedValue(new Error('offline'));
		const pack: TileSource = { getTileBytes: vi.fn().mockResolvedValue(undefined) };
		const load = makeOfflineFirstHeightLoader(pack, network);
		const result = await load(id);
		expect(result.id).toEqual(id);
		expect(result.heights.length).toBe(256 * 256);
		expect(pack.getTileBytes).toHaveBeenCalled();
	});

	it('re-throws an abort instead of falling back', async () => {
		const ac = new AbortController();
		ac.abort();
		const network = vi.fn().mockRejectedValue(new DOMException('aborted', 'AbortError'));
		const pack: TileSource = { getTileBytes: vi.fn() };
		const load = makeOfflineFirstHeightLoader(pack, network);
		await expect(load(id, ac.signal)).rejects.toThrow();
		expect(pack.getTileBytes).not.toHaveBeenCalled();
	});

	it('clamps the ancestor to the pack max zoom and returns zero heights when the pack has no tile', async () => {
		const pack: TileSource = { getTileBytes: vi.fn().mockResolvedValue(undefined) };
		const result = await loadHeightsFromPack(pack, { z: PACK_TERRAIN_MAX_ZOOM + 4, x: 0, y: 0 });
		expect(result.size).toBe(256);
		expect(result.heights.every((v) => v === 0)).toBe(true);
		const [calledTile] = (pack.getTileBytes as ReturnType<typeof vi.fn>).mock.calls[0] as [TileId];
		expect(calledTile.z).toBe(PACK_TERRAIN_MAX_ZOOM);
	});
});
