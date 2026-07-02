// ══════════════════════════════════════════════
// HOLLOWMERE intent bridge — survival horror needs more than one action
// button (USE / ATTACK / SWAP / QUICK-TURN). DOM buttons (App/Hud) and the
// keyboard push edge-triggered intents here; the director consumes them.
// Movement still flows through @rezona/core input.dir (joystick + WASD).
// ══════════════════════════════════════════════

interface Intents {
  use: boolean;
  attack: boolean;
  swap: boolean;
  quickTurn: boolean;
  attackHeld: boolean;
  slot: number; // 0 = none; 1-9 = equip inventory slot N (number keys)
  flashlight: boolean; // edge: toggle the flashlight on/off
  sprintHeld: boolean; // held: sprint while moving (drains stamina)
  bind: boolean; // edge: bind a wound (heal, if a bandage is carried)
  inventory: boolean; // edge: toggle the full inventory screen
  invAction: { kind: 'equip' | 'use'; key: string } | null; // click action from the inventory UI
  crouch: boolean; // edge: toggle sneak (slow, quiet, near-invisible in the dark)
}

const intents: Intents = { use: false, attack: false, swap: false, quickTurn: false, attackHeld: false, slot: 0, flashlight: false, sprintHeld: false, bind: false, inventory: false, invAction: null, crouch: false };

// persisted player settings (Settings panel)
const settings = {
  brightness: (() => {
    try { const v = Number(localStorage.getItem('hm_brightness')); return v >= 0.6 && v <= 2 ? v : 1; } catch { return 1; }
  })(),
};

// accumulated mouse-look delta (pointer-lock), consumed by the actor each frame
const look = { dx: 0, dy: 0 };
let pointerLocked = false;

export const controls = {
  pressUse() {
    intents.use = true;
  },
  pressAttack() {
    intents.attack = true;
    intents.attackHeld = true;
  },
  releaseAttack() {
    intents.attackHeld = false;
  },
  pressSwap() {
    intents.swap = true;
  },
  pressSlot(n: number) {
    intents.slot = n;
  },
  pressQuickTurn() {
    intents.quickTurn = true;
  },
  pressFlashlight() {
    intents.flashlight = true;
  },
  pressBind() {
    intents.bind = true;
  },
  pressInventory() {
    intents.inventory = true;
  },
  pressInvAction(kind: 'equip' | 'use', key: string) {
    intents.invAction = { kind, key };
  },
  pressCrouch() {
    intents.crouch = true;
  },
  setSprint(on: boolean) {
    intents.sprintHeld = on;
  },
  setBrightness(v: number) {
    settings.brightness = v;
    try { localStorage.setItem('hm_brightness', String(v)); } catch { /* private mode */ }
  },
  getBrightness() {
    return settings.brightness;
  },
  consume(): Intents {
    const snap = { ...intents };
    intents.use = false;
    intents.attack = false;
    intents.swap = false;
    intents.quickTurn = false;
    intents.slot = 0;
    intents.flashlight = false;
    intents.bind = false;
    intents.inventory = false;
    intents.invAction = null;
    intents.crouch = false;
    return snap;
  },
  peekAttackHeld() {
    return intents.attackHeld;
  },
  addLook(dx: number, dy: number) {
    look.dx += dx;
    look.dy += dy;
  },
  consumeLook(): { dx: number; dy: number } {
    const dx = look.dx;
    const dy = look.dy;
    look.dx = 0;
    look.dy = 0;
    return { dx, dy };
  },
  isPointerLocked() {
    return pointerLocked;
  },
};

// Desktop keyboard-and-mouse: pointer-lock mouse-look + LEFT-click attack /
// RIGHT-click use. Click the view to capture the mouse (Esc releases).
export function attachMouse(canvas: HTMLCanvasElement): () => void {
  const onClick = () => {
    if (!pointerLocked && document.pointerLockElement !== canvas) {
      void canvas.requestPointerLock?.();
    }
  };
  const onLockChange = () => {
    pointerLocked = document.pointerLockElement === canvas;
  };
  const onMove = (e: MouseEvent) => {
    if (pointerLocked) controls.addLook(e.movementX, e.movementY);
  };
  const onDown = (e: MouseEvent) => {
    if (document.pointerLockElement !== canvas) return; // first click only locks
    if (e.button === 0) controls.pressAttack();
    else if (e.button === 2) controls.pressUse();
  };
  const onUp = (e: MouseEvent) => {
    if (e.button === 0) controls.releaseAttack();
  };
  const onContext = (e: Event) => e.preventDefault();

  canvas.addEventListener('click', onClick);
  document.addEventListener('pointerlockchange', onLockChange);
  document.addEventListener('mousemove', onMove);
  canvas.addEventListener('mousedown', onDown);
  canvas.addEventListener('mouseup', onUp);
  canvas.addEventListener('contextmenu', onContext);
  return () => {
    canvas.removeEventListener('click', onClick);
    document.removeEventListener('pointerlockchange', onLockChange);
    document.removeEventListener('mousemove', onMove);
    canvas.removeEventListener('mousedown', onDown);
    canvas.removeEventListener('mouseup', onUp);
    canvas.removeEventListener('contextmenu', onContext);
    if (document.pointerLockElement === canvas) document.exitPointerLock?.();
    pointerLocked = false;
  };
}

export function attachKeyboard(): () => void {
  const onKey = (e: KeyboardEvent) => {
    switch (e.code) {
      case 'KeyE':
      case 'Enter':
        controls.pressUse();
        break;
      case 'Space':
      case 'KeyF':
        controls.pressAttack();
        break;
      case 'KeyQ':
        controls.pressSwap();
        break;
      case 'KeyI':
      case 'Tab':
        e.preventDefault();
        controls.pressInventory();
        break;
      case 'KeyR':
        controls.pressQuickTurn();
        break;
      case 'KeyL':
        controls.pressFlashlight();
        break;
      case 'KeyB':
        controls.pressBind();
        break;
      case 'KeyC':
        controls.pressCrouch();
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        controls.setSprint(true);
        break;
      case 'Digit1': case 'Digit2': case 'Digit3':
      case 'Digit4': case 'Digit5': case 'Digit6':
      case 'Digit7': case 'Digit8': case 'Digit9':
        controls.pressSlot(Number(e.code.slice(5)));
        break;
      default:
        break;
    }
  };
  const onUp = (e: KeyboardEvent) => {
    if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') controls.setSprint(false);
    if (e.code === 'Space' || e.code === 'KeyF') controls.releaseAttack();
  };
  // ── WASD-while-sprinting fix ──────────────────────────────────────
  // @rezona's movement tracks keys by `e.key` (case-sensitive). Holding Shift
  // flips WASD to uppercase, so a movement key pressed as 'w' but released as
  // 'W' never clears → the character slides forever. Mirror every single-letter
  // key event in the opposite case (with a NO code, so our own e.code action
  // handlers don't double-fire) so the movement set always adds/clears both.
  let flipping = false;
  const mirrorCase = (e: KeyboardEvent) => {
    if (flipping) return;
    const k = e.key;
    if (k.length !== 1 || !/[a-zA-Z]/.test(k)) return;
    const other = k === k.toLowerCase() ? k.toUpperCase() : k.toLowerCase();
    if (other === k) return;
    flipping = true;
    window.dispatchEvent(new KeyboardEvent(e.type, { key: other }));
    flipping = false;
  };
  window.addEventListener('keydown', onKey);
  window.addEventListener('keyup', onUp);
  window.addEventListener('keydown', mirrorCase);
  window.addEventListener('keyup', mirrorCase);
  return () => {
    window.removeEventListener('keydown', onKey);
    window.removeEventListener('keyup', onUp);
    window.removeEventListener('keydown', mirrorCase);
    window.removeEventListener('keyup', mirrorCase);
  };
}
