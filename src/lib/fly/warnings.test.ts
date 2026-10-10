import { describe, expect, it } from 'vitest';
import { G_CAUTION, G_WARNING, LOW_FUEL_CAUTION, LOW_FUEL_WARNING, computeWarnings } from './warnings';

const base = { fuel: 1, gForce: 1, offline: false };

describe('computeWarnings', () => {
	it('is empty for a normal, healthy flight', () => {
		expect(computeWarnings(base)).toEqual([]);
	});
	it('fuel: caution below the threshold, warning below the critical threshold, nothing in between removed', () => {
		expect(computeWarnings({ ...base, fuel: LOW_FUEL_CAUTION - 0.001 })).toEqual([{ id: 'fuel', level: 'caution', text: 'Fuel low', action: 'Find somewhere to land' }]);
		expect(computeWarnings({ ...base, fuel: LOW_FUEL_WARNING - 0.001 })).toEqual([{ id: 'fuel', level: 'warning', text: 'Fuel critical', action: 'Land now' }]);
		expect(computeWarnings({ ...base, fuel: LOW_FUEL_CAUTION })).toEqual([]); // exactly at the threshold is not yet low
	});
	it('g-force: caution then warning, each a single pill (not both at once for the same cause)', () => {
		expect(computeWarnings({ ...base, gForce: G_CAUTION + 0.1 })).toEqual([{ id: 'g', level: 'caution', text: 'High G', action: 'Ease off' }]);
		const warn = computeWarnings({ ...base, gForce: G_WARNING + 0.1 });
		expect(warn).toEqual([{ id: 'g', level: 'warning', text: 'High G', action: 'Ease off' }]);
		expect(warn).toHaveLength(1);
	});
	it('terrain data unreachable (offline) is its own independent pill', () => {
		expect(computeWarnings({ ...base, offline: true })).toEqual([{ id: 'terrain', level: 'caution', text: 'Terrain data unreachable', action: 'Ground is estimated' }]);
	});
	it('multiple real conditions at once produce multiple pills, worst-case stacked', () => {
		const w = computeWarnings({ fuel: 0.02, gForce: 7, offline: true });
		expect(w.map((x) => x.id).sort()).toEqual(['fuel', 'g', 'terrain']);
		expect(w.find((x) => x.id === 'fuel')?.level).toBe('warning');
		expect(w.find((x) => x.id === 'g')?.level).toBe('warning');
	});
});
