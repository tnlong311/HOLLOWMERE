// ══════════════════════════════════════════════
// HOLLOWMERE audio bridge. SFX = pooled HTMLAudioElements (created ONCE, reused
// — never per-hit), keyed off the generated mp3s in ASSETS. Ambience uses the
// platform bgm player as an event-driven swap (save / explore / steward).
// Degrades silently if audio is unavailable.
// ══════════════════════════════════════════════

import { bgm, ensureAudioReady } from '@rezona/core/3d';
import { ASSETS } from '../assets';

type SfxName =
  | 'gun'
  | 'shotgun'
  | 'reload'
  | 'dagger'
  | 'flare'
  | 'groan'
  | 'ripen'
  | 'lunge'
  | 'step'
  | 'stewardStep'
  | 'door'
  | 'unlock'
  | 'pickup'
  | 'save'
  | 'puzzleOk'
  | 'puzzleBad'
  | 'lightning'
  | 'grab'
  | 'crest'
  | 'ui'
  | 'weeperSpit'
  | 'houndHowl'
  | 'bloomRoar'
  | 'valveTurn'
  | 'sporeBurst'
  | 'phonograph'
  | 'vaultOpen'
  | 'crawler'
  | 'eyeAlign'
  | 'leviathanRoar'
  | 'drowned'
  | 'furnace'
  | 'water'
  | 'stewardFinalRoar'
  | 'glassShatter'
  | 'keycard'
  | 'founderRoar'
  | 'storm'
  | 'boat';

const SFX_KEYS: Record<SfxName, string[]> = {
  gun: ['sfx_pistol_fire_0', 'sfx_pistol_fire_1', 'sfx_pistol_fire_2'],
  shotgun: ['sfx_shotgun_fire'],
  reload: ['sfx_reload'],
  dagger: ['sfx_dagger_swipe_0', 'sfx_dagger_swipe_1'],
  flare: ['sfx_flare_ignite'],
  groan: ['sfx_sallowed_groan_0', 'sfx_sallowed_groan_1', 'sfx_sallowed_groan_2'],
  ripen: ['sfx_sallowed_ripen'],
  lunge: ['sfx_sallowed_lunge'],
  step: ['sfx_footstep_stone_0', 'sfx_footstep_stone_1', 'sfx_footstep_stone_2'],
  stewardStep: ['sfx_steward_step'],
  door: ['sfx_door_open'],
  unlock: ['sfx_door_unlock'],
  pickup: ['sfx_item_pickup'],
  save: ['sfx_save_ledger'],
  puzzleOk: ['sfx_puzzle_correct'],
  puzzleBad: ['sfx_puzzle_invalid'],
  lightning: ['sfx_lightning_sting'],
  grab: ['sfx_grab'],
  crest: ['sfx_crest_claim'],
  ui: ['sfx_ui_select'],
  weeperSpit: ['sfx_weeper_spit_0', 'sfx_weeper_spit_1'],
  houndHowl: ['sfx_hound_howl_0', 'sfx_hound_howl_1'],
  bloomRoar: ['sfx_bloom_roar'],
  valveTurn: ['sfx_valve_turn'],
  sporeBurst: ['sfx_spore_burst'],
  phonograph: ['sfx_phonograph'],
  vaultOpen: ['sfx_vault_open'],
  crawler: ['sfx_crawler_0', 'sfx_crawler_1'],
  eyeAlign: ['sfx_eye_align'],
  leviathanRoar: ['sfx_leviathan_roar'],
  drowned: ['sfx_drowned_0', 'sfx_drowned_1'],
  furnace: ['sfx_furnace'],
  water: ['sfx_water'],
  stewardFinalRoar: ['sfx_steward_final_roar'],
  glassShatter: ['sfx_glass_shatter_0', 'sfx_glass_shatter_1'],
  keycard: ['sfx_keycard'],
  founderRoar: ['sfx_founder_roar'],
  storm: ['sfx_storm'],
  boat: ['sfx_boat'],
};

const SFX_VOLUME: Partial<Record<SfxName, number>> = {
  step: 0.4,
  groan: 0.6,
  ui: 0.5,
  gun: 0.9,
  shotgun: 1.0,
};

export type Ambience = 'explore' | 'save' | 'steward' | 'conservatory' | 'boss' | 'cellar' | 'bossLeviathan' | 'chapel' | 'lab' | 'bossSteward' | 'lighthouse' | 'bossFounder';
const AMBIENCE_KEY: Record<Ambience, string> = {
  explore: 'bgm_explore_dread',
  save: 'bgm_save_room',
  steward: 'bgm_steward_theme',
  conservatory: 'bgm_conservatory',
  boss: 'bgm_boss_bloom',
  cellar: 'bgm_cellar',
  bossLeviathan: 'bgm_boss_leviathan',
  chapel: 'bgm_chapel',
  lab: 'bgm_lab',
  bossSteward: 'bgm_boss_steward',
  lighthouse: 'bgm_lighthouse',
  bossFounder: 'bgm_boss_founder',
};

export interface GameAudioHandle {
  unlock(): void;
  play(name: SfxName): void;
  ambience(which: Ambience): void;
  dispose(): void;
}

export function createGameAudio(): GameAudioHandle {
  let disposed = false;
  let unlocked = false;
  let currentAmb: Ambience | null = null;

  // pool: one element per asset key (a couple of overlapping voices for rapid sfx)
  const pool = new Map<string, HTMLAudioElement[]>();
  const VOICES = 2;
  const elementsFor = (assetKey: string): HTMLAudioElement[] => {
    let arr = pool.get(assetKey);
    if (arr) return arr;
    const url = ASSETS[assetKey];
    arr = [];
    if (url && typeof Audio !== 'undefined') {
      for (let i = 0; i < VOICES; i += 1) {
        const el = new Audio(url);
        el.preload = 'auto';
        arr.push(el);
      }
    }
    pool.set(assetKey, arr);
    return arr;
  };

  // pre-build pools (created once — not a per-hit allocation)
  for (const name of Object.keys(SFX_KEYS) as SfxName[]) {
    for (const key of SFX_KEYS[name]) elementsFor(key);
  }

  return {
    unlock() {
      if (disposed || unlocked) return;
      unlocked = true;
      try {
        ensureAudioReady();
      } catch {
        /* ignore */
      }
    },
    play(name) {
      if (disposed) return;
      const keys = SFX_KEYS[name];
      if (!keys || keys.length === 0) return;
      const key = keys[(Math.random() * keys.length) | 0];
      const voices = elementsFor(key);
      const vol = SFX_VOLUME[name] ?? 0.8;
      for (const el of voices) {
        if (el.paused || el.ended || el.currentTime === 0) {
          try {
            el.volume = vol;
            el.currentTime = 0;
            void el.play();
          } catch {
            /* autoplay/HTMLAudio failure must not break gameplay */
          }
          return;
        }
      }
      // all voices busy — retrigger the first
      const el = voices[0];
      if (el) {
        try {
          el.currentTime = 0;
          void el.play();
        } catch {
          /* ignore */
        }
      }
    },
    ambience(which) {
      if (disposed || which === currentAmb) return;
      currentAmb = which;
      const url = ASSETS[AMBIENCE_KEY[which]];
      if (!url) return;
      try {
        void bgm.play(url, { loop: true, volume: which === 'steward' ? 0.55 : 0.4 });
      } catch {
        /* ambience is supplemental */
      }
    },
    dispose() {
      disposed = true;
      for (const voices of pool.values()) {
        for (const el of voices) {
          try {
            el.pause();
          } catch {
            /* ignore */
          }
        }
      }
      pool.clear();
      try {
        bgm.pause();
      } catch {
        /* ignore */
      }
    },
  };
}
