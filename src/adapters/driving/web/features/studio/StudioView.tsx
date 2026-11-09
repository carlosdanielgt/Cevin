import {
  AlertTriangle,
  ArrowUpDown,
  BookmarkCheck,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  Lock,
  Pencil,
  Plus,
  Redo2,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Undo2,
  Unlock,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CoverLetterAnalysisResult } from '../../../../../core/application';
import {
  Achievement,
  Application,
  BankRankingResult,
  BankSnapshot,
  CoverageFilter,
  CoverLetterBlockType,
  CoverLetterDraft,
  CoverLetterLength,
  CoverLetterPrioritizedFix,
  DocumentKind,
  DocumentVersion,
  Experience,
  JobFactKey,
  PageSize,
  PrioritizedFix,
  RequirementPriority,
  SkillCategory,
  StudioStep,
  TailoredBullet,
  TemplateId,
  UserPreferences,
  VoiceLevel,
  assembleBulletText,
  buildGroupedCoverageSummary,
  computeRecruiterAppeal,
  createDefaultCoverLetterDraft,
  evaluateFit,
  exportFilename,
  extractJobFactsByRules,
  formatAchievementInVoice,
  formatCount,
  mapApplicationToResumeDocument,
  mapToCoverLetterDocument,
  orderExperiencesForDraft,
  sanitizeExportFilenameInput,
  sortExperiencesChronologically,
  validateBulletGrounding,
} from '../../../../../core/domain';
import { useCevinUseCases, useUiStore } from '../../context';
import {
  AutoGrowTextarea,
  Badge,
  Banner,
  Button,
  Checkbox,
  Disclosure,
  IconButton,
  Input,
  Panel,
  PanelSection,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  SplitButton,
  SpotIllustration,
  StickyFooterBar,
  TagChip,
  Textarea,
  Tooltip,
} from '../../ui/primitives';
import {
  BulletRow,
  CompactStepper,
  CoverageSummary,
  DeskPreview,
  DocumentSwitch,
  GroupHeader,
  HeroScoreBand,
  IHaveThisModal,
  JobFactsStrip,
  LensBars,
  LetterBlock,
  PdfPreviewArtifactInfo,
  PracticalFitSummary,
  RequirementGroup,
  ScoreChip,
  TakeawayCard,
  VoiceControl,
} from '../../ui/signatures';

const SAMPLE_JOB_DESCRIPTION = `Staff Infrastructure & Platform Engineer — Kestrel Pay
Location: San Francisco, CA (Hybrid, 2 days in office)
Visa sponsorship available for qualified candidates.
Compensation: $195,000 - $230,000 USD base + equity.

About the role:
We are looking for a Staff Infrastructure Engineer to lead our multi-region Kubernetes compute platform and high-throughput telemetry ingestion pipeline.

Must-have requirements:
- 7+ years building production distributed systems in Go, Rust, or TypeScript
- Deep production experience with Kubernetes, Terraform, and AWS multi-region networking
- Track record scaling high-throughput data pipelines (Kafka, gRPC, PostgreSQL) with strict SLOs
- Experience with OpenTelemetry, Prometheus, and incident response

Nice-to-have:
- Experience with eBPF, FinOps cost optimization, or service mesh architecture`;

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

interface StudioHistoryEntry {
  app: Application;
  experiences: Experience[];
  appliedFixIds: string[];
}

function cloneHistoryEntry(entry: StudioHistoryEntry): StudioHistoryEntry {
  return JSON.parse(JSON.stringify(entry)) as StudioHistoryEntry;
}

export function StudioView({
  applicationId,
  activeDoc,
  activeStep,
  onNavigateStudio,
  onBackToApplications,
}: {
  applicationId: string;
  activeDoc: DocumentKind;
  activeStep: StudioStep;
  onNavigateStudio: (doc: DocumentKind, step: StudioStep) => void;
  onBackToApplications: () => void;
}) {
  const useCases = useCevinUseCases();
  const addToast = useUiStore((s) => s.addToast);
  const previewZoom = useUiStore((s) => s.previewZoom);
  const setPreviewZoom = useUiStore((s) => s.setPreviewZoom);
  const connectionStatus = useUiStore((s) => s.connectionStatus);
  const setConnectionStatus = useUiStore((s) => s.setConnectionStatus);

  const [app, setApp] = useState<Application | null>(null);
  const [bank, setBank] = useState<BankSnapshot | null>(null);
  const [preferences, setPreferences] = useState<UserPreferences | null>(null);
  const [versions, setVersions] = useState<DocumentVersion[]>([]);
  const [pageSize, setPageSize] = useState<PageSize>('letter');
  const [ranking, setRanking] = useState<BankRankingResult | null>(null);
  const [fixes, setFixes] = useState<PrioritizedFix[]>([]);
  const [letterAnalysis, setLetterAnalysis] =
    useState<CoverLetterAnalysisResult | null>(null);

  const [isAnalyzingJob, setIsAnalyzingJob] = useState(false);
  const [isTailoringAll, setIsTailoringAll] = useState(false);
  const [rewritingBulletId, setRewritingBulletId] = useState<string | null>(
    null,
  );
  const [justUpdatedIds, setJustUpdatedIds] = useState<string[]>([]);
  const [voiceEtaLabel, setVoiceEtaLabel] = useState<string>('');

  const [isGeneratingLetter, setIsGeneratingLetter] = useState(false);
  const [rewritingBlockId, setRewritingBlockId] = useState<string | null>(null);
  const [letterSetupOpen, setLetterSetupOpen] = useState(false);

  const [newReqText, setNewReqText] = useState('');
  const [newReqPriority, setNewReqPriority] =
    useState<RequirementPriority>('must-have');
  const [versionLabelInput, setVersionLabelInput] = useState('');
  const [isVerifyingPdf, setIsVerifyingPdf] = useState(false);
  const [highlightedSourceId, setHighlightedSourceId] = useState<string | null>(
    null,
  );
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [previewArtifact, setPreviewArtifact] =
    useState<PdfPreviewArtifactInfo | null>(null);
  const [highlightedTerm, setHighlightedTerm] = useState<string | null>(null);
  const [coverageFilter, setCoverageFilter] = useState<CoverageFilter>('all');
  const [iHaveThisTerm, setIHaveThisTerm] = useState<string | null>(null);
  const [highlightedPostingQuote, setHighlightedPostingQuote] = useState<
    string | null
  >(null);
  const [customExportName, setCustomExportName] = useState<string>('');
  const [applyingFixId, setApplyingFixId] = useState<string | null>(null);
  const [appliedFixIds, setAppliedFixIds] = useState<string[]>([]);
  const [undoStack, setUndoStack] = useState<StudioHistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<StudioHistoryEntry[]>([]);
  const [isResettingDraft, setIsResettingDraft] = useState(false);

  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
    setAppliedFixIds([]);
  }, [applicationId]);

  const recordHistorySnapshot = useCallback(
    (
      currentApp: Application,
      currentExperiences: Experience[],
      currentAppliedFixes: string[],
    ) => {
      const snapshot = cloneHistoryEntry({
        app: currentApp,
        experiences: currentExperiences,
        appliedFixIds: currentAppliedFixes,
      });
      setUndoStack((prev) => [...prev.slice(-29), snapshot]);
      setRedoStack([]);
    },
    [],
  );

  const refreshSidebarActivity = useCallback(async () => {
    const status = await useCases.testLlmConnection.getSidebarStatus();
    setConnectionStatus(status);
  }, [useCases, setConnectionStatus]);

  const reloadWorkspace = useCallback(async () => {
    const [loadedApp, loadedBank, loadedVersions, settings, loadedPrefs] =
      await Promise.all([
        useCases.manageApplications.getApplication(applicationId),
        useCases.manageBank.getBank(),
        useCases.manageApplications.listVersions(applicationId),
        useCases.manageSettings.getSettings(),
        useCases.managePreferences.getPreferences(),
      ]);
    setBank(loadedBank);
    setVersions(loadedVersions);
    setPageSize(settings.pageSize ?? 'letter');
    setPreferences(loadedPrefs);

    if (loadedApp) {
      setApp(loadedApp);
      if (loadedApp.parsedJob) {
        const rankRes = await useCases.rankBankItems.execute(loadedApp.id);
        if (rankRes.ok) setRanking(rankRes.value);
      }
      const scoreRes = await useCases.scoreResume.execute(loadedApp.id);
      if (scoreRes.ok) {
        setApp((prev) =>
          prev ? { ...prev, latestScores: scoreRes.value.scores } : prev,
        );
        setFixes(scoreRes.value.fixes);
      }
      const clScoreRes = await useCases.scoreCoverLetter.execute(loadedApp.id);
      if (clScoreRes.ok) {
        setLetterAnalysis(clScoreRes.value);
      }
    }
  }, [applicationId, useCases]);

  useEffect(() => {
    void reloadWorkspace();
  }, [reloadWorkspace]);

  // Keep default export filename synced when app/bank/activeDoc changes
  useEffect(() => {
    if (!app || !bank) return;
    setCustomExportName(
      exportFilename({
        fullName: bank.profile.name,
        company: app.company,
        kind: activeDoc,
        extension: 'pdf',
      }),
    );
  }, [app?.company, bank?.profile.name, activeDoc]);

  const persistApp = useCallback(
    async (
      updated: Application,
      options?: { skipHistory?: boolean; bankOverride?: BankSnapshot },
    ) => {
      if (!options?.skipHistory && app && bank) {
        recordHistorySnapshot(app, bank.experiences, appliedFixIds);
      }
      setApp(updated);
      const saved = await useCases.manageApplications.saveApplication(updated);
      setApp(saved);
      const scoreRes = await useCases.scoreResume.execute(saved.id);
      if (scoreRes.ok) {
        setApp((prev) =>
          prev ? { ...prev, latestScores: scoreRes.value.scores } : prev,
        );
        setFixes(scoreRes.value.fixes);
      }
      const clRes = await useCases.scoreCoverLetter.execute(saved.id);
      if (clRes.ok) {
        setLetterAnalysis(clRes.value);
      }
    },
    [app, bank, appliedFixIds, recordHistorySnapshot, useCases],
  );

  const handleUndo = useCallback(async () => {
    if (!app || !bank || undoStack.length === 0) return;
    const prevEntry = undoStack[undoStack.length - 1];
    const currentSnapshot = cloneHistoryEntry({
      app,
      experiences: bank.experiences,
      appliedFixIds,
    });
    setUndoStack((prev) => prev.slice(0, -1));
    setRedoStack((prev) => [...prev, currentSnapshot]);

    const restoredBank = await useCases.manageBank.saveBank({
      ...bank,
      experiences: prevEntry.experiences,
    });
    setBank(restoredBank);
    setAppliedFixIds(prevEntry.appliedFixIds);
    await persistApp(prevEntry.app, { skipHistory: true });
    addToast('Undid last change.', 'neutral');
  }, [app, bank, undoStack, appliedFixIds, useCases, persistApp, addToast]);

  const handleRedo = useCallback(async () => {
    if (!app || !bank || redoStack.length === 0) return;
    const nextEntry = redoStack[redoStack.length - 1];
    const currentSnapshot = cloneHistoryEntry({
      app,
      experiences: bank.experiences,
      appliedFixIds,
    });
    setRedoStack((prev) => prev.slice(0, -1));
    setUndoStack((prev) => [...prev, currentSnapshot]);

    const restoredBank = await useCases.manageBank.saveBank({
      ...bank,
      experiences: nextEntry.experiences,
    });
    setBank(restoredBank);
    setAppliedFixIds(nextEntry.appliedFixIds);
    await persistApp(nextEntry.app, { skipHistory: true });
    addToast('Redid change.', 'neutral');
  }, [app, bank, redoStack, appliedFixIds, useCases, persistApp, addToast]);

  const handleResetToDefault = useCallback(async () => {
    if (!app || !bank || isResettingDraft) return;
    recordHistorySnapshot(app, bank.experiences, appliedFixIds);
    setIsResettingDraft(true);
    try {
      const res = await useCases.tailorResume.resetToDefault(app.id);
      if (res.ok) {
        setAppliedFixIds([]);
        setApp(res.value);
        await reloadWorkspace();
        addToast('Reset resume to default generated draft.', 'success');
      } else {
        addToast(res.error.message, 'danger');
      }
    } finally {
      setIsResettingDraft(false);
    }
  }, [
    app,
    bank,
    isResettingDraft,
    appliedFixIds,
    recordHistorySnapshot,
    useCases,
    reloadWorkspace,
    addToast,
  ]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditable =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable);
      if (isEditable) return;

      const isMod = e.metaKey || e.ctrlKey;
      if (!isMod) return;

      if (e.key.toLowerCase() === 'z' && !e.shiftKey) {
        if (undoStack.length > 0) {
          e.preventDefault();
          void handleUndo();
        }
      } else if (
        (e.key.toLowerCase() === 'z' && e.shiftKey) ||
        e.key.toLowerCase() === 'y'
      ) {
        if (redoStack.length > 0) {
          e.preventDefault();
          void handleRedo();
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [undoStack.length, redoStack.length, handleUndo, handleRedo]);

  const groupedCoverage = useMemo(() => {
    if (!app || !bank) return null;
    const resumeProse = [
      app.workingDraft.targetHeadline,
      app.workingDraft.summary,
      ...app.workingDraft.bullets.map((b) => b.text),
    ].join(' ');
    return buildGroupedCoverageSummary({
      parsedJob: app.parsedJob,
      bank,
      resumeText: resumeProse,
      dismissedRequirementIds: app.dismissedRequirementIds ?? [],
    });
  }, [app, bank]);

  const jobFactsAndFit = useMemo(() => {
    if (!app) return null;
    const facts =
      app.jobFacts ?? extractJobFactsByRules(app.jobDescription ?? '').facts;
    const fit = evaluateFit(facts, preferences);
    return { facts, fit };
  }, [app, preferences]);

  const appealDetails = useMemo(() => {
    if (!app || !bank) return null;
    const doc = mapApplicationToResumeDocument(app, bank, 1);
    return computeRecruiterAppeal({
      application: app,
      bank,
      doc,
      positionedText:
        previewArtifact?.positionedText ??
        app.latestScores.roundTrip?.positionedText,
    });
  }, [app, bank, previewArtifact?.positionedText]);

  if (!app || !bank) {
    return (
      <div className="p-8 text-sm text-ink-muted">
        Loading Studio workspace…
      </div>
    );
  }

  const clDraft: CoverLetterDraft =
    app.coverLetterDraft ??
    app.documents?.coverLetter ??
    createDefaultCoverLetterDraft(app, bank);

  const resumeDoc = mapApplicationToResumeDocument(
    app,
    bank,
    versions.filter((v) => (v.kind ?? 'resume') === 'resume').length + 1,
    pageSize,
  );

  const coverLetterDoc = mapToCoverLetterDocument({
    draft: clDraft,
    bank,
    versionNumber:
      versions.filter((v) => v.kind === 'coverLetter').length + 1,
    templateId: app.templateId,
    pageSize,
    targetCompany: app.company,
    targetRole: app.roleTitle,
    generatedAt: app.updatedAt,
  });

  // Compute version score deltas vs previous saved version (only non-zero displayed by DeltaChip)
  const docVersions = versions
    .filter((v) => (v.kind ?? 'resume') === activeDoc)
    .sort((a, b) => a.number - b.number);
  const currentJobMatch =
    activeDoc === 'coverLetter' && letterAnalysis
      ? letterAnalysis.jobMatch
      : app.latestScores.jobMatch;
  const currentAppeal =
    activeDoc === 'coverLetter'
      ? (letterAnalysis?.report.letterAppeal ?? 84)
      : (app.latestScores.recruiterAppeal ?? 82);
  const latestSavedVer =
    docVersions.length > 0 ? docVersions[docVersions.length - 1] : undefined;
  const prevSavedVersion =
    docVersions.length >= 2 &&
    latestSavedVer &&
    latestSavedVer.scores.jobMatch === currentJobMatch &&
    (latestSavedVer.scores.recruiterAppeal ??
      latestSavedVer.scores.appeal) === currentAppeal
      ? docVersions[docVersions.length - 2]
      : latestSavedVer;
  const referenceVersionLabel = prevSavedVersion
    ? `v${prevSavedVersion.number}`
    : undefined;
  const jobMatchDelta = prevSavedVersion
    ? currentJobMatch - prevSavedVersion.scores.jobMatch
    : undefined;
  const appealDelta = prevSavedVersion
    ? currentAppeal -
      (prevSavedVersion.scores.recruiterAppeal ??
        prevSavedVersion.scores.appeal ??
        82)
    : undefined;
  const atsDelta =
    prevSavedVersion && activeDoc === 'resume'
      ? app.latestScores.atsReadiness - prevSavedVersion.scores.atsReadiness
      : undefined;

  const completedSteps: StudioStep[] = [];
  if (app.parsedJob) completedSteps.push('job');
  if (app.workingDraft.bullets.length > 0) completedSteps.push('build');
  if (clDraft.blocks.length > 0) completedSteps.push('write');

  const orderedExperiences = orderExperiencesForDraft(
    bank.experiences,
    app.workingDraft.experienceOrder,
  );

  // Handlers
  const handleAnalyzeJob = async () => {
    if (!app.jobDescription.trim()) {
      addToast('Paste a job description first.', 'warning');
      return;
    }
    recordHistorySnapshot(app, bank.experiences, appliedFixIds);
    setIsAnalyzingJob(true);
    void refreshSidebarActivity();
    const res = await useCases.analyzeJobDescription.execute(
      app.id,
      app.jobDescription,
    );
    setIsAnalyzingJob(false);
    void refreshSidebarActivity();

    if (!res.ok) {
      addToast(res.error.message, 'danger');
      return;
    }
    setApp(res.value.application);
    await reloadWorkspace();
    addToast('Extracted job requirements, job facts, and assembled draft.', 'success');
    onNavigateStudio(
      activeDoc,
      activeDoc === 'coverLetter' ? 'write' : 'build',
    );
  };

  const handleVoiceChange = async (nextVoice: VoiceLevel) => {
    recordHistorySnapshot(app, bank.experiences, appliedFixIds);
    const quickRes = await useCases.tailorResume.applyQuickVoicePass(
      app.id,
      nextVoice,
    );
    if (quickRes.ok) {
      setApp(quickRes.value.application);
      setVoiceEtaLabel(quickRes.value.etaLabel);
      setJustUpdatedIds(quickRes.value.updatedBulletIds);
      setTimeout(() => setJustUpdatedIds([]), 700);
    }

    setIsTailoringAll(true);
    void refreshSidebarActivity();
    const fullRes = await useCases.tailorResume.tailorAll(
      app.id,
      nextVoice,
      (bulletId, updatedApp) => {
        setApp(updatedApp);
        setJustUpdatedIds((prev) => [...prev, bulletId]);
        setTimeout(() => {
          setJustUpdatedIds((prev) => prev.filter((id) => id !== bulletId));
        }, 650);
      },
    );
    setIsTailoringAll(false);
    void refreshSidebarActivity();
    if (fullRes.ok) {
      setApp(fullRes.value);
      await reloadWorkspace();
    }
  };

  const handleSortExperiencesChronologically = async () => {
    recordHistorySnapshot(app, bank.experiences, appliedFixIds);
    const sorted = sortExperiencesChronologically(bank.experiences);
    const nextBank = await useCases.manageBank.saveBank({
      ...bank,
      experiences: sorted,
    });
    setBank(nextBank);

    const nextExperienceOrder = sorted.map((e) => e.id);
    const updatedApp: Application = {
      ...app,
      workingDraft: {
        ...app.workingDraft,
        experienceOrder: nextExperienceOrder,
      },
    };
    await persistApp(updatedApp, { skipHistory: true });
    addToast('Experiences sorted chronologically (newest first).', 'success');
  };

  const handleMoveExperience = async (
    expId: string,
    direction: 'up' | 'down',
  ) => {
    const currentOrdered = orderExperiencesForDraft(
      bank.experiences,
      app.workingDraft.experienceOrder,
    );
    const idx = currentOrdered.findIndex((e) => e.id === expId);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= currentOrdered.length) return;

    recordHistorySnapshot(app, bank.experiences, appliedFixIds);

    const nextOrdered = [...currentOrdered];
    const [moved] = nextOrdered.splice(idx, 1);
    nextOrdered.splice(targetIdx, 0, moved);
    const stamped = nextOrdered.map((exp, orderIdx) => ({
      ...exp,
      sortOrder: orderIdx,
    }));

    const nextBank = await useCases.manageBank.saveBank({
      ...bank,
      experiences: stamped,
    });
    setBank(nextBank);

    const updatedApp: Application = {
      ...app,
      workingDraft: {
        ...app.workingDraft,
        experienceOrder: stamped.map((e) => e.id),
      },
    };
    await persistApp(updatedApp, { skipHistory: true });
    addToast(`Moved experience ${direction}.`, 'neutral');
  };

  const handleRewriteBullet = async (bulletId: string) => {
    recordHistorySnapshot(app, bank.experiences, appliedFixIds);
    setRewritingBulletId(bulletId);
    void refreshSidebarActivity();
    const res = await useCases.tailorResume.regenerateBullet(
      app.id,
      bulletId,
      app.voice,
      Date.now(),
    );
    setRewritingBulletId(null);
    void refreshSidebarActivity();
    if (res.ok) {
      setApp(res.value);
      setJustUpdatedIds([bulletId]);
      setTimeout(() => setJustUpdatedIds([]), 700);
      await reloadWorkspace();
    }
  };

  const handleRewriteSummary = async () => {
    recordHistorySnapshot(app, bank.experiences, appliedFixIds);
    setIsTailoringAll(true);
    void refreshSidebarActivity();
    const res = await useCases.tailorResume.regenerateSummary(
      app.id,
      app.voice,
    );
    setIsTailoringAll(false);
    void refreshSidebarActivity();
    if (res.ok) {
      setApp(res.value);
      await reloadWorkspace();
      addToast('Updated executive summary.', 'success');
    }
  };

  const handleAddSkillFromGap = async (term: string) => {
    const nextBank = await useCases.manageBank.addSkillFromGap(term);
    setBank(nextBank);
    const addedSkill = nextBank.skills.find(
      (s) => s.name.toLowerCase() === term.toLowerCase(),
    );
    if (
      addedSkill &&
      !app.workingDraft.selectedSkillIds.includes(addedSkill.id)
    ) {
      await persistApp({
        ...app,
        workingDraft: {
          ...app.workingDraft,
          selectedSkillIds: [
            ...app.workingDraft.selectedSkillIds,
            addedSkill.id,
          ],
        },
      });
    }
    await reloadWorkspace();
    addToast(`Added "${term}" to your Experience Bank.`, 'success');
  };

  const handleIHaveThisSubmit = async (params: {
    skillName: string;
    category: SkillCategory;
    aliases: string[];
    achievementId?: string;
  }) => {
    const res = await useCases.manageBank.addSkillAndOptionalAchievement({
      ...params,
      applicationId: app.id,
    });
    setBank(res.bank);
    if (res.application) {
      setApp(res.application);
    }
    await reloadWorkspace();
    addToast(
      `Added "${params.skillName}" to your Experience Bank and rescored.`,
      'success',
    );
  };

  const handleDismissRequirement = async (reqId: string) => {
    const updated = await useCases.manageApplications.dismissRequirement(
      app.id,
      reqId,
    );
    if (updated) {
      setApp(updated);
      await reloadWorkspace();
      addToast('Marked requirement as not relevant.', {
        variant: 'info',
        actionLabel: 'Undo',
        onAction: () => {
          void handleRestoreDismissed(reqId);
        },
      });
    }
  };

  const handleRestoreDismissed = async (reqId?: string) => {
    const updated =
      await useCases.manageApplications.restoreDismissedRequirement(
        app.id,
        reqId,
      );
    if (updated) {
      setApp(updated);
      await reloadWorkspace();
    }
  };

  const handleOverrideFact = async (key: JobFactKey, nextValue: unknown) => {
    const res = await useCases.extractJobFacts.overrideFact(
      app.id,
      key,
      nextValue,
    );
    if (res.ok) {
      setApp(res.value);
      addToast('Updated job fact.', 'success');
    }
  };

  const handleIncludeBankAchievement = async (ach: Achievement) => {
    const newBullet: TailoredBullet = {
      id: `bullet-${ach.id}`,
      experienceId: ach.experienceId,
      text: formatAchievementInVoice(ach, app.voice, 0),
      originalText: assembleBulletText(ach),
      sourceIds: [ach.id],
      locked: false,
      unverifiedClaims: [],
      origin: 'bank',
    };
    const nextBullets = [...app.workingDraft.bullets, newBullet];
    const nextSelectedIds = Array.from(
      new Set([...app.workingDraft.selectedAchievementIds, ach.id]),
    );
    await persistApp({
      ...app,
      workingDraft: {
        ...app.workingDraft,
        selectedAchievementIds: nextSelectedIds,
        bullets: nextBullets,
      },
    });
  };

  const handleRegenerateLetter = async (overrides?: {
    recipient?: string;
    length?: CoverLetterLength;
    selectedProofAchievementIds?: string[];
    whyCompanyNotes?: string;
    voice?: VoiceLevel;
  }) => {
    setIsGeneratingLetter(true);
    void refreshSidebarActivity();
    const res = await useCases.generateCoverLetter.execute({
      applicationId: app.id,
      recipient: overrides?.recipient ?? clDraft.recipient,
      length: overrides?.length ?? clDraft.length,
      selectedProofAchievementIds:
        overrides?.selectedProofAchievementIds ??
        clDraft.selectedProofAchievementIds,
      whyCompanyNotes: overrides?.whyCompanyNotes ?? clDraft.whyCompanyNotes,
      voice: overrides?.voice ?? clDraft.voice,
    });
    setIsGeneratingLetter(false);
    void refreshSidebarActivity();
    if (res.ok) {
      setApp(res.value);
      await reloadWorkspace();
      addToast('Cover letter updated from your Bank proof points.', 'success');
    }
  };

  const handleRewriteLetterBlock = async (
    blockId: string,
    blockType: CoverLetterBlockType,
  ) => {
    setRewritingBlockId(blockId);
    void refreshSidebarActivity();
    const res = await useCases.generateCoverLetter.rewriteBlock({
      applicationId: app.id,
      blockId,
      blockType,
      voice: clDraft.voice,
    });
    setRewritingBlockId(null);
    void refreshSidebarActivity();
    if (res.ok) {
      setApp(res.value);
      await reloadWorkspace();
    }
  };

  const handleExport = async (
    exporterId: string,
    kind: DocumentKind = activeDoc,
  ) => {
    const ext =
      exporterId === 'markdown' ? 'md' : exporterId === 'text' ? 'txt' : 'pdf';
    const defaultForKind = exportFilename({
      fullName: bank.profile.name,
      company: app.company,
      kind,
      extension: ext,
    });
    const desiredName =
      kind === activeDoc && customExportName.trim()
        ? sanitizeExportFilenameInput(customExportName, ext)
        : defaultForKind;

    const targetDoc =
      kind === 'coverLetter' ? coverLetterDoc : resumeDoc;
    const isCurrentPreviewDoc =
      kind === activeDoc &&
      previewArtifact &&
      previewArtifact.contentHash === targetDoc.contentHash;

    const res = await useCases.exportDocument.execute({
      applicationId: app.id,
      exporterId,
      templateId: app.templateId,
      pageSize,
      kind,
      document: targetDoc,
      contentHash: targetDoc.contentHash,
      previewBytes:
        exporterId === 'pdf' && isCurrentPreviewDoc
          ? previewArtifact.bytes
          : undefined,
      autoSaveVersion: true,
      customFileName: desiredName,
    });
    if (!res.ok) {
      addToast(res.error.message, 'danger');
      return;
    }
    triggerBlobDownload(res.value.blob, res.value.fileName);
    await reloadWorkspace();
    addToast(`Exported ${res.value.fileName}`, 'success');
  };

  const handleSaveSnapshot = async () => {
    const res = await useCases.saveDocumentVersion.execute(
      app.id,
      versionLabelInput.trim() || undefined,
      activeDoc,
    );
    if (res.ok) {
      setVersionLabelInput('');
      await reloadWorkspace();
      addToast(`Saved version v${res.value.number}.`, 'success');
    }
  };

  const handleVerifyPdfRoundTrip = async () => {
    setIsVerifyingPdf(true);
    const res = await useCases.scoreResume.execute(app.id, {
      runRoundTrip: true,
    });
    setIsVerifyingPdf(false);
    if (res.ok) {
      setApp((prev) =>
        prev ? { ...prev, latestScores: res.value.scores } : prev,
      );
      setFixes(res.value.fixes);
      addToast('Verified PDF text extraction and reading order.', 'success');
    }
  };

  const gapCount = app.latestScores.gapKeywords.length;
  const skimKeywordTerms = (app.parsedJob?.requirements ?? [])
    .filter((r) => r.priority === 'must-have')
    .map((r) => r.text);

  const isLlmActive = Boolean(
    rewritingBulletId ||
      isTailoringAll ||
      isGeneratingLetter ||
      rewritingBlockId ||
      isAnalyzingJob ||
      connectionStatus.state === 'busy' ||
      connectionStatus.state === 'warming',
  );

  const llmActiveLabel = rewritingBulletId
    ? `Rewriting bullet in ${app.voice} voice…`
    : isTailoringAll
      ? 'Writing executive summary…'
      : isGeneratingLetter
        ? `Writing cover letter with ${connectionStatus.modelName || 'LLM'}…`
        : rewritingBlockId
          ? 'Rewriting paragraph…'
          : isAnalyzingJob
            ? 'Extracting job requirements…'
            : connectionStatus.state === 'warming'
              ? 'Warming model…'
              : 'Working…';

  return (
    <div className="space-y-4">
      {/* Slim 2-Row Studio Header */}
      <header className="space-y-2 pb-1">
        {/* Row 1 (36px): Back chevron + breadcrumb on left; autosave & Three ScoreChips on right */}
        <div className="flex flex-wrap items-center justify-between gap-3 min-h-[36px]">
          <div className="flex items-center gap-2 min-w-0">
            <button
              type="button"
              onClick={onBackToApplications}
              className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted hover:text-ink transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
              <span>Applications</span>
            </button>
            <span className="text-ink-subtle">/</span>
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title="Click to edit target company or role title"
                  className="inline-flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-md hover:bg-surface-sunken text-sm font-semibold text-ink group cursor-pointer transition-colors"
                >
                  <span className="truncate">
                    {app.company} · {app.roleTitle}
                  </span>
                  <Pencil className="w-3 h-3 text-ink-muted opacity-50 group-hover:opacity-100 transition-opacity" />
                </button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-80 p-4 space-y-3">
                <div className="text-xs font-semibold text-ink">
                  Edit Application Target
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-muted mb-1">
                    Target company
                  </label>
                  <Input
                    value={app.company}
                    onChange={(e) => {
                      const updated = {
                        ...app,
                        company: e.target.value,
                        parsedJob: app.parsedJob
                          ? { ...app.parsedJob, company: e.target.value }
                          : null,
                      };
                      setApp(updated);
                      void persistApp(updated);
                    }}
                    placeholder="e.g. Kestrel Pay"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-ink-muted mb-1">
                    Target role title
                  </label>
                  <Input
                    value={app.roleTitle}
                    onChange={(e) => {
                      const updated = {
                        ...app,
                        roleTitle: e.target.value,
                        parsedJob: app.parsedJob
                          ? { ...app.parsedJob, title: e.target.value }
                          : null,
                      };
                      setApp(updated);
                      void persistApp(updated);
                    }}
                    placeholder="e.g. Senior Software Developer"
                  />
                </div>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex items-center gap-3">
            {isLlmActive ? (
              <span className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-accent-50 text-accent-700 border border-accent/30 text-xs font-medium animate-pulse">
                <span className="w-2 h-2 rounded-full bg-accent animate-ping" />
                <span>{llmActiveLabel}</span>
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 text-xs text-ink-muted">
                <span className="w-2 h-2 rounded-full bg-success" />
                <span>Saved just now</span>
              </span>
            )}

            <div className="flex items-center gap-2">
              {activeDoc === 'coverLetter' ? (
                <>
                  <ScoreChip
                    label="Match"
                    score={
                      letterAnalysis?.jobMatch ?? app.latestScores.jobMatch
                    }
                    onClick={() => onNavigateStudio('coverLetter', 'review')}
                  />
                  <ScoreChip
                    label="Appeal"
                    score={letterAnalysis?.report.letterAppeal ?? 84}
                    isEstimate={true}
                    tooltipText="An estimate of letter opening hook, grounded proof points, and natural voice."
                    onClick={() => onNavigateStudio('coverLetter', 'review')}
                  />
                  <ScoreChip
                    label="Checks"
                    fraction={{
                      passed: letterAnalysis?.report.passedCount ?? 6,
                      total: letterAnalysis?.report.totalCount ?? 6,
                    }}
                    onClick={() => onNavigateStudio('coverLetter', 'review')}
                  />
                </>
              ) : (
                <>
                  <ScoreChip
                    label="Match"
                    score={app.latestScores.jobMatch}
                    onClick={() => onNavigateStudio('resume', 'review')}
                  />
                  <ScoreChip
                    label="Appeal"
                    score={
                      appealDetails?.total ??
                      app.latestScores.recruiterAppeal ??
                      82
                    }
                    isEstimate={true}
                    tooltipText="An estimate based on common recruiter screening patterns (10-second skim). It does not predict hiring outcomes."
                    onClick={() => onNavigateStudio('resume', 'review')}
                  />
                  <ScoreChip
                    label="ATS"
                    score={app.latestScores.atsReadiness}
                    onClick={() => onNavigateStudio('resume', 'review')}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        {/* Row 2 (40px): DocumentSwitch + Undo/Redo/Reset on left; circular Stepper on right */}
        <div className="flex flex-wrap items-center justify-between gap-3 min-h-[40px]">
          <div className="flex flex-wrap items-center gap-2">
            <DocumentSwitch
              value={activeDoc}
              onChange={(nextDoc) => {
                const targetStep: StudioStep =
                  activeStep === 'build' && nextDoc === 'coverLetter'
                    ? 'write'
                    : activeStep === 'write' && nextDoc === 'resume'
                      ? 'build'
                      : activeStep;
                onNavigateStudio(nextDoc, targetStep);
              }}
            />

            <div className="flex items-center gap-1 pl-1 border-l border-hairline">
              <IconButton
                label="Undo last action"
                size="sm"
                disabled={undoStack.length === 0}
                onClick={() => void handleUndo()}
              >
                <Undo2 className="w-3.5 h-3.5" />
              </IconButton>
              <IconButton
                label="Redo action"
                size="sm"
                disabled={redoStack.length === 0}
                onClick={() => void handleRedo()}
              >
                <Redo2 className="w-3.5 h-3.5" />
              </IconButton>
              <Button
                variant="ghost"
                size="sm"
                disabled={isResettingDraft}
                onClick={() => void handleResetToDefault()}
                title="Reset resume to the default generated draft"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{isResettingDraft ? 'Resetting…' : 'Reset to default'}</span>
              </Button>
            </div>
          </div>

          <CompactStepper
            documentKind={activeDoc}
            activeStep={activeStep}
            completedSteps={completedSteps}
            onSelectStep={(nextStep) => onNavigateStudio(activeDoc, nextStep)}
          />
        </div>
      </header>

      {/* Subtle editorial working progress bar */}
      {isLlmActive && (
        <div
          role="progressbar"
          aria-label={llmActiveLabel}
          aria-busy="true"
          className="h-1 w-full bg-accent-100 rounded-full overflow-hidden -mt-2 mb-2"
        >
          <div className="h-full bg-accent animate-pulse w-full transition-all duration-300" />
        </div>
      )}

      {/* Split Workspace: 12-col grid (Left 5 cols Work Panel, Right 7 cols DeskPreview) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Work Panel */}
        <div className="lg:col-span-5">
          <Panel className="overflow-hidden">
            {/* ==================== STEP 1: JOB ==================== */}
            {activeStep === 'job' && (
              <div>
                {!app.parsedJob ? (
                  /* Pre-extraction Paste Hero */
                  <PanelSection className="space-y-5">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h2 className="text-lg font-display font-semibold text-ink">
                          Paste the job posting
                        </h2>
                        <p className="text-xs text-ink-muted mt-1">
                          Cevin extracts must-have requirements and practical job facts locally and matches them against your Experience Bank.
                        </p>
                      </div>
                      <Button
                        variant="tonal"
                        size="sm"
                        onClick={() => {
                          setApp({
                            ...app,
                            company: 'Kestrel Pay',
                            roleTitle: 'Staff Infrastructure Engineer',
                            jobDescription: SAMPLE_JOB_DESCRIPTION,
                          });
                        }}
                      >
                        Try sample posting
                      </Button>
                    </div>

                    {!app.jobDescription.trim() && (
                      <div className="flex items-center gap-4 p-3.5 rounded-lg bg-surface-sunken border border-hairline">
                        <SpotIllustration
                          kind="job"
                          className="w-20 h-16 shrink-0"
                        />
                        <p className="text-xs text-ink-muted leading-relaxed">
                          Paste the full job description below. Every requirement will be checked against your verified Experience Bank items.
                        </p>
                      </div>
                    )}

                    <div className="space-y-3">
                      <div>
                        <label
                          htmlFor="job-role-title-input"
                          className="block text-xs font-medium text-ink mb-1"
                        >
                          Role title
                        </label>
                        <Input
                          id="job-role-title-input"
                          value={app.roleTitle}
                          onChange={(e) =>
                            setApp({ ...app, roleTitle: e.target.value })
                          }
                          placeholder="e.g. Staff Infrastructure & Platform Engineer"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="job-company-input"
                            className="block text-xs font-medium text-ink mb-1"
                          >
                            Company
                          </label>
                          <Input
                            id="job-company-input"
                            value={app.company}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = {
                                ...app,
                                company: val,
                                parsedJob: app.parsedJob
                                  ? { ...app.parsedJob, company: val }
                                  : null,
                              };
                              setApp(updated);
                              void persistApp(updated);
                            }}
                            placeholder="e.g. Kestrel Pay"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink mb-1">
                            Detected seniority
                          </label>
                          <div className="h-9 px-3 rounded-md bg-surface-sunken border border-hairline flex items-center text-xs text-ink-muted">
                            Auto-detected on extraction
                          </div>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="raw-jd-textarea"
                          className="block text-xs font-medium text-ink mb-1"
                        >
                          Job description
                        </label>
                        <Textarea
                          id="raw-jd-textarea"
                          rows={11}
                          value={app.jobDescription}
                          onChange={(e) =>
                            setApp({ ...app, jobDescription: e.target.value })
                          }
                          placeholder="Paste responsibilities, requirements, and qualifications here…"
                        />
                      </div>
                    </div>
                  </PanelSection>
                ) : (
                  /* Post-extraction Structured Job View */
                  <>
                    <PanelSection className="space-y-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-base font-display font-semibold text-ink">
                          Role details & practical fit
                        </h2>
                      </div>
                      <div className="space-y-2.5">
                        <div>
                          <label
                            htmlFor="parsed-role-title"
                            className="block text-xs font-medium text-ink-muted mb-1"
                          >
                            Role title
                          </label>
                          <Input
                            id="parsed-role-title"
                            value={app.roleTitle}
                            onChange={(e) => {
                              const val = e.target.value;
                              const updated = {
                                ...app,
                                roleTitle: val,
                                parsedJob: app.parsedJob
                                  ? { ...app.parsedJob, title: val }
                                  : null,
                              };
                              setApp(updated);
                              void persistApp(updated);
                            }}
                          />
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label
                              htmlFor="parsed-company"
                              className="block text-xs font-medium text-ink-muted mb-1"
                            >
                              Company
                            </label>
                            <Input
                              id="parsed-company"
                              value={app.company}
                              onChange={(e) => {
                                const val = e.target.value;
                                const updated = {
                                  ...app,
                                  company: val,
                                  parsedJob: app.parsedJob
                                    ? { ...app.parsedJob, company: val }
                                    : null,
                                };
                                setApp(updated);
                                void persistApp(updated);
                              }}
                            />
                          </div>
                          <div>
                            <label
                              htmlFor="parsed-seniority"
                              className="block text-xs font-medium text-ink-muted mb-1"
                            >
                              Seniority
                            </label>
                            <Input
                              id="parsed-seniority"
                              value={app.parsedJob.seniority}
                              onChange={(e) => {
                                const val = e.target.value;
                                void persistApp({
                                  ...app,
                                  parsedJob: app.parsedJob
                                    ? { ...app.parsedJob, seniority: val }
                                    : null,
                                });
                              }}
                            />
                          </div>
                        </div>
                      </div>

                      {/* Job Facts Strip (5 FactTiles with EvidencePopover, Show in posting, Edit override, Copy question) */}
                      {jobFactsAndFit && (
                        <div className="pt-2">
                          <JobFactsStrip
                            facts={jobFactsAndFit.facts}
                            evaluation={jobFactsAndFit.fit}
                            onShowInPosting={(quote) => {
                              setHighlightedPostingQuote(quote);
                            }}
                            onOverrideFact={(key, val) =>
                              void handleOverrideFact(key, val)
                            }
                            onCopyText={(text) => {
                              if (navigator.clipboard) {
                                void navigator.clipboard.writeText(text);
                              }
                              addToast(
                                'Copied recruiter question to clipboard.',
                                'success',
                              );
                            }}
                          />
                        </div>
                      )}
                    </PanelSection>

                    {/* Coverage Summary + RequirementGroup (Needs attention first, Covered collapsed by default) */}
                    <PanelSection className="space-y-4">
                      {groupedCoverage && (
                        <>
                          <CoverageSummary
                            summary={groupedCoverage}
                            activeFilter={coverageFilter}
                            onFilterChange={setCoverageFilter}
                            onUndoDismiss={() => void handleRestoreDismissed()}
                          />

                          <RequirementGroup
                            summary={groupedCoverage}
                            bank={bank}
                            activeFilter={coverageFilter}
                            highlightedTerm={highlightedTerm}
                            onSelectCoveredTerm={setHighlightedTerm}
                            onAddToBank={(term) =>
                              void handleAddSkillFromGap(term)
                            }
                            onIHaveThis={(term) => setIHaveThisTerm(term)}
                            onDismissRequirement={(reqId) =>
                              void handleDismissRequirement(reqId)
                            }
                          />
                        </>
                      )}

                      {/* Add custom requirement */}
                      <div className="flex items-center gap-2 pt-2 border-t border-hairline">
                        <Input
                          value={newReqText}
                          onChange={(e) => setNewReqText(e.target.value)}
                          placeholder="Add requirement…"
                          className="h-8 text-xs"
                        />
                        <SegmentedControl<RequirementPriority>
                          ariaLabel="Requirement priority"
                          size="sm"
                          value={newReqPriority}
                          onValueChange={setNewReqPriority}
                          options={[
                            { value: 'must-have', label: 'Must' },
                            { value: 'nice-to-have', label: 'Nice' },
                          ]}
                        />
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            if (!newReqText.trim() || !app.parsedJob) return;
                            const nextReqs = [
                              ...app.parsedJob.requirements,
                              {
                                id: `req-${Date.now()}`,
                                text: newReqText.trim(),
                                normalizedKey: newReqText.trim().toLowerCase(),
                                priority: newReqPriority,
                                category: 'hard-skill' as const,
                              },
                            ];
                            setNewReqText('');
                            void persistApp({
                              ...app,
                              parsedJob: {
                                ...app.parsedJob,
                                requirements: nextReqs,
                              },
                            });
                          }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Add</span>
                        </Button>
                      </div>
                    </PanelSection>

                    {/* Collapsible Raw Job Posting (with highlighted quote support) */}
                    <PanelSection>
                      <Disclosure
                        title="Raw job posting"
                        defaultOpen={Boolean(highlightedPostingQuote)}
                        badge={
                          <Badge tone="neutral">
                            {formatCount(
                              app.jobDescription
                                .trim()
                                .split(/\s+/)
                                .filter(Boolean).length,
                              'word',
                            )}
                          </Badge>
                        }
                      >
                        <div className="space-y-3">
                          {highlightedPostingQuote && (
                            <div className="p-2.5 rounded-md bg-accent-50 border border-accent/30 flex items-center justify-between gap-2 text-xs">
                              <span className="text-ink">
                                Highlighted quote:{' '}
                                <strong className="font-semibold">
                                  “{highlightedPostingQuote}”
                                </strong>
                              </span>
                              <button
                                type="button"
                                onClick={() => setHighlightedPostingQuote(null)}
                                className="text-ink-muted hover:text-ink underline cursor-pointer"
                              >
                                Clear
                              </button>
                            </div>
                          )}
                          <Textarea
                            rows={7}
                            value={app.jobDescription}
                            onChange={(e) =>
                              setApp({ ...app, jobDescription: e.target.value })
                            }
                          />
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="secondary"
                              disabled={isAnalyzingJob}
                              onClick={() => void handleAnalyzeJob()}
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              <span>Re-extract requirements</span>
                            </Button>
                          </div>
                        </div>
                      </Disclosure>
                    </PanelSection>
                  </>
                )}

                <StickyFooterBar>
                  <span className="text-xs text-ink-muted">
                    {app.parsedJob
                      ? `${formatCount(app.parsedJob.requirements.length, 'requirement')} tracked`
                      : 'Ready to analyze posting'}
                  </span>
                  {!app.parsedJob ? (
                    <Button
                      variant="primary"
                      disabled={isAnalyzingJob || !app.jobDescription.trim()}
                      onClick={() => void handleAnalyzeJob()}
                    >
                      <Sparkles className="w-4 h-4" />
                      <span>
                        {isAnalyzingJob
                          ? 'Extracting requirements…'
                          : 'Extract requirements & assemble draft'}
                      </span>
                    </Button>
                  ) : (
                    <Button
                      variant="primary"
                      onClick={() =>
                        onNavigateStudio(
                          activeDoc,
                          activeDoc === 'coverLetter' ? 'write' : 'build',
                        )
                      }
                    >
                      <span>
                        {activeDoc === 'coverLetter'
                          ? 'Next: Write'
                          : 'Next: Build'}
                      </span>
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  )}
                </StickyFooterBar>
              </div>
            )}

            {/* ==================== STEP 2: BUILD (RESUME) ==================== */}
            {activeStep === 'build' && (
              <div>
                {/* Sticky Compact VoiceKnob Header (~72px single row, expands on click) */}
                <PanelSection className="sticky top-0 z-20 py-2.5 bg-surface/95 backdrop-blur-xs">
                  <VoiceControl
                    value={app.voice}
                    onChange={(v) => void handleVoiceChange(v)}
                    machineMadeScore={app.latestScores.machineMadeScore}
                    etaLabel={voiceEtaLabel}
                    isUpdating={isTailoringAll}
                    defaultCompact={true}
                    onCancelUpdate={() => {
                      useCases.tailorResume.cancelPendingTailoring(app.id);
                      setIsTailoringAll(false);
                    }}
                  />
                </PanelSection>

                {/* Inline Tinted Warning Banner for Gaps */}
                {gapCount > 0 && (
                  <PanelSection className="py-2.5">
                    <Banner
                      tone="warning"
                      icon={<AlertTriangle className="w-4 h-4" />}
                      title={`${formatCount(gapCount, 'job requirement')} not in your Bank`}
                      actions={
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="secondary" size="sm">
                              Review gaps
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent
                            align="end"
                            className="w-80 space-y-2.5"
                          >
                            <div className="text-xs font-semibold text-ink">
                              Unmatched requirements (never fabricated)
                            </div>
                            <p className="text-xs text-ink-muted leading-relaxed">
                              Click any skill you genuinely have to add it to your Experience Bank and current resume.
                            </p>
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {app.latestScores.gapKeywords.map((gap) => (
                                <button
                                  key={gap}
                                  type="button"
                                  onClick={() => setIHaveThisTerm(gap)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-sm text-xs font-semibold bg-warning-50 text-warning-700 border border-warning/40 hover:bg-warning-100 cursor-pointer"
                                >
                                  <span>+ {gap}</span>
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      }
                    >
                      Cevin never invents skills. Review and add any you truly have.
                    </Banner>
                  </PanelSection>
                )}

                {/* Compact Headline & Summary Section so bullets are visible in first viewport at 1440x900 */}
                <PanelSection className="py-3 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-ink">
                      Target headline & summary
                    </h3>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={
                          app.workingDraft.summaryLocked || isTailoringAll
                        }
                        onClick={() => void handleRewriteSummary()}
                      >
                        {isTailoringAll ? (
                          <span className="w-3.5 h-3.5 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
                        ) : (
                          <Sparkles className="w-3.5 h-3.5 text-accent" />
                        )}
                        <span>{isTailoringAll ? 'Working…' : 'Rewrite'}</span>
                      </Button>
                      <IconButton
                        label={
                          app.workingDraft.summaryLocked
                            ? 'Unlock summary'
                            : 'Lock summary'
                        }
                        size="sm"
                        onClick={() =>
                          void persistApp({
                            ...app,
                            workingDraft: {
                              ...app.workingDraft,
                              summaryLocked: !app.workingDraft.summaryLocked,
                            },
                          })
                        }
                      >
                        {app.workingDraft.summaryLocked ? (
                          <Lock className="w-3.5 h-3.5 text-accent" />
                        ) : (
                          <Unlock className="w-3.5 h-3.5" />
                        )}
                      </IconButton>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label
                        htmlFor="studio-target-company"
                        className="block text-xs text-ink-muted mb-1"
                      >
                        Target company
                      </label>
                      <Input
                        id="studio-target-company"
                        value={app.company}
                        onChange={(e) => {
                          const val = e.target.value;
                          const updated = {
                            ...app,
                            company: val,
                            parsedJob: app.parsedJob
                              ? { ...app.parsedJob, company: val }
                              : null,
                          };
                          setApp(updated);
                          void persistApp(updated);
                        }}
                        placeholder="e.g. Kestrel Pay"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="studio-target-headline"
                        className="block text-xs text-ink-muted mb-1"
                      >
                        Target headline
                      </label>
                      <Input
                        id="studio-target-headline"
                        value={app.workingDraft.targetHeadline}
                        onChange={(e) =>
                          void persistApp({
                            ...app,
                            workingDraft: {
                              ...app.workingDraft,
                              targetHeadline: e.target.value,
                            },
                          })
                        }
                      />
                    </div>
                  </div>

                  <div>
                    <label
                      htmlFor="studio-summary-textarea"
                      className="block text-xs text-ink-muted mb-1"
                    >
                      Executive summary
                    </label>
                    <AutoGrowTextarea
                      id="studio-summary-textarea"
                      minRows={2}
                      disabled={app.workingDraft.summaryLocked}
                      value={app.workingDraft.summary}
                      onChange={(e) =>
                        void persistApp({
                          ...app,
                          workingDraft: {
                            ...app.workingDraft,
                            summary: e.target.value,
                          },
                        })
                      }
                    />
                  </div>
                </PanelSection>

                {/* Experience Role Groups */}
                <PanelSection className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-sm font-semibold text-ink">
                        Experience achievements
                      </h3>
                      <p className="text-xs text-ink-muted mt-0.5">
                        Each bullet traces to your Experience Bank. Reorder experiences or hover a bullet to highlight it on the paper preview.
                      </p>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={handleSortExperiencesChronologically}
                      title="Sort experiences by newest first (reverse chronological)"
                    >
                      <ArrowUpDown className="w-3.5 h-3.5" />
                      <span>Sort chronological</span>
                    </Button>
                  </div>

                  {orderedExperiences.map((exp, expIdx) => {
                    const expAchievements = bank.achievements.filter(
                      (a) => a.experienceId === exp.id,
                    );
                    const includedBullets = app.workingDraft.bullets.filter(
                      (b) => b.experienceId === exp.id,
                    );
                    const unselectedBankAchs = expAchievements.filter(
                      (a) =>
                        !includedBullets.some((b) =>
                          b.sourceIds.includes(a.id),
                        ),
                    );

                    if (
                      includedBullets.length === 0 &&
                      unselectedBankAchs.length === 0
                    ) {
                      return null;
                    }

                    return (
                      <div key={exp.id} className="space-y-2">
                        <GroupHeader
                          company={exp.company}
                          title={exp.title}
                          dateRange={`${exp.start} – ${exp.end}`}
                          includedCount={includedBullets.length}
                          totalCount={expAchievements.length}
                          canMoveUp={expIdx > 0}
                          canMoveDown={expIdx < orderedExperiences.length - 1}
                          onMoveUp={() => void handleMoveExperience(exp.id, 'up')}
                          onMoveDown={() => void handleMoveExperience(exp.id, 'down')}
                        />

                        <div className="space-y-2">
                          {includedBullets.map((bullet, idx) => {
                            const rankItem = ranking?.rankedAchievements.find(
                              (r) =>
                                bullet.sourceIds.includes(r.achievement.id),
                            );
                            const dots: 1 | 2 | 3 =
                              !rankItem || rankItem.score >= 75
                                ? 3
                                : rankItem.score >= 50
                                  ? 2
                                  : 1;
                            const sourceAch = bank.achievements.find((a) =>
                              bullet.sourceIds.includes(a.id),
                            );
                            const sourceSummary = sourceAch
                              ? `${exp.company} · ${assembleBulletText(sourceAch)}`
                              : `${exp.company} · ${exp.title}`;

                            return (
                              <BulletRow
                                key={bullet.id}
                                bulletText={bullet.text}
                                originalText={bullet.originalText}
                                locked={bullet.locked}
                                unverifiedClaims={bullet.unverifiedClaims}
                                keptOriginalWording={
                                  bullet.keptOriginalWording
                                }
                                origin={bullet.origin ?? 'ai'}
                                isRewriting={rewritingBulletId === bullet.id}
                                justUpdated={justUpdatedIds.includes(
                                  bullet.id,
                                )}
                                relevanceDots={dots}
                                relevanceReason={
                                  rankItem?.reason ??
                                  'Grounded in your Experience Bank'
                                }
                                sourceSummary={sourceSummary}
                                isFirst={idx === 0}
                                isLast={idx === includedBullets.length - 1}
                                onHoverSource={(hovering) => {
                                  setHighlightedSourceId(
                                    hovering
                                      ? (bullet.sourceIds[0] ?? null)
                                      : null,
                                  );
                                  setHoveredBlockId(
                                    hovering ? bullet.id : null,
                                  );
                                }}
                                onChangeText={(nextText) => {
                                  const grounding = validateBulletGrounding(
                                    nextText,
                                    bullet.sourceIds,
                                    bank,
                                  );
                                  const nextBullets =
                                    app.workingDraft.bullets.map((b) =>
                                      b.id === bullet.id
                                        ? {
                                            ...b,
                                            text: nextText,
                                            origin: 'user' as const,
                                            unverifiedClaims:
                                              grounding.unverifiedClaims,
                                          }
                                        : b,
                                    );
                                  void persistApp({
                                    ...app,
                                    workingDraft: {
                                      ...app.workingDraft,
                                      bullets: nextBullets,
                                    },
                                  });
                                }}
                                onRewrite={() =>
                                  void handleRewriteBullet(bullet.id)
                                }
                                onToggleLock={() => {
                                  const nextBullets =
                                    app.workingDraft.bullets.map((b) =>
                                      b.id === bullet.id
                                        ? { ...b, locked: !b.locked }
                                        : b,
                                    );
                                  void persistApp({
                                    ...app,
                                    workingDraft: {
                                      ...app.workingDraft,
                                      bullets: nextBullets,
                                    },
                                  });
                                }}
                                onMoveUp={() => {
                                  const globalIdx =
                                    app.workingDraft.bullets.findIndex(
                                      (b) => b.id === bullet.id,
                                    );
                                  if (globalIdx <= 0) return;
                                  const copy = [...app.workingDraft.bullets];
                                  const temp = copy[globalIdx - 1];
                                  copy[globalIdx - 1] = copy[globalIdx];
                                  copy[globalIdx] = temp;
                                  void persistApp({
                                    ...app,
                                    workingDraft: {
                                      ...app.workingDraft,
                                      bullets: copy,
                                    },
                                  });
                                }}
                                onMoveDown={() => {
                                  const globalIdx =
                                    app.workingDraft.bullets.findIndex(
                                      (b) => b.id === bullet.id,
                                    );
                                  if (
                                    globalIdx === -1 ||
                                    globalIdx >=
                                      app.workingDraft.bullets.length - 1
                                  )
                                    return;
                                  const copy = [...app.workingDraft.bullets];
                                  const temp = copy[globalIdx + 1];
                                  copy[globalIdx + 1] = copy[globalIdx];
                                  copy[globalIdx] = temp;
                                  void persistApp({
                                    ...app,
                                    workingDraft: {
                                      ...app.workingDraft,
                                      bullets: copy,
                                    },
                                  });
                                }}
                                onRemove={() => {
                                  const nextBullets =
                                    app.workingDraft.bullets.filter(
                                      (b) => b.id !== bullet.id,
                                    );
                                  void persistApp({
                                    ...app,
                                    workingDraft: {
                                      ...app.workingDraft,
                                      bullets: nextBullets,
                                    },
                                  });
                                }}
                              />
                            );
                          })}
                        </div>

                        {unselectedBankAchs.length > 0 && (
                          <Disclosure
                            title={`More from your Bank (${unselectedBankAchs.length})`}
                          >
                            <div className="space-y-2">
                              {unselectedBankAchs.map((ach) => (
                                <div
                                  key={ach.id}
                                  className="flex items-start justify-between gap-3 p-2.5 rounded-md bg-surface-sunken/60 border border-hairline text-xs"
                                >
                                  <span className="text-ink-muted leading-relaxed">
                                    {assembleBulletText(ach)}
                                  </span>
                                  <Button
                                    size="sm"
                                    variant="secondary"
                                    onClick={() =>
                                      void handleIncludeBankAchievement(ach)
                                    }
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                    <span>Include</span>
                                  </Button>
                                </div>
                              ))}
                            </div>
                          </Disclosure>
                        )}
                      </div>
                    );
                  })}
                </PanelSection>

                {/* Included Skills */}
                <PanelSection className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-ink">
                      Included skills (
                      {app.workingDraft.selectedSkillIds.length} of{' '}
                      {bank.skills.length})
                    </h3>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {bank.skills.map((skill) => {
                      const selected =
                        app.workingDraft.selectedSkillIds.includes(skill.id);
                      return (
                        <button
                          key={skill.id}
                          type="button"
                          onClick={() => {
                            const next = selected
                              ? app.workingDraft.selectedSkillIds.filter(
                                  (id) => id !== skill.id,
                                )
                              : [
                                  ...app.workingDraft.selectedSkillIds,
                                  skill.id,
                                ];
                            void persistApp({
                              ...app,
                              workingDraft: {
                                ...app.workingDraft,
                                selectedSkillIds: next,
                              },
                            });
                          }}
                          className={`px-2.5 py-1 rounded-sm text-xs font-medium border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-accent-50 text-accent-700 border-accent/30 font-semibold'
                              : 'bg-surface-sunken text-ink-muted border-hairline hover:text-ink'
                          }`}
                        >
                          {skill.name}
                        </button>
                      );
                    })}
                  </div>
                </PanelSection>

                <StickyFooterBar>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigateStudio('resume', 'job')}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back: Job</span>
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => onNavigateStudio('resume', 'review')}
                  >
                    <span>Next: Review</span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </StickyFooterBar>
              </div>
            )}

            {/* ==================== STEP 3: WRITE (COVER LETTER) ==================== */}
            {activeStep === 'write' && (
              <div>
                <PanelSection className="space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h2 className="text-base font-display font-semibold text-ink">
                      Letter setup & voice
                    </h2>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setLetterSetupOpen((v) => !v)}
                      >
                        {letterSetupOpen ? 'Hide setup' : 'Edit setup'}
                      </Button>
                      <Button
                        variant="secondary"
                        size="sm"
                        disabled={isGeneratingLetter}
                        onClick={() => void handleRegenerateLetter()}
                      >
                        <Sparkles className="w-3.5 h-3.5 text-accent" />
                        <span>
                          {isGeneratingLetter
                            ? 'Regenerating…'
                            : 'Regenerate letter'}
                        </span>
                      </Button>
                    </div>
                  </div>

                  {!letterSetupOpen ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <TagChip>
                        Recipient: {clDraft.recipient || 'Hiring Team'}
                      </TagChip>
                      <TagChip>
                        Length:{' '}
                        {clDraft.length === 'short'
                          ? 'Short (~180w)'
                          : clDraft.length === 'detailed'
                            ? 'Detailed (~360w)'
                            : 'Standard (~260w)'}
                      </TagChip>
                      <TagChip>
                        Proofs:{' '}
                        {formatCount(
                          clDraft.selectedProofAchievementIds.length,
                          'achievement',
                        )}
                      </TagChip>
                    </div>
                  ) : (
                    <div className="space-y-4 pt-2 pb-3 border-b border-hairline">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label
                            htmlFor="cl-recipient-input"
                            className="block text-xs font-medium text-ink mb-1"
                          >
                            Recipient
                          </label>
                          <Input
                            id="cl-recipient-input"
                            value={clDraft.recipient}
                            onChange={(e) =>
                              void handleRegenerateLetter({
                                recipient: e.target.value,
                              })
                            }
                            placeholder="Hiring Team"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-ink mb-1">
                            Target length
                          </label>
                          <SegmentedControl<CoverLetterLength>
                            ariaLabel="Cover letter length"
                            size="sm"
                            value={clDraft.length}
                            onValueChange={(len) =>
                              void handleRegenerateLetter({ length: len })
                            }
                            options={[
                              { value: 'short', label: 'Short' },
                              { value: 'standard', label: 'Standard' },
                              { value: 'detailed', label: 'Detailed' },
                            ]}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-xs font-medium text-ink mb-1.5">
                          Proof points from your Bank (choose 2–3 distinct achievements)
                        </label>
                        <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                          {bank.achievements.map((ach) => {
                            const exp = bank.experiences.find(
                              (e) => e.id === ach.experienceId,
                            );
                            const checked =
                              clDraft.selectedProofAchievementIds.includes(
                                ach.id,
                              );
                            return (
                              <div
                                key={ach.id}
                                className="flex items-start gap-2.5 p-2 rounded-md bg-surface-sunken/60 border border-hairline text-xs"
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={(nextChecked) => {
                                    let nextIds =
                                      clDraft.selectedProofAchievementIds;
                                    if (!nextChecked) {
                                      nextIds = nextIds.filter(
                                        (id) => id !== ach.id,
                                      );
                                    } else if (nextIds.length < 3) {
                                      nextIds = [...nextIds, ach.id];
                                    } else {
                                      nextIds = [...nextIds.slice(1), ach.id];
                                    }
                                    void handleRegenerateLetter({
                                      selectedProofAchievementIds: nextIds,
                                    });
                                  }}
                                  label={`Use achievement from ${exp?.company ?? 'Bank'}`}
                                />
                                <span className="text-ink leading-snug">
                                  <strong>{exp?.company}:</strong>{' '}
                                  {assembleBulletText(ach)}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  )}

                  <VoiceControl
                    value={clDraft.voice}
                    onChange={(v) => void handleRegenerateLetter({ voice: v })}
                    machineMadeScore={app.latestScores.machineMadeScore}
                    isUpdating={isGeneratingLetter}
                    defaultCompact={true}
                  />
                </PanelSection>

                {/* Core Paragraphs */}
                <PanelSection className="space-y-3">
                  <h3 className="text-sm font-semibold text-ink">
                    Core letter paragraphs
                  </h3>
                  {clDraft.blocks
                    .filter((b) =>
                      ['opening', 'body1', 'body2', 'whyCompany'].includes(
                        b.type,
                      ),
                    )
                    .map((block) => {
                      const sourceLabels = block.sourceIds
                        .map((sid) => {
                          const ach = bank.achievements.find(
                            (a) => a.id === sid,
                          );
                          const exp = bank.experiences.find(
                            (e) => e.id === ach?.experienceId,
                          );
                          return exp
                            ? `${exp.title} · ${exp.company}`
                            : undefined;
                        })
                        .filter((x): x is string => Boolean(x));

                      return (
                        <LetterBlock
                          key={block.id}
                          block={block}
                          sourceLabels={sourceLabels}
                          isRewriting={rewritingBlockId === block.id}
                          onChangeText={(nextText) => {
                            const nextBlocks = clDraft.blocks.map((b) =>
                              b.id === block.id
                                ? {
                                    ...b,
                                    text: nextText,
                                    origin: 'user' as const,
                                  }
                                : b,
                            );
                            const nextCl = { ...clDraft, blocks: nextBlocks };
                            void persistApp({
                              ...app,
                              coverLetterDraft: nextCl,
                            });
                          }}
                          onRegenerate={() =>
                            void handleRewriteLetterBlock(block.id, block.type)
                          }
                          onToggleLock={() => {
                            const nextBlocks = clDraft.blocks.map((b) =>
                              b.id === block.id
                                ? { ...b, locked: !b.locked }
                                : b,
                            );
                            const nextCl = { ...clDraft, blocks: nextBlocks };
                            void persistApp({
                              ...app,
                              coverLetterDraft: nextCl,
                            });
                          }}
                          onHoverBlock={(hovering) =>
                            setHoveredBlockId(hovering ? block.id : null)
                          }
                        />
                      );
                    })}

                  <Disclosure
                    title="Greeting & closing"
                    badge={
                      <Badge tone="neutral">
                        {formatCount(3, 'block')}
                      </Badge>
                    }
                  >
                    <div className="space-y-3">
                      {clDraft.blocks
                        .filter((b) =>
                          ['greeting', 'closing', 'signoff'].includes(b.type),
                        )
                        .map((block) => (
                          <LetterBlock
                            key={block.id}
                            block={block}
                            sourceLabels={[]}
                            isRewriting={rewritingBlockId === block.id}
                            onChangeText={(nextText) => {
                              const nextBlocks = clDraft.blocks.map((b) =>
                                b.id === block.id
                                  ? {
                                      ...b,
                                      text: nextText,
                                      origin: 'user' as const,
                                    }
                                  : b,
                              );
                              const nextCl = { ...clDraft, blocks: nextBlocks };
                              void persistApp({
                                ...app,
                                coverLetterDraft: nextCl,
                              });
                            }}
                            onRegenerate={() =>
                              void handleRewriteLetterBlock(
                                block.id,
                                block.type,
                              )
                            }
                            onToggleLock={() => {
                              const nextBlocks = clDraft.blocks.map((b) =>
                                b.id === block.id
                                  ? { ...b, locked: !b.locked }
                                  : b,
                              );
                              const nextCl = { ...clDraft, blocks: nextBlocks };
                              void persistApp({
                                ...app,
                                coverLetterDraft: nextCl,
                              });
                            }}
                            onHoverBlock={(hovering) =>
                              setHoveredBlockId(hovering ? block.id : null)
                            }
                          />
                        ))}
                    </div>
                  </Disclosure>
                </PanelSection>

                <StickyFooterBar>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => onNavigateStudio('coverLetter', 'job')}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Back: Job</span>
                  </Button>
                  <Button
                    variant="primary"
                    onClick={() => onNavigateStudio('coverLetter', 'review')}
                  >
                    <span>Next: Review</span>
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </StickyFooterBar>
              </div>
            )}

            {/* ==================== STEP 4: REVIEW & EXPORT ==================== */}
            {activeStep === 'review' && (
              <div>
                {/* Three-Score Hero Band */}
                <PanelSection>
                  <HeroScoreBand
                    documentKind={activeDoc}
                    jobMatch={
                      activeDoc === 'coverLetter' && letterAnalysis
                        ? letterAnalysis.jobMatch
                        : app.latestScores.jobMatch
                    }
                    recruiterAppeal={
                      appealDetails?.total ??
                      app.latestScores.recruiterAppeal ??
                      82
                    }
                    letterAppeal={letterAnalysis?.report.letterAppeal ?? 84}
                    atsReadiness={app.latestScores.atsReadiness}
                    checksPassedCount={letterAnalysis?.report.passedCount}
                    checksTotalCount={letterAnalysis?.report.totalCount}
                    jobMatchDelta={jobMatchDelta}
                    appealDelta={appealDelta}
                    atsDelta={atsDelta}
                    referenceVersionLabel={referenceVersionLabel}
                  />
                </PanelSection>

                {/* Recruiter Appeal Section (4 LensBars + First-Impression Takeaway Card) */}
                {activeDoc === 'resume' && appealDetails && (
                  <PanelSection className="space-y-4">
                    <LensBars
                      lenses={appealDetails.lenses}
                      weakestHints={appealDetails.weakestSubcheckHints}
                    />
                    <TakeawayCard
                      takeaway={appealDetails.firstImpressionTakeaway}
                      targetRoleMatches={appealDetails.targetRoleMatches}
                      layoutEstimated={appealDetails.layoutEstimated}
                    />
                  </PanelSection>
                )}

                {/* Top Fixes (max 3 with 1-click Apply fix, including appeal fixes) */}
                <PanelSection className="space-y-3">
                  <h3 className="text-sm font-semibold text-ink">Top fixes</h3>
                  {activeDoc === 'coverLetter' ? (
                    (letterAnalysis?.fixes.length ?? 0) === 0 ? (
                      <Banner
                        tone="success"
                        icon={<Check className="w-4 h-4" />}
                        title="Nothing to fix — all key checks pass"
                      >
                        Your cover letter leads with concrete proof, cites grounded Bank achievements, and stays within target length.
                      </Banner>
                    ) : (
                      <div className="space-y-2">
                        {letterAnalysis!.fixes
                          .slice(0, 3)
                          .map((fix: CoverLetterPrioritizedFix) => (
                            <div
                              key={fix.id}
                              className="p-3 rounded-lg bg-surface-sunken border border-hairline flex items-center justify-between gap-3"
                            >
                              <div className="min-w-0">
                                <div className="text-xs font-semibold text-ink">
                                  {fix.title}
                                </div>
                                <p className="text-xs text-ink-muted mt-0.5">
                                  {fix.description}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                {appliedFixIds.includes(fix.id) && (
                                  <Badge tone="success" className="gap-1">
                                    <Check className="w-3 h-3" />
                                    Applied
                                  </Badge>
                                )}
                                <Button
                                  size="sm"
                                  variant={
                                    appliedFixIds.includes(fix.id)
                                      ? 'tonal'
                                      : 'secondary'
                                  }
                                  disabled={applyingFixId === fix.id}
                                  onClick={async () => {
                                    recordHistorySnapshot(
                                      app,
                                      bank.experiences,
                                      appliedFixIds,
                                    );
                                    setApplyingFixId(fix.id);
                                    void refreshSidebarActivity();
                                    try {
                                      const r =
                                        await useCases.scoreCoverLetter.applyOneClickFix(
                                          app.id,
                                          fix,
                                        );
                                      if (r.ok) {
                                        setApp(r.value.application);
                                        setLetterAnalysis(r.value.analysis);
                                        setAppliedFixIds((prev) => [
                                          ...new Set([...prev, fix.id]),
                                        ]);
                                        addToast(
                                          `Applied fix: ${fix.title}`,
                                          'success',
                                        );
                                        await reloadWorkspace();
                                      }
                                    } finally {
                                      setApplyingFixId(null);
                                      void refreshSidebarActivity();
                                    }
                                  }}
                                >
                                  {applyingFixId === fix.id ? (
                                    <>
                                      <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                                      <span>Applying…</span>
                                    </>
                                  ) : appliedFixIds.includes(fix.id) ? (
                                    <>
                                      <RefreshCw className="w-3 h-3" />
                                      <span>Apply again</span>
                                    </>
                                  ) : (
                                    <span>Apply fix</span>
                                  )}
                                </Button>
                              </div>
                            </div>
                          ))}
                      </div>
                    )
                  ) : fixes.length === 0 ? (
                    <Banner
                      tone="success"
                      icon={<Check className="w-4 h-4" />}
                      title="Nothing to fix — all key checks pass"
                    >
                      Every bullet traces to your Experience Bank and meets single-column ATS and 10-second skim thresholds.
                    </Banner>
                  ) : (
                    <div className="space-y-2">
                      {fixes.slice(0, 3).map((fix) => (
                        <div
                          key={fix.id}
                          className="p-3 rounded-lg bg-surface-sunken border border-hairline flex items-center justify-between gap-3"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-ink">
                                {fix.title}
                              </span>
                              <Badge tone="accent">
                                +{fix.impactPoints} pts
                              </Badge>
                            </div>
                            <p className="text-xs text-ink-muted mt-0.5">
                              {fix.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {appliedFixIds.includes(fix.id) && (
                              <Badge tone="success" className="gap-1">
                                <Check className="w-3 h-3" />
                                Applied
                              </Badge>
                            )}
                            <Button
                              size="sm"
                              variant={
                                appliedFixIds.includes(fix.id)
                                  ? 'tonal'
                                  : 'secondary'
                              }
                              disabled={applyingFixId === fix.id}
                              onClick={async () => {
                                recordHistorySnapshot(
                                  app,
                                  bank.experiences,
                                  appliedFixIds,
                                );
                                setApplyingFixId(fix.id);
                                void refreshSidebarActivity();
                                try {
                                  const r =
                                    await useCases.scoreResume.applyOneClickFix(
                                      app.id,
                                      fix,
                                    );
                                  if (r.ok) {
                                    setApp(r.value.application);
                                    setFixes(r.value.analysis.fixes);
                                    setAppliedFixIds((prev) => [
                                      ...new Set([...prev, fix.id]),
                                    ]);
                                    addToast(
                                      `Applied fix: ${fix.title}`,
                                      'success',
                                    );
                                    await reloadWorkspace();
                                  }
                                } finally {
                                  setApplyingFixId(null);
                                  void refreshSidebarActivity();
                                }
                              }}
                            >
                              {applyingFixId === fix.id ? (
                                <>
                                  <Loader2 className="w-3.5 h-3.5 animate-spin text-accent" />
                                  <span>Applying…</span>
                                </>
                              ) : appliedFixIds.includes(fix.id) ? (
                                <>
                                  <RefreshCw className="w-3 h-3" />
                                  <span>Apply again</span>
                                </>
                              ) : (
                                <span>Apply fix</span>
                              )}
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </PanelSection>

                {/* Redesigned Coverage Summary + RequirementGroup on Review */}
                {groupedCoverage && (
                  <PanelSection className="space-y-4">
                    <CoverageSummary
                      summary={groupedCoverage}
                      activeFilter={coverageFilter}
                      onFilterChange={setCoverageFilter}
                      onUndoDismiss={() => void handleRestoreDismissed()}
                    />
                    <RequirementGroup
                      summary={groupedCoverage}
                      bank={bank}
                      activeFilter={coverageFilter}
                      highlightedTerm={highlightedTerm}
                      onSelectCoveredTerm={setHighlightedTerm}
                      onAddToBank={(term) => void handleAddSkillFromGap(term)}
                      onIHaveThis={(term) => setIHaveThisTerm(term)}
                      onDismissRequirement={(reqId) =>
                        void handleDismissRequirement(reqId)
                      }
                    />
                  </PanelSection>
                )}

                {/* PDF Round-Trip, Editable Export Filename & Snapshot Strip */}
                <PanelSection className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-xs text-ink-muted">
                      <span className="font-semibold text-ink">
                        PDF check:{' '}
                      </span>
                      <span>
                        ~{formatCount(app.latestScores.estimatedPages, 'page')}{' '}
                        · selectable text layer · single-column order
                      </span>
                    </div>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={isVerifyingPdf}
                      onClick={() => void handleVerifyPdfRoundTrip()}
                    >
                      {isVerifyingPdf ? 'Verifying…' : 'Verify PDF'}
                    </Button>
                  </div>

                  {app.latestScores.roundTrip && (
                    <div className="p-3 rounded-md bg-surface-sunken border border-hairline text-xs space-y-1">
                      <div className="font-semibold text-success-700">
                        ✓ PDF round-trip verified (
                        {app.latestScores.roundTrip.extractedCharacterCount}{' '}
                        chars extracted)
                      </div>
                      <div className="text-ink-muted">
                        Detected headings:{' '}
                        {app.latestScores.roundTrip.headingsDetected.join(', ')}
                      </div>
                    </div>
                  )}

                  {/* Editable export filename (Section 6.9) */}
                  <div className="pt-1">
                    <label
                      htmlFor="studio-export-filename"
                      className="block text-xs font-medium text-ink-muted mb-1"
                    >
                      Export filename
                    </label>
                    <Input
                      id="studio-export-filename"
                      value={customExportName}
                      onChange={(e) => setCustomExportName(e.target.value)}
                      className="h-8 text-xs font-mono"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-1">
                    <Input
                      value={versionLabelInput}
                      onChange={(e) => setVersionLabelInput(e.target.value)}
                      placeholder="Snapshot label (optional)…"
                      className="h-8 text-xs"
                    />
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => void handleSaveSnapshot()}
                    >
                      <BookmarkCheck className="w-3.5 h-3.5" />
                      <span>Save snapshot</span>
                    </Button>
                  </div>
                </PanelSection>

                <StickyFooterBar>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() =>
                      onNavigateStudio(
                        activeDoc,
                        activeDoc === 'coverLetter' ? 'write' : 'build',
                      )
                    }
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>
                      {activeDoc === 'coverLetter'
                        ? 'Back: Write'
                        : 'Back: Build'}
                    </span>
                  </Button>

                  <div className="flex flex-wrap items-center gap-3">
                    <Tooltip content="This preview is the exported file.">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-surface-sunken border border-hairline text-xs text-ink-muted tabular-nums cursor-help">
                        <span>
                          PDF ·{' '}
                          {formatCount(
                            previewArtifact?.pageCount ??
                              (activeDoc === 'coverLetter'
                                ? 1
                                : app.latestScores.estimatedPages),
                            'page',
                          )}
                          {previewArtifact?.bytes.byteLength
                            ? ` · ${Math.max(1, Math.round(previewArtifact.bytes.byteLength / 1024))} KB`
                            : ''}
                        </span>
                      </span>
                    </Tooltip>

                    <SplitButton
                      primaryLabel={
                        activeDoc === 'coverLetter'
                          ? 'Export Cover Letter PDF'
                          : 'Export Resume PDF'
                      }
                      primaryIcon={<Download className="w-4 h-4" />}
                      onPrimaryClick={() => void handleExport('pdf', activeDoc)}
                      items={[
                        {
                          id: 'pdf-resume',
                          label: 'Export Resume PDF (.pdf)',
                          onSelect: () => void handleExport('pdf', 'resume'),
                        },
                        {
                          id: 'pdf-letter',
                          label: 'Export Cover Letter PDF (.pdf)',
                          onSelect: () =>
                            void handleExport('pdf', 'coverLetter'),
                        },
                        {
                          id: 'md',
                          label: 'Export Markdown (.md)',
                          onSelect: () =>
                            void handleExport('markdown', activeDoc),
                        },
                        {
                          id: 'txt',
                          label: 'Export plain text (.txt)',
                          onSelect: () => void handleExport('text', activeDoc),
                        },
                      ]}
                    />
                  </div>
                </StickyFooterBar>
              </div>
            )}
          </Panel>
        </div>

        {/* Right Column: Sticky DeskPreview Stage (7 of 12 columns) */}
        <div className="lg:col-span-7 lg:sticky lg:top-4">
          <DeskPreview
            documentKind={activeDoc}
            resumeDoc={resumeDoc}
            coverLetterDoc={coverLetterDoc}
            templateId={app.templateId}
            onChangeTemplate={(nextTpl: TemplateId) =>
              void persistApp({ ...app, templateId: nextTpl })
            }
            zoom={previewZoom}
            onChangeZoom={setPreviewZoom}
            pageSize={pageSize}
            estimatedPages={app.latestScores.estimatedPages}
            highlightedSourceId={highlightedSourceId}
            hoveredBlockId={hoveredBlockId}
            skimKeywordTerms={skimKeywordTerms}
            highlightedTerm={highlightedTerm}
            onClearHighlightedTerm={() => setHighlightedTerm(null)}
            onArtifactReady={setPreviewArtifact}
          />
        </div>
      </div>

      {/* "I have this" Quick-Add Modal */}
      {iHaveThisTerm && (
        <IHaveThisModal
          open={Boolean(iHaveThisTerm)}
          onOpenChange={(open) => {
            if (!open) setIHaveThisTerm(null);
          }}
          initialTerm={iHaveThisTerm}
          bank={bank}
          onSubmit={handleIHaveThisSubmit}
        />
      )}
    </div>
  );
}
