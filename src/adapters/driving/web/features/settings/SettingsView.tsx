import {
  Check,
  Cpu,
  Database,
  Download,
  Flame,
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
} from 'lucide-react';
import React, { useCallback, useEffect, useState } from 'react';
import {
  AppSettings,
  ConnectionDiagnosticResult,
  PerformanceSummary,
} from '../../../../../core/application';
import {
  PageSize,
  TemplateId,
  UserPreferences,
  VoiceLevel,
  RECOMMENDED_OLLAMA_ENV,
} from '../../../../../core/domain';
import { useCevinUseCases, useUiStore } from '../../context';
import {
  Badge,
  Banner,
  Button,
  ConfirmDialog,
  CopyCommandField,
  Disclosure,
  Input,
  SegmentedControl,
  Switch,
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
  const [isWarming, setIsWarming] = useState(false);
  const [isCalibrating, setIsCalibrating] = useState(false);
  const [calibrationStep, setCalibrationStep] = useState('');
  const [wipeDialogOpen, setWipeDialogOpen] = useState(false);

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

  const handleWarmUp = async () => {
    setIsWarming(true);
    onConnectionChanged();
    await useCases.performance.warmUp(settings.defaultVoice ?? 'balanced');
    setIsWarming(false);
    onConnectionChanged();
    const summary = await useCases.performance.getPerformanceSummary();
    setPerfSummary(summary);
    addToast('Model warmed in memory.', 'success');
  };

  const handleCalibrate = async () => {
    setIsCalibrating(true);
    setCalibrationStep('Starting calibration…');
    const res = await useCases.performance.runCalibration((label) => {
      setCalibrationStep(label);
    });
    setIsCalibrating(false);
    setCalibrationStep('');
    if (res.ok) {
      await loadAll();
      addToast(
        `Calibrated: ${res.value.readingSpeedTokPerSec} tok/s read, ${res.value.writingSpeedTokPerSec} tok/s write.`,
        'success',
      );
    }
  };

  const ollamaConfig = (settings.providerConfigs.ollama ?? {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.1:8b',
  }) as { baseUrl?: string; model?: string; embeddingModel?: string };

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
      <PageHeader
        title="Settings"
        subtitle="Configure your practical job preferences, local AI assistant, appearance, paper size, and browser-stored data."
      />

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
                <p className="text-xs text-ink-muted mt-0.5">
                  Tuned for <strong>llama3.1:8b</strong>
                </p>
              </div>
              <Badge
                tone={
                  settings.activeProviderId === 'mock' || diag?.connected
                    ? 'success'
                    : 'warning'
                }
              >
                {settings.activeProviderId === 'mock'
                  ? 'Demo mode active'
                  : diag?.connected
                    ? `Connected · ${ollamaConfig.model ?? 'llama3.1:8b'}`
                    : 'Ollama unreachable'}
              </Badge>
            </div>

            {/* 2 Radio Cards with Lucide Icon, 2px accent ring + check badge + accent-50 tint when selected */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <button
                type="button"
                onClick={() =>
                  void updateSettings({ activeProviderId: 'ollama' })
                }
                className={`relative p-4 rounded-lg border text-left transition-all cursor-pointer ${
                  settings.activeProviderId === 'ollama'
                    ? 'border-accent ring-2 ring-accent bg-accent-50/60'
                    : 'border-border bg-surface hover:border-border-strong'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="w-8 h-8 rounded-md bg-surface-sunken flex items-center justify-center text-accent">
                    <Cpu className="w-4 h-4" />
                  </div>
                  {settings.activeProviderId === 'ollama' && (
                    <span className="w-5 h-5 rounded-full bg-accent text-white flex items-center justify-center">
                      <Check className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <div className="text-sm font-semibold text-ink">
                  Local AI via Ollama
                </div>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Connects directly to Ollama on your computer for private,
                  zero-cloud bullet rephrasing.
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
                  Built-in demo mode (no setup)
                </div>
                <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                  Works immediately in any browser with zero network setup.
                </p>
              </button>
            </div>

            {/* Tinted Banner for Status */}
            {settings.activeProviderId === 'mock' ? (
              <Banner tone="success" title="Built-in demo mode is ready">
                All features work immediately without running a local server.
              </Banner>
            ) : diag?.connected ? (
              <Banner
                tone="success"
                title={diag.headline}
                actions={
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isTesting}
                      onClick={() => void handleTestConnection()}
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Test connection</span>
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={isWarming}
                      onClick={() => void handleWarmUp()}
                    >
                      <Flame className="w-3.5 h-3.5 text-accent" />
                      <span>{isWarming ? 'Warming…' : 'Warm up now'}</span>
                    </Button>
                  </div>
                }
              >
                {diag.details}
              </Banner>
            ) : (
              <Banner
                tone="warning"
                title={diag?.headline ?? "Can't reach local Ollama"}
                actions={
                  <Button
                    size="sm"
                    variant="secondary"
                    disabled={isTesting}
                    onClick={() => void handleTestConnection()}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>{isTesting ? 'Checking…' : 'Test connection'}</span>
                  </Button>
                }
              >
                {diag?.details ??
                  'Start Ollama with browser access enabled, or use Built-in demo mode.'}
              </Banner>
            )}

            {settings.activeProviderId === 'ollama' && (
              <div className="space-y-3 pt-1">
                <div className="text-xs font-medium text-ink">
                  Quick terminal setup for llama3.1:8b
                </div>
                <CopyCommandField command="ollama pull llama3.1:8b" />
                <CopyCommandField
                  command={
                    diag?.remediationCommand ??
                    'OLLAMA_ORIGINS="*" ollama serve'
                  }
                />
              </div>
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
                  Prefix caching, parallel slots, and local speed calibration.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={isCalibrating}
                  onClick={() => void handleCalibrate()}
                >
                  {isCalibrating ? calibrationStep : 'Calibrate speed (~15s)'}
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

            <div className="grid grid-cols-3 gap-3">
              <div className="p-3.5 rounded-lg bg-surface-sunken border border-hairline">
                <span className="text-xs text-ink-muted block">
                  Reading speed
                </span>
                {settings.activeProviderId === 'mock' ? (
                  <span className="text-xs font-medium text-ink-muted block mt-1">
                    Not measured in demo mode
                  </span>
                ) : (perfSummary?.readingSpeedTokPerSec ?? 0) > 0 ? (
                  <>
                    <span className="text-lg font-display font-bold tabular-nums text-ink">
                      {perfSummary!.readingSpeedTokPerSec} tok/s
                    </span>
                    <span className="text-[11px] text-ink-subtle block">
                      Measured on this computer.
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-ink-muted block mt-1">
                    Not calibrated yet
                  </span>
                )}
              </div>
              <div className="p-3.5 rounded-lg bg-surface-sunken border border-hairline">
                <span className="text-xs text-ink-muted block">
                  Writing speed
                </span>
                {settings.activeProviderId === 'mock' ? (
                  <span className="text-xs font-medium text-ink-muted block mt-1">
                    Not measured in demo mode
                  </span>
                ) : (perfSummary?.writingSpeedTokPerSec ?? 0) > 0 ? (
                  <>
                    <span className="text-lg font-display font-bold tabular-nums text-ink">
                      {perfSummary!.writingSpeedTokPerSec} tok/s
                    </span>
                    <span className="text-[11px] text-ink-subtle block">
                      Measured on this computer.
                    </span>
                  </>
                ) : (
                  <span className="text-xs font-medium text-ink-muted block mt-1">
                    Not calibrated yet
                  </span>
                )}
              </div>
              <div className="p-3.5 rounded-lg bg-surface-sunken border border-hairline">
                <span className="text-xs text-ink-muted block">Cache hits</span>
                <span className="text-lg font-display font-bold tabular-nums text-ink">
                  {perfSummary?.cacheHits ?? 0} / {perfSummary?.totalCalls ?? 0}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between pt-2">
              <div>
                <div className="text-xs font-semibold text-ink">
                  Keep model warm in memory (30m)
                </div>
                <p className="text-xs text-ink-muted">
                  Avoids cold-start delay when switching between bullets.
                </p>
              </div>
              <Switch
                checked={settings.keepModelWarm ?? true}
                onCheckedChange={(v) =>
                  void updateSettings({ keepModelWarm: v })
                }
                label="Keep model warm"
              />
            </div>

            <Disclosure title="Advanced local engine parameters">
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">
                      Ollama base URL
                    </label>
                    <Input
                      value={ollamaConfig.baseUrl ?? 'http://localhost:11434'}
                      onChange={(e) =>
                        void updateSettings({
                          providerConfigs: {
                            ...settings.providerConfigs,
                            ollama: {
                              ...ollamaConfig,
                              baseUrl: e.target.value,
                            },
                          },
                        })
                      }
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">
                      Model tag
                    </label>
                    <Input
                      value={ollamaConfig.model ?? 'llama3.1:8b'}
                      onChange={(e) =>
                        void updateSettings({
                          providerConfigs: {
                            ...settings.providerConfigs,
                            ollama: {
                              ...ollamaConfig,
                              model: e.target.value,
                            },
                          },
                        })
                      }
                    />
                  </div>
                </div>
                <CopyCommandField
                  command={`OLLAMA_FLASH_ATTENTION=${RECOMMENDED_OLLAMA_ENV.OLLAMA_FLASH_ATTENTION} OLLAMA_KV_CACHE_TYPE=${RECOMMENDED_OLLAMA_ENV.OLLAMA_KV_CACHE_TYPE} OLLAMA_NUM_PARALLEL=${RECOMMENDED_OLLAMA_ENV.OLLAMA_NUM_PARALLEL} ollama serve`}
                />
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
