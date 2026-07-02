// ══════════════════════════════════════════════
// Babylon runtime entry point — unique owner of Engine / Scene / runRenderLoop
// / resize / dispose. Per-frame work is delegated to the HOLLOWMERE director.
// ══════════════════════════════════════════════

import '@babylonjs/core/Physics/joinedPhysicsEngineComponent';
import HavokPhysics from '@babylonjs/havok';
import { Engine, Scene, Vector3 } from '@babylonjs/core';
import { HavokPlugin } from '@babylonjs/core/Physics/v2/Plugins/havokPlugin';
import type { GameRuntimeContext } from '../App';
import { createPlayerActor } from './actor';
import { createGameAudio } from './audio';
import { attachKeyboard, attachMouse } from './controls';
import { createDirector } from './director';
import { configureHardwareScaling, glbLoadStats } from './helpers';
import { RUNTIME_CONFIG } from './config';
import { createSceneEntities } from './entities';
import { createItemField } from './items';
import { resetGameStore, setGameSnapshot } from './store';
import { createGameWorld } from './world';
import { createWeaponView } from './viewmodel';

export interface GameRuntimeHandle {
  dispose(): void;
}

const GRAVITY = new Vector3(0, RUNTIME_CONFIG.physics.gravityY, 0);

async function enableHavokPhysics(scene: Scene): Promise<boolean> {
  try {
    const havok = await HavokPhysics();
    const plugin = new HavokPlugin(true, havok);
    return scene.enablePhysics(GRAVITY, plugin);
  } catch (error) {
    console.warn('[babylon] Havok physics unavailable; continuing without physics.', error);
    return false;
  }
}

export function startGame(canvas: HTMLCanvasElement, runtimeContext?: GameRuntimeContext): GameRuntimeHandle {
  let disposed = false;
  let lastTime = 0;

  resetGameStore();

  const audio = createGameAudio();
  const engine = new Engine(canvas, RUNTIME_CONFIG.engine.antialias, {
    preserveDrawingBuffer: RUNTIME_CONFIG.engine.preserveDrawingBuffer,
    stencil: RUNTIME_CONFIG.engine.stencil,
    adaptToDeviceRatio: RUNTIME_CONFIG.engine.adaptToDeviceRatio,
  });
  configureHardwareScaling(engine);

  const scene = new Scene(engine);
  // Perf: we never pick on pointer-move, and materials are effectively static
  // once built — skip both per-frame costs across the whole (mesh-heavy) scene.
  scene.skipPointerMovePicking = true;
  scene.blockMaterialDirtyMechanism = true;

  const world = createGameWorld(scene, canvas);
  const actor = createPlayerActor(scene);
  const entities = createSceneEntities(scene);
  const items = createItemField(scene);
  const weaponView = createWeaponView(scene, world.camera);

  const director = createDirector({
    world,
    actor,
    entities,
    items,
    audio,
    weaponView,
    getInput: () => runtimeContext?.input,
  });

  // apply editor pixel knobs from config schema each tick? push once at start; cheap.
  const applyPixelConfig = () => {
    const cfg = runtimeContext?.configRef.current;
    if (cfg) world.setPixelParams(cfg.pixelSize ?? 3, cfg.posterizeLevels ?? 14, cfg.ditherAmount ?? 0.55);
  };
  applyPixelConfig();

  const detachKeyboard = attachKeyboard();
  const detachMouse = attachMouse(canvas);

  const onResize = () => engine.resize();
  window.addEventListener('resize', onResize);

  // Preload gate: hold the loading screen until BOTH physics is up AND every GLB
  // has finished decoding, so nothing pops in after you enter. All loadGlbModel
  // calls fire synchronously during the creators above, so glbLoadStats().started
  // is already the final total by the first render frame.
  let physicsReady = false;
  let physicsEnabled = false;
  let preloadDone = false;
  void enableHavokPhysics(scene).then((enabled) => {
    if (disposed) return;
    physicsEnabled = enabled;
    physicsReady = true;
    setGameSnapshot({ physicsEnabled });
  });
  const pumpPreload = () => {
    if (preloadDone) return;
    const { started, inFlight } = glbLoadStats();
    // scene.isReady() gates on SHADER COMPILATION + texture readiness for the
    // active room — decoding the GLBs isn't enough; without this the first render
    // after entering hitches for seconds while materials compile. Cap the bar at
    // 96% until the scene is truly render-ready so the wait is honest.
    const decoded = started === 0 ? 0 : (started - inFlight) / started;
    const sceneReady = inFlight === 0 && scene.isReady();
    const prog = Math.min(decoded * 0.96, sceneReady ? 1 : 0.96);
    setGameSnapshot({ loadProgress: prog, message: `Preloading the estate… ${Math.round(prog * 100)}%` });
    if (physicsReady && started > 0 && sceneReady) {
      preloadDone = true;
      setGameSnapshot({ ready: true, loadProgress: 1, message: physicsEnabled ? 'ready' : 'ready (physics degraded)' });
    }
  };

  // DEV step driver (rAF is throttled headless) — drive frames + inspect state.
  const dev = {
    ...director.dev,
    tick(dt = 0.05) {
      director.tick(dt);
      scene.render();
    },
    run(frames = 1, dt = 0.05) {
      for (let i = 0; i < frames; i += 1) {
        director.tick(dt);
      }
      scene.render();
    },
    vmrot(x: number, y: number, z: number) { weaponView.debugBaseRot(x, y, z); scene.render(); },
    vmscale(s: number) { weaponView.debugScale(s); scene.render(); },
  };
  (window as unknown as { __hm?: typeof dev }).__hm = dev;

  engine.runRenderLoop(() => {
    if (disposed) return;
    const now = performance.now();
    const dt = Math.min((now - (lastTime || now)) / 1000, 0.05);
    lastTime = now;

    if (!preloadDone) pumpPreload();

    if (runtimeContext?.phaseRef.current !== 'ACTIVE') {
      scene.render();
      return;
    }

    applyPixelConfig();
    director.tick(dt);
    scene.render();
  });

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      detachKeyboard();
      detachMouse();
      delete (window as unknown as { __hm?: unknown }).__hm;
      window.removeEventListener('resize', onResize);
      engine.stopRenderLoop();
      director.dispose();
      weaponView.dispose();
      items.dispose();
      entities.dispose();
      actor.dispose();
      world.dispose();
      audio.dispose();
      scene.disablePhysicsEngine();
      scene.dispose();
      engine.dispose();
    },
  };
}
