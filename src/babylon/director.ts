// ══════════════════════════════════════════════
// HOLLOWMERE director — the gameplay brain. Owns phase, inventory, the Stag
// crest puzzle, combat resolution, the ripening/Steward flow, room
// transitions, ink-cost saves, and all HUD store writes. Ties together
// world / actor / entities / items / audio. Per-frame entry = tick(dt).
// ══════════════════════════════════════════════

import type { Input } from '@rezona/core/3d';
import { ROOMS, TUNING, BOOK_ORDER, type RoomId } from './config';
import { controls } from './controls';
import { getGameSnapshot, setGameSnapshot, type GameStoreSnapshot, type HealthState, type HudPhase, type InvSlot } from './store';
import type { GameWorldObjects } from './world';
import type { PlayerActor } from './actor';
import type { SceneEntities } from './entities';
import type { ItemField } from './items';
import type { GameAudioHandle } from './audio';
import type { WeaponView } from './viewmodel';

export interface DirectorDeps {
  world: GameWorldObjects;
  actor: PlayerActor;
  entities: SceneEntities;
  items: ItemField;
  audio: GameAudioHandle;
  weaponView: WeaponView;
  getInput: () => Input | undefined;
}

type Weapon = 'dagger' | 'pistol' | 'flare' | 'rifle' | 'cannon';

const SAVE_KEY = 'hollowmere.save.v1';

export interface Director {
  tick(dt: number): void;
  dispose(): void;
  dev: {
    start(): void;
    move(x: number, y: number): void;
    use(): void;
    attack(): void;
    swap(): void;
    enter(room: RoomId): void;
    goto(lx: number, lz: number): void;
    seat(n: number): void;
    setw(w: string): void;
    flashlight(): void;
    snapshot(): GameStoreSnapshot;
    state(): Record<string, unknown>;
  };
}

export function createDirector(deps: DirectorDeps): Director {
  const { world, actor, entities, items, audio, weaponView } = deps;

  let phase: HudPhase = 'TITLE';
  let room: RoomId = 'hall';
  let hp: number = TUNING.playerMaxHp;
  let ammo = 0;
  let flares: number = TUNING.startFlares;
  let hasFlare = TUNING.startFlares > 0; // own the flare GUN — stays in hand/bar even at 0 ammo
  let hasLocket = false; // Iseult's locket (grief-room key item / safe key)
  let hasKeepsake = false; // the Steward's keepsake (mercy hook)
  let hasCleaver = false; // kitchen melee upgrade — dagger hits harder
  let safeOpened = false; // Founder's wall-safe (opened by the locket)
  let stewardMercy = false; // laid the keepsake — Steward pacified for good
  // ── lock-pick minigame (optional strongboxes; world stays LIVE while picking) ──
  let lockpicks = 2;
  let picking = false;
  let pickAngle = 0; // 0..1 sweeping pointer
  let pickDir = 1;
  let pickLo = 0; // sweet-spot bounds
  let pickHi = 0;
  let pickPins = 0;
  let pickBoxId = '';
  let pickSpeed = 1;
  let ink: number = TUNING.startInk;
  // ── survival systems ──
  let stamina: number = TUNING.staminaMax; // sprint reserve
  let canSprint = true; // latched false at 0 stamina until it recovers past the floor
  let battery: number = TUNING.startBattery; // flashlight cell charge
  let bandages: number = TUNING.startBandages; // wound-binding kits
  let bindT = 0; // >0 while binding a wound (rooted + vulnerable)
  let weapon: Weapon = 'dagger';
  let hasPistol = false;
  let hasRifle = false;
  let rifleAmmo = 0;
  let hasCannon = false;
  let cannonAmmo = 0;
  let hasBrassKey = false;
  let hasSilverKey = false;
  const bookSeq: number[] = [];
  let caseSolved = false;
  const crestsHeld = new Set<string>(); // 'stag' | 'eye' | ... awaiting seating
  let crestsSeated = 0; // seated in the hub Crest Door (4 = win)
  let stewardActivated = false;
  let hasTideValve = false;
  let bloomActivatedAmbience = false;
  // West Wing phonograph puzzle
  let shards = 0;
  let vaultOpen = false;
  // Cellars/Cistern
  let hasOil = false;
  let hasIronKey = false;
  let furnaceLit = false;
  let leviathanExposed = false;
  // Endgame: Chapel + Lab
  let crestDoorOpen = false;
  let hasBoneKey = false;
  let hasBloodSample = false;
  let hasKeycard = false;
  // Lighthouse true ending
  let lampStairOpen = false;
  let trueEnding = false;
  // v3.3 expansion: attic access + NPC dialogue cursors
  let hasAtticKey = false;
  const npcLine: Record<string, number> = {};

  let toastText = '';
  let toastId = 0;
  let toastTimer = 0;
  let promptText = '';
  let objective = 'Find the Brass Key in the Drawing Room.';

  let transitionActive = false;
  let transT = 0;
  let transSwapped = false;
  let transTo: RoomId = 'hall';
  let transEntry: [number, number] = [0, 0];
  let transFace = Math.PI;
  // stair transitions play a visible climb/descent instead of a plain fade
  let stairDir = 0; // 0 = plain door · +1 = ascend · -1 = descend
  let climbX = 0;
  let climbY = 0;
  let climbZ = 0;
  let climbYaw = Math.PI;
  let climbBeat = -1;
  let stairArmed = false; // must leave a stair zone before it can auto-trigger again

  let lastHit = '';
  let stepTimer = 0;
  let storeTimer = 0;
  let stewardProx = 0;
  let stewardRelocTimer = 0;
  let stalkTimer = 14; // persistent-hunt clock: the Steward tracks you down room-to-room
  let inventoryOpen = false; // full inventory screen (pauses play while open)
  // ── checkpoint: snapshotted at each threshold (room entry). Death offers
  // "rise at the last threshold" instead of a full restart — fair, not soft. ──
  let checkpoint: {
    room: RoomId;
    entry: [number, number];
    hp: number;
    ammo: number;
    rifleAmmo: number;
    cannonAmmo: number;
    flares: number;
    ink: number;
    bandages: number;
    battery: number;
    lockpicks: number;
  } | null = null;
  let dmgFlash = 0; // 0..1 damage-feedback flash (decays)
  let dmgAngle = 0; // screen-relative yaw of the last incoming hit
  let stepStalkT = 0; // cadence timer for the Steward's proximity footsteps
  let cineT = 0; // intro-cutscene camera clock (drives the establishing fly-through)
  let cineAudioStarted = false;
  let devMove: { x: number; y: number } | null = null;
  let started = false;

  const toast = (msg: string) => {
    toastText = msg;
    toastId += 1;
    toastTimer = 3.2;
  };

  const healthState = (): HealthState => (hp <= TUNING.bleedThreshold ? 'danger' : hp <= TUNING.cautionThreshold ? 'caution' : 'fine');

  const buildInventory = (): InvSlot[] => {
    const inv: InvSlot[] = [];
    // Always-carried tool: the flashlight. `equipped` mirrors on/off so the HUD
    // slot lights up amber while the beam is live.
    inv.push({ key: 'flashlight', label: 'Flashlight', count: 1, kind: 'tool', equipped: world.flashlightOn() });
    inv.push({ key: 'dagger', label: 'Dagger', count: 1, kind: 'weapon', equipped: weapon === 'dagger' });
    if (hasPistol) inv.push({ key: 'pistol', label: 'Pistol', count: ammo, kind: 'weapon', equipped: weapon === 'pistol' });
    if (hasRifle) inv.push({ key: 'rifle', label: 'Rifle', count: rifleAmmo, kind: 'weapon', equipped: weapon === 'rifle' });
    if (hasCannon) inv.push({ key: 'cannon', label: 'Hand-Cannon', count: cannonAmmo, kind: 'weapon', equipped: weapon === 'cannon' });
    if (hasFlare) inv.push({ key: 'flare', label: 'Flare', count: flares, kind: 'weapon', equipped: weapon === 'flare' });
    if (hasBrassKey) inv.push({ key: 'brass_key', label: 'Brass Key', count: 1, kind: 'key', equipped: false });
    if (hasSilverKey) inv.push({ key: 'silver_key', label: 'Silver Key', count: 1, kind: 'key', equipped: false });
    if (hasIronKey) inv.push({ key: 'iron_key', label: 'Iron Key', count: 1, kind: 'key', equipped: false });
    for (const c of ['stag', 'eye', 'flame', 'tide']) {
      if (crestsHeld.has(c)) inv.push({ key: `${c}_crest`, label: `${c[0].toUpperCase()}${c.slice(1)} Crest`, count: 1, kind: 'crest', equipped: false });
    }
    return inv;
  };

  const weaponLabel = (): string =>
    weapon === 'dagger' ? 'Dagger' : weapon === 'pistol' ? 'Pistol' : weapon === 'rifle' ? 'Rifle' : weapon === 'cannon' ? 'Hand-Cannon' : 'Flare';

  const pushStore = () => {
    setGameSnapshot({
      ready: true,
      hudPhase: phase,
      roomName: ROOMS[room].name,
      health: Math.max(0, Math.round(hp)),
      healthState: healthState(),
      weapon: weaponLabel(),
      ammo: weapon === 'rifle' ? rifleAmmo : weapon === 'cannon' ? cannonAmmo : ammo,
      flares,
      ink,
      stamina: Math.round(stamina),
      battery: Math.round(battery),
      bandages,
      binding: bindT > 0 ? 1 - bindT / TUNING.bindDuration : 0,
      lockpicks,
      picking,
      pickAngle,
      pickLo,
      pickHi,
      pickPins,
      objective,
      prompt: promptText,
      toast: toastText,
      toastId,
      crestSeated: crestsSeated > 0,
      trueEnding,
      stewardNear: stewardProx,
      hitFlash: dmgFlash,
      hitDir: dmgAngle,
      inventory: buildInventory(),
      inventoryOpen,
      transition: transitionActive ? Math.sin(Math.min(1, transT) * Math.PI) : 0,
      transitionName: transitionActive ? ROOMS[transTo].name : '',
      pointerLocked: controls.isPointerLocked(),
    });
  };

  const enterRoom = (to: RoomId, entry: [number, number], faceYaw: number) => {
    room = to;
    stairArmed = false; // arriving on/near a stair must not bounce you straight back
    // checkpoint at the threshold — with a mercy floor so you're never reborn
    // half-dead in the dark (hp ≥ 40, battery ≥ 25)
    checkpoint = {
      room: to,
      entry: [entry[0], entry[1]],
      hp: Math.max(40, Math.round(hp)),
      ammo,
      rifleAmmo,
      cannonAmmo,
      flares,
      ink,
      bandages,
      battery: Math.max(25, Math.round(battery)),
      lockpicks,
    };
    world.setActiveRoom(to);
    entities.setActiveRoom(to, world);
    items.setActiveRoom(to, world);
    actor.teleport(world, to, entry[0], entry[1], faceYaw);
    // ambience by wing (boss music re-triggers in tick if the Bloom is alive)
    bloomActivatedAmbience = false;
    if (ROOMS[to].wing === 'save') audio.ambience('save');
    else if (to === 'conservatory') audio.ambience('conservatory');
    else if (ROOMS[to].wing === 'cellar') audio.ambience('cellar');
    else if (ROOMS[to].wing === 'chapel') audio.ambience('chapel');
    else if (ROOMS[to].wing === 'lab') audio.ambience('lab');
    else if (to === 'lighthouse') {
      audio.ambience('lighthouse');
      audio.play('storm');
    } else audio.ambience('explore');
    if (stewardActivated && entities.stewardActive()) {
      stewardRelocTimer = 2.2; // the Steward follows through door transitions
    }
  };

  const beginTransition = (to: RoomId, entry: [number, number], faceYaw: number, stair = 0) => {
    transitionActive = true;
    transT = 0;
    transSwapped = false;
    transTo = to;
    transEntry = entry;
    transFace = faceYaw;
    stairDir = stair;
    // capture the eye so a stair climb can animate up/down the flight from here
    const cam = world.camera;
    climbX = cam.position.x;
    climbY = cam.position.y;
    climbZ = cam.position.z;
    climbYaw = cam.rotation.y;
    climbBeat = -1;
    audio.play(stair !== 0 ? 'step' : 'door');
  };

  const startGame = () => {
    if (started) return;
    started = true;
    phase = 'PLAY';
    hp = TUNING.playerMaxHp;
    room = 'hall';
    world.setActiveRoom('hall');
    entities.setActiveRoom('hall', world);
    items.setActiveRoom('hall', world);
    items.setCrestSockets(crestsSeated);
    actor.teleport(world, 'hall', ROOMS.hall.spawnLocal[0], ROOMS.hall.spawnLocal[1], Math.PI);
    audio.unlock();
    audio.ambience('explore');
    objective = 'Seek the Drawing Room (west). Save, and take the Brass Key.';
    toast('The tide rises behind you. The door clangs shut.');
    pushStore();
  };

  const toggleFlashlight = () => {
    if (!world.flashlightOn() && battery <= 0) {
      toast('Dead cell. Find a battery.');
      audio.play('puzzleBad');
      return;
    }
    const on = world.toggleFlashlight();
    audio.play('ui');
    toast(on ? 'Flashlight: ON' : 'Flashlight: OFF');
  };

  const equipSlot = (n: number) => {
    const inv = buildInventory();
    const it = inv[n - 1];
    if (!it) return;
    if (it.key === 'flashlight') {
      toggleFlashlight();
      return;
    }
    if (it.kind === 'weapon' && (it.key === 'dagger' || it.key === 'pistol' || it.key === 'flare' || it.key === 'rifle' || it.key === 'cannon')) {
      weapon = it.key;
      audio.play('ui');
      toast(`Equipped: ${weaponLabel()}`);
    } else {
      audio.play('ui');
      toast(`${it.label}${it.kind === 'key' ? ' (key item)' : ''}`);
    }
  };

  // Clicked from the inventory UI (game paused): equip a weapon, toggle the
  // flashlight, or USE a consumable (bandage → instant heal, unlike the timed
  // in-combat bind on [B]).
  const applyInvAction = (a: { kind: 'equip' | 'use'; key: string }) => {
    if (a.kind === 'equip') {
      if (a.key === 'flashlight') {
        toggleFlashlight();
        return;
      }
      const ok =
        a.key === 'dagger' ||
        (a.key === 'pistol' && hasPistol) ||
        (a.key === 'rifle' && hasRifle) ||
        (a.key === 'cannon' && hasCannon) ||
        (a.key === 'flare' && hasFlare);
      if (ok) {
        weapon = a.key as Weapon;
        audio.play('ui');
        toast(`Equipped: ${weaponLabel()}`);
      }
    } else if (a.kind === 'use' && a.key === 'bandage') {
      if (bandages <= 0) {
        toast('No bandages.');
        audio.play('puzzleBad');
      } else if (hp >= TUNING.playerMaxHp) {
        toast('No wound to bind.');
      } else {
        bandages -= 1;
        hp = Math.min(TUNING.playerMaxHp, hp + TUNING.bindHeal);
        audio.play('save');
        toast(`Wound bound. (Bandage -1)`);
      }
    }
  };

  const cycleWeapon = () => {
    const avail: Weapon[] = ['dagger'];
    if (hasPistol) avail.push('pistol');
    if (hasRifle) avail.push('rifle');
    if (hasCannon) avail.push('cannon');
    if (hasFlare) avail.push('flare');
    const idx = avail.indexOf(weapon);
    weapon = avail[(idx + 1) % avail.length];
    audio.play('ui');
    toast(`Equipped: ${weaponLabel()}`);
  };

  const doSave = () => {
    if (ink <= 0) {
      toast('No ink. The Ledger stays shut.');
      audio.play('puzzleBad');
      return;
    }
    ink -= 1;
    hp = Math.min(TUNING.playerMaxHp, hp + 25);
    try {
      const data = JSON.stringify({ room, hp, ammo, flares, ink, hasPistol, hasRifle, rifleAmmo, hasBrassKey, hasSilverKey, caseSolved, crestsSeated, crestsHeld: [...crestsHeld], shards, vaultOpen, hasTideValve });
      window.localStorage.setItem(SAVE_KEY, data);
    } catch {
      /* save best-effort */
    }
    audio.play('save');
    toast('Recorded in the Ledger. (Ink -1)');
  };

  // scatter a loot pickup near the player (dynamic ammo/flare drops)
  const dropNear = (drop: string) => {
    const c = ROOMS[room].center;
    const lx = actor.position.x - c[0] + (Math.random() * 3 - 1.5);
    const lz = actor.position.z - c[2] + (Math.random() * 3 - 1.5);
    items.spawnPickup(world, drop, room, lx, lz);
  };

  const giveItem = (id: string) => {
    // dynamic loot drops (pistol/rifle ammo, flares) scattered on kills / running dry
    const dyn = items.byId(id);
    if (dyn?.drop) {
      if (dyn.drop === 'flare') { flares += 1; hasFlare = true; toast('A flare, dropped in the dark. (+1)'); }
      else if (dyn.drop === 'rifleAmmo') { rifleAmmo += 4; toast('Rifle rounds. (+4)'); }
      else if (dyn.drop === 'battery') { battery = Math.min(TUNING.batteryMax, battery + TUNING.batteryPickup); toast(`Battery cell (+${TUNING.batteryPickup}% charge).`); }
      else if (dyn.drop === 'bandage') { bandages += 1; toast('A clean bandage. (+1)'); }
      else { ammo += 6; toast('Pistol rounds. (+6)'); }
      audio.play('pickup');
      items.consume(id);
      return;
    }
    switch (id) {
      case 'brass_key':
        hasBrassKey = true;
        objective = 'Cross to the East Corridor; the Brass Key opens the Library.';
        toast('Brass Key — it fits the Library door.');
        break;
      case 'ink_1':
        ink += 2;
        toast('Ink Vials (+2).');
        break;
      case 'pistol':
        hasPistol = true;
        ammo += TUNING.startPistolAmmo;
        weapon = 'pistol';
        toast(`Service Pistol (+${TUNING.startPistolAmmo} rounds).`);
        break;
      case 'flare_1':
        flares += 1;
        hasFlare = true;
        toast('Flare (+1). Burn the dead so they cannot ripen.');
        break;
      case 'battery_1':
        battery = Math.min(TUNING.batteryMax, battery + TUNING.batteryPickup);
        toast(`Battery cell (+${TUNING.batteryPickup}% torch charge).`);
        break;
      case 'bandage_1':
        bandages += 1;
        toast('Bandage (+1). Press B to bind a wound.');
        break;
      case 'shells_1':
        ammo += 8;
        toast('Pistol ammo (+8).');
        break;
      case 'fenmoss_1':
        hp = Math.min(TUNING.playerMaxHp, hp + 40);
        toast('Fenmoss — the wound closes a little.');
        break;
      // ── Iseult's Room (grief tableau) ──
      case 'locket':
        hasLocket = true;
        toast("Iseult's Locket — a portrait of her and Cosmo inside. It fits a wall-safe somewhere below.");
        break;
      case 'note_iseult':
        toast("Iseult's diary: “Father seals the lamp-room. He says the water is owed a daughter, and the ledger must balance.”");
        break;
      // ── The Sister's Room (Ysolde / Marion subplot) ──
      case 'marion_photo':
        toast("A photo of Wren & Marion, and Marion's jacket. She went down toward the containment lab.");
        break;
      // ── The Steward's Loft (mercy + humanization) ──
      case 'keepsake':
        hasKeepsake = true;
        toast("The Steward's keepsake — worn smooth by handling. Carrying it, you might yet stay his hand.");
        break;
      case 'steward_ledger':
        toast("The Steward's ledger & work-song: every task, every grave, ruled in the same tidy hand. He was a gardener once.");
        break;
      case 'attic_cache':
        ammo += 12;
        flares += 1;
        hasFlare = true;
        if (hasRifle) rifleAmmo += 6;
        if (hasCannon) cannonAmmo += 3;
        toast("Servants' ammo cache — pistol +12, a flare, and rounds for what you carry.");
        break;
      case 'lockpick_2':
        lockpicks += 1;
        toast('A lockpick — for strongboxes the keys don’t fit. (Press to pick; it may snap.)');
        break;
      // ── The Kitchen (cleaver melee upgrade) ──
      case 'cleaver':
        hasCleaver = true;
        toast('A heavy cleaver — your dagger strikes bite deeper now.');
        break;
      case 'bluecap_1':
        hp = Math.min(TUNING.playerMaxHp, hp + 20);
        toast('Bluecap — it clears the blight and steadies you.');
        break;
      case 'redcap_1':
        hp = Math.min(TUNING.playerMaxHp, hp + 15);
        toast('Redcap — bitter; the blood quickens.');
        break;
      case 'tide_valve':
        hasTideValve = true;
        objective = 'You hold the Tide-Valve Wheel. (The Cistern lies below — wing to come.)';
        toast('The Tide-Valve Wheel — it will master the cistern waters.');
        break;
      case 'stag_crest':
        crestsHeld.add('stag');
        objective = 'Return to the Great Hall. Seat the Stag in the Crest Door.';
        toast('STAG CREST. Something shifts in the house...');
        // scripted Steward intrusion
        if (!stewardActivated) {
          stewardActivated = true;
          entities.activateSteward('library');
          audio.play('crest');
          audio.play('lightning');
          audio.ambience('steward');
        }
        break;
      case 'eye_crest':
        crestsHeld.add('eye');
        objective = 'Seat the Eye Crest in the Hall. Two of four.';
        toast('EYE CREST. The portraits seem to follow you now.');
        audio.play('crest');
        break;
      case 'shard_0':
      case 'shard_1':
      case 'shard_2':
        shards += 1;
        objective = shards >= 3 ? 'Play the Vane song on the Phonograph (Music Room).' : `Cylinder shard ${shards}/3 — find the rest.`;
        toast(`Cylinder shard (${shards}/3).`);
        break;
      case 'lever_rifle':
        hasRifle = true;
        rifleAmmo += TUNING.startRifleAmmo;
        weapon = 'rifle';
        toast(`Lever Rifle (+${TUNING.startRifleAmmo} rounds). Precise and hard-hitting.`);
        break;
      case 'silver_key':
        hasSilverKey = true;
        toast('Silver Key — it fits the chapel-side doors.');
        break;
      case 'iron_key':
        hasIronKey = true;
        toast('Iron Key — heavy and crude. The boiler line.');
        break;
      case 'oil_can':
        hasOil = true;
        objective = 'Pour the oil into the Furnace and light it (Boiler Room).';
        toast('Oil Can — fuel for the furnace.');
        break;
      case 'flame_crest':
        crestsHeld.add('flame');
        objective = 'Seat the Flame Crest in the Hall.';
        toast('FLAME CREST — forged in the furnace-heat.');
        audio.play('crest');
        break;
      case 'tide_crest':
        crestsHeld.add('tide');
        objective = 'Seat the Tide Crest in the Hall. The four are nearly whole.';
        toast('TIDE CREST — claimed from the drained deep.');
        audio.play('crest');
        break;
      case 'bone_key':
        hasBoneKey = true;
        objective = 'The bone key fits the reliquary lift — descend to the Lab.';
        toast('Bone Key — pale and warm. The reliquary lift will take it.');
        break;
      case 'hand_cannon':
        hasCannon = true;
        cannonAmmo += 6;
        weapon = 'cannon';
        toast('Hand-Cannon (+6). It will put even the Steward down.');
        break;
      case 'blood_sample':
        hasBloodSample = true;
        toast('Blood Sample — the Founder’s true work. (The lighthouse path.)');
        break;
      case 'keycard':
        hasKeycard = true;
        toast('Lab Keycard.');
        break;
      case 'attic_key':
        hasAtticKey = true;
        objective = 'The attic key — the nursery hatch will open now.';
        toast('A small brass attic key, warm from the toy chest.');
        break;
      default:
        break;
    }
    audio.play('pickup');
    items.consume(id);
  };

  const handleBook = (id: string) => {
    if (caseSolved) return;
    const idx = id === 'book_0' ? 0 : id === 'book_1' ? 1 : 2;
    bookSeq.push(idx);
    audio.play('ui');
    // compare against the prefix of BOOK_ORDER
    const k = bookSeq.length - 1;
    if (bookSeq[k] !== BOOK_ORDER[k]) {
      bookSeq.length = 0;
      audio.play('puzzleBad');
      toast('The shelf rejects the order. Begin again.');
      return;
    }
    if (bookSeq.length === BOOK_ORDER.length) {
      caseSolved = true;
      items.consume('book_0');
      items.consume('book_1');
      items.consume('book_2');
      items.reveal('stag_crest');
      audio.play('puzzleOk');
      objective = 'The case opened. Take the Stag Crest.';
      toast('A latch releases — the display case opens.');
    } else {
      toast(`Shelved ${bookSeq.length}/${BOOK_ORDER.length}...`);
    }
  };

  const talkTo = (it: { id: string; label: string; lines?: string[] }) => {
    const lines = it.lines ?? [];
    if (lines.length === 0) {
      toast(`${it.label} does not answer.`);
      return;
    }
    const i = npcLine[it.id] ?? 0;
    toast(lines[i]);
    npcLine[it.id] = (i + 1) % lines.length;
    audio.play('ui');
  };

  // ── lock-pick minigame ──
  const newSweetSpot = () => {
    const width = Math.max(0.09, 0.18 - (3 - pickPins) * 0.03); // narrows as pins are set
    pickLo = 0.1 + Math.random() * (0.8 - width);
    pickHi = pickLo + width;
  };
  const startPick = (boxId: string) => {
    picking = true;
    pickBoxId = boxId;
    pickPins = 3;
    pickAngle = 0;
    pickDir = 1;
    pickSpeed = 1.0;
    newSweetSpot();
    audio.play('ui');
    toast('Picking the lock — set each pin.  [E]/click set · [Q] cancel.');
  };
  const cancelPick = () => {
    picking = false;
    toast('You ease off the lock.');
  };
  const openLockbox = (boxId: string) => {
    picking = false;
    items.consume(boxId);
    ammo += 8;
    bandages += 1;
    battery = Math.min(TUNING.batteryMax, battery + 40);
    if (Math.random() < 0.4) { flares += 1; hasFlare = true; }
    const gotPick = Math.random() < 0.5;
    if (gotPick) lockpicks += 1; // picking sustains itself — supplies live behind the lock
    audio.play('vaultOpen');
    toast(`The strongbox clicks open — supplies within. (+8 rounds · +1 bandage · +40% battery${gotPick ? ' · +1 lockpick' : ''})`);
  };
  const attemptPin = () => {
    if (pickAngle >= pickLo && pickAngle <= pickHi) {
      pickPins -= 1;
      audio.play('puzzleOk');
      if (pickPins <= 0) openLockbox(pickBoxId);
      else { pickSpeed += 0.28; newSweetSpot(); } // each pin sweeps a touch faster
    } else {
      lockpicks -= 1;
      audio.play('puzzleBad');
      if (lockpicks <= 0) { picking = false; toast('The pick snaps — your last. The lock holds.'); }
      else toast(`The pick snaps! (${lockpicks} left)`);
    }
  };

  const interact = (itemId: string | null, exitIndex: number) => {
    // mercy on the downed Steward (carrying his keepsake) — not a real item
    if (itemId === '__mercy__') {
      entities.mercySteward();
      stewardMercy = true;
      audio.play('save');
      toast('You lay the keepsake in his hands. The Steward stills, and does not rise again.');
      return;
    }
    if (itemId) {
      const it = items.byId(itemId);
      if (!it) return;
      if (it.kind === 'item') giveItem(itemId);
      else if (it.kind === 'npc') talkTo(it);
      else if (it.kind === 'savedesk') doSave();
      else if (it.kind === 'book') handleBook(itemId);
      else if (it.kind === 'doc') {
        audio.play('ui');
        toast("Note: ‘Shelve to the motto — Stag, then Tide, then Flame.’");
      } else if (it.kind === 'case') {
        if (!caseSolved) toast('Locked. The glass holds. (Solve the shelves.)');
        else toast('The case is open.');
      } else if (it.kind === 'phono') {
        if (vaultOpen) {
          toast('The cylinder has played its song.');
        } else if (shards >= 3) {
          vaultOpen = true;
          items.reveal('eye_crest');
          audio.play('phonograph');
          audio.play('eyeAlign');
          objective = 'The eyes align — the Gallery Vault is open. Take the Eye Crest.';
          toast('You play the Vane song. Down the gallery, painted eyes turn — a vault clicks open.');
        } else {
          audio.play('puzzleBad');
          toast(`The phonograph needs its cylinder. Shards: ${shards}/3.`);
        }
      } else if (it.kind === 'vault') {
        if (vaultOpen) audio.play('vaultOpen');
        else {
          toast('Sealed — bound to the gallery portraits. (Play the phonograph.)');
          audio.play('puzzleBad');
        }
      } else if (it.kind === 'safe') {
        if (safeOpened) {
          toast('The safe hangs open, emptied.');
        } else if (!hasLocket) {
          toast("A wall-safe behind the portrait of Iseult & Cosmo. The keyhole is shaped for a locket.");
          audio.play('puzzleBad');
        } else {
          safeOpened = true;
          bandages += 2;
          ammo += 12;
          ink += 1;
          audio.play('vaultOpen');
          objective = "You've read the Founder's confession. Wake the lighthouse; end what he began.";
          toast("The locket turns. Inside: the Founder's confession — nine souls fed to the tide to spare Hollowmere — and a cache of supplies. (+2 bandages, +12 rounds, +ink)");
        }
      } else if (it.kind === 'lockbox') {
        if (lockpicks <= 0) {
          toast('Locked tight. You need a lockpick.');
          audio.play('puzzleBad');
        } else {
          startPick(itemId);
        }
      } else if (it.kind === 'furnace') {
        if (furnaceLit) {
          toast('The furnace roars white-hot.');
        } else if (hasOil) {
          furnaceLit = true;
          items.reveal('flame_crest');
          audio.play('furnace');
          objective = 'The furnace blazes — take the Flame Crest.';
          toast('You pour the oil and strike a light. The furnace ROARS; the crest-mould glows.');
        } else {
          audio.play('puzzleBad');
          toast('Cold and dead. It needs oil to light.');
        }
      } else if (it.kind === 'fusebox') {
        audio.play('valveTurn');
        toast('You throw the breakers. Somewhere, lab fluorescents stutter awake.');
      } else if (it.kind === 'valve') {
        if (leviathanExposed) {
          toast('The cistern is drained. The Leviathan thrashes, exposed.');
        } else if (hasTideValve) {
          leviathanExposed = true;
          entities.exposeLeviathan();
          audio.play('valveTurn');
          audio.play('water');
          objective = 'The waters drain — strike the Leviathan’s gills!';
          toast('You fit the wheel and crank. The cistern drains, and the Leviathan heaves into the air.');
        } else {
          audio.play('puzzleBad');
          toast('A wheel-mount, empty. You need the Tide-Valve Wheel (Conservatory).');
        }
      } else if (it.kind === 'crestdoor') {
        if (crestDoorOpen) {
          // the Crest Door now IS the way down to the Cloister/Chapel
          audio.play('door');
          beginTransition('chapel', ROOMS.chapel.spawnLocal, Math.PI);
        } else if (crestsHeld.size > 0) {
          const names = [...crestsHeld].map((c) => c[0].toUpperCase() + c.slice(1)).join(' & ');
          crestsSeated += crestsHeld.size;
          crestsHeld.clear();
          items.setCrestSockets(crestsSeated);
          audio.play('crest');
          audio.play('puzzleOk');
          if (crestsSeated >= 4) {
            crestDoorOpen = true;
            objective = 'The Crest Door is open — descend into the Cloister.';
            toast('The four sockets blaze as one. The Crest Door grinds wide on the dark beyond.');
          } else {
            objective = `Crest Door: ${crestsSeated} of 4 seated.`;
            toast(`The ${names} socket glows — ${crestsSeated} of 4. The door holds.`);
          }
        } else if (crestsSeated > 0) {
          toast(`${crestsSeated} of 4 sockets glow. Find the rest.`);
        } else {
          toast('Four crests open this door. You hold none yet.');
          audio.play('puzzleBad');
        }
      }
      return;
    }
    // door
    if (exitIndex >= 0) {
      const exit = ROOMS[room].exits[exitIndex];
      if (exit.locked && !exitOpen(exit)) {
        toast(exit.requiresKey === 'boneKey' ? 'Sealed — the reliquary wants the Bone Key.' : 'Locked. A heavy brass keyhole.');
        audio.play('puzzleBad');
        return;
      }
      if (exit.locked) audio.play('unlock');
      // stairs / hatches / spiral steps animate a climb; direction from the label
      const lbl = exit.label.toLowerCase();
      const isStair = !!exit.noFrame || /stair|hatch|ladder|below|steps/.test(lbl);
      const stair = isStair ? (/down|below|descend|nursery/.test(lbl) ? -1 : 1) : 0;
      beginTransition(exit.to, exit.entryLocal, Math.atan2(-exit.entryLocal[0], -exit.entryLocal[1]), stair);
    }
  };

  const exitOpen = (ex: { id?: string; locked?: boolean; requiresKey?: string }): boolean =>
    !ex.locked ||
    (ex.id === 'lab_to_lighthouse'
      ? lampStairOpen
      : ex.requiresKey === 'brassKey'
        ? hasBrassKey
        : ex.requiresKey === 'boneKey'
          ? hasBoneKey
          : ex.requiresKey === 'atticKey'
            ? hasAtticKey
            : true);

  const doAttack = () => {
    const pos = actor.position;
    const face = actor.facingYaw;
    if (weapon === 'dagger') {
      weaponView.attack('dagger');
      audio.play('dagger');
      const r = entities.attackNearest(pos, face, TUNING.daggerDamage + (hasCleaver ? 1 : 0), false, TUNING.attackRange, false);
      reactAttack(r);
    } else if (weapon === 'pistol') {
      if (ammo <= 0) {
        audio.play('ui');
        toast('Click. Empty.');
        return;
      }
      ammo -= 1;
      weaponView.attack('pistol');
      audio.play('gun');
      const r = entities.attackNearest(pos, face, TUNING.pistolDamage, false, 45, true);
      reactAttack(r);
      if (ammo === 0) {
        dropNear('pistolAmmo');
        dropNear('pistolAmmo');
        toast('Slide locks back — empty. Spent clips scatter nearby.');
      }
    } else if (weapon === 'rifle') {
      if (rifleAmmo <= 0) {
        audio.play('ui');
        toast('Click. The rifle is empty.');
        return;
      }
      rifleAmmo -= 1;
      weaponView.attack('rifle');
      audio.play('shotgun');
      const r = entities.attackNearest(pos, face, TUNING.rifleDamage, false, 55, true);
      reactAttack(r);
      if (rifleAmmo === 0) {
        dropNear('rifleAmmo');
        toast('The rifle runs dry — loose rounds spill nearby.');
      }
    } else if (weapon === 'cannon') {
      if (cannonAmmo <= 0) {
        audio.play('ui');
        toast('Click. The hand-cannon is spent.');
        return;
      }
      cannonAmmo -= 1;
      weaponView.attack('cannon');
      audio.play('shotgun');
      const r = entities.attackNearest(pos, face, 4, false, 40, true); // hand-cannon hits hardest
      reactAttack(r);
    } else {
      if (flares <= 0) {
        toast('No flares left.');
        return;
      }
      flares -= 1;
      weaponView.attack('flare');
      audio.play('flare');
      const r = entities.attackNearest(pos, face, TUNING.flareDamage, true, 45, true);
      reactAttack(r);
      // stay equipped when empty (no auto-switch) + scatter a fresh flare to find
      if (flares === 0) {
        dropNear('flare');
        toast('Last flare spent — the gun clicks empty. A spare flare tumbles free nearby.');
      }
    }
  };

  const reactAttack = (r: string) => {
    lastHit = r;
    // survival economy: the downed sometimes spill supplies (keeps you alive)
    if (r === 'kill' || r === 'kill-perm' || r === 'burn-perm') {
      if (Math.random() < 0.45) {
        const roll = Math.random();
        const drop =
          roll < 0.12 ? 'flare'
          : roll < 0.26 ? 'battery'
          : roll < 0.38 ? 'bandage'
          : hasRifle && roll < 0.6 ? 'rifleAmmo'
          : 'pistolAmmo';
        dropNear(drop);
      }
    }
    if (r === 'kill') toast('It drops — but only fire keeps it down. It will rise again.');
    else if (r === 'burn-perm') toast('Fire takes it. It will not rise.');
    else if (r === 'kill-perm') toast('It falls and stays down.');
    else if (r === 'steward-down') toast('The Steward kneels — for now. RUN.');
    else if (r === 'steward-hit') audio.play('grab');
    else if (r === 'submerged') {
      audio.play('puzzleBad');
      toast('Your shots vanish into the black water. Drain the cistern first.');
    } else if (r === 'boss-node') {
      audio.play('flare');
      toast(room === 'cistern' ? 'A gill ruptures! The Leviathan screams.' : 'A heart-node bursts! The Bloom shudders.');
    } else if (r === 'boss-hit') audio.play('dagger');
    else if (r === 'boss-down') {
      bloomActivatedAmbience = false;
      audio.ambience(ROOMS[room].wing === 'save' ? 'save' : ROOMS[room].wing === 'cellar' ? 'cellar' : 'explore');
      audio.play('crest');
      if (room === 'lighthouse') {
        // the TRUE climax — the Founder falls; the great lamp is yours to light
        trueEnding = true;
        phase = 'WIN';
        objective = 'The lamp blazes. You put out to sea. HOLLOWMERE recedes behind you.';
        audio.play('boat');
        toast('The Founder comes apart in the lamplight. You throw the great lens wide, and the sea answers. A boat waits below.');
      } else if (room === 'lab') {
        // the Steward's final form falls
        if (hasBloodSample) {
          // holding the Founder's true work opens the way up to the lamp room
          lampStairOpen = true;
          audio.play('unlock');
          objective = 'The Steward falls — and a spiral stair grinds open. The Founder waits in the lamp room.';
          toast('The glass-grown horror sloughs apart. Behind it, an iron stair winds up toward a cold light.');
        } else {
          phase = 'WIN';
          objective = 'The Steward is undone. HOLLOWMERE is silent.';
          toast('The glass-grown horror shudders, sloughs apart, and is finally — finally — still.');
        }
      } else if (room === 'cistern') {
        items.reveal('tide_crest');
        objective = 'The Leviathan is still. Take the Tide Crest.';
        toast('The Leviathan crashes down and is still. A crest glints in the drained silt.');
      } else {
        items.reveal('tide_valve');
        objective = 'The Bloom is ash. Take the Tide-Valve Wheel it guarded.';
        toast('The root-mass collapses with a wet shriek. Something falls from its heart.');
      }
    }
  };

  const die = () => {
    phase = 'DEAD';
    objective = 'The house keeps you now.';
    toast('You are arranged among the others.');
  };

  // Rise at the last threshold: restore the state snapshotted when you last
  // crossed a door. World progress (crests, keys, opened locks, dead bosses)
  // persists — only YOU rewind. Fair without deleting the run.
  const respawnAtCheckpoint = () => {
    if (!checkpoint) return;
    hp = checkpoint.hp;
    ammo = checkpoint.ammo;
    rifleAmmo = checkpoint.rifleAmmo;
    cannonAmmo = checkpoint.cannonAmmo;
    flares = checkpoint.flares;
    ink = checkpoint.ink;
    bandages = checkpoint.bandages;
    battery = checkpoint.battery;
    lockpicks = checkpoint.lockpicks;
    bindT = 0;
    picking = false;
    dmgFlash = 0;
    stalkTimer = 20; // the hunt resets — a breath before it finds your trail again
    phase = 'PLAY';
    world.setFlashlight(battery > 0);
    enterRoom(checkpoint.room, checkpoint.entry, Math.PI);
    audio.play('save');
    toast('You wake at the last threshold. The house pretends nothing happened.');
  };

  const computePrompt = (): { itemId: string | null; exitIndex: number } => {
    const pos = actor.position;
    // mercy takes priority: a downed Steward + his keepsake in hand
    if (hasKeepsake && !stewardMercy && entities.stewardDownAt(pos, room)) {
      promptText = 'Lay the keepsake — grant mercy';
      return { itemId: '__mercy__', exitIndex: -1 };
    }
    const near = items.nearest(pos, room);
    // nearest door exit
    let exitIndex = -1;
    let exitDist: number = TUNING.interactRange;
    const exits = ROOMS[room].exits;
    const c = ROOMS[room].center;
    for (let i = 0; i < exits.length; i += 1) {
      const ex = exits[i];
      if (ex.noPrompt) continue; // reliable climb zones have no prompt — you just walk them
      // (walkUp wing-stairs KEEP their prompt as a fallback so you can never be stuck)
      const d = Math.hypot(pos.x - (c[0] + ex.at[0]), pos.z - (c[2] + ex.at[1]));
      if (d <= exitDist) {
        exitDist = d;
        exitIndex = i;
      }
    }
    // an interactable in range always wins over a door (clearer intent)
    const itemId: string | null = near ? near.id : null;
    if (itemId) {
      const it = items.byId(itemId)!;
      promptText =
        it.kind === 'npc'
          ? `Speak with ${it.label}`
          : it.kind === 'savedesk'
          ? 'Use Ledger (Save) / Item Box'
          : it.kind === 'book'
            ? `Shelve: ${it.label}`
            : it.kind === 'case'
              ? caseSolved
                ? 'Open case'
                : 'Examine case'
              : it.kind === 'crestdoor'
                ? crestDoorOpen
                  ? 'Enter the Cloister'
                  : 'Seat crest'
                : it.kind === 'phono'
                  ? vaultOpen
                    ? 'Phonograph'
                    : shards >= 3
                      ? 'Play the Vane song'
                      : `Phonograph (need cylinder ${shards}/3)`
                  : it.kind === 'vault'
                    ? vaultOpen
                      ? 'Open vault'
                      : 'Examine vault'
                    : it.kind === 'furnace'
                      ? furnaceLit
                        ? 'Furnace (lit)'
                        : hasOil
                          ? 'Light the furnace'
                          : 'Furnace (needs oil)'
                      : it.kind === 'valve'
                        ? leviathanExposed
                          ? 'Valve console'
                          : hasTideValve
                            ? 'Crank the tide-valve'
                            : 'Valve console (needs wheel)'
                        : it.kind === 'fusebox'
                          ? 'Throw the breakers'
                          : it.kind === 'lockbox'
                            ? lockpicks > 0
                              ? 'Pick the lock'
                              : 'Locked (need a lockpick)'
                          : it.kind === 'safe'
                            ? safeOpened
                              ? 'Wall-safe (open)'
                              : hasLocket
                                ? 'Open with the locket'
                                : 'Wall-safe (locket keyhole)'
                            : it.kind === 'doc'
                              ? 'Read'
                              : `Take ${it.label}`;
      exitIndex = -1;
    } else if (exitIndex >= 0) {
      const ex = exits[exitIndex];
      promptText = !exitOpen(ex) ? `${ex.label} (Locked)` : `Go to ${ex.label}`;
    } else {
      promptText = '';
    }
    return { itemId, exitIndex };
  };

  const tick = (dt: number) => {
    world.setBrightness(controls.getBrightness()); // apply the Settings brightness every frame
    if (phase === 'TITLE') {
      const i = controls.consume();
      if (i.use || i.attack) {
        startGame();
        return;
      }
      // ── intro cinematic: a slow, live camera fly-through of the Great Hall,
      // creeping from the flooded entrance toward the dark staircase. Rendered
      // real-time behind the story text — the game's "video" cutscene. ──
      cineT += dt;
      if (!cineAudioStarted) {
        cineAudioStarted = true;
        audio.ambience('explore'); // begins once the browser unlocks audio (first click)
      }
      const x = Math.min(1, cineT / 34);
      const p = x * x * (3 - 2 * x); // smoothstep ease
      // waypoints: A = wide, high, at the entrance · B = pushed in, tilted up the stairs
      const ax = 5.5, ay = 2.8, az = 8.5, atx = -1, aty = 1.4, atz = 0;
      const bx = -2.5, by = 1.8, bz = -1.5, btx = -4, bty = 2.8, btz = -8.5;
      const swX = Math.sin(cineT * 0.3) * 0.22;
      const swY = Math.sin(cineT * 0.23) * 0.12;
      const px = ax + (bx - ax) * p + swX;
      const py = ay + (by - ay) * p + swY;
      const pz = az + (bz - az) * p;
      const tx = atx + (btx - atx) * p;
      const ty = aty + (bty - aty) * p;
      const tz = atz + (btz - atz) * p;
      const dx = tx - px, dy = ty - py, dz = tz - pz;
      const cam = world.camera;
      cam.position.set(px, py, pz);
      cam.rotation.set(-Math.atan2(dy, Math.hypot(dx, dz)), Math.atan2(dx, dz), 0);
      world.update(dt, cam.position); // flashlight/lantern follow + flicker (no store write)
      return;
    }
    if (phase === 'DEAD' || phase === 'WIN') {
      const i = controls.consume();
      // DEAD: [E]/attack (or the HUD "Rise" button, which presses use) revives
      // at the last threshold checkpoint instead of restarting the run.
      if (phase === 'DEAD' && (i.use || i.attack) && checkpoint) respawnAtCheckpoint();
      pushStore();
      return;
    }

    const input = deps.getInput();
    const dx = devMove ? devMove.x : input?.dir.x ?? 0;
    const dy = devMove ? devMove.y : input?.dir.y ?? 0;

    // transition curtain (stairs climb slower + animate the eye up/down the flight)
    if (transitionActive) {
      transT += dt * (stairDir !== 0 ? 0.6 : 1.4);
      if (stairDir !== 0 && !transSwapped) {
        const p = Math.min(1, transT / 0.5); // climb plays over the pre-swap (fade-out) half
        const cam = world.camera;
        const stepBob = Math.abs(Math.sin(p * Math.PI * 5)) * 0.13; // footfalls on the steps
        cam.position.x = climbX + Math.sin(climbYaw) * p * 1.7;
        cam.position.z = climbZ + Math.cos(climbYaw) * p * 1.7;
        cam.position.y = climbY + stairDir * p * 1.5 + stepBob;
        cam.rotation.set(-stairDir * 0.12, climbYaw, 0); // glance up/down the flight
        const beat = Math.floor(p * 5);
        if (beat !== climbBeat) {
          climbBeat = beat;
          audio.play('step');
        }
      }
      if (!transSwapped && transT >= 0.5) {
        transSwapped = true;
        enterRoom(transTo, transEntry, transFace);
        // snap the eye to the destination so the fade-in reveals the new room,
        // not the void the static camera would otherwise show mid-swap
        world.camera.position.set(actor.position.x, TUNING.eyeHeight, actor.position.z);
        world.camera.rotation.set(0, transFace, 0);
      }
      if (transT >= 1) {
        transitionActive = false;
      }
      world.update(dt, actor.position);
      pushStore();
      return;
    }

    const intents = controls.consume();
    // inventory screen: toggle with [I]/[Tab]; pauses play (movement + enemies) while open
    if (intents.inventory && !picking) inventoryOpen = !inventoryOpen;
    if (inventoryOpen) {
      if (intents.invAction) applyInvAction(intents.invAction);
      pushStore();
      return;
    }
    const frozen = phase !== 'PLAY';

    // ── lock-picking: rooted + vulnerable, world stays LIVE (enemies still hit) ──
    if (picking) {
      pickAngle += pickDir * pickSpeed * dt;
      if (pickAngle >= 1) { pickAngle = 1; pickDir = -1; } else if (pickAngle <= 0) { pickAngle = 0; pickDir = 1; }
      if (intents.use || intents.attack) attemptPin();
      else if (intents.swap) cancelPick();
    }
    const busyPick = picking;

    // ── wound-binding: rooted + vulnerable while the bandage goes on ──
    if (intents.bind && bindT <= 0 && !frozen && !busyPick) {
      if (bandages <= 0) {
        toast('No bandages.');
        audio.play('puzzleBad');
      } else if (hp >= TUNING.playerMaxHp) {
        toast('No wound to bind.');
      } else {
        bindT = TUNING.bindDuration;
        toast('Binding the wound — hold still…');
        audio.play('ui');
      }
    }
    const busyBinding = bindT > 0;
    // ── sprint: gated on stamina, rooted-out while binding/picking ──
    const sprinting = intents.sprintHeld && stamina > 0 && canSprint && !busyBinding && !busyPick && !frozen;

    // move (binding / picking roots you in place)
    actor.update({
      input: devMove ? ({ dir: { x: dx, y: dy }, actionHeld: false } as unknown as Input) : input,
      camera: world.camera,
      world,
      roomId: room,
      deltaSeconds: dt,
      frozen: frozen || busyBinding || busyPick,
      sprint: sprinting,
    });

    // ── survival meters ──
    if (sprinting && actor.moving) stamina = Math.max(0, stamina - TUNING.sprintDrain * dt);
    else stamina = Math.min(TUNING.staminaMax, stamina + TUNING.staminaRegen * dt);
    if (stamina <= 0) canSprint = false;
    else if (stamina >= TUNING.staminaFloor) canSprint = true;
    if (world.flashlightOn()) {
      battery = Math.max(0, battery - TUNING.batteryDrain * dt);
      if (battery <= 0) {
        world.setFlashlight(false);
        toast('The flashlight sputters out — darkness.');
        audio.play('puzzleBad');
      }
    }
    world.setFlashlightHealth(battery / TUNING.batteryMax); // dying-cell flicker warning
    if (bindT > 0) {
      bindT -= dt;
      if (bindT <= 0) {
        bindT = 0;
        bandages -= 1;
        hp = Math.min(TUNING.playerMaxHp, hp + TUNING.bindHeal);
        toast('Wound bound. (Bandage -1)');
        audio.play('save');
      }
    }

    // footsteps (quicker cadence when sprinting)
    if (actor.moving) {
      stepTimer -= dt;
      if (stepTimer <= 0) {
        audio.play('step');
        stepTimer = sprinting ? 0.28 : 0.42;
      }
    }

    // walkable stairs: climb them freely — the transition fires when you reach
    // the top (armed only after you've stepped off, so you don't bounce back).
    if (!frozen) {
      const stairExit = world.stairTrigger(room, actor.position);
      if (!stairExit) {
        stairArmed = true;
      } else if (stairArmed) {
        const ex = ROOMS[room].exits.find((e) => e.id === stairExit);
        if (ex) {
          stairArmed = false;
          beginTransition(ex.to, ex.entryLocal, Math.atan2(-ex.entryLocal[0], -ex.entryLocal[1]));
        }
      }
    }

    // enemies
    const et = entities.update(dt, actor.position, world);
    if (et.contactDamage > 0) {
      hp -= et.contactDamage * dt;
      if (et.grabbed && Math.random() < dt * 1.5) audio.play('grab');
    }
    if (et.burstDamage > 0) {
      hp -= et.burstDamage;
      if (et.weeperSpat) audio.play('weeperSpit');
    }
    // ── damage feedback: directional vignette + view-shake ──
    const tookHit = et.contactDamage > 0 || et.burstDamage > 0;
    if (tookHit) {
      const a = entities.hitFromAngle(actor.position, room);
      if (a !== null) dmgAngle = a - actor.facingYaw;
      if (et.burstDamage > 0) {
        // discrete hit → a sharp jolt + strong flash
        dmgFlash = Math.min(1, dmgFlash + 0.85);
        actor.addShake(0.55 + Math.min(0.6, et.burstDamage * 0.03));
      } else {
        // continuous contact (grab / spore aura) → steady red glow, NO per-frame
        // shake (that made the view jitter endlessly = "can't stand still")
        dmgFlash = Math.min(0.55, dmgFlash + dt * 2.2);
      }
    }
    dmgFlash = Math.max(0, dmgFlash - dt * 2.4);
    // boss music while the Bloom is alive + you're in its arena
    if (et.bossActive && !bloomActivatedAmbience) {
      bloomActivatedAmbience = true;
      audio.ambience(room === 'cistern' ? 'bossLeviathan' : room === 'lab' ? 'bossSteward' : room === 'lighthouse' ? 'bossFounder' : 'boss');
      audio.play(room === 'cistern' ? 'leviathanRoar' : room === 'lab' ? 'stewardFinalRoar' : room === 'lighthouse' ? 'founderRoar' : 'bloomRoar');
    }
    if (et.newRipen) audio.play('ripen');
    stewardProx = et.stewardProx;
    world.setStewardProximity(stewardProx);
    if (stewardActivated && stewardProx > 0.45) audio.ambience('steward');
    // A3: you HEAR the Steward hunting — footfalls quicken as it closes in
    if (stewardActivated && entities.stewardActive() && stewardProx > 0.06) {
      stepStalkT -= dt;
      if (stepStalkT <= 0) {
        audio.play('stewardStep');
        stepStalkT = 1.15 - stewardProx * 0.8; // ~1.1s far → ~0.35s right behind you
      }
    }

    // steward follows through doors
    if (stewardRelocTimer > 0) {
      stewardRelocTimer -= dt;
      if (stewardRelocTimer <= 0) entities.relocateStewardTo(room, world);
    }

    // ── persistent Stalker: the Steward hunts you down even if you hole up in a
    // far room. The clock ticks faster while your flashlight burns (it's drawn
    // to the light); when it runs out it arrives in YOUR room. ──
    if (stewardActivated && entities.stewardActive() && stewardRelocTimer <= 0) {
      const sr = entities.stewardRoom();
      if (sr !== null && sr !== room) {
        stalkTimer -= dt * (world.flashlightOn() ? 1.8 : 1.0);
        if (stalkTimer <= 0) {
          entities.relocateStewardTo(room, world);
          audio.play('stewardStep');
          toast('A door opens somewhere close. It has found your trail.');
          stalkTimer = world.flashlightOn() ? 11 : 17;
        }
      } else {
        stalkTimer = 14; // it's already here (or down) — reset the hunt clock
      }
    }

    // health / death
    world.setHealthFactor(hp / TUNING.playerMaxHp);
    if (hp <= 0) {
      die();
      pushStore();
      return;
    }

    // interaction prompt + intents (while picking a lock, those inputs are the
    // minigame's — don't also fire interact/attack/swap here)
    const { itemId, exitIndex } = computePrompt();
    if (!busyPick) {
      if (intents.use) interact(itemId, exitIndex);
      if (intents.attack && !busyBinding) doAttack();
      if (intents.swap) cycleWeapon();
    }
    if (intents.slot > 0) equipSlot(intents.slot);
    if (intents.flashlight) toggleFlashlight();

    // items spin
    items.update(dt);
    world.update(dt, actor.position);
    // keep the first-person weapon viewmodel in sync + animate it
    weaponView.setWeapon(weapon);
    weaponView.update(dt, actor.moving);

    // toast decay
    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) toastText = '';
    }

    // throttled store push
    storeTimer -= dt;
    if (storeTimer <= 0) {
      storeTimer = 0.1;
      pushStore();
    }
  };

  // attempt to start on first user gesture from the TITLE screen via controls;
  // initial store push so the HUD shows the title.
  pushStore();

  return {
    tick,
    dispose() {
      // nothing extra; owned objects disposed by game.ts
    },
    dev: {
      start: startGame,
      move(x, y) {
        devMove = x === 0 && y === 0 ? null : { x, y };
      },
      use: () => controls.pressUse(),
      attack: () => controls.pressAttack(),
      swap: () => controls.pressSwap(),
      enter: (r) => enterRoom(r, ROOMS[r].spawnLocal, Math.PI),
      goto: (lx: number, lz: number) => actor.teleport(world, room, lx, lz, Math.PI),
      seat: (n: number) => {
        crestsSeated = Math.max(0, Math.min(4, n | 0));
        crestDoorOpen = crestsSeated >= 4;
        items.setCrestSockets(crestsSeated);
      },
      setw: (w: string) => { weapon = w as Weapon; },
      flashlight: () => toggleFlashlight(),
      snapshot: () => getGameSnapshot(),
      state: () => ({ phase, room, hp, ammo, rifleAmmo, flares, ink, weapon, hasPistol, hasRifle, hasBrassKey, hasSilverKey, caseSolved, crestsHeld: [...crestsHeld], crestsSeated, shards, vaultOpen, hasOil, furnaceLit, leviathanExposed, hasIronKey, crestDoorOpen, hasBoneKey, hasCannon, cannonAmmo, hasBloodSample, hasKeycard, lampStairOpen, trueEnding, stewardActivated, bookSeq: [...bookSeq], px: actor.position.x, pz: actor.position.z, moving: actor.moving, lastHit, enemiesAlive: entities.aliveCount(room), bossAlive: entities.bossAlive(), hasTideValve, flashlightOn: world.flashlightOn(), stamina: Math.round(stamina), battery: Math.round(battery), bandages, bindT: +bindT.toFixed(2) }),
    },
  };
}
