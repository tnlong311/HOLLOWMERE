// ══════════════════════════════════════════════
// HOLLOWMERE entities — the Sallowed (with the signature RIPENING: a downed
// body reanimates unless burned) and the Steward (the relentless, only-
// downable pursuer). Enemies act only in the active room.
// ══════════════════════════════════════════════

import { AnimationGroup, Color3, MeshBuilder, Scene, TransformNode, Vector3 } from '@babylonjs/core';
import { createStandardMaterial, loadGlbModel } from './helpers';
import { ASSET_KEYS, TUNING, type RoomId } from './config';
import { ASSETS } from '../assets';
import { createBloodFx } from './blood';
import type { GameWorldObjects } from './world';

type EnemyKind = 'sallowed' | 'steward' | 'weeper' | 'hound' | 'bloom' | 'crawler' | 'leviathan' | 'drowned' | 'steward_final' | 'founder';
type SallowState = 'alive' | 'corpse' | 'ripened' | 'gone';
type StewardState = 'idle' | 'hunt' | 'down';

interface Enemy {
  kind: EnemyKind;
  roomId: RoomId;
  lx: number;
  lz: number;
  placed: boolean;
  root: TransformNode;
  hp: number;
  state: SallowState | StewardState;
  ripen: number;
  downTimer: number;
  attackT: number; // drives the current attack animation (phase timer)
  spitT: number; // ranged-attack / spit timer
  pat: number; // which attack pattern is playing
  atkPhase: number; // 0 chase/idle · 1 windup · 2 strike · 3 recover
  struck: boolean; // has this attack already landed its hit
  atkCd: number; // cooldown before the next attack
  aggro: boolean; // has noticed the player (stays true once triggered — relentless)
  dropped: boolean; // Crawler has dropped from the ceiling
  nodesLeft: number; // Bloom heart-nodes remaining
  nodeHp: number; // hp of the current Bloom node
  nodes: TransformNode[]; // Bloom heart-node meshes
  walk?: AnimationGroup;
  idle?: AnimationGroup;
  current?: AnimationGroup;
}

export interface EntitiesTick {
  contactDamage: number; // hp/sec applied to player this frame
  burstDamage: number; // discrete damage this frame (ranged spit / boss lob)
  grabbed: boolean;
  stewardProx: number; // 0..1
  newCorpse: boolean;
  newRipen: boolean;
  burned: boolean;
  weeperSpat: boolean; // a ranged attacker hit you this frame (sfx cue)
  bossActive: boolean; // the Bloom is alive + you are in its arena
}

export interface SceneEntities {
  setActiveRoom(id: RoomId, world: GameWorldObjects): void;
  update(dt: number, playerPos: Vector3, world: GameWorldObjects): EntitiesTick;
  // returns kind hit: 'kill' | 'hit' | 'burn-perm' | 'none' | 'steward-down' | 'steward-hit' | 'boss-hit' | 'boss-down'
  attackNearest(playerPos: Vector3, facingYaw: number, damage: number, isBurn: boolean, range: number, precise: boolean): string;
  activateSteward(roomId: RoomId): void;
  relocateStewardTo(roomId: RoomId, world: GameWorldObjects): void;
  stewardActive(): boolean;
  stewardRoom(): RoomId | null; // current room of the roaming Steward (null if idle/down)
  aliveCount(roomId: RoomId): number;
  bossAlive(): boolean;
  exposeLeviathan(): void;
  dispose(): void;
}

const SPAWNS: { kind: EnemyKind; roomId: RoomId; lx: number; lz: number }[] = [
  { kind: 'sallowed', roomId: 'hall', lx: 3, lz: -3 }, // first encounter — you meet one immediately
  { kind: 'sallowed', roomId: 'corridor', lx: 1.6, lz: -2 },
  { kind: 'sallowed', roomId: 'library', lx: -4, lz: -3 },
  { kind: 'sallowed', roomId: 'library', lx: 4.5, lz: 2.5 },
  // Conservatory wing
  { kind: 'hound', roomId: 'conservatory', lx: -5, lz: -5 },
  { kind: 'hound', roomId: 'conservatory', lx: -5, lz: 5 },
  { kind: 'weeper', roomId: 'conservatory', lx: 6, lz: -6 },
  // West Wing — Crawlers drop from the gallery ceiling
  { kind: 'crawler', roomId: 'long_gallery', lx: 0, lz: 2 },
  { kind: 'crawler', roomId: 'long_gallery', lx: 0, lz: 7 },
  // Cellars — the Drowned
  { kind: 'drowned', roomId: 'boiler', lx: 3, lz: 3 },
  { kind: 'drowned', roomId: 'cistern', lx: -6, lz: -4 },
  { kind: 'drowned', roomId: 'cistern', lx: 6, lz: -4 },
  // v3.3: the Dining tableau — seated dead that rise
  { kind: 'sallowed', roomId: 'dining', lx: 1.3, lz: 1.6 },
  { kind: 'sallowed', roomId: 'dining', lx: -1.3, lz: 1.6 },
  { kind: 'sallowed', roomId: 'dining', lx: 0, lz: -1.6 },
  { kind: 'sallowed', roomId: 'dining', lx: 2.6, lz: -1.6 },
  // v3.3: a Crawler haunts the nursery ceiling; the Interred stir in the crypt
  { kind: 'crawler', roomId: 'nursery', lx: 0, lz: 3 },
  { kind: 'drowned', roomId: 'crypt', lx: -4, lz: 0 },
  { kind: 'drowned', roomId: 'crypt', lx: 4, lz: 4 },
];

const pick = (g: AnimationGroup[], n: string) => g.find((x) => x.name.toLowerCase().includes(n));

// ── Melee attack repertoire ──────────────────────────────────────────
// Each melee enemy chooses from a small set of TELEGRAPHED attacks: a windup
// (visible tell → your window to dodge), a strike (the hit lands once), and a
// recover. Different patterns read differently so combat isn't "walk in + drain".
type Pat = 'swipe' | 'lunge' | 'overhead' | 'pounce' | 'bite';
// [windup, strike, recover] seconds
const PAT_TIMES: Record<Pat, [number, number, number]> = {
  swipe: [0.34, 0.2, 0.3],
  lunge: [0.42, 0.22, 0.34],
  overhead: [0.58, 0.16, 0.42],
  pounce: [0.3, 0.3, 0.36],
  bite: [0.14, 0.12, 0.2],
};
interface MeleeCfg {
  speed: number;
  range: number;
  patterns: Pat[];
  dmg: number;
  cd: number;
}
const MELEE: Partial<Record<EnemyKind, MeleeCfg>> = {
  sallowed: { speed: TUNING.enemyChaseSpeed, range: 2.1, patterns: ['swipe', 'lunge'], dmg: 17, cd: 0.85 },
  hound: { speed: TUNING.houndSpeed, range: 2.7, patterns: ['pounce', 'bite'], dmg: 13, cd: 0.58 },
  drowned: { speed: TUNING.drownedSpeed, range: 2.2, patterns: ['overhead', 'lunge'], dmg: 26, cd: 1.35 },
  crawler: { speed: TUNING.crawlerSpeed, range: 2.2, patterns: ['pounce', 'swipe'], dmg: 16, cd: 0.72 },
  steward: { speed: TUNING.stewardSpeed, range: 2.5, patterns: ['overhead', 'swipe'], dmg: 22, cd: 1.0 },
};

export function createSceneEntities(scene: Scene): SceneEntities {
  // LLM-EXTENSION:ENTITIES — enemy roster (Sallowed + Steward), AI, ripening.
  // DO NOT REMOVE the LLM-EXTENSION:ENTITIES tag — templates/3d/scripts/check-architecture.mjs requires it to appear exactly once across the src tree.
  const enemies: Enemy[] = [];
  let activeRoom: RoomId = 'hall';
  let animT = 0; // drives the code-side shambling lurch (Seed3D enemies are static)
  const blood = createBloodFx(scene);
  const HIT_DIR = new Vector3();
  const HIT_AT = new Vector3();

  const KIND_ASSET: Record<EnemyKind, string> = {
    sallowed: ASSET_KEYS.chars.sallowed,
    steward: ASSET_KEYS.chars.steward,
    weeper: ASSET_KEYS.chars.weeper,
    hound: ASSET_KEYS.chars.hollowhound,
    bloom: ASSET_KEYS.chars.bloom,
    crawler: ASSET_KEYS.chars.crawler,
    leviathan: ASSET_KEYS.chars.leviathan,
    drowned: ASSET_KEYS.chars.drowned,
    steward_final: ASSET_KEYS.chars.stewardFinal,
    founder: ASSET_KEYS.chars.founder,
  };
  const KIND_SIZE: Record<EnemyKind, number> = { sallowed: 1.7, steward: 2.05, weeper: 1.8, hound: 1.2, bloom: 3.2, crawler: 1.5, leviathan: 4.2, drowned: 1.8, steward_final: 3.4, founder: 3.0 };
  const KIND_COLOR: Record<EnemyKind, [number, number, number]> = {
    sallowed: [0.32, 0.36, 0.26],
    steward: [0.2, 0.18, 0.16],
    weeper: [0.3, 0.32, 0.3],
    hound: [0.4, 0.22, 0.2],
    bloom: [0.3, 0.4, 0.24],
    crawler: [0.36, 0.34, 0.36],
    leviathan: [0.3, 0.38, 0.42],
    drowned: [0.28, 0.36, 0.34],
    steward_final: [0.34, 0.32, 0.4],
    founder: [0.46, 0.5, 0.58],
  };
  const isBoss = (k: EnemyKind) => k === 'bloom' || k === 'leviathan' || k === 'steward_final' || k === 'founder';
  const bossNodes = (k: EnemyKind) =>
    k === 'leviathan' ? TUNING.leviathanNodes : k === 'steward_final' ? TUNING.stewardFinalNodes : k === 'founder' ? TUNING.founderNodes : TUNING.bloomNodes;
  const bossNodeHp = (k: EnemyKind) =>
    k === 'leviathan' ? TUNING.leviathanNodeHp : k === 'steward_final' ? TUNING.stewardFinalNodeHp : k === 'founder' ? TUNING.founderNodeHp : TUNING.bloomNodeHp;

  const makeEnemyVisual = (root: TransformNode, e: Enemy) => {
    const idx = enemies.length;
    const c = KIND_COLOR[e.kind];
    const mat = createStandardMaterial(scene, `enemy-fb-${idx}`, new Color3(c[0], c[1], c[2]), new Color3(c[0] * 0.15, c[1] * 0.15, c[2] * 0.1));
    const body = isBoss(e.kind)
      ? MeshBuilder.CreateSphere(`enemy-fb-${idx}`, { diameter: 2.6 }, scene)
      : MeshBuilder.CreateCapsule(`enemy-fb-${idx}`, { radius: e.kind === 'hound' ? 0.34 : 0.3, height: e.kind === 'hound' ? 1.0 : 1.6 }, scene);
    body.material = mat;
    body.position.y = isBoss(e.kind) ? 1.4 : e.kind === 'hound' ? 0.5 : 0.8;
    body.parent = root;
    const url = ASSETS[KIND_ASSET[e.kind]];
    if (url) {
      void loadGlbModel(scene, url, `${e.kind}-${idx}`).then((loaded) => {
        if (!loaded) return;
        const { min, max } = loaded.root.getHierarchyBoundingVectors(true);
        const h = max.y - min.y || 1.7;
        const s = KIND_SIZE[e.kind] / h;
        loaded.root.scaling.setAll(s);
        loaded.root.position.y = -min.y * s;
        loaded.root.parent = root;
        body.setEnabled(false);
        e.idle = pick(loaded.animationGroups, 'idle');
        e.walk = pick(loaded.animationGroups, 'walk') ?? pick(loaded.animationGroups, 'run');
        (e.walk ?? e.idle)?.start(true);
        e.current = e.walk ?? e.idle;
      });
    }
    // Boss weak-points: glowing nodes ringed around the boss (destroy them)
    if (isBoss(e.kind)) {
      const count = bossNodes(e.kind);
      const nodeUrl = ASSETS[ASSET_KEYS.props.bloomNode];
      for (let n = 0; n < count; n++) {
        const ang = (n / count) * Math.PI * 2;
        const nodeRoot = new TransformNode(`bloom-node-${n}`, scene);
        nodeRoot.parent = root;
        nodeRoot.position.set(Math.cos(ang) * 1.7, 1.0 + Math.sin(ang) * 0.3, Math.sin(ang) * 1.7);
        const nmat = createStandardMaterial(scene, `node-fb-${idx}-${n}`, new Color3(0.6, 0.85, 0.3), new Color3(0.4, 0.7, 0.2));
        const nfb = MeshBuilder.CreateSphere(`node-fb-${idx}-${n}`, { diameter: 0.7 }, scene);
        nfb.material = nmat;
        nfb.parent = nodeRoot;
        if (nodeUrl) {
          void loadGlbModel(scene, nodeUrl, `bloom-node-${idx}-${n}`).then((loaded) => {
            if (!loaded) return;
            const { min, max } = loaded.root.getHierarchyBoundingVectors(true);
            const ext = Math.max(max.x - min.x, max.y - min.y, max.z - min.z) || 1;
            loaded.root.scaling.setAll(0.8 / ext);
            loaded.root.parent = nodeRoot;
            nfb.setEnabled(false);
          });
        }
        e.nodes.push(nodeRoot);
      }
    }
  };

  const spawn = (kind: EnemyKind, roomId: RoomId, lx: number, lz: number): Enemy => {
    const root = new TransformNode(`enemy-${enemies.length}`, scene);
    const hp =
      kind === 'steward' ? TUNING.stewardDownThreshold : kind === 'hound' ? TUNING.houndMaxHp : kind === 'crawler' ? TUNING.crawlerMaxHp : kind === 'drowned' ? TUNING.drownedMaxHp : TUNING.enemyMaxHp;
    const e: Enemy = {
      kind,
      roomId,
      lx,
      lz,
      placed: false,
      root,
      hp,
      state: kind === 'steward' ? 'idle' : 'alive',
      ripen: 0,
      downTimer: 0,
      attackT: 0,
      spitT: 0,
      pat: 0,
      atkPhase: 0,
      struck: false,
      atkCd: 0,
      aggro: false,
      dropped: false, // crawler: on ceiling; leviathan: submerged (set true when exposed/dropped)
      nodesLeft: isBoss(kind) ? bossNodes(kind) : 0,
      nodeHp: bossNodeHp(kind),
      nodes: [],
    };
    enemies.push(e);
    makeEnemyVisual(root, e);
    root.setEnabled(false);
    return e;
  };

  for (const s of SPAWNS) spawn(s.kind, s.roomId, s.lx, s.lz);
  const steward = spawn('steward', 'library', 0, -5);
  const bloom = spawn('bloom', 'conservatory', 0, 2);
  const leviathan = spawn('leviathan', 'cistern', 0, 4);
  const stewardFinal = spawn('steward_final', 'lab', 0, 4);
  const founder = spawn('founder', 'lighthouse', 0, 4);

  const placeInRoom = (e: Enemy, world: GameWorldObjects) => {
    const c = world.roomCenter(e.roomId);
    e.root.position.set(c.x + e.lx, c.y, c.z + e.lz);
    e.placed = true;
  };

  const enabledFor = (e: Enemy) =>
    e.roomId === activeRoom && e.state !== 'gone' && !(e.kind === 'steward' && e.state === 'idle');

  const refreshEnabled = (world?: GameWorldObjects) => {
    for (const e of enemies) {
      const on = enabledFor(e);
      if (on && world && !e.placed) placeInRoom(e, world);
      e.root.setEnabled(on);
    }
  };

  const setCurrent = (e: Enemy, next?: AnimationGroup) => {
    if (!next || next === e.current) return;
    e.current?.stop();
    next.start(true);
    e.current = next;
  };

  const layCorpse = (e: Enemy) => {
    e.root.rotation.x = Math.PI / 2.2;
    e.current?.stop();
  };
  const standUp = (e: Enemy) => {
    e.root.rotation.x = 0;
    setCurrent(e, e.walk ?? e.idle);
  };

  // Shared melee state-machine: chase → (in range) windup → strike → recover.
  // Damage lands ONCE per swing, only if you're still in reach — so moving out
  // during the windup dodges the blow. Returns nothing; mutates e + result.
  const runMelee = (e: Enemy, dx: number, dz: number, dist: number, dt: number, result: EntitiesTick, cfg: MeleeCfg, world: GameWorldObjects, speedMul = 1) => {
    const dirx = dx / (dist || 1);
    const dirz = dz / (dist || 1);
    e.root.rotation.y = Math.atan2(dirx, dirz); // always face the player

    if (e.atkPhase === 0) {
      e.atkCd = Math.max(0, e.atkCd - dt);
      if (dist > cfg.range) {
        e.root.position.x += dirx * cfg.speed * speedMul * dt;
        e.root.position.z += dirz * cfg.speed * speedMul * dt;
        world.clampToRoom(e.roomId, e.root.position);
        e.root.rotation.z = Math.sin(animT * 7 + e.lx) * 0.12;
        e.root.rotation.x = 0.1 + Math.sin(animT * 7 + e.lx) * 0.05;
        setCurrent(e, e.walk ?? e.idle);
      } else if (e.atkCd <= 0) {
        e.pat = (Math.random() * cfg.patterns.length) | 0; // begin a fresh attack
        e.atkPhase = 1;
        e.attackT = 0;
        e.struck = false;
      } else {
        e.root.rotation.x = 0.12; // menacing hold between swings
        e.root.rotation.z = Math.sin(animT * 4) * 0.05;
      }
      return;
    }

    const p = cfg.patterns[e.pat];
    const [tw, ts, tr] = PAT_TIMES[p];
    e.attackT += dt;
    const t = e.attackT;

    // the hit lands at the start of the strike window — once, if still in reach
    if (t >= tw && !e.struck) {
      e.struck = true;
      if (dist <= cfg.range + 1.4) {
        result.burstDamage += cfg.dmg;
        result.grabbed = true;
      }
    }

    if (p === 'swipe') {
      const w = Math.min(1, t / tw);
      const s = t < tw ? 0 : Math.min(1, (t - tw) / ts);
      e.root.rotation.z = w * 0.7 - s * 1.4; // cock to one side, sweep across
      e.root.rotation.x = 0.15;
    } else if (p === 'lunge') {
      if (t >= tw && t < tw + ts) {
        e.root.position.x += dirx * cfg.speed * 2.4 * dt; // dart forward on the strike
        e.root.position.z += dirz * cfg.speed * 2.4 * dt;
        world.clampToRoom(e.roomId, e.root.position);
      }
      e.root.rotation.x = t < tw ? -0.35 * (t / tw) : 0.5; // lean back, then thrust
      e.root.rotation.z = 0;
    } else if (p === 'overhead') {
      e.root.rotation.x = t < tw ? -0.55 * (t / tw) : 0.78; // rear up high, slam down
      e.root.rotation.z = 0;
    } else if (p === 'pounce') {
      if (t < tw) {
        e.root.rotation.x = 0.32; // crouch
      } else if (t < tw + ts) {
        const s = (t - tw) / ts;
        e.root.position.y = Math.sin(s * Math.PI) * 1.3; // leap arc
        e.root.position.x += dirx * cfg.speed * 2.0 * dt;
        e.root.position.z += dirz * cfg.speed * 2.0 * dt;
        world.clampToRoom(e.roomId, e.root.position);
        e.root.rotation.x = -0.2;
      } else {
        e.root.position.y = 0;
        e.root.rotation.x = 0.2;
      }
    } else {
      // bite: quick snap
      const s = t < tw ? t / tw : 1 - Math.min(1, (t - tw) / (ts + tr));
      e.root.rotation.x = 0.15 + s * 0.5;
      e.root.rotation.z = 0;
    }

    if (t >= tw + ts + tr) {
      e.atkPhase = 0;
      e.attackT = 0;
      e.struck = false;
      e.atkCd = cfg.cd + Math.random() * 0.5;
      e.root.rotation.x = 0.1;
      e.root.rotation.z = 0;
      e.root.position.y = 0;
    }
  };

  return {
    setActiveRoom(id, world) {
      activeRoom = id;
      refreshEnabled(world);
    },
    update(dt, playerPos, world) {
      animT += dt;
      const result: EntitiesTick = { contactDamage: 0, burstDamage: 0, grabbed: false, stewardProx: 0, newCorpse: false, newRipen: false, burned: false, weeperSpat: false, bossActive: false };
      // Detection scales with your light: the flashlight beam gives you away from
      // far off, while moving in the dark keeps you hidden until they're close.
      // Once an enemy notices you it stays aggroed (relentless) until killed.
      const sight = TUNING.enemySightRange * (world.flashlightOn() ? 1.9 : 0.5);
      const senses = (e: Enemy, dist: number): boolean => {
        if (!e.aggro && (dist < sight || e.atkPhase !== 0)) e.aggro = true;
        return e.aggro;
      };
      for (const e of enemies) {
        if (e.roomId !== activeRoom || e.state === 'gone') continue;
        if (e.kind === 'steward' && e.state === 'idle') continue;
        if (!e.placed) placeInRoom(e, world);
        if (!e.root.isEnabled()) e.root.setEnabled(true);

        if (e.kind === 'sallowed') {
          if (e.state === 'corpse') {
            e.ripen -= dt;
            if (e.ripen <= 0) {
              // RESPAWN: a Sallowed that was never burned returns, fresh, at its
              // post. Only fire (the flare) is a permanent kill.
              e.state = 'alive';
              e.hp = TUNING.enemyMaxHp;
              placeInRoom(e, world);
              e.root.rotation.set(0, 0, 0);
              e.attackT = 0;
              standUp(e);
              result.newRipen = true;
            }
            continue;
          }
          // alive or ripened -> chase + telegraphed swipe / lunge
          const dx = playerPos.x - e.root.position.x;
          const dz = playerPos.z - e.root.position.z;
          const dist = Math.hypot(dx, dz);
          if (senses(e, dist)) {
            runMelee(e, dx, dz, dist, dt, result, MELEE.sallowed!, world, e.state === 'ripened' ? 1.35 : 1);
          } else {
            e.atkPhase = 0;
            e.root.rotation.x = 0;
            e.root.rotation.z = 0;
            setCurrent(e, e.idle ?? e.walk);
          }
        } else if (e.kind === 'steward') {
          // steward
          if (e.state === 'idle') continue;
          if (e.state === 'down') {
            e.downTimer -= dt;
            if (e.downTimer <= 0) {
              e.state = 'hunt';
              e.hp = TUNING.stewardDownThreshold;
              standUp(e);
            }
            continue;
          }
          const dx = playerPos.x - e.root.position.x;
          const dz = playerPos.z - e.root.position.z;
          const dist = Math.hypot(dx, dz);
          result.stewardProx = Math.max(result.stewardProx, 1 - Math.min(1, dist / (TUNING.enemySightRange + 4)));
          // the relentless pursuer: heavy shear overhead / wide sweep
          runMelee(e, dx, dz, dist, dt, result, MELEE.steward!, world);
        } else if (e.kind === 'hound') {
          // fast pack hound: closes the gap, then a leaping pounce or a rapid bite
          const dx = playerPos.x - e.root.position.x;
          const dz = playerPos.z - e.root.position.z;
          const dist = Math.hypot(dx, dz);
          if (senses(e, dist)) runMelee(e, dx, dz, dist, dt, result, MELEE.hound!, world);
          else setCurrent(e, e.idle ?? e.walk);
        } else if (e.kind === 'crawler') {
          // perches on the ceiling, then drops and sprints when you're close
          const dx = playerPos.x - e.root.position.x;
          const dz = playerPos.z - e.root.position.z;
          const dist = Math.hypot(dx, dz);
          if (!e.dropped) {
            e.root.position.y = 3.4;
            e.root.rotation.set(Math.PI, animT * 0.8 + e.lx, 0); // upside-down skitter
            if (dist < TUNING.crawlerDropRange || senses(e, dist)) e.dropped = true;
          } else if (e.root.position.y > 0.05 && e.atkPhase === 0) {
            e.root.position.y = Math.max(0, e.root.position.y - 9 * dt); // finish the drop
            e.root.rotation.set(0.1, Math.atan2(dx / (dist || 1), dz / (dist || 1)), 0);
          } else {
            // grounded: erratic pounces + sweeping claw
            runMelee(e, dx, dz, dist, dt, result, MELEE.crawler!, world);
          }
        } else if (e.kind === 'weeper') {
          // acid-spitter: KITES to mid-range, telegraphs (rears its head), then a
          // single spit or a rapid 3-shot volley; skitters back if you close in.
          const dx = playerPos.x - e.root.position.x;
          const dz = playerPos.z - e.root.position.z;
          const dist = Math.hypot(dx, dz);
          const dirx = dx / (dist || 1);
          const dirz = dz / (dist || 1);
          e.root.rotation.y = Math.atan2(dirx, dirz);
          if (dist < 3.4) {
            e.root.position.x -= dirx * 2.2 * dt; // too close — skitter backward
            e.root.position.z -= dirz * 2.2 * dt;
            world.clampToRoom(e.roomId, e.root.position);
            e.root.rotation.x = 0.1 + Math.sin(animT * 16) * 0.2;
          } else if (dist > 7 && dist < TUNING.weeperRange) {
            e.root.position.x += dirx * 1.0 * dt; // drift into effective range
            e.root.position.z += dirz * 1.0 * dt;
            world.clampToRoom(e.roomId, e.root.position);
          }
          if (dist < TUNING.weeperRange) {
            e.spitT -= dt;
            const charge = e.spitT < 0.45 && e.spitT > 0 ? (0.45 - e.spitT) / 0.45 : 0;
            e.root.rotation.x = 0.1 + charge * 0.55; // rear head as the spit charges
            if (e.spitT <= 0) {
              result.burstDamage += TUNING.weeperSpitDamage;
              result.weeperSpat = true;
              if (e.pat > 0) {
                e.pat -= 1;
                e.spitT = 0.24; // rapid volley shot
              } else if (Math.random() < 0.4) {
                e.pat = 2;
                e.spitT = 0.24; // launch a 3-shot volley
              } else {
                e.spitT = TUNING.weeperSpitInterval;
              }
            }
          }
        } else if (e.kind === 'drowned') {
          // slow, tanky, relentless — heavily-telegraphed overhead slam / lunge
          const dx = playerPos.x - e.root.position.x;
          const dz = playerPos.z - e.root.position.z;
          const dist = Math.hypot(dx, dz);
          if (senses(e, dist)) runMelee(e, dx, dz, dist, dt, result, MELEE.drowned!, world);
          else setCurrent(e, e.idle ?? e.walk);
        } else if (isBoss(e.kind)) {
          // rooted boss: a damaging spore/water AURA + ringed heart-nodes, plus a
          // VISIBLE telegraphed attack cycle — it swells and rears (the tell) then
          // LURCHES: a ranged lob at distance, or a heavier slam if you're close.
          const dx = playerPos.x - e.root.position.x;
          const dz = playerPos.z - e.root.position.z;
          const dist = Math.hypot(dx, dz);
          for (let n = 0; n < e.nodes.length; n++) e.nodes[n].rotation.y = animT * 1.5 + n;
          result.bossActive = true;
          e.root.rotation.y = Math.atan2(dx / (dist || 1), dz / (dist || 1));
          const auraR = e.kind === 'leviathan' ? 11 : 9;
          if (dist < auraR) result.contactDamage += TUNING.bloomSporeDamage * (1 - dist / auraR);
          const lobDmg = e.kind === 'leviathan' ? 11 : e.kind === 'steward_final' ? 12 : e.kind === 'founder' ? 12 : 7;
          if (e.atkPhase === 0) {
            e.atkCd = Math.max(0, e.atkCd - dt);
            const pulse = 1 + Math.sin(animT * 2.2) * 0.05; // idle breathing
            e.root.scaling.set(pulse, pulse, pulse);
            e.root.rotation.x = 0;
            if (e.atkCd <= 0 && dist < 16) {
              e.atkPhase = 1;
              e.attackT = 0;
              e.struck = false;
              e.pat = dist < 5.5 ? 1 : 0; // 1 = slam (close), 0 = lob (ranged)
            }
          } else {
            e.attackT += dt;
            const t = e.attackT;
            const wind = e.pat === 1 ? 0.75 : 0.55;
            if (t < wind) {
              const w = t / wind; // swell + rear back — the windup you react to
              e.root.scaling.set(1 + w * 0.22, 1 + w * 0.3, 1 + w * 0.22);
              e.root.rotation.x = -w * 0.3;
            } else {
              const s = Math.min(1, (t - wind) / 0.5);
              e.root.scaling.set(1.22 - s * 0.22, 1.3 - s * 0.3, 1.22 - s * 0.22);
              e.root.rotation.x = 0.35 * Math.sin(s * Math.PI); // lurch forward
              if (!e.struck) {
                e.struck = true;
                if (e.pat === 1 && dist < 7) result.burstDamage += Math.round(lobDmg * 1.6);
                else if (dist < 16) result.burstDamage += lobDmg;
                result.weeperSpat = true;
              }
            }
            if (t >= wind + 0.5) {
              e.atkPhase = 0;
              e.attackT = 0;
              e.atkCd = TUNING.bloomSpitInterval;
              e.root.rotation.x = 0;
            }
          }
        }
      }
      return result;
    },
    attackNearest(playerPos, facingYaw, damage, isBurn, range, precise) {
      // Select the target under the crosshair. Melee (precise=false): the nearest
      // enemy in a wide frontal arc. Ranged (precise=true): the enemy best aligned
      // with the aim ray (highest dot) within a tighter cone — so a shot lands on
      // whatever the reticle is actually over, out to the weapon's full range.
      let best: Enemy | undefined;
      // melee scores by nearest (lower=better); ranged by alignment (higher=better)
      let bestScore = precise ? -Infinity : Infinity;
      const fx = Math.sin(facingYaw);
      const fz = Math.cos(facingYaw);
      const cone = precise ? 0.86 : 0.2; // ~31° aim cone for ranged, ~78° swing for melee
      for (const e of enemies) {
        if (e.roomId !== activeRoom || e.state === 'gone') continue;
        const dx = e.root.position.x - playerPos.x;
        const dz = e.root.position.z - playerPos.z;
        const dist = Math.hypot(dx, dz);
        const reach = isBoss(e.kind) ? Math.max(15, range) : range;
        if (dist > reach) continue;
        const dot = (dx * fx + dz * fz) / (dist || 1);
        if (dist > 1.4 && dot < cone) continue; // must be under the aim unless point-blank
        if (precise) {
          if (dot > bestScore) {
            best = e;
            bestScore = dot;
          }
        } else if (dist < bestScore) {
          best = e;
          bestScore = dist;
        }
      }
      if (!best) return 'none';

      // hit spray: dark blood for flesh, green ichor for the fungal bosses
      const hy = isBoss(best.kind) ? 1.4 : best.kind === 'hound' ? 0.55 : 0.95;
      HIT_AT.set(best.root.position.x, best.root.position.y + hy, best.root.position.z);
      HIT_DIR.set(best.root.position.x - playerPos.x, 0, best.root.position.z - playerPos.z);
      const hl = Math.hypot(HIT_DIR.x, HIT_DIR.z) || 1;
      HIT_DIR.x /= hl;
      HIT_DIR.z /= hl;
      blood.burst(HIT_AT, HIT_DIR, best.kind === 'bloom' || best.kind === 'leviathan' ? 'ichor' : 'blood');

      if (best.kind === 'steward') {
        best.hp -= damage;
        if (best.hp <= 0 && best.state === 'hunt') {
          best.state = 'down';
          best.downTimer = TUNING.stewardDownSeconds;
          layCorpse(best);
          return 'steward-down';
        }
        return 'steward-hit';
      }

      if (isBoss(best.kind)) {
        if (best.kind === 'leviathan' && !best.dropped) return 'submerged'; // drain the cistern first
        const nodeMax = bossNodeHp(best.kind);
        best.nodeHp -= damage * (isBurn ? 2.2 : 1);
        if (best.nodeHp <= 0 && best.nodesLeft > 0) {
          best.nodesLeft -= 1;
          best.nodeHp = nodeMax;
          const node = best.nodes[best.nodesLeft];
          if (node) node.setEnabled(false);
          if (best.nodesLeft <= 0) {
            best.state = 'gone';
            best.root.setEnabled(false);
            return 'boss-down';
          }
          return 'boss-node';
        }
        return 'boss-hit';
      }

      if (best.kind === 'hound' || best.kind === 'weeper' || best.kind === 'crawler' || best.kind === 'drowned') {
        // no ripen — these die for good (fire or not)
        best.hp -= isBurn ? damage * 2 : damage;
        if (best.hp <= 0) {
          best.state = 'gone';
          best.root.setEnabled(false);
          return 'kill-perm';
        }
        return 'hit';
      }

      // sallowed: fire is the only permanent kill; otherwise it respawns
      if (isBurn) {
        best.state = 'gone';
        best.root.setEnabled(false);
        return 'burn-perm';
      }
      best.hp -= damage;
      if (best.hp <= 0) {
        if (best.state === 'corpse') return 'hit';
        best.state = 'corpse';
        best.ripen = TUNING.respawnMin + Math.random() * (TUNING.respawnMax - TUNING.respawnMin);
        layCorpse(best);
        return 'kill';
      }
      return 'hit';
    },
    activateSteward(roomId) {
      steward.roomId = roomId;
      steward.state = 'hunt';
      steward.lx = 0;
      steward.lz = -5;
      steward.placed = false;
    },
    relocateStewardTo(roomId, world) {
      if (steward.state === 'idle') return;
      steward.roomId = roomId;
      const c = world.roomCenter(roomId);
      steward.root.position.set(c.x, c.y, c.z - 6);
      steward.placed = true;
      refreshEnabled(world);
    },
    stewardActive() {
      return steward.state !== 'idle';
    },
    stewardRoom() {
      return steward.state === 'idle' || steward.state === 'down' ? null : steward.roomId;
    },
    aliveCount(roomId) {
      let n = 0;
      for (const e of enemies) {
        if (e.kind === 'sallowed' && e.roomId === roomId && (e.state === 'alive' || e.state === 'ripened')) n += 1;
      }
      return n;
    },
    bossAlive() {
      return bloom.state !== 'gone' || leviathan.state !== 'gone' || stewardFinal.state !== 'gone' || founder.state !== 'gone';
    },
    exposeLeviathan() {
      leviathan.dropped = true;
    },
    dispose() {
      blood.dispose();
      for (const e of enemies) {
        e.current?.stop();
        e.root.dispose(false, true);
      }
    },
  };
}
