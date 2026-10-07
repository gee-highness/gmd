// src/lib/fly/ships/specs.ts
// Ship data for the roster in docs/fly/11-ship-roster.md. Every vehicle number is a GAMEPLAY value (tagged G in the docs), not a real
// vehicle's: the drive is a fictional high-efficiency torch so each ship can reach orbit and the other worlds. Pure data and helpers,
// no rendering, so they are unit-tested against the numbers published in the roster.

export const G0 = 9.80665;

export type ShipId = 'kestrel' | 'wayfarer' | 'meridian';

export interface ShipSpec {
	id: ShipId;
	name: string;
	blurb: string;
	/** Overall size in metres. */
	dims: { length: number; span: number; height: number };
	/** Kilograms. */
	mass: { dry: number; propellant: number };
	/** Specific impulse of the torch, seconds. */
	isp: number;
	/** Thrust in newtons (vacuum). */
	thrust: { main: number; hover: number };
	/** Reference drag area C_D·A in m². */
	cdA: number;
	landing: { minPad: number; maxSlopeDeg: number; maxVz: number };
	crew: number;
	/** Set by `tuneShip`: multipliers the flight model applies on top of the numbers above (drag on every body axis, thrust for RCS, speed for the hover-mode limit). */
	perf?: { drag: number; thrust: number; speed: number };
}

export const KESTREL: ShipSpec = {
	id: 'kestrel',
	name: 'Kestrel',
	blurb: 'A small bubble-canopy VTOL scout. Quick, glassy and light enough to land almost anywhere.',
	dims: { length: 9.5, span: 8.3, height: 4.35 },
	mass: { dry: 5_500, propellant: 3_000 },
	isp: 3_500,
	thrust: { main: 120_000, hover: 100_000 },
	cdA: 54,
	landing: { minPad: 12, maxSlopeDeg: 15, maxVz: 4 },
	crew: 2,
};

/**
 * Performance dial for the Earth flight (GAMEPLAY values). Main thrust ×10 gives ×10 acceleration; drag area ÷10 gives ×10 top speed in air
 * (terminal speed ∝ √(thrust / drag area)); Isp ×10 keeps propellant burn per second at the stock rate (ṁ = F/(Isp·g0)). Hover-lift engines
 * are left alone, so the VTOL feel is unchanged. `?perf=stock` in the URL flies the original numbers.
 */
export const PERFORMANCE = { thrust: 10, drag: 0.1, isp: 10 };

/** A copy of `spec` with the performance dial applied. */
export function tuneShip(spec: ShipSpec, p: typeof PERFORMANCE = PERFORMANCE): ShipSpec {
	return {
		...spec,
		isp: spec.isp * p.isp,
		thrust: { ...spec.thrust, main: spec.thrust.main * p.thrust },
		cdA: spec.cdA * p.drag,
		perf: { drag: p.drag, thrust: p.thrust, speed: p.thrust },
	};
}

/** The Kestrel as flown on Earth: stock airframe with the performance dial applied. */
export const KESTREL_FAST: ShipSpec = tuneShip(KESTREL);

/** Tsiolkovsky: Δv = Isp·g0·ln(m0/m1) at full tanks, m/s. */
export const deltaV = (s: ShipSpec) => s.isp * G0 * Math.log((s.mass.dry + s.mass.propellant) / s.mass.dry);

/** Thrust-to-weight at full tanks with main + hover engines at a world's surface gravity (m/s²). */
export const thrustToWeight = (s: ShipSpec, g: number) => (s.thrust.main + s.thrust.hover) / ((s.mass.dry + s.mass.propellant) * g);

/** Ballistic coefficient β = m/(C_D·A), kg/m², at full tanks. */
export const ballisticCoefficient = (s: ShipSpec) => (s.mass.dry + s.mass.propellant) / s.cdA;

/** Terminal speed of a free fall in uniform density ρ (kg/m³) under gravity g: √(2βg/ρ), m/s. */
export const terminalSpeed = (s: ShipSpec, g: number, rho: number) => Math.sqrt((2 * ballisticCoefficient(s) * g) / rho);
