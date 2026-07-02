// ──────────────────────────────────────────────
// App.tsx — thin React shell for HOLLOWMERE (Babylon 3D). React owns the
// platform hooks, canvas mount, DOM HUD, and mobile controls; the Babylon
// Engine / Scene / render loop lifecycle is owned by src/babylon/game.ts.
// ──────────────────────────────────────────────

import { useEffect, useRef, type MutableRefObject } from 'react';
import { MobileControlHud, useGameConfig, useInput, useScreen, type Input, type Phase, type Screen } from '@rezona/core/3d';
import { SCHEMA, type Config } from './game/schema';
import { startGame, type GameRuntimeHandle } from './babylon/game';
import { Hud } from './babylon/hud';
import { controls } from './babylon/controls';

export interface GameRuntimeContext {
  input: Input;
  screenRef: MutableRefObject<Screen>;
  configRef: MutableRefObject<Config>;
  phaseRef: MutableRefObject<Phase>;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const { screenRef, containerRef } = useScreen();
  const input = useInput();
  const { configRef } = useGameConfig(SCHEMA);
  const phaseRef = useRef<Phase>('ACTIVE');
  // Keyboard+mouse first: show the touch joystick + buttons only on touch devices.
  const isTouch =
    typeof window !== 'undefined' &&
    (window.matchMedia?.('(pointer: coarse)')?.matches || 'ontouchstart' in window);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const runtimeContext: GameRuntimeContext = { input, screenRef, configRef, phaseRef };
    const runtime = startGame(canvas, runtimeContext);

    return () => {
      const maybeHandle = runtime as GameRuntimeHandle | Promise<GameRuntimeHandle>;
      if (typeof (maybeHandle as Promise<GameRuntimeHandle>).then === 'function') {
        void (maybeHandle as Promise<GameRuntimeHandle>).then((handle) => handle.dispose());
      } else {
        (maybeHandle as GameRuntimeHandle).dispose();
      }
    };
  }, [configRef, input, screenRef]);

  return (
    <div ref={containerRef} {...input.handlers} className="game-shell">
      <canvas ref={canvasRef} className="game-canvas" aria-label="HOLLOWMERE viewport" />
      <Hud phaseRef={phaseRef} />
      {isTouch ? (
        <MobileControlHud
          input={input}
          primaryAction={{
            label: 'USE',
            ariaLabel: 'Use / Interact',
            onPress: () => controls.pressUse(),
            onRelease: () => {},
          }}
          extraButtons={[
            {
              label: 'ATK',
              ariaLabel: 'Attack',
              onPress: () => controls.pressAttack(),
              onRelease: () => controls.releaseAttack(),
            },
            {
              label: 'SWAP',
              ariaLabel: 'Swap weapon',
              onPress: () => controls.pressSwap(),
              onRelease: () => {},
            },
          ]}
        />
      ) : null}
    </div>
  );
}
