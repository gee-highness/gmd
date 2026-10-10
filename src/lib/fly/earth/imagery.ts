// src/lib/fly/earth/imagery.ts
// Real surface imagery for the terrain. Providers are tried in order; any failure falls back to the next and finally to the physically
// motivated tint in tileMesh.ts, so a missing or blocked provider never leaves a hole. URLs were NOT reachable from the build sandbox:
// they are unverified until run in a real browser, which is why every provider is optional and the fallback is automatic.
//
//   • EOX "Sentinel-2 cloudless" 2016 (CC BY 4.0): 10 m global colour mosaic, to z13. © EOX IT Services GmbH, contains modified Copernicus
//     Sentinel data 2016. https://s2maps.eu
//   • NASA GIBS "Blue Marble Next Generation" (public domain): 500 m global colour, to z8. Courtesy NASA EOSDIS GIBS.
// All Web-Mercator XYZ, the same grid as the elevation tiles, so imagery tile (z, x, y) lines up with terrain tile (z, x, y).

import { type TileId, parentOf } from './geo';

export interface ImageryProvider {
	id: string;
	name: string;
	maxZoom: number;
	url: (t: TileId) => string;
	attribution: string;
}

export const EOX_S2: ImageryProvider = {
	id: 'eox-s2cloudless-2016', name: 'Sentinel-2 cloudless (2016)', maxZoom: 13,
	url: (t) => `https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless_3857/default/g/${t.z}/${t.y}/${t.x}.jpg`,
	attribution: 'Sentinel-2 cloudless by EOX IT Services GmbH (contains modified Copernicus Sentinel data 2016), CC BY 4.0',
};

export const GIBS_BLUE_MARBLE: ImageryProvider = {
	id: 'nasa-gibs-bmng', name: 'Blue Marble Next Generation', maxZoom: 8,
	url: (t) => `https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/BlueMarble_NextGeneration/default/GoogleMapsCompatible_Level8/${t.z}/${t.y}/${t.x}.jpeg`,
	attribution: 'Imagery courtesy NASA EOSDIS Global Imagery Browse Services (GIBS), public domain',
};

export const DEFAULT_PROVIDERS = [EOX_S2, GIBS_BLUE_MARBLE];

/**
 * Place and street names only (transparent background, no basemap underneath): a label *overlay* composited onto the
 * satellite imagery by `makeLabeledImageLoader`, not a base provider in `DEFAULT_PROVIDERS`. CARTO's "Voyager" style
 * family built from OpenStreetMap data, CC BY 4.0/ODbL. maxZoom 20 covers every terrain zoom (≤ 13), so the label
 * tile always lines up exactly with the base tile's (z, x, y) - no separate UV mapping needed.
 */
export const OSM_LABELS: ImageryProvider = {
	id: 'carto-voyager-labels', name: 'Place & street names', maxZoom: 20,
	url: (t) => `https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/${t.z}/${t.x}/${t.y}.png`,
	attribution: 'Place and street names © OpenStreetMap contributors, style © CARTO',
};

/** Which imagery tile covers a geometry tile at a provider's maximum zoom, and the UV window of it. */
export function imageryFor(id: TileId, maxZoom: number): { tile: TileId; repeat: number; offsetX: number; offsetY: number } {
	if (id.z <= maxZoom) return { tile: id, repeat: 1, offsetX: 0, offsetY: 0 };
	const k = 2 ** (id.z - maxZoom);
	const ax = Math.floor(id.x / k), ay = Math.floor(id.y / k);
	// uv.y runs north→south like the tile rows; three's flipY texture has v up, so offsetY is measured from the bottom of the window.
	return { tile: { z: maxZoom, x: ax, y: ay }, repeat: 1 / k, offsetX: (id.x - ax * k) / k, offsetY: 1 - (id.y - ay * k + 1) / k };
}

/** Ancestor chain used to show something while a finer tile loads: nearest first. */
export function ancestors(id: TileId): TileId[] {
	const out: TileId[] = [];
	for (let p = parentOf(id); p; p = parentOf(p)) out.push(p);
	return out;
}

/** The ancestor of `id` at zoom `z` (or `id` itself when it is already that coarse). */
export function ancestorAt(id: TileId, z: number): TileId {
	if (id.z <= z) return id;
	const k = id.z - z;
	return { z, x: id.x >> k, y: id.y >> k };
}
