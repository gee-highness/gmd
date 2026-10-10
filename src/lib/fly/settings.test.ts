import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, loadSettings, resolveReducedMotion, saveSettings, type StorageLike, updateSettings } from './settings';

function fakeStorage(initial: Record<string, string> = {}): StorageLike {
	const data = new Map(Object.entries(initial));
	return { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
}

describe('fly settings', () => {
	it('returns the defaults when nothing is saved yet', () => {
		expect(loadSettings(fakeStorage())).toEqual(DEFAULT_SETTINGS);
	});
	it('returns the defaults when storage is unavailable (null), never throwing', () => {
		expect(loadSettings(null)).toEqual(DEFAULT_SETTINGS);
		expect(() => saveSettings(DEFAULT_SETTINGS, null)).not.toThrow();
	});
	it('round-trips a saved value', () => {
		const s = fakeStorage();
		saveSettings({ ...DEFAULT_SETTINGS, labelsOn: true, minimapOn: true }, s);
		expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, labelsOn: true, minimapOn: true });
	});
	it('falls back to defaults on corrupt JSON instead of throwing', () => {
		expect(loadSettings(fakeStorage({ 'fly.settings.v1': '{not json' }))).toEqual(DEFAULT_SETTINGS);
		expect(loadSettings(fakeStorage({ 'fly.settings.v1': '"just a string"' }))).toEqual(DEFAULT_SETTINGS);
		expect(loadSettings(fakeStorage({ 'fly.settings.v1': 'null' }))).toEqual(DEFAULT_SETTINGS);
	});
	it('merges a partial/old saved object onto the current defaults field by field (forward compatibility)', () => {
		const s = fakeStorage({ 'fly.settings.v1': JSON.stringify({ labelsOn: true }) });
		expect(loadSettings(s)).toEqual({ ...DEFAULT_SETTINGS, labelsOn: true });
	});
	it('a storage whose setItem throws (quota exceeded) does not throw out of saveSettings', () => {
		const s: StorageLike = { getItem: () => null, setItem: () => { throw new Error('QuotaExceededError'); } };
		expect(() => saveSettings(DEFAULT_SETTINGS, s)).not.toThrow();
	});
	it('updateSettings reads, merges one field, writes back, and returns the merged value', () => {
		const s = fakeStorage();
		const r1 = updateSettings({ imageryOn: false }, s);
		expect(r1.imageryOn).toBe(false);
		const r2 = updateSettings({ buildingsOn: false }, s); // a second patch keeps the first change
		expect(r2).toEqual({ ...DEFAULT_SETTINGS, imageryOn: false, buildingsOn: false });
	});
	it('resolveReducedMotion: on/off override, auto falls through to the OS preference (unset in this test env, so false)', () => {
		expect(resolveReducedMotion('on')).toBe(true);
		expect(resolveReducedMotion('off')).toBe(false);
		expect(resolveReducedMotion('auto')).toBe(false);
	});
});
