// src/lib/fly/audio.ts
// Engine, wind and touchdown sound for /fly (docs/plan-fly-game-ux.md §5): the sim had no audio at all before this.
// Per the physicality charter's rule 1, every sound is driven by a real simulated quantity (throttle/thrust
// fraction, airspeed, the real touchdown impact speed) - never a fixed loop or a hand-set timer.
//
// Split in two: the DSP parameter curves below are pure functions, unit-tested without a browser or Web Audio;
// `FlightAudio` is the thin, browser-only orchestration (oscillators, gain nodes, filters) that calls them each
// frame. Constructing `FlightAudio` where `AudioContext` doesn't exist (SSR, a browser without Web Audio) is a
// silent no-op - every method guards on `this.ctx` being set.

/** Engine note frequency (Hz): idles low, rises with thrust - never silent at zero thrust (a real idle hum). */
export function engineFrequency(thrustFraction: number): number {
	return 70 + 150 * Math.max(0, Math.min(1, thrustFraction));
}

/** Engine gain (0..1 linear, before the master/mute multiplier): a small idle floor plus a thrust-proportional rise. */
export function engineGain(thrustFraction: number): number {
	const f = Math.max(0, Math.min(1, thrustFraction));
	return 0.05 + 0.35 * f;
}

/** Wind noise gain: silent at a standstill, ramps up with airspeed, capped (a jet doesn't get infinitely loud). */
export function windGain(speedMs: number): number {
	return Math.min(0.5, speedMs / 300);
}

/** Wind noise filter cutoff (Hz): a dull rumble at low speed, a bright hiss at high speed. */
export function windCutoffHz(speedMs: number): number {
	return 200 + Math.min(4000, speedMs * 8);
}

/** Touchdown thump gain (0..1), scaled by how hard the impact was relative to the gear's own rated sink rate. */
export function impactGain(impactSpeedMs: number, maxVzMs: number): number {
	return Math.min(1, 0.3 + 0.7 * (impactSpeedMs / Math.max(0.1, maxVzMs)));
}

/** Touchdown thump pitch (Hz): a harder impact reads as a lower, heavier thud, not a higher one. */
export function impactFrequency(impactSpeedMs: number, maxVzMs: number): number {
	const severity = Math.min(1, impactSpeedMs / Math.max(0.1, maxVzMs));
	return 160 - 90 * severity;
}

export interface AudioUpdate {
	/** 0..1, how hard the engines are working right now (hover + main thrust over their rated max). */
	thrustFraction: number;
	speedMs: number;
	muted: boolean;
	/** 0..1 master volume. */
	master: number;
}

/** True if the active tab is backgrounded/hidden - used to drop gains to zero rather than running silent oscillators forever off-screen. */
const isHidden = () => typeof document !== 'undefined' && document.hidden;

export class FlightAudio {
	private ctx: AudioContext | null = null;
	private master: GainNode | null = null;
	private engineOsc: OscillatorNode | null = null;
	private engineGainNode: GainNode | null = null;
	private windSource: AudioBufferSourceNode | null = null;
	private windGainNode: GainNode | null = null;
	private windFilter: BiquadFilterNode | null = null;
	private disposed = false;

	constructor() {
		const AC = typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined;
		if (!AC) return; // no Web Audio here (SSR, or a browser that lacks it) - every method below is then a no-op
		try {
			this.ctx = new AC();
			this.master = this.ctx.createGain();
			this.master.gain.value = 0;
			this.master.connect(this.ctx.destination);

			this.engineOsc = this.ctx.createOscillator();
			this.engineOsc.type = 'sawtooth';
			this.engineGainNode = this.ctx.createGain();
			this.engineGainNode.gain.value = 0;
			this.engineOsc.connect(this.engineGainNode).connect(this.master);
			this.engineOsc.start();

			// Looping filtered noise for wind: a short buffer of random samples, looped - cheap and has no audible seam at this length.
			const noiseLen = Math.floor(this.ctx.sampleRate * 2);
			const buf = this.ctx.createBuffer(1, noiseLen, this.ctx.sampleRate);
			const data = buf.getChannelData(0);
			for (let i = 0; i < noiseLen; i++) data[i] = Math.random() * 2 - 1;
			this.windSource = this.ctx.createBufferSource();
			this.windSource.buffer = buf;
			this.windSource.loop = true;
			this.windFilter = this.ctx.createBiquadFilter();
			this.windFilter.type = 'lowpass';
			this.windGainNode = this.ctx.createGain();
			this.windGainNode.gain.value = 0;
			this.windSource.connect(this.windFilter).connect(this.windGainNode).connect(this.master);
			this.windSource.start();
		} catch {
			this.ctx = null; // Web Audio exists but construction failed for some reason - degrade to silent, never throw into the render loop
		}
	}

	/** Browsers suspend a context created without a user gesture; call this from inside a real click/keydown handler. */
	resume(): void {
		if (this.ctx && this.ctx.state === 'suspended') void this.ctx.resume().catch(() => {});
	}

	/** Call every HUD tick (not every frame - the engine note doesn't need 60 Hz updates, and this avoids scheduling a param ramp per frame). */
	update(u: AudioUpdate): void {
		if (!this.ctx || this.disposed) return;
		const now = this.ctx.currentTime;
		const masterTarget = u.muted || isHidden() ? 0 : Math.max(0, Math.min(1, u.master));
		this.master!.gain.setTargetAtTime(masterTarget, now, 0.3);
		this.engineOsc!.frequency.setTargetAtTime(engineFrequency(u.thrustFraction), now, 0.15);
		this.engineGainNode!.gain.setTargetAtTime(engineGain(u.thrustFraction), now, 0.2);
		this.windGainNode!.gain.setTargetAtTime(windGain(u.speedMs), now, 0.3);
		this.windFilter!.frequency.setTargetAtTime(windCutoffHz(u.speedMs), now, 0.3);
	}

	/** A short impact thump, keyed to the real touchdown speed (docs/fly/09-physicality-charter.md rule 1 again: not a stock "landing sound" clip). */
	touchdown(impactSpeedMs: number, maxVzMs: number): void {
		if (!this.ctx || this.disposed) return;
		try {
			const now = this.ctx.currentTime;
			const osc = this.ctx.createOscillator();
			const gain = this.ctx.createGain();
			osc.type = 'triangle';
			osc.frequency.value = impactFrequency(impactSpeedMs, maxVzMs);
			const g = impactGain(impactSpeedMs, maxVzMs);
			gain.gain.setValueAtTime(0, now);
			gain.gain.linearRampToValueAtTime(g, now + 0.01);
			gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
			osc.connect(gain).connect(this.master!);
			osc.start(now);
			osc.stop(now + 0.4);
		} catch { /* a failed one-shot sound is never worth interrupting flight for */ }
	}

	dispose(): void {
		if (this.disposed) return;
		this.disposed = true;
		try { this.engineOsc?.stop(); } catch { /* already stopped */ }
		try { this.windSource?.stop(); } catch { /* already stopped */ }
		void this.ctx?.close().catch(() => {});
		this.ctx = null;
	}
}
