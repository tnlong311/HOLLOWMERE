// ══════════════════════════════════════════════
// HOLLOWMERE blood/ichor hit FX. A single pooled ParticleSystem that emits a
// short burst at a hit point — dark arterial red for flesh, sickly green ichor
// for the fungal bosses. Created ONCE (texture + system), re-aimed per hit via
// manualEmitCount so there is no per-hit allocation.
// ══════════════════════════════════════════════

import { Color4, DynamicTexture, ParticleSystem, Scene, Texture, Vector3 } from '@babylonjs/core';

export type SprayKind = 'blood' | 'ichor';

export interface BloodFx {
  burst(at: Vector3, dir: Vector3, kind: SprayKind): void;
  dispose(): void;
}

// palettes: [core, edge, dead]
const PALETTE: Record<SprayKind, [Color4, Color4, Color4]> = {
  blood: [new Color4(0.5, 0.02, 0.03, 1), new Color4(0.28, 0.0, 0.0, 1), new Color4(0.08, 0.0, 0.0, 0)],
  ichor: [new Color4(0.55, 0.78, 0.2, 1), new Color4(0.3, 0.5, 0.12, 1), new Color4(0.08, 0.14, 0.03, 0)],
};

function makeSplatTexture(scene: Scene): DynamicTexture {
  const size = 64;
  const tex = new DynamicTexture('blood-splat', size, scene, false);
  const ctx = tex.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  tex.hasAlpha = true;
  tex.update();
  return tex;
}

export function createBloodFx(scene: Scene): BloodFx {
  const emitter = new Vector3(0, 1, 0);
  const tex = makeSplatTexture(scene);

  const ps = new ParticleSystem('blood-fx', 260, scene);
  ps.particleTexture = tex;
  ps.emitter = emitter;
  ps.minEmitBox = new Vector3(-0.08, -0.08, -0.08);
  ps.maxEmitBox = new Vector3(0.08, 0.08, 0.08);
  ps.minSize = 0.08;
  ps.maxSize = 0.34;
  ps.minLifeTime = 0.25;
  ps.maxLifeTime = 0.7;
  ps.emitRate = 0; // burst-only, driven by manualEmitCount
  ps.blendMode = ParticleSystem.BLENDMODE_STANDARD;
  ps.gravity = new Vector3(0, -13, 0);
  ps.minEmitPower = 2.2;
  ps.maxEmitPower = 6.5;
  ps.updateSpeed = 0.016;
  ps.direction1 = new Vector3(-0.6, 0.2, -0.6);
  ps.direction2 = new Vector3(0.6, 1.0, 0.6);
  ps.textureMask = new Color4(1, 1, 1, 1);
  ps.color1 = PALETTE.blood[0];
  ps.color2 = PALETTE.blood[1];
  ps.colorDead = PALETTE.blood[2];
  ps.start();

  return {
    burst(at, dir, kind) {
      const pal = PALETTE[kind];
      ps.color1 = pal[0];
      ps.color2 = pal[1];
      ps.colorDead = pal[2];
      // aim the spray back toward the attacker (dir points from player→enemy,
      // so blood sprays the opposite way, up and outward)
      const bx = -dir.x;
      const bz = -dir.z;
      ps.direction1 = new Vector3(bx - 0.5, 0.25, bz - 0.5);
      ps.direction2 = new Vector3(bx + 0.5, 1.1, bz + 0.5);
      emitter.copyFrom(at);
      ps.manualEmitCount = kind === 'ichor' ? 40 : 26;
    },
    dispose() {
      ps.dispose();
      tex.dispose();
    },
  };
}
