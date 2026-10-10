// src/lib/fly/camera.ts
// Camera rigs for flying the Kestrel: first person (through the bubble, from the pilot's eyes) and third person (a spring-damped chase camera),
// with a smooth blend between them. Pure maths on three.js vectors, so it is unit-tested without a renderer.
//
// Physical driver rule (docs/fly/09 §8): the first-person head leans with the ship's acceleration through a damped spring, scaled by a comfort
// factor and switched off under reduced motion; nothing is shaken by a timer.

import * as THREE from 'three';

export type ViewMode = 'first' | 'third';

/** The pilot's eye in ship coordinates: the left seat (z = +0.42) inside the bubble, head height. See kestrel.ts (cockpit at 3.4, 0.45). */
export const PILOT_EYE = new THREE.Vector3(1.98, 0.6, 0.36);
export const FIRST_PERSON_FOV = 78;
export const THIRD_PERSON_FOV = 55;

/** Chase offset in the ship's yaw frame: behind and above (metres). */
export const CHASE_OFFSET = new THREE.Vector3(-13.5, 4.6, 0);

export interface Pose { pos: THREE.Vector3; quat: THREE.Quaternion }

const smoothstep = (t: number) => { const x = Math.min(1, Math.max(0, t)); return x * x * (3 - 2 * x); };

/** Heading-only rotation (yaw about world up) of a ship orientation, so the chase camera ignores roll and pitch. */
export function yawOnly(q: THREE.Quaternion): THREE.Quaternion {
	const f = new THREE.Vector3(1, 0, 0).applyQuaternion(q);
	const h = new THREE.Vector3(f.x, 0, f.z);
	if (h.lengthSq() < 0.25) {
		// The nose is within ~30° of vertical (a climb to space): the heading is read from the belly instead, which points aft when the nose is up.
		const u = new THREE.Vector3(0, 1, 0).applyQuaternion(q);
		h.set(u.x, 0, u.z);
		if (f.y > 0) h.negate();
	}
	if (h.lengthSq() < 1e-6) return new THREE.Quaternion();
	h.normalize();
	return new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(1, 0, 0), h);
}

/** First-person pose: the eye position in the world and an orientation matching the ship (camera looks along ship +X, up = ship +Y). */
export function firstPersonPose(shipPos: THREE.Vector3, shipQuat: THREE.Quaternion, lean = new THREE.Vector3()): Pose {
	const local = PILOT_EYE.clone().add(lean);
	const pos = local.applyQuaternion(shipQuat).add(shipPos);
	// three's camera looks down −Z with +Y up; the ship looks down +X. Rotate by −90° about Y to align them.
	const quat = shipQuat.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2));
	return { pos, quat };
}

/** Where the chase camera wants to be: behind and above the ship's heading. */
export function chaseTarget(shipPos: THREE.Vector3, shipQuat: THREE.Quaternion): THREE.Vector3 {
	return CHASE_OFFSET.clone().applyQuaternion(yawOnly(shipQuat)).add(shipPos);
}

function lookAtQuat(from: THREE.Vector3, at: THREE.Vector3): THREE.Quaternion {
	const m = new THREE.Matrix4().lookAt(from, at, new THREE.Vector3(0, 1, 0));
	return new THREE.Quaternion().setFromRotationMatrix(m);
}

export interface RigOptions { comfort?: number; reducedMotion?: boolean }

/** Owns the camera state: mode, blend between modes, chase spring and the head-lean spring. */
export class CameraRig {
	mode: ViewMode;
	private blend = 1;
	private from: Pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };
	private chasePos = new THREE.Vector3();
	private chaseVel = new THREE.Vector3();
	private lean = new THREE.Vector3();
	private leanVel = new THREE.Vector3();
	private prevVel = new THREE.Vector3();
	private started = false;
	private shakeT = 0;
	fov = THIRD_PERSON_FOV;
	/** 0…1 intensity of acceleration-driven head motion; 0 disables it. */
	comfort: number;
	reducedMotion: boolean;
	readonly pose: Pose = { pos: new THREE.Vector3(), quat: new THREE.Quaternion() };

	constructor(mode: ViewMode = 'third', opts: RigOptions = {}) { this.mode = mode; this.comfort = opts.comfort ?? 1; this.reducedMotion = opts.reducedMotion ?? false; this.fov = mode === 'first' ? FIRST_PERSON_FOV : THIRD_PERSON_FOV; }

	/** Re-base: the world origin moved, so every stored world position moves with it. */
	shift(v: THREE.Vector3) { this.chasePos.add(v); this.from.pos.add(v); this.pose.pos.add(v); }
	/** Forget the springs (after a teleport) so the camera starts exactly on its target. */
	snap() { this.started = false; this.blend = 1; this.lean.set(0, 0, 0); this.leanVel.set(0, 0, 0); this.chaseVel.set(0, 0, 0); }

	setMode(m: ViewMode) {
		if (m === this.mode) return;
		this.from = { pos: this.pose.pos.clone(), quat: this.pose.quat.clone() };
		this.mode = m;
		this.blend = this.reducedMotion ? 1 : 0; // reduced motion: cut instead of gliding
	}

	/**
	 * Advance by dt seconds given the ship's pose and velocity; the result is in `this.pose` and `this.fov`.
	 * `qPa` (dynamic pressure, Pa) and `gForce` (felt g, docs/fly/09 physicality charter rule 1 again) are optional -
	 * omit them for no turbulence shake (both callers that don't have that telemetry handy, and every existing test,
	 * keep working with a perfectly smooth camera, which is what they already expect).
	 */
	update(dt: number, shipPos: THREE.Vector3, shipQuat: THREE.Quaternion, shipVel: THREE.Vector3, qPa = 0, gForce = 1) {
		const d = Math.min(0.1, Math.max(0, dt));
		// Chase camera: critically damped spring toward the target (ω = 3.2 rad/s ⇒ ~0.4 s lag).
		const target = chaseTarget(shipPos, shipQuat);
		if (!this.started) { this.chasePos.copy(target); this.started = true; this.prevVel.copy(shipVel); }
		const w = 3.2;
		// Track the ship's velocity too (not only its position), so the camera does not trail further behind the faster the ship goes.
		const acc = target.clone().sub(this.chasePos).multiplyScalar(w * w).addScaledVector(this.chaseVel.clone().sub(shipVel), -2 * w);
		this.chaseVel.addScaledVector(acc, d); this.chasePos.addScaledVector(this.chaseVel, d);
		// Keep the chase camera above the ship's feet so it never dips under a landing pad.
		this.chasePos.y = Math.max(this.chasePos.y, shipPos.y + 1.2);

		// Head lean from acceleration, expressed in the ship frame (damped spring, ω = 9 rad/s, ζ ≈ 0.8).
		const a = shipVel.clone().sub(this.prevVel).divideScalar(Math.max(d, 1e-4));
		this.prevVel.copy(shipVel);
		const aLocal = a.applyQuaternion(shipQuat.clone().invert());
		const lim = (v: number, m: number) => Math.max(-m, Math.min(m, v));
		const leanTarget = this.reducedMotion || this.comfort <= 0 ? new THREE.Vector3() : new THREE.Vector3(-lim(aLocal.x, 20) * 0.006, -lim(aLocal.y - 0, 20) * 0.004, -lim(aLocal.z, 20) * 0.006).multiplyScalar(this.comfort);
		const wl = 9;
		const la = leanTarget.sub(this.lean).multiplyScalar(wl * wl).addScaledVector(this.leanVel, -2 * 0.8 * wl);
		this.leanVel.addScaledVector(la, d); this.lean.addScaledVector(this.leanVel, d);

		const goal: Pose = this.mode === 'first'
			? firstPersonPose(shipPos, shipQuat, this.lean)
			: { pos: this.chasePos.clone(), quat: lookAtQuat(this.chasePos, shipPos.clone().add(new THREE.Vector3(5, 0.9, 0).applyQuaternion(yawOnly(shipQuat)))) };
		const goalFov = this.mode === 'first' ? FIRST_PERSON_FOV : THIRD_PERSON_FOV;
		if (this.blend < 1) {
			this.blend = Math.min(1, this.blend + d / 0.7);
			const t = smoothstep(this.blend);
			this.pose.pos.copy(this.from.pos).lerp(goal.pos, t);
			this.pose.quat.copy(this.from.quat).slerp(goal.quat, t);
			this.fov += (goalFov - this.fov) * Math.min(1, d * 6);
		} else {
			this.pose.pos.copy(goal.pos); this.pose.quat.copy(goal.quat); this.fov = goalFov;
		}

		// Turbulence shake: a small positional jitter from real dynamic pressure and excess g (above a normal 1.2 g
		// manoeuvring margin) - never a flat/constant wobble. Two incommensurate sine terms per axis stand in for
		// noise without needing a noise library; applied last, after the blend, so it never fights the mode-switch
		// or the lean spring above.
		this.shakeT += d;
		if (!this.reducedMotion && this.comfort > 0) {
			const excessG = Math.max(0, gForce - 1.2);
			const amp = this.comfort * (Math.min(0.03, qPa / 300000) + Math.min(0.02, excessG * 0.006));
			if (amp > 1e-5) {
				const n = (f: number, p: number) => Math.sin(this.shakeT * f + p) + 0.5 * Math.sin(this.shakeT * f * 2.7 + p * 1.3);
				this.pose.pos.x += n(23, 0) * amp;
				this.pose.pos.y += n(19, 1.7) * amp;
				this.pose.pos.z += n(17, 3.1) * amp;
			}
		}
	}
}
