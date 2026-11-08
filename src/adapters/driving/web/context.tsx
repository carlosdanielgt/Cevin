import React, { createContext, useContext } from 'react';
import { create } from 'zustand';
import { CevinUseCases, SidebarConnectionStatus } from '../../../core/application';
import { ToastMessage } from './ui';

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

interface ToastOptions {
  variant?: ToastMessage['variant'];
  actionLabel?: string;
  onAction?: () => void;
}

interface UiState {
  toasts: ToastMessage[];
  addToast: (
    title: string,
    variantOrOptions?: ToastMessage['variant'] | ToastOptions,
  ) => void;
  dismissToast: (id: string) => void;
  newAppModalOpen: boolean;
  setNewAppModalOpen: (open: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (open: boolean) => void;
  previewZoom: 'sm' | 'md' | 'lg';
  setPreviewZoom: (zoom: 'sm' | 'md' | 'lg') => void;
  connectionStatus: SidebarConnectionStatus;
  setConnectionStatus: (status: SidebarConnectionStatus) => void;
  gettingStartedDismissed: boolean;
  setGettingStartedDismissed: (dismissed: boolean) => void;
}

export const useUiStore = create<UiState>((set) => ({
  toasts: [],
  addToast: (title, variantOrOptions = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const opts: ToastOptions =
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
    set((state) => ({
      toasts: [...state.toasts, message],
    }));
    setTimeout(() => {
      set((state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }));
    }, 5000);
  },
  dismissToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
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
