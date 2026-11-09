/**
 * Pure-geometry coordinate math and SVG path generators for the Cevin brand mark,
 * shared "cevin" geometric wordmark, and animated "working" mark (`CevinMark`).
 *
 * All coordinates are computed from primitives (`path` arcs/lines, `circle`, `rect`)
 * with y pointing down and P(theta) = (cx + r*cos(theta), cy + r*sin(theta)) rounded to 2 decimals.
 */

export const CEVIN_BRAND_COLORS = {
  ink: '#151A22',
  fold: '#2A3342',
  paper: '#FFFFFF',
  cobalt: '#1D4ED8',
  background: '#F4F1EB',
  dark: {
    background: '#151A22',
    tile: '#F4F1EB',
    fold: '#D9D4C8',
    ring: '#151A22',
    wordmark: '#F4F1EB',
    cobalt: '#5B8CFF',
  },
  error: '#D97706',
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

/**
 * Rounds a number to 2 decimal places, stripping trailing zeros when formatting for SVG paths.
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Computes a point on a circle with y-axis pointing down:
 * P(thetaDeg) = (cx + r * cos(theta), cy + r * sin(theta)), rounded to 2 decimals.
 */
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

export interface WordmarkGeometry {
  x0: number;
  strokeWidth: number;
  cPath: string;
  ePath: string;
  vPath: string;
  iStemPath: string;
  iDot: { cx: number; cy: number; r: number };
  nPath: string;
  combinedStrokePath: string;
  letterExtents: {
    c: BoundingBoxExtents;
    e: BoundingBoxExtents;
    v: BoundingBoxExtents;
    i: BoundingBoxExtents;
    n: BoundingBoxExtents;
  };
}

/**
 * Computes exact paths and outer bounding extents (including stroke=6 round caps/joins and i-dot r=3.8)
 * for the shared "cevin" geometric wordmark relative to `x0`.
 *
 * - c: circle center (x0+20, 32), r=16, 35deg opening on the right. Arc from P(35deg) to P(-35deg), large=1, sweep=1.
 * - e: center (x0+64, 32), r=16. Bar from (cx-16, 32) to (cx+16, 32), then arc with large=1, sweep=0 to P(35deg).
 * - v: apex (x0+108, 48), arms to (x0+93, 16) and (x0+123, 16).
 * - i: stem (x0+139, 16) to (x0+139, 48). Cobalt dot, center (x0+139, 5), r=3.8.
 * - n: stems at x0+157 and x0+185. Left stem from y=48 to 16. Arch: semicircle of radius 14 from (x0+157, 31)
 *      clockwise (sweep=1) to (x0+185, 31), then down to y=48.
 */
export function computeWordmarkGeometry(x0: number): WordmarkGeometry {
  const strokeWidth = 6;
  const halfStroke = strokeWidth / 2; // 3

  // c: center (x0 + 20, 32), r = 16
  const cCx = x0 + 20;
  const cCy = 32;
  const cR = 16;
  const cStart = pointOnCircle(cCx, cCy, cR, 35);
  const cEnd = pointOnCircle(cCx, cCy, cR, -35);
  const cPath = `M${cStart.x} ${cStart.y}A${cR} ${cR} 0 1 1 ${cEnd.x} ${cEnd.y}`;

  // e: center (x0 + 64, 32), r = 16
  const eCx = x0 + 64;
  const eCy = 32;
  const eR = 16;
  const eBarLeft = eCx - eR;
  const eBarRight = eCx + eR;
  const eEnd = pointOnCircle(eCx, eCy, eR, 35);
  const ePath = `M${eBarLeft} ${eCy}H${eBarRight}A${eR} ${eR} 0 1 0 ${eEnd.x} ${eEnd.y}`;

  // v: (x0+93, 16) -> (x0+108, 48) -> (x0+123, 16)
  const vLeftX = x0 + 93;
  const vApexX = x0 + 108;
  const vRightX = x0 + 123;
  const vPath = `M${vLeftX} 16L${vApexX} 48L${vRightX} 16`;

  // i: stem (x0+139, 16) to (x0+139, 48), dot (x0+139, 5), r=3.8
  const iX = x0 + 139;
  const iStemPath = `M${iX} 16V48`;
  const iDot = { cx: iX, cy: 5, r: 3.8 };

  // n: stems at x0+157 and x0+185, arch radius 14 from y=31
  const nLeftX = x0 + 157;
  const nRightX = x0 + 185;
  const nPath = `M${nLeftX} 48V16M${nLeftX} 31A14 14 0 0 1 ${nRightX} 31V48`;

  const combinedStrokePath = `${cPath}${ePath}${vPath}${iStemPath}${nPath}`;

  const makeExtents = (
    minX: number,
    maxX: number,
    minY: number,
    maxY: number,
  ): BoundingBoxExtents => ({
    minX: round2(minX),
    maxX: round2(maxX),
    minY: round2(minY),
    maxY: round2(maxY),
    width: round2(maxX - minX),
    height: round2(maxY - minY),
  });

  return {
    x0,
    strokeWidth,
    cPath,
    ePath,
    vPath,
    iStemPath,
    iDot,
    nPath,
    combinedStrokePath,
    letterExtents: {
      c: makeExtents(
        cCx - cR - halfStroke,
        cStart.x + halfStroke,
        16 - halfStroke,
        48 + halfStroke,
      ),
      e: makeExtents(
        eBarLeft - halfStroke,
        eBarRight + halfStroke,
        16 - halfStroke,
        48 + halfStroke,
      ),
      v: makeExtents(
        vLeftX - halfStroke,
        vRightX + halfStroke,
        16 - halfStroke,
        48 + halfStroke,
      ),
      i: makeExtents(
        iX - iDot.r,
        iX + iDot.r,
        iDot.cy - iDot.r,
        48 + halfStroke,
      ),
      n: makeExtents(
        nLeftX - halfStroke,
        nRightX + halfStroke,
        16 - halfStroke,
        48 + halfStroke,
      ),
    },
  };
}

export interface OptionAMarkGeometry {
  tilePath: string;
  foldPath: string;
  ringCenter: Point2D;
  ringRadius: number;
  ringStroke: number;
  pPlus35: Point2D;
  pMinus35: Point2D;
  ringPath: string;
  dot: { cx: number; cy: number; r: number };
  capDistance: number;
  dotClearance: number;
  orbitRadius: number;
  iconOnly: {
    tilePath: string;
    ringStroke: number;
    dot: { cx: number; cy: number; r: number };
    capDistance: number;
    dotClearance: number;
  };
}

/**
 * Computes Option A (folded sheet) mark geometry and verifies dot-to-cap clearance:
 * - Standard lockup (`stroke=8`): dot (48.5, 32), r=4.2 -> clearance = 1.58 px (>= 1.5 px).
 * - Icon-only (`stroke=9`, no fold): dot (48.8, 32), r=4.0 -> clearance = 1.39 px (>= 1.2 px).
 */
export function computeOptionAMarkGeometry(): OptionAMarkGeometry {
  const tilePath =
    'M14 0H48L64 16V50A14 14 0 0 1 50 64H14A14 14 0 0 1 0 50V14A14 14 0 0 1 14 0Z';
  const foldPath = 'M48 0V16H64Z';
  const ringCenter: Point2D = { x: 32, y: 32 };
  const ringRadius = 16;
  const ringStroke = 8;

  const pPlus35 = pointOnCircle(ringCenter.x, ringCenter.y, ringRadius, 35);
  const pMinus35 = pointOnCircle(ringCenter.x, ringCenter.y, ringRadius, -35);
  const ringPath = `M${pPlus35.x} ${pPlus35.y}A${ringRadius} ${ringRadius} 0 1 1 ${pMinus35.x} ${pMinus35.y}`;

  const dot = { cx: 48.5, cy: 32, r: 4.2 };
  const dx = dot.cx - pPlus35.x;
  const dy = pPlus35.y - dot.cy;
  const capDistance = round2(Math.hypot(dx, dy));
  const dotClearance = round2(capDistance - (ringStroke / 2 + dot.r));

  // Icon-only variant: tile without fold, ring stroke 9, recomputed dot for >= 1.2 clearance
  const iconOnlyTilePath =
    'M14 0H50A14 14 0 0 1 64 14V50A14 14 0 0 1 50 64H14A14 14 0 0 1 0 50V14A14 14 0 0 1 14 0Z';
  const iconRingStroke = 9;
  const iconDot = { cx: 48.8, cy: 32, r: 4.0 };
  const iconCapDist = round2(
    Math.hypot(iconDot.cx - pPlus35.x, pPlus35.y - iconDot.cy),
  );
  const iconClearance = round2(
    iconCapDist - (iconRingStroke / 2 + iconDot.r),
  );

  return {
    tilePath,
    foldPath,
    ringCenter,
    ringRadius,
    ringStroke,
    pPlus35,
    pMinus35,
    ringPath,
    dot,
    capDistance,
    dotClearance,
    orbitRadius: 16.5,
    iconOnly: {
      tilePath: iconOnlyTilePath,
      ringStroke: iconRingStroke,
      dot: iconDot,
      capDistance: iconCapDist,
      dotClearance: iconClearance,
    },
  };
}

export interface OptionBMarkGeometry {
  squaredCPath: string;
  squaredCStroke: number;
  outerExtents: BoundingBoxExtents;
  bullet: { cx: number; cy: number; r: number };
  linePath: string;
  lineStroke: number;
  lineLength: number;
}

/**
 * Computes Option B (bullet C) mark geometry:
 * - Squared C: stroke 8, M52 12H24A12 12 0 0 0 12 24V40A12 12 0 0 0 24 52H52 -> outer extents x: 8..56, y: 8..56.
 * - Bullet: circle center (27, 32), r=3.5.
 * - Line: stroke 4, round caps, from (36, 32) to (50, 32) -> length 14.
 */
export function computeOptionBMarkGeometry(): OptionBMarkGeometry {
  const squaredCPath = 'M52 12H24A12 12 0 0 0 12 24V40A12 12 0 0 0 24 52H52';
  const squaredCStroke = 8;
  const halfStroke = squaredCStroke / 2; // 4

  return {
    squaredCPath,
    squaredCStroke,
    outerExtents: {
      minX: 12 - halfStroke, // 8
      maxX: 52 + halfStroke, // 56
      minY: 12 - halfStroke, // 8
      maxY: 52 + halfStroke, // 56
      width: 48,
      height: 48,
    },
    bullet: { cx: 27, cy: 32, r: 3.5 },
    linePath: 'M36 32H50',
    lineStroke: 4,
    lineLength: 50 - 36, // 14
  };
}

export type CevinMarkState =
  | 'idle'
  | 'thinking'
  | 'writing'
  | 'done'
  | 'error';

export type CevinMarkVariant = 'tile' | 'glyph';

export interface WordmarkLetterCoordinates {
  c: { cx: number; cy: number; r: number };
  e: { cx: number; cy: number; r: number };
  v: { leftX: number; apexX: number; rightX: number };
  i: { x: number; dotCy: number; dotR: number };
  n: { leftX: number; rightX: number; archR: number };
}

export function buildWordmarkGeometry(x0: number): WordmarkGeometry & {
  letters: WordmarkLetterCoordinates;
} {
  const base = computeWordmarkGeometry(x0);
  return {
    ...base,
    letters: {
      c: { cx: x0 + 20, cy: 32, r: 16 },
      e: { cx: x0 + 64, cy: 32, r: 16 },
      v: { leftX: x0 + 93, apexX: x0 + 108, rightX: x0 + 123 },
      i: { x: x0 + 139, dotCy: 5, dotR: 3.8 },
      n: { leftX: x0 + 157, rightX: x0 + 185, archR: 14 },
    },
  };
}

const computedOptionA = computeOptionAMarkGeometry();
export const CEVIN_OPTION_A_GEOMETRY = {
  ...computedOptionA,
  iconOnlyDot: computedOptionA.iconOnly.dot,
} as const;

const computedOptionB = computeOptionBMarkGeometry();
export const CEVIN_OPTION_B_GEOMETRY = {
  ...computedOptionB,
  framePath: computedOptionB.squaredCPath,
} as const;

export const CEVIN_LOGO_REPORT = {
  optionA: {
    pPlus35: computedOptionA.pPlus35,
    pMinus35: computedOptionA.pMinus35,
    dotClearanceStandardPx: computedOptionA.dotClearance,
    dotClearanceIconOnlyPx: computedOptionA.iconOnly.dotClearance,
  },
  optionB: {
    outerStrokeExtents: {
      minX: computedOptionB.outerExtents.minX,
      maxX: computedOptionB.outerExtents.maxX,
      minY: computedOptionB.outerExtents.minY,
      maxY: computedOptionB.outerExtents.maxY,
    },
    lineLength: computedOptionB.lineLength,
  },
} as const;

/**
 * Computes the deterministic rotation angle in degrees around (32, 32) for `progress` in [0, 1].
 * Sweeps 290deg clockwise along the C arc from 0deg (resting position) to 290deg.
 */
export function computeProgressOrbitAngleDeg(progress: number): number {
  const clamped = Math.max(0, Math.min(1, progress));
  return round2(clamped * 290);
}

