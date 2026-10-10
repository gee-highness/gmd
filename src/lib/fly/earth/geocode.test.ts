import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { type GeocodeIO, type GeocodeResult, makeDebouncedSearcher, searchPlace, searchPlaceUrl } from './geocode';

const sig = () => new AbortController().signal;
const row = (lat: string, lon: string, name: string) => ({ lat, lon, display_name: name });

describe('searchPlace', () => {
	it('resolves [] for a too-short query without making a request', async () => {
		const io: GeocodeIO = { fetchJson: vi.fn() };
		expect(await searchPlace('z', sig(), io)).toEqual([]);
		expect(io.fetchJson).not.toHaveBeenCalled();
	});
	it('maps Nominatim rows to {lat, lon, label} and drops a row with a bad coordinate', async () => {
		const io: GeocodeIO = { fetchJson: async () => [row('47.3769', '8.5417', 'Zürich, Switzerland'), row('not-a-number', '1', 'Bad Row')] };
		const r = await searchPlace('zurich', sig(), io);
		expect(r).toEqual([{ lat: 47.3769, lon: 8.5417, label: 'Zürich, Switzerland' }]);
	});
	it('resolves [] when the response is not an array, without throwing', async () => {
		const io: GeocodeIO = { fetchJson: async () => ({ error: 'nope' }) };
		expect(await searchPlace('zurich', sig(), io)).toEqual([]);
	});
	it('propagates a real fetch failure as a rejection (callers decide how to show that)', async () => {
		const io: GeocodeIO = { fetchJson: async () => { throw new Error('HTTP 429'); } };
		await expect(searchPlace('zurich', sig(), io)).rejects.toThrow('HTTP 429');
	});
	it('URL-encodes the query and asks for a bounded number of results', () => {
		const u = searchPlaceUrl('são paulo');
		expect(u).toContain('q=s%C3%A3o%20paulo');
		expect(u).toContain('limit=5');
		expect(u).toContain('format=json');
	});
});

describe('makeDebouncedSearcher', () => {
	beforeEach(() => vi.useFakeTimers());
	afterEach(() => vi.useRealTimers());

	it('only the last call in a burst of keystrokes reaches the network', async () => {
		const calls: string[] = [];
		const search = vi.fn(async (q: string) => { calls.push(q); return [{ lat: 0, lon: 0, label: q }] as GeocodeResult[]; });
		const results: GeocodeResult[][] = [];
		const debounced = makeDebouncedSearcher(search, (r) => results.push(r), 300);
		debounced('z'); debounced('zu'); debounced('zur'); debounced('zuri'); debounced('zuric'); debounced('zurich');
		await vi.advanceTimersByTimeAsync(300);
		expect(calls).toEqual(['zurich']);
		expect(results).toEqual([[{ lat: 0, lon: 0, label: 'zurich' }]]);
	});

	it('aborts the in-flight request when a new call supersedes it, and only the superseding one is ever delivered', async () => {
		const aborted: string[] = [];
		const search = vi.fn((q: string, signal: AbortSignal) => new Promise<GeocodeResult[]>((resolve, reject) => {
			signal.addEventListener('abort', () => { aborted.push(q); reject(new Error('aborted')); });
			setTimeout(() => resolve([{ lat: 0, lon: 0, label: q }]), 1000);
		}));
		const results: GeocodeResult[][] = [];
		const debounced = makeDebouncedSearcher(search, (r) => results.push(r), 100);
		debounced('first');
		await vi.advanceTimersByTimeAsync(100); // the debounce elapses: 'first' request starts
		debounced('second'); // supersedes it well before its own 1000 ms would resolve
		await vi.advanceTimersByTimeAsync(1100); // 'second's debounce (100) + its own request time (1000)
		expect(aborted).toEqual(['first']);
		expect(results).toEqual([[{ lat: 0, lon: 0, label: 'second' }]]);
	});

	it('cancel() stops a pending debounce timer from ever firing', async () => {
		const search = vi.fn(async () => [] as GeocodeResult[]);
		const debounced = makeDebouncedSearcher(search, () => {}, 300);
		debounced('zurich');
		debounced.cancel();
		await vi.advanceTimersByTimeAsync(1000);
		expect(search).not.toHaveBeenCalled();
	});
});
