import { Monitor } from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from 'react-router-dom';
import { CevinUseCases } from '../../../core/application';
import { DocumentKind, StudioStep } from '../../../core/domain';
import {
  CevinContainerContext,
  useCevinUseCases,
  useUiStore,
} from './context';
import { ApplicationsView } from './features/applications/ApplicationsView';
import { BankView } from './features/bank/BankView';
import { DesignSystemView } from './features/design-system/DesignSystemView';
import { SettingsView } from './features/settings/SettingsView';
import { StudioView } from './features/studio/StudioView';
import {
  CommandPalette,
  QuickCheckDialog,
  SidebarNav,
  ToastBanner,
  TooltipProvider,
} from './ui';

function LegacyStudioRedirect() {
  const { id } = useParams<{ id: string }>();
  if (!id) return <Navigate to="/applications" replace />;
  return <Navigate to={`/applications/${id}/studio/resume/build`} replace />;
}

function StudioRouteWrapper() {
  const { id, doc, step } = useParams<{
    id: string;
    doc: string;
    step: string;
  }>();
  const navigate = useNavigate();

  if (!id) {
    return <Navigate to="/applications" replace />;
  }

  const normalizedDoc: DocumentKind =
    doc === 'cover-letter' ? 'coverLetter' : 'resume';

  const validSteps: StudioStep[] = ['job', 'build', 'write', 'review'];
  const normalizedStep: StudioStep = validSteps.includes(step as StudioStep)
    ? (step as StudioStep)
    : normalizedDoc === 'coverLetter'
      ? 'write'
      : 'build';

  return (
    <StudioView
      applicationId={id}
      activeDoc={normalizedDoc}
      activeStep={normalizedStep}
      onNavigateStudio={(nextDoc, nextStep) => {
        const docSlug = nextDoc === 'coverLetter' ? 'cover-letter' : 'resume';
        navigate(`/applications/${id}/studio/${docSlug}/${nextStep}`);
      }}
      onBackToApplications={() => navigate(`/applications/${id}`)}
    />
  );
}

function ApplicationsRouteWrapper() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();

  return (
    <ApplicationsView
      initialSelectedId={id}
      onSelectApplication={(appId) => {
        navigate(`/applications/${appId}`, { replace: true });
      }}
      onOpenStudio={(appId, doc = 'resume', step) => {
        const docSlug = doc === 'coverLetter' ? 'cover-letter' : 'resume';
        const targetStep =
          step ?? (doc === 'coverLetter' ? 'write' : 'build');
        navigate(`/applications/${appId}/studio/${docSlug}/${targetStep}`);
      }}
    />
  );
}

function InnerWorkspace() {
  const useCases = useCevinUseCases();
  const navigate = useNavigate();
  const location = useLocation();

  const toasts = useUiStore((s) => s.toasts);
  const dismissToast = useUiStore((s) => s.dismissToast);
  const addToast = useUiStore((s) => s.addToast);
  const newAppModalOpen = useUiStore((s) => s.newAppModalOpen);
  const setNewAppModalOpen = useUiStore((s) => s.setNewAppModalOpen);
  const commandPaletteOpen = useUiStore((s) => s.commandPaletteOpen);
  const setCommandPaletteOpen = useUiStore((s) => s.setCommandPaletteOpen);
  const connectionStatus = useUiStore((s) => s.connectionStatus);
  const setConnectionStatus = useUiStore((s) => s.setConnectionStatus);
  const setGettingStartedDismissed = useUiStore(
    (s) => s.setGettingStartedDismissed,
  );

  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [autoCollapsedByViewport, setAutoCollapsedByViewport] = useState(false);
  const [studioOverlayExpanded, setStudioOverlayExpanded] = useState(false);
  const [appLinks, setAppLinks] = useState<
    Array<{ id: string; company: string; roleTitle: string }>
  >([]);

  const isStudioRoute = location.pathname.includes('/studio/');

  const applyThemeToDocument = useCallback(
    (nextTheme: 'light' | 'dark' | 'system') => {
      if (typeof document === 'undefined') return;
      const prefersDark =
        typeof window !== 'undefined' &&
        typeof window.matchMedia === 'function' &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const isDark =
        nextTheme === 'dark' || (nextTheme === 'system' && prefersDark);
      document.documentElement.classList.add('scheme-light', 'dark:scheme-dark');
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    },
    [],
  );

  const refreshConnectionStatus = useCallback(async () => {
    const status = await useCases.testLlmConnection.getSidebarStatus();
    setConnectionStatus(status);
  }, [useCases, setConnectionStatus]);

  useEffect(() => {
    void useCases.manageSettings.getSettings().then((s) => {
      applyThemeToDocument(s.theme);
      setSidebarCollapsed(Boolean(s.sidebarCollapsed));
      setGettingStartedDismissed(Boolean(s.gettingStartedDismissed));
    });
    void useCases.manageApplications.listApplications().then((apps) => {
      setAppLinks(
        apps.map((a) => ({
          id: a.id,
          company: a.company,
          roleTitle: a.roleTitle,
        })),
      );
    });
    void refreshConnectionStatus();
  }, [
    useCases,
    applyThemeToDocument,
    refreshConnectionStatus,
    setGettingStartedDismissed,
    location.pathname,
  ]);

  useEffect(() => {
    const onFocus = () => {
      void refreshConnectionStatus();
    };
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, [refreshConnectionStatus]);

  useEffect(() => {
    const checkViewportWidth = () => {
      if (typeof window === 'undefined') return;
      if (isStudioRoute && window.innerWidth < 1700) {
        setAutoCollapsedByViewport(true);
      } else {
        setAutoCollapsedByViewport(false);
        setStudioOverlayExpanded(false);
      }
    };
    checkViewportWidth();
    window.addEventListener('resize', checkViewportWidth);
    return () => window.removeEventListener('resize', checkViewportWidth);
  }, [isStudioRoute]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;
      const key = e.key.toLowerCase();
      if (key === 'k') {
        e.preventDefault();
        setCommandPaletteOpen(!commandPaletteOpen);
      } else if (key === 'n') {
        e.preventDefault();
        setNewAppModalOpen(true);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [commandPaletteOpen, setCommandPaletteOpen, setNewAppModalOpen]);

  const handleToggleCollapse = async () => {
    if (autoCollapsedByViewport) {
      setStudioOverlayExpanded((prev) => !prev);
      return;
    }
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    await useCases.manageSettings.saveSettings({ sidebarCollapsed: next });
  };

  const handleToggleTheme = async () => {
    const current = await useCases.manageSettings.getSettings();
    const nextTheme = current.theme === 'dark' ? 'light' : 'dark';
    await useCases.manageSettings.saveSettings({ theme: nextTheme });
    applyThemeToDocument(nextTheme);
  };

  const activeNavSection: 'applications' | 'bank' | 'settings' | 'design-system' =
    location.pathname.startsWith('/bank')
      ? 'bank'
      : location.pathname.startsWith('/settings')
        ? 'settings'
        : location.pathname.startsWith('/design-system')
          ? 'design-system'
          : 'applications';

  const effectiveCollapsed = sidebarCollapsed || autoCollapsedByViewport;

  return (
    <TooltipProvider>
      {/* Below 1024px friendly notice */}
      <div className="flex lg:hidden min-h-screen items-center justify-center p-8 bg-canvas text-ink scheme-light dark:scheme-dark">
        <div className="max-w-md bg-surface border border-border rounded-xl p-6 text-center space-y-3 shadow-md">
          <Monitor className="w-8 h-8 text-accent mx-auto" />
          <h1 className="text-lg font-display font-semibold text-ink">
            Cevin is designed for larger screens
          </h1>
          <p className="text-sm text-ink-muted leading-relaxed">
            Tailoring a resume or cover letter side-by-side with a live document preview works best on a desktop or laptop monitor (1024px and wider).
          </p>
        </div>
      </div>

      {/* Desktop 1024px+ Workspace with Single Labeled Sidebar (No Top Bar) */}
      <div className="hidden lg:flex min-h-screen bg-canvas text-ink scheme-light dark:scheme-dark">
        <SidebarNav
          activeSection={activeNavSection}
          collapsed={effectiveCollapsed}
          overlayExpanded={autoCollapsedByViewport && studioOverlayExpanded}
          onCloseOverlay={() => setStudioOverlayExpanded(false)}
          onToggleCollapsed={() => void handleToggleCollapse()}
          onNavigate={(path) => {
            setStudioOverlayExpanded(false);
            navigate(path);
          }}
          onNewApplication={() => setNewAppModalOpen(true)}
          onOpenCommandPalette={() => setCommandPaletteOpen(true)}
          connectionStatus={connectionStatus}
        />

        <div className="flex-1 min-w-0 flex flex-col">
          <main className="flex-1 px-8 py-6 max-w-[160rem] w-full mx-auto">
            <Routes>
              <Route
                path="/"
                element={<Navigate to="/applications" replace />}
              />
              <Route
                path="/applications"
                element={<ApplicationsRouteWrapper />}
              />
              <Route
                path="/applications/:id"
                element={<ApplicationsRouteWrapper />}
              />
              <Route
                path="/applications/:id/studio/:doc/:step"
                element={<StudioRouteWrapper />}
              />
              <Route path="/studio/:id" element={<LegacyStudioRedirect />} />
              <Route path="/bank" element={<BankView />} />
              <Route
                path="/settings"
                element={
                  <SettingsView
                    onThemeChange={applyThemeToDocument}
                    onConnectionChanged={() => void refreshConnectionStatus()}
                  />
                }
              />
              <Route path="/design-system" element={<DesignSystemView />} />
            </Routes>
          </main>
        </div>
      </div>

      {/* Global Quick Check & New Application Modal (⌘N) */}
      <QuickCheckDialog
        open={newAppModalOpen}
        onOpenChange={setNewAppModalOpen}
        onEvaluate={(params) => useCases.quickCheck.evaluate(params)}
        onStartTailoring={async (params) => {
          const created =
            await useCases.quickCheck.startTailoringFromQuickCheck(params);
          setNewAppModalOpen(false);
          addToast(
            `Started tailoring for ${created.company}`,
            'success',
          );
          navigate(`/applications/${created.id}/studio/resume/build`);
        }}
        onSaveAsProspect={async (params) => {
          const created =
            await useCases.quickCheck.saveAsProspect(params);
          setNewAppModalOpen(false);
          addToast(
            `Saved ${created.company} as a prospect`,
            'info',
          );
          navigate(`/applications/${created.id}`);
        }}
      />

      {/* Command Palette (Ctrl/⌘+K) */}
      <CommandPalette
        open={commandPaletteOpen}
        onOpenChange={setCommandPaletteOpen}
        applications={appLinks}
        onNavigate={(path) => navigate(path)}
        onNewApplication={() => setNewAppModalOpen(true)}
        onToggleTheme={() => void handleToggleTheme()}
      />

      <ToastBanner toasts={toasts} onDismiss={dismissToast} />
    </TooltipProvider>
  );
}

export function CevinWebApp({ useCases }: { useCases: CevinUseCases }) {
  return (
    <CevinContainerContext.Provider value={useCases}>
      <InnerWorkspace />
    </CevinContainerContext.Provider>
  );
}
