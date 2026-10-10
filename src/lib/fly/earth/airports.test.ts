import { describe, expect, it } from 'vitest';
import { parseAirportsCsv } from './airports';

const HEADER = 'id,ident,type,name,latitude_deg,longitude_deg,elevation_ft,continent,iso_country,iso_region,municipality,scheduled_service,iata_code';
const row = (type: string, name: string, lat: string, lon: string, iata: string) =>
	`1,TEST,${type},"${name}",${lat},${lon},0,EU,CH,CH-ZH,Zurich,yes,${iata}`;

describe('parseAirportsCsv', () => {
	it('keeps large and medium airports with an IATA code, in order, with the right fields', () => {
		const csv = [HEADER, row('large_airport', 'Zürich Airport', '47.4647', '8.5492', 'ZRH'), row('medium_airport', 'Some Field', '1', '2', 'ABC')].join('\n');
		const r = parseAirportsCsv(csv);
		expect(r).toEqual([{ id: 'ZRH', name: 'Zürich Airport', lat: 47.4647, lon: 8.5492 }, { id: 'ABC', name: 'Some Field', lat: 1, lon: 2 }]);
	});
	it('drops small/closed/heliport rows and anything without an IATA code', () => {
		const csv = [HEADER, row('small_airport', 'Tiny Strip', '1', '2', 'TNY'), row('closed', 'Gone', '1', '2', 'GON'), row('large_airport', 'No Code', '1', '2', '')].join('\n');
		expect(parseAirportsCsv(csv)).toEqual([]);
	});
	it('drops rows with a non-numeric coordinate rather than emitting NaN', () => {
		const csv = [HEADER, row('large_airport', 'Bad Coord', 'not-a-number', '2', 'BAD')].join('\n');
		expect(parseAirportsCsv(csv)).toEqual([]);
	});
	it('handles a quoted name containing a comma (the one OurAirports escaping case)', () => {
		const csv = [HEADER, row('large_airport', 'Washington, Dulles', '38.9531', '-77.4565', 'IAD')].join('\n');
		expect(parseAirportsCsv(csv)[0].name).toBe('Washington, Dulles');
	});
	it('returns an empty list for a header-only or empty file, and throws on an unrecognised schema', () => {
		expect(parseAirportsCsv(HEADER)).toEqual([]);
		expect(parseAirportsCsv('')).toEqual([]);
		expect(() => parseAirportsCsv('a,b,c\n1,2,3')).toThrow();
	});
});
