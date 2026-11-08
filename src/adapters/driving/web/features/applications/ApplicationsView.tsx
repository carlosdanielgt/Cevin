import {
  ArrowRight,
  Copy,
  FileText,
  GitCompare,
  Link2,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Application,
  ApplicationStatus,
  BankSnapshot,
  DocumentKind,
  DocumentVersion,
  PracticalFitEvaluation,
  StudioStep,
  UserPreferences,
  buildGroupedCoverageSummary,
  deriveRowAttentionToken,
  evaluateFit,
  extractJobFactsByRules,
  formatCount,
  getStageDefaultFactsMode,
} from '../../../../../core/domain';
import { useCevinUseCases, useUiStore } from '../../context';
import {
  Avatar,
  Button,
  ConfirmDialog,
  DeltaChip,
  Drawer,
  EmptyState,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Sparkline,
} from '../../ui/primitives';
import {
  ApplicationDetailsForm,
  AttentionToken,
  CoverageSummary,
  DiffText,
  EstimateRing,
  FitStrip,
  GettingStartedCard,
  JobFactsTable,
  PageHeader,
  RequirementGroup,
  ScoreRing,
  StatusBadge,
  StatusPill,
  VersionCard,
  ViewMenu,
  formatQuickEstimateBand,
} from '../../ui/signatures';

function formatRelativeDate(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const ALL_STATUSES: ApplicationStatus[] = [
  'Prospect',
  'Draft',
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
  'Archived',
];

type SortMode = 'best-fit' | 'recent';

export function ApplicationsView({
  initialSelectedId,
  onSelectApplication,
  onOpenStudio,
}: {
  initialSelectedId?: string;
  onSelectApplication: (appId: string) => void;
  onOpenStudio: (
    appId: string,
    doc?: DocumentKind,
    step?: StudioStep,
  ) => void;
}) {
  const useCases = useCevinUseCases();
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const setNewAppModalOpen = useUiStore((s) => s.setNewAppModalOpen);
  const connectionStatus = useUiStore((s) => s.connectionStatus);
  const gettingStartedDismissed = useUiStore((s) => s.gettingStartedDismissed);
  const setGettingStartedDismissed = useUiStore(
    (s) => s.setGettingStartedDismissed,
  );

  const [applications, setApplications] = useState<Application[]>([]);
  const [bank, setBank] = useState<BankSnapshot | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [versionsByApp, setVersionsByApp] = useState<
    Record<string, DocumentVersion[]>
  >({});
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<ApplicationStatus | 'All'>(
    'All',
  );
  const [sortMode, setSortMode] = useState<SortMode>('best-fit');
  const [hideConflicts, setHideConflicts] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialSelectedId,
  );
  const [versionKindTab, setVersionKindTab] =
    useState<DocumentKind>('resume');
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [compareDrawerOpen, setCompareDrawerOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Application | null>(null);
  const [detailsOpenByAppId, setDetailsOpenByAppId] = useState<
    Record<string, boolean>
  >({});

  const loadData = useCallback(async () => {
    const [apps, loadedBank, loadedPrefs] = await Promise.all([
      useCases.manageApplications.listApplications(),
      useCases.manageBank.getBank(),
      useCases.managePreferences.getPreferences(),
    ]);
    setApplications(apps);
    setBank(loadedBank);
    setPreferences(loadedPrefs);

    const verMap: Record<string, DocumentVersion[]> = {};
    for (const app of apps) {
      verMap[app.id] = await useCases.manageApplications.listVersions(app.id);
    }
    setVersionsByApp(verMap);

    if (!selectedId && apps.length > 0) {
      const defaultApp =
        apps.find((a) => a.id === 'app-kestrel-infra') ?? apps[0];
      setSelectedId(initialSelectedId ?? defaultApp.id);
    }
  }, [useCases, initialSelectedId, selectedId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    if (initialSelectedId) {
      setSelectedId(initialSelectedId);
    }
  }, [initialSelectedId]);

  // Precompute JobFacts & PracticalFitEvaluation per application
  const fitByAppId = useMemo(() => {
    const map: Record<
      string,
      {
        facts: NonNullable<Application['jobFacts']>;
        fit: PracticalFitEvaluation;
      }
    > = {};
    for (const app of applications) {
      const facts =
        app.jobFacts ??
        extractJobFactsByRules(app.jobDescription ?? '').facts;
      const fit = evaluateFit(facts, preferences);
      map[app.id] = { facts, fit };
    }
    return map;
  }, [applications, preferences]);

  // Non-empty status filters (never show "Offer 0")
  const visibleStatusFilters = useMemo(() => {
    const nonEmpty = ALL_STATUSES.filter((s) =>
      applications.some((a) => a.status === s),
    );
    return ['All' as const, ...nonEmpty];
  }, [applications]);

  const filteredApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const list = applications.filter((app) => {
      const matchesStatus =
        statusFilter === 'All' || app.status === statusFilter;
      const matchesSearch =
        !q ||
        app.company.toLowerCase().includes(q) ||
        app.roleTitle.toLowerCase().includes(q);
      const fitInfo = fitByAppId[app.id];
      const passesConflictFilter =
        !hideConflicts || (fitInfo?.fit.dealbreakerCount ?? 0) === 0;
      return matchesStatus && matchesSearch && passesConflictFilter;
    });

    return [...list].sort((a, b) => {
      if (sortMode === 'best-fit') {
        const dealbreakerA = fitByAppId[a.id]?.fit.dealbreakerCount ?? 0;
        const dealbreakerB = fitByAppId[b.id]?.fit.dealbreakerCount ?? 0;
        if (dealbreakerA !== dealbreakerB) return dealbreakerA - dealbreakerB;
        const conflictA = fitByAppId[a.id]?.fit.conflictCount ?? 0;
        const conflictB = fitByAppId[b.id]?.fit.conflictCount ?? 0;
        if (conflictA !== conflictB) return conflictA - conflictB;
        return b.latestScores.jobMatch - a.latestScores.jobMatch;
      }
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [
    applications,
    searchQuery,
    statusFilter,
    hideConflicts,
    sortMode,
    fitByAppId,
  ]);

  const activeApp = useMemo(() => {
    return (
      filteredApps.find((a) => a.id === selectedId) ??
      filteredApps[0] ??
      applications[0] ??
      null
    );
  }, [filteredApps, selectedId, applications]);

  const allActiveVersions = useMemo(() => {
    if (!activeApp) return [];
    return (versionsByApp[activeApp.id] ?? []).sort(
      (a, b) => b.number - a.number,
    );
  }, [activeApp, versionsByApp]);

  const resumeVersions = useMemo(
    () =>
      allActiveVersions.filter((v) => (v.kind ?? 'resume') === 'resume'),
    [allActiveVersions],
  );
  const coverLetterVersions = useMemo(
    () => allActiveVersions.filter((v) => v.kind === 'coverLetter'),
    [allActiveVersions],
  );

  const visibleVersionsForTab =
    versionKindTab === 'coverLetter' ? coverLetterVersions : resumeVersions;

  const aiReady =
    connectionStatus.state === 'connected' ||
    connectionStatus.state === 'demo' ||
    connectionStatus.state === 'busy' ||
    connectionStatus.state === 'warming';
  const hasExperience =
    (bank?.experiences.length ?? 0) > 0 || (bank?.skills.length ?? 0) > 0;
  const hasApplication = applications.length > 0;
  const isDemoDataLoaded = applications.some(
    (a) => a.id === 'app-kestrel-infra',
  );
  const allStepsComplete = aiReady && hasExperience && hasApplication;

  useEffect(() => {
    if (allStepsComplete && !gettingStartedDismissed) {
      setGettingStartedDismissed(true);
      void useCases.manageSettings.saveSettings({
        gettingStartedDismissed: true,
      });
    }
  }, [
    allStepsComplete,
    gettingStartedDismissed,
    setGettingStartedDismissed,
    useCases,
  ]);

  const handleDismissGettingStarted = async () => {
    setGettingStartedDismissed(true);
    await useCases.manageSettings.saveSettings({
      gettingStartedDismissed: true,
    });
  };

  const handleStatusChange = async (
    app: Application,
    nextStatus: ApplicationStatus,
  ) => {
    const todayIso = new Date().toISOString().slice(0, 10);
    const updated = await useCases.manageApplications.saveApplication({
      ...app,
      status: nextStatus,
      appliedDate:
        nextStatus === 'Applied' && !app.appliedDate
          ? todayIso
          : app.appliedDate,
    });
    setApplications((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a)),
    );
  };

  const handleSaveAppDetails = async (
    app: Application,
    patch: { postingUrl?: string; appliedDate?: string; notes?: string },
  ) => {
    const updated = await useCases.manageApplications.saveApplication({
      ...app,
      ...patch,
    });
    setApplications((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a)),
    );
  };

  const handleToggleFactsExpanded = async (
    app: Application,
    nextExpanded: boolean,
  ) => {
    const updated = await useCases.manageApplications.saveApplication({
      ...app,
      factsExpandedOverride: nextExpanded,
    });
    setApplications((prev) =>
      prev.map((a) => (a.id === updated.id ? updated : a)),
    );
  };

  const handlePromoteProspect = async (app: Application) => {
    const res = await useCases.quickCheck.promoteProspect(app.id);
    if (res.ok) {
      await loadData();
      addToast(`Started tailoring for ${res.value.company}`, 'success');
      onOpenStudio(res.value.id, 'resume', 'build');
    }
  };

  const handleDuplicate = async (appId: string) => {
    const res = await useCases.manageApplications.duplicateApplication(appId);
    if (res.ok) {
      await loadData();
      setSelectedId(res.value.id);
      onSelectApplication(res.value.id);
      addToast(`Duplicated ${res.value.company}`, 'success');
    }
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    await useCases.manageApplications.deleteApplication(deleteTarget.id);
    setDeleteTarget(null);
    await loadData();
    addToast(`Deleted ${deleteTarget.company}`, 'info');
  };

  const handleToggleCompare = (verId: string) => {
    setCompareIds((prev) => {
      if (prev.includes(verId)) return prev.filter((id) => id !== verId);
      if (prev.length >= 2) return [prev[1], verId];
      return [...prev, verId];
    });
  };

  const comparedVersions = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const vA = allActiveVersions.find((v) => v.id === compareIds[0]);
    const vB = allActiveVersions.find((v) => v.id === compareIds[1]);
    if (!vA || !vB) return null;
    return vA.number <= vB.number ? [vA, vB] : [vB, vA];
  }, [compareIds, allActiveVersions]);

  // Compute deltas vs previous saved resume version
  const chronoResumeVersions = useMemo(
    () => [...resumeVersions].sort((a, b) => a.number - b.number),
    [resumeVersions],
  );

  const prevSavedResumeVer = useMemo(() => {
    if (resumeVersions.length === 0) return null;
    return resumeVersions.length >= 2 ? resumeVersions[1] : resumeVersions[0];
  }, [resumeVersions]);

  const refVerLabel = prevSavedResumeVer ? `v${prevSavedResumeVer.number}` : 'v1';

  const matchDelta =
    prevSavedResumeVer && activeApp && resumeVersions.length >= 1
      ? activeApp.latestScores.jobMatch - prevSavedResumeVer.scores.jobMatch
      : 0;
  const appealDelta =
    prevSavedResumeVer && activeApp && resumeVersions.length >= 1
      ? (activeApp.latestScores.recruiterAppeal ?? 78) -
        (prevSavedResumeVer.scores.recruiterAppeal ?? 78)
      : 0;
  const atsDelta =
    prevSavedResumeVer && activeApp && resumeVersions.length >= 1
      ? activeApp.latestScores.atsReadiness -
        prevSavedResumeVer.scores.atsReadiness
      : 0;

  const activeFitInfo = activeApp ? fitByAppId[activeApp.id] : undefined;

  const activeCoverage = useMemo(() => {
    if (!activeApp || !bank) return null;
    return buildGroupedCoverageSummary({
      parsedJob: activeApp.parsedJob,
      bank,
      resumeText: [
        activeApp.workingDraft.targetHeadline,
        activeApp.workingDraft.summary,
        ...activeApp.workingDraft.bullets.map((b) => b.text),
      ].join(' '),
      dismissedRequirementIds: activeApp.dismissedRequirementIds ?? [],
    });
  }, [activeApp, bank]);

  // Stage-aware default for Job facts section
  const stageDefaultFactsMode = activeApp
    ? getStageDefaultFactsMode(activeApp.status)
    : 'strip-collapsed';
  const isFactsExpanded = activeApp
    ? activeApp.factsExpandedOverride !== undefined
      ? activeApp.factsExpandedOverride
      : stageDefaultFactsMode === 'table-expanded'
    : false;
  const isFactsHiddenBehindLink =
    activeApp &&
    stageDefaultFactsMode === 'hidden-link' &&
    activeApp.factsExpandedOverride !== true;


  const isDetailsOpen = activeApp
    ? Boolean(detailsOpenByAppId[activeApp.id])
    : false;

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Applications"
        subtitle="Check postings against your preferences, tailor resumes and grounded cover letters, and compare versions."
      />

      {!gettingStartedDismissed && !allStepsComplete && (
        <GettingStartedCard
          aiConnectedOrDemo={aiReady}
          hasExperience={hasExperience}
          hasApplication={hasApplication}
          isDemoDataLoaded={isDemoDataLoaded}
          onConnectAi={() => navigate('/settings')}
          onAddExperience={() => navigate('/bank')}
          onCreateApplication={() => setNewAppModalOpen(true)}
          onTryDemoData={async () => {
            await useCases.manageBank.loadDemoWorkspace();
            await loadData();
            addToast('Loaded demo workspace.', 'success');
          }}
          onDismiss={() => void handleDismissGettingStarted()}
        />
      )}

      {applications.length === 0 ? (
        <EmptyState
          illustrationKind="applications"
          title="Tailor your first resume in 3 steps"
          description="1. Quick check a job posting · 2. Tune your writing voice and proof points · 3. Export a clean, single-page PDF and cover letter."
          actionLabel="New application"
          onAction={() => setNewAppModalOpen(true)}
          secondaryActionLabel="Load sample workspace"
          onSecondaryAction={async () => {
            await useCases.manageBank.loadDemoWorkspace();
            await loadData();
            addToast('Loaded sample workspace.', 'success');
          }}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Pane (4 cols): Search + ViewMenu, Non-empty Status Filter Chips, Application List */}
          <div className="lg:col-span-4 bg-surface border border-border rounded-xl p-3.5 shadow-sm space-y-3">
            <div className="flex items-center gap-2">
              <div className="relative flex-1 min-w-0">
                <Search className="w-4 h-4 text-ink-subtle absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search company or role…"
                  aria-label="Search applications"
                  className="pl-9"
                />
              </div>
              <ViewMenu
                sortMode={sortMode}
                onChangeSort={setSortMode}
                hideConflicts={hideConflicts}
                onChangeHideConflicts={setHideConflicts}
              />
            </div>

            {/* Status Filter Chips (only non-empty statuses) */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-hairline">
              {visibleStatusFilters.map((status) => {
                const count =
                  status === 'All'
                    ? applications.length
                    : applications.filter((a) => a.status === status).length;
                const active = statusFilter === status;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`px-2.5 py-1 rounded-sm text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      active
                        ? 'bg-ink-900 text-ink-100 font-semibold'
                        : 'text-ink-muted hover:text-ink hover:bg-surface-sunken'
                    }`}
                  >
                    {status}{' '}
                    <span className="opacity-75 tabular-nums">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Application rows: fixed 3-row structure + right ScoreRing/EstimateRing (max 1 AttentionToken) */}
            <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-0.5">
              {filteredApps.map((app) => {
                const isSelected = activeApp?.id === app.id;
                const appFit = fitByAppId[app.id]?.fit;
                const attentionToken = appFit
                  ? deriveRowAttentionToken({
                      fit: appFit,
                      mustHaveGapCount: app.latestScores.gapKeywords.length,
                      firstGapTerm: app.latestScores.gapKeywords[0],
                    })
                  : null;

                return (
                  <div
                    key={app.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => {
                      setSelectedId(app.id);
                      setCompareIds([]);
                      onSelectApplication(app.id);
                    }}
                    onDoubleClick={() =>
                      app.status === 'Prospect'
                        ? void handlePromoteProspect(app)
                        : onOpenStudio(app.id)
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedId(app.id);
                        onSelectApplication(app.id);
                      }
                    }}
                    className={`group relative w-full text-left p-3 rounded-lg border transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-accent-50/60 border-accent/35 shadow-xs'
                        : 'bg-surface border-hairline hover:bg-surface-raised hover:border-border-strong'
                    }`}
                  >
                    {isSelected && (
                      <span
                        aria-hidden="true"
                        className="absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-r-full bg-accent"
                      />
                    )}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <Avatar
                          name={app.company}
                          size="sm"
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1 space-y-1">
                          {/* Row 1: company + status pill */}
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-sm text-ink truncate">
                              {app.company}
                            </span>
                            <StatusBadge status={app.status} />
                          </div>

                          {/* Row 2: role title */}
                          <p
                            className="text-xs text-ink-muted truncate"
                            title={app.roleTitle}
                          >
                            {app.roleTitle}
                          </p>

                          {/* Row 3: relative date + at most ONE AttentionToken */}
                          <div className="flex items-center gap-2 pt-0.5 min-h-[22px]">
                            <span className="text-xs text-ink-subtle tabular-nums shrink-0">
                              {formatRelativeDate(app.updatedAt)}
                            </span>
                            {attentionToken && (
                              <AttentionToken token={attentionToken} />
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right: 36px ScoreRing or EstimateRing */}
                      <div className="shrink-0 pl-1">
                        {app.status === 'Prospect' ? (
                          <EstimateRing score={app.latestScores.jobMatch} />
                        ) : (
                          <ScoreRing
                            score={app.latestScores.jobMatch}
                            label="Job match"
                          />
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Pane (8 cols): Application Detail */}
          <div className="lg:col-span-8">
            {activeApp && (
              <div className="bg-surface border border-border rounded-xl p-6 shadow-sm space-y-5">
                {/* 1. Detail Header */}
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-hairline">
                  <div className="flex items-start gap-4 min-w-0">
                    <Avatar name={activeApp.company} size="lg" />
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <h2 className="text-[30px] font-display font-semibold text-ink tracking-tight leading-none">
                          {activeApp.company}
                        </h2>
                        <StatusPill
                          status={activeApp.status}
                          onChange={(nextStatus) =>
                            void handleStatusChange(activeApp, nextStatus)
                          }
                        />
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="text-base text-ink-muted font-medium">
                          {activeApp.roleTitle}
                        </p>
                        {activeApp.postingUrl && (
                          <a
                            href={activeApp.postingUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>Posting ↗</span>
                          </a>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {activeApp.status === 'Prospect' ? (
                      <Button
                        variant="primary"
                        onClick={() => void handlePromoteProspect(activeApp)}
                      >
                        <Sparkles className="w-4 h-4" />
                        <span>Start tailoring</span>
                      </Button>
                    ) : (
                      <Button
                        variant="primary"
                        onClick={() =>
                          onOpenStudio(activeApp.id, 'resume', 'build')
                        }
                      >
                        <span>Continue editing</span>
                        <ArrowRight className="w-4 h-4" />
                      </Button>
                    )}

                    <Popover>
                      <PopoverTrigger asChild>
                        <IconButton
                          label="More application actions"
                          variant="secondary"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </IconButton>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56 p-1">
                        <div role="menu" aria-label="Application actions">
                          {activeApp.status !== 'Prospect' && (
                            <button
                              type="button"
                              role="menuitem"
                              onClick={() =>
                                onOpenStudio(
                                  activeApp.id,
                                  'coverLetter',
                                  'write',
                                )
                              }
                              className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              <span>Open cover letter</span>
                            </button>
                          )}
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              setDetailsOpenByAppId((prev) => ({
                                ...prev,
                                [activeApp.id]: !isDetailsOpen,
                              }))
                            }
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                          >
                            <Link2 className="w-3.5 h-3.5" />
                            <span>
                              {isDetailsOpen
                                ? 'Hide application details'
                                : 'Application details & notes'}
                            </span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => void handleDuplicate(activeApp.id)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                            <span>Duplicate application</span>
                          </button>
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() => setDeleteTarget(activeApp)}
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-danger-700 rounded-sm hover:bg-danger-50 text-left cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Delete application…</span>
                          </button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>

                {/* Optional ApplicationDetailsForm (collapsed via ⋯ menu) */}
                {isDetailsOpen && (
                  <ApplicationDetailsForm
                    postingUrl={activeApp.postingUrl}
                    appliedDate={activeApp.appliedDate}
                    notes={activeApp.notes}
                    onSave={(patch) => void handleSaveAppDetails(activeApp, patch)}
                  />
                )}

                {/* 2. SCORE ROW ALWAYS FIRST (never displaced below the fold by Job facts) */}
                {activeApp.status === 'Prospect' ? (
                  <div className="space-y-4" data-testid="detail-score-row">
                    <div className="p-4 rounded-lg bg-surface-sunken/70 border border-hairline flex flex-wrap items-center justify-between gap-4">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                          Quick match (estimate)
                        </span>
                        <div className="flex items-baseline gap-2.5">
                          <span className="font-display text-[36px] font-bold text-ink leading-none tabular-nums">
                            {formatQuickEstimateBand(
                              activeApp.latestScores.jobMatch,
                            )}
                          </span>
                          <span className="text-xs text-ink-muted">
                            5-point band against your Experience Bank before tailoring
                          </span>
                        </div>
                      </div>
                      <EstimateRing
                        score={activeApp.latestScores.jobMatch}
                        size="md"
                      />
                    </div>

                    {activeCoverage && (
                      <CoverageSummary summary={activeCoverage} />
                    )}
                  </div>
                ) : (
                  <div
                    data-testid="detail-score-row"
                    className="grid grid-cols-1 sm:grid-cols-3 gap-3.5"
                  >
                    <div className="p-4 rounded-lg bg-surface-sunken/70 border border-hairline flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                          Job match
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-[34px] font-bold text-ink leading-none tabular-nums">
                            {activeApp.latestScores.jobMatch}
                          </span>
                          <DeltaChip
                            delta={matchDelta}
                            referenceLabel={refVerLabel}
                          />
                        </div>
                        <p className="text-xs text-ink-muted">
                          {activeApp.latestScores.coveredKeywords.length}{' '}
                          covered ·{' '}
                          {formatCount(
                            activeApp.latestScores.gapKeywords.length,
                            'gap',
                          )}
                        </p>
                      </div>
                      <Sparkline
                        values={chronoResumeVersions.map(
                          (v) => v.scores.jobMatch,
                        )}
                      />
                    </div>

                    <div className="p-4 rounded-lg bg-surface-sunken/70 border border-hairline flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                          Recruiter appeal
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-[34px] font-bold text-ink leading-none tabular-nums">
                            {activeApp.latestScores.recruiterAppeal ?? 82}
                          </span>
                          <DeltaChip
                            delta={appealDelta}
                            referenceLabel={refVerLabel}
                          />
                        </div>
                        <p className="text-xs text-ink-muted">
                          10-second skim (estimate)
                        </p>
                      </div>
                      <Sparkline
                        values={chronoResumeVersions.map(
                          (v) => v.scores.recruiterAppeal ?? 80,
                        )}
                      />
                    </div>

                    <div className="p-4 rounded-lg bg-surface-sunken/70 border border-hairline flex items-center justify-between gap-3">
                      <div className="space-y-1">
                        <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
                          ATS readiness
                        </span>
                        <div className="flex items-baseline gap-2">
                          <span className="font-display text-[34px] font-bold text-ink leading-none tabular-nums">
                            {activeApp.latestScores.atsReadiness}
                          </span>
                          <DeltaChip
                            delta={atsDelta}
                            referenceLabel={refVerLabel}
                          />
                        </div>
                        <p className="text-xs text-ink-muted">
                          Single-column · ~
                          {formatCount(
                            activeApp.latestScores.estimatedPages,
                            'page',
                          )}
                        </p>
                      </div>
                      <Sparkline
                        values={chronoResumeVersions.map(
                          (v) => v.scores.atsReadiness,
                        )}
                        className="text-success"
                      />
                    </div>
                  </div>
                )}

                {/* 3. One-line FitStrip + stage-aware collapsible JobFactsTable */}
                {activeFitInfo && (
                  <div className="space-y-2.5">
                    {isFactsHiddenBehindLink ? (
                      <div className="flex items-center justify-between text-xs text-ink-muted px-1">
                        <span>{activeFitInfo.fit.summaryLabel}</span>
                        <button
                          type="button"
                          onClick={() =>
                            void handleToggleFactsExpanded(activeApp, true)
                          }
                          className="font-medium text-accent hover:underline cursor-pointer"
                        >
                          Show practical fit & job facts (
                          {activeFitInfo.fit.orderedItems.length})
                        </button>
                      </div>
                    ) : (
                      <>
                        <FitStrip
                          evaluation={activeFitInfo.fit}
                          expanded={isFactsExpanded}
                          onToggleExpanded={() =>
                            void handleToggleFactsExpanded(
                              activeApp,
                              !isFactsExpanded,
                            )
                          }
                          onOpenPreferences={() => navigate('/settings')}
                        />
                        {isFactsExpanded && (
                          <JobFactsTable
                            facts={activeFitInfo.facts}
                            evaluation={activeFitInfo.fit}
                            roleTitle={activeApp.roleTitle}
                            company={activeApp.company}
                            readOnly={true}
                            onOpenPreferences={() => navigate('/settings')}
                          />
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* 4. Prospect Requirements OR Tailored Saved Versions */}
                {activeApp.status === 'Prospect' ? (
                  activeCoverage &&
                  bank && (
                    <RequirementGroup summary={activeCoverage} bank={bank} />
                  )
                ) : (
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <h3 className="text-sm font-semibold text-ink">
                          Saved versions
                        </h3>
                        <SegmentedControl<DocumentKind>
                          ariaLabel="Version document type"
                          size="sm"
                          value={versionKindTab}
                          onValueChange={(k) => {
                            setVersionKindTab(k);
                            setCompareIds([]);
                          }}
                          options={[
                            {
                              value: 'resume',
                              label: 'Resume',
                              count: resumeVersions.length,
                            },
                            {
                              value: 'coverLetter',
                              label: 'Cover letter',
                              count: coverLetterVersions.length,
                            },
                          ]}
                        />
                      </div>

                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={async () => {
                          const res =
                            await useCases.saveDocumentVersion.execute(
                              activeApp.id,
                              undefined,
                              versionKindTab,
                            );
                          if (res.ok) {
                            await loadData();
                            addToast(
                              `Saved ${versionKindTab === 'coverLetter' ? 'cover letter' : 'resume'} snapshot v${res.value.number}.`,
                              'success',
                            );
                          }
                        }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Save current draft</span>
                      </Button>
                    </div>

                    {visibleVersionsForTab.length === 0 ? (
                      <div className="p-6 rounded-lg bg-surface-sunken border border-hairline text-center text-xs text-ink-muted">
                        No saved{' '}
                        {versionKindTab === 'coverLetter'
                          ? 'cover letter'
                          : 'resume'}{' '}
                        snapshots yet. Export or click “Save current draft” to create v1.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {visibleVersionsForTab.map((ver, idx) => (
                          <VersionCard
                            key={ver.id}
                            version={ver}
                            bank={bank}
                            targetCompany={activeApp.company}
                            targetRole={activeApp.roleTitle}
                            isLatest={idx === 0}
                            isSelectedForCompare={compareIds.includes(ver.id)}
                            onToggleCompare={() =>
                              handleToggleCompare(ver.id)
                            }
                            onOpenInStudio={() =>
                              onOpenStudio(
                                activeApp.id,
                                ver.kind === 'coverLetter'
                                  ? 'coverLetter'
                                  : 'resume',
                                ver.kind === 'coverLetter'
                                  ? 'write'
                                  : 'build',
                              )
                            }
                            onExportVersion={async () => {
                              const r =
                                await useCases.exportDocument.execute({
                                  applicationId: activeApp.id,
                                  exporterId: 'pdf',
                                  templateId: ver.templateId,
                                  kind: ver.kind ?? 'resume',
                                  versionId: ver.id,
                                  autoSaveVersion: false,
                                });
                              if (r.ok) {
                                triggerBlobDownload(
                                  r.value.blob,
                                  r.value.fileName,
                                );
                              }
                            }}
                            onDeleteVersion={async () => {
                              await useCases.manageApplications.deleteVersion(
                                ver.id,
                              );
                              await loadData();
                              addToast(
                                `Deleted version v${ver.number}`,
                                'info',
                              );
                            }}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Floating Bottom Action Pill when 2 versions are checked */}
      {comparedVersions && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 px-4 py-2.5 rounded-full bg-sidebar text-ink-100 shadow-lg border border-ink-800">
          <GitCompare className="w-4 h-4 text-sky-400" />
          <span className="text-xs font-medium">
            Comparing v{comparedVersions[0].number} and v
            {comparedVersions[1].number}
          </span>
          <Button
            size="sm"
            variant="primary"
            onClick={() => setCompareDrawerOpen(true)}
          >
            Compare 2 versions
          </Button>
          <button
            type="button"
            onClick={() => setCompareIds([])}
            className="text-xs text-ink-400 hover:text-white px-1.5 cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {/* Side-by-side Version Comparison Drawer */}
      <Drawer
        open={compareDrawerOpen && Boolean(comparedVersions)}
        onOpenChange={setCompareDrawerOpen}
        title="Compare Document Versions"
        description={
          comparedVersions
            ? `v${comparedVersions[0].number} (${comparedVersions[0].label}) vs v${comparedVersions[1].number} (${comparedVersions[1].label})`
            : ''
        }
      >
        {comparedVersions && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 p-3 rounded-lg bg-surface-sunken border border-hairline text-xs">
              <div>
                <div className="font-semibold text-ink">
                  v{comparedVersions[0].number} · {comparedVersions[0].label}
                </div>
                <div className="text-ink-muted mt-0.5">
                  Match {comparedVersions[0].scores.jobMatch} · Appeal{' '}
                  {comparedVersions[0].scores.recruiterAppeal ?? 80} · ATS{' '}
                  {comparedVersions[0].scores.atsReadiness}
                </div>
              </div>
              <div>
                <div className="font-semibold text-ink">
                  v{comparedVersions[1].number} · {comparedVersions[1].label}
                </div>
                <div className="text-ink-muted mt-0.5">
                  Match {comparedVersions[1].scores.jobMatch} · Appeal{' '}
                  {comparedVersions[1].scores.recruiterAppeal ?? 80} · ATS{' '}
                  {comparedVersions[1].scores.atsReadiness}
                </div>
              </div>
            </div>

            {(comparedVersions[1].content?.bullets ?? []).map((bRight, idx) => {
              const bLeft =
                comparedVersions[0].content?.bullets.find(
                  (b) => b.id === bRight.id,
                ) ?? comparedVersions[0].content?.bullets[idx];
              return (
                <DiffText
                  key={bRight.id}
                  originalText={
                    bLeft?.text ?? '(Not included in earlier version)'
                  }
                  tailoredText={bRight.text}
                />
              );
            })}
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
        title="Delete application?"
        description={
          deleteTarget
            ? `Delete your tailored application for ${deleteTarget.company} (${deleteTarget.roleTitle})? Your Experience Bank will not be affected.`
            : ''
        }
        confirmLabel="Delete application"
        onConfirm={() => void handleDeleteConfirmed()}
      />
    </div>
  );
}
