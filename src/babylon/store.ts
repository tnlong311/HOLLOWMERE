// ══════════════════════════════════════════════
// game → HUD lightweight pub/sub. Babylon runtime is the writer; the React
// HUD only subscribes & reads snapshots. No scene APIs from the HUD.
// ══════════════════════════════════════════════

export type HudPhase = 'TITLE' | 'PLAY' | 'INVENTORY' | 'DEAD' | 'WIN';
export type HealthState = 'fine' | 'caution' | 'danger';

export interface InvSlot {
  readonly key: string;
  readonly label: string;
  readonly count: number;
  readonly kind: 'weapon' | 'ammo' | 'heal' | 'key' | 'crest' | 'tool';
  readonly equipped: boolean;
}

export interface GameStoreSnapshot {
  readonly ready: boolean;
  readonly physicsEnabled: boolean;
  readonly hudPhase: HudPhase;
  readonly roomName: string;
  readonly health: number;
  readonly healthState: HealthState;
  readonly weapon: string;
  readonly ammo: number;
  readonly flares: number;
  readonly ink: number;
  readonly stamina: number; // 0..100 sprint reserve
  readonly battery: number; // 0..100 flashlight cell charge
  readonly bandages: number; // wound-binding kits carried
  readonly binding: number; // 0..1 wound-bind progress (0 = not binding)
  readonly lockpicks: number; // lockpicks carried (for pickable strongboxes)
  readonly picking: boolean; // lock-pick minigame active (world stays live)
  readonly pickAngle: number; // 0..1 sweeping pointer position
  readonly pickLo: number; // 0..1 sweet-spot lower bound
  readonly pickHi: number; // 0..1 sweet-spot upper bound
  readonly pickPins: number; // pins left to set
  readonly objective: string;
  readonly prompt: string; // contextual interaction prompt ("" = none)
  readonly toast: string; // transient message
  readonly toastId: number;
  readonly crestSeated: boolean;
  readonly trueEnding: boolean; // reached the Lighthouse / Founder finale
  readonly loadProgress: number; // 0..1 asset preload progress (drives loading screen)
  readonly stewardNear: number; // 0..1 proximity (drives leitmotif/CA)
  readonly hitFlash: number; // 0..1 damage-feedback flash (decays)
  readonly hitDir: number; // screen-relative yaw of the incoming hit (for directional vignette)
  readonly inventory: readonly InvSlot[];
  readonly inventoryOpen: boolean; // full categorized inventory screen is open (game paused)
  readonly transition: number; // 0..1 door-curtain blackout
  readonly transitionName: string;
  readonly pointerLocked: boolean;
  readonly message: string;
}

type Listener = (s: GameStoreSnapshot) => void;

const initial: GameStoreSnapshot = {
  ready: false,
  physicsEnabled: false,
  hudPhase: 'TITLE',
  roomName: '',
  health: 100,
  healthState: 'fine',
  weapon: 'Dagger',
  ammo: 0,
  flares: 0,
  ink: 0,
  stamina: 100,
  battery: 100,
  bandages: 2,
  binding: 0,
  lockpicks: 2,
  picking: false,
  pickAngle: 0,
  pickLo: 0,
  pickHi: 0,
  pickPins: 0,
  objective: 'Cross the threshold.',
  prompt: '',
  toast: '',
  toastId: 0,
  crestSeated: false,
  trueEnding: false,
  loadProgress: 0,
  stewardNear: 0,
  hitFlash: 0,
  hitDir: 0,
  inventory: [],
  inventoryOpen: false,
  transition: 0,
  transitionName: '',
  pointerLocked: false,
  message: 'Initialising',
};

let snapshot = initial;
const listeners = new Set<Listener>();

export function getGameSnapshot(): GameStoreSnapshot {
  return snapshot;
}

export function setGameSnapshot(patch: Partial<GameStoreSnapshot>): void {
  snapshot = { ...snapshot, ...patch };
  for (const l of listeners) l(snapshot);
}

export function subscribeGameStore(listener: Listener): () => void {
  listeners.add(listener);
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function resetGameStore(): void {
  snapshot = initial;
  for (const l of listeners) l(snapshot);
}
