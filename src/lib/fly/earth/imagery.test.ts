import { describe, expect, it } from 'vitest';
import { DEFAULT_PROVIDERS, EOX_S2, GIBS_BLUE_MARBLE, ancestors, imageryFor } from './imagery';

describe('imagery tile mapping', () => {
	it('uses the same tile up to the provider zoom', () => expect(imageryFor({ z: 8, x: 5, y: 6 }, 8)).toEqual({ tile: { z: 8, x: 5, y: 6 }, repeat: 1, offsetX: 0, offsetY: 0 }));
	it('beyond it, takes a sub-window of the ancestor tile', () => {
		const r = imageryFor({ z: 10, x: 4 * 5 + 3, y: 4 * 6 + 1 }, 8);
		expect(r.tile).toEqual({ z: 8, x: 5, y: 6 }); expect(r.repeat).toBeCloseTo(0.25, 12);
		expect(r.offsetX).toBeCloseTo(0.75, 12); // fourth column of four
		expect(r.offsetY).toBeCloseTo(1 - (1 + 1) / 4, 12); // second row from the top
	});
	it('the four children of a tile tile its window exactly', () => {
		const kids = [0, 1].flatMap((dy) => [0, 1].map((dx) => imageryFor({ z: 9, x: 10 + dx, y: 20 + dy }, 8)));
		expect(new Set(kids.map((k) => `${k.tile.x}/${k.tile.y}`)).size).toBe(1);
		expect(kids.map((k) => `${k.offsetX},${k.offsetY}`).sort()).toEqual(['0,0', '0,0.5', '0.5,0', '0.5,0.5']);
	});
	it('provider URLs have the XYZ tokens in the right slots (z / row y / column x)', () => {
		expect(EOX_S2.url({ z: 5, x: 17, y: 11 })).toContain('/5/11/17.jpg');
		expect(GIBS_BLUE_MARBLE.url({ z: 5, x: 17, y: 11 })).toContain('/5/11/17.jpeg');
		expect(DEFAULT_PROVIDERS[0]).toBe(EOX_S2);
		expect(EOX_S2.attribution).toMatch(/CC BY 4\.0/); expect(GIBS_BLUE_MARBLE.attribution).toMatch(/public domain/);
	});
	it('ancestor chain climbs to the world tile', () => {
		const a = ancestors({ z: 4, x: 9, y: 6 });
		expect(a.map((t) => t.z)).toEqual([3, 2, 1, 0]); expect(a[0]).toEqual({ z: 3, x: 4, y: 3 });
	});
	it('the label overlay is standard XYZ (z/x/y), and its maxZoom covers every terrain zoom', async () => {
		const { OSM_LABELS } = await import('./imagery');
		expect(OSM_LABELS.url({ z: 5, x: 17, y: 11 })).toContain('/5/17/11.png');
		expect(OSM_LABELS.maxZoom).toBeGreaterThanOrEqual(13); // MAX_TERRAIN_ZOOM (manager.ts)
		expect(OSM_LABELS.attribution).toMatch(/OpenStreetMap/);
		expect(DEFAULT_PROVIDERS).not.toContain(OSM_LABELS); // overlay, not a base imagery provider
	});
});
