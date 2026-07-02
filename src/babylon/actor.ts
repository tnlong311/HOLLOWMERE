// ══════════════════════════════════════════════
// HOLLOWMERE player — FIRST-PERSON courier. The "actor" is an eye anchor +
// yaw/pitch; it drives the UniversalCamera (position = eye, rotation =
// look). Move is yaw-relative (joystick / WASD); look is pointer-drag
// (input.drag). No visible body (first person).
// ══════════════════════════════════════════════

import { Scene, TransformNode, UniversalCamera, Vector3 } from '@babylonjs/core';
import type { Input } from '@rezona/core/3d';
import { TUNING, type RoomId } from './config';
import { controls } from './controls';
import type { GameWorldObjects } from './world';

export interface ActorMoveContext {
  input?: Input;
  camera: UniversalCamera;
  world: GameWorldObjects;
  roomId: RoomId;
  deltaSeconds: number;
  frozen: boolean;
  sprint?: boolean; // move at sprint speed this frame (director gates on stamina)
}

export interface PlayerActor {
  node: TransformNode;
  readonly position: Vector3;
  readonly facingYaw: number;
  readonly moving: boolean;
  teleport(world: GameWorldObjects, roomId: RoomId, lx: number, lz: number, faceYaw: number): void;
  update(ctx: ActorMoveContext): void;
  addShake(amount: number): void; // impulse the view-shake (a hit landed)
  dispose(): void;
}

export function createPlayerActor(scene: Scene): PlayerActor {
  // LLM-EXTENSION:ACTOR — the first-person player (the courier). Eye anchor +
  // yaw/pitch driving the camera; move + look feedback live here.
  // DO NOT REMOVE the LLM-EXTENSION:ACTOR tag — templates/3d/scripts/check-architecture.mjs requires it to appear exactly once across the src tree.
  const node = new TransformNode('courier-eye', scene);
  node.position.set(0, 0, 7);

  let yaw = Math.PI;
  let pitch = 0;
  let moving = false;
  // pointer-drag look is cumulative offset from drag-start; track the delta.
  let prevDX = 0;
  let prevDY = 0;
  let dragging = false;
  let bobT = 0;
  let shake = 0; // decaying view-shake magnitude (spiked by addShake on hits)
  let shakeT = 0;

  return {
    node,
    get position() {
      return node.position;
    },
    get facingYaw() {
      return yaw;
    },
    get moving() {
      return moving;
    },
    teleport(world, roomId, lx, lz, faceYaw) {
      const c = world.roomCenter(roomId);
      node.position.set(c.x + lx, c.y, c.z + lz);
      yaw = faceYaw;
      pitch = 0;
      prevDX = 0;
      prevDY = 0;
      dragging = false;
    },
    update({ input, camera, world, roomId, deltaSeconds, frozen, sprint }) {
      // ── look: mouse (pointer-lock, desktop) ──
      const mouse = controls.consumeLook();
      if (mouse.dx !== 0 || mouse.dy !== 0) {
        yaw += mouse.dx * TUNING.mouseSensitivity;
        pitch += mouse.dy * TUNING.mouseSensitivity;
        if (pitch > TUNING.pitchClamp) pitch = TUNING.pitchClamp;
        if (pitch < -TUNING.pitchClamp) pitch = -TUNING.pitchClamp;
      }

      // ── look: touch drag (mobile) ──
      const drag = input?.drag ?? null;
      if (drag) {
        if (!dragging) {
          dragging = true;
          prevDX = drag.dx;
          prevDY = drag.dy;
        }
        yaw += (drag.dx - prevDX) * TUNING.lookSensitivity;
        pitch += (drag.dy - prevDY) * TUNING.lookSensitivity;
        if (pitch > TUNING.pitchClamp) pitch = TUNING.pitchClamp;
        if (pitch < -TUNING.pitchClamp) pitch = -TUNING.pitchClamp;
        prevDX = drag.dx;
        prevDY = drag.dy;
      } else {
        dragging = false;
      }

      // ── move (yaw-relative) ──
      const dx = input?.dir.x ?? 0;
      const dy = input?.dir.y ?? 0;
      const mag = Math.hypot(dx, dy);
      moving = !frozen && mag > 0.08;
      if (moving) {
        const sinY = Math.sin(yaw);
        const cosY = Math.cos(yaw);
        // forward = (sinY, cosY), right = (cosY, -sinY); W (dir.y<0) walks forward
        const mvx = sinY * -dy + cosY * dx;
        const mvz = cosY * -dy - sinY * dx;
        const len = Math.hypot(mvx, mvz) || 1;
        const speed = (sprint ? TUNING.sprintSpeed : TUNING.walkSpeed) * Math.min(1, mag);
        node.position.x += (mvx / len) * speed * deltaSeconds;
        node.position.z += (mvz / len) * speed * deltaSeconds;
        bobT += deltaSeconds * (sprint ? 13 : 9);
      }
      world.clampToRoom(roomId, node.position);

      // ── drive the camera (eye + head-bob + stair climb + hit-shake) ──
      const bob = moving ? Math.sin(bobT) * 0.045 : 0;
      const stairY = world.stairEyeOffset(roomId, node.position);
      // view-shake: fast decaying jitter on the eye + a roll kick when hit
      let shX = 0, shY = 0, shRoll = 0;
      if (shake > 0.001) {
        shakeT += deltaSeconds * 42;
        shake = Math.max(0, shake - deltaSeconds * 2.6);
        shX = Math.sin(shakeT * 1.7) * shake * 0.06;
        shY = Math.sin(shakeT * 2.3) * shake * 0.05;
        shRoll = Math.sin(shakeT) * shake * 0.05;
      }
      camera.position.set(node.position.x + shX, TUNING.eyeHeight + bob + stairY + shY, node.position.z);
      camera.rotation.set(pitch, yaw, shRoll);
    },
    addShake(amount) {
      shake = Math.min(1.4, shake + amount);
    },
    dispose() {
      node.dispose(false, true);
    },
  };
}
