import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { create } from 'zustand';
import type {
  CevinActivitySnapshot,
  CevinUseCases,
  SidebarConnectionStatus,
} from '../../../core/application';
import {
  advanceTimingMachine,
  createInitialTimingSnapshot,
  notifyThinkingLoopIteration,
  stepTimingMachine,
  type CevinActivityKind,
  type CevinMarkVisualState,
  type CevinTimingSnapshot,
} from '../../../core/domain';

export type PreviewZoom = 'sm' | 'md' | 'lg';

export interface ToastMessage {
  id: string;
  title?: string;
  message?: string;
  variant?: 'info' | 'success' | 'danger' | 'warning';
  tone?: 'danger' | 'info' | 'success' | 'warning';
  actionLabel?: string;
  undoLabel?: string;
  onAction?: () => void;
  onUndo?: () => void;
}

export interface CevinActivityViewState {
  visible: boolean;
  visualState: CevinMarkVisualState;
  label: string;
  announcement: string;
  kind: CevinActivityKind;
  progress?: number;
  batchCompleted?: number;
  batchTotal?: number;
  rawSnapshot: CevinActivitySnapshot;
  handleThinkingLoopIteration: () => void;
}

export const CevinContainerContext = createContext<CevinUseCases | null>(null);

export function useCevinUseCases(): CevinUseCases {
  const ctx = useContext(CevinContainerContext);
  if (!ctx) {
    throw new Error(
      'useCevinUseCases must be used within a CevinContainerContext.Provider',
    );
  }
  return ctx;
}

/**
 * Single hook reading live LLM gateway activity (`idle | thinking | writing | warming`)
 * from the inbound port (`useCases.activity`) and applying the CevinMark timing rules:
 * - Show after 300ms
 * - Hold visible for at least 600ms once shown
 * - Finish current loop on `thinking -> writing` (up to 1.6s)
 * - Play `done` (420ms) only if shown
 */
export function useCevinActivity(): CevinActivityViewState {
  const useCases = useCevinUseCases();
  const [rawSnapshot, setRawSnapshot] = useState<CevinActivitySnapshot>(() =>
    useCases.activity.getSnapshot(),
  );
  const [timing, setTiming] = useState<CevinTimingSnapshot>(() =>
    createInitialTimingSnapshot(),
  );
  const lastAnnouncedPhaseRef = useRef('');
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    setRawSnapshot(useCases.activity.getSnapshot());
    return useCases.activity.subscribe((nextSnap) => {
      setRawSnapshot(nextSnap);
      setTiming((prev) =>
        stepTimingMachine(prev, {
          phase: nextSnap.phase,
          kind: nextSnap.kind,
          batchCompleted: nextSnap.batchCompleted,
          batchTotal: nextSnap.batchTotal,
          nowMs: Date.now(),
        }),
      );
    });
  }, [useCases]);

  useEffect(() => {
    const now = Date.now();
    setTiming((prev) =>
      stepTimingMachine(prev, {
        phase: rawSnapshot.phase,
        kind: rawSnapshot.kind,
        batchCompleted: rawSnapshot.batchCompleted,
        batchTotal: rawSnapshot.batchTotal,
        nowMs: now,
      }),
    );
  }, [
    rawSnapshot.phase,
    rawSnapshot.kind,
    rawSnapshot.batchCompleted,
    rawSnapshot.batchTotal,
  ]);

  useEffect(() => {
    if (
      !(
        timing.pendingShowSinceMs !== null ||
        timing.handoffToWritingRequestedAtMs !== null ||
        timing.doneStartedAtMs !== null ||
        (timing.visible &&
          rawSnapshot.phase === 'idle' &&
          timing.shownAtMs !== null)
      )
    ) {
      return undefined;
    }

    const timer = setInterval(() => {
      setTiming((prev) => advanceTimingMachine(prev, Date.now()));
    }, 60);

    return () => clearInterval(timer);
  }, [
    timing.pendingShowSinceMs,
    timing.handoffToWritingRequestedAtMs,
    timing.doneStartedAtMs,
    timing.visible,
    timing.shownAtMs,
    rawSnapshot.phase,
  ]);

  useEffect(() => {
    const phaseKey = timing.visible
      ? `${timing.visualState}:${timing.kind}`
      : 'idle';
    if (phaseKey !== lastAnnouncedPhaseRef.current) {
      lastAnnouncedPhaseRef.current = phaseKey;
      setAnnouncement(timing.visible ? timing.label : '');
    }
  }, [timing.visible, timing.visualState, timing.kind, timing.label]);

  const handleThinkingLoopIteration = useCallback(() => {
    setTiming((prev) => notifyThinkingLoopIteration(prev, Date.now()));
  }, []);

  return {
    visible: timing.visible,
    visualState: timing.visualState,
    label: timing.label || rawSnapshot.label,
    announcement,
    kind: timing.kind,
    progress: rawSnapshot.progress,
    batchCompleted: rawSnapshot.batchCompleted,
    batchTotal: rawSnapshot.batchTotal,
    rawSnapshot,
    handleThinkingLoopIteration,
  };
}

interface UiState {
  toasts: ToastMessage[];
  addToast: (
    title: string,
    variantOrOptions?:
      | ToastMessage['variant']
      | {
          variant?: ToastMessage['variant'];
          actionLabel?: string;
          onAction?: () => void;
        },
  ) => void;
  dismissToast: (id: string) => void;
  newAppModalOpen: boolean;
  setNewAppModalOpen: (open: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  previewZoom: PreviewZoom;
  setPreviewZoom: (zoom: PreviewZoom) => void;
  connectionStatus: SidebarConnectionStatus;
  setConnectionStatus: (status: SidebarConnectionStatus) => void;
  gettingStartedDismissed: boolean;
  setGettingStartedDismissed: (dismissed: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  addToast: (title, variantOrOptions = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const opts =
      typeof variantOrOptions === 'string'
        ? { variant: variantOrOptions }
        : variantOrOptions;
    const message: ToastMessage = {
      id,
      title,
      variant: opts.variant ?? 'info',
      actionLabel: opts.actionLabel,
      onAction: opts.onAction,
    };
    set((state) => ({ toasts: [...state.toasts, message] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 5000);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
  newAppModalOpen: false,
  setNewAppModalOpen: (open) => set({ newAppModalOpen: open }),
  commandPaletteOpen: false,
  setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),
  previewZoom: 'md',
  setPreviewZoom: (zoom) => set({ previewZoom: zoom }),
  connectionStatus: {
    state: 'demo',
    label: 'Demo mode',
    providerId: 'mock',
    detail: 'Using built-in sample AI responses',
  },
  setConnectionStatus: (status) => set({ connectionStatus: status }),
  gettingStartedDismissed: false,
  setGettingStartedDismissed: (dismissed) =>
    set({ gettingStartedDismissed: dismissed }),
}));
