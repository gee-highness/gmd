import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { CHASE_OFFSET, CameraRig, FIRST_PERSON_FOV, PILOT_EYE, THIRD_PERSON_FOV, chaseTarget, firstPersonPose, yawOnly } from './camera';

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const Q = new THREE.Quaternion();
const yaw = (deg: number) => new THREE.Quaternion().setFromAxisAngle(v(0, 1, 0), (deg * Math.PI) / 180);

describe('first person', () => {
	it('puts the eye at the pilot seat, transformed by the ship pose', () => {
		const p = firstPersonPose(v(100, 50, -20), Q);
		expect(p.pos.distanceTo(v(100, 50, -20).add(PILOT_EYE))).toBeLessThan(1e-9);
		const q = yaw(90);
		const p2 = firstPersonPose(v(0, 0, 0), q);
		expect(p2.pos.distanceTo(PILOT_EYE.clone().applyQuaternion(q))).toBeLessThan(1e-9);
	});
	it('looks along the ship nose (+X) with the ship up as camera up', () => {
		const p = firstPersonPose(v(), Q);
		const look = v(0, 0, -1).applyQuaternion(p.quat);
		expect(look.distanceTo(v(1, 0, 0))).toBeLessThan(1e-9);
		expect(v(0, 1, 0).applyQuaternion(p.quat).distanceTo(v(0, 1, 0))).toBeLessThan(1e-9);
	});
	it('rolls with the ship (the horizon tilts in first person)', () => {
		const roll = new THREE.Quaternion().setFromAxisAngle(v(1, 0, 0), 0.5);
		const p = firstPersonPose(v(), roll);
		expect(v(0, 1, 0).applyQuaternion(p.quat).z).toBeGreaterThan(0.4);
	});
});

describe('third person', () => {
	it('targets a point behind and above the heading, ignoring roll and pitch', () => {
		const tilted = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.6, 0.0, 0.4));
		const t = chaseTarget(v(10, 5, 0), tilted);
		expect(t.y).toBeCloseTo(5 + CHASE_OFFSET.y, 6);
		expect(yawOnly(tilted).angleTo(Q)).toBeLessThan(0.05 + Math.abs(0.4));
		const turned = chaseTarget(v(0, 0, 0), yaw(90)); // ship faces −Z after +90° yaw, so "behind" is +Z
		expect(turned.z).toBeGreaterThan(10);
	});
	it('settles on the target when the ship is at rest', () => {
		const rig = new CameraRig('third');
		const pos = v(0, 3, 0);
		for (let i = 0; i < 400; i++) rig.update(1 / 60, pos, Q, v());
		expect(rig.pose.pos.distanceTo(chaseTarget(pos, Q))).toBeLessThan(0.05);
		expect(rig.fov).toBeCloseTo(THIRD_PERSON_FOV, 3);
	});
	it('lags behind a fast-moving ship rather than snapping to it', () => {
		const rig = new CameraRig('third');
		const pos = v(0, 3, 0);
		for (let i = 0; i < 120; i++) rig.update(1 / 60, pos, Q, v());
		const sep0 = rig.pose.pos.distanceTo(chaseTarget(pos, Q));
		for (let i = 0; i < 30; i++) { pos.x += 1.0; rig.update(1 / 60, pos, Q, v(60, 0, 0)); }
		expect(rig.pose.pos.distanceTo(chaseTarget(pos, Q))).toBeGreaterThan(sep0 + 0.3);
	});
	it('never dips below the ship', () => {
		const rig = new CameraRig('third');
		rig.update(1 / 60, v(0, 0, 0), Q, v());
		expect(rig.pose.pos.y).toBeGreaterThanOrEqual(1.2 - 1e-9);
	});
});

describe('switching views', () => {
	it('blends smoothly with no jump at the start and arrives at first person', () => {
		const rig = new CameraRig('third');
		const pos = v(0, 3, 0);
		for (let i = 0; i < 200; i++) rig.update(1 / 60, pos, Q, v());
		const before = rig.pose.pos.clone();
		rig.setMode('first');
		rig.update(1 / 600, pos, Q, v());
		expect(rig.pose.pos.distanceTo(before)).toBeLessThan(0.05);
		for (let i = 0; i < 120; i++) rig.update(1 / 60, pos, Q, v());
		expect(rig.pose.pos.distanceTo(firstPersonPose(pos, Q).pos)).toBeLessThan(0.02);
		expect(rig.fov).toBeCloseTo(FIRST_PERSON_FOV, 1);
	});
	it('cuts instantly under reduced motion', () => {
		const rig = new CameraRig('third', { reducedMotion: true });
		const pos = v(0, 3, 0);
		for (let i = 0; i < 100; i++) rig.update(1 / 60, pos, Q, v());
		rig.setMode('first');
		rig.update(1 / 60, pos, Q, v());
		expect(rig.pose.pos.distanceTo(firstPersonPose(pos, Q).pos)).toBeLessThan(1e-6);
	});
});

describe('head lean (acceleration-driven)', () => {
	const settle = (rig: CameraRig, a: number) => {
		const pos = v(0, 3, 0), vel = v();
		for (let i = 0; i < 90; i++) { vel.x += a / 60; rig.update(1 / 60, pos, Q, vel.clone()); }
		return rig.pose.pos.clone().sub(firstPersonPose(pos, Q).pos).length();
	};
	it('moves the head with acceleration and is zero at rest', () => {
		expect(settle(new CameraRig('first'), 0)).toBeLessThan(1e-6);
		expect(settle(new CameraRig('first'), 15)).toBeGreaterThan(0.01);
	});
	it('is switched off by reduced motion and by comfort 0', () => {
		expect(settle(new CameraRig('first', { reducedMotion: true }), 15)).toBeLessThan(1e-6);
		expect(settle(new CameraRig('first', { comfort: 0 }), 15)).toBeLessThan(1e-6);
	});
});

describe('chase camera at speed', () => {
	it('does not lag further behind a fast ship: the steady-state offset equals the rest offset', () => {
		const rig = new CameraRig('third');
		const q = new THREE.Quaternion(), vel = new THREE.Vector3(120, 0, 0), pos = new THREE.Vector3();
		for (let i = 0; i < 600; i++) { pos.addScaledVector(vel, 1 / 60); rig.update(1 / 60, pos, q, vel); }
		const rest = chaseTarget(pos, q).distanceTo(pos);
		expect(rig.pose.pos.distanceTo(pos)).toBeLessThan(rest * 1.15 + 1);
	});
});

describe('chase heading while climbing vertically', () => {
	it('keeps a sensible heading when the nose points straight up (no flip to a fixed direction)', () => {
		// heading east (+X) then pitched up 88°: the camera heading must still be east, for the rig to sit behind (west of) the ship
		const q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (88 * Math.PI) / 180);
		const f = new THREE.Vector3(1, 0, 0).applyQuaternion(yawOnly(q));
		expect(f.x).toBeGreaterThan(0.99);
		// and pointing 88° up while heading north (−Z)
		const qn = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), (88 * Math.PI) / 180));
		const fn = new THREE.Vector3(1, 0, 0).applyQuaternion(yawOnly(qn));
		expect(fn.z).toBeLessThan(-0.99);
	});
});

describe('turbulence shake (docs/plan-fly-game-ux.md §4)', () => {
	// Settle the chase spring first so position changes below are the shake, not the spring still catching up.
	const settled = (rig: CameraRig, pos: THREE.Vector3, q: THREE.Quaternion, vel: THREE.Vector3, qPa = 0, gForce = 1) => {
		for (let i = 0; i < 300; i++) rig.update(1 / 60, pos, q, vel, qPa, gForce);
	};

	it('omitting qPa/gForce (every pre-existing call site) gives a perfectly smooth camera, unchanged from before', () => {
		const rig = new CameraRig('third');
		const pos = v(), q = new THREE.Quaternion(), vel = v();
		settled(rig, pos, q, vel);
		const p1 = rig.pose.pos.clone();
		rig.update(1 / 60, pos, q, vel);
		const p2 = rig.pose.pos.clone();
		expect(p1.distanceTo(p2)).toBeLessThan(1e-9);
	});
	it('high dynamic pressure or g produces a real, moving (non-zero, non-constant) position offset', () => {
		const rig = new CameraRig('third');
		const pos = v(), q = new THREE.Quaternion(), vel = v();
		settled(rig, pos, q, vel, 50000, 1);
		const p1 = rig.pose.pos.clone();
		rig.update(1 / 60, pos, q, vel, 50000, 1);
		const p2 = rig.pose.pos.clone();
		expect(p1.distanceTo(p2)).toBeGreaterThan(0); // moving, not a static offset
		expect(p1.distanceTo(chaseTarget(pos, q))).toBeGreaterThan(1e-4); // actually displaced from the unshaken target
	});
	it('is zero under reduced motion even with high q/g', () => {
		const rig = new CameraRig('third', { reducedMotion: true });
		const pos = v(), q = new THREE.Quaternion(), vel = v();
		settled(rig, pos, q, vel, 80000, 3);
		const p1 = rig.pose.pos.clone();
		rig.update(1 / 60, pos, q, vel, 80000, 3);
		expect(p1.distanceTo(rig.pose.pos)).toBeLessThan(1e-9);
	});
	it('scales down with the comfort factor, and is zero at comfort 0', () => {
		const low = new CameraRig('third', { comfort: 0.1 });
		const pos = v(), q = new THREE.Quaternion(), vel = v();
		settled(low, pos, q, vel, 80000, 3);
		const lowAmp = low.pose.pos.distanceTo(chaseTarget(pos, q));
		const off = new CameraRig('third', { comfort: 0 });
		settled(off, pos, q, vel, 80000, 3);
		expect(off.pose.pos.distanceTo(chaseTarget(pos, q))).toBeLessThan(1e-9);
		expect(lowAmp).toBeGreaterThan(0);
	});
});
