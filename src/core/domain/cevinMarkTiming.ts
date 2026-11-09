/**
 * Pure timing controller and activity label formatter for Cevin's AI work indicator (`CevinMark`).
 *
 * Enforces the ergonomic timing contract:
 * 1. Show delay: wait 300 ms before displaying the active mark (`thinking` or `writing`).
 *    Fast tasks (< 300 ms, e.g., cache hits or instant passes) never flash an indicator.
 * 2. Minimum visible duration: once shown, keep the indicator visible for at least 600 ms.
 * 3. Smooth phase handoff (`thinking` -> `writing`): wait for the current `thinking` loop iteration
 *    (`onAnimationIteration` or at most 1600 ms) before switching to `writing`.
 * 4. Completion settle (`done`): play the 420 ms `done` state ONLY if the indicator became visible.
 */

import { CevinMarkState } from './cevinLogoGeometry';

export type CevinMarkVisualState = CevinMarkState;

export type CevinActivityPhase = 'idle' | 'thinking' | 'writing' | 'warming';

export type CevinActivityKind =
  | 'idle'
  | 'reading-resume'
  | 'reading-posting'
  | 'rewriting'
  | 'writing'
  | 'checking'
  | 'warming'
  | 'warming-up';

export const CEVIN_TIMING_CONSTANTS = {
  SHOW_DELAY_MS: 300,
  MIN_VISIBLE_MS: 600,
  MAX_THINKING_LOOP_MS: 1600,
  DONE_SETTLE_MS: 420,
} as const;

/**
 * Formats the exact sentence-case status copy for each of Cevin's AI touchpoints,
 * appending a `(completed of total)` counter when a multi-item batch is running.
 */
export function formatCevinActivityLabel(
  kind: CevinActivityKind | null,
  batchCompleted?: number,
  batchTotal?: number,
): string {
  const hasBatch =
    typeof batchTotal === 'number' &&
    batchTotal > 1 &&
    typeof batchCompleted === 'number';
  const suffix = hasBatch
    ? ` (${Math.min(batchCompleted, batchTotal)} of ${batchTotal})`
    : '';

  switch (kind) {
    case 'reading-resume':
      return `Cevin is reading your resume${suffix}`;
    case 'reading-posting':
      return `Cevin is reading the posting${suffix}`;
    case 'rewriting':
      return `Cevin is rewriting${suffix}`;
    case 'writing':
      return `Cevin is writing${suffix}`;
    case 'checking':
      return `Cevin is checking${suffix}`;
    case 'warming':
    case 'warming-up':
      return 'Cevin is warming up';
    case 'idle':
    default:
      return '';
  }
}

/**
 * Maps a high-level `CevinActivityKind` to its default `CevinActivityPhase`.
 */
export function mapKindToDefaultPhase(
  kind: CevinActivityKind,
): CevinActivityPhase {
  switch (kind) {
    case 'reading-resume':
    case 'reading-posting':
    case 'checking':
      return 'thinking';
    case 'warming':
    case 'warming-up':
      return 'warming';
    case 'rewriting':
    case 'writing':
      return 'writing';
    case 'idle':
    default:
      return 'idle';
  }
}

export function mapActivityKindToTargetPhase(
  kind: CevinActivityKind,
): CevinMarkVisualState {
  const phase = mapKindToDefaultPhase(kind);
  if (phase === 'thinking' || phase === 'warming') return 'thinking';
  if (phase === 'writing') return 'writing';
  return 'idle';
}

export interface CevinTimingSnapshot {
  visible: boolean;
  visualState: CevinMarkVisualState;
  phase: CevinActivityPhase;
  kind: CevinActivityKind;
  label: string;
  pendingShowSinceMs: number | null;
  shownAtMs: number | null;
  handoffToWritingRequestedAtMs: number | null;
  pendingCompletion: boolean;
  doneStartedAtMs: number | null;
}

export type CevinTimingMachineState = CevinTimingSnapshot;

export function createInitialTimingSnapshot(): CevinTimingSnapshot {
  return {
    visible: false,
    visualState: 'idle',
    phase: 'idle',
    kind: 'idle',
    label: '',
    pendingShowSinceMs: null,
    shownAtMs: null,
    handoffToWritingRequestedAtMs: null,
    pendingCompletion: false,
    doneStartedAtMs: null,
  };
}

export const createInitialTimingState = createInitialTimingSnapshot;

export function stepTimingMachine(
  prev: CevinTimingSnapshot,
  input: {
    phase: CevinActivityPhase;
    kind: CevinActivityKind | null;
    batchCompleted?: number;
    batchTotal?: number;
    nowMs: number;
  },
): CevinTimingSnapshot {
  const normalizedKind: CevinActivityKind = input.kind ?? 'idle';
  const nextLabel = formatCevinActivityLabel(
    normalizedKind,
    input.batchCompleted,
    input.batchTotal,
  );
  const targetVisual: CevinMarkVisualState =
    input.phase === 'thinking' || input.phase === 'warming'
      ? 'thinking'
      : input.phase === 'writing'
        ? 'writing'
        : 'idle';

  const state: CevinTimingSnapshot = {
    ...prev,
    phase: input.phase,
    kind: normalizedKind,
    label: nextLabel || prev.label,
  };

  if (targetVisual === 'thinking' || targetVisual === 'writing') {
    state.pendingCompletion = false;
    state.doneStartedAtMs = null;

    if (!state.visible) {
      if (state.pendingShowSinceMs === null) {
        state.pendingShowSinceMs = input.nowMs;
      }
      return advanceTimingMachine(state, input.nowMs);
    }

    if (state.visualState === 'thinking' && targetVisual === 'writing') {
      if (state.handoffToWritingRequestedAtMs === null) {
        state.handoffToWritingRequestedAtMs = input.nowMs;
      }
      return advanceTimingMachine(state, input.nowMs);
    }

    state.visualState = targetVisual;
    state.handoffToWritingRequestedAtMs = null;
    return advanceTimingMachine(state, input.nowMs);
  }

  // targetVisual === 'idle'
  if (!state.visible) {
    return createInitialTimingSnapshot();
  }

  state.pendingCompletion = true;
  return advanceTimingMachine(state, input.nowMs);
}

export function advanceTimingMachine(
  prev: CevinTimingSnapshot,
  nowMs: number,
): CevinTimingSnapshot {
  const state: CevinTimingSnapshot = { ...prev };
  const targetVisual: CevinMarkVisualState =
    state.phase === 'thinking' || state.phase === 'warming'
      ? 'thinking'
      : state.phase === 'writing'
        ? 'writing'
        : 'idle';

  // 1. Check 300ms show delay
  if (
    !state.visible &&
    (targetVisual === 'thinking' || targetVisual === 'writing') &&
    state.pendingShowSinceMs !== null &&
    nowMs - state.pendingShowSinceMs >= CEVIN_TIMING_CONSTANTS.SHOW_DELAY_MS
  ) {
    state.visible = true;
    state.shownAtMs =
      state.pendingShowSinceMs + CEVIN_TIMING_CONSTANTS.SHOW_DELAY_MS;
    state.pendingShowSinceMs = null;
    state.visualState = targetVisual;
  }

  // 2. Check 1600ms cap on thinking -> writing loop handoff
  if (
    state.visible &&
    state.visualState === 'thinking' &&
    state.handoffToWritingRequestedAtMs !== null &&
    nowMs - state.handoffToWritingRequestedAtMs >=
      CEVIN_TIMING_CONSTANTS.MAX_THINKING_LOOP_MS
  ) {
    state.visualState = 'writing';
    state.handoffToWritingRequestedAtMs = null;
  }

  // 3. Check 600ms minimum visible hold before entering `done`
  if (
    state.visible &&
    state.pendingCompletion &&
    state.doneStartedAtMs === null
  ) {
    const shownAt = state.shownAtMs ?? nowMs;
    if (nowMs - shownAt >= CEVIN_TIMING_CONSTANTS.MIN_VISIBLE_MS) {
      state.visualState = 'done';
      state.handoffToWritingRequestedAtMs = null;
      state.doneStartedAtMs = nowMs;
    }
  }

  // 4. Check 420ms `done` settle completion
  if (
    state.visible &&
    state.visualState === 'done' &&
    state.doneStartedAtMs !== null &&
    nowMs - state.doneStartedAtMs >= CEVIN_TIMING_CONSTANTS.DONE_SETTLE_MS
  ) {
    return createInitialTimingSnapshot();
  }

  return state;
}

export const advanceTimingClock = advanceTimingMachine;

export function notifyThinkingLoopIteration(
  prev: CevinTimingSnapshot,
  _nowMs: number,
): CevinTimingSnapshot {
  if (
    prev.visible &&
    prev.visualState === 'thinking' &&
    (prev.handoffToWritingRequestedAtMs !== null || prev.phase === 'writing')
  ) {
    return {
      ...prev,
      visualState: 'writing',
      handoffToWritingRequestedAtMs: null,
    };
  }
  return prev;
}

/**
 * Class wrapper around the pure timing machine for convenient imperative testing.
 */
export class CevinMarkTimingController {
  private state: CevinTimingSnapshot;

  constructor(_initialNowMs = 0) {
    this.state = createInitialTimingSnapshot();
  }

  updateActivity(
    input: {
      phase: CevinActivityPhase;
      kind: CevinActivityKind | null;
      completed?: number;
      total?: number;
    },
    nowMs: number,
  ): void {
    this.state = stepTimingMachine(this.state, {
      phase: input.phase,
      kind: input.kind,
      batchCompleted: input.completed,
      batchTotal: input.total,
      nowMs,
    });
  }

  notifyThinkingLoopIteration(nowMs: number): void {
    this.state = notifyThinkingLoopIteration(this.state, nowMs);
  }

  getViewState(nowMs: number): CevinTimingSnapshot {
    this.state = advanceTimingMachine(this.state, nowMs);
    return this.state;
  }
}
