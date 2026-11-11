/**
 * Pure-geometry coordinate math, clearance verifications, and SVG definitions
 * for the Cevin brand mark, small rendition, and animated "working" mark (`CevinMark`).
 *
 * All coordinates are computed from primitives (`path` arcs and lines, `circle`)
 * with y pointing down and P(theta) = (cx + r*cos(theta), cy + r*sin(theta)) rounded to 2 decimals.
 */

export const CEVIN_BRAND_COLORS = {
  ink: '#151A22',
  paper: '#F4F1EB',
  white: '#FFFFFF',
  cobalt: '#1D4ED8',
  cobaltOnInk: '#5B8CFF',
  danger: '#DC2626',
} as const;

export interface Point2D {
  x: number;
  y: number;
}

export interface BoundingBoxExtents {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  width: number;
  height: number;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function pointOnCircle(
  cx: number,
  cy: number,
  r: number,
  thetaDeg: number,
): Point2D {
  const rad = (thetaDeg * Math.PI) / 180;
  return {
    x: round2(cx + r * Math.cos(rad)),
    y: round2(cy + r * Math.sin(rad)),
  };
}

export type CevinMarkTone = 'paper' | 'ink' | 'mono';

export type CevinMarkState =
  | 'idle'
  | 'thinking'
  | 'writing'
  | 'done'
  | 'error';

// ============================================================================
// Standard Rendition Geometry (viewBox 0 0 64 64, for sizes > 20px)
// ============================================================================

const STANDARD_RING_CENTER = { x: 32, y: 32 };
const STANDARD_RING_RADIUS = 22;
const STANDARD_RING_STROKE = 8;
const STANDARD_OPENING_HALF_ANGLE = 40;

const pPlus40 = pointOnCircle(
  STANDARD_RING_CENTER.x,
  STANDARD_RING_CENTER.y,
  STANDARD_RING_RADIUS,
  STANDARD_OPENING_HALF_ANGLE,
); // (48.85, 46.14)
const pMinus40 = pointOnCircle(
  STANDARD_RING_CENTER.x,
  STANDARD_RING_CENTER.y,
  STANDARD_RING_RADIUS,
  -STANDARD_OPENING_HALF_ANGLE,
); // (48.85, 17.86)

const STANDARD_RING_PATH = `M${pPlus40.x} ${pPlus40.y}A${STANDARD_RING_RADIUS} ${STANDARD_RING_RADIUS} 0 1 1 ${pMinus40.x} ${pMinus40.y}`;

const STANDARD_BULLET = { cx: 24, cy: 32, r: 4 };
const STANDARD_LINE = {
  x1: 33,
  y1: 32,
  x2: 58,
  y2: 32,
  stroke: 4,
  length: 25,
  path: 'M33 32H58',
};

// Clearances for Standard Mark:
// 1. Bullet left edge to ring inner edge:
//    Bullet left edge = 24 - 4 = 20.
//    Ring inner radius = 22 - (8/2) = 18. Ring inner edge = 32 - 18 = 14.
//    Clearance = 20 - 14 = 6.0 (>= 5).
const stdClearance1 = round2(
  STANDARD_BULLET.cx -
    STANDARD_BULLET.r -
    (STANDARD_RING_CENTER.x - (STANDARD_RING_RADIUS - STANDARD_RING_STROKE / 2)),
);

// 2. Bullet right edge to line start cap tip:
//    Bullet right edge = 24 + 4 = 28.
//    Line start cap tip = 33 - (4/2) = 31.
//    Clearance = 31 - 28 = 3.0 (>= 2.5).
const stdClearance2 = round2(
  STANDARD_LINE.x1 -
    STANDARD_LINE.stroke / 2 -
    (STANDARD_BULLET.cx + STANDARD_BULLET.r),
);

// 3. Line to ring cap:
//    Ring cap center y = 46.14 (bottom) and 17.86 (top). Cap radius = 8/2 = 4.
//    Line is at y = 32, stroke = 4 (y ranges from 30 to 34).
//    Distance from line to ring cap = (46.14 - 32) - (4/2 + 8/2) = 14.14 - 6 = 8.14 (>= 6).
const stdClearance3 = round2(
  pPlus40.y -
    STANDARD_LINE.y1 -
    (STANDARD_RING_STROKE / 2 + STANDARD_LINE.stroke / 2),
);

// Extents:
// Ring outer extent: cx - (r + stroke/2) = 32 - 26 = 6.
// Ring top: 32 - 26 = 6. Bottom: 32 + 26 = 58.
// Ring right cap extent: 48.85 + 4 = 52.85.
// Line right cap tip: 58 + (4/2) = 60.
const STANDARD_EXTENTS: BoundingBoxExtents = {
  minX: 6,
  maxX: 60,
  minY: 6,
  maxY: 58,
  width: 54,
  height: 52,
};

export const CEVIN_MARK_GEOMETRY = {
  ring: {
    center: STANDARD_RING_CENTER,
    radius: STANDARD_RING_RADIUS,
    stroke: STANDARD_RING_STROKE,
    openingHalfAngle: STANDARD_OPENING_HALF_ANGLE,
    pStart: pPlus40,
    pEnd: pMinus40,
    path: STANDARD_RING_PATH,
  },
  bullet: STANDARD_BULLET,
  line: STANDARD_LINE,
  dashArray: `${STANDARD_LINE.length} 50`,
  dashOffsetRetracted: STANDARD_LINE.length + 1, // 26
  dashOffsetDrawn: 0,
  clearances: {
    bulletLeftToRingInner: stdClearance1, // 6.0 (>= 5)
    bulletRightToLineStart: stdClearance2, // 3.0 (>= 2.5)
    lineToRingCap: stdClearance3, // 8.14 (>= 6)
  },
  extents: STANDARD_EXTENTS,
  minLegibleSizePx: 24,
} as const;

// ============================================================================
// Small Rendition Geometry (for size <= 20px)
// ============================================================================

const SMALL_RING_STROKE = 9;
const SMALL_BULLET = { cx: 24, cy: 32, r: 4.5 };
const SMALL_LINE = {
  x1: 34,
  y1: 32,
  x2: 57,
  y2: 32,
  stroke: 5,
  length: 23,
  path: 'M34 32H57',
};

// Clearances for Small Rendition:
// 1. Bullet left edge = 24 - 4.5 = 19.5. Ring inner edge = 32 - (22 - 4.5) = 14.5.
//    Clearance = 19.5 - 14.5 = 5.0 (>= 5).
const smallClearance1 = round2(
  SMALL_BULLET.cx -
    SMALL_BULLET.r -
    (STANDARD_RING_CENTER.x - (STANDARD_RING_RADIUS - SMALL_RING_STROKE / 2)),
);

// 2. Bullet right edge = 24 + 4.5 = 28.5. Line start cap = 34 - 2.5 = 31.5.
//    Clearance = 31.5 - 28.5 = 3.0 (>= 2.5).
const smallClearance2 = round2(
  SMALL_LINE.x1 -
    SMALL_LINE.stroke / 2 -
    (SMALL_BULLET.cx + SMALL_BULLET.r),
);

// 3. Line to ring cap = 14.14 - (4.5 + 2.5) = 7.14 (>= 6).
const smallClearance3 = round2(
  pPlus40.y - SMALL_LINE.y1 - (SMALL_RING_STROKE / 2 + SMALL_LINE.stroke / 2),
);

// Extents:
// Ring outer extent: 32 - (22 + 4.5) = 5.5. Top: 5.5, Bottom: 58.5.
// Line right cap tip: 57 + 2.5 = 59.5.
const SMALL_EXTENTS: BoundingBoxExtents = {
  minX: 5.5,
  maxX: 59.5,
  minY: 5.5,
  maxY: 58.5,
  width: 54,
  height: 53,
};

export const CEVIN_MARK_SMALL_GEOMETRY = {
  ring: {
    center: STANDARD_RING_CENTER,
    radius: STANDARD_RING_RADIUS,
    stroke: SMALL_RING_STROKE,
    openingHalfAngle: STANDARD_OPENING_HALF_ANGLE,
    pStart: pPlus40,
    pEnd: pMinus40,
    path: STANDARD_RING_PATH,
  },
  bullet: SMALL_BULLET,
  line: SMALL_LINE,
  dashArray: `${SMALL_LINE.length} 50`,
  dashOffsetRetracted: SMALL_LINE.length + 1, // 24
  dashOffsetDrawn: 0,
  clearances: {
    bulletLeftToRingInner: smallClearance1, // 5.0 (>= 5)
    bulletRightToLineStart: smallClearance2, // 3.0 (>= 2.5)
    lineToRingCap: smallClearance3, // 7.14 (>= 6)
  },
  extents: SMALL_EXTENTS,
  minLegibleSizePx: 19.2,
} as const;

// Backward-compatible alias for existing imports
export const CEVIN_OPTION_A_GEOMETRY = {
  ringPath: STANDARD_RING_PATH,
  dot: { cx: STANDARD_BULLET.cx, cy: STANDARD_BULLET.cy, r: STANDARD_BULLET.r },
  iconOnlyDot: {
    cx: SMALL_BULLET.cx,
    cy: SMALL_BULLET.cy,
    r: SMALL_BULLET.r,
  },
} as const;

export const CEVIN_LOGO_REPORT = {
  math: {
    arcStartP40: pPlus40, // (48.85, 46.14)
    arcEndPMinus40: pMinus40, // (48.85, 17.86)
    arcFormula: 'M48.85 46.14A22 22 0 1 1 48.85 17.86',
  },
  standard: {
    clearances: {
      bulletLeftToRingInner: stdClearance1, // 6.0 (>= 5)
      bulletRightToLineStart: stdClearance2, // 3.0 (>= 2.5)
      lineToRingCap: stdClearance3, // 8.14 (>= 6)
    },
    extents: STANDARD_EXTENTS,
    viewBoxPadding: { left: 6, right: 4, top: 6, bottom: 6 },
    minLegibleSizePx: 24,
  },
  small: {
    clearances: {
      bulletLeftToRingInner: smallClearance1, // 5.0 (>= 5)
      bulletRightToLineStart: smallClearance2, // 3.0 (>= 2.5)
      lineToRingCap: smallClearance3, // 7.14 (>= 6)
    },
    extents: SMALL_EXTENTS,
    viewBoxPadding: { left: 5.5, right: 4.5, top: 5.5, bottom: 5.5 },
    minLegibleSizePx: 19.2,
  },
  animation: {
    lineLength: 25,
    dashArray: '25 50',
    retractedOffset: 26,
    drawnOffset: 0,
    states: {
      idle: 'Line drawn (offset 0), bullet scale 1',
      thinking: 'Line retracted (offset 26), bullet breathing 1 -> 1.3 -> 1 over 1.2s ease-in-out infinite',
      writing: 'Line drawing 26 -> 0 in 0.7s, hold 0.3s, fade 0.2s over 1.2s period; bullet at rest',
      done: '700ms one-shot: line draws 26 -> 0 in 0.5s, bullet bounce 1 -> 1.25 -> 1 in 0.7s',
      error: 'Static, color switches to danger (#DC2626), line retracted (offset 26)',
    },
    reducedMotion: {
      thinkingAndWriting: 'Bullet opacity pulse 0.5 -> 1 over 1.2s; line drawn and static',
      done: 'Static mark rendered immediately',
    },
  },
} as const;
