// ══════════════════════════════════════════════
// HOLLOWMERE HUD — DOM overlay above the Babylon canvas. Reads the store only;
// never touches the scene or render loop. Title / in-play status / prompt /
// toast / door-curtain / steward pulse / inventory strip / death + win.
// ══════════════════════════════════════════════

import { useEffect, useState, type CSSProperties, type MutableRefObject } from 'react';
import type { Phase } from '@rezona/core/3d';
import { getGameSnapshot, subscribeGameStore, type GameStoreSnapshot } from './store';
import { controls } from './controls';
import { ASSETS } from '../assets';

interface HudProps {
  phaseRef: MutableRefObject<Phase>;
}

const INK = '#e9dcc3';
const AMBER = '#d9a441';
const titleImg = ASSETS['ui_title'];
const crestImg = ASSETS['ui_crest_icons'];
const introVideo = ASSETS['intro_cinematic'];

export function Hud({ phaseRef }: HudProps) {
  const [s, setS] = useState<GameStoreSnapshot>(() => getGameSnapshot());
  useEffect(() => subscribeGameStore(setS), []);
  void phaseRef;

  // Settings (brightness calibration — the manor is very dark)
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [bright, setBright] = useState(() => {
    try { const v = Number(localStorage.getItem('hm_brightness')); return v >= 0.6 && v <= 2 ? v : 1; } catch { return 1; }
  });
  const applyBright = (v: number) => {
    setBright(v);
    void import('./controls').then((m) => m.controls.setBrightness(v));
  };
  const [crt, setCrt] = useState(() => {
    try { return localStorage.getItem('hm_crt') === '1'; } catch { return false; }
  });
  const applyCrt = (on: boolean) => {
    setCrt(on);
    void import('./controls').then((m) => m.controls.setCrt(on));
  };

  const healthColor = s.healthState === 'danger' ? '#c2452f' : s.healthState === 'caution' ? '#d98a2b' : AMBER;
  // Respawn: reload the runtime but flag the intro to skip straight to "Enter"
  // (no replaying the whole story cutscene on every death).
  const restart = () => {
    try { sessionStorage.setItem('hm_skipIntro', '1'); } catch { /* private mode */ }
    window.location.reload();
  };

  // LLM-EXTENSION:HUD — survival-horror DOM HUD driven by the Babylon runtime/store.
  // DO NOT REMOVE the LLM-EXTENSION:HUD tag — templates/3d/scripts/check-architecture.mjs requires it to appear exactly once across the src tree.
  return (
    <>
      {/* steward proximity pulse */}
      {s.hudPhase === 'PLAY' && s.stewardNear > 0.05 ? (
        <div style={{ ...pulseStyle, boxShadow: `inset 0 0 ${40 + s.stewardNear * 120}px ${10 + s.stewardNear * 40}px rgba(150,20,20,${0.18 + s.stewardNear * 0.5})` }} />
      ) : null}

      {/* directional damage flash — a red bloom on the side the hit came from */}
      {s.hudPhase === 'PLAY' && s.hitFlash > 0.02 ? (
        <div
          style={{
            ...pulseStyle,
            background: `radial-gradient(circle at ${50 + Math.sin(s.hitDir) * 38}% ${50 - Math.cos(s.hitDir) * 38}%, rgba(150,10,10,${(0.55 * s.hitFlash).toFixed(3)}), rgba(120,0,0,0) 55%)`,
          }}
        />
      ) : null}

      {s.hudPhase === 'PLAY' ? (
        <>
          {/* top-left: room + objective */}
          <div style={topLeftStyle}>
            <div style={{ fontSize: '0.7rem', letterSpacing: 2, color: AMBER, opacity: 0.85 }}>HOLLOWMERE</div>
            <div style={{ fontSize: '1.05rem', fontWeight: 700 }}>{s.roomName}</div>
            <div style={{ fontSize: '0.78rem', opacity: 0.78, maxWidth: 240 }}>{s.objective}</div>
          </div>

          {/* top-right: condition + resources */}
          <div style={topRightStyle}>
            <div style={{ color: healthColor, fontWeight: 700, letterSpacing: 1 }}>
              {s.healthState === 'danger' ? 'DANGER' : s.healthState === 'caution' ? 'CAUTION' : 'STEADY'}
              {s.sneaking ? <span style={{ color: '#5fa8c7', marginLeft: 10, fontSize: '0.72rem' }}>◦ SNEAKING</span> : null}
            </div>
            <div style={barTrackStyle}>
              <div style={{ ...barFillStyle, width: `${s.health}%`, background: healthColor }} />
            </div>
            {/* stamina + flashlight battery meters */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}>
              <span style={meterLabelStyle}>STA</span>
              <div style={miniTrackStyle}>
                <div style={{ ...barFillStyle, width: `${s.stamina}%`, background: '#5fa8c7' }} />
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', width: '100%' }}>
              <span style={meterLabelStyle}>BAT</span>
              <div style={miniTrackStyle}>
                <div style={{ ...barFillStyle, width: `${s.battery}%`, background: s.battery < 20 ? '#c2452f' : '#d9c341' }} />
              </div>
            </div>
            <div style={resRowStyle}>
              <span>✦ {s.weapon}</span>
              {s.weapon === 'Pistol' || s.weapon === 'Rifle' ? <span>▮ {s.ammo}</span> : null}
              <span>🜂 {s.flares}</span>
              <span>✎ {s.ink}</span>
              <span>✚ {s.bandages}</span>
            </div>
          </div>

          {/* center reticle */}
          <div style={reticleStyle}>+</div>

          {/* click-to-capture-mouse hint (desktop), until pointer is locked */}
          {!s.pointerLocked ? <div style={lookHintStyle}>Click to look around · WASD to move · Esc releases</div> : null}

          {/* wound-binding progress */}
          {s.binding > 0 ? (
            <div style={bindWrapStyle}>
              <div style={{ marginBottom: 4 }}>Binding wound…</div>
              <div style={{ ...barTrackStyle, width: 180 }}>
                <div style={{ ...barFillStyle, width: `${Math.round(s.binding * 100)}%`, background: '#c25a5a' }} />
              </div>
            </div>
          ) : null}

          {/* interaction prompt */}
          {s.prompt ? <div style={promptStyle}>{s.prompt} <b style={{ color: AMBER }}>[E]</b></div> : null}

          {/* toast */}
          {s.toast ? (
            <div key={s.toastId} style={toastStyle}>
              {s.toast}
            </div>
          ) : null}

          {/* inventory strip */}
          <div style={invStripStyle}>
            {s.inventory.map((it, i) => (
              <div
                key={it.key}
                onClick={() => controls.pressSlot(i + 1)}
                title={`${it.kind === 'tool' ? 'Toggle' : 'Equip'} ${it.label} (${i + 1})`}
                style={{ ...slotStyle, cursor: 'pointer', borderColor: it.equipped ? AMBER : 'rgba(233,220,195,0.25)', color: it.equipped ? AMBER : INK }}
              >
                <span style={slotNumStyle}>{i + 1}</span>
                <span style={{ fontSize: '0.62rem', opacity: 0.85 }}>{it.label}</span>
                {it.count > 1 ? <span style={{ fontSize: '0.7rem', fontWeight: 700 }}>{it.count}</span> : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {/* door transition curtain */}
      {s.transition > 0.01 ? (
        <div style={{ ...curtainStyle, opacity: s.transition }}>
          <span style={{ opacity: Math.max(0, s.transition * 1.4 - 0.4) }}>{s.transitionName}</span>
        </div>
      ) : null}

      {/* LOADING — a dedicated screen that holds until EVERY asset is loaded;
          only then does the intro cutscene / start screen mount. */}
      {s.hudPhase === 'TITLE' && !s.ready ? <LoadingScreen progress={s.loadProgress} /> : null}

      {/* INTRO CUTSCENE — mounts only once the estate is fully loaded, so the
          story timer and the video begin from a clean, asset-complete state. */}
      {s.hudPhase === 'TITLE' && s.ready ? <IntroCutscene ready={s.ready} loadProgress={s.loadProgress} /> : null}

      {/* DEATH */}
      {s.hudPhase === 'DEAD' ? (
        <div style={endStyle}>
          <h1 style={{ color: '#c2452f', letterSpacing: 4 }}>ARRANGED</h1>
          <p style={{ color: INK, opacity: 0.8 }}>The Steward tidies you among the others.</p>
          <button style={beginBtnStyle} onClick={() => triggerStart()}>▸ Rise at the {s.checkpointName || 'threshold'}</button>
          <button style={{ ...beginBtnStyle, opacity: 0.55, fontSize: '0.82rem', marginTop: 6 }} onClick={restart}>Restart from the porch</button>
        </div>
      ) : null}

      {/* WIN */}
      {s.hudPhase === 'WIN' ? (
        <div style={endStyle}>
          {crestImg ? <img src={crestImg} alt="crests" style={{ width: 160, imageRendering: 'pixelated', opacity: 0.9 }} /> : null}
          <h1 style={{ color: AMBER, letterSpacing: 4 }}>{s.trueEnding ? 'THE LAMP IS LIT' : 'HOLLOWMERE'}</h1>
          <p style={{ color: INK, opacity: 0.82, maxWidth: 420, textAlign: 'center', lineHeight: 1.5 }}>
            {s.objective}
          </p>
          <p style={{ color: INK, opacity: 0.6, maxWidth: 420, textAlign: 'center', lineHeight: 1.5, fontSize: '0.85rem' }}>
            {s.trueEnding
              ? 'Four crests, four horrors unmade — and the Founder undone in the light of his own lamp. You alone leave HOLLOWMERE, and behind you the beacon burns for no one.'
              : 'Four crests. The Bloom, the Leviathan, and the Steward unmade. The tide turns, and the island falls silent behind you.'}
          </p>
          <button style={beginBtnStyle} onClick={restart}>Again</button>
        </div>
      ) : null}

      {/* Lock-pick minigame — world stays LIVE behind it (you're exposed). */}
      {s.picking ? (
        <div style={pickWrapStyle}>
          <div style={{ color: AMBER, letterSpacing: 3, fontSize: '0.9rem', marginBottom: 4 }}>PICKING THE LOCK</div>
          <div style={{ color: INK, opacity: 0.7, fontSize: '0.74rem', marginBottom: 12 }}>
            Pins left: <b style={{ color: AMBER }}>{s.pickPins}</b> · Lockpicks: <b style={{ color: s.lockpicks > 0 ? AMBER : '#c2452f' }}>{s.lockpicks}</b>
          </div>
          <div style={pickTrackStyle}>
            {/* sweet spot */}
            <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${s.pickLo * 100}%`, width: `${(s.pickHi - s.pickLo) * 100}%`, background: 'rgba(217,164,65,0.5)', borderLeft: `2px solid ${AMBER}`, borderRight: `2px solid ${AMBER}` }} />
            {/* sweeping pointer */}
            <div style={{ position: 'absolute', top: -4, bottom: -4, left: `calc(${s.pickAngle * 100}% - 1px)`, width: 3, background: '#e9dcc3', boxShadow: '0 0 6px #e9dcc3' }} />
          </div>
          <div style={{ color: INK, opacity: 0.6, fontSize: '0.72rem', marginTop: 12 }}>
            <b style={{ color: AMBER }}>E</b> / <b style={{ color: AMBER }}>click</b> — set pin · <b style={{ color: AMBER }}>Q</b> — cancel
          </div>
        </div>
      ) : null}

      {/* Work-song piano minigame — world stays LIVE while you play. */}
      {s.songActive ? (
        <div style={pickWrapStyle}>
          <div style={{ color: AMBER, letterSpacing: 3, fontSize: '0.9rem', marginBottom: 4 }}>THE WORK-SONG</div>
          <div style={{ color: INK, opacity: 0.7, fontSize: '0.74rem', marginBottom: 12 }}>
            MID · TOP · LOW · HIGH — note <b style={{ color: AMBER }}>{s.songStep + 1}</b>/4
          </div>
          <div style={{ ...pickTrackStyle, display: 'flex' }}>
            {['LOW', 'MID', 'HIGH', 'TOP'].map((z, i) => (
              <div key={z} style={{ flex: 1, borderRight: i < 3 ? '1px solid rgba(233,220,195,0.25)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.6rem', letterSpacing: 1, color: INK, opacity: 0.65, fontFamily: fontStack }}>
                {z}
              </div>
            ))}
            <div style={{ position: 'absolute', top: -4, bottom: -4, left: `calc(${s.songPointer * 100}% - 1px)`, width: 3, background: '#e9dcc3', boxShadow: '0 0 6px #e9dcc3' }} />
          </div>
          <div style={{ color: INK, opacity: 0.6, fontSize: '0.72rem', marginTop: 12 }}>
            <b style={{ color: AMBER }}>E</b> / <b style={{ color: AMBER }}>click</b> — strike the note · <b style={{ color: AMBER }}>Q</b> — stop
          </div>
        </div>
      ) : null}

      {/* Full categorized inventory (toggle with I / Tab — pauses play) */}
      {s.inventoryOpen ? <InventoryScreen s={s} /> : null}

      {/* Inventory button — visible affordance for the I/Tab inventory screen. */}
      {s.hudPhase === 'PLAY' ? (
        <button
          style={invBtnStyle}
          title="Inventory (I or Tab)"
          onClick={() => void import('./controls').then((m) => m.controls.pressInventory())}
        >
          🎒 <span style={{ fontSize: '0.62rem', letterSpacing: 1, opacity: 0.7 }}>[I]</span>
        </button>
      ) : null}

      {/* Settings gear — always available (click when the pointer is free). */}
      <button style={gearStyle} title="Settings" onClick={() => setSettingsOpen((v) => !v)}>⚙</button>
      {settingsOpen ? (
        <div style={settingsPanelStyle}>
          <div style={{ color: AMBER, letterSpacing: 3, fontSize: '0.9rem', marginBottom: 4 }}>SETTINGS</div>
          <label style={{ color: INK, fontSize: '0.8rem', display: 'flex', flexDirection: 'column', gap: 6, width: 260 }}>
            <span>Brightness <b style={{ color: AMBER }}>{Math.round(bright * 100)}%</b></span>
            <input type="range" min={0.7} max={1.8} step={0.05} value={bright} onChange={(e) => applyBright(Number(e.target.value))} style={{ width: '100%', accentColor: AMBER }} />
            <span style={{ opacity: 0.55, fontSize: '0.68rem' }}>Raise this if the manor is too dark to read on your display.</span>
          </label>
          <label style={{ color: INK, fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, cursor: 'pointer' }}>
            <input type="checkbox" checked={crt} onChange={(e) => applyCrt(e.target.checked)} style={{ accentColor: AMBER }} />
            <span>Film look <span style={{ opacity: 0.5, fontSize: '0.68rem' }}>(scanlines + frame weave)</span></span>
          </label>
          <button style={{ ...beginBtnStyle, marginTop: 14 }} onClick={() => setSettingsOpen(false)}>Close</button>
        </div>
      ) : null}
    </>
  );
}

// TITLE start: route through the shared intent bridge (mobile + desktop).
function triggerStart() {
  void import('./controls').then((m) => m.controls.pressUse());
}

// ── Full categorized inventory screen ────────────────────────────────
// Groups everything you carry by category (Weapons / Tools / Aid & Supplies /
// Keys / Crests). Read-only overview; equip still happens via the quick-bar
// number keys. Toggled with [I] / [Tab]; play is paused while it's open.
const CAT_GLYPH: Record<string, string> = { weapon: '✦', tool: '🔦', key: '🗝', crest: '◈', aid: '✚' };

function InventoryScreen({ s }: { s: GameStoreSnapshot }) {
  // free the mouse cursor so items can be clicked while the panel is up
  useEffect(() => { try { document.exitPointerLock?.(); } catch { /* ignore */ } }, []);
  const of = (k: string) => s.inventory.filter((it) => it.kind === k);
  const act = (kind: 'equip' | 'use', key: string) => void import('./controls').then((m) => m.controls.pressInvAction(kind, key));
  type Act = { kind: 'equip' | 'use'; key: string; label: string };
  type Row = { key: string; label: string; note?: string; equipped?: boolean; action?: Act };
  const A = (kind: 'equip' | 'use', key: string, label: string): Act => ({ kind, key, label });
  const sections: { label: string; glyph: string; items: Row[] }[] = [
    {
      label: 'Weapons', glyph: CAT_GLYPH.weapon,
      items: of('weapon').map((it): Row => ({ key: it.key, label: it.label, note: it.key === 'dagger' ? '' : `${it.count} rnd`, equipped: it.equipped, action: A('equip', it.key, it.equipped ? 'Equipped' : 'Equip') })),
    },
    {
      label: 'Tools', glyph: CAT_GLYPH.tool,
      items: of('tool').map((it): Row => ({ key: it.key, label: it.label, note: it.equipped ? 'ON' : 'OFF', equipped: it.equipped, action: A('equip', it.key, it.equipped ? 'Turn off' : 'Turn on') })),
    },
    {
      label: 'Aid & Supplies', glyph: CAT_GLYPH.aid,
      items: [
        { key: 'bandage', label: 'Bandage', note: `×${s.bandages}`, action: s.bandages > 0 ? A('use', 'bandage', 'Use') : undefined },
        { key: 'lockpick', label: 'Lockpick', note: `×${s.lockpicks}` },
        { key: 'battery', label: 'Battery', note: `${s.battery}%` },
        { key: 'ink', label: 'Ledger Ink', note: `×${s.ink}` },
      ],
    },
    { label: 'Keys', glyph: CAT_GLYPH.key, items: of('key').map((it) => ({ key: it.key, label: it.label })) },
    { label: 'Crests', glyph: CAT_GLYPH.crest, items: of('crest').map((it) => ({ key: it.key, label: it.label })) },
  ].filter((sec) => sec.items.length > 0);
  const close = () => void import('./controls').then((m) => m.controls.pressInventory());
  return (
    <div style={invScreenStyle}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16, marginBottom: 18 }}>
        <h1 style={{ letterSpacing: 6, color: INK, margin: 0, fontSize: '1.4rem' }}>INVENTORY</h1>
        <span style={{ color: INK, opacity: 0.5, fontSize: '0.74rem' }}>[I] / [Tab] to close · play is paused</span>
      </div>
      <div style={invGridStyle}>
        {sections.map((sec) => (
          <div key={sec.label} style={invSectionStyle}>
            <div style={{ color: AMBER, letterSpacing: 2, fontSize: '0.82rem', borderBottom: `1px solid ${AMBER}44`, paddingBottom: 5, marginBottom: 8 }}>
              {sec.glyph} {sec.label.toUpperCase()}
            </div>
            {sec.items.map((it) => (
              <div
                key={it.key}
                onClick={it.action ? () => act(it.action!.kind, it.action!.key) : undefined}
                style={{ ...invRowStyle, cursor: it.action ? 'pointer' : 'default', borderColor: it.equipped ? AMBER : 'rgba(233,220,195,0.16)' }}
              >
                <span style={{ color: it.equipped ? AMBER : INK }}>{it.label}</span>
                <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {it.note ? <span style={{ color: INK, opacity: 0.55, fontSize: '0.76rem' }}>{it.note}</span> : null}
                  {it.action && !it.equipped ? <span style={{ color: AMBER, fontSize: '0.74rem' }}>▸ {it.action.label}</span> : null}
                </span>
              </div>
            ))}
          </div>
        ))}
      </div>
      <button style={{ ...beginBtnStyle, marginTop: 22 }} onClick={close}>Close</button>
    </div>
  );
}

// ── Loading screen ────────────────────────────────────────────────────
// Shown before anything else: holds until every model + the physics engine is
// loaded (store.ready). Also warms the intro video's buffer via a hidden
// preloading <video>, so the cutscene starts instantly once we let go.
function LoadingScreen({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100);
  return (
    <div style={loadingScreenStyle}>
      <h1 style={{ letterSpacing: 8, color: INK, margin: 0 }}>HOLLOWMERE</h1>
      <p style={{ color: AMBER, letterSpacing: 3, marginTop: 14, fontSize: '0.8rem' }}>THE HOUSE IS WAKING…</p>
      <div style={{ width: 280, height: 6, marginTop: 16, background: 'rgba(233,220,195,0.15)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: AMBER, borderRadius: 3, transition: 'width 160ms linear' }} />
      </div>
      <p style={{ color: INK, opacity: 0.55, marginTop: 10, fontSize: '0.72rem' }}>{pct}%</p>
      <p style={{ color: INK, opacity: 0.35, marginTop: 18, fontSize: '0.68rem', maxWidth: 380, textAlign: 'center', lineHeight: 1.6 }}>
        Every room, every resident, every light is being placed. Nothing enters the house after you do.
      </p>
      {introVideo ? <video src={introVideo} preload="auto" muted playsInline style={{ display: 'none' }} /> : null}
      {ASSETS['intro_movie'] ? <video src={ASSETS['intro_movie']} preload="auto" muted playsInline style={{ display: 'none' }} /> : null}
    </div>
  );
}

// ── Cinematic intro ───────────────────────────────────────────────────
// A real film: four Veo shots with the narration MIXED INTO the video track,
// played full-screen WITH SOUND. The explicit ▸ Begin click is the browser's
// autoplay gesture, so unmuted playback is legal. Skippable at any moment;
// respawns (hm_skipIntro) jump straight past it to the start card.
type IntroStage = 'gate' | 'film' | 'done';

function IntroCutscene({ ready, loadProgress }: { ready: boolean; loadProgress: number }) {
  const [stage, setStage] = useState<IntroStage>(() => {
    try { return sessionStorage.getItem('hm_skipIntro') ? 'done' : 'gate'; } catch { return 'gate'; }
  });
  useEffect(() => { try { sessionStorage.removeItem('hm_skipIntro'); } catch { /* ignore */ } }, []);
  const movie = ASSETS['intro_movie'];
  void ready;
  void loadProgress;

  if (stage === 'film' && movie) {
    return (
      <div style={{ position: 'absolute', inset: 0, background: '#000', pointerEvents: 'auto' }}>
        <video
          src={movie}
          autoPlay
          playsInline
          onEnded={() => setStage('done')}
          onError={() => setStage('done')}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
        />
        <button style={skipFilmBtnStyle} onClick={() => setStage('done')}>Skip ⏭</button>
      </div>
    );
  }

  return (
    <div style={cutsceneStyle}>
      {introVideo ? (
        <video
          src={introVideo}
          autoPlay
          muted
          loop
          playsInline
          style={cutsceneVideoStyle}
          ref={(v) => {
            if (!v) return;
            void v.play().catch(() => {
              const kick = () => {
                void v.play().catch(() => undefined);
                window.removeEventListener('pointerdown', kick);
              };
              window.addEventListener('pointerdown', kick);
            });
          }}
        />
      ) : null}
      <div style={cutsceneShadeStyle} />
      <div style={cutsceneContentStyle}>
        {titleImg ? <img src={titleImg} alt="HOLLOWMERE" style={{ ...titleArtStyle, marginBottom: 8 }} /> : <h1 style={{ letterSpacing: 8, color: INK, margin: 0 }}>HOLLOWMERE</h1>}
        {stage === 'gate' && movie ? (
          <>
            <p style={{ color: INK, opacity: 0.72, maxWidth: 460, textAlign: 'center', fontSize: '0.92rem', lineHeight: 1.65, marginTop: 14 }}>
              A letter was sent to Hollowmere, once. It was never answered.
            </p>
            <button style={{ ...beginBtnStyle, marginTop: 20 }} onClick={() => setStage('film')}>▸ Begin</button>
            <button style={skipLinkStyle} onClick={() => setStage('done')}>skip the film ⏭</button>
          </>
        ) : (
          <>
            <button style={{ ...beginBtnStyle, marginTop: 20 }} onClick={triggerStart}>▸ Enter Hollowmere</button>
            <p style={{ color: INK, opacity: 0.55, fontSize: '0.72rem', marginTop: 16, textAlign: 'center', lineHeight: 1.6 }}>
              <b style={{ color: AMBER }}>WASD</b> move · <b style={{ color: AMBER }}>Mouse</b> look · <b style={{ color: AMBER }}>Shift</b> sprint · <b style={{ color: AMBER }}>Space</b> dodge · <b style={{ color: AMBER }}>C</b> sneak · <b style={{ color: AMBER }}>L</b> flashlight · <b style={{ color: AMBER }}>B</b> bind<br />
              <b style={{ color: AMBER }}>Left-click</b> attack · <b style={{ color: AMBER }}>E</b> use · <b style={{ color: AMBER }}>1–9</b> select · <b style={{ color: AMBER }}>I</b>/<b style={{ color: AMBER }}>Tab</b> inventory · <b style={{ color: AMBER }}>Esc</b> release
            </p>
          </>
        )}
      </div>
    </div>
  );
}

const pulseStyle: CSSProperties = { position: 'absolute', inset: 0, pointerEvents: 'none', transition: 'box-shadow 120ms linear' };
const fontStack = "'Courier New', ui-monospace, monospace";
const panelBg = 'rgba(8,7,6,0.55)';

const topLeftStyle: CSSProperties = { position: 'absolute', top: 14, left: 14, display: 'flex', flexDirection: 'column', gap: 2, padding: '8px 12px', background: panelBg, borderRadius: 6, color: INK, fontFamily: fontStack, pointerEvents: 'none', userSelect: 'none', textShadow: '0 1px 2px #000' };
const topRightStyle: CSSProperties = { position: 'absolute', top: 14, right: 14, display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end', padding: '8px 12px', background: panelBg, borderRadius: 6, color: INK, fontFamily: fontStack, fontSize: '0.8rem', pointerEvents: 'none', userSelect: 'none', textShadow: '0 1px 2px #000' };
const barTrackStyle: CSSProperties = { width: 130, height: 6, background: 'rgba(233,220,195,0.18)', borderRadius: 3, overflow: 'hidden' };
const barFillStyle: CSSProperties = { height: '100%', transition: 'width 200ms linear' };
const resRowStyle: CSSProperties = { display: 'flex', gap: 10, fontSize: '0.78rem' };
const miniTrackStyle: CSSProperties = { flex: 1, height: 4, background: 'rgba(233,220,195,0.16)', borderRadius: 2, overflow: 'hidden' };
const meterLabelStyle: CSSProperties = { fontSize: '0.56rem', letterSpacing: 1, opacity: 0.6, width: 24 };
const bindWrapStyle: CSSProperties = { position: 'absolute', top: '60%', left: '50%', transform: 'translateX(-50%)', padding: '8px 16px', background: 'rgba(8,7,6,0.8)', borderRadius: 6, color: INK, fontFamily: fontStack, fontSize: '0.82rem', textAlign: 'center', pointerEvents: 'none' };
const pickWrapStyle: CSSProperties = { position: 'absolute', top: '52%', left: '50%', transform: 'translate(-50%,-50%)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '18px 24px', background: 'rgba(8,7,6,0.82)', border: `1px solid ${AMBER}55`, borderRadius: 8, fontFamily: fontStack, pointerEvents: 'none', textAlign: 'center' };
const pickTrackStyle: CSSProperties = { position: 'relative', width: 340, height: 20, background: 'rgba(233,220,195,0.12)', border: '1px solid rgba(233,220,195,0.25)', borderRadius: 4 };
const gearStyle: CSSProperties = { position: 'absolute', bottom: 16, right: 16, width: 40, height: 40, background: 'rgba(8,7,6,0.6)', border: '1px solid rgba(233,220,195,0.3)', borderRadius: 6, color: '#e9dcc3', fontFamily: fontStack, fontSize: '1.2rem', cursor: 'pointer', pointerEvents: 'auto' };
const invBtnStyle: CSSProperties = { position: 'absolute', bottom: 16, right: 64, height: 40, padding: '0 12px', display: 'flex', alignItems: 'center', gap: 5, background: 'rgba(8,7,6,0.6)', border: '1px solid rgba(217,164,65,0.45)', borderRadius: 6, color: '#e9dcc3', fontFamily: fontStack, fontSize: '1.05rem', cursor: 'pointer', pointerEvents: 'auto' };
const invScreenStyle: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle at 50% 40%, rgba(16,12,9,0.94), rgba(2,2,3,0.98))', fontFamily: fontStack, pointerEvents: 'auto', padding: 24 };
const invGridStyle: CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 240px))', gap: 18, maxWidth: 900, width: '100%', justifyContent: 'center' };
const invSectionStyle: CSSProperties = { background: 'rgba(8,7,6,0.5)', border: '1px solid rgba(233,220,195,0.12)', borderRadius: 8, padding: '12px 14px', display: 'flex', flexDirection: 'column' };
const invRowStyle: CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '7px 10px', marginBottom: 5, background: 'rgba(8,7,6,0.5)', border: '1px solid', borderRadius: 5, color: INK, fontFamily: fontStack, fontSize: '0.86rem' };
const settingsPanelStyle: CSSProperties = { position: 'absolute', bottom: 66, right: 16, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 8, padding: '16px 18px', background: 'rgba(8,7,6,0.92)', border: '1px solid rgba(217,164,65,0.4)', borderRadius: 8, fontFamily: fontStack, pointerEvents: 'auto' };
const reticleStyle: CSSProperties = { position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', color: 'rgba(217,164,65,0.5)', fontFamily: fontStack, fontSize: '1.2rem', pointerEvents: 'none' };
const lookHintStyle: CSSProperties = { position: 'absolute', top: '58%', left: '50%', transform: 'translateX(-50%)', padding: '5px 12px', background: 'rgba(8,7,6,0.6)', borderRadius: 4, color: '#e9dcc3', fontFamily: fontStack, fontSize: '0.74rem', opacity: 0.75, pointerEvents: 'none', whiteSpace: 'nowrap' };
const promptStyle: CSSProperties = { position: 'absolute', bottom: 118, left: '50%', transform: 'translateX(-50%)', padding: '7px 16px', background: 'rgba(8,7,6,0.78)', border: `1px solid ${AMBER}55`, borderRadius: 6, color: INK, fontFamily: fontStack, fontSize: '0.86rem', pointerEvents: 'none', userSelect: 'none', whiteSpace: 'nowrap' };
const toastStyle: CSSProperties = { position: 'absolute', bottom: 170, left: '50%', transform: 'translateX(-50%)', maxWidth: '78%', padding: '8px 16px', background: 'rgba(8,7,6,0.82)', borderLeft: `3px solid ${AMBER}`, borderRadius: 4, color: INK, fontFamily: fontStack, fontSize: '0.84rem', textAlign: 'center', pointerEvents: 'none', userSelect: 'none', lineHeight: 1.4 };
const invStripStyle: CSSProperties = { position: 'absolute', bottom: 14, left: 14, display: 'flex', gap: 6, pointerEvents: 'auto' };
const slotStyle: CSSProperties = { position: 'relative', minWidth: 54, height: 48, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, padding: '2px 6px', background: 'rgba(8,7,6,0.6)', border: '1px solid', borderRadius: 5, fontFamily: fontStack };
const slotNumStyle: CSSProperties = { position: 'absolute', top: 2, left: 4, fontSize: '0.6rem', fontWeight: 700, opacity: 0.7 };
const curtainStyle: CSSProperties = { position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: INK, fontFamily: fontStack, fontSize: '1.4rem', letterSpacing: 4, pointerEvents: 'none' };
const titleScreenStyle: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 6, background: 'radial-gradient(circle at 50% 40%, rgba(20,16,12,0.6), rgba(2,2,3,0.92))', fontFamily: fontStack, pointerEvents: 'auto', cursor: 'pointer', padding: 24 };
const titleArtStyle: CSSProperties = { maxWidth: 'min(80vw, 460px)', imageRendering: 'pixelated', filter: 'drop-shadow(0 4px 16px #000)' };
const cutsceneStyle: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, background: 'radial-gradient(circle at 50% 38%, rgba(18,14,10,0.72), rgba(2,2,3,0.97))', fontFamily: fontStack, pointerEvents: 'auto', cursor: 'pointer', padding: '24px 32px', textAlign: 'center', userSelect: 'none' };
const skipFilmBtnStyle: CSSProperties = { position: 'absolute', bottom: 22, right: 26, padding: '8px 18px', background: 'rgba(8,7,6,0.6)', color: '#e9dcc3', border: '1px solid rgba(233,220,195,0.35)', borderRadius: 5, fontFamily: fontStack, fontSize: '0.82rem', letterSpacing: 1, cursor: 'pointer', pointerEvents: 'auto' };
const skipLinkStyle: CSSProperties = { marginTop: 12, background: 'none', border: 'none', color: INK, opacity: 0.45, fontFamily: fontStack, fontSize: '0.72rem', letterSpacing: 1, cursor: 'pointer', pointerEvents: 'auto' };
const loadingScreenStyle: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#020203', fontFamily: fontStack, pointerEvents: 'auto', userSelect: 'none' };
const cutsceneVideoStyle: CSSProperties = { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0 };
const cutsceneShadeStyle: CSSProperties = { position: 'absolute', inset: 0, zIndex: 1, background: 'radial-gradient(circle at 50% 42%, rgba(4,3,3,0.35), rgba(2,2,3,0.88))' };
const cutsceneContentStyle: CSSProperties = { position: 'relative', zIndex: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' };
const beginBtnStyle: CSSProperties = { marginTop: 16, padding: '10px 26px', background: 'transparent', color: AMBER, border: `1px solid ${AMBER}`, borderRadius: 4, fontFamily: fontStack, fontSize: '1rem', letterSpacing: 2, cursor: 'pointer', pointerEvents: 'auto' };
const endStyle: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(2,2,3,0.9)', fontFamily: fontStack, pointerEvents: 'auto', padding: 24, textAlign: 'center' };
