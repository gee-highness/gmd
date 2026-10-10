import { describe, expect, it, vi } from 'vitest';
import { makeImageLoader, makeLabeledImageLoader, type LabelCompositor, type LoaderIO } from './loaders';
import { EOX_S2, GIBS_BLUE_MARBLE, OSM_LABELS } from './imagery';

const bmp = { width: 1, height: 1, close() {} } as unknown as ImageBitmap;
const sig = () => new AbortController().signal;

describe('imagery loader fallback chain', () => {
	it('uses the first provider when it works, at the requested tile (clamped to its max zoom)', async () => {
		const urls: string[] = [];
		const io: LoaderIO = { fetchBlob: async (u) => { urls.push(u); return new Blob(); }, decode: async () => bmp };
		const r = await makeImageLoader([EOX_S2, GIBS_BLUE_MARBLE], io)({ z: 13, x: 4, y: 5 }, sig());
		expect(r?.tile).toEqual({ z: 13, x: 4, y: 5 }); expect(urls).toHaveLength(1); expect(urls[0]).toContain('eox');
	});
	it('falls back to the coarser provider and reports the ancestor tile it covered', async () => {
		const io: LoaderIO = { fetchBlob: async (u) => { if (u.includes('eox')) throw new Error('blocked'); return new Blob(); }, decode: async () => bmp };
		const r = await makeImageLoader([EOX_S2, GIBS_BLUE_MARBLE], io)({ z: 12, x: 2200, y: 1400 }, sig());
		expect(r?.tile).toEqual({ z: 8, x: 2200 >> 4, y: 1400 >> 4 });
	});
	it('switches a failing provider off after three failures and stops asking it', async () => {
		let eoxCalls = 0;
		const io: LoaderIO = { fetchBlob: async (u) => { if (u.includes('eox')) { eoxCalls++; throw new Error('blocked'); } return new Blob(); }, decode: async () => bmp };
		const load = makeImageLoader([EOX_S2, GIBS_BLUE_MARBLE], io);
		for (let i = 0; i < 6; i++) await load({ z: 10, x: i, y: 0 }, sig());
		expect(eoxCalls).toBe(3); expect(load.failures(EOX_S2.id)).toBe(3);
	});
	it('resolves null when every provider fails, and does not count an abort as a failure', async () => {
		const bad: LoaderIO = { fetchBlob: async () => { throw new Error('x'); }, decode: async () => bmp };
		expect(await makeImageLoader([EOX_S2, GIBS_BLUE_MARBLE], bad)({ z: 5, x: 1, y: 1 }, sig())).toBeNull();
		const ac = new AbortController(); ac.abort();
		const load = makeImageLoader([EOX_S2], bad);
		expect(await load({ z: 5, x: 1, y: 1 }, ac.signal)).toBeNull(); expect(load.failures(EOX_S2.id)).toBe(0);
	});
});

describe('label overlay loader', () => {
	const baseRes = { image: bmp, tile: { z: 13, x: 100, y: 200 } };
	const base = async () => baseRes;
	const composed = { width: 1, height: 1, close() {} } as unknown as ImageBitmap;
	const compositor: LabelCompositor = { compose: vi.fn(async () => composed) };

	it('passes the base image through untouched when labels are disabled', async () => {
		const io: LoaderIO = { fetchBlob: vi.fn(), decode: vi.fn() };
		const load = makeLabeledImageLoader(base, OSM_LABELS, () => false, io, compositor);
		const r = await load({ z: 13, x: 100, y: 200 }, sig());
		expect(r).toBe(baseRes); expect(io.fetchBlob).not.toHaveBeenCalled();
	});

	it('fetches the label tile at the SAME (z, x, y) the base loader answered with, and composites it on top', async () => {
		const urls: string[] = [];
		const label = { width: 1, height: 1, close() {} } as unknown as ImageBitmap;
		const io: LoaderIO = { fetchBlob: async (u) => { urls.push(u); return new Blob(); }, decode: async () => label };
		const load = makeLabeledImageLoader(base, OSM_LABELS, () => true, io, compositor);
		const r = await load({ z: 13, x: 100, y: 200 }, sig());
		expect(urls).toEqual([OSM_LABELS.url({ z: 13, x: 100, y: 200 })]);
		expect(compositor.compose).toHaveBeenCalledWith(baseRes.image, label);
		expect(r).toEqual({ image: composed, tile: baseRes.tile }); // the tile the manager's UV mapping already uses is unchanged
	});

	it('falls back to the unlabeled image when the label fetch fails, without failing the tile', async () => {
		const io: LoaderIO = { fetchBlob: async () => { throw new Error('blocked'); }, decode: async () => bmp };
		const load = makeLabeledImageLoader(base, OSM_LABELS, () => true, io, compositor);
		expect(await load({ z: 13, x: 100, y: 200 }, sig())).toBe(baseRes);
	});

	it('resolves null (not the unlabeled image) when the signal was already aborted', async () => {
		const io: LoaderIO = { fetchBlob: async () => { throw new Error('aborted'); }, decode: async () => bmp };
		const load = makeLabeledImageLoader(base, OSM_LABELS, () => true, io, compositor);
		const ac = new AbortController(); ac.abort();
		expect(await load({ z: 13, x: 100, y: 200 }, ac.signal)).toBeNull();
	});

	it('passes through null when the base loader found nothing', async () => {
		const io: LoaderIO = { fetchBlob: vi.fn(), decode: vi.fn() };
		const load = makeLabeledImageLoader(async () => null, OSM_LABELS, () => true, io, compositor);
		expect(await load({ z: 13, x: 100, y: 200 }, sig())).toBeNull();
	});
});
