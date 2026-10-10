import { describe, expect, it } from 'vitest';
import { ONBOARDING_DONE, nextOnboardingStep } from './onboarding';

const hud = (agl: number, event = '') => ({ agl, event });

describe('nextOnboardingStep', () => {
	it('stays done forever once done', () => {
		expect(nextOnboardingStep(ONBOARDING_DONE, hud(5000, 'landed'), true, 0, 99999)).toBe(ONBOARDING_DONE);
	});
	it('step 0 → 1 only once AGL exceeds 10 m, not before', () => {
		expect(nextOnboardingStep(0, hud(5), false, null, 0)).toBe(0);
		expect(nextOnboardingStep(0, hud(10), false, null, 0)).toBe(0); // exactly at the threshold is not yet "exceeded"
		expect(nextOnboardingStep(0, hud(11), false, null, 0)).toBe(1);
	});
	it('step 1 → 2 only once AGL exceeds 50 m', () => {
		expect(nextOnboardingStep(1, hud(49), false, null, 0)).toBe(1);
		expect(nextOnboardingStep(1, hud(51), false, null, 0)).toBe(2);
	});
	it('step 2 → 3 only once the view has been switched', () => {
		expect(nextOnboardingStep(2, hud(100), false, null, 0)).toBe(2);
		expect(nextOnboardingStep(2, hud(100), true, null, 0)).toBe(3);
	});
	it('step 2 passes through immediately when there is no touch control to switch view with', () => {
		expect(nextOnboardingStep(2, hud(100), false, null, 0, false)).toBe(3);
	});
	it('step 3 → 4 only once a landing event shows', () => {
		expect(nextOnboardingStep(3, hud(0, ''), true, null, 0)).toBe(3);
		expect(nextOnboardingStep(3, hud(0, 'Landed.'), true, null, 0)).toBe(4);
	});
	it('step 4 clears itself 4 s after it first appeared, not before', () => {
		expect(nextOnboardingStep(4, hud(0), true, 1000, 3000)).toBe(4);
		expect(nextOnboardingStep(4, hud(0), true, 1000, 5001)).toBe(ONBOARDING_DONE);
	});
	it('a later step never regresses to an earlier one if telemetry momentarily looks like an earlier condition', () => {
		// e.g. agl dips below 50 again while still past step 1 - nextOnboardingStep is only ever called with the
		// pilot's OWN current step, so this is really documenting that callers must not pass a lower step back in;
		// here we just confirm step 2's own condition logic doesn't care about agl at all once past step 1.
		expect(nextOnboardingStep(2, hud(5), false, null, 0)).toBe(2);
	});
});
