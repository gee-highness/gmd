// src/lib/fly/warnings.ts
// The HUD's warnings pill (docs/plan-fly-game-ux.md §2 / docs/fly/05-ui-hud-spec.md §4): every trigger here reads a
// real quantity already in the HUD (fuel fraction, felt g-force, terrain-data reachability) per the physicality
// charter's rule 1 - no hand-set timer, no distance-only trigger.
//
// Honesty note: the Kestrel has no damage/structural-failure model for g-load, dynamic pressure or heat yet (no
// code anywhere computes a "this breaks the ship" threshold for any of them - see docs/fly/09-physicality-charter.md
// §10, "measured, derived, artistic"). So this only warns on g-force as a PILOT-physiology fact (sustained 4-6 g is
// the commonly cited onset of grey-out for an unprepared person, independent of the ship), not a ship limit. MAX-Q
// and hull-heat warnings from the HUD spec's table are deliberately not built here until the sim actually models a
// structural limit for them - inventing a number and presenting it as an engineering limit would be exactly the
// "magic number" the charter's rule 2 rules out.

export interface Warning {
	id: string;
	level: 'caution' | 'warning';
	text: string;
	action: string;
}

export const LOW_FUEL_CAUTION = 0.15; // matches the fuel bar's own existing red-below-15% threshold
export const LOW_FUEL_WARNING = 0.05;
export const G_CAUTION = 4; // onset of grey-out for an unprepared pilot, sustained (physiological reference, not a ship limit)
export const G_WARNING = 6; // onset of blackout, sustained

export interface WarningInputs {
	fuel: number;
	gForce: number;
	offline: boolean;
}

/** At most one warning per `id`, worst level only (a ship that is both critical and merely low on fuel shows one pill, not two). */
export function computeWarnings(hud: WarningInputs): Warning[] {
	const out: Warning[] = [];
	if (hud.fuel < LOW_FUEL_WARNING) out.push({ id: 'fuel', level: 'warning', text: 'Fuel critical', action: 'Land now' });
	else if (hud.fuel < LOW_FUEL_CAUTION) out.push({ id: 'fuel', level: 'caution', text: 'Fuel low', action: 'Find somewhere to land' });
	if (hud.gForce > G_WARNING) out.push({ id: 'g', level: 'warning', text: 'High G', action: 'Ease off' });
	else if (hud.gForce > G_CAUTION) out.push({ id: 'g', level: 'caution', text: 'High G', action: 'Ease off' });
	if (hud.offline) out.push({ id: 'terrain', level: 'caution', text: 'Terrain data unreachable', action: 'Ground is estimated' });
	return out;
}
