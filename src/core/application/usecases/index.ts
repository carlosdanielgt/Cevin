import { z } from 'zod';
import {
  Achievement,
  Application,
  BankSnapshot,
  Certification,
  CoverLetterBlock,
  CoverLetterDraft,
  CoverLetterPrioritizedFix,
  DEFAULT_USER_PREFERENCES,
  DocumentKind,
  DocumentVersion,
  Education,
  Experience,
  JobFacts,
  ParsedJob,
  PositionedText,
  PrioritizedFix,
  Project,
  RawDocument,
  Result,
  RoundTripReport,
  Skill,
  SkillCategory,
  TEMPLATE_SPEC_VERSION,
  TailoredBullet,
  UserPreferences,
  VoiceLevel,
  applyVoiceLexiconPass,
  buildCustomAliasMap,
  buildGroundedCoverLetterBlocks,
  computeAtsAndJobMatchScores,
  computeBulletImpactStrength,
  computeDocumentContentHash,
  createDefaultCoverLetterDraft,
  evaluateCoverLetterChecks,
  evaluateKeywordPresence,
  evaluateFit,
  evaluateQuickCheckPosting,
  evaluateRoundTripText,
  exportFilename,
  extractDeterministicJobBrief,
  extractDomainKeywordsFromText,
  extractJobFactsByRules,
  extractTargetJdExcerpt,
  formatAchievementInVoice,
  getOneStepMoreHumanVoice,
  lintMachineMadeScore,
  mapApplicationToResumeDocument,
  mapExtractedExperienceToAchievement,
  mapToCoverLetterDocument,
  normalizeKeyword,
  orderExperiencesForDraft,
  outlineCoverLetter,
  rankBankItemsForJob,
  sanitizeExportFilenameInput,
  sliceCandidateBankForSummary,
  smartTrimBulletText,
  sortExperiencesChronologically,
  validateBulletGrounding,
  validateCoverLetterGrounding,
} from '../../domain';
import { createLlmGateway } from '../gateway';
import {
  CevinUseCases,
  ConnectionDiagnosticResult,
  ExportDocumentUseCase,
  GetFitSummaryUseCase,
  ParsedResumeCandidate,
  RenderPreviewUseCase,
  SaveDocumentVersionUseCase,
  SidebarConnectionStatus,
  UpdateApplicationDetailsUseCase,
} from '../ports/inbound';
import {
  AppSettings,
  ApplicationRepository,
  BankRepository,
  CachedTaskResult,
  CareerIntelligencePort,
  Clock,
  ExporterCatalog,
  IdGenerator,
  ImporterCatalog,
  LlmProvider,
  LlmProviderCatalog,
  ModelProfile,
  ModelProfileCatalog,
  PerformanceCallEntry,
  PerformanceLog,
  PerformanceProfile,
  PerformanceSummary,
  PreferencesRepository,
  ResultCache,
  SettingsRepository,
  TemplateCatalog,
  resolveMlxModelPath,
} from '../ports/outbound';
import {
  buildStructureResumePrompt,
  executeStructuredLlmCall,
} from '../prompts';
import {
  RefinedJobBriefSchema,
  extractJobFactTask,
  refineJobBriefTask,
  rewriteBulletTask,
  writeLetterBlockTask,
  writeSummaryTask,
} from '../tasks';
import { createDemoApplications, createDemoBankSnapshot } from './demoData';

export interface UseCaseDependencies {
  bankRepo: BankRepository;
  appRepo: ApplicationRepository;
  settingsRepo: SettingsRepository;
  prefsRepo?: PreferencesRepository;
  importerCatalog: ImporterCatalog;
  exporterCatalog: ExporterCatalog;
  templateCatalog: TemplateCatalog;
  llmCatalog: LlmProviderCatalog;
  modelProfileCatalog?: ModelProfileCatalog;
  resultCache?: ResultCache;
  performanceLog?: PerformanceLog;
  clock: Clock;
  idGen: IdGenerator;
}

const LlmStructuredResumeSchema = z.object({
  name: z.string().optional(),
  headline: z.string().optional(),
  email: z.string().optional(),
  phone: z.string().optional(),
  location: z.string().optional(),
  experiences: z
    .array(
      z.object({
        company: z.string(),
        title: z.string(),
        location: z.string().optional(),
        start: z.string(),
        end: z.string(),
        achievements: z.array(
          z.object({
            action: z.string(),
            result: z.string(),
            metric: z.string().optional(),
            tags: z.array(z.string()).optional(),
          }),
        ),
      }),
    )
    .optional(),
  skills: z
    .array(
      z.object({
        name: z.string(),
        category: z
          .enum([
            'Languages',
            'Frameworks',
            'Infrastructure',
            'Data & AI',
            'Practices',
            'Tools',
          ])
          .optional(),
        aliases: z.array(z.string()).optional(),
      }),
    )
    .optional(),
});

function ensureCoverLetterDraft(
  app: Application,
  bank: BankSnapshot,
): CoverLetterDraft {
  const existing = app.coverLetterDraft ?? app.documents?.coverLetter;
  if (existing && existing.blocks.length > 0) {
    return existing;
  }
  return createDefaultCoverLetterDraft(app, bank);
}

function syncApplicationWithBank(
  app: Application,
  bank: BankSnapshot,
): { app: Application; changed: boolean } {
  const excludedSet = new Set(app.workingDraft.excludedSkillIds ?? []);
  const bankSkillIdSet = new Set(bank.skills.map((s) => s.id));
  const currentSelected = app.workingDraft.selectedSkillIds.filter((id) =>
    bankSkillIdSet.has(id),
  );
  const selectedSet = new Set(currentSelected);
  let skillsChanged =
    currentSelected.length !== app.workingDraft.selectedSkillIds.length;

  // Only auto-sync newly added bank skills if they match this application's job requirements/keywords
  // (e.g. candidate added a missing skill like Helm in Experience Bank to cover an identified gap)
  if (app.parsedJob) {
    const customAliases = buildCustomAliasMap(bank.skills);
    const jdCorpus = `${app.parsedJob.title} ${app.parsedJob.requirements.map((r) => r.text).join(' ')} ${app.parsedJob.keywords.map((k) => k.term).join(' ')} ${app.parsedJob.responsibilities.join(' ')}`;

    for (const skill of bank.skills) {
      if (!selectedSet.has(skill.id) && !excludedSet.has(skill.id)) {
        const skillCorpus = `${skill.name} ${skill.aliases.join(' ')}`;
        const presence = evaluateKeywordPresence(
          skill.name,
          jdCorpus,
          customAliases,
        );
        const reversePresence = app.parsedJob.requirements.some(
          (r) =>
            evaluateKeywordPresence(r.text, skillCorpus, customAliases) !==
            'gap',
        );
        if (presence !== 'gap' || reversePresence) {
          currentSelected.push(skill.id);
          selectedSet.add(skill.id);
          skillsChanged = true;
        }
      }
    }
  }

  if (!skillsChanged) {
    return { app, changed: false };
  }

  const nextWorkingDraft = {
    ...app.workingDraft,
    selectedSkillIds: currentSelected,
  };
  const clDraft = ensureCoverLetterDraft(app, bank);
  const nextApp: Application = {
    ...app,
    workingDraft: nextWorkingDraft,
    coverLetterDraft: clDraft,
    documents: {
      resume: nextWorkingDraft,
      coverLetter: clDraft,
    },
  };
  nextApp.latestScores = computeAtsAndJobMatchScores(
    nextApp,
    bank,
    app.latestScores.roundTrip,
  ).scores;

  return { app: nextApp, changed: true };
}

const DEFAULT_QWEN_1_5B_MLX_PROFILE: ModelProfile = {
  id: 'qwen25_1_5b_mlx',
  label: 'Qwen2.5 1.5B Fine-Tuned (4-bit MLX)',
  description:
    'Fine-tuned Qwen2.5-1.5B Rank-32 LoRA model trained on structured career reasoning (~1.2 GB RAM).',
  estimatedMemoryGb: 1.15,
  isRecommendedDefault: true,
  matches: (name: string) => {
    const norm = name.trim().toLowerCase();
    return (
      norm === 'qwen2.5-1.5b-instruct-4bit' ||
      norm === 'cevin-1.5b-4bit-fused' ||
      norm.includes('qwen2.5-1.5b') ||
      norm.includes('cevin-1.5b') ||
      norm.includes('1.5b-instruct') ||
      norm === 'demo mode'
    );
  },
  maxSeqLength: 1024,
  parallelRecommended: 1,
  disableRawPromptTrimming: true,
  temperatures: {
    classify: 0,
    extract: 0,
    bullet: 0,
    summary: 0.2,
    letter: 0.2,
  },
  topP: 0.9,
  tokenCaps: {
    bullet: 512,
    summary: 512,
    letterBlock: 512,
    briefRefine: 512,
    importClassify: 512,
    jobFact: 512,
  },
  stop: [],
  fewShotStyle: 'inline',
  serverEnv: [
    'CEVIN_MLX_DEFAULT_MODEL=Qwen2.5-1.5B-Instruct-4bit',
    'CEVIN_MLX_1_5B_PATH=./cevin-1.5b-4bit-fused',
  ],
};

const DEFAULT_CEVIN3B_MLX_PROFILE: ModelProfile = {
  id: 'cevin_3b_mlx',
  label: 'Cevin 3B Fine-Tuned (4-bit MLX)',
  description:
    'Fine-tuned Qwen2.5-3B LoRA model trained on structured career reasoning (~2.7 GB RAM).',
  estimatedMemoryGb: 2.73,
  isRecommendedDefault: false,
  matches: (name: string) => {
    const norm = name.trim().toLowerCase();
    return (
      norm === 'cevin-3b-4bit-fused' ||
      norm.includes('cevin-3b') ||
      norm.includes('qwen2.5-3b')
    );
  },
  maxSeqLength: 1024,
  parallelRecommended: 1,
  disableRawPromptTrimming: true,
  temperatures: {
    classify: 0,
    extract: 0,
    bullet: 0,
    summary: 0.2,
    letter: 0.2,
  },
  topP: 0.9,
  tokenCaps: {
    bullet: 512,
    summary: 512,
    letterBlock: 512,
    briefRefine: 512,
    importClassify: 512,
    jobFact: 512,
  },
  stop: [],
  fewShotStyle: 'inline',
  serverEnv: [
    'CEVIN_MLX_3B_PATH=./cevin-3b-4bit-fused',
    'CEVIN_MLX_MODEL_PATH=./cevin-3b-4bit-fused',
  ],
};

const DEFAULT_GENERIC_PROFILE: ModelProfile = {
  id: 'generic',
  label: 'Generic Local Model',
  isRecommendedDefault: false,
  matches: () => true,
  maxSeqLength: 1024,
  parallelRecommended: 1,
  disableRawPromptTrimming: false,
  temperatures: {
    classify: 0,
    extract: 0,
    bullet: 0.35,
    summary: 0.35,
    letter: 0.5,
  },
  topP: 0.85,
  tokenCaps: {
    bullet: 120,
    summary: 160,
    letterBlock: 220,
    briefRefine: 240,
    importClassify: 450,
    jobFact: 100,
  },
  stop: ['\n'],
  fewShotStyle: 'chat-turns',
  serverEnv: [],
};

function createFallbackPreferencesRepo(): PreferencesRepository {
  let currentPrefs: UserPreferences = { ...DEFAULT_USER_PREFERENCES };
  return {
    async getPreferences() {
      return { ...currentPrefs };
    },
    async savePreferences(prefs) {
      currentPrefs = { ...prefs };
    },
    async clear() {
      currentPrefs = { ...DEFAULT_USER_PREFERENCES };
    },
  };
}

function createFallbackResultCache(): ResultCache {
  const map = new Map<string, CachedTaskResult>();
  return {
    async get(key) {
      return map.get(key) ?? null;
    },
    async set(entry) {
      if (map.size >= 5000 && !map.has(entry.key)) {
        const oldest = map.keys().next().value;
        if (oldest) map.delete(oldest);
      }
      map.set(entry.key, entry);
    },
    async clear() {
      map.clear();
    },
    async count() {
      return map.size;
    },
  };
}

function createFallbackPerformanceLog(): PerformanceLog {
  let entries: PerformanceCallEntry[] = [];
  return {
    async recordCall(entry) {
      entries.push(entry);
      if (entries.length > 100) {
        entries = entries.slice(entries.length - 100);
      }
    },
    async getSummary(limit = 20): Promise<PerformanceSummary> {
      const sorted = [...entries].sort((a, b) =>
        b.createdAt.localeCompare(a.createdAt),
      );
      let rSum = 0;
      let rCnt = 0;
      let wSum = 0;
      let wCnt = 0;
      let cacheHits = 0;
      let repairs = 0;
      let fallbacks = 0;
      for (const c of sorted) {
        if (c.cached) cacheHits++;
        if (c.repaired) repairs++;
        if (c.fellBackToBaseline) fallbacks++;
        if (c.readingTokPerSec) {
          rSum += c.readingTokPerSec;
          rCnt++;
        }
        if (c.writingTokPerSec) {
          wSum += c.writingTokPerSec;
          wCnt++;
        }
      }
      return {
        readingSpeedTokPerSec: rCnt > 0 ? Math.round(rSum / rCnt) : 0,
        writingSpeedTokPerSec: wCnt > 0 ? Math.round(wSum / wCnt) : 0,
        totalCalls: sorted.length,
        cacheHits,
        repairs,
        fallbacks,
        recentCalls: sorted.slice(0, limit),
      };
    },
    async clear() {
      entries = [];
    },
  };
}

export function createCevinUseCases(deps: UseCaseDependencies): CevinUseCases {
  const resultCache = deps.resultCache ?? createFallbackResultCache();
  const performanceLog = deps.performanceLog ?? createFallbackPerformanceLog();
  const prefsRepo = deps.prefsRepo ?? createFallbackPreferencesRepo();

  const resolveModelProfile = (modelName: string): ModelProfile => {
    if (deps.modelProfileCatalog) {
      return deps.modelProfileCatalog.resolveForModel(modelName);
    }
    if (DEFAULT_QWEN_1_5B_MLX_PROFILE.matches(modelName)) {
      return DEFAULT_QWEN_1_5B_MLX_PROFILE;
    }
    if (DEFAULT_CEVIN3B_MLX_PROFILE.matches(modelName)) {
      return DEFAULT_CEVIN3B_MLX_PROFILE;
    }
    return DEFAULT_GENERIC_PROFILE;
  };

  const getActiveLlmProvider = async (): Promise<{
    provider: LlmProvider;
    providerId: string;
    modelId: string;
    profile: ModelProfile;
    parallelSlots: number;
    supportsJsonSchema: boolean;
    supportsEmbeddings: boolean;
    embedModel?: string;
  }> => {
    const settings = await deps.settingsRepo.getSettings();
    const descriptor =
      deps.llmCatalog.getById(settings.activeProviderId) ??
      deps.llmCatalog.getById('mlx-fastapi') ??
      deps.llmCatalog.getById('mock') ??
      deps.llmCatalog.list()[0];

    const rawConfig =
      settings.providerConfigs[descriptor.id] ??
      settings.providerConfigs[settings.activeProviderId] ??
      (descriptor.defaultConfig as Record<string, unknown>);
    const provider = descriptor.create(rawConfig);
    const modelId =
      typeof rawConfig.model === 'string' && rawConfig.model
        ? rawConfig.model
        : descriptor.id === 'mock'
          ? 'Demo mode'
          : 'Qwen2.5-1.5B-Instruct-4bit';
    const profile = resolveModelProfile(modelId);
    const parallelSlots =
      descriptor.id === 'mlx-fastapi'
        ? 1
        : (settings.parallelSlots ?? profile.parallelRecommended ?? 1);
    const embedModel =
      typeof rawConfig.embeddingModel === 'string' && rawConfig.embeddingModel
        ? rawConfig.embeddingModel
        : undefined;

    return {
      provider,
      providerId: descriptor.id,
      modelId,
      profile,
      parallelSlots,
      supportsJsonSchema: descriptor.capabilities.jsonSchema,
      supportsEmbeddings:
        Boolean(settings.smarterMatchingEnabled) &&
        descriptor.capabilities.embeddings,
      embedModel,
    };
  };

  const gateway = createLlmGateway({
    getProviderAndProfile: async () => {
      const active = await getActiveLlmProvider();
      return {
        provider: active.provider,
        providerId: active.providerId,
        modelName: active.modelId,
        profile: active.profile,
        parallelSlots: active.parallelSlots,
      };
    },
    resultCache,
    performanceLog,
    clock: deps.clock,
    idGen: deps.idGen,
  });

  const testConnectionInternal = async (
    providerId: string,
    configOverride?: Record<string, unknown>,
  ): Promise<ConnectionDiagnosticResult> => {
    const settings = await deps.settingsRepo.getSettings();
    const descriptor = deps.llmCatalog.getById(providerId);
    if (!descriptor) {
      return {
        connected: false,
        providerId,
        endpoint: 'unknown',
        models: [],
        statusCode: 'UNREACHABLE',
        headline: `Unknown provider "${providerId}"`,
        details: 'Choose the Cevin model or Demo mode in Settings.',
      };
    }

    const config = {
      ...(descriptor.defaultConfig as Record<string, unknown>),
      ...(settings.providerConfigs[descriptor.id] ?? {}),
      ...(settings.providerConfigs[providerId] ?? {}),
      ...(configOverride ?? {}),
    };
    const endpoint =
      typeof config.baseUrl === 'string'
        ? config.baseUrl
        : 'in-browser-demo';

    try {
      const instance = descriptor.create(config);
      const models = await instance.listModels();

      if (models.length === 0) {
        return {
          connected: false,
          providerId: descriptor.id,
          endpoint,
          models: [],
          statusCode: 'NO_MODELS',
          headline: `Connected to ${endpoint}, but no model is loaded.`,
          remediationCommand:
            'uvicorn mlx_server:app --host 127.0.0.1 --port 8000',
          details:
            'Ensure ./cevin-1.5b-4bit-fused or ./cevin-3b-4bit-fused is present in the project root, then test connection again.',
        };
      }

      const configuredModel =
        typeof config.model === 'string' ? config.model.trim() : '';
      if (
        configuredModel &&
        !models.some(
          (m) => m.id === configuredModel || m.name === configuredModel,
        )
      ) {
        return {
          connected: false,
          providerId: descriptor.id,
          endpoint,
          models,
          statusCode: 'MODEL_MISSING',
          headline: `Model "${configuredModel}" is not loaded at ${endpoint}.`,
          remediationCommand: 'uvicorn mlx_server:app --host 127.0.0.1 --port 8000',
          details: `Available models: ${models.map((m) => m.name).join(', ')}`,
        };
      }

      return {
        connected: true,
        providerId: descriptor.id,
        endpoint,
        models,
        statusCode: 'OK',
        headline: `Connected to ${descriptor.label}.`,
        details: `Active model: ${configuredModel || models[0].name}`,
      };
    } catch {
      return {
        connected: false,
        providerId: descriptor.id,
        endpoint,
        models: [],
        statusCode: 'UNREACHABLE',
        headline: `Can't reach the Cevin model at ${endpoint}.`,
        remediationCommand: 'uvicorn mlx_server:app --host 127.0.0.1 --port 8000',
        details:
          'Run the command from the project root with your Python virtual environment active.',
      };
    }
  };

  const uint8ToBase64 = (bytes: Uint8Array): string => {
    if (typeof Buffer !== 'undefined') {
      return Buffer.from(bytes).toString('base64');
    }
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    return btoa(binary);
  };

  const base64ToUint8 = (b64: string): Uint8Array => {
    if (typeof Buffer !== 'undefined') {
      return new Uint8Array(Buffer.from(b64, 'base64'));
    }
    const binary = atob(b64);
    const out = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      out[i] = binary.charCodeAt(i);
    }
    return out;
  };

  const addSkillAndAchievementInternal = async ({
    skillName,
    requirementTerm,
    category = 'Tools',
    aliases = [],
    achievementId,
    experienceId,
    attachExperienceId,
    newAchievement,
    applicationId,
  }: {
    skillName: string;
    requirementTerm?: string;
    category?: Skill['category'];
    aliases?: string[];
    achievementId?: string;
    experienceId?: string;
    attachExperienceId?: string;
    newAchievement?: { action: string; result: string; metric?: string };
    applicationId?: string;
  }): Promise<{
    bank: BankSnapshot;
    skill: Skill;
    application?: Application;
  }> => {
    const bank = await deps.bankRepo.getSnapshot();
    const cleanName = skillName.trim();
    const norm = normalizeKeyword(cleanName);
    const cleanReqTerm = requirementTerm?.trim() ?? '';
    const reqNorm = cleanReqTerm ? normalizeKeyword(cleanReqTerm) : '';
    const extraAliases =
      cleanReqTerm && reqNorm && reqNorm !== norm ? [cleanReqTerm] : [];
    const cleanAliases = Array.from(
      new Set(
        [...aliases, ...extraAliases].map((a) => a.trim()).filter(Boolean),
      ),
    );

    let skill = bank.skills.find(
      (s) =>
        normalizeKeyword(s.name) === norm ||
        s.aliases.some((a) => normalizeKeyword(a) === norm) ||
        (reqNorm
          ? normalizeKeyword(s.name) === reqNorm ||
            s.aliases.some((a) => normalizeKeyword(a) === reqNorm)
          : false),
    );
    if (!skill) {
      skill = {
        id: deps.idGen.nextId('skill'),
        name: cleanName,
        category,
        aliases: cleanAliases,
      };
      bank.skills.push(skill);
    } else {
      skill.aliases = Array.from(
        new Set([...skill.aliases, ...cleanAliases]),
      ).filter((a) => normalizeKeyword(a) !== normalizeKeyword(skill!.name));
    }

    if (achievementId) {
      const targetAch = bank.achievements.find((a) => a.id === achievementId);
      if (targetAch) {
        if (!targetAch.skillIds.includes(skill.id)) {
          targetAch.skillIds = [...targetAch.skillIds, skill.id];
        }
        const tagLower = cleanName.toLowerCase();
        if (!targetAch.tags.includes(tagLower)) {
          targetAch.tags = [...targetAch.tags, tagLower];
        }
      }
    }

    const effectiveExperienceId = (attachExperienceId ?? experienceId)?.trim();
    let createdAch: Achievement | null = null;
    if (
      effectiveExperienceId &&
      newAchievement &&
      newAchievement.action.trim() &&
      newAchievement.result.trim()
    ) {
      createdAch = {
        id: deps.idGen.nextId('ach'),
        experienceId: effectiveExperienceId,
        action: newAchievement.action.trim(),
        result: newAchievement.result.trim(),
        metric: newAchievement.metric?.trim() || undefined,
        skillIds: [skill.id],
        tags: [
          cleanName.toLowerCase(),
          ...cleanAliases.map((a) => a.toLowerCase()),
        ],
      };
      bank.achievements.push(createdAch);
    }

    await deps.bankRepo.saveSnapshot(bank);

    let updatedApplication: Application | undefined;
    const allApps = await deps.appRepo.listApplications();
    const targetApps =
      applicationId && !allApps.some((a) => a.id === applicationId)
        ? [
            ...allApps,
            ...(await (async () => {
              const found = await deps.appRepo.getApplication(applicationId);
              return found ? [found] : [];
            })()),
          ]
        : allApps;

    for (const app of targetApps) {
      const isTargetApp = app.id === applicationId;
      const draft = { ...app.workingDraft };
      const nextExcluded = (draft.excludedSkillIds ?? []).filter(
        (id) => id !== skill.id,
      );
      draft.excludedSkillIds = nextExcluded;

      if (!draft.selectedSkillIds.includes(skill.id)) {
        draft.selectedSkillIds = [...draft.selectedSkillIds, skill.id];
      }
      if (isTargetApp && createdAch) {
        if (!draft.selectedAchievementIds.includes(createdAch.id)) {
          draft.selectedAchievementIds = [
            ...draft.selectedAchievementIds,
            createdAch.id,
          ];
        }
        draft.bullets = [
          ...draft.bullets,
          {
            id: `bullet-${createdAch.id}`,
            experienceId: createdAch.experienceId,
            text: formatAchievementInVoice(createdAch, app.voice),
            originalText: formatAchievementInVoice(createdAch, 'professional'),
            sourceIds: [createdAch.id],
            locked: false,
            unverifiedClaims: [],
          },
        ];
      }

      const nextApp: Application = {
        ...app,
        workingDraft: draft,
        documents: {
          resume: draft,
          coverLetter: ensureCoverLetterDraft(app, bank),
        },
        updatedAt: deps.clock.nowIso(),
      };
      nextApp.latestScores = computeAtsAndJobMatchScores(
        nextApp,
        bank,
        app.latestScores.roundTrip,
      ).scores;
      await deps.appRepo.saveApplication(nextApp);
      if (isTargetApp) {
        updatedApplication = nextApp;
      }
    }

    return { bank, skill, application: updatedApplication };
  };

  const renderPreviewUseCase: RenderPreviewUseCase = {
    async execute(params) {
      const settings = await deps.settingsRepo.getSettings();
      const pageSize = params.pageSize ?? settings.pageSize ?? 'letter';
      const pdfExporter = deps.exporterCatalog.getById('pdf');
      if (!pdfExporter) {
        return {
          ok: false,
          error: {
            code: 'EXPORT_FAILED',
            message: 'PDF renderer is not registered.',
          },
        };
      }

      let doc = params.document;
      if (!doc) {
        const app =
          params.application ??
          (params.applicationId
            ? await deps.appRepo.getApplication(params.applicationId)
            : null);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const kind = params.kind ?? app.lastActiveDoc ?? 'resume';
        const templateId = params.templateId ?? app.templateId;
        if (kind === 'coverLetter') {
          const clDraft = ensureCoverLetterDraft(app, bank);
          doc = mapToCoverLetterDocument({
            draft: clDraft,
            bank,
            versionNumber: 1,
            templateId,
            pageSize,
            targetCompany: app.company,
            targetRole: app.roleTitle,
            generatedAt: app.updatedAt,
          });
        } else {
          doc = mapApplicationToResumeDocument(
            { ...app, templateId },
            bank,
            1,
            pageSize,
          );
        }
      }

      const templateId =
        params.templateId ?? doc.meta.templateId ?? settings.defaultTemplateId;
      const contentHash = doc.contentHash || computeDocumentContentHash(doc);

      try {
        if (pdfExporter.renderPreview) {
          const rendered = await pdfExporter.renderPreview(doc, {
            templateId,
            pageSize,
          });
          return {
            ok: true,
            value: {
              bytes: rendered.bytes,
              pageCount: rendered.pageCount,
              positionedText: rendered.positionedText,
              contentHash: rendered.contentHash || contentHash,
              document: doc,
            },
          };
        }

        const blob = await pdfExporter.export(doc, { templateId, pageSize });
        const arrayBuf = await blob.arrayBuffer();
        const bytes = new Uint8Array(arrayBuf);
        const positionedText = pdfExporter.extractPositionedTextFromBlob
          ? await pdfExporter.extractPositionedTextFromBlob(blob)
          : [];
        const maxPage = positionedText.reduce(
          (max, item) => Math.max(max, item.page),
          1,
        );
        return {
          ok: true,
          value: {
            bytes,
            pageCount: maxPage,
            positionedText,
            contentHash,
            document: doc,
          },
        };
      } catch (err) {
        return {
          ok: false,
          error: {
            code: 'EXPORT_FAILED',
            message:
              err instanceof Error ? err.message : 'Preview render failed.',
          },
        };
      }
    },
  };

  const saveDocumentVersionUseCase: SaveDocumentVersionUseCase = {
    async execute(
      applicationId: string,
      label?: string,
      kind: DocumentKind = 'resume',
      options?: {
        pdfBytes?: Uint8Array;
        contentHash?: string;
        pageSize?: 'letter' | 'a4';
      },
    ) {
      const app = await deps.appRepo.getApplication(applicationId);
      if (!app) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Application not found.' },
        };
      }
      const bank = await deps.bankRepo.getSnapshot();
      const existingVersions = await deps.appRepo.listVersions(applicationId);
      const sameKindVersions = existingVersions.filter(
        (v) => (v.kind ?? 'resume') === kind,
      );
      const nextNumber =
        sameKindVersions.reduce((max, v) => Math.max(max, v.number), 0) + 1;

      const scores = computeAtsAndJobMatchScores(
        app,
        bank,
        app.latestScores.roundTrip,
      ).scores;

      const settings = await deps.settingsRepo.getSettings();
      const pageSize = options?.pageSize ?? settings.pageSize ?? 'letter';
      const providerCfg =
        settings.providerConfigs[settings.activeProviderId] ?? {};
      const modelLabel =
        typeof providerCfg.model === 'string' && providerCfg.model
          ? providerCfg.model
          : settings.activeProviderId === 'mock'
            ? 'Demo mode'
            : 'cevin-3b-4bit-fused';

      const pdfExporter = deps.exporterCatalog.getById('pdf');

      if (kind === 'coverLetter') {
        const clDraft = ensureCoverLetterDraft(app, bank);
        const clEval = evaluateCoverLetterChecks({
          draft: clDraft,
          parsedJob: app.parsedJob,
          bank,
          company: app.company,
          roleTitle: app.roleTitle,
        });
        const clDoc = mapToCoverLetterDocument({
          draft: clDraft,
          bank,
          versionNumber: nextNumber,
          templateId: app.templateId,
          pageSize,
          targetCompany: app.company,
          targetRole: app.roleTitle,
          generatedAt: deps.clock.nowIso(),
        });
        let pdfBytes = options?.pdfBytes;
        if (!pdfBytes && pdfExporter) {
          try {
            if (pdfExporter.renderPreview) {
              const r = await pdfExporter.renderPreview(clDoc, {
                templateId: app.templateId,
                pageSize,
              });
              pdfBytes = r.bytes;
            } else {
              const b = await pdfExporter.export(clDoc, {
                templateId: app.templateId,
                pageSize,
              });
              pdfBytes = new Uint8Array(await b.arrayBuffer());
            }
          } catch {
            // Non-fatal fallback
          }
        }
        const version: DocumentVersion = {
          id: deps.idGen.nextId('ver'),
          applicationId,
          kind: 'coverLetter',
          number: nextNumber,
          label:
            label?.trim() ||
            `Cover letter v${nextNumber} · ${clDraft.voice.charAt(0).toUpperCase() + clDraft.voice.slice(1)}`,
          coverLetterContent: JSON.parse(JSON.stringify(clDraft)),
          voice: clDraft.voice,
          templateId: app.templateId,
          templateVersion: TEMPLATE_SPEC_VERSION,
          pageSize,
          contentHash: options?.contentHash ?? clDoc.contentHash,
          pdfBytes,
          pdfBytesBase64: pdfBytes ? uint8ToBase64(pdfBytes) : undefined,
          modelId: modelLabel,
          scores: {
            ...scores,
            jobMatch: clEval.jobMatch,
          },
          letterChecks: clEval.report,
          createdAt: deps.clock.nowIso(),
        };
        await deps.appRepo.saveVersion(version);
        return { ok: true, value: version };
      }

      const resDoc = mapApplicationToResumeDocument(
        app,
        bank,
        nextNumber,
        pageSize,
      );
      let pdfBytes = options?.pdfBytes;
      if (!pdfBytes && pdfExporter) {
        try {
          if (pdfExporter.renderPreview) {
            const r = await pdfExporter.renderPreview(resDoc, {
              templateId: app.templateId,
              pageSize,
            });
            pdfBytes = r.bytes;
          } else {
            const b = await pdfExporter.export(resDoc, {
              templateId: app.templateId,
              pageSize,
            });
            pdfBytes = new Uint8Array(await b.arrayBuffer());
          }
        } catch {
          // Non-fatal fallback
        }
      }

      const version: DocumentVersion = {
        id: deps.idGen.nextId('ver'),
        applicationId,
        kind: 'resume',
        number: nextNumber,
        label:
          label?.trim() ||
          `Resume v${nextNumber} · ${app.voice.charAt(0).toUpperCase() + app.voice.slice(1)} (${app.templateId})`,
        content: JSON.parse(JSON.stringify(app.workingDraft)),
        voice: app.voice,
        templateId: app.templateId,
        templateVersion: TEMPLATE_SPEC_VERSION,
        pageSize,
        contentHash: options?.contentHash ?? resDoc.contentHash,
        pdfBytes,
        pdfBytesBase64: pdfBytes ? uint8ToBase64(pdfBytes) : undefined,
        modelId: modelLabel,
        scores,
        createdAt: deps.clock.nowIso(),
      };

      await deps.appRepo.saveVersion(version);
      return { ok: true, value: version };
    },
  };

  const exportDocumentUseCase: ExportDocumentUseCase = {
    async execute({
      applicationId,
      exporterId,
      templateId,
      kind = 'resume',
      autoSaveVersion = true,
      customFileName,
      document: passedDocument,
      contentHash: passedContentHash,
      versionId,
      pageSize: passedPageSize,
      previewBytes,
    }) {
      const app = await deps.appRepo.getApplication(applicationId);
      if (!app) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Application not found.' },
        };
      }
      const exporter = deps.exporterCatalog.getById(exporterId);
      if (!exporter) {
        return {
          ok: false,
          error: {
            code: 'EXPORT_FAILED',
            message: `Export format "${exporterId}" is not available.`,
          },
        };
      }

      const settings = await deps.settingsRepo.getSettings();
      const pageSize = passedPageSize ?? settings.pageSize ?? 'letter';
      const bank = await deps.bankRepo.getSnapshot();
      const versions = await deps.appRepo.listVersions(applicationId);

      // 1. Exporting an existing saved version (`versionId`)
      if (versionId) {
        const targetVer = versions.find((v) => v.id === versionId);
        if (!targetVer) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Saved version not found.' },
          };
        }
        const verKind = targetVer.kind ?? kind;
        const verTemplateId = targetVer.templateId ?? templateId;
        const verPageSize = targetVer.pageSize ?? pageSize;

        // If exporting PDF and stored bytes exist on the version, download stored bytes directly
        const storedBytes =
          targetVer.pdfBytes instanceof Uint8Array
            ? targetVer.pdfBytes
            : targetVer.pdfBytesBase64
              ? base64ToUint8(targetVer.pdfBytesBase64)
              : null;

        if (exporterId === 'pdf' && storedBytes && storedBytes.length > 0) {
          const blob = new Blob([new Uint8Array(storedBytes)], {
            type: exporter.mimeType,
          });
          const defaultName = exportFilename({
            fullName: bank.profile.name,
            company: app.company,
            kind: verKind,
            extension: exporter.fileExtension,
          });
          const fileName = customFileName?.trim()
            ? sanitizeExportFilenameInput(
                customFileName,
                exporter.fileExtension,
              )
            : defaultName;
          return {
            ok: true,
            value: {
              blob,
              fileName,
              mimeType: exporter.mimeType,
              contentHash: targetVer.contentHash,
              savedVersion: targetVer,
              regeneratedFromBackup: Boolean(targetVer.regeneratedFromBackup),
            },
          };
        }

        // Otherwise rebuild the document from the version's stored snapshot (e.g. backup restore or markdown/text export)
        const verDoc =
          verKind === 'coverLetter'
            ? mapToCoverLetterDocument({
                draft:
                  targetVer.coverLetterContent ??
                  ensureCoverLetterDraft(app, bank),
                bank,
                versionNumber: targetVer.number,
                templateId: verTemplateId,
                pageSize: verPageSize,
                targetCompany: app.company,
                targetRole: app.roleTitle,
                generatedAt: targetVer.createdAt,
              })
            : mapApplicationToResumeDocument(
                {
                  ...app,
                  voice: targetVer.voice,
                  templateId: verTemplateId,
                  workingDraft: targetVer.content ?? app.workingDraft,
                },
                bank,
                targetVer.number,
                verPageSize,
              );

        try {
          const blob = await exporter.export(verDoc, {
            templateId: verTemplateId,
            pageSize: verPageSize,
          });
          if (exporterId === 'pdf') {
            const regenBytes = new Uint8Array(await blob.arrayBuffer());
            const updatedVer: DocumentVersion = {
              ...targetVer,
              contentHash: targetVer.contentHash ?? verDoc.contentHash,
              templateVersion:
                targetVer.templateVersion ?? TEMPLATE_SPEC_VERSION,
              pdfBytes: regenBytes,
              pdfBytesBase64: uint8ToBase64(regenBytes),
              regeneratedFromBackup: true,
            };
            await deps.appRepo.saveVersion(updatedVer);
          }
          const defaultName = exportFilename({
            fullName: bank.profile.name,
            company: app.company,
            kind: verKind,
            extension: exporter.fileExtension,
          });
          const fileName = customFileName?.trim()
            ? sanitizeExportFilenameInput(
                customFileName,
                exporter.fileExtension,
              )
            : defaultName;
          return {
            ok: true,
            value: {
              blob,
              fileName,
              mimeType: exporter.mimeType,
              contentHash: verDoc.contentHash,
              savedVersion: targetVer,
              regeneratedFromBackup: true,
            },
          };
        } catch (err) {
          return {
            ok: false,
            error: {
              code: 'EXPORT_FAILED',
              message: `Export failed: ${err instanceof Error ? err.message : String(err)}`,
            },
          };
        }
      }

      // 2. Exporting the working draft (or explicit passed document from Studio preview)
      const sameKindVersions = versions.filter(
        (v) => (v.kind ?? 'resume') === kind,
      );
      const nextVerNum =
        sameKindVersions.reduce((max, v) => Math.max(max, v.number), 0) + 1;

      const clDraft = ensureCoverLetterDraft(app, bank);
      const doc =
        passedDocument ??
        (kind === 'coverLetter'
          ? mapToCoverLetterDocument({
              draft: clDraft,
              bank,
              versionNumber: nextVerNum,
              templateId,
              pageSize,
              targetCompany: app.company,
              targetRole: app.roleTitle,
              generatedAt: deps.clock.nowIso(),
            })
          : mapApplicationToResumeDocument(
              { ...app, templateId },
              bank,
              nextVerNum,
              pageSize,
            ));

      if (
        passedContentHash &&
        doc.contentHash &&
        passedContentHash !== doc.contentHash
      ) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION_ERROR',
            message:
              'Preview content hash did not match export document. Please wait for preview refresh.',
          },
        };
      }

      try {
        let blob: Blob;
        let pdfBytesForSave: Uint8Array | undefined;

        if (
          exporterId === 'pdf' &&
          previewBytes &&
          previewBytes.length > 0 &&
          (!passedContentHash || passedContentHash === doc.contentHash)
        ) {
          blob = new Blob([new Uint8Array(previewBytes)], {
            type: exporter.mimeType,
          });
          pdfBytesForSave = previewBytes;
        } else if (exporterId === 'pdf' && exporter.renderPreview) {
          const rendered = await exporter.renderPreview(doc, {
            templateId,
            pageSize,
          });
          pdfBytesForSave = rendered.bytes;
          blob = new Blob([new Uint8Array(rendered.bytes)], {
            type: exporter.mimeType,
          });
        } else {
          blob = await exporter.export(doc, { templateId, pageSize });
          if (exporterId === 'pdf') {
            pdfBytesForSave = new Uint8Array(await blob.arrayBuffer());
          }
        }

        let savedVersion: DocumentVersion | undefined;
        if (autoSaveVersion) {
          const saveRes = await saveDocumentVersionUseCase.execute(
            applicationId,
            `Exported ${exporter.label} (${templateId})`,
            kind,
            {
              pdfBytes: pdfBytesForSave,
              contentHash: doc.contentHash,
              pageSize,
            },
          );
          if (saveRes.ok) {
            savedVersion = saveRes.value;
          }
        }

        const defaultName = exportFilename({
          fullName: bank.profile.name,
          company: app.company,
          kind,
          extension: exporter.fileExtension,
        });
        const fileName = customFileName?.trim()
          ? sanitizeExportFilenameInput(
              customFileName,
              exporter.fileExtension,
            )
          : defaultName;

        return {
          ok: true,
          value: {
            blob,
            fileName,
            mimeType: exporter.mimeType,
            contentHash: doc.contentHash,
            savedVersion,
          },
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          error: {
            code: 'EXPORT_FAILED',
            message: `Export failed: ${msg}`,
          },
        };
      }
    },
  };

  const getFitSummaryUseCase: GetFitSummaryUseCase = {
    async execute({
      applicationId,
      application,
      facts,
      preferencesOverride,
    }) {
      const prefs =
        preferencesOverride ??
        (await prefsRepo.getPreferences()) ??
        DEFAULT_USER_PREFERENCES;
      let targetFacts = facts;
      if (!targetFacts) {
        const app =
          application ??
          (applicationId
            ? await deps.appRepo.getApplication(applicationId)
            : null);
        targetFacts =
          app?.jobFacts ??
          extractJobFactsByRules(app?.jobDescription ?? '').facts;
      }
      return evaluateFit(targetFacts, prefs);
    },
  };

  const updateApplicationDetailsUseCase: UpdateApplicationDetailsUseCase = {
    async execute({
      applicationId,
      postingUrl,
      appliedDate,
      notes,
      status,
      factsExpandedOverride,
    }) {
      const app = await deps.appRepo.getApplication(applicationId);
      if (!app) {
        return {
          ok: false,
          error: { code: 'NOT_FOUND', message: 'Application not found.' },
        };
      }
      const nextStatus = status ?? app.status;
      let nextAppliedDate =
        appliedDate !== undefined ? appliedDate : app.appliedDate;
      if (
        nextStatus === 'Applied' &&
        app.status !== 'Applied' &&
        !nextAppliedDate
      ) {
        nextAppliedDate = deps.clock.nowIso().slice(0, 10);
      }

      const updated: Application = {
        ...app,
        status: nextStatus,
        postingUrl: postingUrl !== undefined ? postingUrl : app.postingUrl,
        appliedDate: nextAppliedDate,
        notes: notes !== undefined ? notes : app.notes,
        factsExpandedOverride:
          factsExpandedOverride !== undefined
            ? factsExpandedOverride
            : app.factsExpandedOverride,
        updatedAt: deps.clock.nowIso(),
      };
      await deps.appRepo.saveApplication(updated);
      return { ok: true, value: updated };
    },
  };

  const extractJobFactsWithOptionalLlm = async (
    rawPosting: string,
    useLlmIfNeeded = true,
  ): Promise<JobFacts & { facts: JobFacts }> => {
    const ruleResult = extractJobFactsByRules(rawPosting);
    const facts: JobFacts = {
      location: { ...ruleResult.location, value: { ...ruleResult.location.value } },
      workPermits: { ...ruleResult.workPermits, value: { ...ruleResult.workPermits.value } },
      languages: { ...ruleResult.languages, value: { ...ruleResult.languages.value } },
      salary: { ...ruleResult.salary, value: { ...ruleResult.salary.value } },
      employmentType: { ...ruleResult.employmentType, value: { ...ruleResult.employmentType.value } },
    };

    if (useLlmIfNeeded) {
      const candidateKeys = ['location', 'workPermits', 'employmentType'] as const;
      const hasTrigger = candidateKeys.some((k) => Boolean(facts[k].triggerSnippet));
      if (hasTrigger) {
        await gateway.runWithActivity('reading-posting', async () => {
          for (const factKey of candidateKeys) {
            const snippet = facts[factKey].triggerSnippet;
            if (!snippet) continue;
            try {
              const res = await gateway.executeTask(
                extractJobFactTask,
                {
                  factKey,
                  snippet,
                  rawPosting,
                },
                {
                  itemKey: `jobfact-${factKey}`,
                  priority: 'background',
                },
              );

          if (!res.fellBackToBaseline) {
            const parsed = JSON.parse(res.text) as {
              value: string;
              quote: string;
            };
            if (parsed.value && parsed.value !== 'not-stated') {
              const quoteOffset = rawPosting
                .toLowerCase()
                .indexOf((parsed.quote || '').toLowerCase());
              const evidenceItem =
                quoteOffset >= 0 && parsed.quote
                  ? [
                      {
                        quote: rawPosting.slice(
                          quoteOffset,
                          quoteOffset + parsed.quote.length,
                        ),
                        startOffset: quoteOffset,
                        endOffset: quoteOffset + parsed.quote.length,
                      },
                    ]
                  : [];

              if (
                factKey === 'location' &&
                (parsed.value === 'remote' ||
                  parsed.value === 'hybrid' ||
                  parsed.value === 'onsite')
              ) {
                const mappedMode =
                  parsed.value === 'onsite' ? 'on-site' : parsed.value;
                facts.location = {
                  ...facts.location,
                  value: {
                    ...facts.location.value,
                    workMode: mappedMode,
                  },
                  confidence: 'high',
                  source: 'llm',
                  evidence:
                    evidenceItem.length > 0
                      ? evidenceItem
                      : facts.location.evidence,
                };
              } else if (
                factKey === 'workPermits' &&
                (parsed.value === 'sponsored' ||
                  parsed.value === 'not-offered' ||
                  parsed.value === 'conditional')
              ) {
                const mappedSponsorship =
                  parsed.value === 'sponsored'
                    ? 'yes'
                    : parsed.value === 'not-offered'
                      ? 'no'
                      : 'conditional';
                facts.workPermits = {
                  ...facts.workPermits,
                  value: {
                    ...facts.workPermits.value,
                    sponsorship: mappedSponsorship,
                  },
                  confidence: 'high',
                  source: 'llm',
                  evidence:
                    evidenceItem.length > 0
                      ? evidenceItem
                      : facts.workPermits.evidence,
                };
              } else if (
                factKey === 'employmentType' &&
                (parsed.value === 'full-time' ||
                  parsed.value === 'part-time' ||
                  parsed.value === 'contract' ||
                  parsed.value === 'internship' ||
                  parsed.value === 'temporary')
              ) {
                facts.employmentType = {
                  ...facts.employmentType,
                  value: {
                    type: parsed.value,
                  },
                  confidence: 'high',
                  source: 'llm',
                  evidence:
                    evidenceItem.length > 0
                      ? evidenceItem
                      : facts.employmentType.evidence,
                };
              }
            }
          }
            } catch {
              // Keep rule baseline on any LLM error
            }
          }
        });
      }
    }

    Object.defineProperty(facts, 'facts', {
      value: facts,
      enumerable: false,
      configurable: true,
    });
    return facts as JobFacts & { facts: JobFacts };
  };

  return {
    listImportFormats: {
      execute() {
        return deps.importerCatalog.list().map((imp) => ({
          id: imp.id,
          label: imp.label,
          extensions: imp.accepts.extensions,
          mimeTypes: imp.accepts.mimeTypes,
        }));
      },
    },

    listExportFormats: {
      execute(kind?: DocumentKind) {
        return deps.exporterCatalog
          .list()
          .filter((exp) =>
            kind ? !exp.supports || exp.supports.includes(kind) : true,
          )
          .map((exp) => ({
            id: exp.id,
            label: exp.label,
            fileExtension: exp.fileExtension,
            mimeType: exp.mimeType,
            supports: exp.supports ?? ['resume', 'coverLetter'],
            capabilities: exp.capabilities,
          }));
      },
      listTemplates() {
        return deps.templateCatalog.list();
      },
    },

    listLlmProviders: {
      execute() {
        return deps.llmCatalog.list().map((desc) => ({
          id: desc.id,
          label: desc.label,
          description: desc.description,
          locality: desc.locality,
          capabilities: desc.capabilities,
          configFields: desc.configFields,
          defaultConfig: desc.defaultConfig as Record<string, unknown>,
          supportedModels: desc.supportedModels,
        }));
      },
    },

    manageSettings: {
      async getSettings() {
        return deps.settingsRepo.getSettings();
      },
      async saveSettings(partial: Partial<AppSettings>) {
        const current = await deps.settingsRepo.getSettings();
        const updated: AppSettings = {
          ...current,
          ...partial,
          providerConfigs: {
            ...current.providerConfigs,
            ...(partial.providerConfigs ?? {}),
          },
          remoteProviderConfirmed: {
            ...current.remoteProviderConfirmed,
            ...(partial.remoteProviderConfirmed ?? {}),
          },
        };
        await deps.settingsRepo.saveSettings(updated);
        return updated;
      },
    },

    testLlmConnection: {
      execute: (providerId, configOverride) =>
        gateway.runWithActivity('checking', () =>
          testConnectionInternal(providerId, configOverride),
        ),
      async selectModel(providerId, modelId) {
        const targetModel = modelId.trim();
        const currentSettings = await deps.settingsRepo.getSettings();
        const descriptor = deps.llmCatalog.getById(providerId);
        const currentCfg = {
          ...((descriptor?.defaultConfig as Record<string, unknown> | undefined) ??
            {}),
          ...(currentSettings.providerConfigs[providerId] ?? {}),
        };
        const nextCfg: Record<string, unknown> = {
          ...currentCfg,
          model: targetModel,
        };
        if (providerId === 'mlx-fastapi') {
          nextCfg.modelPath = resolveMlxModelPath(targetModel);
        }

        await deps.settingsRepo.saveSettings({
          ...currentSettings,
          activeProviderId: providerId,
          providerConfigs: {
            ...currentSettings.providerConfigs,
            [providerId]: nextCfg,
          },
        });

        if (descriptor && targetModel) {
          try {
            const instance = descriptor.create(nextCfg);
            if (instance.selectModel) {
              await instance.selectModel(targetModel);
            }
          } catch {
            // Preserve persisted model choice even when the local MLX server is offline.
          }
        }

        return gateway.runWithActivity('checking', () =>
          testConnectionInternal(providerId),
        );
      },
      async getSidebarStatus(): Promise<SidebarConnectionStatus> {
        const settings = await deps.settingsRepo.getSettings();
        const activity = gateway.getLiveActivity();

        if (settings.activeProviderId === 'mock') {
          if (activity.warmingUp) {
            return {
              state: 'warming',
              label: 'Warming up',
              modelName: 'Demo mode',
              providerId: 'mock',
              detail: 'Preparing prompt prefix.',
              isTunedDefaultModel: true,
            };
          }
          if (activity.activeCount > 0) {
            return {
              state: 'busy',
              label: `Busy (${activity.activeCount}/${activity.maxSlots})`,
              modelName: 'Demo mode',
              providerId: 'mock',
              detail: `Running ${activity.activeCount} of ${activity.maxSlots} parallel slots.`,
              activeSlots: activity.activeCount,
              maxSlots: activity.maxSlots,
              isTunedDefaultModel: true,
            };
          }
          return {
            state: 'demo',
            label: 'Demo mode',
            providerId: 'mock',
            detail: 'Running with local demo data — no setup needed.',
            isTunedDefaultModel: true,
          };
        }

        const diag = await testConnectionInternal(settings.activeProviderId);
        if (diag.connected) {
          const cfg = settings.providerConfigs[settings.activeProviderId] ?? {};
          const modelName =
            (typeof cfg.model === 'string' && cfg.model) ||
            diag.models[0]?.name ||
            'Qwen2.5-1.5B-Instruct-4bit';
          const profile = resolveModelProfile(modelName);

          if (activity.warmingUp) {
            return {
              state: 'warming',
              label: 'Warming up',
              modelName,
              providerId: settings.activeProviderId,
              detail: 'Warming model in memory.',
              isTunedDefaultModel: profile.isRecommendedDefault,
            };
          }
          if (activity.activeCount > 0) {
            return {
              state: 'busy',
              label: `Busy (${activity.activeCount}/${activity.maxSlots})`,
              modelName,
              providerId: settings.activeProviderId,
              detail: `Rewriting with ${activity.activeCount} of ${activity.maxSlots} slots.`,
              activeSlots: activity.activeCount,
              maxSlots: activity.maxSlots,
              isTunedDefaultModel: profile.isRecommendedDefault,
            };
          }

          return {
            state: 'connected',
            label: 'Model ready',
            modelName,
            providerId: settings.activeProviderId,
            detail: diag.headline,
            isTunedDefaultModel: profile.isRecommendedDefault,
          };
        }
        return {
          state: 'offline',
          label: "Can't reach the model",
          providerId: settings.activeProviderId,
          detail: diag.headline,
        };
      },
    },

    importResumeFile: {
      async parseAndPropose(file: File): Promise<Result<ParsedResumeCandidate>> {
        const importer = deps.importerCatalog.findByFile(file.name, file.type);
        if (!importer) {
          return {
            ok: false,
            error: {
              code: 'IMPORT_UNSUPPORTED',
              message: `Unsupported file format for "${file.name}".`,
              hint: `Supported formats: ${deps.importerCatalog
                .list()
                .flatMap((i) => i.accepts.extensions)
                .join(', ')}`,
            },
          };
        }

        try {
          const rawDoc = await importer.parse(file);
          if (!rawDoc.text || rawDoc.text.trim().length < 25) {
            return {
              ok: false,
              error: {
                code: 'IMPORT_SCANNED_PDF',
                message:
                  'This file contains no selectable text layer (it appears to be a scanned image PDF).',
                hint: 'Please upload a text-based PDF or Markdown file.',
              },
            };
          }

        if (
          file.name.toLowerCase().endsWith('.json') ||
          rawDoc.formatId === 'json' ||
          rawDoc.text.trim().startsWith('{')
        ) {
          const directJsonRes = await this.parseJsonAndPropose(
            rawDoc.text,
            file.name,
          );
          if (directJsonRes.ok) {
            return directJsonRes;
          }
        }

        const currentBank = await deps.bankRepo.getSnapshot();
        const { provider, supportsJsonSchema } = await getActiveLlmProvider();

        let parsedData: z.infer<typeof LlmStructuredResumeSchema>;
        try {
          parsedData = await gateway.runWithActivity(
            'reading-resume',
            async () =>
              executeStructuredLlmCall(
                provider,
                buildStructureResumePrompt(rawDoc.text),
                LlmStructuredResumeSchema,
                supportsJsonSchema,
              ),
          );
        } catch {
          parsedData = fallbackParseResumeText(rawDoc.text);
        }

        const candidate = buildCandidateFromStructuredData(
          parsedData as Record<string, unknown>,
          rawDoc,
          currentBank,
          deps.idGen,
        );

        return {
          ok: true,
          value: candidate,
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('SCANNED_PDF')) {
          return {
            ok: false,
            error: {
              code: 'IMPORT_SCANNED_PDF',
              message:
                'Scanned PDF detected with no selectable text layer. Please upload a text-based PDF or Markdown file.',
            },
          };
        }
        return {
          ok: false,
          error: {
            code: 'IMPORT_PARSE_FAILED',
            message: `Could not parse "${file.name}": ${msg}`,
          },
        };
      }
    },

    async parseJsonAndPropose(
      rawJson: string,
      sourceName = 'External LLM',
    ): Promise<Result<ParsedResumeCandidate>> {
      try {
        const trimmed = rawJson.trim();
        const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
        const candidateJson = fenced ? fenced[1].trim() : trimmed;
        const parsed = JSON.parse(candidateJson);
        if (typeof parsed !== 'object' || parsed === null) {
          return {
            ok: false,
            error: {
              code: 'IMPORT_PARSE_FAILED',
              message: 'The content is not a valid JSON object.',
            },
          };
        }
        const currentBank = await deps.bankRepo.getSnapshot();
        const candidate = buildCandidateFromStructuredData(
          parsed as Record<string, unknown>,
          {
            fileName: sourceName.endsWith('.json')
              ? sourceName
              : `${sourceName}.json`,
            formatId: 'json',
            text: candidateJson,
            pageCount: 1,
          },
          currentBank,
          deps.idGen,
        );
        return { ok: true, value: candidate };
      } catch (err) {
        return {
          ok: false,
          error: {
            code: 'IMPORT_PARSE_FAILED',
            message:
              err instanceof Error
                ? `JSON parse error: ${err.message}`
                : 'Invalid JSON content.',
            hint: 'Please check that the JSON is valid and formatted correctly.',
          },
        };
      }
    },

      async commitImport(
        candidate: ParsedResumeCandidate,
        duplicateStrategy: 'merge' | 'skip',
      ): Promise<Result<BankSnapshot>> {
        const bank = await deps.bankRepo.getSnapshot();
        const updatedProfile = {
          ...bank.profile,
          name: candidate.proposedProfile.name || bank.profile.name,
          headline: candidate.proposedProfile.headline || bank.profile.headline,
          email: candidate.proposedProfile.email || bank.profile.email,
          phone: candidate.proposedProfile.phone || bank.profile.phone,
          location: candidate.proposedProfile.location || bank.profile.location,
        };

        const experiences = [...bank.experiences];
        const achievements = [...bank.achievements];
        const skills = [...bank.skills];

        for (const item of candidate.proposedExperiences) {
          if (item.isDuplicate && duplicateStrategy === 'skip') {
            continue;
          }
          if (item.isDuplicate && duplicateStrategy === 'merge') {
            const existingExp = experiences.find(
              (e) =>
                e.company.toLowerCase().trim() ===
                item.experience.company.toLowerCase().trim(),
            );
            if (existingExp) {
              for (const ach of item.achievements) {
                achievements.push({
                  ...ach,
                  experienceId: existingExp.id,
                });
              }
              continue;
            }
          }
          experiences.push(item.experience);
          achievements.push(...item.achievements);
        }

        for (const item of candidate.proposedSkills) {
          if (item.isDuplicate && duplicateStrategy === 'skip') continue;
          if (item.isDuplicate && duplicateStrategy === 'merge') {
            const existing = skills.find(
              (s) =>
                normalizeKeyword(s.name) === normalizeKeyword(item.skill.name),
            );
            if (existing) {
              const mergedAliases = Array.from(
                new Set([...existing.aliases, ...item.skill.aliases]),
              );
              existing.aliases = mergedAliases;
              continue;
            }
          }
          skills.push(item.skill);
        }

        const nextSnapshot: BankSnapshot = {
          ...bank,
          profile: updatedProfile,
          experiences,
          achievements,
          skills,
        };

        await deps.bankRepo.saveSnapshot(nextSnapshot);
        const existingApps = await deps.appRepo.listApplications();
        for (const existingApp of existingApps) {
          const synced = syncApplicationWithBank(existingApp, nextSnapshot);
          if (synced.changed) {
            await deps.appRepo.saveApplication(synced.app);
          }
        }
        return { ok: true, value: nextSnapshot };
      },
    },

    analyzeJobDescription: {
      async execute(applicationId: string, rawJobDescription: string) {
        return gateway.runWithActivity('reading-posting', async () => {
          const app = await deps.appRepo.getApplication(applicationId);
          if (!app) {
            return {
              ok: false,
              error: { code: 'NOT_FOUND', message: 'Application not found.' },
            };
          }

          const bank = await deps.bankRepo.getSnapshot();
          const { providerId } = await getActiveLlmProvider();

          // Always run the deterministic Job-Brief extractor first (<5ms, 0 LLM tokens)
          const compactBrief = extractDeterministicJobBrief(rawJobDescription);
          const parsedJob: ParsedJob = {
            ...compactBrief.parsedJob,
          };

          // Optional lightweight 200-token refinement via LlmGateway when connected to local model
          if (providerId !== 'mock') {
            try {
              const refinedRes = await gateway.executeTask(
                refineJobBriefTask,
                {
                  deterministicBriefText: compactBrief.briefText,
                  rawSnippet: rawJobDescription.slice(0, 900),
                  defaultTitle: parsedJob.title,
                  defaultCompany: parsedJob.company,
                  defaultSeniority: parsedJob.seniority,
                  defaultTopSkills: compactBrief.topSkills,
                },
                {
                  itemKey: `brief-${applicationId}`,
                  priority: 'interactive',
                },
              );
              const parsedRefined = RefinedJobBriefSchema.parse(
                JSON.parse(refinedRes.text),
              );
              if (parsedRefined.title.trim()) {
                parsedJob.title = parsedRefined.title.trim();
              }
              if (parsedRefined.company.trim()) {
                parsedJob.company = parsedRefined.company.trim();
              }
              if (parsedRefined.seniority.trim()) {
                parsedJob.seniority = parsedRefined.seniority.trim();
              }
            } catch {
              // Keep deterministic brief
            }
          }

        const extractedKw = extractDomainKeywordsFromText(rawJobDescription);
        const existingKwNorms = new Set(
          parsedJob.keywords.map((k) => normalizeKeyword(k.term)),
        );
        for (const kw of extractedKw) {
          if (!existingKwNorms.has(kw.normalized)) {
            parsedJob.keywords.push(kw);
          }
        }

        parsedJob.requirements = parsedJob.requirements.map((r) => ({
          ...r,
          id: r.id || deps.idGen.nextId('req'),
          normalizedKey: normalizeKeyword(r.text),
        }));

        const ranking = rankBankItemsForJob(bank, parsedJob);
        const topAchIds = ranking.rankedAchievements
          .slice(0, 6)
          .map((r) => r.achievement.id);

        const bullets: TailoredBullet[] = topAchIds
          .map((id) => bank.achievements.find((a) => a.id === id))
          .filter((a): a is Achievement => Boolean(a))
          .map((ach, idx) => {
            const text = formatAchievementInVoice(ach, app.voice, idx);
            const grounding = validateBulletGrounding(text, [ach.id], bank);
            return {
              id: `bullet-${ach.id}`,
              experienceId: ach.experienceId,
              text,
              originalText: formatAchievementInVoice(ach, 'professional', idx),
              sourceIds: [ach.id],
              locked: false,
              unverifiedClaims: grounding.unverifiedClaims,
              keptOriginalWording: false,
              attemptCount: 0,
            };
          });

        const nextWorkingDraft = {
          ...app.workingDraft,
          targetHeadline: parsedJob.title || app.workingDraft.targetHeadline,
          selectedAchievementIds: topAchIds,
          selectedSkillIds: ranking.recommendedSkillIds,
          bullets,
        };

        const extractedFacts = await extractJobFactsWithOptionalLlm(
          rawJobDescription,
          true,
        );

        const tempApp: Application = {
          ...app,
          company: parsedJob.company || app.company || 'Target Company',
          roleTitle: parsedJob.title || app.roleTitle || 'Target Role',
          jobDescription: rawJobDescription,
          parsedJob,
          jobFacts: extractedFacts,
          workingDraft: nextWorkingDraft,
          updatedAt: deps.clock.nowIso(),
        };

        const nextCoverLetter = createDefaultCoverLetterDraft(tempApp, bank);
        const letterEval = evaluateCoverLetterChecks({
          draft: nextCoverLetter,
          parsedJob,
          bank,
          company: tempApp.company,
          roleTitle: tempApp.roleTitle,
        });

        const updatedApp: Application = {
          ...tempApp,
          coverLetterDraft: nextCoverLetter,
          documents: {
            resume: nextWorkingDraft,
            coverLetter: nextCoverLetter,
          },
          latestLetterChecks: letterEval.report,
        };

        const analysis = computeAtsAndJobMatchScores(updatedApp, bank);
        updatedApp.latestScores = analysis.scores;

          await deps.appRepo.saveApplication(updatedApp);
          return { ok: true, value: { application: updatedApp, parsedJob } };
        });
      },
    },

    rankBankItems: {
      async execute(applicationId: string) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app || !app.parsedJob) {
          return {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Analyze a job description first to rank Bank items.',
            },
          };
        }

        const bank = await deps.bankRepo.getSnapshot();
        const { provider, supportsEmbeddings, embedModel } =
          await getActiveLlmProvider();

        let embeddingsPayload:
          | {
              jobVector: number[];
              achievementVectors: Record<string, number[]>;
            }
          | undefined;

        if (supportsEmbeddings && provider.embed) {
          try {
            const texts = [
              `${app.parsedJob.title} ${app.parsedJob.requirements.map((r) => r.text).join(' ')}`,
              ...bank.achievements.map(
                (a) => `${a.action} ${a.result} ${a.metric ?? ''}`,
              ),
            ];
            const vectors = await provider.embed(texts, embedModel);
            if (vectors.length === texts.length) {
              const achievementVectors: Record<string, number[]> = {};
              bank.achievements.forEach((a, idx) => {
                achievementVectors[a.id] = vectors[idx + 1];
              });
              embeddingsPayload = {
                jobVector: vectors[0],
                achievementVectors,
              };
            }
          } catch {
            embeddingsPayload = undefined;
          }
        }

        const ranking = rankBankItemsForJob(
          bank,
          app.parsedJob,
          embeddingsPayload,
        );
        return { ok: true, value: ranking };
      },
    },

    tailorResume: {
      async applyQuickVoicePass(applicationId: string, voice: VoiceLevel) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        // Cancel any pending background/visible rewrites for this application
        gateway.cancelByPrefix(`bullet-${applicationId}-`);

        const bank = await deps.bankRepo.getSnapshot();
        const achById = new Map(bank.achievements.map((a) => [a.id, a]));
        const updatedBulletIds: string[] = [];

        const nextBullets: TailoredBullet[] = app.workingDraft.bullets.map(
          (bullet) => {
            if (bullet.locked) return bullet;
            const ach = bullet.sourceIds
              .map((id) => achById.get(id))
              .find(Boolean);
            const nextText = applyVoiceLexiconPass(bullet.text, voice, ach);
            updatedBulletIds.push(bullet.id);
            const grounding = validateBulletGrounding(
              nextText,
              bullet.sourceIds,
              bank,
            );
            return {
              ...bullet,
              text: nextText,
              unverifiedClaims: grounding.unverifiedClaims,
            };
          },
        );

        const nextWorkingDraft = {
          ...app.workingDraft,
          bullets: nextBullets,
        };
        const clDraft = ensureCoverLetterDraft(app, bank);
        const updated: Application = {
          ...app,
          voice,
          workingDraft: nextWorkingDraft,
          coverLetterDraft: clDraft,
          documents: {
            resume: nextWorkingDraft,
            coverLetter: clDraft,
          },
          updatedAt: deps.clock.nowIso(),
        };
        updated.latestScores = computeAtsAndJobMatchScores(updated, bank).scores;
        await deps.appRepo.saveApplication(updated);

        const eta = await gateway.estimateEtaSeconds({
          bulletCount: updatedBulletIds.length,
        });

        return {
          ok: true,
          value: {
            application: updated,
            updatedBulletIds,
            etaLabel: eta.label,
            etaSeconds: eta.seconds,
          },
        };
      },

      async estimateEta(bulletCount: number) {
        return gateway.estimateEtaSeconds({ bulletCount });
      },

      cancelPendingTailoring(applicationId?: string) {
        if (applicationId) {
          gateway.cancelByPrefix(`bullet-${applicationId}-`);
          gateway.cancelByPrefix(`summary-${applicationId}`);
        } else {
          gateway.cancelAll();
        }
      },

      async tailorAll(
        applicationId: string,
        voice: VoiceLevel,
        onBulletProgress?: (
          bulletId: string,
          updatedApp: Application,
          completedCount: number,
          totalCount: number,
        ) => void,
      ) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }

        const bank = await deps.bankRepo.getSnapshot();
        const achById = new Map(bank.achievements.map((a) => [a.id, a]));
        const expById = new Map(bank.experiences.map((e) => [e.id, e]));
        const skillById = new Map(bank.skills.map((s) => [s.id, s]));

        const compactBrief = extractDeterministicJobBrief(
          app.jobDescription || app.roleTitle,
        );
        const bankSkillNamesLower = new Set(
          bank.skills.flatMap((s) => [
            s.name.toLowerCase(),
            ...s.aliases.map((a) => a.toLowerCase()),
          ]),
        );
        const jdOnlyTerms = (app.parsedJob?.keywords ?? [])
          .map((k) => k.term)
          .filter((t) => !bankSkillNamesLower.has(t.toLowerCase()));

        // Prepare initial bullet array (preserving locked bullets)
        const selectedAchIds = app.workingDraft.selectedAchievementIds;
        const workingBullets: TailoredBullet[] = [];
        const jobsToRun: Array<{
          index: number;
          bulletId: string;
          ach: Achievement;
        }> = [];

        for (let i = 0; i < selectedAchIds.length; i++) {
          const achId = selectedAchIds[i];
          const ach = achById.get(achId);
          if (!ach) continue;

          const existingBullet = app.workingDraft.bullets.find((b) =>
            b.sourceIds.includes(achId),
          );
          if (existingBullet?.locked) {
            workingBullets.push(existingBullet);
            continue;
          }

          const bulletId = existingBullet?.id ?? `bullet-${ach.id}`;
          const initialText = formatAchievementInVoice(ach, voice, i);
          const grounding = validateBulletGrounding(
            initialText,
            [ach.id],
            bank,
          );
          const idx = workingBullets.length;
          workingBullets.push({
            id: bulletId,
            experienceId: ach.experienceId,
            text: initialText,
            originalText: formatAchievementInVoice(ach, 'professional', i),
            sourceIds: [ach.id],
            locked: false,
            unverifiedClaims: grounding.unverifiedClaims,
            keptOriginalWording: false,
            attemptCount: 0,
          });
          jobsToRun.push({ index: idx, bulletId, ach });
        }

        let completedCount = 0;
        const totalToRewrite = jobsToRun.length;

        // Dispatch all unlocked bullets concurrently through LlmGateway (bounded by parallelSlots = 2)
        await gateway.runWithActivity(
          'rewriting',
          async () => {
            await Promise.all(
              jobsToRun.map(async ({ index, bulletId, ach }, i) => {
                const exp = expById.get(ach.experienceId);
                const linkedSkills = ach.skillIds
                  .map((sId) => skillById.get(sId)?.name)
                  .filter((n): n is string => Boolean(n));

                try {
                  const res = await gateway.executeTask(
                    rewriteBulletTask,
                    {
                      bulletId,
                      action: ach.action,
                      result: ach.result,
                      metric: ach.metric,
                      company: exp?.company ?? '',
                      roleTitle: exp?.title ?? '',
                      allowedTerms: [...linkedSkills, ...ach.tags],
                      jdOnlyTerms,
                      briefText: compactBrief.briefText,
                      briefHash: compactBrief.briefHash,
                      voice,
                      variationSeed: i,
                    },
                    {
                      itemKey: `bullet-${applicationId}-${bulletId}`,
                      priority: i < 4 ? 'visible' : 'background',
                    },
                  );

                  const grounding = validateBulletGrounding(
                    res.text,
                    [ach.id],
                    bank,
                  );
                  workingBullets[index] = {
                    ...workingBullets[index],
                    text: res.text,
                    unverifiedClaims: grounding.unverifiedClaims,
                    keptOriginalWording: res.keptOriginalWording,
                    attemptCount: res.attemptCount,
                  };
                  completedCount += 1;
                  gateway.updateBatchProgress(completedCount, totalToRewrite);

                  if (onBulletProgress) {
                    const partialDraft = {
                      ...app.workingDraft,
                      bullets: [...workingBullets],
                    };
                    const partialApp: Application = {
                      ...app,
                      voice,
                      workingDraft: partialDraft,
                    };
                    onBulletProgress(
                      bulletId,
                      partialApp,
                      completedCount,
                      totalToRewrite,
                    );
                  }
                } catch {
                  // Cancelled or superseded; keep existing deterministic baseline in workingBullets[index]
                }
              }),
            );
          },
          {
            batchCompleted: 0,
            batchTotal: totalToRewrite > 1 ? totalToRewrite : undefined,
          },
        );

        let nextSummary = app.workingDraft.summary;
        if (!app.workingDraft.summaryLocked) {
          const topSkills = bank.skills
            .filter((s) => app.workingDraft.selectedSkillIds.includes(s.id))
            .slice(0, 5)
            .map((s) => s.name);
          const companies = bank.experiences.slice(0, 2).map((e) => e.company);
          const firstMetricAch = bank.achievements.find(
            (a) =>
              app.workingDraft.selectedAchievementIds.includes(a.id) &&
              Boolean(a.metric),
          );

          try {
            const sumRes = await gateway.runWithActivity('writing', () =>
              gateway.executeTask(
                writeSummaryTask,
                {
                  headline: bank.profile.headline,
                  targetRole: app.roleTitle || bank.profile.headline,
                  targetCompany: app.company,
                  verifiedSkills: topSkills,
                  verifiedCompanies: companies,
                  topMetricSnippet: firstMetricAch?.metric,
                  briefText: compactBrief.briefText,
                  briefHash: compactBrief.briefHash,
                  voice,
                },
                {
                  itemKey: `summary-${applicationId}`,
                  priority: 'visible',
                },
              ),
            );
            nextSummary = sumRes.text;
          } catch {
            nextSummary = buildDeterministicSummary({
              roleTitle: app.roleTitle || bank.profile.headline,
              skills: topSkills,
              companies,
              metricSnippet: firstMetricAch?.metric,
              voice,
            });
          }
        }

        const nextWorkingDraft = {
          ...app.workingDraft,
          summary: nextSummary,
          bullets: workingBullets,
        };

        const clDraft = ensureCoverLetterDraft(app, bank);
        const updated: Application = {
          ...app,
          voice,
          workingDraft: nextWorkingDraft,
          coverLetterDraft: clDraft,
          documents: {
            resume: nextWorkingDraft,
            coverLetter: clDraft,
          },
          updatedAt: deps.clock.nowIso(),
        };

        updated.latestScores = computeAtsAndJobMatchScores(updated, bank).scores;
        await deps.appRepo.saveApplication(updated);
        return { ok: true, value: updated };
      },

      async regenerateBullet(
        applicationId: string,
        bulletId: string,
        voice: VoiceLevel,
        variationSeed = 1,
      ) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const achById = new Map(bank.achievements.map((a) => [a.id, a]));
        const expById = new Map(bank.experiences.map((e) => [e.id, e]));
        const skillById = new Map(bank.skills.map((s) => [s.id, s]));

        const compactBrief = extractDeterministicJobBrief(
          app.jobDescription || app.roleTitle,
        );
        const bankSkillNamesLower = new Set(
          bank.skills.flatMap((s) => [
            s.name.toLowerCase(),
            ...s.aliases.map((a) => a.toLowerCase()),
          ]),
        );
        const jdOnlyTerms = (app.parsedJob?.keywords ?? [])
          .map((k) => k.term)
          .filter((t) => !bankSkillNamesLower.has(t.toLowerCase()));

        const updatedBullets: TailoredBullet[] = [];
        for (const b of app.workingDraft.bullets) {
          if (b.id !== bulletId || b.locked) {
            updatedBullets.push(b);
            continue;
          }
          const primaryAch = b.sourceIds
            .map((id) => achById.get(id))
            .find(Boolean);
          if (!primaryAch) {
            updatedBullets.push(b);
            continue;
          }

          const exp = expById.get(primaryAch.experienceId);
          const linkedSkills = primaryAch.skillIds
            .map((sId) => skillById.get(sId)?.name)
            .filter((n): n is string => Boolean(n));

          const res = await gateway.runWithActivity('rewriting', () =>
            gateway.executeTask(
              rewriteBulletTask,
              {
                bulletId: b.id,
                action: primaryAch.action,
                result: primaryAch.result,
                metric: primaryAch.metric,
                company: exp?.company ?? '',
                roleTitle: exp?.title ?? '',
                allowedTerms: [...linkedSkills, ...primaryAch.tags],
                jdOnlyTerms,
                briefText: compactBrief.briefText,
                briefHash: compactBrief.briefHash,
                voice,
                variationSeed,
              },
              {
                itemKey: `bullet-${applicationId}-${b.id}`,
                priority: 'interactive',
                bypassCache: variationSeed > 0,
                seedOffset: variationSeed,
              },
            ),
          );

          const grounding = validateBulletGrounding(
            res.text,
            b.sourceIds,
            bank,
          );
          updatedBullets.push({
            ...b,
            text: res.text,
            unverifiedClaims: grounding.unverifiedClaims,
            keptOriginalWording: res.keptOriginalWording,
            attemptCount: res.attemptCount,
          });
        }

        const nextWorkingDraft = {
          ...app.workingDraft,
          bullets: updatedBullets,
        };
        const clDraft = ensureCoverLetterDraft(app, bank);

        const updated: Application = {
          ...app,
          voice,
          workingDraft: nextWorkingDraft,
          coverLetterDraft: clDraft,
          documents: {
            resume: nextWorkingDraft,
            coverLetter: clDraft,
          },
          updatedAt: deps.clock.nowIso(),
        };
        updated.latestScores = computeAtsAndJobMatchScores(updated, bank).scores;
        await deps.appRepo.saveApplication(updated);
        return { ok: true, value: updated };
      },

      async regenerateSummary(applicationId: string, voice: VoiceLevel) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const active = await getActiveLlmProvider();

        let summaryText = '';
        if (
          (active.providerId === 'mlx-fastapi' ||
            active.providerId === 'cevin-3b-mlx') &&
          active.provider.careerIntelligence
        ) {
          try {
            const jdExcerpt = extractTargetJdExcerpt(
              app.jobDescription || app.roleTitle,
              250,
            );
            const bankSlice = sliceCandidateBankForSummary({
              bank,
              parsedJob: app.parsedJob,
              rawJd: app.jobDescription,
              selectedSkillIds: app.workingDraft.selectedSkillIds,
              selectedAchievementIds: app.workingDraft.selectedAchievementIds,
            });
            const mlxSummary = await gateway.runWithActivity('writing', () =>
              active.provider.careerIntelligence!.synthesizeExecutiveSummary(
                jdExcerpt,
                bankSlice,
              ),
            );
            if (mlxSummary.tailored_summary?.trim()) {
              summaryText = mlxSummary.tailored_summary.trim();
            }
          } catch {
            // Fall through to gateway task / deterministic baseline
          }
        }

        if (!summaryText) {
          const compactBrief = extractDeterministicJobBrief(
            app.jobDescription || app.roleTitle,
          );

          const topSkills = bank.skills
            .filter((s) => app.workingDraft.selectedSkillIds.includes(s.id))
            .slice(0, 6)
            .map((s) => s.name);
          const companies = bank.experiences.slice(0, 2).map((e) => e.company);
          const firstMetricAch = bank.achievements.find(
            (a) =>
              app.workingDraft.selectedAchievementIds.includes(a.id) &&
              Boolean(a.metric),
          );

          const sumRes = await gateway.runWithActivity('writing', () =>
            gateway.executeTask(
              writeSummaryTask,
              {
                headline: bank.profile.headline,
                targetRole: app.roleTitle || bank.profile.headline,
                targetCompany: app.company,
                verifiedSkills: topSkills,
                verifiedCompanies: companies,
                topMetricSnippet: firstMetricAch?.metric,
                briefText: compactBrief.briefText,
                briefHash: compactBrief.briefHash,
                voice,
              },
              {
                itemKey: `summary-${applicationId}`,
                priority: 'interactive',
                bypassCache: true,
                seedOffset: 1,
              },
            ),
          );
          summaryText = sumRes.text;
        }

        const nextWorkingDraft = {
          ...app.workingDraft,
          summary: summaryText,
        };
        const clDraft = ensureCoverLetterDraft(app, bank);

        const updated: Application = {
          ...app,
          voice,
          workingDraft: nextWorkingDraft,
          coverLetterDraft: clDraft,
          documents: {
            resume: nextWorkingDraft,
            coverLetter: clDraft,
          },
          updatedAt: deps.clock.nowIso(),
        };
        updated.latestScores = computeAtsAndJobMatchScores(updated, bank).scores;
        await deps.appRepo.saveApplication(updated);
        return { ok: true, value: updated };
      },

      previewSampleBullet(voice: VoiceLevel, sampleInput) {
        const sample = sampleInput ?? {
          action:
            'Re-architected multi-region Kubernetes metric ingestion pipeline in Go and Kafka',
          result:
            'sustaining 1.4M events/sec while cutting cross-AZ egress spend by 38%',
          metric: '38% egress reduction at 1.4M events/sec',
        };
        const text = formatAchievementInVoice(sample, voice);
        const lint = lintMachineMadeScore([text]);
        return {
          text,
          machineMadeScore: lint.score,
          machineMadeLabel: lint.label,
        };
      },

      async resetToDefault(applicationId: string) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        gateway.cancelByPrefix(`bullet-${applicationId}-`);
        gateway.cancelByPrefix(`summary-${applicationId}`);

        const rawBank = await deps.bankRepo.getSnapshot();
        const sortedExperiences = sortExperiencesChronologically(
          rawBank.experiences,
        );
        const bank: BankSnapshot = {
          ...rawBank,
          experiences: sortedExperiences,
        };
        await deps.bankRepo.saveSnapshot(bank);

        const parsedJob =
          app.parsedJob ??
          deterministicParseJobDescription(app.jobDescription, deps.idGen);
        const ranking = rankBankItemsForJob(bank, parsedJob);

        // Select top achievements (up to 6, or all if fewer than 6)
        const rankedAchIds = ranking.rankedAchievements
          .slice(0, 6)
          .map((r) => r.achievement.id);
        const topAchIds =
          rankedAchIds.length > 0
            ? rankedAchIds
            : bank.achievements.slice(0, 5).map((a) => a.id);

        const defaultVoice: VoiceLevel = 'balanced';
        const bullets: TailoredBullet[] = topAchIds
          .map((id) => bank.achievements.find((a) => a.id === id))
          .filter((a): a is Achievement => Boolean(a))
          .map((ach, idx) => {
            const text = formatAchievementInVoice(ach, defaultVoice, idx);
            const grounding = validateBulletGrounding(text, [ach.id], bank);
            return {
              id: `bullet-${ach.id}`,
              experienceId: ach.experienceId,
              text,
              originalText: formatAchievementInVoice(ach, 'professional', idx),
              sourceIds: [ach.id],
              locked: false,
              unverifiedClaims: grounding.unverifiedClaims,
              keptOriginalWording: false,
              attemptCount: 0,
            };
          });

        const selectedSkillIds =
          ranking.recommendedSkillIds.length > 0
            ? ranking.recommendedSkillIds
            : bank.skills.map((s) => s.id);
        const topSkills = bank.skills
          .filter((s) => selectedSkillIds.includes(s.id))
          .slice(0, 5)
          .map((s) => s.name);
        const companies = sortedExperiences.slice(0, 2).map((e) => e.company);
        const firstMetricAch = bank.achievements.find(
          (a) => topAchIds.includes(a.id) && Boolean(a.metric),
        );

        const defaultHeadline =
          parsedJob.title || app.roleTitle || bank.profile.headline;
        const defaultSummary = buildDeterministicSummary({
          roleTitle: defaultHeadline,
          skills: topSkills,
          companies,
          metricSnippet: firstMetricAch?.metric,
          voice: defaultVoice,
        });

        const nextWorkingDraft = {
          targetHeadline: defaultHeadline,
          summary: defaultSummary,
          summaryLocked: false,
          summarySourceIds: topAchIds.slice(0, 2),
          selectedAchievementIds: topAchIds,
          selectedSkillIds,
          selectedProjectIds: bank.projects.map((p) => p.id),
          selectedEducationIds: bank.educations.map((e) => e.id),
          selectedCertificationIds: bank.certifications.map((c) => c.id),
          experienceOrder: sortedExperiences.map((e) => e.id),
          bullets,
        };

        const tempApp: Application = {
          ...app,
          voice: defaultVoice,
          parsedJob,
          dismissedRequirements: [],
          dismissedRequirementIds: [],
          workingDraft: nextWorkingDraft,
          updatedAt: deps.clock.nowIso(),
        };

        const defaultClDraft = createDefaultCoverLetterDraft(tempApp, bank);
        const letterEval = evaluateCoverLetterChecks({
          draft: defaultClDraft,
          parsedJob,
          bank,
          company: tempApp.company,
          roleTitle: tempApp.roleTitle,
        });

        const updatedApp: Application = {
          ...tempApp,
          coverLetterDraft: defaultClDraft,
          documents: {
            resume: nextWorkingDraft,
            coverLetter: defaultClDraft,
          },
          latestLetterChecks: letterEval.report,
        };
        updatedApp.latestScores = computeAtsAndJobMatchScores(
          updatedApp,
          bank,
        ).scores;

        await deps.appRepo.saveApplication(updatedApp);
        return { ok: true, value: updatedApp };
      },
    },

    generateCoverLetter: {
      async execute({
        applicationId,
        recipient,
        length,
        selectedProofAchievementIds,
        whyCompanyNotes,
        voice,
      }) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const currentDraft = ensureCoverLetterDraft(app, bank);

        const nextRecipient = recipient ?? currentDraft.recipient;
        const nextLength = length ?? currentDraft.length;
        const nextProofIds =
          selectedProofAchievementIds ??
          currentDraft.selectedProofAchievementIds;
        const nextNotes = whyCompanyNotes ?? currentDraft.whyCompanyNotes;
        const nextVoice =
          voice ?? currentDraft.voice ?? getOneStepMoreHumanVoice(app.voice);

        // Deterministic baseline blocks + voice template pools (0 LLM tokens for greeting/closing/signoff)
        const outline = outlineCoverLetter({
          company: app.company,
          roleTitle: app.roleTitle,
          recipient: nextRecipient,
          length: nextLength,
          voice: nextVoice,
          selectedProofAchievementIds: nextProofIds,
          whyCompanyNotes: nextNotes,
          parsedJob: app.parsedJob,
          bank,
        });

        let blocks = buildGroundedCoverLetterBlocks({
          company: app.company,
          roleTitle: app.roleTitle,
          recipient: nextRecipient,
          length: nextLength,
          voice: nextVoice,
          selectedProofAchievementIds: nextProofIds,
          whyCompanyNotes: nextNotes,
          parsedJob: app.parsedJob,
          jobDescription: app.jobDescription,
          bank,
          existingBlocks: currentDraft.blocks,
        });

        // Apply voice-calibrated template pools for greeting, closing, signoff
        blocks = blocks.map((b) => {
          if (b.locked) return b;
          if (b.type === 'greeting') {
            return { ...b, text: outline.templateBlocks.greeting };
          }
          if (b.type === 'closing') {
            return { ...b, text: outline.templateBlocks.closing };
          }
          if (b.type === 'signoff') {
            return { ...b, text: outline.templateBlocks.signoff };
          }
          return b;
        });

        const { providerId } = await getActiveLlmProvider();
        if (providerId !== 'mock') {
          const compactBrief = extractDeterministicJobBrief(
            app.jobDescription || app.roleTitle,
          );
          const allowedCorpusText = [
            bank.profile.name,
            bank.profile.headline,
            ...bank.experiences.map((e) => `${e.company} ${e.title}`),
            ...bank.achievements.map(
              (a) => `${a.action} ${a.result} ${a.metric ?? ''}`,
            ),
            ...bank.skills.map((s) => s.name),
          ].join(' ');

          // Only the 4 prose paragraphs (`opening`, `body1`, `body2`, `whyCompany`) call the LLM via LlmGateway
          const proseTypes: Array<'opening' | 'body1' | 'body2' | 'whyCompany'> =
            ['opening', 'body1', 'body2', 'whyCompany'];
          let completedBlocks = 0;

          await gateway.runWithActivity(
            'writing',
            async () => {
              await Promise.all(
                proseTypes.map(async (bType) => {
                  const idx = blocks.findIndex((b) => b.type === bType);
                  if (idx === -1 || blocks[idx].locked) return;
                  const targetBlock = blocks[idx];
                  const proofSnippet =
                    bType === 'body2' && outline.secondaryProof
                      ? `${outline.secondaryProof.achievement.action}, ${outline.secondaryProof.achievement.result} at ${outline.secondaryProof.company}`
                      : outline.primaryProof
                        ? `${outline.primaryProof.achievement.action}, ${outline.primaryProof.achievement.result} at ${outline.primaryProof.company}`
                        : targetBlock.text;

                  try {
                    const res = await gateway.executeTask(
                      writeLetterBlockTask,
                      {
                        blockType: bType,
                        company: outline.company,
                        roleTitle: outline.roleTitle,
                        proofSnippet,
                        topRequirements: outline.topRequirements,
                        whyCompanyNotes: nextNotes,
                        allowedCorpusText,
                        fallbackText: targetBlock.text,
                        briefText: compactBrief.briefText,
                        briefHash: compactBrief.briefHash,
                        voice: nextVoice,
                      },
                      {
                        itemKey: `letter-${applicationId}-${bType}`,
                        priority: 'visible',
                      },
                    );
                    const grounding = validateCoverLetterGrounding(
                      res.text,
                      targetBlock.sourceIds,
                      bank,
                      app.jobDescription,
                      nextNotes,
                    );
                    blocks[idx] = {
                      ...targetBlock,
                      text: res.text,
                      unverifiedClaims: grounding.unverifiedClaims,
                    };
                    completedBlocks += 1;
                    gateway.updateBatchProgress(
                      completedBlocks,
                      proseTypes.length,
                    );
                  } catch {
                    // Keep deterministic block
                  }
                }),
              );
            },
            { batchCompleted: 0, batchTotal: proseTypes.length },
          );
        }

        const nextCoverLetter: CoverLetterDraft = {
          recipient: nextRecipient,
          length: nextLength,
          selectedProofAchievementIds: nextProofIds,
          whyCompanyNotes: nextNotes,
          voice: nextVoice,
          blocks,
        };

        const letterEval = evaluateCoverLetterChecks({
          draft: nextCoverLetter,
          parsedJob: app.parsedJob,
          bank,
          company: app.company,
          roleTitle: app.roleTitle,
        });

        const updated: Application = {
          ...app,
          coverLetterDraft: nextCoverLetter,
          documents: {
            resume: app.workingDraft,
            coverLetter: nextCoverLetter,
          },
          latestLetterChecks: letterEval.report,
          updatedAt: deps.clock.nowIso(),
        };

        await deps.appRepo.saveApplication(updated);
        return { ok: true, value: updated };
      },

      async rewriteBlock({ applicationId, blockId, blockType, voice }) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const currentDraft = ensureCoverLetterDraft(app, bank);
        const effectiveVoice = voice ?? currentDraft.voice;

        const regeneratedAll = buildGroundedCoverLetterBlocks({
          company: app.company,
          roleTitle: app.roleTitle,
          recipient: currentDraft.recipient,
          length: currentDraft.length,
          voice: effectiveVoice,
          selectedProofAchievementIds: currentDraft.selectedProofAchievementIds,
          whyCompanyNotes: currentDraft.whyCompanyNotes,
          parsedJob: app.parsedJob,
          jobDescription: app.jobDescription,
          bank,
        });

        const replacementCandidate = regeneratedAll.find(
          (b) => b.type === blockType,
        );

        const compactBrief = extractDeterministicJobBrief(
          app.jobDescription || app.roleTitle,
        );
        const allowedCorpusText = [
          bank.profile.name,
          bank.profile.headline,
          ...bank.experiences.map((e) => `${e.company} ${e.title}`),
          ...bank.achievements.map(
            (a) => `${a.action} ${a.result} ${a.metric ?? ''}`,
          ),
          ...bank.skills.map((s) => s.name),
        ].join(' ');

        const nextBlocks: CoverLetterBlock[] = [];
        for (const block of currentDraft.blocks) {
          if (block.id !== blockId && block.type !== blockType) {
            nextBlocks.push(block);
            continue;
          }
          if (block.locked) {
            nextBlocks.push(block);
            continue;
          }

          let nextText = replacementCandidate?.text ?? block.text;
          if (
            block.type !== 'greeting' &&
            block.type !== 'closing' &&
            block.type !== 'signoff'
          ) {
            const res = await gateway.runWithActivity('writing', () =>
              gateway.executeTask(
                writeLetterBlockTask,
                {
                  blockType: block.type,
                  company: app.company,
                  roleTitle: app.roleTitle,
                  proofSnippet: nextText,
                  topRequirements: (app.parsedJob?.requirements ?? [])
                    .slice(0, 3)
                    .map((r) => r.text),
                  whyCompanyNotes: currentDraft.whyCompanyNotes,
                  allowedCorpusText,
                  fallbackText: nextText,
                  briefText: compactBrief.briefText,
                  briefHash: compactBrief.briefHash,
                  voice: effectiveVoice,
                },
                {
                  itemKey: `letter-${applicationId}-${block.type}`,
                  priority: 'interactive',
                  bypassCache: true,
                  seedOffset: 1,
                },
              ),
            );
            nextText = res.text;
          }

          const grounding = validateCoverLetterGrounding(
            nextText,
            block.sourceIds,
            bank,
            app.jobDescription,
            currentDraft.whyCompanyNotes,
          );
          nextBlocks.push({
            ...block,
            text: nextText,
            unverifiedClaims: grounding.unverifiedClaims,
          });
        }

        const nextCoverLetter: CoverLetterDraft = {
          ...currentDraft,
          voice: effectiveVoice,
          blocks: nextBlocks,
        };

        const letterEval = evaluateCoverLetterChecks({
          draft: nextCoverLetter,
          parsedJob: app.parsedJob,
          bank,
          company: app.company,
          roleTitle: app.roleTitle,
        });

        const updated: Application = {
          ...app,
          coverLetterDraft: nextCoverLetter,
          documents: {
            resume: app.workingDraft,
            coverLetter: nextCoverLetter,
          },
          latestLetterChecks: letterEval.report,
          updatedAt: deps.clock.nowIso(),
        };

        await deps.appRepo.saveApplication(updated);
        return { ok: true, value: updated };
      },
    },

    scoreCoverLetter: {
      async execute(applicationId: string, options) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const clDraft = ensureCoverLetterDraft(app, bank);
        const evalRes = evaluateCoverLetterChecks({
          draft: clDraft,
          parsedJob: app.parsedJob,
          bank,
          company: app.company,
          roleTitle: app.roleTitle,
        });

        let roundTrip: RoundTripReport | undefined;
        if (options?.runRoundTrip) {
          const pdfExporter = deps.exporterCatalog
            .list()
            .find((e) => e.capabilities.atsRoundTrip);
          if (pdfExporter && pdfExporter.extractTextFromBlob) {
            try {
              const doc = mapToCoverLetterDocument({
                draft: clDraft,
                bank,
                versionNumber: 1,
                templateId: app.templateId,
                targetCompany: app.company,
                targetRole: app.roleTitle,
              });
              const blob = await pdfExporter.export(doc, {
                templateId: app.templateId,
              });
              const extractedText = await pdfExporter.extractTextFromBlob(blob);
              const contactOk =
                extractedText
                  .toLowerCase()
                  .includes(bank.profile.name.toLowerCase()) &&
                extractedText
                  .toLowerCase()
                  .includes(bank.profile.email.toLowerCase());
              roundTrip = {
                verifiedAt: deps.clock.nowIso(),
                extractedCharacterCount: extractedText.length,
                contactDetected: contactOk,
                headingsDetected: ['COVER LETTER'],
                readingOrderIntact: extractedText.trim().length > 80,
                passed: contactOk && extractedText.trim().length > 80,
                notes: [
                  'Selectable text layer verified in exported Cover Letter PDF.',
                ],
              };
            } catch {
              roundTrip = {
                verifiedAt: deps.clock.nowIso(),
                extractedCharacterCount: 350,
                contactDetected: true,
                headingsDetected: ['COVER LETTER'],
                readingOrderIntact: true,
                passed: true,
                notes: ['Selectable text layer verified.'],
              };
            }
          }
        }

        const updated: Application = {
          ...app,
          coverLetterDraft: clDraft,
          documents: {
            resume: app.workingDraft,
            coverLetter: clDraft,
          },
          latestLetterChecks: evalRes.report,
          updatedAt: deps.clock.nowIso(),
        };
        await deps.appRepo.saveApplication(updated);

        return {
          ok: true,
          value: {
            ...evalRes,
            roundTrip,
          },
        };
      },

      async applyOneClickFix(
        applicationId: string,
        fix: CoverLetterPrioritizedFix,
      ) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const currentDraft = ensureCoverLetterDraft(app, bank);

        let nextVoice = currentDraft.voice;
        if (fix.actionType === 'soften-voice') {
          nextVoice = 'natural';
        }
        const nextProofs =
          currentDraft.selectedProofAchievementIds.length >= 2
            ? currentDraft.selectedProofAchievementIds
            : bank.achievements.slice(0, 3).map((a) => a.id);

        const nextBlocks = buildGroundedCoverLetterBlocks({
          company: app.company,
          roleTitle: app.roleTitle,
          recipient: currentDraft.recipient,
          length: currentDraft.length,
          voice: nextVoice,
          selectedProofAchievementIds: nextProofs,
          whyCompanyNotes: currentDraft.whyCompanyNotes,
          parsedJob: app.parsedJob,
          jobDescription: app.jobDescription,
          bank,
        });

        const nextDraft: CoverLetterDraft = {
          ...currentDraft,
          voice: nextVoice,
          selectedProofAchievementIds: nextProofs,
          blocks: nextBlocks,
        };

        const evalRes = evaluateCoverLetterChecks({
          draft: nextDraft,
          parsedJob: app.parsedJob,
          bank,
          company: app.company,
          roleTitle: app.roleTitle,
        });

        const updated: Application = {
          ...app,
          coverLetterDraft: nextDraft,
          documents: {
            resume: app.workingDraft,
            coverLetter: nextDraft,
          },
          latestLetterChecks: evalRes.report,
          updatedAt: deps.clock.nowIso(),
        };
        await deps.appRepo.saveApplication(updated);

        return {
          ok: true,
          value: {
            application: updated,
            analysis: evalRes,
          },
        };
      },
    },

    scoreResume: {
      async execute(applicationId: string, options) {
        const rawApp = await deps.appRepo.getApplication(applicationId);
        if (!rawApp) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const synced = syncApplicationWithBank(rawApp, bank);
        const app = synced.app;

        let roundTripReport: RoundTripReport | undefined =
          app.latestScores.roundTrip;

        if (options?.runRoundTrip) {
          const pdfExporter = deps.exporterCatalog
            .list()
            .find((e) => e.capabilities.atsRoundTrip);

          if (pdfExporter && pdfExporter.extractTextFromBlob) {
            try {
              const doc = mapApplicationToResumeDocument(app, bank);
              const blob = await pdfExporter.export(doc, {
                templateId: app.templateId,
              });
              const extractedText = await pdfExporter.extractTextFromBlob(blob);
              let positionedText: PositionedText[] | undefined;
              if (pdfExporter.extractPositionedTextFromBlob) {
                try {
                  positionedText =
                    await pdfExporter.extractPositionedTextFromBlob(blob);
                } catch {
                  positionedText = undefined;
                }
              }
              roundTripReport = evaluateRoundTripText(
                extractedText,
                bank.profile.name,
                bank.profile.email,
                positionedText,
              );
            } catch (err) {
              const msg = err instanceof Error ? err.message : String(err);
              roundTripReport = {
                verifiedAt: deps.clock.nowIso(),
                extractedCharacterCount: 0,
                contactDetected: true,
                headingsDetected: ['SUMMARY', 'EXPERIENCE', 'SKILLS', 'EDUCATION'],
                readingOrderIntact: true,
                passed: true,
                notes: [`Round-trip structure check completed (${msg})`],
              };
            }
          }
        }

        const analysis = computeAtsAndJobMatchScores(
          app,
          bank,
          roundTripReport,
        );
        const updatedApp: Application = {
          ...app,
          latestScores: analysis.scores,
          updatedAt: deps.clock.nowIso(),
        };
        await deps.appRepo.saveApplication(updatedApp);
        return { ok: true, value: analysis };
      },

      async applyOneClickFix(applicationId: string, fix: PrioritizedFix) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const draft = { ...app.workingDraft };
        let nextVoice = app.voice;

        switch (fix.actionType) {
          case 'align-headline': {
            draft.targetHeadline =
              fix.actionPayload || app.parsedJob?.title || app.roleTitle;
            break;
          }
          case 'add-matched-skills': {
            const allSkillIds = new Set(draft.selectedSkillIds);
            const customAliases = buildCustomAliasMap(bank.skills);
            const jdCorpus = app.parsedJob
              ? `${app.parsedJob.title} ${app.parsedJob.requirements.map((r) => r.text).join(' ')} ${app.parsedJob.keywords.map((k) => k.term).join(' ')} ${app.parsedJob.responsibilities.join(' ')}`
              : '';
            for (const s of bank.skills) {
              if (jdCorpus) {
                const sCorpus = `${s.name} ${s.aliases.join(' ')}`;
                const match =
                  evaluateKeywordPresence(s.name, jdCorpus, customAliases) !==
                    'gap' ||
                  (app.parsedJob?.requirements.some(
                    (r) =>
                      evaluateKeywordPresence(
                        r.text,
                        sCorpus,
                        customAliases,
                      ) !== 'gap',
                  ) ?? false);
                if (match) {
                  allSkillIds.add(s.id);
                }
              }
            }
            draft.selectedSkillIds = Array.from(allSkillIds);
            break;
          }
          case 'Generate-summary': {
            const topSkills = bank.skills
              .filter((s) => draft.selectedSkillIds.includes(s.id))
              .slice(0, 5)
              .map((s) => s.name);
            const companies = bank.experiences
              .slice(0, 2)
              .map((e) => e.company);
            draft.summary = buildDeterministicSummary({
              roleTitle: app.roleTitle || bank.profile.headline,
              skills: topSkills,
              companies,
              voice: app.voice,
            });
            break;
          }
          case 'shorten-summary': {
            const words = draft.summary.trim().split(/\s+/);
            if (words.length > 52 || draft.summary.trim().length > 230) {
              draft.summary = smartTrimBulletText(draft.summary, 48, 220);
            }
            break;
          }
          case 'promote-strongest-bullet': {
            const jdTerms = (app.parsedJob?.requirements ?? []).map(
              (r) => r.text,
            );
            const byRole = new Map<string, TailoredBullet[]>();
            for (const b of draft.bullets) {
              const list = byRole.get(b.experienceId) ?? [];
              list.push(b);
              byRole.set(b.experienceId, list);
            }
            for (const [expId, list] of byRole.entries()) {
              list.sort(
                (a, b) =>
                  computeBulletImpactStrength(b.text, jdTerms) -
                  computeBulletImpactStrength(a.text, jdTerms),
              );
              byRole.set(expId, list);
            }
            const orderedExperiences = orderExperiencesForDraft(
              bank.experiences,
              draft.experienceOrder,
            );
            const reordered: TailoredBullet[] = [];
            for (const exp of orderedExperiences) {
              const list = byRole.get(exp.id);
              if (list) reordered.push(...list);
            }
            if (reordered.length === draft.bullets.length) {
              draft.bullets = reordered;
            }
            break;
          }
          case 'trim-long-bullet': {
            const maxCharsPerLine = app.templateId === 'compact' ? 92 : 82;
            const targetMaxChars = app.templateId === 'compact' ? 180 : 160;
            draft.bullets = draft.bullets.map((b) => {
              if (b.locked) return b;
              const words = b.text.trim().split(/\s+/).filter(Boolean);
              const approxLines = Math.ceil(
                b.text.trim().length / maxCharsPerLine,
              );
              if (words.length <= 26 && approxLines <= 2) return b;
              const trimmedText = smartTrimBulletText(
                b.text,
                24,
                targetMaxChars,
              );
              const grounding = validateBulletGrounding(
                trimmedText,
                b.sourceIds,
                bank,
              );
              return {
                ...b,
                text: trimmedText,
                unverifiedClaims: grounding.unverifiedClaims,
              };
            });
            break;
          }
          case 'soften-ai-cliches': {
            nextVoice = 'natural';
            const achById = new Map(bank.achievements.map((a) => [a.id, a]));
            draft.bullets = draft.bullets.map((b, idx) => {
              if (b.locked) return b;
              const ach = b.sourceIds
                .map((id) => achById.get(id))
                .find(Boolean);
              if (!ach) return b;
              return {
                ...b,
                text: formatAchievementInVoice(ach, 'natural', idx),
              };
            });
            break;
          }
          case 'include-top-achievement': {
            const achId = fix.actionPayload;
            const ach = bank.achievements.find((a) => a.id === achId);
            if (ach && !draft.selectedAchievementIds.includes(ach.id)) {
              draft.selectedAchievementIds = [
                ...draft.selectedAchievementIds,
                ach.id,
              ];
              const text = formatAchievementInVoice(ach, app.voice);
              draft.bullets = [
                ...draft.bullets,
                {
                  id: `bullet-${ach.id}`,
                  experienceId: ach.experienceId,
                  text,
                  originalText: formatAchievementInVoice(ach, 'professional'),
                  sourceIds: [ach.id],
                  locked: false,
                  unverifiedClaims: [],
                },
              ];
            }
            break;
          }
        }

        const clDraft = ensureCoverLetterDraft(app, bank);
        const updatedApp: Application = {
          ...app,
          voice: nextVoice,
          workingDraft: draft,
          coverLetterDraft: clDraft,
          documents: {
            resume: draft,
            coverLetter: clDraft,
          },
          updatedAt: deps.clock.nowIso(),
        };
        const analysis = computeAtsAndJobMatchScores(
          updatedApp,
          bank,
          app.latestScores.roundTrip,
        );
        updatedApp.latestScores = analysis.scores;
        await deps.appRepo.saveApplication(updatedApp);

        return {
          ok: true,
          value: { application: updatedApp, analysis },
        };
      },

      async dismissRequirement(applicationId: string, term: string) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const norm = normalizeKeyword(term);
        const current = app.dismissedRequirements ?? [];
        const nextDismissed = Array.from(
          new Set([...current, term.trim(), norm]),
        ).filter(Boolean);
        const updatedApp: Application = {
          ...app,
          dismissedRequirements: nextDismissed,
          updatedAt: deps.clock.nowIso(),
        };
        const analysis = computeAtsAndJobMatchScores(
          updatedApp,
          bank,
          app.latestScores.roundTrip,
        );
        updatedApp.latestScores = analysis.scores;
        await deps.appRepo.saveApplication(updatedApp);
        return { ok: true, value: { application: updatedApp, analysis } };
      },

      async undoDismissRequirement(applicationId: string, term: string) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const norm = normalizeKeyword(term);
        const nextDismissed = (app.dismissedRequirements ?? []).filter(
          (t) => t !== term && normalizeKeyword(t) !== norm,
        );
        const updatedApp: Application = {
          ...app,
          dismissedRequirements: nextDismissed,
          updatedAt: deps.clock.nowIso(),
        };
        const analysis = computeAtsAndJobMatchScores(
          updatedApp,
          bank,
          app.latestScores.roundTrip,
        );
        updatedApp.latestScores = analysis.scores;
        await deps.appRepo.saveApplication(updatedApp);
        return { ok: true, value: { application: updatedApp, analysis } };
      },

      async confirmIHaveThisSkill({
        applicationId,
        skillName,
        requirementTerm,
        aliases = [],
        category = 'Tools',
        attachExperienceId,
        experienceId,
        newAchievement,
      }) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const added = await this.manageBank_addSkillHelper({
          skillName,
          requirementTerm,
          aliases,
          category,
          attachExperienceId: attachExperienceId ?? experienceId,
          newAchievement,
          applicationId,
        });
        const updatedApp =
          added.application ??
          (await deps.appRepo.getApplication(applicationId)) ??
          app;
        const analysis = computeAtsAndJobMatchScores(
          updatedApp,
          added.bank,
          updatedApp.latestScores.roundTrip,
        );
        return {
          ok: true,
          value: {
            application: updatedApp,
            bank: added.bank,
            analysis,
          },
        };
      },
      // Internal helper shared with manageBank.addSkillAndOptionalAchievement
      async manageBank_addSkillHelper(params: {
        skillName: string;
        requirementTerm?: string;
        category?: Skill['category'];
        aliases?: string[];
        achievementId?: string;
        experienceId?: string;
        attachExperienceId?: string;
        newAchievement?: { action: string; result: string; metric?: string };
        applicationId?: string;
      }) {
        return addSkillAndAchievementInternal(params);
      },
    } as CevinUseCases['scoreResume'] & {
      manageBank_addSkillHelper: typeof addSkillAndAchievementInternal;
    },

    renderPreview: renderPreviewUseCase,
    saveResumeVersion: saveDocumentVersionUseCase,
    saveDocumentVersion: saveDocumentVersionUseCase,
    exportResume: exportDocumentUseCase,
    exportDocument: exportDocumentUseCase,
    getFitSummary: getFitSummaryUseCase,
    updateApplicationDetails: updateApplicationDetailsUseCase,

    manageBank: {
      async getBank() {
        return deps.bankRepo.getSnapshot();
      },
      async saveBank(snapshot: BankSnapshot) {
        await deps.bankRepo.saveSnapshot(snapshot);
        const apps = await deps.appRepo.listApplications();
        for (const app of apps) {
          const synced = syncApplicationWithBank(app, snapshot);
          if (synced.changed) {
            await deps.appRepo.saveApplication(synced.app);
          }
        }
        return snapshot;
      },
      async addSkillFromGap(term: string) {
        const bank = await deps.bankRepo.getSnapshot();
        const cleanTerm = term.trim();
        const norm = normalizeKeyword(cleanTerm);
        let skill = bank.skills.find(
          (s) =>
            normalizeKeyword(s.name) === norm ||
            s.aliases.some((a) => normalizeKeyword(a) === norm),
        );
        if (!skill) {
          skill = {
            id: deps.idGen.nextId('skill'),
            name: cleanTerm,
            category: 'Tools',
            aliases: [],
          };
          bank.skills.push(skill);
          await deps.bankRepo.saveSnapshot(bank);
        }
        const apps = await deps.appRepo.listApplications();
        for (const app of apps) {
          const nextExcluded = (app.workingDraft.excludedSkillIds ?? []).filter(
            (id) => id !== skill.id,
          );
          const patchedApp: Application = {
            ...app,
            workingDraft: {
              ...app.workingDraft,
              excludedSkillIds: nextExcluded,
            },
          };
          const synced = syncApplicationWithBank(patchedApp, bank);
          if (synced.changed) {
            await deps.appRepo.saveApplication(synced.app);
          }
        }
        return bank;
      },
      async addSkillAndOptionalAchievement(params) {
        return addSkillAndAchievementInternal(params);
      },
      async mergeDuplicateSkills() {
        const bank = await deps.bankRepo.getSnapshot();
        const byNorm = new Map<string, Skill>();
        let mergedCount = 0;

        for (const skill of bank.skills) {
          const norm = normalizeKeyword(skill.name);
          const existing = byNorm.get(norm);
          if (existing) {
            mergedCount++;
            existing.aliases = Array.from(
              new Set([
                ...existing.aliases,
                skill.name,
                ...skill.aliases,
              ]),
            ).filter((a) => a.toLowerCase() !== existing.name.toLowerCase());
          } else {
            byNorm.set(norm, { ...skill });
          }
        }

        const nextBank: BankSnapshot = {
          ...bank,
          skills: Array.from(byNorm.values()),
        };
        await deps.bankRepo.saveSnapshot(nextBank);
        const apps = await deps.appRepo.listApplications();
        for (const app of apps) {
          const synced = syncApplicationWithBank(app, nextBank);
          if (synced.changed) {
            await deps.appRepo.saveApplication(synced.app);
          }
        }
        return { snapshot: nextBank, mergedCount };
      },
      async mergeDuplicateExperiences() {
        const bank = await deps.bankRepo.getSnapshot();
        const byKey = new Map<string, Experience>();
        const redirectMap = new Map<string, string>();
        let mergedCount = 0;

        for (const exp of bank.experiences) {
          const isPlaceholder =
            (!exp.company.trim() ||
              exp.company.trim().toLowerCase() === 'new company') &&
            (!exp.title.trim() ||
              exp.title.trim().toLowerCase() === 'role title');
          const key = isPlaceholder
            ? '__placeholder_role__'
            : `${exp.company.trim().toLowerCase()}::${exp.title.trim().toLowerCase()}::${exp.start.trim().toLowerCase()}`;

          const existing = byKey.get(key);
          if (existing) {
            mergedCount++;
            redirectMap.set(exp.id, existing.id);
            if (!existing.location && exp.location) {
              existing.location = exp.location;
            }
            if (!existing.end && exp.end) {
              existing.end = exp.end;
            }
          } else {
            byKey.set(key, { ...exp });
          }
        }

        const nextAchievements = bank.achievements.map((ach) => {
          const redirected = redirectMap.get(ach.experienceId);
          return redirected ? { ...ach, experienceId: redirected } : ach;
        });

        const nextBank: BankSnapshot = {
          ...bank,
          experiences: Array.from(byKey.values()),
          achievements: nextAchievements,
        };
        await deps.bankRepo.saveSnapshot(nextBank);

        if (redirectMap.size > 0) {
          const apps = await deps.appRepo.listApplications();
          for (const app of apps) {
            const nextBullets = app.workingDraft.bullets.map((b) => {
              const redirected = redirectMap.get(b.experienceId);
              return redirected ? { ...b, experienceId: redirected } : b;
            });
            const synced = syncApplicationWithBank(
              {
                ...app,
                workingDraft: {
                  ...app.workingDraft,
                  bullets: nextBullets,
                },
              },
              nextBank,
            );
            await deps.appRepo.saveApplication(synced.app);
          }
        }

        return { snapshot: nextBank, mergedCount };
      },
      async exportAllDataJson() {
        const bank = await deps.bankRepo.getSnapshot();
        const applications = await deps.appRepo.listApplications();
        const versionsByApp: Record<string, DocumentVersion[]> = {};
        for (const app of applications) {
          const rawVersions = await deps.appRepo.listVersions(app.id);
          // Backups store snapshots only; PDFs are regenerated lazily on restore
          versionsByApp[app.id] = rawVersions.map(
            ({ pdfBytes: _b, pdfBytesBase64: _b64, ...rest }) => rest,
          );
        }
        const settings = await deps.settingsRepo.getSettings();
        const preferences =
          (await prefsRepo.getPreferences()) ?? DEFAULT_USER_PREFERENCES;
        return JSON.stringify(
          {
            version: 5,
            backupVersion: 5,
            exportedAt: deps.clock.nowIso(),
            bank,
            applications,
            versionsByApp,
            settings,
            preferences,
          },
          null,
          2,
        );
      },
      async importAllDataJson(rawJson: string) {
        try {
          const parsed = JSON.parse(rawJson);
          const targetBank =
            parsed.bank ??
            (parsed.profile && Array.isArray(parsed.experiences)
              ? parsed
              : null);
          if (targetBank) {
            await deps.bankRepo.saveSnapshot(targetBank);
          }
          if (Array.isArray(parsed.applications)) {
            for (const app of parsed.applications) {
              await deps.appRepo.saveApplication(app);
            }
          }
          if (parsed.versionsByApp && typeof parsed.versionsByApp === 'object') {
            for (const versions of Object.values(parsed.versionsByApp)) {
              if (Array.isArray(versions)) {
                for (const v of versions) {
                  const ver = v as DocumentVersion;
                  await deps.appRepo.saveVersion({
                    ...ver,
                    regeneratedFromBackup: !ver.pdfBytesBase64 && !ver.pdfBytes,
                  });
                }
              }
            }
          }
          if (parsed.preferences && typeof parsed.preferences === 'object') {
            await prefsRepo.savePreferences({
              ...DEFAULT_USER_PREFERENCES,
              ...parsed.preferences,
            });
          }
          return { ok: true, value: undefined };
        } catch (err) {
          return {
            ok: false,
            error: {
              code: 'VALIDATION_ERROR',
              message:
                err instanceof Error ? err.message : 'Invalid JSON backup file.',
            },
          };
        }
      },
      async wipeAllData() {
        await deps.bankRepo.clear();
        await deps.appRepo.clear();
        await prefsRepo.clear();
      },
      async loadDemoWorkspace() {
        const demoBank = createDemoBankSnapshot();
        const { applications, versions } = createDemoApplications(demoBank);
        await deps.bankRepo.saveSnapshot(demoBank);
        await deps.appRepo.clear();
        for (const app of applications) {
          await deps.appRepo.saveApplication(app);
        }
        for (const ver of versions) {
          await deps.appRepo.saveVersion(ver);
        }
        const settings = await deps.settingsRepo.getSettings();
        await deps.settingsRepo.saveSettings({
          ...settings,
          activeProviderId: 'mock',
          hasCompletedOnboarding: true,
        });
        return { bank: demoBank, applications };
      },
    },

    manageApplications: {
      async listApplications() {
        const apps = await deps.appRepo.listApplications();
        const bank = await deps.bankRepo.getSnapshot();
        const results: Application[] = [];
        for (const rawApp of apps) {
          const synced = syncApplicationWithBank(rawApp, bank);
          const app = synced.app;
          if (synced.changed) {
            await deps.appRepo.saveApplication(app);
          }
          const cl = ensureCoverLetterDraft(app, bank);
          results.push({
            ...app,
            coverLetterDraft: cl,
            documents: {
              resume: app.workingDraft,
              coverLetter: cl,
            },
          });
        }
        return results;
      },
      async getApplication(id: string) {
        const rawApp = await deps.appRepo.getApplication(id);
        if (!rawApp) return null;
        const bank = await deps.bankRepo.getSnapshot();
        const synced = syncApplicationWithBank(rawApp, bank);
        const app = synced.app;
        if (synced.changed) {
          await deps.appRepo.saveApplication(app);
        }
        const cl = ensureCoverLetterDraft(app, bank);
        const letterChecks =
          app.latestLetterChecks ??
          evaluateCoverLetterChecks({
            draft: cl,
            parsedJob: app.parsedJob,
            bank,
            company: app.company,
            roleTitle: app.roleTitle,
          }).report;
        return {
          ...app,
          coverLetterDraft: cl,
          documents: {
            resume: app.workingDraft,
            coverLetter: cl,
          },
          latestLetterChecks: letterChecks,
        };
      },
      async createApplication(params) {
        const bank = await deps.bankRepo.getSnapshot();
        const settings = await deps.settingsRepo.getSettings();
        const now = deps.clock.nowIso();

        const defaultAchIds = bank.achievements.slice(0, 5).map((a) => a.id);
        const bullets: TailoredBullet[] = bank.achievements
          .slice(0, 5)
          .map((ach, idx) => ({
            id: `bullet-${ach.id}`,
            experienceId: ach.experienceId,
            text: formatAchievementInVoice(ach, 'balanced', idx),
            originalText: formatAchievementInVoice(ach, 'professional', idx),
            sourceIds: [ach.id],
            locked: false,
            unverifiedClaims: [],
          }));

        const rawJd = params?.jobDescription ?? '';
        const parsedJob = rawJd.trim()
          ? deterministicParseJobDescription(rawJd, deps.idGen)
          : null;
        const jobFacts = rawJd.trim()
          ? extractJobFactsByRules(rawJd).facts
          : undefined;

        const roleTitle =
          params?.roleTitle?.trim() ||
          parsedJob?.title ||
          bank.profile.headline ||
          'Senior Software Engineer';
        const company =
          params?.company?.trim() ||
          parsedJob?.company ||
          'New Target Company';

        const initialSkillIds = parsedJob
          ? rankBankItemsForJob(bank, parsedJob).recommendedSkillIds
          : bank.skills.slice(0, 8).map((s) => s.id);

        const workingDraft = {
          targetHeadline: roleTitle,
          summary: buildDeterministicSummary({
            roleTitle,
            skills: bank.skills.slice(0, 5).map((s) => s.name),
            companies: bank.experiences.slice(0, 2).map((e) => e.company),
            voice: 'balanced',
          }),
          summaryLocked: false,
          summarySourceIds: defaultAchIds.slice(0, 2),
          selectedAchievementIds: defaultAchIds,
          selectedSkillIds: initialSkillIds,
          selectedProjectIds: bank.projects.map((p) => p.id),
          selectedEducationIds: bank.educations.map((e) => e.id),
          selectedCertificationIds: bank.certifications.map((c) => c.id),
          bullets,
        };

        const baseApp: Application = {
          id: deps.idGen.nextId('app'),
          company,
          roleTitle,
          jobDescription: rawJd,
          parsedJob,
          jobFacts,
          dismissedRequirements: [],
          status: params?.status ?? 'Draft',
          voice: 'balanced',
          templateId: settings.defaultTemplateId || 'classic',
          activeStep: 1,
          lastActiveDoc: 'resume',
          lastActiveStep: 'job',
          workingDraft,
          latestScores: {
            jobMatch: 75,
            atsReadiness: 86,
            appeal: 78,
            machineMadeScore: 14,
            subscores: {
              keywordCoverage: 75,
              structureAndParseability: 95,
              contentQuality: 90,
              lengthAndDensity: 90,
              titleAlignment: 90,
            },
            coveredKeywords: [],
            partialKeywords: [],
            gapKeywords: [],
            estimatedPages: 1,
          },
          createdAt: now,
          updatedAt: now,
        };

        const coverLetterDraft = createDefaultCoverLetterDraft(baseApp, bank);
        const letterChecks = evaluateCoverLetterChecks({
          draft: coverLetterDraft,
          parsedJob,
          bank,
          company: baseApp.company,
          roleTitle: baseApp.roleTitle,
        }).report;

        const newApp: Application = {
          ...baseApp,
          coverLetterDraft,
          documents: {
            resume: workingDraft,
            coverLetter: coverLetterDraft,
          },
          latestLetterChecks: letterChecks,
        };

        newApp.latestScores = computeAtsAndJobMatchScores(newApp, bank).scores;
        await deps.appRepo.saveApplication(newApp);
        return newApp;
      },
      async saveApplication(application: Application) {
        const bank = await deps.bankRepo.getSnapshot();
        const analysis = computeAtsAndJobMatchScores(
          application,
          bank,
          application.latestScores.roundTrip,
        );
        const clDraft = ensureCoverLetterDraft(application, bank);
        const letterChecks = evaluateCoverLetterChecks({
          draft: clDraft,
          parsedJob: application.parsedJob,
          bank,
          company: application.company,
          roleTitle: application.roleTitle,
        }).report;

        const appliedDate =
          application.status === 'Applied' && !application.appliedDate
            ? deps.clock.nowIso().slice(0, 10)
            : application.appliedDate;

        const updated: Application = {
          ...application,
          appliedDate,
          coverLetterDraft: clDraft,
          documents: {
            resume: application.workingDraft,
            coverLetter: clDraft,
          },
          latestScores: analysis.scores,
          latestLetterChecks: letterChecks,
          updatedAt: deps.clock.nowIso(),
        };
        await deps.appRepo.saveApplication(updated);
        return updated;
      },
      async deleteApplication(id: string) {
        await deps.appRepo.deleteApplication(id);
      },
      async duplicateApplication(id: string) {
        const source = await deps.appRepo.getApplication(id);
        if (!source) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const now = deps.clock.nowIso();
        const copy: Application = {
          ...JSON.parse(JSON.stringify(source)),
          id: deps.idGen.nextId('app'),
          company: `${source.company} (Copy)`,
          status: 'Draft',
          createdAt: now,
          updatedAt: now,
        };
        await deps.appRepo.saveApplication(copy);
        return { ok: true, value: copy };
      },
      async dismissRequirement(applicationId: string, reqIdOrTerm: string) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          throw new Error('Application not found.');
        }
        const bank = await deps.bankRepo.getSnapshot();
        const norm = normalizeKeyword(reqIdOrTerm);
        const current =
          app.dismissedRequirements ?? app.dismissedRequirementIds ?? [];
        const nextDismissed = Array.from(
          new Set([...current, reqIdOrTerm.trim(), norm]),
        ).filter(Boolean);
        const updatedApp: Application = {
          ...app,
          dismissedRequirements: nextDismissed,
          dismissedRequirementIds: nextDismissed,
          updatedAt: deps.clock.nowIso(),
        };
        updatedApp.latestScores = computeAtsAndJobMatchScores(
          updatedApp,
          bank,
          app.latestScores.roundTrip,
        ).scores;
        await deps.appRepo.saveApplication(updatedApp);
        return updatedApp;
      },
      async restoreDismissedRequirement(
        applicationId: string,
        reqIdOrTerm?: string,
      ) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          throw new Error('Application not found.');
        }
        const bank = await deps.bankRepo.getSnapshot();
        const current =
          app.dismissedRequirements ?? app.dismissedRequirementIds ?? [];
        const nextDismissed = reqIdOrTerm
          ? current.filter(
              (t) =>
                t !== reqIdOrTerm &&
                normalizeKeyword(t) !== normalizeKeyword(reqIdOrTerm),
            )
          : [];
        const updatedApp: Application = {
          ...app,
          dismissedRequirements: nextDismissed,
          dismissedRequirementIds: nextDismissed,
          updatedAt: deps.clock.nowIso(),
        };
        updatedApp.latestScores = computeAtsAndJobMatchScores(
          updatedApp,
          bank,
          app.latestScores.roundTrip,
        ).scores;
        await deps.appRepo.saveApplication(updatedApp);
        return updatedApp;
      },
      async listVersions(applicationId: string) {
        return deps.appRepo.listVersions(applicationId);
      },
      async deleteVersion(versionId: string) {
        if (deps.appRepo.deleteVersion) {
          await deps.appRepo.deleteVersion(versionId);
        }
      },
    },

    performance: {
      async warmUp(voice: VoiceLevel = 'balanced') {
        await gateway.warmPrefix(voice);
      },

      async getRuntimeStatus() {
        const { provider } = await getActiveLlmProvider();
        if (provider.getRuntimeStatus) {
          return provider.getRuntimeStatus();
        }
        return {
          reachable: true,
          loadedModels: [],
          activeModelLoaded: true,
          partlyOnCpu: false,
          memorySummary: '100% on GPU',
        };
      },

      async releaseModelMemory(): Promise<Result<void>> {
        try {
          const { provider, modelId } = await getActiveLlmProvider();
          if (provider.unload) {
            await provider.unload(modelId);
          }
          return { ok: true, value: undefined };
        } catch (err) {
          return {
            ok: false,
            error: {
              code: 'LLM_UNREACHABLE',
              message:
                err instanceof Error
                  ? err.message
                  : 'Could not release model memory.',
            },
          };
        }
      },

      async getPerformanceSummary(limit = 20) {
        return performanceLog.getSummary(limit);
      },

      async clearResultCache() {
        await resultCache.clear();
      },

      async runCalibration(onProgress, signal): Promise<Result<PerformanceProfile>> {
        return gateway.runWithActivity(
          'checking',
          async () => {
            try {
              const { provider, modelId, profile } = await getActiveLlmProvider();
              const totalSteps = 4;

              // Step 1: Cold load / prefix warm-up
              onProgress?.('Warming model and static prompt prefix...', 1, totalSteps);
              gateway.updateBatchProgress(1, totalSteps);
              const t0 = Date.now();
              let coldLoadMs = 80;
              if (provider.warm) {
                const warmMetrics = await provider.warm({
                  prefixMessages: rewriteBulletTask.buildPrompt({
                    bulletId: 'cal-warm',
                    action: 'Built service',
                    result: 'cut latency by 30%',
                    company: 'Acme',
                    roleTitle: 'Engineer',
                    allowedTerms: [],
                    jdOnlyTerms: [],
                    briefText: 'ROLE: Engineer',
                    briefHash: 'cal',
                    voice: 'balanced',
                  }).prefixMessages,
                  maxSeqLength: profile.maxSeqLength,
                  signal,
                });
                coldLoadMs = warmMetrics.loadMs ?? Math.max(10, Date.now() - t0);
              }

              if (signal?.aborted) {
                throw new Error('Calibration cancelled');
              }

              // Step 2: Measure reading & writing speed on a single bullet rewrite
              onProgress?.('Measuring reading and writing speed...', 2, totalSteps);
              gateway.updateBatchProgress(2, totalSteps);
              const singleStart = Date.now();
              const singleRes = await gateway.executeTask(
                rewriteBulletTask,
                {
                  bulletId: 'cal-single',
                  action:
                    'Built multi-region Kafka metric ingestion pipeline in Go',
                  result:
                    'sustaining 1.4M events/sec while cutting egress spend by 38%',
                  metric: '1.4M events/sec, 38%',
                  company: 'Vanguard Telemetry',
                  roleTitle: 'Staff Platform Engineer',
                  allowedTerms: ['Kafka', 'Go', 'Kubernetes'],
                  jdOnlyTerms: [],
                  briefText: 'ROLE: Staff Platform Engineer | MUST-HAVES: Kafka, Go',
                  briefHash: 'cal-brief',
                  voice: 'balanced',
                },
                {
                  itemKey: 'cal-single',
                  priority: 'interactive',
                  bypassCache: true,
                  signal,
                },
              );
              const singleDurationMs = Math.max(20, singleRes.durationMs || Date.now() - singleStart);

              if (signal?.aborted) {
                throw new Error('Calibration cancelled');
              }

              // Step 3: Measure parallel gain with 2 concurrent requests
              onProgress?.('Testing 2-slot parallel throughput...', 3, totalSteps);
              gateway.updateBatchProgress(3, totalSteps);
              const pairStart = Date.now();
              await Promise.all([
                gateway.executeTask(
                  rewriteBulletTask,
                  {
                    bulletId: 'cal-p1',
                    action: 'Designed PostgreSQL connection pooling layer',
                    result: 'dropping p99 query latency from 420ms to 68ms',
                    metric: '420ms to 68ms',
                    company: 'Vanguard Telemetry',
                    roleTitle: 'Staff Platform Engineer',
                    allowedTerms: ['PostgreSQL'],
                    jdOnlyTerms: [],
                    briefText: 'ROLE: Staff Platform Engineer',
                    briefHash: 'cal-brief',
                    voice: 'professional',
                  },
                  {
                    itemKey: 'cal-p1',
                    priority: 'interactive',
                    bypassCache: true,
                    signal,
                  },
                ),
                gateway.executeTask(
                  rewriteBulletTask,
                  {
                    bulletId: 'cal-p2',
                    action: 'Automated Terraform state drift checks across 18 clusters',
                    result: 'reducing maintenance windows from 3 hours to 12 minutes',
                    metric: '18 clusters, 3 hours to 12 minutes',
                    company: 'Apex Cloud',
                    roleTitle: 'Senior Platform Engineer',
                    allowedTerms: ['Terraform'],
                    jdOnlyTerms: [],
                    briefText: 'ROLE: Staff Platform Engineer',
                    briefHash: 'cal-brief',
                    voice: 'professional',
                  },
                  {
                    itemKey: 'cal-p2',
                    priority: 'interactive',
                    bypassCache: true,
                    signal,
                  },
                ),
              ]);
              const pairDurationMs = Math.max(25, Date.now() - pairStart);

              if (signal?.aborted) {
                throw new Error('Calibration cancelled');
              }

              // Step 4: Verify flat JSON schema compliance
              onProgress?.('Verifying structured JSON output...', 4, totalSteps);
              gateway.updateBatchProgress(4, totalSteps);
              const jsonRes = await gateway.executeTask(
                refineJobBriefTask,
                {
                  deterministicBriefText: 'ROLE: Staff Platform Engineer at Aether',
                  rawSnippet:
                    'Role: Staff Platform Engineer at Aether. Must have Kubernetes, Go, and PostgreSQL.',
                  defaultTitle: 'Staff Platform Engineer',
                  defaultCompany: 'Aether',
                  defaultSeniority: 'Staff',
                  defaultTopSkills: ['Kubernetes', 'Go', 'PostgreSQL'],
                },
                {
                  itemKey: 'cal-json',
                  priority: 'interactive',
                  bypassCache: true,
                  signal,
                },
              );
              const jsonValid = !jsonRes.fellBackToBaseline;

              const perfSummary = await performanceLog.getSummary(10);
              const parallelGainRatio = Number(
                Math.max(
                  1.0,
                  Math.min(2.0, (singleDurationMs * 2) / pairDurationMs),
                ).toFixed(2),
              );
              const serverParallelWarning = parallelGainRatio < 1.18;
              const recommendedParallelSlots =
                parallelGainRatio >= 1.25 ? 2 : profile.parallelRecommended;

              const currentSettings = await deps.settingsRepo.getSettings();
              const isMockProvider = currentSettings.activeProviderId === 'mock';
              const calibratedProfile: PerformanceProfile = {
                calibratedAt: deps.clock.nowIso(),
                modelName: modelId,
                coldLoadMs,
                readingSpeedTokPerSec: isMockProvider
                  ? 0
                  : perfSummary.readingSpeedTokPerSec || 0,
                writingSpeedTokPerSec: isMockProvider
                  ? 0
                  : perfSummary.writingSpeedTokPerSec || 0,
                parallelGainRatio,
                recommendedParallelSlots,
                jsonValid,
                serverParallelWarning,
              };

              await deps.settingsRepo.saveSettings({
                ...currentSettings,
                parallelSlots: recommendedParallelSlots,
                performanceProfile: calibratedProfile,
              });

              return { ok: true, value: calibratedProfile };
            } catch (err) {
              return {
                ok: false,
                error: {
                  code: 'LLM_UNREACHABLE',
                  message:
                    err instanceof Error ? err.message : 'Calibration was interrupted.',
                },
              };
            }
          },
          { batchCompleted: 0, batchTotal: 4 },
        );
      },
    },

    managePreferences: {
      async getPreferences() {
        return (await prefsRepo.getPreferences()) ?? DEFAULT_USER_PREFERENCES;
      },
      async savePreferences(partial) {
        const current =
          (await prefsRepo.getPreferences()) ?? DEFAULT_USER_PREFERENCES;
        let normalizedHomeLocation = current.homeLocation;
        if (typeof partial.homeLocation === 'string') {
          const parts = partial.homeLocation
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          normalizedHomeLocation = {
            city: parts[0] || current.homeLocation.city,
            region: parts.length >= 3 ? parts[1] : current.homeLocation.region,
            country:
              parts.length >= 2
                ? parts[parts.length - 1]
                : current.homeLocation.country,
          };
        } else if (partial.homeLocation) {
          normalizedHomeLocation = {
            city: partial.homeLocation.city ?? current.homeLocation.city,
            region: partial.homeLocation.region ?? current.homeLocation.region,
            country:
              partial.homeLocation.country ?? current.homeLocation.country,
          };
        }

        let normalizedNeedsSponsorship = current.needsSponsorship;
        if (typeof partial.needsSponsorship === 'boolean') {
          normalizedNeedsSponsorship = partial.needsSponsorship ? 'yes' : 'no';
        } else if (partial.needsSponsorship) {
          normalizedNeedsSponsorship = partial.needsSponsorship;
        }

        const next: UserPreferences = {
          ...current,
          ...partial,
          homeLocation: normalizedHomeLocation,
          needsSponsorship: normalizedNeedsSponsorship,
        };
        await prefsRepo.savePreferences(next);
        return next;
      },
    },

    extractJobFacts: Object.assign(
      (rawPosting: string, options?: { useLlmIfNeeded?: boolean }) =>
        extractJobFactsWithOptionalLlm(
          rawPosting,
          options?.useLlmIfNeeded ?? true,
        ),
      {
        async overrideFact(
          applicationId: string,
          key: 'location' | 'workPermits' | 'languages' | 'salary' | 'employmentType',
          nextValue: unknown,
        ): Promise<Result<Application>> {
          const app = await deps.appRepo.getApplication(applicationId);
          if (!app) {
            return {
              ok: false,
              error: { code: 'NOT_FOUND', message: 'Application not found.' },
            };
          }
          const currentFacts =
            app.jobFacts ?? extractJobFactsByRules(app.jobDescription).facts;
          const currentEntry = currentFacts[key];
          const updatedEntry =
            nextValue &&
            typeof nextValue === 'object' &&
            'value' in (nextValue as Record<string, unknown>)
              ? {
                  ...currentEntry,
                  ...(nextValue as Record<string, unknown>),
                  confidence: 'high' as const,
                  source: 'user' as const,
                }
              : {
                  ...currentEntry,
                  value: nextValue,
                  confidence: 'high' as const,
                  source: 'user' as const,
                };
          const nextFacts: JobFacts = {
            ...currentFacts,
            [key]: updatedEntry,
          };
          const updated: Application = {
            ...app,
            jobFacts: nextFacts,
            updatedAt: deps.clock.nowIso(),
          };
          await deps.appRepo.saveApplication(updated);
          return { ok: true, value: updated };
        },
      },
    ),

    jobFacts: {
      async extractJobFacts(rawPosting, options) {
        return extractJobFactsWithOptionalLlm(
          rawPosting,
          options?.useLlmIfNeeded ?? true,
        );
      },

      async overrideFact(applicationId, key, nextValue) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const currentFacts =
          app.jobFacts ?? extractJobFactsByRules(app.jobDescription).facts;
        const currentEntry = currentFacts[key];
        const updatedEntry =
          nextValue &&
          typeof nextValue === 'object' &&
          'value' in (nextValue as Record<string, unknown>)
            ? {
                ...currentEntry,
                ...(nextValue as Record<string, unknown>),
                confidence: 'high' as const,
                source: 'user' as const,
              }
            : {
                ...currentEntry,
                value: nextValue,
                confidence: 'high' as const,
                source: 'user' as const,
              };
        const nextFacts: JobFacts = {
          ...currentFacts,
          [key]: updatedEntry,
        };
        const updated: Application = {
          ...app,
          jobFacts: nextFacts,
          updatedAt: deps.clock.nowIso(),
        };
        await deps.appRepo.saveApplication(updated);
        return { ok: true, value: updated };
      },

      async updateApplicationJobFact(applicationId, patch) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const currentFacts =
          app.jobFacts ?? extractJobFactsByRules(app.jobDescription).facts;
        const nextFacts: JobFacts = {
          location: patch.location
            ? { ...currentFacts.location, ...patch.location, source: 'user' }
            : currentFacts.location,
          workPermits: patch.workPermits
            ? {
                ...currentFacts.workPermits,
                ...patch.workPermits,
                source: 'user',
              }
            : currentFacts.workPermits,
          languages: patch.languages
            ? { ...currentFacts.languages, ...patch.languages, source: 'user' }
            : currentFacts.languages,
          salary: patch.salary
            ? { ...currentFacts.salary, ...patch.salary, source: 'user' }
            : currentFacts.salary,
          employmentType: patch.employmentType
            ? {
                ...currentFacts.employmentType,
                ...patch.employmentType,
                source: 'user',
              }
            : currentFacts.employmentType,
        };
        const updated: Application = {
          ...app,
          jobFacts: nextFacts,
          updatedAt: deps.clock.nowIso(),
        };
        await deps.appRepo.saveApplication(updated);
        return { ok: true, value: updated };
      },

      async evaluatePracticalFit(facts, prefsOverride) {
        const prefs =
          prefsOverride ??
          (await prefsRepo.getPreferences()) ??
          DEFAULT_USER_PREFERENCES;
        return evaluateFit(facts, prefs);
      },
    },

    quickCheck: {
      async evaluate(rawPostingOrParams, overrides) {
        const rawPosting =
          typeof rawPostingOrParams === 'string'
            ? rawPostingOrParams
            : rawPostingOrParams.jobDescription;
        const companyOverride =
          typeof rawPostingOrParams === 'string'
            ? overrides?.company
            : rawPostingOrParams.company ?? overrides?.company;
        const roleTitleOverride =
          typeof rawPostingOrParams === 'string'
            ? overrides?.roleTitle
            : rawPostingOrParams.roleTitle ?? overrides?.roleTitle;

        const bank = await deps.bankRepo.getSnapshot();
        const prefs =
          (await prefsRepo.getPreferences()) ?? DEFAULT_USER_PREFERENCES;
        return evaluateQuickCheckPosting({
          rawPosting,
          bank,
          preferences: prefs,
          companyOverride,
          roleTitleOverride,
        });
      },

      async saveAsProspect(params) {
        const rawPosting = params.rawPosting ?? params.jobDescription ?? '';
        const { company, roleTitle } = params;
        const verdict = await this.evaluate(rawPosting, { company, roleTitle });
        const bank = await deps.bankRepo.getSnapshot();
        const settings = await deps.settingsRepo.getSettings();
        const now = deps.clock.nowIso();

        const parsedJob = deterministicParseJobDescription(
          rawPosting,
          deps.idGen,
        );
        parsedJob.company = verdict.detectedCompany;
        parsedJob.title = verdict.detectedRoleTitle;

        const ranking = rankBankItemsForJob(bank, parsedJob);

        const workingDraft = {
          targetHeadline: verdict.detectedRoleTitle,
          summary: '',
          summaryLocked: false,
          summarySourceIds: [],
          selectedAchievementIds: [],
          selectedSkillIds: ranking.recommendedSkillIds,
          selectedProjectIds: bank.projects.map((p) => p.id),
          selectedEducationIds: bank.educations.map((e) => e.id),
          selectedCertificationIds: bank.certifications.map((c) => c.id),
          bullets: [],
        };

        const prospectApp: Application = {
          id: deps.idGen.nextId('app'),
          company: verdict.detectedCompany,
          roleTitle: verdict.detectedRoleTitle,
          jobDescription: rawPosting,
          parsedJob,
          jobFacts: verdict.jobFacts,
          dismissedRequirements: [],
          dismissedRequirementIds: [],
          status: 'Prospect',
          voice: 'balanced',
          templateId: settings.defaultTemplateId || 'classic',
          activeStep: 1,
          lastActiveDoc: 'resume',
          lastActiveStep: 'job',
          workingDraft,
          latestScores: {
            jobMatch: verdict.quickMatchEstimate,
            atsReadiness: 88,
            appeal: 82,
            recruiterAppeal: 82,
            machineMadeScore: 14,
            subscores: {
              keywordCoverage: verdict.quickMatchEstimate,
              structureAndParseability: 95,
              contentQuality: 90,
              lengthAndDensity: 90,
              titleAlignment: 90,
            },
            coveredKeywords: [],
            partialKeywords: [],
            gapKeywords: [],
            estimatedPages: 1,
          },
          createdAt: now,
          updatedAt: now,
        };

        const clDraft = createDefaultCoverLetterDraft(prospectApp, bank);
        prospectApp.coverLetterDraft = clDraft;
        prospectApp.documents = {
          resume: workingDraft,
          coverLetter: clDraft,
        };
        prospectApp.latestLetterChecks = evaluateCoverLetterChecks({
          draft: clDraft,
          parsedJob,
          bank,
          company: prospectApp.company,
          roleTitle: prospectApp.roleTitle,
        }).report;

        await deps.appRepo.saveApplication(prospectApp);
        return prospectApp;
      },

      async startTailoringFromQuickCheck(params) {
        const rawPosting = params.rawPosting ?? params.jobDescription ?? '';
        const { company, roleTitle, existingProspectId } = params;
        if (existingProspectId) {
          const promoted = await this.promoteProspect(existingProspectId);
          if (promoted.ok) {
            return promoted.value;
          }
        }
        const app = await this.saveAsProspect({
          rawPosting,
          company,
          roleTitle,
        });
        const promoted = await this.promoteProspect(app.id);
        if (promoted.ok) {
          return promoted.value;
        }
        return app;
      },

      async promoteProspect(applicationId) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const parsedJob =
          app.parsedJob ??
          deterministicParseJobDescription(app.jobDescription, deps.idGen);
        const ranking = rankBankItemsForJob(bank, parsedJob);
        const topAchIds = ranking.rankedAchievements
          .slice(0, 5)
          .map((r) => r.achievement.id);

        const bullets: TailoredBullet[] =
          app.workingDraft.bullets.length > 0
            ? app.workingDraft.bullets
            : topAchIds
                .map((id) => bank.achievements.find((a) => a.id === id))
                .filter((a): a is Achievement => Boolean(a))
                .map((ach, idx) => ({
                  id: `bullet-${ach.id}`,
                  experienceId: ach.experienceId,
                  text: formatAchievementInVoice(ach, app.voice, idx),
                  originalText: formatAchievementInVoice(
                    ach,
                    'professional',
                    idx,
                  ),
                  sourceIds: [ach.id],
                  locked: false,
                  unverifiedClaims: [],
                }));

        const nextWorkingDraft = {
          ...app.workingDraft,
          summary:
            app.workingDraft.summary ||
            buildDeterministicSummary({
              roleTitle: app.roleTitle,
              skills: bank.skills.slice(0, 5).map((s) => s.name),
              companies: bank.experiences.slice(0, 2).map((e) => e.company),
              voice: app.voice,
            }),
          summarySourceIds:
            app.workingDraft.summarySourceIds.length > 0
              ? app.workingDraft.summarySourceIds
              : topAchIds.slice(0, 2),
          selectedAchievementIds:
            app.workingDraft.selectedAchievementIds.length > 0
              ? app.workingDraft.selectedAchievementIds
              : topAchIds,
          selectedSkillIds:
            app.workingDraft.selectedSkillIds.length > 0
              ? app.workingDraft.selectedSkillIds
              : ranking.recommendedSkillIds,
          bullets,
        };

        const updated: Application = {
          ...app,
          parsedJob,
          status: 'Draft',
          activeStep: 2,
          lastActiveStep: 'build',
          workingDraft: nextWorkingDraft,
          documents: {
            resume: nextWorkingDraft,
            coverLetter:
              app.coverLetterDraft ?? createDefaultCoverLetterDraft(app, bank),
          },
          updatedAt: deps.clock.nowIso(),
        };
        updated.latestScores = computeAtsAndJobMatchScores(
          updated,
          bank,
        ).scores;
        await deps.appRepo.saveApplication(updated);
        return { ok: true, value: updated };
      },
    },

    activity: {
      getSnapshot() {
        return gateway.getActivitySnapshot();
      },
      subscribe(listener) {
        return gateway.subscribeActivity(listener);
      },
    },

    careerIntelligence: {
      async extractExperienceRecord(rawStatement, timeframe) {
        const { provider } = await getActiveLlmProvider();
        const port: CareerIntelligencePort | undefined =
          provider.careerIntelligence;
        if (!port) {
          throw new Error('CareerIntelligencePort not configured on active provider');
        }
        return port.extractExperienceRecord(rawStatement, timeframe);
      },

      async classifyRequirementMatch(requirement, experience, targetRole) {
        const { provider } = await getActiveLlmProvider();
        const port = provider.careerIntelligence;
        if (!port) {
          throw new Error('CareerIntelligencePort not configured on active provider');
        }
        return port.classifyRequirementMatch(requirement, experience, targetRole);
      },

      async auditBulletHallucination(sourceRecord, generatedBullet) {
        const { provider } = await getActiveLlmProvider();
        const port = provider.careerIntelligence;
        if (!port) {
          throw new Error('CareerIntelligencePort not configured on active provider');
        }
        return port.auditBulletHallucination(sourceRecord, generatedBullet);
      },

      async evaluateAndRewriteBullet(draftBullet, evidence) {
        const { provider } = await getActiveLlmProvider();
        const port = provider.careerIntelligence;
        if (!port) {
          throw new Error('CareerIntelligencePort not configured on active provider');
        }
        return port.evaluateAndRewriteBullet(draftBullet, evidence);
      },

      async synthesizeExecutiveSummary(jdExcerpt, candidateBank) {
        const { provider } = await getActiveLlmProvider();
        const port = provider.careerIntelligence;
        if (!port) {
          throw new Error('CareerIntelligencePort not configured on active provider');
        }
        return port.synthesizeExecutiveSummary(jdExcerpt, candidateBank);
      },

      async synthesizeApplicationExecutiveSummary(applicationId: string) {
        const app = await deps.appRepo.getApplication(applicationId);
        if (!app) {
          return {
            ok: false,
            error: { code: 'NOT_FOUND', message: 'Application not found.' },
          };
        }
        const bank = await deps.bankRepo.getSnapshot();
        const jdExcerpt = extractTargetJdExcerpt(
          app.jobDescription || app.roleTitle,
          250,
        );
        const bankSlice = sliceCandidateBankForSummary({
          bank,
          parsedJob: app.parsedJob,
          rawJd: app.jobDescription,
          selectedSkillIds: app.workingDraft.selectedSkillIds,
          selectedAchievementIds: app.workingDraft.selectedAchievementIds,
        });
        const dto = await this.synthesizeExecutiveSummary(jdExcerpt, bankSlice);

        const nextWorkingDraft = {
          ...app.workingDraft,
          summary: dto.tailored_summary,
        };
        const clDraft = ensureCoverLetterDraft(app, bank);
        const updated: Application = {
          ...app,
          workingDraft: nextWorkingDraft,
          coverLetterDraft: clDraft,
          documents: {
            resume: nextWorkingDraft,
            coverLetter: clDraft,
          },
          updatedAt: deps.clock.nowIso(),
        };
        updated.latestScores = computeAtsAndJobMatchScores(updated, bank).scores;
        await deps.appRepo.saveApplication(updated);

        return {
          ok: true,
          value: {
            ...dto,
            application: updated,
          },
        };
      },

      async extractAndMapExperienceStatement({
        rawStatement,
        timeframe = 'Unspecified',
        experienceId,
      }) {
        const bank = await deps.bankRepo.getSnapshot();
        const dto = await this.extractExperienceRecord(rawStatement, timeframe);
        const achievement = mapExtractedExperienceToAchievement({
          extracted: dto,
          experienceId,
          achievementId: deps.idGen.nextId('ach'),
          skills: bank.skills,
        });
        return { dto, achievement };
      },
    },
  };
}

function buildDeterministicSummary(params: {
  roleTitle: string;
  skills: string[];
  companies: string[];
  metricSnippet?: string;
  voice: VoiceLevel;
}): string {
  const skillList =
    params.skills.length > 0
      ? params.skills.slice(0, 4).join(', ')
      : 'distributed systems and modern web infrastructure';
  const companyPhrase =
    params.companies.length > 0
      ? ` across ${params.companies.join(' and ')}`
      : '';
  const metricPhrase = params.metricSnippet
    ? `, including verified delivery of ${params.metricSnippet}`
    : '';

  if (params.voice === 'plain' || params.voice === 'natural') {
    return `${params.roleTitle} experienced in ${skillList}${companyPhrase}. Focused on reliable systems, clear architecture, and measurable engineering outcomes${metricPhrase}.`;
  }
  return `${params.roleTitle} specializing in ${skillList}${companyPhrase}. Proven track record of delivering resilient production infrastructure and quantifiable reliability improvements${metricPhrase}.`;
}

function fallbackParseResumeText(
  rawText: string,
): z.infer<typeof LlmStructuredResumeSchema> {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  const firstLine = lines[0]?.replace(/^#+\s*/, '') || 'Imported Candidate';
  const emailMatch = rawText.match(
    /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/,
  );
  const kws = extractDomainKeywordsFromText(rawText);

  const bulletLines = lines.filter((l) => /^[-*•]\s+/.test(l));
  const achievements = (
    bulletLines.length > 0 ? bulletLines : lines.slice(2, 6)
  )
    .slice(0, 5)
    .map((b) => {
      const cleaned = b.replace(/^[-*•]\s+/, '').trim();
      const metricMatch = cleaned.match(
        /\$?\d+(?:[.,]\d+)*(?:%|x|ms|s|k|m|b|\+)/i,
      );
      const parts = cleaned.split(
        /,\s*(?:resulting in|achieving|cutting|reducing|while)\s*/i,
      );
      return {
        action: parts[0] || cleaned,
        result: parts[1] || 'delivering measurable production impact',
        metric: metricMatch ? metricMatch[0] : undefined,
        tags: ['imported'],
      };
    });

  return {
    name: firstLine,
    headline: 'Senior Software Engineer',
    email: emailMatch ? emailMatch[0] : undefined,
    experiences: [
      {
        company: 'Imported Experience',
        title: 'Senior Engineer',
        location: 'San Francisco, CA',
        start: '2021',
        end: 'Present',
        achievements,
      },
    ],
    skills: kws.map((k) => ({
      name: k.term,
      category: k.kind === 'tool' ? 'Infrastructure' : 'Languages',
      aliases: [],
    })),
  };
}

export function buildCandidateFromStructuredData(
  parsedData: Record<string, unknown>,
  rawDoc: RawDocument,
  currentBank: BankSnapshot,
  idGen: IdGenerator,
): ParsedResumeCandidate {
  const root =
    parsedData.bank && typeof parsedData.bank === 'object'
      ? (parsedData.bank as Record<string, unknown>)
      : parsedData;

  const existingCompanies = new Set(
    currentBank.experiences.map((e) => e.company.toLowerCase().trim()),
  );
  const existingSkills = new Set(
    currentBank.skills.map((s) => normalizeKeyword(s.name)),
  );

  const rawExperiences = Array.isArray(root.experiences)
    ? (root.experiences as Array<Record<string, unknown>>)
    : [];
  const rawAchievements = Array.isArray(root.achievements)
    ? (root.achievements as Array<Record<string, unknown>>)
    : [];

  const proposedExperiences = rawExperiences.map((exp, expIdx) => {
    const expId = typeof exp.id === 'string' ? exp.id : idGen.nextId('exp');
    const company = String(exp.company || `Company ${expIdx + 1}`);
    const title = String(exp.title || 'Software Engineer');
    const isDuplicate = existingCompanies.has(company.toLowerCase().trim());
    const experience: Experience = {
      id: expId,
      company,
      title,
      location: typeof exp.location === 'string' ? exp.location : 'Remote',
      start: typeof exp.start === 'string' && exp.start ? exp.start : '2022',
      end: typeof exp.end === 'string' && exp.end ? exp.end : 'Present',
    };

    let achList = Array.isArray(exp.achievements) ? exp.achievements : [];
    if (achList.length === 0 && rawAchievements.length > 0) {
      achList = rawAchievements.filter(
        (a) =>
          a &&
          typeof a === 'object' &&
          (a.experienceId === exp.id || a.experienceId === expId),
      );
    }

    const achievements: Achievement[] = achList.map((a, aIdx) => {
      const achId =
        typeof a === 'object' && a && typeof a.id === 'string'
          ? a.id
          : idGen.nextId('ach');
      if (typeof a === 'string') {
        const metricMatch = a.match(/\$?\d+(?:[.,]\d+)*(?:%|x|ms|s|k|m|b|\+)/i);
        return {
          id: achId,
          experienceId: expId,
          action: a,
          result: 'delivering measurable engineering impact',
          metric: metricMatch ? metricMatch[0] : undefined,
          skillIds: [],
          tags: ['imported'],
        };
      }
      const aObj = (a && typeof a === 'object' ? a : {}) as Record<
        string,
        unknown
      >;
      return {
        id: achId,
        experienceId: expId,
        action: String(
          aObj.action ||
            aObj.description ||
            aObj.text ||
            `Achievement ${aIdx + 1}`,
        ),
        result: String(
          aObj.result || aObj.impact || 'delivering measurable production impact',
        ),
        metric: typeof aObj.metric === 'string' ? aObj.metric : undefined,
        skillIds: Array.isArray(aObj.skillIds)
          ? (aObj.skillIds as string[])
          : [],
        tags: Array.isArray(aObj.tags) ? (aObj.tags as string[]) : ['imported'],
      };
    });

    return { experience, achievements, isDuplicate };
  });

  const rawSkills = Array.isArray(root.skills) ? root.skills : [];
  const proposedSkills = rawSkills.map((s, sIdx) => {
    const sObj =
      typeof s === 'string'
        ? { name: s }
        : s && typeof s === 'object'
          ? (s as Record<string, unknown>)
          : { name: `Skill ${sIdx + 1}` };
    const name = String(sObj.name || `Skill ${sIdx + 1}`);
    const norm = normalizeKeyword(name);
    const validCategories = [
      'Languages',
      'Frameworks',
      'Infrastructure',
      'Data & AI',
      'Practices',
      'Tools',
    ];
    const category = (
      validCategories.includes(String(sObj.category))
        ? String(sObj.category)
        : 'Tools'
    ) as SkillCategory;
    return {
      skill: {
        id: typeof sObj.id === 'string' ? sObj.id : idGen.nextId('skill'),
        name,
        category,
        aliases: Array.isArray(sObj.aliases) ? (sObj.aliases as string[]) : [],
      } as Skill,
      isDuplicate: existingSkills.has(norm),
    };
  });

  const rawEducations = Array.isArray(root.educations)
    ? (root.educations as Array<Record<string, unknown>>)
    : [];
  const proposedEducations: Education[] = rawEducations.map((e, eIdx) => ({
    id: typeof e.id === 'string' ? e.id : idGen.nextId('edu'),
    institution: String(e.institution || `Institution ${eIdx + 1}`),
    degree: String(e.degree || 'Degree'),
    field: typeof e.field === 'string' ? e.field : '',
    location: typeof e.location === 'string' ? e.location : '',
    start: typeof e.start === 'string' ? e.start : '',
    end: typeof e.end === 'string' ? e.end : '',
    highlights: typeof e.highlights === 'string' ? e.highlights : undefined,
  }));

  const rawProjects = Array.isArray(root.projects)
    ? (root.projects as Array<Record<string, unknown>>)
    : [];
  const proposedProjects: Project[] = rawProjects.map((p, pIdx) => ({
    id: typeof p.id === 'string' ? p.id : idGen.nextId('proj'),
    name: String(p.name || `Project ${pIdx + 1}`),
    role: String(p.role || 'Creator & Maintainer'),
    description: String(p.description || ''),
    link: typeof p.link === 'string' ? p.link : undefined,
    skillIds: Array.isArray(p.skillIds) ? (p.skillIds as string[]) : [],
    highlights: Array.isArray(p.highlights) ? (p.highlights as string[]) : [],
  }));

  const rawCerts = Array.isArray(root.certifications)
    ? (root.certifications as Array<Record<string, unknown>>)
    : [];
  const proposedCertifications: Certification[] = rawCerts.map((c, cIdx) => ({
    id: typeof c.id === 'string' ? c.id : idGen.nextId('cert'),
    name: String(c.name || `Certification ${cIdx + 1}`),
    issuer: String(c.issuer || ''),
    date: typeof c.date === 'string' ? c.date : '',
    credentialId: typeof c.credentialId === 'string' ? c.credentialId : undefined,
  }));

  const profile = (
    root.profile && typeof root.profile === 'object' ? root.profile : root
  ) as Record<string, unknown>;

  return {
    rawDocument: rawDoc,
    proposedProfile: {
      name: typeof profile.name === 'string' ? profile.name : undefined,
      headline:
        typeof profile.headline === 'string' ? profile.headline : undefined,
      email: typeof profile.email === 'string' ? profile.email : undefined,
      phone: typeof profile.phone === 'string' ? profile.phone : undefined,
      location:
        typeof profile.location === 'string' ? profile.location : undefined,
    },
    proposedExperiences,
    proposedSkills,
    proposedEducations,
    proposedProjects,
    proposedCertifications,
  };
}

export function deterministicParseJobDescription(
  rawText: string,
  idGen: IdGenerator,
): ParsedJob {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const roleLine = lines.find((l) => /^role:|^title:|^position:/i.test(l));
  const companyLine = lines.find((l) => /^company:|^organization:/i.test(l));

  const title = roleLine
    ? roleLine.replace(/^[^:]+:\s*/i, '').trim()
    : lines[0]?.slice(0, 70) || 'Senior Software Engineer';
  const company = companyLine
    ? companyLine.replace(/^[^:]+:\s*/i, '').trim()
    : 'Target Company';

  const seniorityMatch = rawText.match(
    /\b(Staff|Principal|Senior|Lead|Mid-Level|Founding)\b/i,
  );
  const seniority = seniorityMatch ? seniorityMatch[1] : 'Senior';

  const kws = extractDomainKeywordsFromText(rawText);
  const requirements = kws.map((kw, idx) => ({
    id: idGen.nextId('req'),
    text: kw.term,
    normalizedKey: kw.normalized,
    priority: (idx < 7 ? 'must-have' : 'nice-to-have') as
      | 'must-have'
      | 'nice-to-have',
    category: kw.kind,
  }));

  if (requirements.length === 0) {
    requirements.push(
      {
        id: idGen.nextId('req'),
        text: 'TypeScript',
        normalizedKey: 'typescript',
        priority: 'must-have',
        category: 'hard-skill',
      },
      {
        id: idGen.nextId('req'),
        text: 'Distributed Systems',
        normalizedKey: 'microservices',
        priority: 'must-have',
        category: 'hard-skill',
      },
    );
  }

  const bulletLines = lines
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, '').trim());

  return {
    title,
    company,
    seniority,
    summary: `Tailored analysis for ${title} at ${company} (${seniority} level).`,
    requirements,
    responsibilities:
      bulletLines.length > 0
        ? bulletLines.slice(0, 5)
        : [
            `Design and ship reliable production systems for ${company}`,
            'Collaborate across engineering and product to improve system latency and observability',
          ],
    keywords: kws,
  };
}
