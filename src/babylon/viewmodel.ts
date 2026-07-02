// ══════════════════════════════════════════════
// HOLLOWMERE first-person WEAPON VIEWMODEL. Shows the equipped weapon (Seed3D
// GLB) in the lower-right of the view, parented to the camera, and plays a
// procedural attack animation per weapon — dagger stab, pistol/flare recoil +
// muzzle flash (the meshes are static, so this is all transform-driven).
// ══════════════════════════════════════════════

import { Color3, DynamicTexture, Mesh, MeshBuilder, PointLight, Scene, TransformNode, UniversalCamera, Vector3 } from '@babylonjs/core';
import { createStandardMaterial, loadGlbModel } from './helpers';
import { ASSET_KEYS } from './config';
import { ASSETS } from '../assets';

export type WeaponKind = 'dagger' | 'pistol' | 'flare' | 'rifle' | 'cannon';

export interface WeaponView {
  setWeapon(w: WeaponKind): void;
  attack(w: WeaponKind): void;
  update(dt: number, moving: boolean): void;
  debugBaseRot(x: number, y: number, z: number): void; // DEV: retained for weapon-orientation tuning
  debugScale(s: number): void; // DEV
  dispose(): void;
}

const REST = new Vector3(0.34, -0.32, 0.92); // camera-local: right / down / forward

interface WModel {
  root: TransformNode;
  baseRot: Vector3;
  baseScale: number;
}

export function createWeaponView(scene: Scene, camera: UniversalCamera): WeaponView {
  const holder = new TransformNode('vm-holder', scene);
  holder.parent = camera;
  holder.position.copyFrom(REST);

  // muzzle flash: a brief light + a glowing quad at the barrel
  const muzzle = new PointLight('vm-muzzle', new Vector3(0.34, -0.18, 1.6), scene);
  muzzle.parent = camera;
  muzzle.diffuse = new Color3(1, 0.82, 0.45);
  muzzle.intensity = 0;
  muzzle.range = 9;
  const flashMat = createStandardMaterial(scene, 'vm-flash', new Color3(1, 0.85, 0.5), new Color3(1, 0.8, 0.4));
  const flash = MeshBuilder.CreatePlane('vm-flash', { size: 0.34 }, scene);
  flash.material = flashMat;
  flash.parent = holder;
  flash.position.set(0.02, 0.06, 0.5);
  flash.setEnabled(false);

  // the FLARE burns: a sustained, flickering, camera-facing SOFT glow at the muzzle
  const flameTex = new DynamicTexture('vm-flame-tex', 64, scene, false);
  {
    const ctx = flameTex.getContext() as CanvasRenderingContext2D;
    const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    g.addColorStop(0, 'rgba(255,244,210,1)');
    g.addColorStop(0.4, 'rgba(255,150,40,0.85)');
    g.addColorStop(1, 'rgba(255,70,10,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 64, 64);
    flameTex.hasAlpha = true;
    flameTex.update();
  }
  const flameMat = createStandardMaterial(scene, 'vm-flame', new Color3(0, 0, 0), new Color3(1, 1, 1));
  flameMat.emissiveTexture = flameTex;
  flameMat.opacityTexture = flameTex;
  flameMat.disableLighting = true;
  flameMat.backFaceCulling = false;
  const flame = MeshBuilder.CreatePlane('vm-flame', { size: 0.6 }, scene);
  flame.material = flameMat;
  flame.parent = holder;
  flame.position.set(0.06, 0.13, 0.66);
  flame.billboardMode = Mesh.BILLBOARDMODE_ALL; // always face the camera → reads as a round flame
  flame.setEnabled(false);

  const models = {} as Record<WeaponKind, WModel>;
  const make = (w: WeaponKind, assetKey: string, scale: number, baseRot: Vector3, fbW: number, fbH: number, fbD: number) => {
    const root = new TransformNode(`vm-${w}`, scene);
    root.parent = holder;
    root.rotation.copyFrom(baseRot);
    const fb = MeshBuilder.CreateBox(`vmfb-${w}`, { width: fbW, height: fbH, depth: fbD }, scene);
    fb.material = createStandardMaterial(scene, `vmfb-mat-${w}`, new Color3(0.32, 0.31, 0.34));
    fb.parent = root;
    const url = ASSETS[assetKey];
    if (url) {
      void loadGlbModel(scene, url, `vm-${w}`).then((loaded) => {
        if (!loaded) return;
        const { min, max } = loaded.root.getHierarchyBoundingVectors(true);
        const ext = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) || 1;
        const s = scale / ext;
        loaded.root.scaling.setAll(s);
        loaded.root.position.set(-(min.x + max.x) / 2 * s, -(min.y + max.y) / 2 * s, -(min.z + max.z) / 2 * s);
        loaded.root.parent = root;
        fb.setEnabled(false);
      });
    }
    root.setEnabled(false);
    models[w] = { root, baseRot, baseScale: scale };
  };

  // dagger GLB imports at an awkward axis; this orientation grips the hilt at the
  // hand (lower-right) with the blade angled up into the scene, broad side to camera.
  make('dagger', ASSET_KEYS.props.dagger, 0.42, new Vector3(Math.PI - 0.5, Math.PI / 2 + 0.3, 0), 0.06, 0.06, 0.42);
  // firearm GLBs need a ±90° yaw to aim the barrel downrange (receding into the
  // scene) with the grip at the hand. Most import barrel-along +X (→ +90°), but
  // the flare-gun GLB is mirrored (barrel along -X → -90°). Tuned per-model.
  // Each GLB's barrel sits on a different native axis, so the barrel must be
  // pitched/yawed to RECEDE into the scene (aim downrange at the crosshair),
  // not just laid side-on. Pistol/flare/cannon import barrel-UP → pitch -1.25
  // + slight yaw toward centre; the rifle imports barrel-RIGHT → yaw -90°.
  make('pistol', ASSET_KEYS.props.pistol, 0.42, new Vector3(-1.25, -0.5, 0), 0.08, 0.14, 0.34);
  make('flare', ASSET_KEYS.props.flareGun, 0.42, new Vector3(-1.25, -0.5, 0), 0.09, 0.14, 0.3);
  make('rifle', ASSET_KEYS.props.leverRifle, 0.6, new Vector3(0, -Math.PI / 2, 0), 0.07, 0.1, 0.6);
  make('cannon', ASSET_KEYS.props.handCannon, 0.46, new Vector3(-1.25, -0.5, 0), 0.1, 0.16, 0.4);

  let cur: WeaponKind = 'dagger';
  models.dagger.root.setEnabled(true);

  let atkT = 0;
  let atkDur = 0.3;
  let atkKind: WeaponKind = 'dagger';
  let bobT = 0;
  let burnT = 0; // flare flame burn timer

  return {
    setWeapon(w) {
      if (w === cur || !models[w]) return;
      models[cur].root.setEnabled(false);
      cur = w;
      models[w].root.setEnabled(true);
    },
    attack(w) {
      atkKind = w;
      atkDur = w === 'dagger' ? 0.34 : 0.26;
      atkT = atkDur;
      if (w === 'flare') {
        // the flare IGNITES and burns for a beat — sustained flame, not a flash
        burnT = 1.6;
        flame.setEnabled(true);
        muzzle.diffuse.set(1, 0.5, 0.15);
        muzzle.intensity = 3.4;
      } else if (w !== 'dagger') {
        muzzle.diffuse.set(1, 0.82, 0.45);
        muzzle.intensity = 2.6;
        flash.setEnabled(true);
        flash.rotation.z = (bobT * 13) % Math.PI; // vary the flash each shot
      }
    },
    update(dt, moving) {
      bobT += dt * (moving ? 9 : 2.6);
      const bob = Math.sin(bobT) * (moving ? 0.022 : 0.007);
      const sway = Math.cos(bobT * 0.5) * (moving ? 0.012 : 0.004);

      holder.position.set(REST.x + sway, REST.y + bob, REST.z);

      const m = models[cur];
      let dz = 0;
      let dy = 0;
      let drx = 0;
      if (atkT > 0) {
        atkT = Math.max(0, atkT - dt);
        const p = 1 - atkT / atkDur; // 0..1 progress
        if (atkKind === 'dagger') {
          const s = Math.sin(p * Math.PI); // out-and-back thrust
          dz = s * 0.55;
          dy = -s * 0.18;
          drx = -s * 1.15;
        } else {
          const k = Math.sin(Math.min(1, p * 3.2) * Math.PI * 0.5) * (1 - p); // sharp kick, quick settle
          dz = -k * 0.26;
          dy = k * 0.14;
          drx = -k * 0.9;
        }
      }
      // muzzle light + effect: flare BURNS (flickering flame), guns FLASH (quick)
      if (burnT > 0) {
        burnT -= dt;
        const fl = 0.85 + Math.sin(bobT * 47) * 0.28 + Math.sin(bobT * 29) * 0.18; // flicker
        flame.scaling.setAll(Math.max(0.35, fl));
        flame.rotation.z = bobT * 6;
        muzzle.intensity = 3.0 * (0.72 + Math.sin(bobT * 40) * 0.28);
        if (burnT <= 0) {
          flame.setEnabled(false);
          muzzle.intensity = 0;
        }
      } else if (flash.isEnabled()) {
        muzzle.intensity = Math.max(0, muzzle.intensity - dt * 28);
        if (muzzle.intensity <= 0.02) flash.setEnabled(false);
      }
      m.root.position.set(0, dy, dz);
      m.root.rotation.set(m.baseRot.x + drx, m.baseRot.y, m.baseRot.z);
    },
    debugBaseRot(x, y, z) {
      models[cur].baseRot.set(x, y, z);
      models[cur].root.rotation.set(x, y, z);
    },
    debugScale(s) {
      holder.scaling.setAll(s);
    },
    dispose() {
      muzzle.dispose();
      flash.dispose(false, true);
      (Object.keys(models) as WeaponKind[]).forEach((k) => models[k].root.dispose(false, true));
      holder.dispose(false, true);
    },
  };
}
