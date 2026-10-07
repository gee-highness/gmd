import { describe, expect, it } from 'vitest';
import { EOX_S2 } from './imagery';
import { MAP_LAYERS, layerById, tilesInView, zoomForAltitude } from './mapLayers';

describe('map layers', () => {
	it('the default layer is the satellite provider the 3D terrain uses, with the same URLs', () => {
		expect(MAP_LAYERS[0].id).toBe(EOX_S2.id);
		expect(MAP_LAYERS[0].url({ z: 5, x: 17, y: 11 })).toBe(EOX_S2.url({ z: 5, x: 17, y: 11 }));
		expect(layerById('nonsense')).toBe(MAP_LAYERS[0]); expect(layerById(null)).toBe(MAP_LAYERS[0]);
	});
	it('only the streets layer is flagged online-only (the offline pack cannot hold it)', () => {
		expect(MAP_LAYERS.filter((l) => l.onlineOnly).map((l) => l.id)).toEqual(['osm-standard']);
	});
	it('every layer has an attribution and builds a tile URL', () => {
		for (const l of MAP_LAYERS) { expect(l.attribution.length).toBeGreaterThan(5); expect(l.url({ z: 3, x: 2, y: 1 })).toMatch(/^https:\/\//); }
	});
});

describe('zoom for altitude', () => {
	it('street level near the ground, coarser as you climb, never below 2 or above the cap', () => {
		expect(zoomForAltitude(0)).toBe(13); expect(zoomForAltitude(200)).toBe(13);
		expect(zoomForAltitude(3200)).toBeLessThan(zoomForAltitude(400)); expect(zoomForAltitude(100_000)).toBeLessThan(zoomForAltitude(3200));
		expect(zoomForAltitude(1e9)).toBe(2); expect(zoomForAltitude(0, 9)).toBe(9);
	});
	it('is monotonic in altitude', () => {
		let prev = 99; for (const a of [0, 300, 1000, 5000, 20_000, 100_000, 400_000]) { const z = zoomForAltitude(a); expect(z).toBeLessThanOrEqual(prev); prev = z; }
	});
	it('a 256 px minimap needs 4 tiles at most 9', () => { expect(tilesInView(256, 256)).toBe(4); expect(tilesInView(1280, 720)).toBe(6 * 4 + 6 * 0 + 6 * 0 + 0 || 24 + 0); });
});
