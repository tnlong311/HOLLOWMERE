// ══════════════════════════════════════════════
// HOLLOWMERE runtime config — engine params + the whole vertical-slice layout
// (rooms, fixed-camera poses, doors, interactables, enemy spawns, tuning).
// Fixed-camera survival horror: realistic 3D crushed to pixel.
// ══════════════════════════════════════════════

export const RUNTIME_CONFIG = {
  engine: {
    antialias: false, // pixel-crush look wants no AA
    // The final image is downsampled + pixelated by hmCrush, so rendering at
    // full retina res is wasted GPU. Ignore devicePixelRatio and render at a
    // fraction of CSS pixels — the crush hides the softness, framerate soars.
    adaptToDeviceRatio: false,
    preserveDrawingBuffer: true,
    stencil: true,
    lowMemoryHardwareScaling: 2.0,
    defaultHardwareScaling: 1.5,
  },
  camera: {
    alpha: -Math.PI / 2,
    beta: Math.PI / 3,
    radius: 10,
    minZ: 0.1,
    maxZ: 400,
    lowerRadiusLimit: 4,
    upperRadiusLimit: 22,
  },
  world: {
    clearColor: '#05060a',
    groundSize: 24,
    fallRecoveryY: -18,
  },
  physics: {
    gravityY: -9.81,
  },
} as const;

export type RuntimeConfig = typeof RUNTIME_CONFIG;

// ── Pixel-crush post-process defaults ───────────────────────────────
export const PIXEL = {
  pixelSize: 3.0, // higher = chunkier pixels
  levels: 16.0, // posterize steps per channel
  ditherAmt: 0.4,
  vignette: 0.38,
  grain: 0.05,
} as const;

// ── Per-wing palette tints (the palette IS the wayfinding) ──────────
export const WING_TINT: Record<string, [number, number, number]> = {
  manor: [1.04, 0.96, 0.82], // amber
  save: [1.08, 0.92, 0.74], // warmer amber haven
  chapel: [0.92, 0.94, 1.0], // bone-grey
  cellar: [0.74, 0.86, 1.04], // tidal blue-black
  rot: [0.86, 1.04, 0.82], // conservatory rot-green
  lab: [0.82, 1.0, 1.06], // glasshouse-lab sterile cyan
  storm: [0.8, 0.86, 1.1], // lighthouse lamp-room: cold storm-blue with a lantern-warm core
};

// ── Gameplay tuning ─────────────────────────────────────────────────
export const TUNING = {
  walkSpeed: 3.0,
  runSpeed: 6.0,
  turnLerp: 0.22,
  eyeHeight: 1.65, // first-person camera height
  lookSensitivity: 0.0042, // radians per touch-drag-pixel
  mouseSensitivity: 0.0022, // radians per mouse-move-pixel (pointer lock)
  pitchClamp: 1.1, // max look up/down (radians)
  interactRange: 2.4,
  attackRange: 2.6,
  // enemy — tuned HARD for true survival-horror (scarce resources + relentless dead)
  enemyWanderSpeed: 1.6,
  enemyChaseSpeed: 3.55, // faster than a walk — the dead run you down
  enemySightRange: 14.0, // they notice you from across the room
  enemyGrabRange: 1.6,
  enemyMaxHp: 5, // more hits to drop
  ripenSeconds: 6.5, // corpses reanimate FAST — you must burn, and fast
  ripenedHpBonus: 4,
  respawnMin: 16, // unburned Sallowed return sooner (only fire is permanent)
  respawnMax: 24,
  // steward — a heavier, faster, quicker-to-recover pursuer
  stewardSpeed: 3.1,
  stewardDownThreshold: 9, // hits to down
  stewardDownSeconds: 5,
  // player
  playerMaxHp: 100,
  grabDamagePerSec: 29, // a grab is now genuinely lethal in seconds
  bleedThreshold: 35, // below this = "Danger" gait/LUT
  cautionThreshold: 70,
  // ── survival systems ──
  sprintSpeed: 5.2, // hold Shift — outrun the dead, briefly
  staminaMax: 100,
  sprintDrain: 34, // stamina/sec while sprinting
  staminaRegen: 16, // stamina/sec recovered when not sprinting
  staminaFloor: 8, // can't restart a sprint until stamina climbs back above this
  batteryMax: 100,
  batteryDrain: 3.1, // %/sec the flashlight burns through the cell
  startBattery: 100,
  batteryPickup: 55, // % restored by a spare cell
  startBandages: 2,
  bindDuration: 2.4, // seconds spent binding a wound (vulnerable, rooted)
  bindHeal: 45, // hp restored per bandage
  startBatteries: 0, // spare cells carried (the one in the torch is separate)
  // weapons
  pistolDamage: 1,
  shotgunDamage: 3,
  daggerDamage: 1,
  flareDamage: 2, // and burns -> permadeath
  // Conservatory / Bloom boss + new enemies
  bloomNodes: 3, // burnable heart-nodes
  bloomNodeHp: 8, // damage per node (flare deals extra)
  bloomSpitInterval: 2.8, // seconds between spore spits
  bloomSporeDamage: 10, // AoE spore damage when you stand in the arena
  weeperRange: 14, // ranged acid spit range
  weeperSpitDamage: 15, // per acid hit
  weeperSpitInterval: 1.7,
  houndSpeed: 4.9, // fast pack hound
  houndMaxHp: 4,
  // West Wing: Crawler (ceiling-drop) + Lever Rifle
  crawlerSpeed: 5.6, // very fast once it drops
  crawlerMaxHp: 4,
  crawlerDropRange: 9, // drops from the ceiling when you come this close
  rifleDamage: 2, // precise, hits hard
  startRifleAmmo: 6,
  // Cellars/Cistern: Leviathan boss + Drowned
  leviathanNodes: 4, // weak-points (gills) to destroy once exposed
  leviathanNodeHp: 11,
  drownedMaxHp: 9, // slow + very tanky
  drownedSpeed: 1.9,
  // Lab: Steward final form (multi-node climax boss)
  stewardFinalNodes: 5,
  stewardFinalNodeHp: 12,
  // Lighthouse: the Founder (true-ending boss)
  founderNodes: 4,
  founderNodeHp: 14,
  // economy (start loadout — scarce; lean on drops + careful play)
  startPistolAmmo: 8,
  startShotgunAmmo: 0,
  startFlares: 1,
  startInk: 2,
} as const;

// ── Asset keys (resolved from src/assets.ts; fall back to primitives) ─
export const ASSET_KEYS = {
  rooms: {
    hall: 'env_great_hall',
    corridor: 'env_east_corridor',
    drawing: 'env_drawing_room',
    library: 'env_library',
    study: 'env_study',
  },
  chars: {
    courier: 'char_courier',
    sallowed: 'char_sallowed',
    steward: 'char_steward',
    bloom: 'char_bloom',
    weeper: 'char_weeper',
    hollowhound: 'char_hollowhound',
    tended: 'char_tended',
    crawler: 'char_crawler',
    leviathan: 'char_leviathan',
    drowned: 'char_drowned',
    stewardFinal: 'char_steward_final',
    founder: 'char_founder',
    marion: 'marion',
    ysolde: 'ysolde',
  },
  props: {
    crestDoor: 'prop_crest_door',
    stagCrest: 'prop_stag_crest',
    displayCase: 'prop_display_case',
    itemBox: 'prop_item_box',
    book: 'prop_book',
    lantern: 'prop_lantern',
    dagger: 'weapon_dagger',
    pistol: 'weapon_pistol',
    shotgun: 'weapon_shotgun',
    flareGun: 'weapon_flare_gun',
    brassKey: 'item_brass_key',
    inkVial: 'item_ink_vial',
    fenmoss: 'item_fenmoss',
    bloomNode: 'prop_bloom_node',
    tideValve: 'prop_tide_valve',
    planter: 'prop_planter',
    topiary: 'prop_topiary',
    barrow: 'prop_barrow',
    sporePod: 'prop_spore_pod',
    bluecap: 'item_bluecap',
    redcap: 'item_redcap',
    phonograph: 'prop_phonograph',
    cylinderShard: 'prop_cylinder_shard',
    eyeCrest: 'prop_eye_crest',
    vaultDoor: 'prop_vault_door',
    portraitEyes: 'prop_portrait_eyes',
    grandPiano: 'prop_grand_piano',
    pedestal: 'prop_pedestal',
    silverKey: 'item_silver_key',
    leverRifle: 'weapon_lever_rifle',
    flameCrest: 'prop_flame_crest',
    tideCrest: 'prop_tide_crest',
    furnace: 'prop_furnace',
    fuseBox: 'prop_fuse_box',
    valveConsole: 'prop_valve_console',
    ironKey: 'item_iron_key',
    wineRack: 'prop_wine_rack',
    pipes: 'prop_pipes',
    oilCan: 'prop_oil_can',
    altar: 'prop_altar',
    reliquary: 'prop_reliquary',
    boneKey: 'prop_bone_key',
    specimenTank: 'prop_specimen_tank',
    labConsole: 'prop_lab_console',
    bloodApparatus: 'prop_blood_apparatus',
    keycard: 'prop_keycard',
    bloodSample: 'prop_blood_sample',
    pew: 'prop_pew',
    labGurney: 'prop_lab_gurney',
    handCannon: 'weapon_hand_cannon',
    // Lighthouse / true-ending set
    boat: 'prop_boat',
    lampMechanism: 'prop_lamp_mechanism',
    lighthouseLens: 'prop_lighthouse_lens',
    spiralStair: 'prop_spiral_stair',
    stormWindow: 'prop_storm_window',
    logbook: 'prop_logbook',
    ropeCoil: 'prop_rope_coil',
    barrel: 'prop_barrel',
    anchor: 'prop_anchor',
    lanternPost: 'prop_lantern_post',
    signalFlare: 'item_signal_flare',
    // Decor pass (1GB push) — atmospheric props sprinkled across the wings.
    // glbDecor() no-ops if a key's asset failed to generate, so these are safe.
    // NB gen wrote these bundle keys WITHOUT a prop_ prefix (unlike the lighthouse set).
    suitOfArmor: 'suit_of_armor',
    grandfatherClock: 'grandfather_clock',
    ironChandelier: 'iron_chandelier',
    antiqueGlobe: 'antique_globe',
    readingLectern: 'reading_lectern',
    crackedUrn: 'cracked_urn',
    coalHeap: 'coal_heap',
    candelabra: 'candelabra',
    boneReliquary: 'bone_reliquary',
    specimenJars: 'specimen_jars',
    rolltopDesk: 'rolltop_desk',
    crystalChandelierBroken: 'crystal_chandelier_broken',
    huntTapestry: 'hunt_tapestry',
    waterBarrels: 'water_barrels',
  },
} as const;

export type RoomId =
  | 'hall' | 'corridor' | 'drawing' | 'library' | 'study'
  | 'conservatory' | 'long_gallery' | 'music_room' | 'boiler' | 'cistern' | 'chapel' | 'lab' | 'lighthouse'
  // v3.3 bible expansion: upper floor, attic, kitchen/dining, crypt, containment
  | 'landing' | 'iseult_room' | 'nursery' | 'sister_room' | 'attic_loft'
  | 'dining' | 'kitchen' | 'crypt' | 'containment';

export interface CamPose {
  alpha: number;
  beta: number;
  radius: number;
  // target is room-center + this offset
  target: [number, number, number];
}

export interface RoomExit {
  id: string;
  to: RoomId;
  // local position of the doorway within this room
  at: [number, number];
  label: string;
  locked?: boolean;
  requiresKey?: 'brassKey' | 'boneKey' | 'atticKey';
  noFrame?: boolean; // stairs / hatches / sliding tombs — skip the drawn door frame
  walkUp?: boolean; // walkable stair — walk into it to pass through
  noPrompt?: boolean; // suppress the USE prompt entirely (only for reliable climb zones)
  // entry position (local) + facing yaw in destination room
  entryLocal: [number, number];
}

export interface RoomDef {
  id: RoomId;
  wing: keyof typeof WING_TINT;
  name: string;
  center: [number, number, number];
  size: [number, number]; // width(x) x depth(z)
  cam: CamPose;
  exits: RoomExit[];
  spawnLocal: [number, number]; // first-time arrival spot
}

// Rooms laid far apart in one scene; only the active room is enabled.
export const ROOMS: Record<RoomId, RoomDef> = {
  hall: {
    id: 'hall',
    wing: 'manor',
    name: 'Great Hall',
    center: [0, 0, 0],
    size: [16, 18],
    cam: { alpha: -Math.PI / 2, beta: 0.72, radius: 15, target: [0, 1.0, 0] },
    spawnLocal: [0, 7],
    exits: [
      { id: 'hall_to_corridor', to: 'corridor', at: [0, -8.6], label: 'East passage', entryLocal: [0, 8] },
      { id: 'hall_to_drawing', to: 'drawing', at: [-7.6, 0], label: 'Drawing Room', entryLocal: [4.4, 0] },
      { id: 'hall_to_conservatory', to: 'conservatory', at: [7.6, 0], label: 'Conservatory', entryLocal: [-9, 0] },
      { id: 'hall_to_gallery', to: 'long_gallery', at: [0, 8.6], label: 'West Wing — Long Gallery', entryLocal: [0, -9] },
      { id: 'hall_to_landing', to: 'landing', at: [-4, -0.4], label: 'Grand Staircase (up)', noFrame: true, walkUp: true, noPrompt: true, entryLocal: [0, 3.5] },
    ],
  },
  corridor: {
    id: 'corridor',
    wing: 'manor',
    name: 'East Corridor',
    center: [0, 0, -130],
    size: [7, 20],
    cam: { alpha: -Math.PI / 2, beta: 0.7, radius: 15, target: [0, 1.0, 0] },
    spawnLocal: [0, 9],
    exits: [
      { id: 'corridor_to_hall', to: 'hall', at: [0, 9.4], label: 'Great Hall', entryLocal: [0, -8] },
      {
        id: 'corridor_to_library',
        to: 'library',
        at: [0, -9.4],
        label: 'Library',
        locked: true,
        requiresKey: 'brassKey',
        entryLocal: [0, 7],
      },
      { id: 'corridor_to_boiler', to: 'boiler', at: [3.4, 0], label: 'Cellar Stair', entryLocal: [-5, 0] },
      { id: 'corridor_to_kitchen', to: 'kitchen', at: [-3.4, 0], label: 'Service passage — Kitchen', entryLocal: [5, 0] },
    ],
  },
  drawing: {
    id: 'drawing',
    wing: 'save',
    name: 'Drawing Room',
    center: [-130, 0, 0],
    size: [11, 11],
    cam: { alpha: -Math.PI / 2.2, beta: 0.74, radius: 12, target: [0, 1.0, 0] },
    spawnLocal: [4.4, 0],
    exits: [{ id: 'drawing_to_hall', to: 'hall', at: [5.2, 0], label: 'Great Hall', entryLocal: [-7, 0] }],
  },
  library: {
    id: 'library',
    wing: 'manor',
    name: 'Library',
    center: [130, 0, 0],
    size: [15, 17],
    cam: { alpha: -Math.PI / 2, beta: 0.68, radius: 16, target: [0, 1.0, 0] },
    spawnLocal: [0, 7.2],
    exits: [
      { id: 'library_to_corridor', to: 'corridor', at: [0, 8], label: 'East Corridor', entryLocal: [0, -8.6] },
      { id: 'library_to_study', to: 'study', at: [7, 0], label: 'Study', entryLocal: [-3.6, 0] },
    ],
  },
  study: {
    id: 'study',
    wing: 'manor',
    name: 'Study',
    center: [130, 0, -130],
    size: [9, 9],
    cam: { alpha: -Math.PI / 2.6, beta: 0.74, radius: 11, target: [0, 1.0, 0] },
    spawnLocal: [-3.6, 0],
    exits: [{ id: 'study_to_library', to: 'library', at: [-4.2, 0], label: 'Library', entryLocal: [6.6, 0] }],
  },
  conservatory: {
    id: 'conservatory',
    wing: 'rot',
    name: 'Conservatory',
    center: [0, 0, 140],
    size: [20, 22],
    cam: { alpha: -Math.PI / 2, beta: 0.7, radius: 16, target: [0, 1, 0] },
    spawnLocal: [-8, 0],
    exits: [{ id: 'conservatory_to_hall', to: 'hall', at: [-9.4, 0], label: 'Great Hall', entryLocal: [7, 0] }],
  },
  long_gallery: {
    id: 'long_gallery',
    wing: 'manor',
    name: 'Long Gallery',
    center: [-260, 0, 0],
    size: [9, 22],
    cam: { alpha: -Math.PI / 2, beta: 0.7, radius: 16, target: [0, 1, 0] },
    spawnLocal: [0, -9],
    exits: [
      { id: 'gallery_to_hall', to: 'hall', at: [0, -10.6], label: 'Great Hall', entryLocal: [0, 7] },
      { id: 'gallery_to_music', to: 'music_room', at: [0, 10.6], label: 'Music Room', entryLocal: [0, -5] },
    ],
  },
  music_room: {
    id: 'music_room',
    wing: 'manor',
    name: 'Music Room',
    center: [-260, 0, 150],
    size: [12, 12],
    cam: { alpha: -Math.PI / 2, beta: 0.72, radius: 13, target: [0, 1, 0] },
    spawnLocal: [0, -5],
    exits: [{ id: 'music_to_gallery', to: 'long_gallery', at: [0, -5.6], label: 'Long Gallery', entryLocal: [0, 9] }],
  },
  boiler: {
    id: 'boiler',
    wing: 'cellar',
    name: 'Boiler Room',
    center: [260, 0, -130],
    size: [12, 14],
    cam: { alpha: -Math.PI / 2, beta: 0.72, radius: 14, target: [0, 1, 0] },
    spawnLocal: [-5, 0],
    exits: [
      { id: 'boiler_to_corridor', to: 'corridor', at: [-5.6, 0], label: 'East Corridor', entryLocal: [2.8, 0] },
      { id: 'boiler_to_cistern', to: 'cistern', at: [0, 6.6], label: 'The Cistern', entryLocal: [0, -10] },
      { id: 'boiler_to_crypt', to: 'crypt', at: [5.6, 0], label: 'Undercroft — the Crypt', entryLocal: [-7, 0] },
    ],
  },
  cistern: {
    id: 'cistern',
    wing: 'cellar',
    name: 'The Cistern',
    center: [260, 0, -260],
    size: [22, 22],
    cam: { alpha: -Math.PI / 2, beta: 0.68, radius: 17, target: [0, 1, 0] },
    spawnLocal: [0, -9],
    exits: [{ id: 'cistern_to_boiler', to: 'boiler', at: [0, -10.6], label: 'Boiler Room', entryLocal: [0, 5] }],
  },
  chapel: {
    id: 'chapel',
    wing: 'chapel',
    name: 'The Chapel',
    center: [0, 0, -400],
    size: [16, 18],
    cam: { alpha: -Math.PI / 2, beta: 0.72, radius: 15, target: [0, 1, 0] },
    spawnLocal: [0, 8],
    exits: [
      { id: 'chapel_to_hall', to: 'hall', at: [0, 8.6], label: 'Great Hall', entryLocal: [5.5, -6] },
      { id: 'chapel_to_lab', to: 'lab', at: [0, -8.6], label: 'Reliquary Lift — the Lab', locked: true, requiresKey: 'boneKey', entryLocal: [0, 8] },
    ],
  },
  lab: {
    id: 'lab',
    wing: 'lab',
    name: 'The Glasshouse Lab',
    center: [130, 0, -400],
    size: [18, 18],
    cam: { alpha: -Math.PI / 2, beta: 0.68, radius: 16, target: [0, 1, 0] },
    spawnLocal: [0, 8],
    exits: [
      { id: 'lab_to_chapel', to: 'chapel', at: [0, 8.6], label: 'Chapel', entryLocal: [0, -8] },
      { id: 'lab_to_lighthouse', to: 'lighthouse', at: [8.6, 0], label: 'Spiral Stair — the Lamp Room', locked: true, noFrame: true, entryLocal: [0, -6] },
      { id: 'lab_to_containment', to: 'containment', at: [-8.6, 0], label: 'Containment Ward', entryLocal: [7, 0] },
    ],
  },
  lighthouse: {
    id: 'lighthouse',
    wing: 'storm',
    name: 'The Lamp Room',
    center: [130, 0, -560],
    size: [16, 16],
    cam: { alpha: -Math.PI / 2, beta: 0.7, radius: 15, target: [0, 1, 0] },
    spawnLocal: [0, -6],
    exits: [{ id: 'lighthouse_to_lab', to: 'lab', at: [-7.6, 0], label: 'Down the spiral stair', noFrame: true, walkUp: true, entryLocal: [6, 0] }],
  },

  // ── UPPER FLOOR (reached by the Great Hall grand staircase) ──
  landing: {
    id: 'landing',
    wing: 'manor',
    name: 'Gallery Landing',
    center: [400, 0, 0],
    size: [18, 12],
    cam: { alpha: -Math.PI / 2, beta: 0.7, radius: 15, target: [0, 1, 0] },
    spawnLocal: [0, 4],
    exits: [
      { id: 'landing_to_hall', to: 'hall', at: [0, 5.4], label: 'Down to the Great Hall', noFrame: true, walkUp: true, noPrompt: true, entryLocal: [-4, -1] },
      { id: 'landing_to_iseult', to: 'iseult_room', at: [-8.4, 0], label: "Iseult's Room", entryLocal: [4, 0] },
      { id: 'landing_to_nursery', to: 'nursery', at: [8.4, 0], label: "Cosmo's Nursery", entryLocal: [-4, 0] },
      { id: 'landing_to_sister', to: 'sister_room', at: [0, -5.4], label: "The Sister's Room", entryLocal: [0, 5] },
    ],
  },
  iseult_room: {
    id: 'iseult_room',
    wing: 'manor',
    name: "Iseult's Room",
    center: [400, 0, -140],
    size: [12, 12],
    cam: { alpha: -Math.PI / 2, beta: 0.72, radius: 13, target: [0, 1, 0] },
    spawnLocal: [4, 0],
    exits: [{ id: 'iseult_to_landing', to: 'landing', at: [5.4, 0], label: 'Gallery Landing', entryLocal: [-8, 0] }],
  },
  nursery: {
    id: 'nursery',
    wing: 'manor',
    name: "Cosmo's Nursery",
    center: [400, 0, 140],
    size: [12, 12],
    cam: { alpha: -Math.PI / 2, beta: 0.72, radius: 13, target: [0, 1, 0] },
    spawnLocal: [-4, 0],
    exits: [
      { id: 'nursery_to_landing', to: 'landing', at: [-5.4, 0], label: 'Gallery Landing', entryLocal: [8, 0] },
      { id: 'nursery_to_attic', to: 'attic_loft', at: [0, -5.4], label: 'Attic hatch', locked: true, requiresKey: 'atticKey', noFrame: true, entryLocal: [0, 4] },
    ],
  },
  sister_room: {
    id: 'sister_room',
    wing: 'manor',
    name: "The Sister's Room",
    center: [540, 0, 0],
    size: [10, 10],
    cam: { alpha: -Math.PI / 2, beta: 0.74, radius: 12, target: [0, 1, 0] },
    spawnLocal: [0, 4],
    exits: [{ id: 'sister_to_landing', to: 'landing', at: [0, 4.6], label: 'Gallery Landing', entryLocal: [0, -5] }],
  },
  attic_loft: {
    id: 'attic_loft',
    wing: 'manor',
    name: "The Steward's Loft",
    center: [540, 0, -140],
    size: [11, 9],
    cam: { alpha: -Math.PI / 2, beta: 0.76, radius: 12, target: [0, 1, 0] },
    spawnLocal: [0, 3.5],
    exits: [{ id: 'attic_to_nursery', to: 'nursery', at: [0, 4], label: 'Down to the nursery', noFrame: true, walkUp: true, entryLocal: [0, -4.6] }],
  },

  // ── KITCHEN & DINING (ground floor, off the East Corridor) ──
  kitchen: {
    id: 'kitchen',
    wing: 'manor',
    name: 'The Kitchen',
    center: [-400, 0, -140],
    size: [14, 12],
    cam: { alpha: -Math.PI / 2, beta: 0.7, radius: 15, target: [0, 1, 0] },
    spawnLocal: [5, 0],
    exits: [
      { id: 'kitchen_to_corridor', to: 'corridor', at: [6.4, 0], label: 'East Corridor', entryLocal: [-3, 0] },
      { id: 'kitchen_to_dining', to: 'dining', at: [-6.4, 0], label: 'The Dining Room', entryLocal: [8, 0] },
    ],
  },
  dining: {
    id: 'dining',
    wing: 'manor',
    name: 'The Dining Room',
    center: [-540, 0, -140],
    size: [18, 12],
    cam: { alpha: -Math.PI / 2, beta: 0.68, radius: 16, target: [0, 1, 0] },
    spawnLocal: [8, 0],
    exits: [{ id: 'dining_to_kitchen', to: 'kitchen', at: [8.6, 0], label: 'The Kitchen', entryLocal: [-6, 0] }],
  },

  // ── CRYPT (undercroft, off the Cellar; the sliding tomb → Lab) ──
  crypt: {
    id: 'crypt',
    wing: 'cellar',
    name: 'The Crypt',
    center: [400, 0, -400],
    size: [16, 16],
    cam: { alpha: -Math.PI / 2, beta: 0.68, radius: 16, target: [0, 1, 0] },
    spawnLocal: [-7, 0],
    exits: [
      { id: 'crypt_to_boiler', to: 'boiler', at: [-7.4, 0], label: 'Up to the Cellar', entryLocal: [5, 0] },
      { id: 'crypt_to_lab', to: 'lab', at: [0, -7.4], label: 'The tomb slides — a way below', noFrame: true, entryLocal: [0, 7] },
    ],
  },

  // ── CONTAINMENT (Lab ward — Marion) ──
  containment: {
    id: 'containment',
    wing: 'lab',
    name: 'Containment Ward',
    center: [260, 0, -400],
    size: [14, 12],
    cam: { alpha: -Math.PI / 2, beta: 0.7, radius: 14, target: [0, 1, 0] },
    spawnLocal: [7, 0],
    exits: [{ id: 'containment_to_lab', to: 'lab', at: [7.4, 0], label: 'The Glasshouse Lab', entryLocal: [-8, 0] }],
  },
};

// The correct book-reshelve order for the Stag puzzle — matches the clue text
// "Shelve to the motto: Stag, then Tide, then Flame" (book_0/1/2).
export const BOOK_ORDER = [0, 1, 2] as const; // indices of the 3 library books
