// src/lib/fly/onboarding.ts
// The first-flight sequence (docs/plan-fly-game-ux.md §5): a short, skippable set of hints, each clearing on a
// real telemetry condition (agl, a view switch, a landing) rather than a timer, same discipline as the rest of
// this plan. Pure step logic here so it's unit-tested without mounting the flight sim.

export interface OnboardingHud {
	agl: number;
	event: string; // non-empty while a landed/rough/crash banner is showing (EarthFlight's Hud.event)
}

export const ONBOARDING_STEPS = [
	'Take off: hold Space to climb.',
	'Climb to 50 m.',
	'Press V to switch to first person, then back.',
	'Ease off and land.',
	'You\'re flying. Esc for the pause menu, K for controls, any time.',
] as const;

/** Same steps, worded for touch: no keyboard, so no "press X" copy - the stick/button names already on screen. */
export const ONBOARDING_STEPS_TOUCH = [
	'Take off: push the left stick up to climb.',
	'Climb to 50 m.',
	'Looking good.',
	'Ease off and land.',
	'You\'re flying. The pause button is always in the top bar.',
] as const;

export const ONBOARDING_DONE = -1;

/**
 * Given the current step and fresh telemetry, returns the step to show next (unchanged if its condition isn't met
 * yet). `canSwitchView` is false on touch, where there is no on-screen first/third-person control (the toolbar's
 * segmented view control is desktop-only) - step 2 then passes through on its own rather than waiting on an
 * action the pilot has no way to perform.
 */
export function nextOnboardingStep(step: number, hud: OnboardingHud, viewSwitched: boolean, finalStepShownAt: number | null, now: number, canSwitchView = true): number {
	if (step === ONBOARDING_DONE) return step;
	if (step === 0) return hud.agl > 10 ? 1 : 0;
	if (step === 1) return hud.agl > 50 ? 2 : 1;
	if (step === 2) return viewSwitched || !canSwitchView ? 3 : 2;
	if (step === 3) return hud.event.length > 0 ? 4 : 3;
	// Step 4 (the closing message) clears itself a few seconds after it first appears, rather than waiting on
	// another telemetry condition - there isn't a further real milestone to wait for once the pilot has landed once.
	if (step === 4) return finalStepShownAt !== null && now - finalStepShownAt > 4000 ? ONBOARDING_DONE : 4;
	return ONBOARDING_DONE;
}
