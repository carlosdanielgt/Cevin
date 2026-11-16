import {
  Check,
  Cpu,
  Database,
  Download,
  Gauge as GaugeIcon,
  HelpCircle,
  Monitor,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AppSettings,
  ConnectionDiagnosticResult,
  ModelInfo,
  PerformanceSummary,
} from '../../../../../core/application';
import {
  PageSize,
  TemplateId,
  UserPreferences,
  VoiceLevel,
} from '../../../../../core/domain';
import { useCevinUseCases, useUiStore } from '../../context';
import {
  Badge,
  Banner,
  Button,
  CevinStatusIndicator,
  ConfirmDialog,
  CopyCommandField,
  Disclosure,
  Input,
  SegmentedControl,
} from '../../ui/primitives';
import {
  PageHeader,
  PageThumbnail,
  PreferencesForm,
  VoiceControl,
} from '../../ui/signatures';

function triggerJsonDownload(jsonStr: string, fileName: string) {
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

type SettingsSectionId =
  | 'preferences'
  | 'ai'
  | 'performance'
  | 'appearance'
  | 'data'
  | 'about';

export function SettingsView({
  onThemeChange,
  onConnectionChanged,
}: {
  onThemeChange: (theme: 'light' | 'dark' | 'system') => void;
  onConnectionChanged: () => void;
}) {
  const useCases = useCevinUseCases();
  const addToast = useUiStore((s) => s.addToast);

  const [activeSection, setActiveSection] =
    useState<SettingsSectionId>('preferences');
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [diag, setDiag] = useState<ConnectionDiagnosticResult | null>(null);
  const [perfSummary, setPerfSummary] = useState<PerformanceSummary | null>(
    null,
  );
  const [isTesting, setIsTesting] = useState(false);
  const [isSwitchingModel, setIsSwitchingModel] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState('');
  const [calibrationStepIndex, setCalibrationStepIndex] = useState(0);
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  const mlxProviderMeta = useCases.listLlmProviders
    .execute()
    .find((p) => p.id === 'mlx-fastapi');
  const catalogModels: ModelInfo[] = mlxProviderMeta?.supportedModels ?? [];

  const loadAll = useCallback(async () => {
    const [loadedSettings, summary, loadedPrefs] = await Promise.all([
      useCases.manageSettings.getSettings(),
      useCases.performance.getPerformanceSummary(),
      useCases.managePreferences.getPreferences(),
    ]);
    setSettings(loadedSettings);
    setPerfSummary(summary);
    setPreferences(loadedPrefs);
    const d = await useCases.testLlmConnection.execute(
      loadedSettings.activeProviderId,
    );
    setDiag(d);
  }, [useCases]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  if (!settings || !preferences) {
    return <div className="p-8 text-sm text-ink-muted">Loading settings…</div>;
  }

  const updateSettings = async (partial: Partial<AppSettings>) => {
    const saved = await useCases.manageSettings.saveSettings(partial);
    setSettings(saved);
    if (partial.theme) {
      onThemeChange(partial.theme);
    }
    if (partial.activeProviderId || partial.providerConfigs) {
      const d = await useCases.testLlmConnection.execute(
        saved.activeProviderId,
      );
      setDiag(d);
      onConnectionChanged();
    }
  };

  const handleTestConnection = async () => {
    setIsTesting(true);
    const d = await useCases.testLlmConnection.execute(
      settings.activeProviderId,
    );
    setDiag(d);
    setIsTesting(false);
    onConnectionChanged();
    addToast(d.headline, d.connected ? 'success' : 'warning');
  };

  const handleCalibrate = async () => {
    setIsCalibrating(true);
    setCalibrationStep('Cevin is checking');
    setCalibrationStepIndex(1);
    let stepCounter = 1;
    const res = await useCases.performance.runCalibration((label) => {
      stepCounter = Math.min(4, stepCounter + 1);
      setCalibrationStepIndex(stepCounter);
      setCalibrationStep(label);
    });
    setIsCalibrating(false);
    setCalibrationStep('');
    setCalibrationStepIndex(0);
    if (res.ok) {
      await loadAll();
      addToast(
        `Calibrated: ${res.value.readingSpeedTokPerSec} tok/s read, ${res.value.writingSpeedTokPerSec} tok/s write.`,
        'success',
      );
    }
  };

  const handleSelectModel = async (modelId: string) => {
    setIsSwitchingModel(true);
    try {
      const d = await useCases.testLlmConnection.selectModel(
        'mlx-fastapi',
        modelId,
      );
      const nextSettings = await useCases.manageSettings.getSettings();
      setSettings(nextSettings);
      setDiag(d);
      onConnectionChanged();
      const targetName =
        catalogModels.find((m) => m.id === modelId)?.name ?? modelId;
      addToast(
        d.connected
          ? `Switched active model to ${targetName}.`
          : `Selected ${targetName}. Start the local server to connect.`,
        d.connected ? 'success' : 'info',
      );
    } finally {
      setIsSwitchingModel(false);
    }
  };

  const mlxConfig = (settings.providerConfigs['mlx-fastapi'] ?? {
    baseUrl: 'http://localhost:8000',
    model: 'Qwen2.5-1.5B-Instruct-4bit',
    maxSeqLength: 1024,
  }) as { baseUrl?: string; model?: string; maxSeqLength?: number };

  const activeMlxModel = mlxConfig.model || 'Qwen2.5-1.5B-Instruct-4bit';
  const modelOptions: ModelInfo[] = (() => {
    const byId = new Map<string, ModelInfo>();
    for (const m of catalogModels) {
      byId.set(m.id, m);
    }
    if (diag?.connected) {
      for (const live of diag.models) {
        const existing = byId.get(live.id);
        byId.set(live.id, existing ? { ...existing, ...live } : live);
      }
    }
    return Array.from(byId.values());
  })();
  const selectedModelMeta = modelOptions.find(
    (m) => m.id === activeMlxModel || m.name === activeMlxModel,
  );
  const formatApproxGb = (gb: number) =>
    `~${(Math.round(gb * 10) / 10).toFixed(1)} GB`;
  const activeMemoryLabel =
    settings.activeProviderId === 'mock'
      ? '0 GB'
      : selectedModelMeta?.estimatedMemoryGb
        ? formatApproxGb(selectedModelMeta.estimatedMemoryGb)
        : activeMlxModel.toLowerCase().includes('3b')
          ? '~2.7 GB'
          : '~1.2 GB';

  const isMlxSelected = settings.activeProviderId !== 'mock';

  const navItems: Array<{
    id: SettingsSectionId;
    label: string;
    icon: React.ReactNode;
  }> = [
    {
      id: 'preferences',
      label: 'My preferences',
      icon: <Sliders className="w-4 h-4" />,
    },
    { id: 'ai', label: 'AI connection', icon: <Cpu className="w-4 h-4" /> },
    {
      id: 'performance',
      label: 'Performance',
      icon: <GaugeIcon className="w-4 h-4" />,
    },
    {
      id: 'appearance',
      label: 'Appearance',
      icon: <Sun className="w-4 h-4" />,
    },
    {
      id: 'data',
      label: 'Your data',
      icon: <Database className="w-4 h-4" />,
    },
    {
      id: 'about',
      label: 'Help & about',
      icon: <HelpCircle className="w-4 h-4" />,
    },
  ];

  const scrollToSection = (id: SettingsSectionId) => {
    setActiveSection(id);
    const el = document.getElementById(`settings-${id}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  return (
    <div className="space-y-6 pb-16">
      <PageHeader title="Settings" />

      {/* Two-Column Layout at >=1280px */}
      <div className="xl:grid xl:grid-cols-12 xl:gap-8 items-start space-y-6 xl:space-y-0">
        {/* Left Sticky Section Nav (200px / 3 cols) */}
        <aside className="xl:col-span-3 xl:sticky xl:top-6 bg-surface border border-border rounded-xl p-2 shadow-xs">
          <nav aria-label="Settings sections" className="space-y-1">
            {navItems.map((item) => {
              const active = activeSection === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollToSection(item.id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-md text-xs font-medium transition-colors cursor-pointer ${
                    active
                      ? 'bg-accent-50 text-accent-700 font-semibold'
                      : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
                  }`}
                >
                  <span className={active ? 'text-accent' : 'text-ink-subtle'}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Right Content Column (max-w-760px / 9 cols) */}
        <div className="xl:col-span-9 max-w-[760px] space-y-6">
          {/* 0. My Preferences (Job Facts & Practical Fit) */}
          <section
            id="settings-preferences"
            className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-5"
          >
            <div>
              <h2 className="text-base font-display font-semibold text-ink">
                My preferences
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Used to check job postings for practical fit (location, work permits, languages, compensation, and contract type).
              </p>
            </div>

            <PreferencesForm
              preferences={preferences}
              onSave={async (next) => {
                const saved =
                  await useCases.managePreferences.savePreferences(next);
                setPreferences(saved);
                addToast('Saved your preferences.', 'success');
              }}
            />
          </section>

          {/* 1. AI Connection */}
          <section
            id="settings-ai"
            className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-display font-semibold text-ink">
                  AI connection
                </h2>
              </div>
              <Badge
                tone={
                  settings.activeProviderId === 'mock' || diag?.connected
                    ? 'success'
                    : 'warning'
                }
              >
                {settings.activeProviderId === 'mock'
                  ? 'Demo mode'
                  : diag?.connected
                    ? 'Model ready'
                    : "Can't reach the model"}
              </Badge>
            </div>

            {/* 2 Cards Only: Cevin model (on this Mac) and Demo mode */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() =>
                  void updateSettings({ activeProviderId: 'mlx-fastapi' })
                }
                className={`relative p-4 rounded-lg border text-left transition-all cursor-pointer ${
                  isMlxSelected
                    ? 'border-accent ring-2 ring-accent bg-accent-50/60'
                    : 'border-border bg-surface hover:border-border-strong'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-md bg-surface-sunken flex items-center justify-center text-accent">
                    <Cpu className="w-4 h-4" />
                  </div>
                  {isMlxSelected && (
                    <span className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-ink">
                  Cevin model (on this Mac)
                </div>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Fine-tuned for resume writing. Runs on this Mac (Apple Silicon).
                </p>
              </button>

              <button
                type="button"
                onClick={() =>
                  void updateSettings({ activeProviderId: 'mock' })
                }
                className={`relative p-4 rounded-lg border text-left transition-all cursor-pointer ${
                  settings.activeProviderId === 'mock'
                    ? 'border-accent ring-2 ring-accent bg-accent-50/60'
                    : 'border-border bg-surface hover:border-border-strong'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-md bg-surface-sunken flex items-center justify-center text-accent">
                    <Sparkles className="w-4 h-4" />
                  </div>
                  {settings.activeProviderId === 'mock' && (
                    <span className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-ink">
                  Demo mode
                </div>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Works immediately in any browser with sample responses.
                </p>
              </button>
            </div>

            {/* Integrated MLX Model Switcher (visible when local MLX provider is selected) */}
            {isMlxSelected && modelOptions.length > 0 && (
              <div className="space-y-2.5 pt-1">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <div className="text-xs font-semibold text-ink">
                      Local model
                    </div>
                    <p className="text-xs text-ink-muted">
                      Switch between integrated Apple Silicon models without restarting your workspace.
                    </p>
                  </div>
                  {isSwitchingModel && (
                    <CevinStatusIndicator
                      state="thinking"
                      size={16}
                      variant="glyph"
                      label="Switching model"
                    />
                  )}
                </div>
                <div
                  role="radiogroup"
                  aria-label="Local model selection"
                  className="grid grid-cols-1 md:grid-cols-2 gap-3"
                >
                  {modelOptions.map((model) => {
                    const selected =
                      activeMlxModel === model.id ||
                      activeMlxModel === model.name;
                    const memLabel = model.estimatedMemoryGb
                      ? `${formatApproxGb(model.estimatedMemoryGb)} RAM`
                      : undefined;
                    return (
                      <button
                        key={model.id}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        disabled={isSwitchingModel}
                        onClick={() => void handleSelectModel(model.id)}
                        className={`p-3.5 rounded-lg border text-left transition-all cursor-pointer disabled:opacity-60 ${
                          selected
                            ? 'border-accent ring-2 ring-accent bg-accent-50/50'
                            : 'border-border bg-surface hover:border-border-strong'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-semibold text-ink">
                                {model.name}
                              </span>
                              {model.isDefault && (
                                <Badge tone="info">Default</Badge>
                              )}
                            </div>
                            <div className="text-[11px] font-mono text-ink-subtle mt-0.5 truncate">
                              {model.id}
                            </div>
                          </div>
                          {selected && (
                            <span className="w-4 h-4 rounded-full bg-accent text-white flex items-center justify-center shrink-0 mt-0.5">
                              <Check className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>
                        {model.description && (
                          <p className="text-xs text-ink-muted mt-1.5 leading-snug">
                            {model.description}
                          </p>
                        )}
                        {(model.parameterSize || memLabel) && (
                          <div className="flex flex-wrap items-center gap-2 mt-2 text-[11px] text-ink-subtle tabular-nums">
                            {model.parameterSize && (
                              <span>{model.parameterSize}</span>
                            )}
                            {model.parameterSize && memLabel && <span>·</span>}
                            {memLabel && <span>{memLabel}</span>}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tinted Banner for Status */}
            {settings.activeProviderId === 'mock' ? (
              <Banner tone="success" title="Demo mode is active">
                All features work immediately without running a local model server.
              </Banner>
            ) : diag?.connected ? (
              <Banner
                tone="success"
                title={diag.headline}
                actions={
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isTesting}
                    onClick={() => void handleTestConnection()}
                  >
                    {isTesting ? (
                      <CevinStatusIndicator
                        state="thinking"
                        size={16}
                        variant="glyph"
                        label="Cevin is checking"
                      />
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Test connection</span>
                      </>
                    )}
                  </Button>
                }
              >
                {diag.details}
              </Banner>
            ) : (
              <Banner
                tone="warning"
                title={
                  diag?.headline ??
                  `Can't reach the Cevin model at ${mlxConfig.baseUrl ?? 'http://localhost:8000'}.`
                }
                actions={
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isTesting}
                      onClick={() => void handleTestConnection()}
                    >
                      {isTesting ? (
                        <CevinStatusIndicator
                          state="thinking"
                          size={16}
                          variant="glyph"
                          label="Cevin is checking"
                        />
                      ) : (
                        <>
                          <RefreshCw className="w-3.5 h-3.5" />
                          <span>Test connection</span>
                        </>
                      )}
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void updateSettings({ activeProviderId: 'mock' })
                      }
                    >
                      <span>Use demo mode</span>
                    </Button>
                  </div>
                }
              >
                <div className="space-y-2.5 mt-1">
                  <p>
                    {diag?.details ??
                      'Start the Cevin model server in your project directory inside your Python virtual environment (.venv).'}
                  </p>
                  <CopyCommandField
                    command={
                      diag?.remediationCommand ??
                      'uvicorn mlx_server:app --host 127.0.0.1 --port 8000'
                    }
                  />
                </div>
              </Banner>
            )}
          </section>

          {/* 2. Performance */}
          <section
            id="settings-performance"
            className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <h2 className="text-base font-display font-semibold text-ink">
                  Performance
                </h2>
                <p className="text-xs text-ink-muted mt-0.5">
                  Speed and memory on this Mac.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isCalibrating}
                  onClick={() => void handleCalibrate()}
                  title={calibrationStep || 'Measure speed on this Mac'}
                >
                  {isCalibrating ? (
                    <CevinStatusIndicator
                      state="thinking"
                      size={16}
                      variant="glyph"
                      progress={calibrationStepIndex / 4}
                      label="Cevin is checking"
                    />
                  ) : (
                    'Measure speed (~15s)'
                  )}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={async () => {
                    await useCases.performance.clearResultCache();
                    await loadAll();
                    addToast('Cleared response cache.', 'info');
                  }}
                >
                  Clear cache
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg bg-surface-sunken border border-hairline">
                <span className="text-xs text-ink-muted block">Speed</span>
                {settings.activeProviderId === 'mock' ? (
                  <span className="text-xs font-medium text-ink-muted block mt-1">
                    Demo mode (instant)
                  </span>
                ) : (perfSummary?.writingSpeedTokPerSec ?? 0) > 0 ? (
                  <>
                    <span className="text-lg font-display font-bold tabular-nums text-ink">
                      {perfSummary!.writingSpeedTokPerSec} tok/s
                    </span>
                    <span className="text-[11px] text-ink-subtle block tabular-nums">
                      Read {perfSummary!.readingSpeedTokPerSec} tok/s on this Mac
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-ink-muted block mt-1">
                    Not measured yet
                  </span>
                )}
              </div>
              <div className="p-3.5 rounded-lg bg-surface-sunken border border-hairline">
                <span className="text-xs text-ink-muted block">Memory</span>
                <span className="text-lg font-display font-bold tabular-nums text-ink">
                  {activeMemoryLabel}
                </span>
                <span className="text-[11px] text-ink-subtle block">
                  {settings.activeProviderId === 'mock'
                    ? 'In-browser demo'
                    : `4-bit Apple Silicon (${selectedModelMeta?.name ?? activeMlxModel})`}
                </span>
              </div>
              <div className="p-3.5 rounded-lg bg-surface-sunken border border-hairline">
                <span className="text-xs text-ink-muted block">
                  Response cache
                </span>
                {(perfSummary?.totalCalls ?? 0) > 0 ? (
                  <>
                    <span className="text-lg font-display font-bold tabular-nums text-ink">
                      {perfSummary!.cacheHits} / {perfSummary!.totalCalls}
                    </span>
                    <span className="text-[11px] text-ink-subtle block">
                      Saved responses reused
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-ink-muted block mt-1">
                    No saved responses yet
                  </span>
                )}
              </div>
            </div>

            <Disclosure title="Model server address">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-ink-muted mb-1">
                    Server URL
                  </label>
                  <Input
                    value={mlxConfig.baseUrl ?? 'http://localhost:8000'}
                    onChange={(e) =>
                      void updateSettings({
                        providerConfigs: {
                          ...settings.providerConfigs,
                          'mlx-fastapi': {
                            ...mlxConfig,
                            baseUrl: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">
                    Model name
                  </label>
                  <Input
                    value={mlxConfig.model ?? 'Qwen2.5-1.5B-Instruct-4bit'}
                    placeholder="Qwen2.5-1.5B-Instruct-4bit"
                    onChange={(e) =>
                      void updateSettings({
                        providerConfigs: {
                          ...settings.providerConfigs,
                          'mlx-fastapi': {
                            ...mlxConfig,
                            model: e.target.value,
                          },
                        },
                      })
                    }
                  />
                </div>
              </div>
            </Disclosure>
          </section>

          {/* 3. Appearance & Defaults */}
          <section
            id="settings-appearance"
            className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-6"
          >
            <div>
              <h2 className="text-base font-display font-semibold text-ink">
                Appearance & defaults
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Choose your workspace theme, paper size, default template, and
                default writing voice.
              </p>
            </div>

            {/* 3 Theme Mini-Preview Tiles */}
            <div className="space-y-2">
              <label className="block text-xs font-semibold text-ink">
                Workspace theme
              </label>
              <div className="grid grid-cols-3 gap-3">
                {[
                  {
                    id: 'light' as const,
                    label: 'Light (Warm stone)',
                    icon: <Sun className="w-4 h-4" />,
                  },
                  {
                    id: 'dark' as const,
                    label: 'Dark (Carbon slate)',
                    icon: <Moon className="w-4 h-4" />,
                  },
                  {
                    id: 'system' as const,
                    label: 'System',
                    icon: <Monitor className="w-4 h-4" />,
                  },
                ].map((t) => {
                  const selected = settings.theme === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => void updateSettings({ theme: t.id })}
                      className={`p-3 rounded-lg border text-left transition-all cursor-pointer ${
                        selected
                          ? 'border-accent ring-2 ring-accent bg-accent-50/50'
                          : 'border-border bg-surface hover:border-border-strong'
                      }`}
                    >
                      <div
                        className={`h-10 rounded-xs border mb-2.5 flex overflow-hidden ${
                          t.id === 'dark'
                            ? 'bg-ink-950 border-ink-800'
                            : 'bg-canvas border-hairline'
                        }`}
                      >
                        <div className="w-3 bg-sidebar h-full" />
                        <div className="flex-1 p-1.5 flex items-center justify-center">
                          <div className="w-8 h-5 rounded-xs bg-paper shadow-xs" />
                        </div>
                      </div>
                      <div className="flex items-center justify-between text-xs font-medium text-ink">
                        <span className="inline-flex items-center gap-1.5">
                          {t.icon}
                          <span>{t.label}</span>
                        </span>
                        {selected && <Check className="w-3.5 h-3.5 text-accent" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Paper Size Control (Letter vs A4) */}
            <div className="flex flex-wrap items-center justify-between gap-4 pt-4 border-t border-hairline">
              <div>
                <div className="text-xs font-semibold text-ink">Page size</div>
                <p className="text-xs text-ink-muted">
                  Sets the physical paper proportions on the Studio desk and PDF
                  export.
                </p>
              </div>
              <SegmentedControl<PageSize>
                ariaLabel="Page size"
                value={settings.pageSize ?? 'letter'}
                onValueChange={(nextSize) =>
                  void updateSettings({ pageSize: nextSize })
                }
                options={[
                  { value: 'letter', label: 'US Letter (8.5 × 11 in)' },
                  { value: 'a4', label: 'A4 (210 × 297 mm)' },
                ]}
              />
            </div>

            {/* Default Template Cards with Real Scaled PageThumbnails */}
            <div className="space-y-2.5 pt-4 border-t border-hairline">
              <label className="block text-xs font-semibold text-ink">
                Default resume template
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                {(
                  [
                    {
                      id: 'classic' as TemplateId,
                      name: 'Classic',
                      desc: 'Editorial serif headings with single-column flow.',
                    },
                    {
                      id: 'modern' as TemplateId,
                      name: 'Modern',
                      desc: 'Crisp sans-serif hierarchy with cobalt accents.',
                    },
                    {
                      id: 'compact' as TemplateId,
                      name: 'Compact',
                      desc: 'High-density layout for 10+ years of experience.',
                    },
                  ] as const
                ).map((tpl) => {
                  const selected = settings.defaultTemplateId === tpl.id;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() =>
                        void updateSettings({ defaultTemplateId: tpl.id })
                      }
                      className={`p-3.5 rounded-lg border text-left transition-all flex flex-col items-center gap-3 cursor-pointer ${
                        selected
                          ? 'border-accent ring-2 ring-accent bg-accent-50/40'
                          : 'border-border bg-surface hover:border-border-strong'
                      }`}
                    >
                      <PageThumbnail templateId={tpl.id} size="sm" />
                      <div className="w-full">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-ink">
                            {tpl.name}
                          </span>
                          {selected && (
                            <Check className="w-3.5 h-3.5 text-accent" />
                          )}
                        </div>
                        <p className="text-xs text-ink-muted mt-0.5 leading-snug">
                          {tpl.desc}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Default Writing Voice Dial */}
            <div className="pt-4 border-t border-hairline">
              <VoiceControl
                value={settings.defaultVoice ?? 'balanced'}
                onChange={(v: VoiceLevel) =>
                  void updateSettings({ defaultVoice: v })
                }
                machineMadeScore={18}
              />
            </div>
          </section>

          {/* 4. Your Data (Local-first IndexedDB) */}
          <section
            id="settings-data"
            className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-5"
          >
            <div className="flex items-start gap-3">
              <ShieldCheck className="w-5 h-5 text-success shrink-0 mt-0.5" />
              <div className="space-y-1">
                <h2 className="text-base font-display font-semibold text-ink">
                  Your data stays in your browser
                </h2>
                <p className="text-xs text-ink-muted leading-relaxed">
                  Cevin stores your Experience Bank, applications, document
                  versions, and settings locally in your browser’s IndexedDB
                  database. Nothing is uploaded to external servers.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={async () => {
                  const json = await useCases.manageBank.exportAllDataJson();
                  triggerJsonDownload(json, 'cevin-workspace-backup.json');
                  addToast('Exported JSON backup.', 'success');
                }}
              >
                <Download className="w-4 h-4" />
                <span>Export backup (.json)</span>
              </Button>

              <input
                ref={jsonInputRef}
                type="file"
                accept=".json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    const text = await file.text();
                    const res =
                      await useCases.manageBank.importAllDataJson(text);
                    if (res.ok) {
                      addToast(
                        'Restored workspace from JSON backup.',
                        'success',
                      );
                      void loadAll();
                    } else {
                      addToast(res.error.message, 'danger');
                    }
                  } catch {
                    addToast('Failed to read JSON backup file.', 'danger');
                  }
                  e.target.value = '';
                }}
              />

              <Button
                variant="secondary"
                onClick={() => jsonInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                <span>Import backup (.json)</span>
              </Button>

              <Button
                variant="secondary"
                onClick={async () => {
                  await useCases.manageBank.loadDemoWorkspace();
                  addToast('Reloaded sample workspace.', 'success');
                }}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Reload sample workspace</span>
              </Button>
            </div>

            {/* Visually separated Danger Zone in tinted danger-50 container */}
            <div className="p-4 rounded-lg bg-danger-50 border border-danger/25 flex flex-wrap items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="text-xs font-semibold text-danger-700">
                  Danger zone
                </div>
                <p className="text-xs text-ink-muted">
                  Permanently delete all local Experience Bank items,
                  applications, and saved versions from this browser.
                </p>
              </div>
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => setWipeDialogOpen(true)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete all local data…</span>
              </Button>
            </div>
          </section>

          {/* 5. Help & About */}
          <section
            id="settings-about"
            className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-2"
          >
            <h2 className="text-base font-display font-semibold text-ink">
              Help & about
            </h2>
            <p className="text-xs text-ink-muted leading-relaxed">
              Cevin is a local-first resume and cover-letter tailoring studio.
              Every generated bullet and paragraph traces directly to your
              Experience Bank so your applications stay accurate, verifiable,
              and human.
            </p>
          </section>
        </div>
      </div>

      <ConfirmDialog
        open={wipeDialogOpen}
        onOpenChange={setWipeDialogOpen}
        title="Delete all local data?"
        description="This permanently erases your Experience Bank, applications, and saved versions from this browser."
        confirmLabel="Delete everything"
        requireTypedText="DELETE"
        onConfirm={async () => {
          await useCases.manageBank.wipeAllData();
          setWipeDialogOpen(false);
          addToast('Cleared all local data.', 'info');
        }}
      />
    </div>
  );
}
