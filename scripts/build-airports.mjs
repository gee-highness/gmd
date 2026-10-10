// Bakes an OurAirports-format airports.csv (https://ourairports.com/data/, public domain) into
// public/data/airports.json for the /fly minimap's "click to fly here" layer
// (docs/plan-fly-map-data.md §1). Committed output, not fetched live by the app.
//
// Run: node scripts/build-airports.mjs <path-to-airports.csv>
//
// Get the CSV from https://ourairports.com/data/airports.csv (not reachable from this sandbox -
// its hosts are blocked by the agent proxy here, the same limitation already documented in
// earth/imagery.ts for EOX/GIBS). Run this from a machine with normal internet access, then commit
// the regenerated public/data/airports.json. Until then, public/data/airports.json ships a small,
// hand-curated starter set of major airports (see that file's own header comment).
//
// The CSV parsing below mirrors src/lib/fly/earth/airports.ts's `parseAirportsCsv` (kept here
// rather than imported so this script runs with plain `node`, no TypeScript loader); that module's
// own unit tests are the source of truth for the parsing rules.
import { readFileSync, writeFileSync } from 'node:fs';

function splitCsvLine(line) {
	const out = [];
	let cur = '', inQuotes = false;
	for (let i = 0; i < line.length; i++) {
		const c = line[i];
		if (inQuotes) {
			if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
			else if (c === '"') inQuotes = false;
			else cur += c;
		} else if (c === '"') inQuotes = true;
		else if (c === ',') { out.push(cur); cur = ''; }
		else cur += c;
	}
	out.push(cur);
	return out;
}

function parseAirportsCsv(csv) {
	const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
	if (lines.length < 2) return [];
	const header = splitCsvLine(lines[0]);
	const col = (name) => header.indexOf(name);
	const iType = col('type'), iName = col('name'), iLat = col('latitude_deg'), iLon = col('longitude_deg'), iIata = col('iata_code');
	if ([iType, iName, iLat, iLon, iIata].some((i) => i < 0)) throw new Error('airports.csv: missing an expected column');
	const out = [];
	for (let i = 1; i < lines.length; i++) {
		const f = splitCsvLine(lines[i]);
		const type = f[iType], iata = f[iIata];
		if ((type !== 'large_airport' && type !== 'medium_airport') || !iata) continue;
		const lat = Number(f[iLat]), lon = Number(f[iLon]);
		if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;
		out.push({ id: iata, name: f[iName], lat, lon });
	}
	return out;
}

const csvPath = process.argv[2];
if (!csvPath) { console.error('Usage: node scripts/build-airports.mjs <path-to-airports.csv>'); process.exit(1); }

const airports = parseAirportsCsv(readFileSync(csvPath, 'utf8'));
writeFileSync('public/data/airports.json', JSON.stringify(airports));
console.log(`Wrote public/data/airports.json: ${airports.length} airports`);
