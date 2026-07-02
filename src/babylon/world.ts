// ══════════════════════════════════════════════
// HOLLOWMERE world: dark fogged scene, fixed cinematic camera, the
// "realistic-3D-crushed-to-pixel" post-process, the in-engine room shells
// dressed with generated GLB set-pieces, per-wing palette, player lantern.
// ══════════════════════════════════════════════

import {
  Color3,
  Color4,
  Effect,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  PointLight,
  PostProcess,
  Scene,
  SpotLight,
  StandardMaterial,
  Texture,
  TransformNode,
  UniversalCamera,
  Vector3,
} from '@babylonjs/core';
import { createStandardMaterial, loadGlbModel } from './helpers';
import { ASSET_KEYS, PIXEL, ROOMS, RUNTIME_CONFIG, TUNING, WING_TINT, type RoomDef, type RoomExit, type RoomId } from './config';
import { ASSETS } from '../assets';

const EYE_HEIGHT = TUNING.eyeHeight;

export interface RoomBlocker {
  x: number;
  z: number;
  hw: number;
  hd: number;
}

// A walkable staircase: a footprint the player can enter, whose floor ramps
// (baseY→topY along local z) so the eye climbs, and which auto-transitions to
// `exitId` once the player passes `trigAt` toward the top.
interface StairZone {
  cx: number;
  cz: number;
  hw: number;
  hd: number;
  axis: 'x' | 'z'; // which local axis the ramp climbs / the top-trigger reads
  lo: number; // local axis coord mapped to baseY
  hi: number; // local axis coord mapped to topY
  baseY: number;
  topY: number;
  trigAt: number; // local axis threshold to fire the transition
  trigDir: 1 | -1; // fire when (localAxis - trigAt) * trigDir >= 0
  exitId: string;
  // flat zones (baseY === topY) fire the moment you enter the footprint — a
  // plain walk-through doorway; ramped zones fire only at the top of the climb.
}

interface RoomRuntime {
  def: RoomDef;
  node: TransformNode;
  blockers: RoomBlocker[];
  stairs: StairZone[];
}

export interface GameWorldObjects {
  camera: UniversalCamera;
  hemiLight: HemisphericLight;
  ground: Mesh;
  activeRoom: RoomId;
  setActiveRoom(id: RoomId): void;
  roomCenter(id: RoomId): Vector3;
  localToWorld(id: RoomId, lx: number, lz: number, out: Vector3): Vector3;
  clampToRoom(id: RoomId, out: Vector3): void;
  addBlocker(id: RoomId, b: RoomBlocker): void;
  setStewardProximity(v: number): void;
  setHealthFactor(v: number): void; // 0 dead .. 1 full
  stairEyeOffset(id: RoomId, pos: Vector3): number; // extra eye height while on a stair
  stairTrigger(id: RoomId, pos: Vector3): string | null; // exitId if at the top of a walkable stair
  setPixelParams(pixel: number, levels: number, dither: number): void;
  setBrightness(v: number): void; // player gamma calibration
  toggleFlashlight(): boolean; // returns new on/off state
  setFlashlight(on: boolean): void;
  setFlashlightHealth(frac: number): void; // 0..1 battery — drives dying-cell flicker
  flashlightOn(): boolean;
  update(dt: number, lanternTarget: Vector3): void;
  dispose(): void;
}

// ── module-scope scratch (no hot-path allocation) ──
const SCRATCH_C = new Vector3();
const HEMI_DIR = new Vector3(0, 1, 0);
const WALL_MARGIN = 0.55;

let shaderRegistered = false;
function registerCrushShader(): void {
  if (shaderRegistered) return;
  shaderRegistered = true;
  Effect.ShadersStore['hmCrushFragmentShader'] = `
    precision highp float;
    varying vec2 vUV;
    uniform sampler2D textureSampler;
    uniform vec2 uRes;
    uniform float uPixel;
    uniform float uLevels;
    uniform float uDither;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uTime;
    uniform float uHealth;   // 1 full .. 0 dead
    uniform float uSteward;  // 0..1 proximity -> chromatic aberration
    uniform vec3  uTint;
    uniform float uBright;   // player brightness/gamma calibration

    float bayer4(vec2 p){
      int x = int(mod(p.x,4.0));
      int y = int(mod(p.y,4.0));
      int i = x + y*4;
      float m[16];
      m[0]=0.0;m[1]=8.0;m[2]=2.0;m[3]=10.0;
      m[4]=12.0;m[5]=4.0;m[6]=14.0;m[7]=6.0;
      m[8]=3.0;m[9]=11.0;m[10]=1.0;m[11]=9.0;
      m[12]=15.0;m[13]=7.0;m[14]=13.0;m[15]=5.0;
      float v=0.0;
      for(int k=0;k<16;k++){ if(k==i) v=m[k]; }
      return (v/16.0)-0.5;
    }
    float hash(vec2 p){ return fract(sin(dot(p,vec2(41.3,289.1)))*43758.5453); }

    void main(){
      // pixelate: snap to a low-res grid
      vec2 grid = max(uRes/uPixel, vec2(1.0));
      vec2 puv = (floor(vUV*grid)+0.5)/grid;

      float ca = uSteward*0.004;
      vec3 col;
      col.r = texture2D(textureSampler, puv+vec2(ca,0.0)).r;
      col.g = texture2D(textureSampler, puv).g;
      col.b = texture2D(textureSampler, puv-vec2(ca,0.0)).b;

      // per-wing palette tint + player brightness calibration
      col *= uTint;
      col = pow(col, vec3(1.0 / uBright)); // gamma lift for dark displays (uBright>1 brightens shadows)

      // health LUT: desaturate + push red as health falls
      float lum = dot(col, vec3(0.299,0.587,0.114));
      float drain = 1.0 - uHealth;
      col = mix(col, vec3(lum), drain*0.55);
      col.r = mix(col.r, min(1.0, col.r+0.12), drain*0.6);
      col.gb *= (1.0 - drain*0.25);

      // ordered dither then posterize -> limited palette
      vec2 pix = floor(vUV*grid);
      col += bayer4(pix)*uDither*(1.0/uLevels);
      col = floor(col*uLevels + 0.5)/uLevels;

      // grain
      float g = (hash(pix+floor(uTime*24.0))-0.5)*uGrain;
      col += g;

      // vignette
      vec2 d = vUV-0.5;
      float vig = 1.0 - dot(d,d)*uVignette*2.2;
      col *= clamp(vig,0.0,1.0);

      gl_FragColor = vec4(clamp(col,0.0,1.0),1.0);
    }
  `;
}

// Apply a generated seamless texture as the material's diffuse map, tiled by
// uScale/vScale. No-ops safely if the asset key hasn't been generated yet, so
// the game still renders (solid colour) before/without the texture pass.
function applyTex(mat: StandardMaterial, key: string, uScale: number, vScale: number, tint = 0.95): void {
  const url = ASSETS[key];
  if (!url) return;
  const t = new Texture(url, mat.getScene());
  t.uScale = uScale;
  t.vScale = vScale;
  mat.diffuseTexture = t;
  mat.diffuseColor = new Color3(tint, tint, tint); // texture carries the colour; post-process adds the wing tint
}

// Per-wing surface texture keys: [wall, floor, ceiling].
const WING_TEX: Record<string, [string, string, string]> = {
  manor: ['tex_manor_wall', 'tex_red_carpet', 'tex_dark_plaster'],
  save: ['tex_manor_wall', 'tex_red_carpet', 'tex_dark_plaster'],
  rot: ['tex_rot_moss', 'tex_gothic_stone', 'tex_dark_plaster'],
  cellar: ['tex_wet_brick', 'tex_wet_brick', 'tex_dark_plaster'],
  chapel: ['tex_chapel_stone', 'tex_chapel_stone', 'tex_dark_plaster'],
  lab: ['tex_lab_tile', 'tex_lab_tile', 'tex_lab_tile'],
  storm: ['tex_gothic_stone', 'tex_gothic_stone', 'tex_dark_plaster'],
};

function buildRoomShell(scene: Scene, def: RoomDef): RoomRuntime {
  const node = new TransformNode(`room_${def.id}`, scene);
  node.position.set(def.center[0], def.center[1], def.center[2]);
  const [w, d] = def.size;

  const wt = WING_TEX[def.wing] ?? WING_TEX.manor;
  const floorMat = createStandardMaterial(scene, `floor_${def.id}`, new Color3(0.26, 0.22, 0.18));
  floorMat.specularColor = new Color3(0.05, 0.05, 0.05);
  applyTex(floorMat, wt[1], w / 5, d / 5, 0.92);
  const floor = MeshBuilder.CreateGround(`floor_${def.id}`, { width: w, height: d }, scene);
  floor.material = floorMat;
  floor.parent = node;
  floor.receiveShadows = true;

  const wallMat = createStandardMaterial(scene, `wall_${def.id}`, new Color3(0.22, 0.19, 0.2));
  applyTex(wallMat, wt[0], 3, 2, 0.88);
  const ceilMat = createStandardMaterial(scene, `ceil_${def.id}`, new Color3(0.09, 0.085, 0.1));
  applyTex(ceilMat, wt[2], 3, 3, 0.7);
  // First-person: full-height enclosed rooms (walls + ceiling) built in-engine.
  const H = 4.2;
  const wall = (name: string, ww: number, dd: number, x: number, z: number) => {
    const m = MeshBuilder.CreateBox(`${name}_${def.id}`, { width: ww, height: H, depth: dd }, scene);
    m.material = wallMat;
    m.position.set(x, H / 2, z);
    m.parent = node;
  };
  wall('wn', w, 0.4, 0, -d / 2);
  wall('ws', w, 0.4, 0, d / 2);
  wall('we', 0.4, d, w / 2, 0);
  wall('ww', 0.4, d, -w / 2, 0);
  const ceil = MeshBuilder.CreateBox(`ceil_${def.id}`, { width: w, height: 0.3, depth: d }, scene);
  ceil.material = ceilMat;
  ceil.position.set(0, H, 0);
  ceil.parent = node;

  node.setEnabled(false);
  return { def, node, blockers: [], stairs: [] };
}

// A clearly-visible doorway at each room exit: a warm-glowing stone frame +
// a dark ajar door panel + a brass knob, so the way out reads from across the
// room. Visual only (the player passes through the opening; transition is the
// USE prompt). No blocker.
function placeDoor(scene: Scene, node: TransformNode, def: RoomDef, exit: RoomExit, idx: number): void {
  if (exit.noFrame) return; // stairs / hatches / sliding tombs get no door frame
  const [w, d] = def.size;
  const onZWall = Math.abs(exit.at[1]) > Math.abs(exit.at[0]);
  const frameMat = createStandardMaterial(scene, `door_frame_${def.id}_${idx}`, new Color3(0.52, 0.42, 0.28), new Color3(0.34, 0.2, 0.07));
  const panelMat = createStandardMaterial(scene, `door_panel_${def.id}_${idx}`, new Color3(0.17, 0.1, 0.06));
  const knobMat = createStandardMaterial(scene, `door_knob_${def.id}_${idx}`, new Color3(0.85, 0.62, 0.22), new Color3(0.5, 0.35, 0.1));
  const OPEN = 2.4;
  const DH = 3.4;
  const T = 0.35;
  const mk = (ww: number, hh: number, dd: number, x: number, y: number, z: number, m: typeof frameMat) => {
    const b = MeshBuilder.CreateBox(`door_${def.id}_${idx}_${x.toFixed(1)}_${z.toFixed(1)}`, { width: ww, height: hh, depth: dd }, scene);
    b.material = m;
    b.position.set(x, y, z);
    b.parent = node;
  };
  if (onZWall) {
    const inward = exit.at[1] > 0 ? -1 : 1;
    const z = exit.at[1] > 0 ? d / 2 - 0.25 : -d / 2 + 0.25;
    const x = exit.at[0];
    mk(T, DH, 0.5, x - OPEN / 2, DH / 2, z, frameMat);
    mk(T, DH, 0.5, x + OPEN / 2, DH / 2, z, frameMat);
    mk(OPEN + T, T, 0.5, x, DH, z, frameMat);
    mk(OPEN - 0.2, DH - 0.3, 0.16, x, (DH - 0.3) / 2, z + inward * 0.18, panelMat);
    mk(0.2, 0.2, 0.2, x + OPEN / 2 - 0.45, 1.5, z + inward * 0.28, knobMat);
  } else {
    const inward = exit.at[0] > 0 ? -1 : 1;
    const x = exit.at[0] > 0 ? w / 2 - 0.25 : -w / 2 + 0.25;
    const z = exit.at[1];
    mk(0.5, DH, T, x, DH / 2, z - OPEN / 2, frameMat);
    mk(0.5, DH, T, x, DH / 2, z + OPEN / 2, frameMat);
    mk(0.5, T, OPEN + T, x, DH, z, frameMat);
    mk(0.16, DH - 0.3, OPEN - 0.2, x + inward * 0.18, (DH - 0.3) / 2, z, panelMat);
    mk(0.2, 0.2, 0.2, x + inward * 0.28, 1.5, z + OPEN / 2 - 0.45, knobMat);
  }
}

// In-engine gothic set-dressing so rooms read as lived-in, abandoned spaces
// (the FP build has no GLB backdrops). Columns, wainscoting, ceiling beams,
// wall paintings, rugs, many sconces, floor debris + a per-room centerpiece.
// All ADDED clutter is visual-only (flush to walls / overhead / flat on floor)
// so it never introduces collision; only the few big columns/centerpieces add
// blockers, placed clear of doors + item pickups.
function decorateRoom(scene: Scene, rt: RoomRuntime): void {
  const { node, def } = rt;
  const [w, d] = def.size;
  const H = 4.2;
  let nid = 0;
  const stone = createStandardMaterial(scene, `dec_stone_${def.id}`, new Color3(0.27, 0.25, 0.26));
  stone.specularColor = new Color3(0.16, 0.16, 0.18);
  applyTex(stone, 'tex_gothic_stone', 1.5, 1.5, 0.9);
  const marble = createStandardMaterial(scene, `dec_marble_${def.id}`, new Color3(0.4, 0.38, 0.41));
  marble.specularColor = new Color3(0.5, 0.5, 0.56);
  applyTex(marble, 'tex_veined_marble', 1, 2, 0.95);
  const wood = createStandardMaterial(scene, `dec_wood_${def.id}`, new Color3(0.19, 0.12, 0.07));
  wood.specularColor = new Color3(0.12, 0.08, 0.05);
  applyTex(wood, 'tex_dark_wood', 2, 1, 0.9);
  const fabric = createStandardMaterial(scene, `dec_fabric_${def.id}`, new Color3(0.32, 0.1, 0.1));
  applyTex(fabric, 'tex_red_carpet', 2, 2, 0.9);
  const gilt = createStandardMaterial(scene, `dec_gilt_${def.id}`, new Color3(0.2, 0.16, 0.11), new Color3(0.1, 0.075, 0.035));
  gilt.specularColor = new Color3(0.26, 0.21, 0.1);
  const canvasMat = createStandardMaterial(scene, `dec_canvas_${def.id}`, new Color3(0.11, 0.08, 0.07)); // dark painted portrait surface
  const sconceMat = createStandardMaterial(scene, `dec_sconce_${def.id}`, new Color3(0.95, 0.6, 0.25), new Color3(1.0, 0.55, 0.18));

  const box = (ww: number, hh: number, dd: number, x: number, y: number, z: number, m: typeof stone) => {
    const b = MeshBuilder.CreateBox(`dec${nid++}_${def.id}`, { width: ww, height: hh, depth: dd }, scene);
    b.material = m;
    b.position.set(x, y, z);
    b.parent = node;
    return b;
  };
  // fluted classical column: plinth base → tapered marble shaft → capital
  const column = (x: number, z: number, block = true) => {
    box(0.98, 0.36, 0.98, x, 0.18, z, stone); // plinth base
    box(0.82, 0.14, 0.82, x, 0.43, z, stone); // torus-ish base ring (boxed)
    const shaft = MeshBuilder.CreateCylinder(`col${nid++}_${def.id}`, { diameterTop: 0.58, diameterBottom: 0.72, height: H - 1.0, tessellation: 24 }, scene);
    shaft.material = marble;
    shaft.position.set(x, (H - 1.0) / 2 + 0.5, z);
    shaft.parent = node;
    box(0.78, 0.16, 0.78, x, H - 0.58, z, stone); // capital neck
    box(0.98, 0.24, 0.98, x, H - 0.4, z, stone); // capital abacus
    if (block) rt.blockers.push({ x, z, hw: 0.5, hd: 0.5 });
  };
  const sconce = (x: number, z: number) => box(0.22, 0.34, 0.22, x, 2.7, z, sconceMat);
  // a framed painting flush against a wall ('n'/'s'/'e'/'w'), centred at coord t
  // gilt frame with a dark inset canvas (so it reads as a portrait, not a slab)
  const painting = (wall: 'n' | 's' | 'e' | 'w', t: number, ww = 1.3, hh = 1.7) => {
    if (wall === 'n') {
      box(ww, hh, 0.12, t, 2.3, -d / 2 + 0.35, gilt);
      box(ww - 0.28, hh - 0.28, 0.06, t, 2.3, -d / 2 + 0.43, canvasMat);
    } else if (wall === 's') {
      box(ww, hh, 0.12, t, 2.3, d / 2 - 0.35, gilt);
      box(ww - 0.28, hh - 0.28, 0.06, t, 2.3, d / 2 - 0.43, canvasMat);
    } else if (wall === 'e') {
      box(0.12, hh, ww, w / 2 - 0.35, 2.3, t, gilt);
      box(0.06, hh - 0.28, ww - 0.28, w / 2 - 0.43, 2.3, t, canvasMat);
    } else {
      box(0.12, hh, ww, -w / 2 + 0.35, 2.3, t, gilt);
      box(0.06, hh - 0.28, ww - 0.28, -w / 2 + 0.43, 2.3, t, canvasMat);
    }
  };

  // corner columns (blockers)
  const cx = w / 2 - 1.1;
  const cz = d / 2 - 1.1;
  column(cx, cz); column(-cx, cz); column(cx, -cz); column(-cx, -cz);

  // wainscot trim around the base of every wall (visual)
  box(w, 0.7, 0.25, 0, 0.35, -d / 2 + 0.2, wood);
  box(w, 0.7, 0.25, 0, 0.35, d / 2 - 0.2, wood);
  box(0.25, 0.7, d, w / 2 - 0.2, 0.35, 0, wood);
  box(0.25, 0.7, d, -w / 2 + 0.2, 0.35, 0, wood);

  // gilt crown molding at the wall/ceiling join (visual)
  box(w, 0.32, 0.34, 0, H - 0.5, -d / 2 + 0.22, gilt);
  box(w, 0.32, 0.34, 0, H - 0.5, d / 2 - 0.22, gilt);
  box(0.34, 0.32, d, w / 2 - 0.22, H - 0.5, 0, gilt);
  box(0.34, 0.32, d, -w / 2 + 0.22, H - 0.5, 0, gilt);

  // coffered ceiling: a grid of recessed beams both ways (visual, overhead)
  for (let i = -1; i <= 1; i++) box(w, 0.3, 0.4, 0, H - 0.18, (i * d) / 3.2, wood);
  for (let j = -1; j <= 1; j++) box(0.4, 0.3, d, (j * w) / 3.2, H - 0.18, 0, wood);

  // shallow pilasters framing the long side walls (visual, flush to wall)
  for (let i = -1; i <= 1; i += 2) {
    box(0.3, H - 1.1, 0.55, w / 2 - 0.22, (H - 1.1) / 2 + 0.4, (i * d) / 4, stone);
    box(0.3, H - 1.1, 0.55, -w / 2 + 0.22, (H - 1.1) / 2 + 0.4, (i * d) / 4, stone);
  }

  // central rug + marble inlay — only in carpeted living spaces; a red Victorian
  // rug reads wrong on cellar brick / lab tile / conservatory rot, so skip those.
  const carpeted = def.wing === 'manor' || def.wing === 'save' || def.wing === 'chapel';
  if (carpeted) {
    const rw = Math.min(w - 3, 7);
    const rd = Math.min(d - 3, 9);
    box(rw + 1.3, 0.03, rd + 1.3, 0, 0.015, 0, marble);
    box(rw, 0.04, rd, 0, 0.025, 0, fabric);
  }

  // many sconces along the long walls (visual light read)
  for (let i = -1; i <= 1; i++) {
    sconce(w / 2 - 0.35, (i * d) / 3.2);
    sconce(-w / 2 + 0.35, (i * d) / 3.2);
  }

  // wall paintings (visual) — keep off the door-bearing wall midpoints
  painting('e', -d / 4); painting('e', d / 4);
  painting('w', -d / 4); painting('w', d / 4);

  // scattered floor debris (visual, tiny + flat — stepped over)
  box(0.5, 0.25, 0.5, cx - 1.4, 0.12, -cz + 1.2, wood);
  box(0.7, 0.3, 0.4, -cx + 1.6, 0.15, cz - 1.0, stone);

  // ── arched wall niches with statuary (tucked in the back corners; visual) ──
  const statue = (x: number, z: number, faceIn: number) => {
    box(1.0, 0.5, 1.0, x, 0.25, z, stone); // pedestal
    // arched niche recess on the wall behind (dark inset + rounded arch head)
    box(1.5, 2.6, 0.14, x, 1.3, z + faceIn * -0.42, gilt); // recess frame
    box(1.15, 2.2, 0.1, x, 1.1, z + faceIn * -0.36, stone); // dark recess back
    const arch = MeshBuilder.CreateCylinder(`niche_arch_${nid++}_${def.id}`, { diameter: 1.15, height: 0.14, tessellation: 16, arc: 0.5 }, scene);
    arch.material = gilt;
    arch.rotation.set(Math.PI / 2, 0, 0);
    arch.position.set(x, 2.25, z + faceIn * -0.42);
    arch.parent = node;
    // the figure: robed body → shoulders → head
    const bodyS = MeshBuilder.CreateCylinder(`statue_b_${nid++}_${def.id}`, { diameterTop: 0.3, diameterBottom: 0.52, height: 1.5, tessellation: 12 }, scene);
    bodyS.material = marble;
    bodyS.position.set(x, 1.25, z);
    bodyS.parent = node;
    box(0.92, 0.22, 0.36, x, 1.65, z, marble); // shoulders
    const head = MeshBuilder.CreateSphere(`statue_h_${nid++}_${def.id}`, { diameter: 0.42, segments: 10 }, scene);
    head.material = marble;
    head.position.set(x, 1.95, z);
    head.parent = node;
  };
  // Only in grand manor-style rooms with a CLEAR back wall — flush to the wall,
  // inset from the corner columns. Skips rooms with a back-wall door, small
  // rooms, and non-manor wings (a marble saint in a lab/cellar reads wrong, and
  // corner placement used to clip the columns / doorways).
  const backExit = def.exits.some((e) => e.at[1] < -d / 2 + 5);
  const manorish = def.wing === 'manor' || def.wing === 'save' || def.wing === 'chapel';
  if (manorish && w >= 14 && d >= 12 && !backExit) {
    statue(-w / 2 + 2.6, -d / 2 + 1.1, 1);
    statue(w / 2 - 2.6, -d / 2 + 1.1, 1);
  }

  // ── cobwebs strung across the upper corners (translucent, visual) ──
  const webMat = createStandardMaterial(scene, `dec_web_${def.id}`, new Color3(0.7, 0.72, 0.75), new Color3(0.16, 0.17, 0.19));
  webMat.alpha = 0.2;
  webMat.backFaceCulling = false;
  const web = (x: number, z: number) => {
    const p = MeshBuilder.CreatePlane(`web_${nid++}_${def.id}`, { size: 1.7 }, scene);
    p.material = webMat;
    p.rotation.set(Math.PI / 2, Math.PI / 4, 0); // lie flat under the ceiling, corner-facing
    p.position.set(x, H - 0.35, z);
    p.parent = node;
  };
  web(w / 2 - 0.9, d / 2 - 0.9);
  web(-w / 2 + 0.9, d / 2 - 0.9);
  web(w / 2 - 0.9, -d / 2 + 0.9);
  web(-w / 2 + 0.9, -d / 2 + 0.9);

  // ── window light shafts: faint warm god-rays slanting from high on the side
  // walls to the floor (unlit translucent slabs; purely atmospheric) ──
  const shaftMat = createStandardMaterial(scene, `dec_shaft_${def.id}`, new Color3(0.95, 0.8, 0.5), new Color3(0.6, 0.48, 0.24));
  shaftMat.alpha = 0.055;
  shaftMat.backFaceCulling = false;
  shaftMat.disableLighting = true;
  const shaft = (x: number, z: number, rz: number) => {
    const s = MeshBuilder.CreateBox(`shaft_${nid++}_${def.id}`, { width: 0.6, height: 4.0, depth: 0.05 }, scene);
    s.material = shaftMat;
    s.position.set(x, 2.1, z);
    s.rotation.z = rz;
    s.parent = node;
  };
  // hug the side walls, small tilt — reads as high-window light striking the floor
  shaft(w / 2 - 0.8, -d / 4, 0.22);
  shaft(-w / 2 + 0.8, d / 4, -0.22);

  // per-room centerpiece
  if (def.id === 'hall') {
    // grand staircase ascending to a landing against the back wall, topped by a
    // dark upper archway — reads as a real stair up to the (sealed) upper floor,
    // instead of steps climbing into a blank wall. Offset LEFT (corridor door x0
    // + Crest Door x5.5 stay clear).
    // dark, but NOT pure-black: it must catch the flashlight so it reads as a
    // recessed passage into shadow, not a flat black hole punched in the wall.
    const upDark = createStandardMaterial(scene, `hall_updark_${def.id}`, new Color3(0.18, 0.17, 0.21), new Color3(0.05, 0.05, 0.07));
    // gentle flight rising to a low landing so a FULL-height doorway fits under
    // the 4.2m ceiling (a taller flight squashed the arch — the "cut-in-half" look).
    for (let i = 0; i <= 5; i++) {
      const h = 0.4 + i * 0.22; // 0.40 .. 1.50 — rises toward the back wall
      box(5, h, 1.0, -4, h / 2, -d / 2 + 5.4 - i * 0.9, stone);
    }
    box(5, 0.3, 1.9, -4, 1.55, -d / 2 + 0.95, stone); // top landing (~y1.7 surface), flush to wall
    // WALKABLE: no blocker — the eye ramps up the flight and auto-transitions at
    // the top, so the player simply walks up (no USE prompt / no scripted climb).
    rt.stairs.push({ cx: -4, cz: -d / 2 + 3.0, hw: 2.5, hd: 2.6, axis: 'z', lo: -d / 2 + 5.4, hi: -d / 2 + 1.4, baseY: 0, topY: 1.55, trigAt: -d / 2 + 2.2, trigDir: -1, exitId: 'hall_to_landing' });
    box(0.42, 1.3, 0.42, -6.4, 0.65, -d / 2 + 5.4, wood); // newel posts at the foot
    box(0.42, 1.3, 0.42, -1.6, 0.65, -d / 2 + 5.4, wood);
    // a proper doorway at the head of the flight: gilt jambs + lintel + a dark
    // recessed opening — reads clearly as "the way up" instead of a clipped slab.
    box(0.45, 2.3, 0.6, -5.35, 2.85, -d / 2 + 0.7, gilt); // left jamb
    box(0.45, 2.3, 0.6, -2.65, 2.85, -d / 2 + 0.7, gilt); // right jamb
    box(3.3, 0.5, 0.6, -4, 4.0, -d / 2 + 0.7, gilt); // lintel
    box(2.4, 2.1, 0.35, -4, 2.75, -d / 2 + 0.45, upDark); // shadowed way up, recessed
    box(3.0, 0.9, 1.3, 5, 0.45, 5, wood); // a long hall table
    rt.blockers.push({ x: 5, z: 5, hw: 1.6, hd: 0.75 });
    // iron-and-gilt chandelier hung on a chain over the entry (visual, overhead)
    const chain = MeshBuilder.CreateCylinder(`hall_chain_${def.id}`, { diameter: 0.08, height: 1.1, tessellation: 6 }, scene);
    chain.material = stone;
    chain.position.set(0, H - 0.55, 2);
    chain.parent = node;
    const ring = MeshBuilder.CreateTorus(`hall_chand_${def.id}`, { diameter: 2.2, thickness: 0.14, tessellation: 18 }, scene);
    ring.material = gilt;
    ring.position.set(0, H - 1.25, 2);
    ring.parent = node;
    for (let a = 0; a < 6; a++) {
      const ca = (a / 6) * Math.PI * 2;
      box(0.13, 0.42, 0.13, Math.cos(ca) * 1.0, H - 1.0, 2 + Math.sin(ca) * 1.0, sconceMat); // candles
    }
    glbDecor(scene, node, ASSET_KEYS.props.suitOfArmor, -6.5, 6.4, 2.3);
    glbDecor(scene, node, ASSET_KEYS.props.suitOfArmor, 6.5, 6.4, 2.3);
    glbDecor(scene, node, ASSET_KEYS.props.grandfatherClock, 6.9, -6.4, 2.7);
    glbDecor(scene, node, ASSET_KEYS.props.huntTapestry, -7.0, -4, 3.0);
  } else if (def.id === 'library') {
    box(1.0, H - 0.4, d - 2, -w / 2 + 0.7, (H - 0.4) / 2, 0, wood);
    box(1.0, H - 0.4, d - 2, w / 2 - 0.7, (H - 0.4) / 2, 0, wood);
    rt.blockers.push({ x: -w / 2 + 0.7, z: 0, hw: 0.6, hd: d / 2 - 1 });
    rt.blockers.push({ x: w / 2 - 0.7, z: 0, hw: 0.6, hd: d / 2 - 1 });
    box(2.6, 0.9, 1.2, -3.5, 0.45, 2, wood); // reading table
    rt.blockers.push({ x: -3.5, z: 2, hw: 1.4, hd: 0.7 });
    glbDecor(scene, node, ASSET_KEYS.props.antiqueGlobe, -6, 5, 1.3);
    glbDecor(scene, node, ASSET_KEYS.props.readingLectern, 6, -4, 1.6);
    glbDecor(scene, node, ASSET_KEYS.props.rolltopDesk, 5.8, 4.5, 2.2);
  } else if (def.id === 'study') {
    box(2.4, 0.9, 1.0, 0, 0.45, -d / 2 + 1.4, wood);
    rt.blockers.push({ x: 0, z: -d / 2 + 1.4, hw: 1.3, hd: 0.7 });
    box(0.9, 1.2, 0.9, 2.6, 0.6, -d / 2 + 2.6, wood); // chair (offset, clear of the doc pickup)
    rt.blockers.push({ x: 2.6, z: -d / 2 + 2.6, hw: 0.5, hd: 0.5 });
    glbDecor(scene, node, ASSET_KEYS.props.rolltopDesk, -3.0, 2.6, 2.0);
  } else if (def.id === 'drawing') {
    box(2.4, 2.2, 0.5, 0, 1.1, -d / 2 + 0.4, stone); // hearth surround
    box(3.0, 0.3, 0.7, 0, 2.3, -d / 2 + 0.5, wood); // mantel
    box(1.4, 1.0, 1.3, -3.6, 0.5, 3.0, fabric); // armchair
    rt.blockers.push({ x: -3.6, z: 3.0, hw: 0.8, hd: 0.75 });
    glbDecor(scene, node, ASSET_KEYS.props.candelabra, 3.6, -3.4, 1.6);
  } else if (def.id === 'corridor') {
    for (let i = -1; i <= 1; i++) box(w, 0.4, 0.5, 0, H - 0.3, (i * d) / 4, stone); // arch ribs
    painting('e', 0); painting('w', 0); // corridor side walls have no doors
  } else if (def.id === 'conservatory') {
    // glasshouse: iron roof lattice + dead planters/topiary around the edges,
    // centre kept open for the Bloom boss arena.
    const iron = createStandardMaterial(scene, `dec_iron_${def.id}`, new Color3(0.16, 0.18, 0.16));
    for (let i = -2; i <= 2; i++) box(0.25, 0.3, d, (i * w) / 5, H, 0, iron); // roof ribs (overhead)
    glbDecor(scene, node, ASSET_KEYS.props.planter, -w / 2 + 2, -d / 2 + 2.5, 2.4);
    glbDecor(scene, node, ASSET_KEYS.props.planter, w / 2 - 2, -d / 2 + 2.5, 2.4);
    glbDecor(scene, node, ASSET_KEYS.props.topiary, -w / 2 + 2.5, d / 2 - 3, 2.6);
    glbDecor(scene, node, ASSET_KEYS.props.topiary, w / 2 - 2.5, d / 2 - 3, 2.6);
    glbDecor(scene, node, ASSET_KEYS.props.barrow, -w / 2 + 3.5, 0, 2.0);
    rt.blockers.push({ x: -w / 2 + 2, z: -d / 2 + 2.5, hw: 1.2, hd: 1.2 });
    rt.blockers.push({ x: w / 2 - 2, z: -d / 2 + 2.5, hw: 1.2, hd: 1.2 });
    glbDecor(scene, node, ASSET_KEYS.props.crackedUrn, w / 2 - 3, d / 2 - 5, 2.4);
    glbDecor(scene, node, ASSET_KEYS.props.crackedUrn, -w / 2 + 4, d / 2 - 5, 2.2);
    // ── the Bloom is ROOTED to this floor — dress its arena as a spreading
    // fungal mass so the room reads as its lair, not a normal room. ──
    const bx = 0;
    const bz = 2; // matches the Bloom's spawn anchor in entities.ts
    const rot = createStandardMaterial(scene, `bloom_rot_${def.id}`, new Color3(0.2, 0.28, 0.13), new Color3(0.06, 0.12, 0.03));
    applyTex(rot, 'tex_rot_moss', 3, 3, 0.9);
    const rotGlow = createStandardMaterial(scene, `bloom_glow_${def.id}`, new Color3(0.45, 0.85, 0.3), new Color3(0.4, 0.78, 0.25));
    rotGlow.disableLighting = true;
    // infected floor patch spreading out from the root-mass
    const patch = MeshBuilder.CreateDisc(`bloom_patch_${def.id}`, { radius: 7.5, tessellation: 28 }, scene);
    patch.material = rot;
    patch.rotation.x = Math.PI / 2;
    patch.position.set(bx, 0.03, bz);
    patch.parent = node;
    // the central root-stump the Bloom heaves out of
    const stump = MeshBuilder.CreateCylinder(`bloom_stump_${def.id}`, { diameterTop: 1.7, diameterBottom: 3.0, height: 0.9, tessellation: 12 }, scene);
    stump.material = rot;
    stump.position.set(bx, 0.45, bz);
    stump.parent = node;
    // roots snaking outward across the floor, glowing spore-pods at their tips
    for (let i = 0; i < 11; i++) {
      const ang = (i / 11) * Math.PI * 2 + (i % 2 ? 0.28 : 0);
      const len = 3.2 + (i % 3) * 1.4;
      const r = box(len, 0.28, 0.42, bx + (Math.cos(ang) * len) / 2, 0.14, bz + (Math.sin(ang) * len) / 2, rot);
      r.rotation.y = -ang;
      const pod = MeshBuilder.CreateSphere(`bloom_pod_${i}_${def.id}`, { diameter: 0.42, segments: 8 }, scene);
      pod.material = rotGlow;
      pod.position.set(bx + Math.cos(ang) * len, 0.32, bz + Math.sin(ang) * len);
      pod.parent = node;
    }
    // upright fungal stalks ringing the arena, capped with glowing spore-heads
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + 0.4;
      const sx = bx + Math.cos(a) * 6.2;
      const sz = bz + Math.sin(a) * 6.2;
      const hh = 1.2 + (i % 2) * 0.7;
      const stalk = MeshBuilder.CreateCylinder(`bloom_stalk_${i}_${def.id}`, { diameterTop: 0.16, diameterBottom: 0.36, height: hh, tessellation: 6 }, scene);
      stalk.material = rot;
      stalk.position.set(sx, hh / 2, sz);
      stalk.parent = node;
      const cap = MeshBuilder.CreateSphere(`bloom_cap_${i}_${def.id}`, { diameter: 0.5, segments: 8 }, scene);
      cap.material = rotGlow;
      cap.position.set(sx, hh, sz);
      cap.parent = node;
    }
    // a sickly spore-light hanging over the rooted arena
    const spore = new PointLight(`bloom_light_${def.id}`, new Vector3(def.center[0] + bx, 2.6, def.center[2] + bz), scene);
    spore.diffuse = new Color3(0.4, 0.85, 0.35);
    spore.intensity = 0.85;
    spore.range = 17;
  } else if (def.id === 'music_room') {
    // piano against the back-left wall, well clear of the phonograph (item at 0,3)
    glbDecor(scene, node, ASSET_KEYS.props.grandPiano, -4, -3.2, 3.2);
    rt.blockers.push({ x: -4, z: -3.2, hw: 1.7, hd: 1.1 });
  } else if (def.id === 'long_gallery') {
    glbDecor(scene, node, ASSET_KEYS.props.pedestal, -3, -2, 1.4);
    glbDecor(scene, node, ASSET_KEYS.props.pedestal, 3, 0, 1.4);
    glbDecor(scene, node, ASSET_KEYS.props.portraitEyes, -w / 2 + 1, 5, 1.9);
    glbDecor(scene, node, ASSET_KEYS.props.portraitEyes, w / 2 - 1, -6, 1.9);
    rt.blockers.push({ x: -3, z: -2, hw: 0.5, hd: 0.5 });
    rt.blockers.push({ x: 3, z: 0, hw: 0.5, hd: 0.5 });
  } else if (def.id === 'boiler') {
    glbDecor(scene, node, ASSET_KEYS.props.wineRack, -w / 2 + 1.2, 4, 2.6);
    glbDecor(scene, node, ASSET_KEYS.props.pipes, w / 2 - 1, -3, 2.4);
    rt.blockers.push({ x: -w / 2 + 1.2, z: 4, hw: 0.8, hd: 1.2 });
    glbDecor(scene, node, ASSET_KEYS.props.coalHeap, w / 2 - 2.5, 4.5, 1.8);
    glbDecor(scene, node, ASSET_KEYS.props.waterBarrels, -w / 2 + 2, -4.5, 2.4);
  } else if (def.id === 'cistern') {
    glbDecor(scene, node, ASSET_KEYS.props.pipes, -w / 2 + 1.5, -7, 2.8);
    glbDecor(scene, node, ASSET_KEYS.props.pipes, w / 2 - 1.5, -7, 2.8);
    // a dark standing-water plane across the floor
    const water = createStandardMaterial(scene, `water_${def.id}`, new Color3(0.05, 0.12, 0.16), new Color3(0.02, 0.05, 0.08));
    box(w - 1, 0.06, d - 1, 0, 0.05, 0, water);
    glbDecor(scene, node, ASSET_KEYS.props.waterBarrels, -w / 2 + 2.5, d / 2 - 3, 2.6);
  } else if (def.id === 'chapel') {
    glbDecor(scene, node, ASSET_KEYS.props.altar, 0, -d / 2 + 2, 3.0);
    glbDecor(scene, node, ASSET_KEYS.props.reliquary, 3, -d / 2 + 2, 1.6);
    glbDecor(scene, node, ASSET_KEYS.props.pew, -3.5, 1, 3.0);
    glbDecor(scene, node, ASSET_KEYS.props.pew, 3.5, 1, 3.0);
    glbDecor(scene, node, ASSET_KEYS.props.pew, -3.5, 4, 3.0);
    glbDecor(scene, node, ASSET_KEYS.props.pew, 3.5, 4, 3.0);
    rt.blockers.push({ x: -3.5, z: 1, hw: 1.5, hd: 0.5 });
    rt.blockers.push({ x: 3.5, z: 1, hw: 1.5, hd: 0.5 });
    rt.blockers.push({ x: -3.5, z: 4, hw: 1.5, hd: 0.5 });
    rt.blockers.push({ x: 3.5, z: 4, hw: 1.5, hd: 0.5 });
    glbDecor(scene, node, ASSET_KEYS.props.candelabra, -6, -d / 2 + 2, 1.8);
    glbDecor(scene, node, ASSET_KEYS.props.candelabra, 6, -d / 2 + 2, 1.8);
    glbDecor(scene, node, ASSET_KEYS.props.boneReliquary, 5, -d / 2 + 3.5, 1.4);
  } else if (def.id === 'lighthouse') {
    // the lamp room atop the spiral stair: the great lens + lamp mechanism at
    // centre, storm windows on the walls, dock clutter, and the escape boat.
    glbDecor(scene, node, ASSET_KEYS.props.spiralStair, -w / 2 + 2.5, -w / 2 + 2.5, 3.4);
    glbDecor(scene, node, ASSET_KEYS.props.lighthouseLens, 0, 0, 3.0);
    glbDecor(scene, node, ASSET_KEYS.props.lampMechanism, 0, 0, 2.2);
    glbDecor(scene, node, ASSET_KEYS.props.stormWindow, 0, -d / 2 + 0.6, 3.0);
    glbDecor(scene, node, ASSET_KEYS.props.stormWindow, w / 2 - 0.6, 2, 3.0);
    glbDecor(scene, node, ASSET_KEYS.props.boat, -w / 2 + 2, d / 2 - 2, 2.6);
    glbDecor(scene, node, ASSET_KEYS.props.anchor, w / 2 - 2.5, d / 2 - 2.5, 1.8);
    glbDecor(scene, node, ASSET_KEYS.props.ropeCoil, w / 2 - 3, d / 2 - 4, 1.0);
    glbDecor(scene, node, ASSET_KEYS.props.barrel, -w / 2 + 3.5, -3, 1.3);
    glbDecor(scene, node, ASSET_KEYS.props.barrel, -w / 2 + 4.5, -3.6, 1.3);
    glbDecor(scene, node, ASSET_KEYS.props.logbook, 4, -4, 0.7);
    glbDecor(scene, node, ASSET_KEYS.props.lanternPost, w / 2 - 2, -5, 2.6);
    rt.blockers.push({ x: 0, z: 0, hw: 1.4, hd: 1.4 }); // the lens/lamp column
    rt.blockers.push({ x: -w / 2 + 2, z: d / 2 - 2, hw: 1.3, hd: 1.3 }); // the boat
    // the beacon: a bright warm light burning at the lens
    const beacon = new PointLight(`beacon_${def.id}`, new Vector3(def.center[0], 3.0, def.center[2]), scene);
    beacon.diffuse = new Color3(1.0, 0.92, 0.7);
    beacon.intensity = 2.6;
    beacon.range = 26;
    const lensMat = createStandardMaterial(scene, `dec_lens_${def.id}`, new Color3(1.0, 0.95, 0.75), new Color3(1.0, 0.9, 0.6));
    const lens = MeshBuilder.CreateSphere(`beacon_orb_${def.id}`, { diameter: 1.0, segments: 12 }, scene);
    lens.material = lensMat;
    lens.position.set(0, 3.0, 0);
    lens.parent = node;
  } else if (def.id === 'lab') {
    glbDecor(scene, node, ASSET_KEYS.props.specimenTank, -w / 2 + 1.5, -5, 3.2);
    glbDecor(scene, node, ASSET_KEYS.props.specimenTank, -w / 2 + 1.5, 0, 3.2);
    glbDecor(scene, node, ASSET_KEYS.props.specimenTank, w / 2 - 1.5, -5, 3.2);
    glbDecor(scene, node, ASSET_KEYS.props.labConsole, w / 2 - 2, 4, 2.4);
    glbDecor(scene, node, ASSET_KEYS.props.bloodApparatus, -5, 6, 2.0);
    glbDecor(scene, node, ASSET_KEYS.props.labGurney, 4, -6, 2.4);
    glbDecor(scene, node, ASSET_KEYS.props.specimenJars, 6, 2, 2.0);
    glbDecor(scene, node, ASSET_KEYS.props.ironChandelier, -6, -2, 1.8);
    glbDecor(scene, node, ASSET_KEYS.props.crystalChandelierBroken, w / 2 - 2.5, 7, 2.2);
  } else if (def.id === 'landing') {
    // gallery landing: a rail overlooking the hall + a row of Vane portraits.
    // The rail is BROKEN at centre for the stairhead down to the Great Hall.
    box(6.5, 0.9, 0.2, -5.25, 0.75, d / 2 - 0.6, wood); // rail left of the stairhead
    box(6.5, 0.9, 0.2, 5.25, 0.75, d / 2 - 0.6, wood); // rail right of the stairhead
    box(0.2, 0.9, 0.2, -7, 0.75, d / 2 - 0.6, wood); // balusters (centre left open)
    box(0.2, 0.9, 0.2, 7, 0.75, d / 2 - 0.6, wood);
    // the way DOWN: a descending lip + a dark archway in the balcony wall, so the
    // stairhead reads from across the room (it was a blank wall before).
    const downDark = createStandardMaterial(scene, `land_down_${def.id}`, new Color3(0.18, 0.17, 0.21), new Color3(0.05, 0.05, 0.07));
    for (let i = 0; i < 3; i++) {
      const h = 0.6 - i * 0.18; // a short descending lip toward the opening
      box(2.4, h, 0.5, 0, h / 2, d / 2 - 1.7 + i * 0.5, stone);
    }
    box(0.4, 3.0, 0.5, -1.5, 1.5, d / 2 - 0.3, wood); // left jamb of the stairhead
    box(0.4, 3.0, 0.5, 1.5, 1.5, d / 2 - 0.3, wood); // right jamb
    box(3.4, 0.5, 0.5, 0, 3.0, d / 2 - 0.3, wood); // lintel
    box(2.6, 2.6, 0.3, 0, 1.3, d / 2 - 0.5, downDark); // shadowed way down
    // WALKABLE: step into the stairhead to descend to the Great Hall (no prompt)
    rt.stairs.push({ cx: 0, cz: d / 2 - 1.0, hw: 1.3, hd: 1.2, axis: 'z', lo: 0, hi: 1, baseY: 0, topY: 0, trigAt: d / 2 - 1.0, trigDir: 1, exitId: 'landing_to_hall' });
    painting('n', -4); painting('n', 0); painting('n', 4); // the Vane portrait line
    box(1.6, 0.9, 0.7, -w / 2 + 1.6, 0.45, -3, fabric); // a chaise
    box(0.9, 2.2, 0.6, w / 2 - 1, 1.1, -3, wood); // longcase clock
    rt.blockers.push({ x: w / 2 - 1, z: -3, hw: 0.5, hd: 0.4 });
    glbDecor(scene, node, ASSET_KEYS.props.grandfatherClock, w / 2 - 1.2, 3, 2.6);
  } else if (def.id === 'iseult_room') {
    // preserved room — a made four-poster no one sleeps in; deeply sad
    const post = (x: number, z: number) => box(0.28, 3.4, 0.28, x, 1.7, z, wood);
    post(-2.2, -d / 2 + 1.6); post(2.2, -d / 2 + 1.6); post(-2.2, -d / 2 + 4.2); post(2.2, -d / 2 + 4.2);
    box(4.6, 0.14, 0.28, 0, 3.4, -d / 2 + 1.6, wood); // canopy rails
    box(4.6, 0.14, 0.28, 0, 3.4, -d / 2 + 4.2, wood);
    box(4.4, 2.7, 0.1, 0, 2.0, -d / 2 + 4.25, fabric); // gauze canopy back
    box(4.4, 0.6, 2.6, 0, 0.7, -d / 2 + 2.9, fabric); // mattress + coverlet (dust-white-ish)
    box(4.6, 0.3, 2.9, 0, 0.35, -d / 2 + 2.9, wood); // bed frame
    rt.blockers.push({ x: 0, z: -d / 2 + 2.9, hw: 2.4, hd: 1.6 });
    box(1.8, 1.0, 0.6, -w / 2 + 1.2, 0.5, 3, wood); // vanity/dressing table
    box(1.2, 1.2, 0.08, -w / 2 + 1.2, 1.9, 3 - 0.3, marble); // vanity mirror
    rt.blockers.push({ x: -w / 2 + 1.2, z: 3, hw: 1.0, hd: 0.5 });
    box(1.6, 2.4, 0.9, w / 2 - 1.0, 1.2, 3.5, wood); // wardrobe
    rt.blockers.push({ x: w / 2 - 1.0, z: 3.5, hw: 0.9, hd: 0.5 });
    box(2.2, 0.5, 0.9, 0, 0.25, d / 2 - 0.7, fabric); // window seat (sea view wall)
    painting('e', -3, 1.1, 1.5); // Iseult's portrait
  } else if (def.id === 'nursery') {
    // a child's room, wrong somehow — rocking horse + cot + toy chest
    box(2.0, 0.7, 1.2, -w / 2 + 1.6, 0.35, -3, wood); // child's bed
    box(0.28, 0.9, 1.2, -w / 2 + 0.7, 0.45, -3, wood); // bed head
    rt.blockers.push({ x: -w / 2 + 1.6, z: -3, hw: 1.1, hd: 0.7 });
    box(1.3, 1.0, 1.3, -w / 2 + 1.6, 0.5, 2.5, wood); // cot/crib
    for (let i = 0; i < 5; i++) box(0.08, 0.7, 0.08, -w / 2 + 1.0 + i * 0.3, 0.85, 2.5 - 0.6, wood); // crib slats
    rt.blockers.push({ x: -w / 2 + 1.6, z: 2.5, hw: 0.8, hd: 0.7 });
    box(1.0, 0.5, 0.55, 3, 0.5, 0, wood); // rocking-horse body (angular silhouette)
    box(0.12, 0.9, 0.7, 3, 0.9, 0, wood); // horse neck/head
    box(1.4, 0.7, 0.9, w / 2 - 1.2, 0.35, -3, wood); // toy chest (holds attic key)
    rt.blockers.push({ x: w / 2 - 1.2, z: -3, hw: 0.8, hd: 0.5 });
    box(0.7, 0.5, 0.7, 3, 0.85, 3, gilt); // music-box on a small table
    box(0.8, 0.7, 0.8, 3, 0.35, 3, wood);
    painting('n', 3, 1.0, 0.8); // a child's drawing (cipher)
  } else if (def.id === 'sister_room') {
    // a spare refuge — narrow bed, small altar, a barricaded door
    box(1.1, 0.6, 2.4, -w / 2 + 1.2, 0.3, -1, fabric); // narrow bed
    box(0.24, 1.0, 2.4, -w / 2 + 0.55, 0.5, -1, wood); // bed head
    rt.blockers.push({ x: -w / 2 + 1.2, z: -1, hw: 0.7, hd: 1.3 });
    box(0.9, 1.0, 0.6, w / 2 - 1, 0.5, -3, wood); // small altar
    box(0.14, 0.7, 0.14, w / 2 - 1, 1.35, -3, gilt); // crucifix upright
    box(0.5, 0.14, 0.14, w / 2 - 1, 1.5, -3, gilt); // crucifix arms
    box(0.9, 0.5, 0.6, w / 2 - 1.4, 0.25, 3, wood); // Ysolde's suitcase
    // a barricaded door on the back wall — boards nailed across
    for (let i = 0; i < 4; i++) box(2.4, 0.22, 0.12, 0, 1.2 + i * 0.5, -d / 2 + 0.3, wood);
  } else if (def.id === 'attic_loft') {
    // the Steward's loft — everything arranged too tidily; heartbreaking, not gory
    box(1.0, 0.5, 2.2, -w / 2 + 1.2, 0.25, -1, fabric); // narrow iron bed (hospital corners)
    box(1.0, 0.12, 2.2, -w / 2 + 1.2, 0.55, -1, wood);
    rt.blockers.push({ x: -w / 2 + 1.2, z: -1, hw: 0.7, hd: 1.2 });
    box(2.6, 0.9, 1.0, 0, 0.45, d / 2 - 1.2, wood); // work-table
    rt.blockers.push({ x: 0, z: d / 2 - 1.2, hw: 1.4, hd: 0.6 });
    for (let i = 0; i < 5; i++) box(0.16, 0.16, 0.5, -1.0 + i * 0.5, 1.0, d / 2 - 1.2, sconceMat); // tools laid out in a row
    for (let i = 0; i < 6; i++) painting('n', -4.5 + i * 1.8, 0.5, 0.6); // wall of pinned photos
    box(0.8, 1.0, 0.8, w / 2 - 1.2, 0.5, 0, wood); // lone chair at the window
    for (let i = 0; i < 4; i++) box(0.24, 0.3, 0.24, 2 + i * 0.4, 0.6, -d / 2 + 0.8, gilt); // rowed seed jars
  } else if (def.id === 'kitchen') {
    // great range + central island + hanging pots
    box(2.6, 1.6, 0.9, 0, 0.8, -d / 2 + 0.6, stone); // great range/hearth
    box(2.0, 1.2, 0.5, 0, 2.4, -d / 2 + 0.4, stone); // range hood
    const range = new PointLight(`kitch_range_${def.id}`, new Vector3(def.center[0], 1.0, def.center[2] - d / 2 + 1.5), scene);
    range.diffuse = new Color3(1.0, 0.5, 0.2); range.intensity = 0.9; range.range = 8;
    box(3.4, 0.95, 1.6, 0, 0.48, 0, wood); // central prep island
    rt.blockers.push({ x: 0, z: 0, hw: 1.8, hd: 0.9 });
    for (let i = -1; i <= 1; i++) box(0.3, 0.5, 0.3, i * 0.9, H - 0.6, 0, sconceMat); // hanging copper pots
    box(1.6, 2.2, 1.0, w / 2 - 1, 1.1, -3, wood); // larder
    rt.blockers.push({ x: w / 2 - 1, z: -3, hw: 0.9, hd: 0.6 });
    box(1.2, 0.9, 1.0, -w / 2 + 1.2, 0.45, 3, wood); // butcher's block
    rt.blockers.push({ x: -w / 2 + 1.2, z: 3, hw: 0.7, hd: 0.6 });
  } else if (def.id === 'dining') {
    // the frozen supper — a long table set for a meal, chairs for the seated dead
    box(6.0, 0.9, 1.6, 0, 0.5, 0, wood); // long dining table
    box(6.0, 0.06, 1.6, 0, 0.96, 0, fabric); // tablecloth top
    rt.blockers.push({ x: 0, z: 0, hw: 3.1, hd: 0.9 });
    for (let i = -2; i <= 2; i++) {
      box(0.7, 1.4, 0.7, i * 1.3, 0.7, -1.6, wood); // high-backed chairs, both sides
      box(0.7, 1.4, 0.7, i * 1.3, 0.7, 1.6, wood);
      box(0.4, 0.4, 0.4, i * 1.3, 1.15, 0, gilt); // place settings / candelabra glints
    }
    box(2.4, 1.1, 0.8, 0, 0.55, -d / 2 + 0.7, wood); // sideboard
    rt.blockers.push({ x: 0, z: -d / 2 + 0.7, hw: 1.3, hd: 0.5 });
    glbDecor(scene, node, ASSET_KEYS.props.candelabra, 0, 2.6, 1.7);
  } else if (def.id === 'crypt') {
    // rows of Vane sarcophagi + a family effigy + the sliding tomb (→ lab)
    const sarco = (x: number, z: number) => {
      box(1.3, 0.9, 2.6, x, 0.45, z, stone);
      box(1.5, 0.2, 2.8, x, 0.95, z, marble); // lid
      rt.blockers.push({ x, z, hw: 0.8, hd: 1.5 });
    };
    sarco(-4, -3); sarco(-4, 3); sarco(4, -3);
    box(1.4, 1.8, 0.9, 0, 0.9, d / 2 - 1.2, marble); // family effigy (upright)
    box(0.6, 0.5, 0.6, 0, 1.9, d / 2 - 1.2, marble); // effigy head
    glbDecor(scene, node, ASSET_KEYS.props.reliquary, -w / 2 + 2, d / 2 - 2, 1.6);
    glbDecor(scene, node, ASSET_KEYS.props.altar, w / 2 - 2, d / 2 - 2, 2.2);
    // the sliding tomb by the lab exit (south) — offset lid reveals the way below
    box(1.5, 0.9, 2.8, 4, 0.45, -d / 2 + 2.2, stone);
    box(1.7, 0.24, 3.0, 4.4, 0.98, -d / 2 + 2.2, marble); // shoved-aside lid
    rt.blockers.push({ x: 4, z: -d / 2 + 2.2, hw: 0.9, hd: 1.6 });
  } else if (def.id === 'containment') {
    // sterile ward — an observation cell with a glass wall + cot + IV; Marion's home
    const glass = createStandardMaterial(scene, `cont_glass_${def.id}`, new Color3(0.6, 0.75, 0.8), new Color3(0.15, 0.25, 0.28));
    glass.alpha = 0.28; glass.backFaceCulling = false;
    const cell = MeshBuilder.CreateBox(`cont_glass_${def.id}`, { width: 0.12, height: 3.0, depth: 6 }, scene);
    cell.material = glass; cell.position.set(-1.5, 1.5, -1); cell.parent = node;
    const sheet = createStandardMaterial(scene, `cont_sheet_${def.id}`, new Color3(0.82, 0.84, 0.85)); // pale sterile linen
    box(2.2, 0.6, 1.0, -w / 2 + 2, 0.4, -1, stone); // gurney frame
    box(2.2, 0.16, 1.05, -w / 2 + 2, 0.72, -1, sheet); // cot sheet
    rt.blockers.push({ x: -w / 2 + 2, z: -1, hw: 1.2, hd: 0.6 });
    box(0.12, 1.6, 0.12, -w / 2 + 3.4, 0.8, -1, sconceMat); // IV stand pole
    box(0.3, 0.4, 0.2, -w / 2 + 3.4, 1.6, -1, glass); // IV bag
    glbDecor(scene, node, ASSET_KEYS.props.specimenTank, w / 2 - 1.5, -3, 3.0); // specimen fridge
    glbDecor(scene, node, ASSET_KEYS.props.labConsole, w / 2 - 2, 3, 2.4);
    for (let i = -1; i <= 1; i++) box(2.0, 0.15, 0.4, i * 4, H - 0.15, 0, sconceMat); // harsh strip-lights
  }
}

// Drop a generated GLB prop as non-colliding scene decor, normalised to size.
function glbDecor(scene: Scene, node: TransformNode, assetKey: string, lx: number, lz: number, targetSize: number): void {
  const url = ASSETS[assetKey];
  if (!url) return;
  void loadGlbModel(scene, url, `decor_${assetKey}_${lx}_${lz}`).then((loaded) => {
    if (!loaded) return;
    const { min, max } = loaded.root.getHierarchyBoundingVectors(true);
    const ext = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) || 1;
    const s = targetSize / ext;
    loaded.root.scaling.setAll(s);
    loaded.root.parent = node;
    loaded.root.position.set(lx, -min.y * s, lz);
    // static decor — freeze transforms + drop from picking (perf)
    loaded.root.getChildMeshes(false).forEach((m) => {
      m.isPickable = false;
      m.doNotSyncBoundingInfo = true;
      m.freezeWorldMatrix();
      // Albedo floor: props authored with near-black albedo (black-lacquer
      // piano, phonograph horn…) absorb ALL light and render as featureless
      // black blocks in the dark manor. Lift only near-black channels so the
      // prop catches the flashlight while staying dark-toned.
      const mat = m.material as unknown as { albedoColor?: Color3; diffuseColor?: Color3 } | null;
      const c = mat?.albedoColor ?? mat?.diffuseColor;
      if (c && c.r < 0.14 && c.g < 0.14 && c.b < 0.14) {
        c.r = Math.max(c.r, 0.14);
        c.g = Math.max(c.g, 0.14);
        c.b = Math.max(c.b, 0.16); // faint cool cast so it reads as lacquer, not mud
      }
    });
  });
}

export function createGameWorld(scene: Scene, _canvas: HTMLCanvasElement): GameWorldObjects {
  // LLM-EXTENSION:WORLD — adjust Babylon scene background, camera, lighting, terrain, and static colliders here.
  // DO NOT REMOVE the LLM-EXTENSION:WORLD tag — templates/3d/scripts/check-architecture.mjs requires it to appear exactly once across the src tree.
  scene.clearColor = Color4.FromHexString(`${RUNTIME_CONFIG.world.clearColor}ff`);
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.03; // thicker murk — darkness swallows the far walls
  scene.fogColor = new Color3(0.02, 0.023, 0.032);

  // First-person camera — driven manually by the actor (position = eye, rotation
  // = yaw/pitch). NOT attachControl'd; the actor owns look + move.
  const camera = new UniversalCamera('fp-cam', new Vector3(0, EYE_HEIGHT, 7), scene);
  camera.minZ = RUNTIME_CONFIG.camera.minZ;
  camera.maxZ = RUNTIME_CONFIG.camera.maxZ;
  camera.fov = 1.05;
  camera.rotation.set(0, Math.PI, 0);
  scene.activeCamera = camera;

  const hemiLight = new HemisphericLight('ambient', HEMI_DIR, scene);
  hemiLight.intensity = 0.07; // pitch-dark: barely a hint of moonlight — you NEED the torch
  hemiLight.diffuse = new Color3(0.28, 0.34, 0.5);
  hemiLight.groundColor = new Color3(0.03, 0.03, 0.05);

  // The courier's lantern: a whisper of a close body-glow so you're not in 100%
  // black at your feet with the flashlight off — the flashlight is the real light.
  const lantern = new PointLight('lantern', new Vector3(0, 2.4, 0), scene);
  lantern.diffuse = new Color3(0.85, 0.6, 0.38);
  lantern.intensity = 0.28;
  lantern.range = 6;

  // ── Flashlight: head-mounted spot the courier always carries. Parented to the
  // camera so it points wherever you look; toggled from the item bar / [F].
  const flashlight = new SpotLight('flashlight', new Vector3(0.1, -0.08, 0.2), new Vector3(0, -0.02, 1), 1.05, 8, scene);
  flashlight.parent = camera;
  flashlight.diffuse = new Color3(1.0, 0.96, 0.86);
  flashlight.specular = new Color3(0.6, 0.58, 0.5);
  flashlight.intensity = 4.2;
  flashlight.range = 34;
  let flashOn = true;
  let flashHealth = 1; // battery fraction (0..1) — drives the dying-cell flicker

  // A second accent light for the save-room hearth (only bright in 'save' wing).
  const hearth = new PointLight('hearth', new Vector3(ROOMS.drawing.center[0], 1.2, ROOMS.drawing.center[1] - 4), scene);
  hearth.diffuse = new Color3(1.0, 0.5, 0.2);
  hearth.intensity = 0.0;
  hearth.range = 9;

  // Warm accent over the Music Room so the dark grand piano reads (it was a
  // featureless black mass in the near-black ambient). Only lit in that room.
  const musicLamp = new PointLight('music_lamp', new Vector3(ROOMS.music_room.center[0] - 3, 2.3, ROOMS.music_room.center[2] - 2), scene);
  musicLamp.diffuse = new Color3(1.0, 0.85, 0.55);
  musicLamp.intensity = 0.0;
  musicLamp.range = 12;

  // template-required visible ground (kept tiny, under the void; rooms are the real floors)
  const ground = MeshBuilder.CreateGround('ground', { width: RUNTIME_CONFIG.world.groundSize, height: RUNTIME_CONFIG.world.groundSize }, scene);
  ground.material = createStandardMaterial(scene, 'ground-material', new Color3(0.04, 0.04, 0.05));
  ground.position.y = -40;
  ground.setEnabled(false);

  const rooms: Record<RoomId, RoomRuntime> = {} as Record<RoomId, RoomRuntime>;
  (Object.keys(ROOMS) as RoomId[]).forEach((id) => {
    rooms[id] = buildRoomShell(scene, ROOMS[id]);
    decorateRoom(scene, rooms[id]);
    ROOMS[id].exits.forEach((ex, i) => placeDoor(scene, rooms[id].node, ROOMS[id], ex, i));
    // Seamless manor: any exit flagged walkUp becomes a walk-through — the grand
    // staircase gets a hand-authored climb zone (in decorateRoom); every other
    // walkUp stair auto-gets a flat trigger footprint here, so you just walk
    // into the opening to pass through (no USE prompt, no fade cutscene).
    ROOMS[id].exits.forEach((ex) => {
      if (!ex.walkUp || rooms[id].stairs.some((s) => s.exitId === ex.id)) return;
      const [ax, az] = ex.at;
      const onX = Math.abs(ax) > Math.abs(az);
      // pull the trigger footprint ~1.3m in off the wall so it's actually
      // reachable (the player clamps short of the wall) — you cross the threshold.
      const cx = onX && ax !== 0 ? ax - Math.sign(ax) * 1.3 : ax;
      const cz = !onX && az !== 0 ? az - Math.sign(az) * 1.3 : az;
      rooms[id].stairs.push({ cx, cz, hw: 1.8, hd: 1.8, axis: onX ? 'x' : 'z', lo: 0, hi: 1, baseY: 0, topY: 0, trigAt: onX ? ax : az, trigDir: 1, exitId: ex.id });
    });
  });
  // Perf: every room mesh (walls, floors, furniture, doors) is static — freeze
  // its world matrix, skip bounding-sync and picking. Async GLB decor freezes
  // itself in glbDecor(). Hundreds of meshes; this cuts per-frame CPU sharply.
  (Object.keys(rooms) as RoomId[]).forEach((id) => {
    rooms[id].node.getChildMeshes(false).forEach((m) => {
      m.isPickable = false;
      m.doNotSyncBoundingInfo = true;
      m.freezeWorldMatrix();
    });
  });
  // Rooms are in-engine geometry in the first-person build (no GLB backdrops).

  // ── pixel-crush post ──
  registerCrushShader();
  const crush = new PostProcess(
    'hmCrush',
    'hmCrush',
    ['uRes', 'uPixel', 'uLevels', 'uDither', 'uVignette', 'uGrain', 'uTime', 'uHealth', 'uSteward', 'uTint', 'uBright'],
    null,
    1.0,
    camera,
  );
  let pixelSize: number = PIXEL.pixelSize;
  let levels: number = PIXEL.levels;
  let dither: number = PIXEL.ditherAmt;
  let tint: [number, number, number] = WING_TINT.manor;
  let stewardProx = 0;
  let healthFactor = 1;
  let brightness = 1; // player calibration (Settings slider), 0.7..1.8
  let timeAcc = 0;
  crush.onApply = (effect) => {
    effect.setFloat2('uRes', crush.width || scene.getEngine().getRenderWidth(), crush.height || scene.getEngine().getRenderHeight());
    effect.setFloat('uPixel', pixelSize);
    effect.setFloat('uLevels', levels);
    effect.setFloat('uDither', dither);
    effect.setFloat('uVignette', PIXEL.vignette);
    effect.setFloat('uGrain', PIXEL.grain);
    effect.setFloat('uTime', timeAcc);
    effect.setFloat('uHealth', healthFactor);
    effect.setFloat('uSteward', stewardProx);
    effect.setFloat3('uTint', tint[0], tint[1], tint[2]);
    effect.setFloat('uBright', brightness);
  };

  let activeRoom: RoomId = 'hall';

  const setActiveRoom = (id: RoomId) => {
    rooms[activeRoom].node.setEnabled(false);
    activeRoom = id;
    const rt = rooms[id];
    rt.node.setEnabled(true);
    tint = WING_TINT[rt.def.wing] ?? WING_TINT.manor;
    hearth.intensity = rt.def.wing === 'save' ? 1.1 : 0.0;
    musicLamp.intensity = id === 'music_room' ? 1.7 : 0.0;
  };

  setActiveRoom('hall');

  const out: GameWorldObjects = {
    camera,
    hemiLight,
    ground,
    get activeRoom() {
      return activeRoom;
    },
    setActiveRoom,
    roomCenter(id) {
      const c = ROOMS[id].center;
      return SCRATCH_C.set(c[0], c[1], c[2]);
    },
    localToWorld(id, lx, lz, outV) {
      const c = ROOMS[id].center;
      return outV.set(c[0] + lx, c[1], c[2] + lz);
    },
    clampToRoom(id, outV) {
      const def = ROOMS[id];
      const c = def.center;
      const halfW = def.size[0] / 2 - WALL_MARGIN;
      const halfD = def.size[1] / 2 - WALL_MARGIN;
      let lx = outV.x - c[0];
      let lz = outV.z - c[2];
      if (lx > halfW) lx = halfW;
      if (lx < -halfW) lx = -halfW;
      if (lz > halfD) lz = halfD;
      if (lz < -halfD) lz = -halfD;
      // push out of blockers (axis of least penetration)
      const blockers = rooms[id].blockers;
      for (let i = 0; i < blockers.length; i++) {
        const b = blockers[i];
        const dx = lx - b.x;
        const dz = lz - b.z;
        const px = b.hw + 0.45 - Math.abs(dx);
        const pz = b.hd + 0.45 - Math.abs(dz);
        if (px > 0 && pz > 0) {
          if (px < pz) lx = b.x + (dx < 0 ? -1 : 1) * (b.hw + 0.45);
          else lz = b.z + (dz < 0 ? -1 : 1) * (b.hd + 0.45);
        }
      }
      outV.x = c[0] + lx;
      outV.z = c[2] + lz;
      outV.y = c[1];
    },
    addBlocker(id, b) {
      rooms[id].blockers.push(b);
    },
    setStewardProximity(v) {
      stewardProx = v < 0 ? 0 : v > 1 ? 1 : v;
    },
    setHealthFactor(v) {
      healthFactor = v < 0 ? 0 : v > 1 ? 1 : v;
    },
    stairEyeOffset(id, pos) {
      const rt = rooms[id];
      if (!rt || rt.stairs.length === 0) return 0;
      const c = ROOMS[id].center;
      const lx = pos.x - c[0];
      const lz = pos.z - c[2];
      for (const s of rt.stairs) {
        if (s.baseY === s.topY) continue; // flat walk-through: no climb
        if (Math.abs(lx - s.cx) <= s.hw && Math.abs(lz - s.cz) <= s.hd) {
          const a = s.axis === 'x' ? lx : lz;
          let t = (a - s.lo) / (s.hi - s.lo || 1);
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          return s.baseY + t * (s.topY - s.baseY);
        }
      }
      return 0;
    },
    stairTrigger(id, pos) {
      const rt = rooms[id];
      if (!rt || rt.stairs.length === 0) return null;
      const c = ROOMS[id].center;
      const lx = pos.x - c[0];
      const lz = pos.z - c[2];
      for (const s of rt.stairs) {
        if (Math.abs(lx - s.cx) > s.hw || Math.abs(lz - s.cz) > s.hd) continue;
        const a = s.axis === 'x' ? lx : lz;
        // flat zones fire on footprint entry; ramped zones only at the top
        if (s.baseY === s.topY || (a - s.trigAt) * s.trigDir >= 0) return s.exitId;
      }
      return null;
    },
    setPixelParams(p, l, d) {
      pixelSize = p;
      levels = l;
      dither = d;
    },
    setBrightness(v) {
      brightness = v < 0.6 ? 0.6 : v > 2 ? 2 : v;
    },
    toggleFlashlight() {
      flashOn = !flashOn;
      return flashOn;
    },
    setFlashlight(on) {
      flashOn = on;
    },
    setFlashlightHealth(frac) {
      flashHealth = frac < 0 ? 0 : frac > 1 ? 1 : frac;
    },
    flashlightOn() {
      return flashOn;
    },
    update(dt, lanternTarget) {
      timeAcc += dt;
      // lantern rides with the player (first-person: a faint held glow) + flicker
      lantern.position.set(lanternTarget.x, 1.6, lanternTarget.z);
      lantern.intensity = 0.26 + Math.sin(timeAcc * 11) * 0.04 + Math.sin(timeAcc * 23) * 0.02;
      // flashlight: alive when on (tiny flicker), dark when off. As the cell
      // dies (flashHealth low) it dims and stutters — a visible low-battery warning.
      if (flashOn) {
        let b = 4.2 + Math.sin(timeAcc * 34) * 0.22 + Math.sin(timeAcc * 71) * 0.12;
        if (flashHealth < 0.28) {
          const fail = flashHealth / 0.28; // 1 → 0 as it drains
          b *= 0.45 + 0.55 * fail;
          if (Math.sin(timeAcc * 47) + Math.sin(timeAcc * 17.3) > 0.6 + fail) b *= 0.12; // brown-out stutters
        }
        flashlight.intensity = b;
      } else {
        flashlight.intensity = 0;
      }
      hearth.intensity = rooms[activeRoom].def.wing === 'save' ? 1.1 + Math.sin(timeAcc * 9) * 0.18 : 0;
      musicLamp.intensity = activeRoom === 'music_room' ? 1.7 + Math.sin(timeAcc * 8) * 0.12 : 0;
    },
    dispose() {
      crush.dispose();
      flashlight.dispose();
      lantern.dispose();
      hearth.dispose();
      musicLamp.dispose();
      (Object.keys(rooms) as RoomId[]).forEach((id) => rooms[id].node.dispose(false, true));
      ground.dispose(false, true);
      hemiLight.dispose();
      camera.dispose();
    },
  };

  return out;
}
