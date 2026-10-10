// src/lib/fly/earth/airports.ts
// Airport data for the minimap's "click to fly here" layer (docs/plan-fly-map-data.md §1). Pure
// parsing/filtering, no fs/fetch here, so it's unit-testable without a browser or a network - the
// CSV text and the output are both just data in, data out.

export interface Airport {
	/** IATA code, e.g. "LHR". */
	id: string;
	name: string;
	lat: number;
	lon: number;
}

/**
 * Parses an OurAirports-format `airports.csv` (https://ourairports.com/data/, public domain) and
 * keeps large/medium airports with a valid IATA code - about 2,000 of the ~80,000 rows. A minimal
 * CSV reader, not a general-purpose one: OurAirports quotes any field containing a comma, which is
 * the only escaping this needs to handle.
 */
export function parseAirportsCsv(csv: string): Airport[] {
	const lines = csv.split(/\r?\n/).filter((l) => l.length > 0);
	if (lines.length < 2) return [];
	const header = splitCsvLine(lines[0]);
	const col = (name: string) => header.indexOf(name);
	const iType = col('type'), iName = col('name'), iLat = col('latitude_deg'), iLon = col('longitude_deg'), iIata = col('iata_code');
	if ([iType, iName, iLat, iLon, iIata].some((i) => i < 0)) throw new Error('airports.csv: missing an expected column');
	const out: Airport[] = [];
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

function splitCsvLine(line: string): string[] {
	const out: string[] = [];
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
