import {
  Achievement,
  Application,
  BankRankingResult,
  BankSnapshot,
  Certification,
  CoverLetterBlockType,
  CoverLetterLength,
  CoverLetterPrioritizedFix,
  DocumentKind,
  DocumentVersion,
  Education,
  Experience,
  ExportableDocument,
  FullAnalysisResult,
  JobFacts,
  LetterCheckReport,
  ParsedJob,
  PositionedText,
  PracticalFitEvaluation,
  PrioritizedFix,
  Profile,
  Project,
  QuickCheckVerdict,
  RawDocument,
  Result,
  RoundTripReport,
  Skill,
  TemplateId,
  UserPreferences,
  VoiceLevel,
} from '../../../domain';
import {
  AppSettings,
  LlmConfigFieldMeta,
  LlmRuntimeStatus,
  ModelInfo,
  PerformanceProfile,
  PerformanceSummary,
  ResumeTemplate,
} from '../outbound';

export interface ParsedResumeCandidate {
  rawDocument: RawDocument;
  proposedProfile: Partial<Profile>;
  proposedExperiences: Array<{
    experience: Experience;
    achievements: Achievement[];
    isDuplicate: boolean;
  }>;
  proposedSkills: Array<{
    skill: Skill;
    isDuplicate: boolean;
  }>;
  proposedEducations: Education[];
  proposedProjects: Project[];
  proposedCertifications: Certification[];
}

export interface ImportResumeFileUseCase {
  parseAndPropose(file: File): Promise<Result<ParsedResumeCandidate>>;
  parseJsonAndPropose(
    rawJson: string,
    sourceName?: string,
  ): Promise<Result<ParsedResumeCandidate>>;
  commitImport(
    candidate: ParsedResumeCandidate,
    duplicateStrategy: 'merge' | 'skip',
  ): Promise<Result<BankSnapshot>>;
}

export interface AnalyzeJobDescriptionUseCase {
  execute(
    applicationId: string,
    rawJobDescription: string,
  ): Promise<Result<{ application: Application; parsedJob: ParsedJob }>>;
}

export interface RankBankItemsUseCase {
  execute(applicationId: string): Promise<Result<BankRankingResult>>;
}

export interface TailorResumeUseCase {
  tailorAll(
    applicationId: string,
    voice: VoiceLevel,
    onBulletProgress?: (
      bulletId: string,
      updatedApp: Application,
      completedCount: number,
      totalCount: number,
    ) => void,
  ): Promise<Result<Application>>;
  regenerateBullet(
    applicationId: string,
    bulletId: string,
    voice: VoiceLevel,
    variationSeed?: number,
  ): Promise<Result<Application>>;
  regenerateSummary(
    applicationId: string,
    voice: VoiceLevel,
  ): Promise<Result<Application>>;
  /**
   * Instant (<10ms) deterministic lexicon pass applied immediately when the user moves the Voice dial,
   * before progressive LLM refinement completes.
   */
  applyQuickVoicePass(
    applicationId: string,
    voice: VoiceLevel,
  ): Promise<
    Result<{
      application: Application;
      updatedBulletIds: string[];
      etaLabel: string;
      etaSeconds: number;
    }>
  >;
  estimateEta(
    bulletCount: number,
  ): Promise<{ seconds: number; label: string }>;
  cancelPendingTailoring(applicationId?: string): void;
  previewSampleBullet(
    voice: VoiceLevel,
    sampleInput?: { action: string; result: string; metric?: string },
  ): {
    text: string;
    machineMadeScore: number;
    machineMadeLabel: string;
  };
}

export interface GenerateCoverLetterUseCase {
  execute(params: {
    applicationId: string;
    recipient?: string;
    length?: CoverLetterLength;
    selectedProofAchievementIds?: string[];
    whyCompanyNotes?: string;
    voice?: VoiceLevel;
  }): Promise<Result<Application>>;
  rewriteBlock(params: {
    applicationId: string;
    blockId: string;
    blockType: CoverLetterBlockType;
    voice?: VoiceLevel;
  }): Promise<Result<Application>>;
}

export interface CoverLetterAnalysisResult {
  report: LetterCheckReport;
  jobMatch: number;
  coveredKeywords: string[];
  gapKeywords: string[];
  fixes: CoverLetterPrioritizedFix[];
  roundTrip?: RoundTripReport;
}

export interface ScoreCoverLetterUseCase {
  execute(
    applicationId: string,
    options?: { runRoundTrip?: boolean },
  ): Promise<Result<CoverLetterAnalysisResult>>;
  applyOneClickFix(
    applicationId: string,
    fix: CoverLetterPrioritizedFix,
  ): Promise<
    Result<{ application: Application; analysis: CoverLetterAnalysisResult }>
  >;
}

export interface ScoreResumeUseCase {
  execute(
    applicationId: string,
    options?: { runRoundTrip?: boolean },
  ): Promise<Result<FullAnalysisResult>>;
  applyOneClickFix(
    applicationId: string,
    fix: PrioritizedFix,
  ): Promise<Result<{ application: Application; analysis: FullAnalysisResult }>>;
  dismissRequirement(
    applicationId: string,
    term: string,
  ): Promise<Result<{ application: Application; analysis: FullAnalysisResult }>>;
  undoDismissRequirement(
    applicationId: string,
    term: string,
  ): Promise<Result<{ application: Application; analysis: FullAnalysisResult }>>;
  confirmIHaveThisSkill(params: {
    applicationId: string;
    skillName: string;
    aliases?: string[];
    category?: Skill['category'];
    attachExperienceId?: string;
    newAchievement?: { action: string; result: string; metric?: string };
  }): Promise<
    Result<{
      application: Application;
      bank: BankSnapshot;
      analysis: FullAnalysisResult;
    }>
  >;
}

export interface RenderPreviewResult {
  bytes: Uint8Array;
  pageCount: number;
  positionedText: PositionedText[];
  contentHash: string;
  document: ExportableDocument;
}

export interface RenderPreviewUseCase {
  execute(params: {
    application?: Application;
    applicationId?: string;
    document?: ExportableDocument;
    kind?: DocumentKind;
    templateId?: TemplateId;
    pageSize?: 'letter' | 'a4';
  }): Promise<Result<RenderPreviewResult>>;
}

export interface ExportDocumentUseCase {
  execute(params: {
    applicationId: string;
    exporterId: string;
    templateId: TemplateId;
    kind?: DocumentKind;
    autoSaveVersion?: boolean;
    customFileName?: string;
    document?: ExportableDocument;
    contentHash?: string;
    versionId?: string;
    pageSize?: 'letter' | 'a4';
    previewBytes?: Uint8Array;
  }): Promise<
    Result<{
      blob: Blob;
      fileName: string;
      mimeType: string;
      contentHash?: string;
      savedVersion?: DocumentVersion;
      regeneratedFromBackup?: boolean;
    }>
  >;
}

export type ExportResumeUseCase = ExportDocumentUseCase;

export interface SaveDocumentVersionUseCase {
  execute(
    applicationId: string,
    label?: string,
    kind?: DocumentKind,
    options?: {
      pdfBytes?: Uint8Array;
      contentHash?: string;
      pageSize?: 'letter' | 'a4';
    },
  ): Promise<Result<DocumentVersion>>;
}

export type SaveResumeVersionUseCase = SaveDocumentVersionUseCase;

export interface GetFitSummaryUseCase {
  execute(params: {
    applicationId?: string;
    application?: Application;
    facts?: JobFacts;
    preferencesOverride?: UserPreferences;
  }): Promise<PracticalFitEvaluation>;
}

export interface UpdateApplicationDetailsUseCase {
  execute(params: {
    applicationId: string;
    postingUrl?: string;
    appliedDate?: string;
    notes?: string;
    status?: Application['status'];
    factsExpandedOverride?: boolean;
  }): Promise<Result<Application>>;
}

export interface ManageBankUseCase {
  getBank(): Promise<BankSnapshot>;
  saveBank(snapshot: BankSnapshot): Promise<BankSnapshot>;
  addSkillFromGap(term: string): Promise<BankSnapshot>;
  addSkillAndOptionalAchievement(params: {
    skillName: string;
    category?: Skill['category'];
    aliases?: string[];
    achievementId?: string;
    experienceId?: string;
    newAchievement?: { action: string; result: string; metric?: string };
    applicationId?: string;
  }): Promise<{
    bank: BankSnapshot;
    skill: Skill;
    application?: Application;
  }>;
  mergeDuplicateSkills(): Promise<{
    snapshot: BankSnapshot;
    mergedCount: number;
  }>;
  exportAllDataJson(): Promise<string>;
  importAllDataJson(rawJson: string): Promise<Result<void>>;
  wipeAllData(): Promise<void>;
  loadDemoWorkspace(): Promise<{
    bank: BankSnapshot;
    applications: Application[];
  }>;
}

export interface ManageApplicationsUseCase {
  listApplications(): Promise<Application[]>;
  getApplication(id: string): Promise<Application | null>;
  createApplication(params?: {
    company?: string;
    roleTitle?: string;
    jobDescription?: string;
    status?: Application['status'];
  }): Promise<Application>;
  saveApplication(application: Application): Promise<Application>;
  deleteApplication(id: string): Promise<void>;
  duplicateApplication(id: string): Promise<Result<Application>>;
  dismissRequirement(
    applicationId: string,
    reqIdOrTerm: string,
  ): Promise<Application>;
  restoreDismissedRequirement(
    applicationId: string,
    reqIdOrTerm?: string,
  ): Promise<Application>;
  listVersions(applicationId: string): Promise<DocumentVersion[]>;
  deleteVersion(versionId: string): Promise<void>;
}

export type UserPreferencesPatch = Partial<
  Omit<UserPreferences, 'homeLocation' | 'needsSponsorship'>
> & {
  homeLocation?: UserPreferences['homeLocation'] | string;
  needsSponsorship?: UserPreferences['needsSponsorship'] | boolean;
};

export interface ManagePreferencesUseCase {
  getPreferences(): Promise<UserPreferences>;
  savePreferences(partial: UserPreferencesPatch): Promise<UserPreferences>;
}

export interface JobFactsUseCase {
  extractJobFacts(
    rawPosting: string,
    options?: { useLlmIfNeeded?: boolean },
  ): Promise<JobFacts & { facts: JobFacts }>;
  updateApplicationJobFact(
    applicationId: string,
    patch: Partial<JobFacts>,
  ): Promise<Result<Application>>;
  overrideFact(
    applicationId: string,
    key: 'location' | 'workPermits' | 'languages' | 'salary' | 'employmentType',
    nextValue: unknown,
  ): Promise<Result<Application>>;
  evaluatePracticalFit(
    facts: JobFacts,
    prefsOverride?: UserPreferences,
  ): Promise<PracticalFitEvaluation>;
}

export interface QuickCheckUseCase {
  evaluate(
    rawPostingOrParams:
      | string
      | { jobDescription: string; company?: string; roleTitle?: string },
    overrides?: { company?: string; roleTitle?: string },
  ): Promise<QuickCheckVerdict>;
  saveAsProspect(params: {
    rawPosting?: string;
    jobDescription?: string;
    company?: string;
    roleTitle?: string;
  }): Promise<Application>;
  startTailoringFromQuickCheck(params: {
    rawPosting?: string;
    jobDescription?: string;
    company?: string;
    roleTitle?: string;
    existingProspectId?: string;
  }): Promise<Application>;
  promoteProspect(applicationId: string): Promise<Result<Application>>;
}

export interface ImportFormatDTO {
  id: string;
  label: string;
  extensions: string[];
  mimeTypes: string[];
}

export interface ListImportFormatsUseCase {
  execute(): ImportFormatDTO[];
}

export interface ExportFormatDTO {
  id: string;
  label: string;
  fileExtension: string;
  mimeType: string;
  supports: DocumentKind[];
  capabilities: {
    templates: boolean;
    atsRoundTrip: boolean;
    previewable?: boolean;
  };
}

export interface ListExportFormatsUseCase {
  execute(kind?: DocumentKind): ExportFormatDTO[];
  listTemplates(): ResumeTemplate[];
}

export interface LlmProviderDTO {
  id: string;
  label: string;
  description: string;
  locality: 'local' | 'remote';
  capabilities: {
    streaming: boolean;
    jsonSchema: boolean;
    embeddings: boolean;
    reportsTimings?: boolean;
    keepAlive?: boolean;
    runtimeStatus?: boolean;
    parallel?: boolean;
  };
  configFields: LlmConfigFieldMeta[];
  defaultConfig: Record<string, unknown>;
}

export interface ListLlmProvidersUseCase {
  execute(): LlmProviderDTO[];
}

export interface ConnectionDiagnosticResult {
  connected: boolean;
  providerId: string;
  endpoint: string;
  models: ModelInfo[];
  statusCode:
    | 'OK'
    | 'UNREACHABLE'
    | 'CORS_BLOCKED'
    | 'NO_MODELS'
    | 'MODEL_MISSING';
  headline: string;
  remediationCommand?: string;
  details: string;
}

export interface SidebarConnectionStatus {
  state:
    | 'connected'
    | 'warming'
    | 'busy'
    | 'partly-on-cpu'
    | 'demo'
    | 'offline';
  label: string;
  modelName?: string;
  providerId: string;
  detail: string;
  activeSlots?: number;
  maxSlots?: number;
  isTunedDefaultModel?: boolean;
}

export interface TestLlmConnectionUseCase {
  execute(
    providerId: string,
    configOverride?: Record<string, unknown>,
  ): Promise<ConnectionDiagnosticResult>;
  getSidebarStatus(): Promise<SidebarConnectionStatus>;
}

export interface ManageSettingsUseCase {
  getSettings(): Promise<AppSettings>;
  saveSettings(partial: Partial<AppSettings>): Promise<AppSettings>;
}

export interface HarnessPerformanceUseCase {
  warmUp(voice?: VoiceLevel): Promise<void>;
  runCalibration(
    onProgress?: (
      stepLabel: string,
      stepIndex: number,
      totalSteps: number,
    ) => void,
    signal?: AbortSignal,
  ): Promise<Result<PerformanceProfile>>;
  getRuntimeStatus(): Promise<LlmRuntimeStatus>;
  releaseModelMemory(): Promise<Result<void>>;
  getPerformanceSummary(limit?: number): Promise<PerformanceSummary>;
  clearResultCache(): Promise<void>;
}

export interface CevinUseCases {
  importResumeFile: ImportResumeFileUseCase;
  analyzeJobDescription: AnalyzeJobDescriptionUseCase;
  rankBankItems: RankBankItemsUseCase;
  tailorResume: TailorResumeUseCase;
  generateCoverLetter: GenerateCoverLetterUseCase;
  scoreResume: ScoreResumeUseCase;
  scoreCoverLetter: ScoreCoverLetterUseCase;
  renderPreview: RenderPreviewUseCase;
  exportResume: ExportResumeUseCase;
  exportDocument: ExportDocumentUseCase;
  saveResumeVersion: SaveResumeVersionUseCase;
  saveDocumentVersion: SaveDocumentVersionUseCase;
  getFitSummary: GetFitSummaryUseCase;
  updateApplicationDetails: UpdateApplicationDetailsUseCase;
  manageBank: ManageBankUseCase;
  manageApplications: ManageApplicationsUseCase;
  manageSettings: ManageSettingsUseCase;
  managePreferences: ManagePreferencesUseCase;
  jobFacts: JobFactsUseCase;
  extractJobFacts: ((
    rawPosting: string,
    options?: { useLlmIfNeeded?: boolean },
  ) => Promise<JobFacts & { facts: JobFacts }>) & {
    overrideFact(
      applicationId: string,
      key: 'location' | 'workPermits' | 'languages' | 'salary' | 'employmentType',
      nextValue: unknown,
    ): Promise<Result<Application>>;
  };
  quickCheck: QuickCheckUseCase;
  listImportFormats: ListImportFormatsUseCase;
  listExportFormats: ListExportFormatsUseCase;
  listLlmProviders: ListLlmProvidersUseCase;
  testLlmConnection: TestLlmConnectionUseCase;
  performance: HarnessPerformanceUseCase;
}


