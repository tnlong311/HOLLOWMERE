// ══════════════════════════════════════════════
// EDITABLE schema — external editor tunables for HOLLOWMERE.
// Gameplay internals live in src/babylon/config.ts (TUNING / PIXEL / ROOMS).
// ══════════════════════════════════════════════

import type { EditableSchema } from '@rezona/core/3d';

// LLM-EXTENSION:CONFIG — add public Babylon runtime / input-feel configuration here; internal constants stay in the module that owns the logic.
// DO NOT REMOVE the LLM-EXTENSION:CONFIG tag — templates/3d/scripts/check-architecture.mjs requires it to appear exactly once across the src tree.
export const SCHEMA = {
  // LLM-EXTENSION:SCHEMA — add editor-tunable parameters here; do not write gameplay-specific logic in the foundation block.
  // DO NOT REMOVE the LLM-EXTENSION:SCHEMA tag — templates/3d/scripts/check-architecture.mjs requires it to appear exactly once across the src tree.
  bgColor: {
    type: 'color',
    label: 'Void Color',
    default: '#05060a',
    cssVar: '--bg-color',
  },
  fgColor: {
    type: 'color',
    label: 'HUD Ink',
    default: '#e9dcc3',
    cssVar: '--fg-color',
  },
  moveSpeed: {
    type: 'number',
    label: 'Walk Speed',
    default: 3.4,
    min: 1.5,
    max: 8,
    step: 0.2,
  },
  pixelSize: {
    type: 'number',
    label: 'Pixel Size',
    default: 3,
    min: 1,
    max: 6,
    step: 0.5,
  },
  posterizeLevels: {
    type: 'number',
    label: 'Palette Steps',
    default: 14,
    min: 6,
    max: 32,
    step: 1,
  },
  ditherAmount: {
    type: 'number',
    label: 'Dither',
    default: 0.55,
    min: 0,
    max: 1,
    step: 0.05,
  },
} satisfies EditableSchema;

export type Config = { [K in keyof typeof SCHEMA]: (typeof SCHEMA)[K]['default'] };
