import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Calendar,
  ChevronDown,
  Copy,
  Ellipsis,
  FileText,
  Funnel,
  GitCompare,
  Link2,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  StickyNote,
  Trash2,
} from 'lucide-react';
import {
  Application,
  ApplicationStatus,
  BankSnapshot,
  buildGroupedCoverageSummary,
  deriveRowAttentionToken,
  DocumentKind,
  DocumentVersion,
  evaluateFit,
  extractJobFactsByRules,
  formatCount,
  formatQuickEstimateBand,
  getStageDefaultFactsMode,
  JobFacts,
  PracticalFitEvaluation,
  UserPreferences,
} from '../../../../../core/domain';
import { useCevinUseCases, useUiStore } from '../../context';
import {
  Avatar,
  Button,
  ConfirmDialog,
  DeltaChip,
  Drawer,
  IconButton,
  Input,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Sparkline,
  Tooltip,
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

function formatLocaleUiDate(dateStr: string): string {
  const trimmed = dateStr.trim();
  if (!trimmed) return '';
  const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    ).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }
  return trimmed;
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

const SCORE_THRESHOLDS = [0, 60, 70, 80, 85];

interface ApplicationsViewProps {
  initialSelectedId?: string;
  onSelectApplication: (appId: string) => void;
  onOpenStudio: (
    appId: string,
    doc?: DocumentKind,
    step?: 'job' | 'build' | 'write' | 'review',
  ) => void;
}

export function ApplicationsView({
  initialSelectedId,
  onSelectApplication,
  onOpenStudio,
}: ApplicationsViewProps) {
  const useCases = useCevinUseCases();
  const navigate = useNavigate();
  const addToast = useUiStore((s) => s.addToast);
  const setNewAppModalOpen = useUiStore((s) => s.setNewAppModalOpen);
  const connectionStatus = useUiStore((s) => s.connectionStatus);
  const setConnectionStatus = useUiStore((s) => s.setConnectionStatus);
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
  const [statusFilter, setStatusFilter] = useState<'All' | ApplicationStatus>(
    'All',
  );
  const [minScoreFilter, setMinScoreFilter] = useState(0);
  const [scoreDimension, setScoreDimension] = useState<
    'jobMatch' | 'recruiterAppeal' | 'atsReadiness'
  >('jobMatch');
  const [companyFilter, setCompanyFilter] = useState('All');
  const [roleFilter, setRoleFilter] = useState('All');
  const [sortMode, setSortMode] = useState<'best-fit' | 'recent'>('best-fit');
  const [hideConflicts, setHideConflicts] = useState(false);
  const [selectedId, setSelectedId] = useState<string | undefined>(
    initialSelectedId,
  );
  const [versionKindTab, setVersionKindTab] = useState<DocumentKind>('resume');
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
    if (initialSelectedId) setSelectedId(initialSelectedId);
  }, [initialSelectedId]);

  const fitByAppId = useMemo(() => {
    const map: Record<
      string,
      { facts: JobFacts; fit: PracticalFitEvaluation }
    > = {};
    for (const app of applications) {
      const facts =
        app.jobFacts ?? extractJobFactsByRules(app.jobDescription ?? '');
      const fit = evaluateFit(facts, preferences ?? null);
      map[app.id] = { facts, fit };
    }
    return map;
  }, [applications, preferences]);

  const visibleStatusFilters = useMemo<Array<'All' | ApplicationStatus>>(() => {
    return [
      'All',
      ...ALL_STATUSES.filter(
        (s) => applications.some((a) => a.status === s) || statusFilter === s,
      ),
    ];
  }, [applications, statusFilter]);

  const distinctCompanies = useMemo(() => {
    const counts = new Map<string, number>();
    for (const app of applications) {
      const name = app.company.trim();
      if (name) counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
  }, [applications]);

  const distinctRoles = useMemo(() => {
    const counts = new Map<string, number>();
    for (const app of applications) {
      const role = app.roleTitle.trim();
      if (role) counts.set(role, (counts.get(role) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) =>
      a[0].localeCompare(b[0]),
    );
  }, [applications]);

  const hasActiveFilters =
    statusFilter !== 'All' ||
    minScoreFilter > 0 ||
    companyFilter !== 'All' ||
    roleFilter !== 'All' ||
    searchQuery.trim().length > 0 ||
    hideConflicts;

  const handleResetFilters = () => {
    setStatusFilter('All');
    setMinScoreFilter(0);
    setCompanyFilter('All');
    setRoleFilter('All');
    setSearchQuery('');
    setHideConflicts(false);
  };

  const filteredApps = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const companyQuery =
      companyFilter === 'All' ? '' : companyFilter.trim().toLowerCase();
    const roleQuery =
      roleFilter === 'All' ? '' : roleFilter.trim().toLowerCase();
    return [
      ...applications.filter((app) => {
        const matchesStatus =
          statusFilter === 'All' || app.status === statusFilter;
        const matchesSearch =
          !q ||
          app.company.toLowerCase().includes(q) ||
          app.roleTitle.toLowerCase().includes(q);
        const matchesCompany =
          !companyQuery || app.company.toLowerCase().includes(companyQuery);
        const matchesRole =
          !roleQuery || app.roleTitle.toLowerCase().includes(roleQuery);
        const appScore =
          scoreDimension === 'recruiterAppeal'
            ? (app.latestScores.recruiterAppeal ?? 78)
            : scoreDimension === 'atsReadiness'
              ? app.latestScores.atsReadiness
              : app.latestScores.jobMatch;
        const matchesScore =
          minScoreFilter <= 0 || appScore >= minScoreFilter;
        const fitInfo = fitByAppId[app.id];
        const passesConflictFilter =
          !hideConflicts || (fitInfo?.fit.dealbreakerCount ?? 0) === 0;
        return (
          matchesStatus &&
          matchesSearch &&
          matchesCompany &&
          matchesRole &&
          matchesScore &&
          passesConflictFilter
        );
      }),
    ].sort((a, b) => {
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
    companyFilter,
    roleFilter,
    minScoreFilter,
    scoreDimension,
    hideConflicts,
    sortMode,
    fitByAppId,
  ]);

  const activeApp = useMemo(() => {
    return (
      filteredApps.find((a) => a.id === selectedId) ??
      filteredApps[0] ??
      applications.find((a) => a.id === selectedId) ??
      applications[0] ??
      null
    );
  }, [filteredApps, selectedId, applications]);

  const allActiveVersions = useMemo(() => {
    if (!activeApp) return [];
    return [...(versionsByApp[activeApp.id] ?? [])].sort(
      (a, b) => b.number - a.number,
    );
  }, [activeApp, versionsByApp]);

  const resumeVersions = useMemo(
    () => allActiveVersions.filter((v) => (v.kind ?? 'resume') === 'resume'),
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
    addToast('Saved application details & notes.', 'success');
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

  const comparedVersions = useMemo<
    [DocumentVersion, DocumentVersion] | null
  >(() => {
    if (compareIds.length !== 2) return null;
    const vA = allActiveVersions.find((v) => v.id === compareIds[0]);
    const vB = allActiveVersions.find((v) => v.id === compareIds[1]);
    if (!vA || !vB) return null;
    return vA.number <= vB.number ? [vA, vB] : [vB, vA];
  }, [compareIds, allActiveVersions]);

  const chronoResumeVersions = useMemo(
    () => [...resumeVersions].sort((a, b) => a.number - b.number),
    [resumeVersions],
  );

  const prevSavedResumeVer = useMemo(() => {
    if (resumeVersions.length === 0) return null;
    return resumeVersions.length >= 2 ? resumeVersions[1] : resumeVersions[0];
  }, [resumeVersions]);

  const refVerLabel = prevSavedResumeVer
    ? `v${prevSavedResumeVer.number}`
    : 'v1';

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
  const hasSavedDetailsOrNotes = Boolean(
    activeApp &&
      (activeApp.notes?.trim() ||
        activeApp.appliedDate?.trim() ||
        activeApp.postingUrl?.trim()),
  );

  const scoreDimensionShortLabel =
    scoreDimension === 'recruiterAppeal'
      ? 'Appeal'
      : scoreDimension === 'atsReadiness'
        ? 'ATS'
        : 'Match';

  return (
    <div className="space-y-6 pb-16">
      <PageHeader title="Applications" />

      {applications.length === 0 &&
        !gettingStartedDismissed &&
        !allStepsComplete && (
          <GettingStartedCard
            aiConnectedOrDemo={aiReady}
            hasExperience={hasExperience}
            hasApplication={hasApplication}
            isDemoDataLoaded={isDemoDataLoaded}
            onConnectAi={() => navigate('/settings')}
            onUseDemoMode={async () => {
              await useCases.manageSettings.saveSettings({
                activeProviderId: 'mock',
              });
              const status =
                await useCases.testLlmConnection.getSidebarStatus();
              setConnectionStatus(status);
              addToast('Switched to Demo mode.', 'success');
            }}
            onAddExperience={() => navigate('/bank')}
            onCreateApplication={() => setNewAppModalOpen(true)}
            onTryDemoData={async () => {
              await useCases.manageBank.loadDemoWorkspace();
              await loadData();
              addToast('Loaded sample workspace.', 'success');
            }}
          />
        )}

      {applications.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
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

            <div className="flex items-center gap-1 overflow-x-auto pb-1 border-b border-hairline">
              {visibleStatusFilters.map((status) => {
                const count =
                  status === 'All'
                    ? applications.length
                    : applications.filter((a) => a.status === status).length;
                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setStatusFilter(status)}
                    className={`px-2.5 py-1 rounded-sm text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      statusFilter === status
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

            {(applications.length > 12 ||
              minScoreFilter > 0 ||
              companyFilter !== 'All' ||
              roleFilter !== 'All') && (
              <div
                data-testid="applications-filter-bar"
                className="flex flex-wrap items-center gap-1.5 pb-1 border-b border-hairline"
              >
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ink-subtle mr-0.5">
                  <Funnel className="w-3 h-3" />
                  <span>Filter:</span>
                </span>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      data-testid="filter-score-trigger"
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                        minScoreFilter > 0
                          ? 'bg-accent-50 text-accent-900 border-accent/40 font-semibold'
                          : 'bg-surface-sunken/70 text-ink-muted border-hairline hover:text-ink hover:border-border-strong'
                      }`}
                    >
                      <span>
                        {minScoreFilter > 0
                          ? `${scoreDimensionShortLabel} ${minScoreFilter}+`
                          : 'Score'}
                      </span>
                      <ChevronDown className="w-3 h-3 opacity-70" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-3 space-y-3">
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                        Score metric
                      </span>
                      <div className="grid grid-cols-3 gap-1">
                        {(
                          [
                            { id: 'jobMatch', label: 'Job match' },
                            { id: 'recruiterAppeal', label: 'Appeal' },
                            { id: 'atsReadiness', label: 'ATS check' },
                          ] as const
                        ).map((dim) => (
                          <button
                            key={dim.id}
                            type="button"
                            onClick={() => setScoreDimension(dim.id)}
                            className={`px-2 py-1 rounded text-[11px] font-medium transition-colors cursor-pointer ${
                              scoreDimension === dim.id
                                ? 'bg-ink-900 text-ink-100 font-semibold'
                                : 'bg-surface-sunken text-ink-muted hover:text-ink'
                            }`}
                          >
                            {dim.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                        Minimum score
                      </span>
                      <div className="flex flex-wrap gap-1">
                        {SCORE_THRESHOLDS.map((threshold) => (
                          <button
                            key={threshold}
                            type="button"
                            onClick={() => setMinScoreFilter(threshold)}
                            className={`px-2.5 py-1 rounded text-xs font-medium tabular-nums transition-colors cursor-pointer ${
                              minScoreFilter === threshold
                                ? 'bg-accent text-white font-semibold'
                                : 'bg-surface-sunken text-ink-muted hover:text-ink'
                            }`}
                          >
                            {threshold === 0 ? 'Any' : `${threshold}+`}
                          </button>
                        ))}
                      </div>
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      data-testid="filter-role-trigger"
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer max-w-[140px] ${
                        roleFilter !== 'All'
                          ? 'bg-accent-50 text-accent-900 border-accent/40 font-semibold'
                          : 'bg-surface-sunken/70 text-ink-muted border-hairline hover:text-ink hover:border-border-strong'
                      }`}
                    >
                      <span className="truncate">
                        {roleFilter === 'All' ? 'Role' : roleFilter}
                      </span>
                      <ChevronDown className="w-3 h-3 shrink-0 opacity-70" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-2.5 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted px-1">
                      Filter by role
                    </div>
                    <Input
                      value={roleFilter === 'All' ? '' : roleFilter}
                      onChange={(e) =>
                        setRoleFilter(e.target.value ? e.target.value : 'All')
                      }
                      placeholder="Type role keyword…"
                      aria-label="Filter by role keyword"
                    />
                    <div className="max-h-44 overflow-y-auto space-y-0.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setRoleFilter('All')}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                          roleFilter === 'All'
                            ? 'bg-ink-900 text-ink-100 font-semibold'
                            : 'text-ink hover:bg-surface-sunken'
                        }`}
                      >
                        <span>All roles</span>
                        <span className="opacity-75 tabular-nums">
                          {applications.length}
                        </span>
                      </button>
                      {distinctRoles.map(([roleName, count]) => (
                        <button
                          key={roleName}
                          type="button"
                          onClick={() => setRoleFilter(roleName)}
                          className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                            roleFilter === roleName
                              ? 'bg-ink-900 text-ink-100 font-semibold'
                              : 'text-ink hover:bg-surface-sunken'
                          }`}
                        >
                          <span className="truncate">{roleName}</span>
                          <span className="opacity-75 tabular-nums shrink-0">
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      data-testid="filter-company-trigger"
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer max-w-[140px] ${
                        companyFilter !== 'All'
                          ? 'bg-accent-50 text-accent-900 border-accent/40 font-semibold'
                          : 'bg-surface-sunken/70 text-ink-muted border-hairline hover:text-ink hover:border-border-strong'
                      }`}
                    >
                      <span className="truncate">
                        {companyFilter === 'All' ? 'Company' : companyFilter}
                      </span>
                      <ChevronDown className="w-3 h-3 shrink-0 opacity-70" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-2.5 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted px-1">
                      Filter by company
                    </div>
                    <Input
                      value={companyFilter === 'All' ? '' : companyFilter}
                      onChange={(e) =>
                        setCompanyFilter(
                          e.target.value ? e.target.value : 'All',
                        )
                      }
                      placeholder="Type company name…"
                      aria-label="Filter by company name"
                    />
                    <div className="max-h-44 overflow-y-auto space-y-0.5 pt-1">
                      <button
                        type="button"
                        onClick={() => setCompanyFilter('All')}
                        className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                          companyFilter === 'All'
                            ? 'bg-ink-900 text-ink-100 font-semibold'
                            : 'text-ink hover:bg-surface-sunken'
                        }`}
                      >
                        <span>All companies</span>
                        <span className="opacity-75 tabular-nums">
                          {applications.length}
                        </span>
                      </button>
                      {distinctCompanies.map(([compName, count]) => (
                        <button
                          key={compName}
                          type="button"
                          onClick={() => setCompanyFilter(compName)}
                          className={`w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                            companyFilter === compName
                              ? 'bg-ink-900 text-ink-100 font-semibold'
                              : 'text-ink hover:bg-surface-sunken'
                          }`}
                        >
                          <span className="truncate">{compName}</span>
                          <span className="opacity-75 tabular-nums shrink-0">
                            {count}
                          </span>
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>

                <Popover>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      data-testid="filter-status-trigger"
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition-colors cursor-pointer ${
                        statusFilter !== 'All'
                          ? 'bg-accent-50 text-accent-900 border-accent/40 font-semibold'
                          : 'bg-surface-sunken/70 text-ink-muted border-hairline hover:text-ink hover:border-border-strong'
                      }`}
                    >
                      <span>
                        {statusFilter === 'All' ? 'Status' : statusFilter}
                      </span>
                      <ChevronDown className="w-3 h-3 opacity-70" />
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-52 p-2 space-y-1">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted px-1.5 py-0.5">
                      Application status
                    </div>
                    <button
                      type="button"
                      onClick={() => setStatusFilter('All')}
                      className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                        statusFilter === 'All'
                          ? 'bg-ink-900 text-ink-100 font-semibold'
                          : 'text-ink hover:bg-surface-sunken'
                      }`}
                    >
                      <span>All statuses</span>
                      <span className="opacity-75 tabular-nums">
                        {applications.length}
                      </span>
                    </button>
                    {ALL_STATUSES.map((st) => {
                      const count = applications.filter(
                        (a) => a.status === st,
                      ).length;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => setStatusFilter(st)}
                          className={`w-full flex items-center justify-between px-2 py-1.5 rounded text-xs text-left cursor-pointer ${
                            statusFilter === st
                              ? 'bg-ink-900 text-ink-100 font-semibold'
                              : 'text-ink hover:bg-surface-sunken'
                          }`}
                        >
                          <span>{st}</span>
                          <span className="opacity-75 tabular-nums">
                            {count}
                          </span>
                        </button>
                      );
                    })}
                  </PopoverContent>
                </Popover>

                {hasActiveFilters && (
                  <button
                    type="button"
                    data-testid="reset-application-filters"
                    onClick={handleResetFilters}
                    className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium text-accent hover:bg-accent-50 transition-colors cursor-pointer ml-auto"
                  >
                    <RotateCcw className="w-3 h-3" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
            )}

            <div className="space-y-1.5 max-h-[640px] overflow-y-auto pr-0.5">
              {filteredApps.length === 0 ? (
                <div className="py-8 px-4 text-center space-y-2 rounded-lg border border-dashed border-hairline">
                  <p className="text-xs font-medium text-ink">
                    No applications match the current filters.
                  </p>
                  <p className="text-[11px] text-ink-muted">
                    Try lowering the minimum score or clearing role, company, or
                    status filters.
                  </p>
                  {hasActiveFilters && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleResetFilters}
                    >
                      Clear all filters
                    </Button>
                  )}
                </div>
              ) : (
                filteredApps.map((app) => {
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
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold text-sm text-ink truncate">
                                {app.company}
                              </span>
                              <StatusBadge status={app.status} />
                            </div>
                            <p
                              className="text-xs text-ink-muted truncate"
                              title={app.roleTitle}
                            >
                              {app.roleTitle}
                            </p>
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
                })
              )}
            </div>
          </div>

          <div className="lg:col-span-8">
            {activeApp && (
              <div className="bg-surface border border-border rounded-xl p-6 shadow-sm space-y-5">
                <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-hairline">
                  <div className="flex items-start gap-4 min-w-0">
                    <Avatar name={activeApp.company} size="lg" />
                    <div className="space-y-1.5 min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Popover>
                          <PopoverTrigger asChild>
                            <button
                              type="button"
                              title="Click to edit company or role title"
                              className="group inline-flex items-center gap-2 text-left cursor-pointer rounded-md hover:bg-surface-sunken px-1 -mx-1 transition-colors"
                            >
                              <h2 className="text-[30px] font-display font-semibold text-ink tracking-tight leading-none">
                                {activeApp.company}
                              </h2>
                              <Pencil className="w-4 h-4 text-ink-muted opacity-40 group-hover:opacity-100 transition-opacity" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="start"
                            className="w-80 p-4 space-y-3"
                          >
                            <div className="text-xs font-semibold text-ink">
                              Edit Target Company & Role
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-ink-muted mb-1">
                                Company name
                              </label>
                              <Input
                                value={activeApp.company}
                                onChange={(e) => {
                                  const updated: Application = {
                                    ...activeApp,
                                    company: e.target.value,
                                    parsedJob: activeApp.parsedJob
                                      ? {
                                          ...activeApp.parsedJob,
                                          company: e.target.value,
                                        }
                                      : null,
                                  };
                                  setApplications((prev) =>
                                    prev.map((a) =>
                                      a.id === activeApp.id ? updated : a,
                                    ),
                                  );
                                  void useCases.manageApplications.saveApplication(
                                    updated,
                                  );
                                }}
                                placeholder="e.g. Kestrel Pay"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-medium text-ink-muted mb-1">
                                Role title
                              </label>
                              <Input
                                value={activeApp.roleTitle}
                                onChange={(e) => {
                                  const updated: Application = {
                                    ...activeApp,
                                    roleTitle: e.target.value,
                                    parsedJob: activeApp.parsedJob
                                      ? {
                                          ...activeApp.parsedJob,
                                          title: e.target.value,
                                        }
                                      : null,
                                  };
                                  setApplications((prev) =>
                                    prev.map((a) =>
                                      a.id === activeApp.id ? updated : a,
                                    ),
                                  );
                                  void useCases.manageApplications.saveApplication(
                                    updated,
                                  );
                                }}
                              />
                            </div>
                          </PopoverContent>
                        </Popover>
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

                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      data-testid="toggle-application-details-btn"
                      onClick={() =>
                        setDetailsOpenByAppId((prev) => ({
                          ...prev,
                          [activeApp.id]: !isDetailsOpen,
                        }))
                      }
                    >
                      <StickyNote className="w-3.5 h-3.5" />
                      <span>
                        {isDetailsOpen
                          ? 'Hide details & notes'
                          : 'Details & notes'}
                      </span>
                      {hasSavedDetailsOrNotes && !isDetailsOpen && (
                        <span
                          aria-label="Has saved details or notes"
                          className="w-1.5 h-1.5 rounded-full bg-accent"
                        />
                      )}
                    </Button>

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
                          <Ellipsis className="w-4 h-4" />
                        </IconButton>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-56 p-1">
                        <div role="menu">
                          <button
                            type="button"
                            role="menuitem"
                            onClick={() =>
                              onOpenStudio(activeApp.id, 'coverLetter', 'write')
                            }
                            className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                          >
                            <FileText className="w-3.5 h-3.5" />
                            <span>Open cover letter</span>
                          </button>
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

                {isDetailsOpen ? (
                  <ApplicationDetailsForm
                    postingUrl={activeApp.postingUrl}
                    appliedDate={activeApp.appliedDate}
                    notes={activeApp.notes}
                    onSave={(patch) => void handleSaveAppDetails(activeApp, patch)}
                  />
                ) : (
                  <div
                    data-testid="application-details-summary-bar"
                    className="flex flex-wrap items-center justify-between gap-3 px-3.5 py-2.5 rounded-lg bg-surface-sunken/50 border border-hairline text-xs"
                  >
                    <div className="flex flex-wrap items-center gap-4 min-w-0 flex-1">
                      <span className="inline-flex items-center gap-1.5 font-medium text-ink-muted shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-ink-subtle" />
                        <span>
                          {activeApp.appliedDate
                            ? `Applied ${formatLocaleUiDate(activeApp.appliedDate)}`
                            : 'No applied date set'}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1.5 text-ink-muted min-w-0 flex-1">
                        <StickyNote className="w-3.5 h-3.5 text-ink-subtle shrink-0" />
                        <span className="line-clamp-1 truncate max-w-md">
                          {activeApp.notes?.trim()
                            ? activeApp.notes.trim()
                            : 'Add posting URL, applied date, or interview notes…'}
                        </span>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setDetailsOpenByAppId((prev) => ({
                          ...prev,
                          [activeApp.id]: true,
                        }))
                      }
                      className="text-xs font-semibold text-accent hover:underline shrink-0 cursor-pointer"
                    >
                      {hasSavedDetailsOrNotes
                        ? 'Edit details & notes'
                        : 'Add details & notes'}
                    </button>
                  </div>
                )}

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
                            5-point band against your Experience Bank before
                            tailoring
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
                    className="grid grid-cols-2 sm:grid-cols-4 gap-3.5 items-stretch"
                  >
                    <div className="p-3.5 rounded-lg bg-surface-sunken/70 border border-hairline flex flex-col justify-between gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Tooltip content="Job match against posting requirements">
                          <span className="text-xs font-semibold text-ink-muted cursor-help whitespace-nowrap">
                            Job match
                          </span>
                        </Tooltip>
                        <Sparkline
                          values={chronoResumeVersions.map(
                            (v) => v.scores.jobMatch,
                          )}
                        />
                      </div>
                      <div className="flex items-baseline gap-2 h-9">
                        <span className="font-display text-[32px] font-bold text-ink leading-none tabular-nums">
                          {activeApp.latestScores.jobMatch}
                        </span>
                        <DeltaChip
                          delta={matchDelta}
                          referenceLabel={refVerLabel}
                        />
                      </div>
                      <p className="text-xs text-ink-muted truncate tabular-nums">
                        {activeApp.latestScores.coveredKeywords.length} covered
                        ·{' '}
                        {formatCount(
                          activeApp.latestScores.gapKeywords.length,
                          'gap',
                        )}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-surface-sunken/70 border border-hairline flex flex-col justify-between gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Tooltip content="Recruiter appeal (10-second skim estimate)">
                          <span className="text-xs font-semibold text-ink-muted cursor-help whitespace-nowrap">
                            Appeal
                          </span>
                        </Tooltip>
                        <Sparkline
                          values={chronoResumeVersions.map(
                            (v) => v.scores.recruiterAppeal ?? 80,
                          )}
                        />
                      </div>
                      <div className="flex items-baseline gap-2 h-9">
                        <span className="font-display text-[32px] font-bold text-ink leading-none tabular-nums">
                          {activeApp.latestScores.recruiterAppeal ?? 82}
                        </span>
                        <DeltaChip
                          delta={appealDelta}
                          referenceLabel={refVerLabel}
                        />
                      </div>
                      <p className="text-xs text-ink-muted truncate">
                        10-second skim
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-surface-sunken/70 border border-hairline flex flex-col justify-between gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Tooltip content="ATS readiness (single-column & text layer check)">
                          <span className="text-xs font-semibold text-ink-muted cursor-help whitespace-nowrap">
                            ATS
                          </span>
                        </Tooltip>
                        <Sparkline
                          values={chronoResumeVersions.map(
                            (v) => v.scores.atsReadiness,
                          )}
                          className="text-success"
                        />
                      </div>
                      <div className="flex items-baseline gap-2 h-9">
                        <span className="font-display text-[32px] font-bold text-ink leading-none tabular-nums">
                          {activeApp.latestScores.atsReadiness}
                        </span>
                        <DeltaChip
                          delta={atsDelta}
                          referenceLabel={refVerLabel}
                        />
                      </div>
                      <p className="text-xs text-ink-muted truncate tabular-nums">
                        Single-column · ~
                        {formatCount(
                          activeApp.latestScores.estimatedPages,
                          'page',
                        )}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-lg bg-surface-sunken/70 border border-hairline flex flex-col justify-between gap-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Tooltip content="Practical fit against your job preferences">
                          <span className="text-xs font-semibold text-ink-muted cursor-help whitespace-nowrap">
                            Fit
                          </span>
                        </Tooltip>
                      </div>
                      <div className="flex items-baseline gap-2 h-9">
                        <span className="font-display text-[32px] font-bold text-ink leading-none tabular-nums">
                          {activeFitInfo
                            ? `${
                                activeFitInfo.fit.fitsCount ??
                                activeFitInfo.fit.fittingItems?.length ??
                                0
                              }/${Math.max(
                                1,
                                activeFitInfo.fit.orderedItems?.length ??
                                  activeFitInfo.fit.items?.length ??
                                  5,
                              )}`
                            : '—'}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted truncate tabular-nums">
                        {activeFitInfo
                          ? activeFitInfo.fit.conflictCount > 0
                            ? `${formatCount(activeFitInfo.fit.conflictCount, 'conflict')}`
                            : 'No conflicts'
                          : 'Preferences check'}
                      </p>
                    </div>
                  </div>
                )}

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

                {activeApp.status === 'Prospect' ? (
                  activeCoverage &&
                  bank && <RequirementGroup summary={activeCoverage} bank={bank} />
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
                              `Saved ${
                                versionKindTab === 'coverLetter'
                                  ? 'cover letter'
                                  : 'resume'
                              } snapshot v${res.value.number}.`,
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
                        snapshots yet. Export or click “Save current draft” to
                        create v1.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {visibleVersionsForTab.map((ver, idx) => (
                          <VersionCard
                            key={ver.id}
                            version={ver}
                            bank={bank!}
                            targetCompany={activeApp.company}
                            targetRole={activeApp.roleTitle}
                            isLatest={idx === 0}
                            isSelectedForCompare={compareIds.includes(ver.id)}
                            onToggleCompare={() => handleToggleCompare(ver.id)}
                            onOpenInStudio={() =>
                              onOpenStudio(
                                activeApp.id,
                                ver.kind === 'coverLetter'
                                  ? 'coverLetter'
                                  : 'resume',
                                ver.kind === 'coverLetter' ? 'write' : 'build',
                              )
                            }
                            onExportVersion={async () => {
                              const r = await useCases.exportDocument.execute({
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
            {(comparedVersions[1].content?.bullets ?? []).map(
              (bRight, idx) => {
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
              },
            )}
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
