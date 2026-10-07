// src/lib/fly/earth/mapLayers.ts
// Base maps for the Leaflet map (minimap, full map, launch picker). The satellite layers are the SAME providers the 3D terrain uses (imagery.ts),
// so there is one place that knows the URLs and, later, one place to put a local-first (offline) source in front of them. Pure data, no DOM.

import { type TileId } from './geo';
import { EOX_S2, GIBS_BLUE_MARBLE, type ImageryProvider } from './imagery';

export interface MapLayerDef {
	id: string;
	name: string;
	/** Finest zoom the server has; Leaflet upscales beyond it. */
	maxNativeZoom: number;
	attribution: string;
	url: (t: TileId) => string;
	/** True when the layer only works with a network (the offline pack cannot hold it). */
	onlineOnly: boolean;
}

const fromProvider = (p: ImageryProvider): MapLayerDef => ({ id: p.id, name: p.name, maxNativeZoom: p.maxZoom, attribution: p.attribution, url: p.url, onlineOnly: false });

export const OSM_STREETS: MapLayerDef = {
	id: 'osm-standard', name: 'Streets (OpenStreetMap)', maxNativeZoom: 19, onlineOnly: true,
	attribution: '© OpenStreetMap contributors (ODbL)',
	url: (t) => `https://tile.openstreetmap.org/${t.z}/${t.x}/${t.y}.png`,
};

/** In the order of the layer switcher: the first is the default. */
export const MAP_LAYERS: MapLayerDef[] = [fromProvider(EOX_S2), fromProvider(GIBS_BLUE_MARBLE), OSM_STREETS];

export const layerById = (id: string | null | undefined): MapLayerDef => MAP_LAYERS.find((l) => l.id === id) ?? MAP_LAYERS[0];

/**
 * The map zoom that shows about the area the pilot cares about at an altitude above the ground (m): street level near the ground, the
 * continent from orbit. Roughly one zoom level per doubling of height, a little slower so the map is not constantly changing.
 */
export function zoomForAltitude(agl: number, cap = 13): number {
	const z = Math.round(13 - 0.9 * Math.log2(Math.max(agl, 200) / 200));
	return Math.max(2, Math.min(cap, z));
}

/** Zoom cap for the small map while saving data: the tiles it requests are 4 × fewer per zoom level removed. */
export const MINI_DATA_SAVER_ZOOM = 9;
export const MINI_MAX_ZOOM = 12;

/** Tiles Leaflet would request for a viewport (for the data-use estimate): ceil(w/256)+1 by ceil(h/256)+1. */
export const tilesInView = (w: number, h: number) => (Math.ceil(w / 256) + 1) * (Math.ceil(h / 256) + 1);
