// src/lib/fly/settings.ts
// Persisted /fly preferences (docs/plan-fly-game-ux.md Phase 1): everything in the HUD's checkboxes and the pause
// menu's comfort section currently resets on every reload. Storage is injectable (same spirit as loaders.ts's
// LoaderIO) so this is unit-testable without a browser, and every read/write is wrapped so a blocked or full
// localStorage (private browsing, quota) degrades to "nothing persists this session" instead of throwing.

export interface FlySettings {
	/** Reserved for docs/plan-fly-game-ux.md Phase 2 (Cinematic/Physical/Strict); only 'physical' has any effect today. */
	reality: 'cinematic' | 'physical' | 'strict';
	reducedMotion: 'auto' | 'on' | 'off';
	uiScale: 'normal' | 'large';
	imageryOn: boolean;
	buildingsOn: boolean;
	labelsOn: boolean;
	minimapOn: boolean;
	hoverAssist: boolean;
	levelAssist: boolean;
}

export const DEFAULT_SETTINGS: FlySettings = {
	reality: 'physical',
	reducedMotion: 'auto',
	uiScale: 'normal',
	imageryOn: true,
	buildingsOn: true,
	labelsOn: false,
	minimapOn: false,
	hoverAssist: true,
	levelAssist: true,
};

const STORAGE_KEY = 'fly.settings.v1';

export interface StorageLike {
	getItem(key: string): string | null;
	setItem(key: string, value: string): void;
}

/** `window.localStorage`, or null if unavailable/blocked (private browsing can throw just touching the property). */
function browserStorage(): StorageLike | null {
	try {
		return typeof window !== 'undefined' ? window.localStorage : null;
	} catch {
		return null;
	}
}

/** A corrupt or partial saved object (an old version, or hand-edited) merges onto the defaults field by field. */
export function loadSettings(storage: StorageLike | null = browserStorage()): FlySettings {
	if (!storage) return { ...DEFAULT_SETTINGS };
	try {
		const raw = storage.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULT_SETTINGS };
		const parsed: unknown = JSON.parse(raw);
		if (!parsed || typeof parsed !== 'object') return { ...DEFAULT_SETTINGS };
		return { ...DEFAULT_SETTINGS, ...(parsed as Partial<FlySettings>) };
	} catch {
		return { ...DEFAULT_SETTINGS };
	}
}

export function saveSettings(settings: FlySettings, storage: StorageLike | null = browserStorage()): void {
	if (!storage) return;
	try {
		storage.setItem(STORAGE_KEY, JSON.stringify(settings));
	} catch {
		// quota exceeded or storage blocked after all - the setting simply won't survive a reload this time
	}
}

/** Reads, merges `patch` in, writes back, and returns the merged settings - the usual "change one toggle" shape. */
export function updateSettings(patch: Partial<FlySettings>, storage: StorageLike | null = browserStorage()): FlySettings {
	const next = { ...loadSettings(storage), ...patch };
	saveSettings(next, storage);
	return next;
}

/** `prefers-reduced-motion` only applies when the preference is 'auto'; 'on'/'off' are an explicit override. */
export function resolveReducedMotion(pref: FlySettings['reducedMotion']): boolean {
	if (pref === 'on') return true;
	if (pref === 'off') return false;
	try {
		return typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
	} catch {
		return false;
	}
}
