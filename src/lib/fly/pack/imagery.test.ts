import { describe, expect, it, vi } from 'vitest';
import type { TileId } from '../earth/geo';
import { PACK_ALBEDO_MAX_ZOOM, loadImageFromPack, makeOfflineFirstImageLoader } from './imagery';
import type { TileSource } from './reader';

describe('loadImageFromPack', () => {
	it('asks for the ancestor at the pack max zoom', async () => {
		const pack: TileSource = { getTileBytes: vi.fn().mockResolvedValue(undefined) };
		const result = await loadImageFromPack(pack, { z: PACK_ALBEDO_MAX_ZOOM + 6, x: 100, y: 50 });
		expect(result).toBeNull();
		const [tile] = (pack.getTileBytes as ReturnType<typeof vi.fn>).mock.calls[0] as [TileId];
		expect(tile.z).toBe(PACK_ALBEDO_MAX_ZOOM);
	});
});

describe('makeOfflineFirstImageLoader', () => {
	const id: TileId = { z: 12, x: 1, y: 1 };

	it('prefers the network provider when it returns a result', async () => {
		const img = {} as ImageBitmap;
		const network = vi.fn().mockResolvedValue({ image: img, tile: id });
		const pack: TileSource = { getTileBytes: vi.fn() };
		const load = makeOfflineFirstImageLoader(pack, network);
		expect(await load(id, new AbortController().signal)).toEqual({ image: img, tile: id });
		expect(pack.getTileBytes).not.toHaveBeenCalled();
	});

	it('falls back to the pack when the network returns null', async () => {
		const network = vi.fn().mockResolvedValue(null);
		const pack: TileSource = { getTileBytes: vi.fn().mockResolvedValue(undefined) };
		const load = makeOfflineFirstImageLoader(pack, network);
		expect(await load(id, new AbortController().signal)).toBeNull();
		expect(pack.getTileBytes).toHaveBeenCalled();
	});

	it('falls back to the pack when the network loader throws', async () => {
		const network = vi.fn().mockRejectedValue(new Error('offline'));
		const pack: TileSource = { getTileBytes: vi.fn().mockResolvedValue(undefined) };
		const load = makeOfflineFirstImageLoader(pack, network);
		await expect(load(id, new AbortController().signal)).resolves.toBeNull();
		expect(pack.getTileBytes).toHaveBeenCalled();
	});
});
