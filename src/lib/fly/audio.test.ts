import { describe, expect, it } from 'vitest';
import { FlightAudio, engineFrequency, engineGain, impactFrequency, impactGain, windCutoffHz, windGain } from './audio';

describe('engine sound curves', () => {
	it('never falls silent at zero thrust (a real idle hum), and rises monotonically with thrust', () => {
		expect(engineGain(0)).toBeGreaterThan(0);
		expect(engineGain(0.5)).toBeGreaterThan(engineGain(0));
		expect(engineGain(1)).toBeGreaterThan(engineGain(0.5));
	});
	it('frequency rises with thrust and stays in an audible, sane range', () => {
		expect(engineFrequency(0)).toBeGreaterThan(20);
		expect(engineFrequency(1)).toBeGreaterThan(engineFrequency(0));
		expect(engineFrequency(1)).toBeLessThan(500);
	});
	it('clamps out-of-range thrust fractions instead of producing a negative or runaway value', () => {
		expect(engineGain(-5)).toBe(engineGain(0));
		expect(engineGain(5)).toBe(engineGain(1));
	});
});

describe('wind sound curves', () => {
	it('is silent at a standstill and rises with speed, capped', () => {
		expect(windGain(0)).toBe(0);
		expect(windGain(100)).toBeGreaterThan(windGain(10));
		expect(windGain(100000)).toBeLessThanOrEqual(0.5);
	});
	it('filter brightens (cutoff rises) with speed', () => {
		expect(windCutoffHz(200)).toBeGreaterThan(windCutoffHz(0));
	});
});

describe('touchdown thump curves', () => {
	it('a harder impact (relative to the gear rating) is louder', () => {
		expect(impactGain(4, 4)).toBeGreaterThan(impactGain(1, 4));
	});
	it('a harder impact reads as a lower-pitched thud, not higher', () => {
		expect(impactFrequency(4, 4)).toBeLessThan(impactFrequency(1, 4));
	});
	it('gain is bounded to 0..1 even for a huge overspeed impact', () => {
		expect(impactGain(1000, 4)).toBeLessThanOrEqual(1);
	});
});

describe('FlightAudio (construction and no-Web-Audio environment)', () => {
	it('construction, update, touchdown and dispose are all no-ops without throwing when AudioContext is unavailable (this test runs in node)', () => {
		const audio = new FlightAudio();
		expect(() => audio.update({ thrustFraction: 0.5, speedMs: 100, muted: false, master: 1 })).not.toThrow();
		expect(() => audio.touchdown(3, 4)).not.toThrow();
		expect(() => audio.resume()).not.toThrow();
		expect(() => audio.dispose()).not.toThrow();
		expect(() => audio.dispose()).not.toThrow(); // disposing twice is safe
	});
});
