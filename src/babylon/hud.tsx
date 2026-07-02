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

export function Hud({ phaseRef }: HudProps) {
  const [s, setS] = useState<GameStoreSnapshot>(() => getGameSnapshot());
  useEffect(() => subscribeGameStore(setS), []);
  void phaseRef;

  const healthColor = s.healthState === 'danger' ? '#c2452f' : s.healthState === 'caution' ? '#d98a2b' : AMBER;
  const restart = () => window.location.reload();

  // LLM-EXTENSION:HUD — survival-horror DOM HUD driven by the Babylon runtime/store.
  // DO NOT REMOVE the LLM-EXTENSION:HUD tag — templates/3d/scripts/check-architecture.mjs requires it to appear exactly once across the src tree.
  return (
    <>
      {/* steward proximity pulse */}
      {s.hudPhase === 'PLAY' && s.stewardNear > 0.05 ? (
        <div style={{ ...pulseStyle, boxShadow: `inset 0 0 ${40 + s.stewardNear * 120}px ${10 + s.stewardNear * 40}px rgba(150,20,20,${0.18 + s.stewardNear * 0.5})` }} />
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

      {/* LOADING — preloads every model + physics before you can enter */}
      {!s.ready ? (
        <div style={titleScreenStyle}>
          <h1 style={{ letterSpacing: 8, color: INK, margin: 0 }}>HOLLOWMERE</h1>
          <p style={{ color: AMBER, letterSpacing: 3, marginTop: 10, fontSize: '0.8rem' }}>
            {s.message && s.message !== 'ready' ? s.message.toUpperCase() : 'PRELOADING THE ESTATE…'}
          </p>
          <div style={{ width: 260, height: 6, marginTop: 18, background: 'rgba(233,220,195,0.15)', borderRadius: 3, overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(s.loadProgress * 100)}%`, height: '100%', background: AMBER, borderRadius: 3, transition: 'width 160ms linear' }} />
          </div>
          <p style={{ color: INK, opacity: 0.55, marginTop: 10, fontSize: '0.72rem' }}>{Math.round(s.loadProgress * 100)}%</p>
        </div>
      ) : null}

      {/* TITLE */}
      {s.ready && s.hudPhase === 'TITLE' ? (
        <div style={titleScreenStyle} onClick={() => triggerStart()}>
          {titleImg ? <img src={titleImg} alt="HOLLOWMERE" style={titleArtStyle} /> : <h1 style={{ letterSpacing: 6, color: INK }}>HOLLOWMERE</h1>}
          <p style={{ color: AMBER, letterSpacing: 3, marginTop: 8 }}>THE ESTATE</p>
          <p style={{ color: INK, opacity: 0.7, maxWidth: 360, textAlign: 'center', fontSize: '0.82rem', lineHeight: 1.5 }}>
            A relief courier on a tidal island. The tide is coming in. Find the four crests; the first is the Stag.
          </p>
          <button style={beginBtnStyle} onClick={(e) => { e.stopPropagation(); triggerStart(); }}>
            ▸ Enter the House
          </button>
          <p style={{ color: INK, opacity: 0.6, fontSize: '0.74rem', marginTop: 14, textAlign: 'center', lineHeight: 1.6 }}>
            <b style={{ color: AMBER }}>WASD</b> move&nbsp;·&nbsp;<b style={{ color: AMBER }}>Mouse</b> look (click to capture)<br />
            <b style={{ color: AMBER }}>Left-click</b> attack&nbsp;·&nbsp;<b style={{ color: AMBER }}>Right-click</b> use&nbsp;·&nbsp;<b style={{ color: AMBER }}>1–9</b> select item&nbsp;·&nbsp;<b style={{ color: AMBER }}>Esc</b> release
          </p>
        </div>
      ) : null}

      {/* DEATH */}
      {s.hudPhase === 'DEAD' ? (
        <div style={endStyle}>
          <h1 style={{ color: '#c2452f', letterSpacing: 4 }}>ARRANGED</h1>
          <p style={{ color: INK, opacity: 0.8 }}>The Steward tidies you among the others.</p>
          <button style={beginBtnStyle} onClick={restart}>Try Again</button>
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
    </>
  );
}

// TITLE start: route through the shared intent bridge (mobile + desktop).
function triggerStart() {
  void import('./controls').then((m) => m.controls.pressUse());
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
const beginBtnStyle: CSSProperties = { marginTop: 16, padding: '10px 26px', background: 'transparent', color: AMBER, border: `1px solid ${AMBER}`, borderRadius: 4, fontFamily: fontStack, fontSize: '1rem', letterSpacing: 2, cursor: 'pointer', pointerEvents: 'auto' };
const endStyle: CSSProperties = { position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, background: 'rgba(2,2,3,0.9)', fontFamily: fontStack, pointerEvents: 'auto', padding: 24, textAlign: 'center' };
