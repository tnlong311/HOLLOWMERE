// ══════════════════════════════════════════════
// HOLLOWMERE interactables — pickups, the save desk + item box, the library
// reshelve puzzle (3 books), the display case, the Stag Crest, and the hub
// Crest Door. Visuals + placement + proximity query live here; what each id
// DOES lives in the director (it touches inventory / puzzle / save state).
// ══════════════════════════════════════════════

import { Color3, MeshBuilder, Scene, StandardMaterial, TransformNode, Vector3 } from '@babylonjs/core';
import { createStandardMaterial, loadGlbModel } from './helpers';
import { ASSET_KEYS, TUNING, type RoomId } from './config';
import { ASSETS } from '../assets';
import type { GameWorldObjects } from './world';

// the four crest colours, in seating order (Stag / Eye / Flame / Tide)
const CREST_COLORS: [number, number, number][] = [
  [0.85, 0.7, 0.25],
  [0.42, 0.6, 0.82],
  [0.85, 0.4, 0.2],
  [0.3, 0.5, 0.7],
];

interface CrestSocket {
  mat: StandardMaterial;
  col: [number, number, number];
}

// Bespoke dressing for the hub Crest Door: a gilt arched frame + four inset
// crest sockets (dim until their crest is seated). Returns the socket materials
// so the director can light them as crestsSeated climbs.
function buildCrestDoorDressing(scene: Scene, node: TransformNode): CrestSocket[] {
  const gilt = createStandardMaterial(scene, 'crestdoor_gilt', new Color3(0.34, 0.27, 0.14), new Color3(0.12, 0.09, 0.04));
  gilt.specularColor = new Color3(0.42, 0.34, 0.16);
  const box = (w: number, h: number, dp: number, x: number, y: number, z: number) => {
    const b = MeshBuilder.CreateBox(`crestframe_${x.toFixed(1)}_${y.toFixed(1)}`, { width: w, height: h, depth: dp }, scene);
    b.material = gilt;
    b.position.set(x, y, z);
    b.parent = node;
  };
  const FZ = 0.35; // frame sits just proud of the door face (toward the room)
  box(0.55, 6.2, 0.55, -2.4, 3.1, FZ); // left pilaster
  box(0.55, 6.2, 0.55, 2.4, 3.1, FZ); // right pilaster
  box(5.7, 0.55, 0.55, 0, 6.1, FZ); // lintel
  const arch = MeshBuilder.CreateCylinder('crestdoor_arch', { diameter: 5.7, height: 0.55, tessellation: 22, arc: 0.5 }, scene);
  arch.material = gilt;
  arch.rotation.set(Math.PI / 2, 0, 0);
  arch.position.set(0, 6.1, FZ);
  arch.parent = node;
  // a keystone emblem at the apex
  box(0.7, 0.9, 0.6, 0, 6.7, FZ);

  // four sockets in a diamond on the door face
  const layout: [number, number][] = [
    [0, 4.4],
    [-1.35, 3.1],
    [1.35, 3.1],
    [0, 1.8],
  ];
  const sockets: CrestSocket[] = [];
  for (let k = 0; k < 4; k++) {
    const [sx, sy] = layout[k];
    const col = CREST_COLORS[k];
    const ring = MeshBuilder.CreateTorus(`crestsock_ring_${k}`, { diameter: 0.82, thickness: 0.14, tessellation: 18 }, scene);
    ring.material = gilt;
    ring.rotation.x = Math.PI / 2;
    ring.position.set(sx, sy, FZ + 0.15);
    ring.parent = node;
    const mat = createStandardMaterial(scene, `crestsock_${k}`, new Color3(col[0] * 0.16, col[1] * 0.16, col[2] * 0.16));
    const disc = MeshBuilder.CreateCylinder(`crestsock_disc_${k}`, { diameter: 0.58, height: 0.12, tessellation: 18 }, scene);
    disc.material = mat;
    disc.rotation.x = Math.PI / 2;
    disc.position.set(sx, sy, FZ + 0.18);
    disc.parent = node;
    sockets.push({ mat, col });
  }
  return sockets;
}

export type InteractKind = 'item' | 'savedesk' | 'book' | 'case' | 'crestdoor' | 'doc' | 'phono' | 'vault' | 'furnace' | 'valve' | 'fusebox' | 'npc';

export interface Interactable {
  id: string;
  roomId: RoomId;
  lx: number;
  lz: number;
  kind: InteractKind;
  label: string;
  node: TransformNode;
  consumed: boolean;
  placed: boolean;
  spin: boolean;
  lines?: string[];
  drop?: string; // dynamic loot drops (pistolAmmo / rifleAmmo / flare)
}

interface ItemSpec {
  id: string;
  roomId: RoomId;
  lx: number;
  lz: number;
  kind: InteractKind;
  label: string;
  asset?: string;
  color: [number, number, number];
  emissive?: boolean;
  scale?: number;
  spin?: boolean;
  blockerHalf?: number; // adds a movement blocker of this half-extent
  lines?: string[]; // NPC dialogue (cycled on each Speak)
  viz?: PickupViz; // procedural pickup model (ammo / flare) instead of a plain box
}

// Distinct procedural pickup models for consumables that have no GLB — so ammo
// reads as brass rounds / a red flare cartridge, not an anonymous yellow cube.
type PickupViz = 'pistolAmmo' | 'rifleAmmo' | 'flare' | 'battery' | 'bandage';

function buildPickupViz(scene: Scene, type: PickupViz, tag: string): TransformNode {
  const node = new TransformNode(`pickupviz_${tag}`, scene);
  const brass = createStandardMaterial(scene, `pv_brass_${tag}`, new Color3(0.72, 0.55, 0.16), new Color3(0.34, 0.24, 0.05));
  brass.specularColor = new Color3(0.9, 0.8, 0.4);
  const casing = createStandardMaterial(scene, `pv_lead_${tag}`, new Color3(0.32, 0.22, 0.12));
  if (type === 'pistolAmmo' || type === 'rifleAmmo') {
    const rifle = type === 'rifleAmmo';
    const h = rifle ? 0.3 : 0.17;
    const d = rifle ? 0.06 : 0.075;
    // a small tray the rounds sit in
    const tray = MeshBuilder.CreateBox(`pv_tray_${tag}`, { width: 0.3, height: 0.05, depth: 0.22 }, scene);
    tray.material = casing;
    tray.position.y = 0.02;
    tray.parent = node;
    // a little cluster of standing cartridges (brass body + darker tip)
    const spots = rifle ? [[-0.07, 0], [0, 0], [0.07, 0]] : [[-0.07, -0.05], [0.02, -0.05], [-0.03, 0.05], [0.07, 0.05]];
    for (let i = 0; i < spots.length; i++) {
      const [x, z] = spots[i];
      const body = MeshBuilder.CreateCylinder(`pv_round_${tag}_${i}`, { diameter: d, height: h, tessellation: 8 }, scene);
      body.material = brass;
      body.position.set(x, 0.04 + h / 2, z);
      body.parent = node;
      const tip = MeshBuilder.CreateCylinder(`pv_tip_${tag}_${i}`, { diameterTop: d * 0.25, diameterBottom: d, height: h * 0.34, tessellation: 8 }, scene);
      tip.material = casing;
      tip.position.set(x, 0.04 + h + h * 0.14, z);
      tip.parent = node;
    }
  } else if (type === 'battery') {
    // battery: a dark cell with a bright terminal cap + a glowing charge stripe
    const shell = createStandardMaterial(scene, `pv_batt_${tag}`, new Color3(0.16, 0.18, 0.2));
    const cap = createStandardMaterial(scene, `pv_battcap_${tag}`, new Color3(0.75, 0.7, 0.3), new Color3(0.4, 0.36, 0.12));
    const stripe = createStandardMaterial(scene, `pv_battstr_${tag}`, new Color3(0.3, 0.85, 0.45), new Color3(0.15, 0.6, 0.25));
    const body = MeshBuilder.CreateCylinder(`pv_battbody_${tag}`, { diameter: 0.14, height: 0.3, tessellation: 12 }, scene);
    body.material = shell;
    body.position.y = 0.19;
    body.parent = node;
    const nub = MeshBuilder.CreateCylinder(`pv_battnub_${tag}`, { diameter: 0.06, height: 0.05, tessellation: 8 }, scene);
    nub.material = cap;
    nub.position.y = 0.37;
    nub.parent = node;
    const band = MeshBuilder.CreateCylinder(`pv_battband_${tag}`, { diameter: 0.145, height: 0.06, tessellation: 12 }, scene);
    band.material = stripe;
    band.position.y = 0.16;
    band.parent = node;
  } else if (type === 'bandage') {
    // bandage: a white gauze roll with a red cross
    const gauze = createStandardMaterial(scene, `pv_gauze_${tag}`, new Color3(0.86, 0.84, 0.78), new Color3(0.3, 0.29, 0.27));
    const cross = createStandardMaterial(scene, `pv_cross_${tag}`, new Color3(0.72, 0.12, 0.12), new Color3(0.4, 0.05, 0.05));
    const roll = MeshBuilder.CreateCylinder(`pv_roll_${tag}`, { diameter: 0.26, height: 0.16, tessellation: 16 }, scene);
    roll.material = gauze;
    roll.rotation.x = Math.PI / 2;
    roll.position.y = 0.16;
    roll.parent = node;
    const c1 = MeshBuilder.CreateBox(`pv_cross1_${tag}`, { width: 0.14, height: 0.045, depth: 0.02 }, scene);
    c1.material = cross;
    c1.position.set(0, 0.16, 0.09);
    c1.parent = node;
    const c2 = MeshBuilder.CreateBox(`pv_cross2_${tag}`, { width: 0.045, height: 0.14, depth: 0.02 }, scene);
    c2.material = cross;
    c2.position.set(0, 0.16, 0.09);
    c2.parent = node;
  } else {
    // flare: a red cartridge with a dark cap and a glowing orange tip
    const red = createStandardMaterial(scene, `pv_red_${tag}`, new Color3(0.82, 0.16, 0.12), new Color3(0.4, 0.06, 0.04));
    const cap = createStandardMaterial(scene, `pv_cap_${tag}`, new Color3(0.15, 0.15, 0.17));
    const glow = createStandardMaterial(scene, `pv_glow_${tag}`, new Color3(1.0, 0.62, 0.2), new Color3(1.0, 0.55, 0.15));
    const body = MeshBuilder.CreateCylinder(`pv_flarebody_${tag}`, { diameter: 0.13, height: 0.34, tessellation: 12 }, scene);
    body.material = red;
    body.position.y = 0.21;
    body.parent = node;
    const capMesh = MeshBuilder.CreateCylinder(`pv_flarecap_${tag}`, { diameter: 0.14, height: 0.06, tessellation: 12 }, scene);
    capMesh.material = cap;
    capMesh.position.y = 0.05;
    capMesh.parent = node;
    const tip = MeshBuilder.CreateCylinder(`pv_flaretip_${tag}`, { diameterTop: 0.03, diameterBottom: 0.11, height: 0.08, tessellation: 12 }, scene);
    tip.material = glow;
    tip.position.y = 0.42;
    tip.parent = node;
  }
  return node;
}

const SPECS: ItemSpec[] = [
  // Drawing Room (save)
  { id: 'savedesk', roomId: 'drawing', lx: -3.2, lz: -2.6, kind: 'savedesk', label: 'Ledger & Item Box', asset: ASSET_KEYS.props.itemBox, color: [0.3, 0.22, 0.13], scale: 1.4, blockerHalf: 0.7 },
  { id: 'brass_key', roomId: 'drawing', lx: -3.2, lz: -2.6, kind: 'item', label: 'Brass Key', asset: ASSET_KEYS.props.brassKey, color: [0.78, 0.6, 0.2], emissive: true, scale: 0.6, spin: true },
  { id: 'ink_1', roomId: 'drawing', lx: 2.6, lz: 2.4, kind: 'item', label: 'Ink Vial', asset: ASSET_KEYS.props.inkVial, color: [0.3, 0.35, 0.6], emissive: true, scale: 0.5, spin: true },
  { id: 'pistol', roomId: 'drawing', lx: 3.0, lz: -2.4, kind: 'item', label: 'Service Pistol', asset: ASSET_KEYS.props.pistol, color: [0.4, 0.4, 0.45], emissive: true, scale: 0.7, spin: true },
  // Corridor
  { id: 'flare_1', roomId: 'corridor', lx: -1.8, lz: 4, kind: 'item', label: 'Flare', asset: ASSET_KEYS.props.flareGun, color: [0.9, 0.45, 0.15], emissive: true, scale: 0.55, spin: true },
  { id: 'battery_1', roomId: 'drawing', lx: 3.4, lz: 2.4, kind: 'item', label: 'Battery Cell', color: [0.3, 0.8, 0.45], emissive: true, scale: 0.5, spin: true, viz: 'battery' },
  { id: 'bandage_1', roomId: 'corridor', lx: 1.8, lz: 4, kind: 'item', label: 'Bandage', color: [0.85, 0.83, 0.78], emissive: true, scale: 0.5, spin: true, viz: 'bandage' },
  // Library — the reshelve puzzle + the case
  { id: 'book_0', roomId: 'library', lx: -5.5, lz: -6, kind: 'book', label: 'Misshelved Book (Stag)', asset: ASSET_KEYS.props.book, color: [0.5, 0.18, 0.16], scale: 0.7, spin: false },
  { id: 'book_1', roomId: 'library', lx: 0, lz: -6.4, kind: 'book', label: 'Misshelved Book (Tide)', asset: ASSET_KEYS.props.book, color: [0.16, 0.3, 0.5], scale: 0.7, spin: false },
  { id: 'book_2', roomId: 'library', lx: 5.5, lz: -6, kind: 'book', label: 'Misshelved Book (Flame)', asset: ASSET_KEYS.props.book, color: [0.55, 0.4, 0.12], scale: 0.7, spin: false },
  { id: 'display_case', roomId: 'library', lx: 5.5, lz: 6, kind: 'case', label: 'Display Case', asset: ASSET_KEYS.props.displayCase, color: [0.2, 0.25, 0.28], scale: 1.6, blockerHalf: 0.8 },
  { id: 'stag_crest', roomId: 'library', lx: 5.5, lz: 4.4, kind: 'item', label: 'Stag Crest', asset: ASSET_KEYS.props.stagCrest, color: [0.85, 0.7, 0.25], emissive: true, scale: 0.8, spin: true },
  // Study
  { id: 'doc_clue', roomId: 'study', lx: 0, lz: -2.8, kind: 'doc', label: "Librarian's Note", asset: ASSET_KEYS.props.logbook, color: [0.7, 0.65, 0.5], emissive: true, scale: 0.5, spin: true },
  { id: 'shells_1', roomId: 'study', lx: 2.6, lz: 1.8, kind: 'item', label: 'Pistol Ammo', color: [0.6, 0.5, 0.2], emissive: true, scale: 0.45, spin: true, viz: 'pistolAmmo' },
  { id: 'fenmoss_1', roomId: 'study', lx: -2.6, lz: 1.8, kind: 'item', label: 'Fenmoss', asset: ASSET_KEYS.props.fenmoss, color: [0.3, 0.7, 0.35], emissive: true, scale: 0.5, spin: true },
  // Hall — the Crest Door
  { id: 'crest_door', roomId: 'hall', lx: 5.5, lz: -8, kind: 'crestdoor', label: 'Crest Door', asset: ASSET_KEYS.props.crestDoor, color: [0.28, 0.2, 0.12], scale: 2.4, blockerHalf: 1.2 },
  // Conservatory — herbs + the Tide-valve (revealed when the Bloom dies)
  { id: 'bluecap_1', roomId: 'conservatory', lx: -8, lz: -6, kind: 'item', label: 'Bluecap', asset: ASSET_KEYS.props.bluecap, color: [0.3, 0.42, 0.75], emissive: true, scale: 0.5, spin: true },
  { id: 'redcap_1', roomId: 'conservatory', lx: -8, lz: 6, kind: 'item', label: 'Redcap', asset: ASSET_KEYS.props.redcap, color: [0.72, 0.26, 0.24], emissive: true, scale: 0.5, spin: true },
  { id: 'tide_valve', roomId: 'conservatory', lx: 0, lz: 2, kind: 'item', label: 'Tide-Valve Wheel', asset: ASSET_KEYS.props.tideValve, color: [0.5, 0.42, 0.2], emissive: true, scale: 1.0, spin: true },
  // West Wing — Music Room
  { id: 'phonograph', roomId: 'music_room', lx: 0, lz: 3, kind: 'phono', label: 'Phonograph', asset: ASSET_KEYS.props.phonograph, color: [0.5, 0.4, 0.2], scale: 1.3, blockerHalf: 0.7 },
  { id: 'shard_0', roomId: 'music_room', lx: -4, lz: 3, kind: 'item', label: 'Cylinder Shard', asset: ASSET_KEYS.props.cylinderShard, color: [0.75, 0.72, 0.6], emissive: true, scale: 0.45, spin: true },
  { id: 'lever_rifle', roomId: 'music_room', lx: 4, lz: -3, kind: 'item', label: 'Lever Rifle', asset: ASSET_KEYS.props.leverRifle, color: [0.42, 0.3, 0.2], emissive: true, scale: 0.7, spin: true },
  // West Wing — Long Gallery
  { id: 'shard_1', roomId: 'long_gallery', lx: -3, lz: -4, kind: 'item', label: 'Cylinder Shard', asset: ASSET_KEYS.props.cylinderShard, color: [0.75, 0.72, 0.6], emissive: true, scale: 0.45, spin: true },
  { id: 'shard_2', roomId: 'long_gallery', lx: 3, lz: 4, kind: 'item', label: 'Cylinder Shard', asset: ASSET_KEYS.props.cylinderShard, color: [0.75, 0.72, 0.6], emissive: true, scale: 0.45, spin: true },
  { id: 'silver_key', roomId: 'long_gallery', lx: -3.5, lz: 8, kind: 'item', label: 'Silver Key', asset: ASSET_KEYS.props.silverKey, color: [0.7, 0.72, 0.78], emissive: true, scale: 0.55, spin: true },
  { id: 'vault', roomId: 'long_gallery', lx: 3.4, lz: 9.2, kind: 'vault', label: 'Gallery Vault', asset: ASSET_KEYS.props.vaultDoor, color: [0.25, 0.25, 0.3], scale: 1.9, blockerHalf: 0.9 },
  { id: 'eye_crest', roomId: 'long_gallery', lx: 3.4, lz: 7.6, kind: 'item', label: 'Eye Crest', asset: ASSET_KEYS.props.eyeCrest, color: [0.42, 0.6, 0.82], emissive: true, scale: 0.8, spin: true },
  // Boiler Room — Flame crest (furnace + oil), fuses, iron key
  { id: 'furnace', roomId: 'boiler', lx: 0, lz: -5, kind: 'furnace', label: 'Furnace', asset: ASSET_KEYS.props.furnace, color: [0.3, 0.18, 0.12], scale: 1.8, blockerHalf: 0.9 },
  { id: 'oil_can', roomId: 'boiler', lx: -3.5, lz: 3, kind: 'item', label: 'Oil Can', asset: ASSET_KEYS.props.oilCan, color: [0.4, 0.35, 0.2], emissive: true, scale: 0.5, spin: true },
  { id: 'iron_key', roomId: 'boiler', lx: 3.5, lz: -3, kind: 'item', label: 'Iron Key', asset: ASSET_KEYS.props.ironKey, color: [0.3, 0.3, 0.32], emissive: true, scale: 0.5, spin: true },
  { id: 'fuse_box', roomId: 'boiler', lx: 4.5, lz: 2, kind: 'fusebox', label: 'Fuse Box', asset: ASSET_KEYS.props.fuseBox, color: [0.3, 0.3, 0.3], scale: 1.0, blockerHalf: 0.4 },
  { id: 'flame_crest', roomId: 'boiler', lx: 0, lz: -3.4, kind: 'item', label: 'Flame Crest', asset: ASSET_KEYS.props.flameCrest, color: [0.85, 0.4, 0.2], emissive: true, scale: 0.8, spin: true },
  // The Cistern — Leviathan + valve console (Tide crest)
  { id: 'valve_console', roomId: 'cistern', lx: -8, lz: 0, kind: 'valve', label: 'Tide-Valve Console', asset: ASSET_KEYS.props.valveConsole, color: [0.3, 0.34, 0.4], scale: 1.6, blockerHalf: 0.8 },
  { id: 'tide_crest', roomId: 'cistern', lx: 0, lz: 4, kind: 'item', label: 'Tide Crest', asset: ASSET_KEYS.props.tideCrest, color: [0.3, 0.5, 0.7], emissive: true, scale: 0.8, spin: true },
  // Chapel — bone key (opens the reliquary lift to the Lab)
  { id: 'bone_key', roomId: 'chapel', lx: -3, lz: 0, kind: 'item', label: 'Bone Key', asset: ASSET_KEYS.props.boneKey, color: [0.8, 0.78, 0.62], emissive: true, scale: 0.5, spin: true },
  // Lab — Hand-Cannon, blood sample (true-ending), keycard
  { id: 'hand_cannon', roomId: 'lab', lx: -5, lz: 0, kind: 'item', label: 'Hand-Cannon', asset: ASSET_KEYS.props.handCannon, color: [0.5, 0.5, 0.55], emissive: true, scale: 0.7, spin: true },
  { id: 'blood_sample', roomId: 'lab', lx: 5, lz: 0, kind: 'item', label: 'Blood Sample', asset: ASSET_KEYS.props.bloodSample, color: [0.6, 0.12, 0.12], emissive: true, scale: 0.45, spin: true },
  { id: 'keycard', roomId: 'lab', lx: 5, lz: 5, kind: 'item', label: 'Keycard', asset: ASSET_KEYS.props.keycard, color: [0.3, 0.5, 0.6], emissive: true, scale: 0.4, spin: true },
  // ── v3.3 expansion: attic key + the two NPCs ──
  { id: 'attic_key', roomId: 'nursery', lx: 4.8, lz: -3, kind: 'item', label: 'Attic Key', asset: ASSET_KEYS.props.ironKey, color: [0.8, 0.62, 0.24], emissive: true, scale: 0.5, spin: true },
  {
    id: 'marion', roomId: 'containment', lx: -5, lz: -1, kind: 'npc', label: 'Marion', asset: ASSET_KEYS.chars.marion, color: [0.62, 0.68, 0.66], scale: 1.7, blockerHalf: 0.5,
    lines: [
      'Wren…? No — stay back. Don’t touch the glass. The rot’s in my arm now.',
      'It was the Founder. Lucian. He’s below us — in the lamp, fused to the lens.',
      'There’s a serum. The lab bench — I wrote the synthesis down. Make it. Please.',
      'And if I turn before you’re done… burn me. Promise me you’ll use the flare.',
    ],
  },
  {
    id: 'ysolde', roomId: 'chapel', lx: 3.5, lz: -6, kind: 'npc', label: 'Sister Ysolde', asset: ASSET_KEYS.chars.ysolde, color: [0.78, 0.75, 0.68], scale: 1.7, blockerHalf: 0.5,
    lines: [
      'You feel it too — the house drawing breath. Sit. Confess, if it eases you.',
      'Aldous was a good man. The Steward. Grief hollowed him; he only means to tidy the dead.',
      'The silver key lies on the altar. The crypt is beneath us. God forgive what the Founder buried there.',
      'I will keep the vigil here. Go, child — while the light still holds.',
    ],
  },
];

export interface ItemField {
  list: Interactable[];
  setActiveRoom(id: RoomId, world: GameWorldObjects): void;
  nearest(playerPos: Vector3, roomId: RoomId): Interactable | null;
  byId(id: string): Interactable | undefined;
  consume(id: string): void;
  reveal(id: string): void;
  hide(id: string): void;
  setCrestSockets(seated: number): void;
  spawnPickup(world: GameWorldObjects, drop: string, roomId: RoomId, lx: number, lz: number): void;
  update(dt: number): void;
  dispose(): void;
}

export function createItemField(scene: Scene): ItemField {
  // LLM-EXTENSION:ITEMS — interactables (pickups, save desk, puzzle books,
  // display case, crests) + their placement & proximity rules.
  // DO NOT REMOVE the LLM-EXTENSION:ITEMS tag — templates/3d/scripts/check-architecture.mjs requires it to appear exactly once across the src tree.
  const list: Interactable[] = [];
  let activeRoom: RoomId = 'hall';
  let spinT = 0;
  let dropCounter = 0;
  let crestSockets: CrestSocket[] = [];

  SPECS.forEach((spec, i) => {
    const node = new TransformNode(`item_${spec.id}`, scene);
    const mat = createStandardMaterial(
      scene,
      `item_${spec.id}_${i}`,
      new Color3(spec.color[0], spec.color[1], spec.color[2]),
      spec.emissive ? new Color3(spec.color[0] * 0.5, spec.color[1] * 0.5, spec.color[2] * 0.5) : undefined,
    );
    const fb = MeshBuilder.CreateBox(`item_${spec.id}_fb`, { size: 0.5 }, scene);
    fb.material = mat;
    fb.position.y = spec.kind === 'item' || spec.kind === 'doc' ? 0.9 : 0.5;
    fb.parent = node;
    if (spec.viz) {
      // procedural consumable model (ammo / flare) — replaces the plain box
      const viz = buildPickupViz(scene, spec.viz, spec.id);
      viz.parent = node;
      viz.position.y = 0.75;
      fb.setEnabled(false);
    } else if (spec.asset && ASSETS[spec.asset]) {
      void loadGlbModel(scene, ASSETS[spec.asset], `item_${spec.id}`).then((loaded) => {
        if (!loaded) return;
        const { min, max } = loaded.root.getHierarchyBoundingVectors(true);
        const ext = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) || 1;
        // NPCs scale by HEIGHT to a human ~1.7m and stand feet-on-floor; others by max extent.
        const s = spec.kind === 'npc'
          ? (spec.scale ?? 1.7) / ((max.y - min.y) || 1.7)
          : ((spec.scale ?? 1) / ext) * (spec.kind === 'item' || spec.kind === 'doc' ? 1 : 2.4);
        loaded.root.scaling.setAll(s);
        loaded.root.position.y = -min.y * s + (spec.kind === 'item' ? 0.6 : 0);
        loaded.root.parent = node;
        fb.setEnabled(false);
      });
    }
    if (spec.id === 'crest_door') crestSockets = buildCrestDoorDressing(scene, node);
    node.setEnabled(false);
    const it: Interactable = {
      id: spec.id,
      roomId: spec.roomId,
      lx: spec.lx,
      lz: spec.lz,
      kind: spec.kind,
      label: spec.label,
      node,
      consumed: false,
      placed: false,
      spin: !!spec.spin,
      lines: spec.lines,
    };
    // hidden until revealed by the director (crest in the case; valve when the Bloom dies)
    if (['stag_crest', 'tide_valve', 'eye_crest', 'flame_crest', 'tide_crest'].includes(spec.id)) it.consumed = true;
    list.push(it);
  });

  // register blockers once on first placement
  const blockerSpecs = SPECS.filter((s) => s.blockerHalf);

  const place = (it: Interactable, world: GameWorldObjects) => {
    const c = world.roomCenter(it.roomId);
    it.node.position.set(c.x + it.lx, c.y, c.z + it.lz);
    it.placed = true;
    const bs = blockerSpecs.find((s) => s.id === it.id);
    if (bs) world.addBlocker(it.roomId, { x: it.lx, z: it.lz, hw: bs.blockerHalf!, hd: bs.blockerHalf! });
  };

  const refresh = (world: GameWorldObjects) => {
    for (const it of list) {
      if (it.roomId === activeRoom && !it.placed) place(it, world);
      const on = it.roomId === activeRoom && !it.consumed;
      it.node.setEnabled(on);
    }
  };

  return {
    list,
    setActiveRoom(id, world) {
      activeRoom = id;
      refresh(world);
    },
    nearest(playerPos, roomId) {
      let best: Interactable | null = null;
      let bestD: number = TUNING.interactRange;
      for (const it of list) {
        if (it.roomId !== roomId || it.consumed) continue;
        const d = Math.hypot(playerPos.x - it.node.position.x, playerPos.z - it.node.position.z);
        if (d <= bestD) {
          best = it;
          bestD = d;
        }
      }
      return best;
    },
    byId(id) {
      return list.find((i) => i.id === id);
    },
    consume(id) {
      const it = list.find((i) => i.id === id);
      if (it) {
        it.consumed = true;
        it.node.setEnabled(false);
      }
    },
    reveal(id) {
      const it = list.find((i) => i.id === id);
      if (it) {
        it.consumed = false;
        it.node.setEnabled(it.roomId === activeRoom);
      }
    },
    hide(id) {
      const it = list.find((i) => i.id === id);
      if (it) it.node.setEnabled(false);
    },
    spawnPickup(world, drop, roomId, lx, lz) {
      const id = `drop_${dropCounter++}`;
      const node = new TransformNode(`item_${id}`, scene);
      // distinct procedural model per loot type (brass rounds / red flare)
      const vizType: PickupViz =
        drop === 'flare' ? 'flare' : drop === 'rifleAmmo' ? 'rifleAmmo' : drop === 'battery' ? 'battery' : drop === 'bandage' ? 'bandage' : 'pistolAmmo';
      const viz = buildPickupViz(scene, vizType, id);
      viz.parent = node;
      viz.position.y = 0.7;
      const it: Interactable = {
        id,
        roomId,
        lx,
        lz,
        kind: 'item',
        label:
          drop === 'flare' ? 'Flare' : drop === 'rifleAmmo' ? 'Rifle Rounds' : drop === 'battery' ? 'Battery Cell' : drop === 'bandage' ? 'Bandage' : 'Pistol Rounds',
        node,
        consumed: false,
        placed: false,
        spin: true,
        drop,
      };
      list.push(it);
      // place immediately if it's dropping into the active room
      if (roomId === activeRoom) {
        const c = world.roomCenter(roomId);
        node.position.set(c.x + lx, c.y, c.z + lz);
        it.placed = true;
        node.setEnabled(true);
      } else {
        node.setEnabled(false);
      }
    },
    setCrestSockets(seated) {
      for (let k = 0; k < crestSockets.length; k++) {
        const { mat, col } = crestSockets[k];
        if (k < seated) {
          mat.diffuseColor.set(col[0], col[1], col[2]);
          mat.emissiveColor.set(col[0] * 0.9, col[1] * 0.9, col[2] * 0.9); // lit socket blazes
        } else {
          mat.diffuseColor.set(col[0] * 0.16, col[1] * 0.16, col[2] * 0.16);
          mat.emissiveColor.set(0, 0, 0);
        }
      }
    },
    update(dt) {
      spinT += dt;
      for (const it of list) {
        if (it.spin && !it.consumed && it.node.isEnabled()) {
          it.node.rotation.y = spinT * 1.4;
          it.node.position.y = (it.node.position.y || 0); // y already room-y; bob handled by child offset
        }
      }
    },
    dispose() {
      for (const it of list) it.node.dispose(false, true);
    },
  };
}
