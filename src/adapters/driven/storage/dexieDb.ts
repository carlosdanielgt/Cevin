import Dexie, { type Table } from 'dexie';
import {
  AppSettings,
  ApplicationRepository,
  BankRepository,
  CachedTaskResult,
  DEFAULT_MLX_1_5B_MODEL_PATH,
  PerformanceCallEntry,
  PerformanceLog,
  PerformanceSummary,
  PreferencesRepository,
  ResultCache,
  SettingsRepository,
  createDemoApplications,
  createDemoBankSnapshot,
  resolveMlxModelPath,
} from '../../../core/application';
import {
  Achievement,
  Application,
  BankSnapshot,
  Certification,
  DEFAULT_USER_PREFERENCES,
  DocumentVersion,
  Education,
  Experience,
  Profile,
  Project,
  Skill,
  UserPreferences,
  computeRecruiterAppeal,
  createDefaultCoverLetterDraft,
  evaluateCoverLetterChecks,
  extractJobFactsByRules,
  isPlaceholderExperience,
  normalizeBankSkill,
} from '../../../core/domain';

/**
 * Pure migration helper upgrading v1 Application and Version records to v2
 * (adds `kind: 'resume'` to versions without `kind` and initializes `documents` / `coverLetterDraft`).
 */
export function migrateV1ToV2Records(params: {
  applications: Application[];
  versions: Array<
    Partial<DocumentVersion> & { id: string; applicationId: string }
  >;
  bank: BankSnapshot;
}): {
  applications: Application[];
  versions: DocumentVersion[];
} {
  const migratedApps = params.applications.map((app) => {
    const clDraft =
      app.coverLetterDraft ??
      app.documents?.coverLetter ??
      createDefaultCoverLetterDraft(app, params.bank);
    const letterChecks =
      app.latestLetterChecks ??
      evaluateCoverLetterChecks({
        draft: clDraft,
        parsedJob: app.parsedJob,
        bank: params.bank,
        company: app.company,
        roleTitle: app.roleTitle,
      }).report;

    return {
      ...app,
      lastActiveDoc: app.lastActiveDoc ?? 'resume',
      lastActiveStep: app.lastActiveStep ?? 'build',
      coverLetterDraft: clDraft,
      documents: {
        resume: app.workingDraft,
        coverLetter: clDraft,
      },
      latestLetterChecks: letterChecks,
    };
  });

  const migratedVersions = params.versions.map((v) => ({
    ...(v as DocumentVersion),
    kind: v.kind ?? 'resume',
  }));

  return {
    applications: migratedApps,
    versions: migratedVersions,
  };
}

/**
 * Pure migration helper upgrading v3 records to v4:
 * - Adds `jobFacts` (extracted via rules if missing) and `dismissedRequirements: []` to applications.
 * - Populates `latestScores.appeal` and `latestScores.appealLenses` on applications and versions.
 * - Initializes `preferences` to `DEFAULT_USER_PREFERENCES` if not present.
 */
export function migrateV3ToV4Records(params: {
  applications: Application[];
  versions?: DocumentVersion[];
  bank?: BankSnapshot;
  preferences?: Partial<UserPreferences> | null;
}): {
  applications: Application[];
  versions: DocumentVersion[];
  preferences: UserPreferences;
} {
  const bank = params.bank ?? createDemoBankSnapshot();
  const versions = params.versions ?? [];

  const migratedApps = params.applications.map((app) => {
    const jobFacts =
      app.jobFacts ?? extractJobFactsByRules(app.jobDescription || '').facts;
    const dismissedRequirements =
      app.dismissedRequirements ?? app.dismissedRequirementIds ?? [];
    const appealReport = computeRecruiterAppeal(app, bank);
    const appealVal =
      app.latestScores.appeal ??
      app.latestScores.recruiterAppeal ??
      appealReport.total;
    const latestScores = {
      ...app.latestScores,
      appeal: appealVal,
      recruiterAppeal: appealVal,
      appealLenses: app.latestScores.appealLenses ?? appealReport.lenses,
    };
    return {
      ...app,
      jobFacts,
      dismissedRequirements,
      dismissedRequirementIds: dismissedRequirements,
      latestScores,
    };
  });

  const appById = new Map(migratedApps.map((a) => [a.id, a]));
  const migratedVersions = versions.map((ver) => {
    const parentApp = appById.get(ver.applicationId);
    let appeal = ver.scores.appeal ?? ver.scores.recruiterAppeal;
    let appealLenses = ver.scores.appealLenses;
    if ((appeal === undefined || !appealLenses) && parentApp) {
      const tempApp: Application = {
        ...parentApp,
        voice: ver.voice,
        templateId: ver.templateId,
        workingDraft: ver.content ?? parentApp.workingDraft,
      };
      const rep = computeRecruiterAppeal(tempApp, bank);
      appeal = appeal ?? rep.total;
      appealLenses = appealLenses ?? rep.lenses;
    }
    const resolvedAppeal = appeal ?? ver.scores.jobMatch;
    return {
      ...ver,
      scores: {
        ...ver.scores,
        appeal: resolvedAppeal,
        recruiterAppeal: resolvedAppeal,
        appealLenses,
      },
    };
  });

  const mergedPrefs: UserPreferences = {
    ...DEFAULT_USER_PREFERENCES,
    ...(params.preferences ?? {}),
    homeLocation: params.preferences?.homeLocation
      ? {
          ...DEFAULT_USER_PREFERENCES.homeLocation,
          ...params.preferences.homeLocation,
        }
      : DEFAULT_USER_PREFERENCES.homeLocation,
    importance: {
      ...DEFAULT_USER_PREFERENCES.importance,
      ...(params.preferences?.importance ?? {}),
    },
  };

  return {
    applications: migratedApps,
    versions: migratedVersions,
    preferences: mergedPrefs,
  };
}

/**
 * Pure migration helper upgrading v4 records to v5:
 * - Populates `importance` on `preferences` with defaults (`dealbreaker` for `workPermits`, `nice-to-know` for `employmentType`, `important` for others).
 * - Adds `templateVersion` and `pageSize` defaults to saved `DocumentVersion` records.
 */
export function migrateV4ToV5Records(params: {
  applications: Application[];
  versions?: DocumentVersion[];
  preferences?: Partial<UserPreferences> | null;
}): {
  applications: Application[];
  versions: DocumentVersion[];
  preferences: UserPreferences;
} {
  const v4 = migrateV3ToV4Records(params);
  const migratedVersions: DocumentVersion[] = v4.versions.map((ver) => ({
    ...ver,
    templateVersion: ver.templateVersion ?? '1.0.0',
    pageSize: ver.pageSize ?? 'letter',
  }));
  return {
    applications: v4.applications,
    versions: migratedVersions,
    preferences: v4.preferences,
  };
}

/**
 * Pure migration helper upgrading v5 records to v6/v7:
 * - Migrates persisted settings with legacy provider IDs (`ollama`, `ollama-llama3.1`, `cevin-3b-mlx`)
 *   to `mlx-fastapi` and legacy model IDs (`llama3.1:8b`) to `Qwen2.5-1.5B-Instruct-4bit`,
 *   while preserving explicit valid model selections (`Qwen2.5-1.5B-Instruct-4bit` or `cevin-3b-4bit-fused`).
 * - Migrates legacy version `modelId` values (`llama3.1:8b`) to `Qwen2.5-1.5B-Instruct-4bit`.
 * - Normalizes Bank skills (categories and synonyms vs related skills) and deduplicates placeholder roles.
 * - Normalizes document `textAlign` so `'right'` becomes `'left'`.
 */
export function migrateV5ToV6Records(params: {
  settings?: Partial<AppSettings> | null;
  applications?: Application[];
  versions?: DocumentVersion[];
  bank?: BankSnapshot;
}): {
  settings: AppSettings;
  applications: Application[];
  versions: DocumentVersion[];
  bank: BankSnapshot;
} {
  const rawSettings = params.settings ?? {};
  const rawActiveId = rawSettings.activeProviderId ?? 'mlx-fastapi';
  const activeProviderId =
    rawActiveId === 'mock' ? 'mock' : 'mlx-fastapi';

  const prevMlxCfg =
    (rawSettings.providerConfigs?.['mlx-fastapi'] as Record<string, unknown> | undefined) ??
    (rawSettings.providerConfigs?.['cevin-3b-mlx'] as Record<string, unknown> | undefined) ??
    {};

  const rawPrevModel =
    typeof prevMlxCfg.model === 'string' ? prevMlxCfg.model.trim() : '';
  const isLegacyModel =
    !rawPrevModel ||
    rawPrevModel.toLowerCase().includes('llama') ||
    rawPrevModel.toLowerCase().includes('ollama');
  const resolvedModel = isLegacyModel
    ? 'Qwen2.5-1.5B-Instruct-4bit'
    : rawPrevModel;
  const rawPrevPath =
    typeof prevMlxCfg.modelPath === 'string' ? prevMlxCfg.modelPath.trim() : '';
  const isStaleDefaultPath =
    rawPrevPath === './Qwen2.5-1.5B-Instruct-4bit' ||
    rawPrevPath === 'Qwen2.5-1.5B-Instruct-4bit';
  const resolvedModelPath =
    !isLegacyModel && rawPrevPath && !isStaleDefaultPath
      ? rawPrevPath
      : resolveMlxModelPath(resolvedModel);

  const migratedSettings: AppSettings = {
    ...DEFAULT_APP_SETTINGS,
    ...rawSettings,
    activeProviderId,
    providerConfigs: {
      'mlx-fastapi': {
        baseUrl:
          typeof prevMlxCfg.baseUrl === 'string' &&
          !prevMlxCfg.baseUrl.includes('11434')
            ? prevMlxCfg.baseUrl
            : 'http://localhost:8000',
        model: resolvedModel,
        modelPath: resolvedModelPath,
        maxSeqLength:
          typeof prevMlxCfg.maxSeqLength === 'number'
            ? prevMlxCfg.maxSeqLength
            : 1024,
      },
      mock: {
        ...DEFAULT_APP_SETTINGS.providerConfigs.mock,
        ...(rawSettings.providerConfigs?.mock ?? {}),
      },
    },
  };

  const normalizeAlign = (val: unknown): 'left' | 'justify' =>
    val === 'justify' ? 'justify' : 'left';

  const migratedApplications = (params.applications ?? []).map((app) => {
    const resumeAlign = normalizeAlign(app.workingDraft?.textAlign);
    const workingDraft = {
      ...app.workingDraft,
      textAlign: resumeAlign,
    };
    const coverLetterDraft = app.coverLetterDraft
      ? {
          ...app.coverLetterDraft,
          textAlign: normalizeAlign(app.coverLetterDraft.textAlign),
        }
      : undefined;
    return {
      ...app,
      workingDraft,
      coverLetterDraft,
      documents: app.documents
        ? {
            resume: {
              ...app.documents.resume,
              textAlign: normalizeAlign(app.documents.resume?.textAlign ?? resumeAlign),
            },
            coverLetter:
              coverLetterDraft ?? app.documents.coverLetter,
          }
        : undefined,
    };
  });

  const migratedVersions = (params.versions ?? []).map((ver) => ({
    ...ver,
    modelId:
      !ver.modelId ||
      ver.modelId.toLowerCase().includes('llama') ||
      ver.modelId.toLowerCase().includes('ollama')
        ? 'Qwen2.5-1.5B-Instruct-4bit'
        : ver.modelId,
  }));

  const rawBank = params.bank ?? createDemoBankSnapshot();
  const normalizedSkills = (rawBank.skills ?? []).map((s) =>
    normalizeBankSkill(s),
  );
  // Deduplicate placeholder "New Company" roles that have no achievements
  const achExpIds = new Set(
    (rawBank.achievements ?? []).map((a) => a.experienceId),
  );
  let seenPlaceholder = false;
  const dedupedExperiences = (rawBank.experiences ?? []).filter((exp) => {
    if (isPlaceholderExperience(exp) && !achExpIds.has(exp.id)) {
      if (seenPlaceholder) return false;
      seenPlaceholder = true;
    }
    return true;
  });

  return {
    settings: migratedSettings,
    applications: migratedApplications,
    versions: migratedVersions,
    bank: {
      ...rawBank,
      skills: normalizedSkills,
      experiences: dedupedExperiences,
    },
  };
}


export class CevinDexieDatabase extends Dexie {
  profiles!: Table<Profile, string>;
  experiences!: Table<Experience, string>;
  achievements!: Table<Achievement, string>;
  skills!: Table<Skill, string>;
  educations!: Table<Education, string>;
  projects!: Table<Project, string>;
  certifications!: Table<Certification, string>;
  applications!: Table<Application, string>;
  versions!: Table<DocumentVersion, string>;
  settings!: Table<{ id: string; value: AppSettings }, string>;
  preferences!: Table<{ id: string; value: UserPreferences }, string>;
  resultCache!: Table<CachedTaskResult, string>;
  performanceLog!: Table<PerformanceCallEntry, string>;

  constructor(dbName = 'cevin_local_studio_db') {
    super(dbName);
    this.version(1).stores({
      profiles: 'id',
      experiences: 'id, company',
      achievements: 'id, experienceId',
      skills: 'id, name, category',
      educations: 'id',
      projects: 'id',
      certifications: 'id',
      applications: 'id, status, updatedAt',
      versions: 'id, applicationId, number, createdAt',
      settings: 'id',
    });

    this.version(2)
      .stores({
        profiles: 'id',
        experiences: 'id, company',
        achievements: 'id, experienceId',
        skills: 'id, name, category',
        educations: 'id',
        projects: 'id',
        certifications: 'id',
        applications: 'id, status, updatedAt',
        versions: 'id, applicationId, kind, number, createdAt',
        settings: 'id',
      })
      .upgrade(async (tx) => {
        await tx
          .table('versions')
          .toCollection()
          .modify((ver: Record<string, unknown>) => {
            if (!ver.kind) {
              ver.kind = 'resume';
            }
          });
      });

    this.version(3).stores({
      profiles: 'id',
      experiences: 'id, company',
      achievements: 'id, experienceId',
      skills: 'id, name, category',
      educations: 'id',
      projects: 'id',
      certifications: 'id',
      applications: 'id, status, updatedAt',
      versions: 'id, applicationId, kind, number, createdAt',
      settings: 'id',
      resultCache: 'key, taskId, lastAccessedAt',
      performanceLog: 'id, taskId, createdAt',
    });

    this.version(4)
      .stores({
        profiles: 'id',
        experiences: 'id, company',
        achievements: 'id, experienceId',
        skills: 'id, name, category',
        educations: 'id',
        projects: 'id',
        certifications: 'id',
        applications: 'id, status, updatedAt',
        versions: 'id, applicationId, kind, number, createdAt',
        settings: 'id',
        preferences: 'id',
        resultCache: 'key, taskId, lastAccessedAt',
        performanceLog: 'id, taskId, createdAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('applications')
          .toCollection()
          .modify((app: Record<string, unknown>) => {
            if (!app.jobFacts) {
              const jd =
                typeof app.jobDescription === 'string'
                  ? app.jobDescription
                  : '';
              app.jobFacts = extractJobFactsByRules(jd).facts;
            }
            if (!Array.isArray(app.dismissedRequirements)) {
              app.dismissedRequirements = [];
            }
          });
      });

    this.version(5)
      .stores({
        profiles: 'id',
        experiences: 'id, company',
        achievements: 'id, experienceId',
        skills: 'id, name, category',
        educations: 'id',
        projects: 'id',
        certifications: 'id',
        applications: 'id, status, updatedAt',
        versions: 'id, applicationId, kind, number, contentHash, createdAt',
        settings: 'id',
        preferences: 'id',
        resultCache: 'key, taskId, lastAccessedAt',
        performanceLog: 'id, taskId, createdAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('versions')
          .toCollection()
          .modify((ver: Record<string, unknown>) => {
            if (!ver.templateVersion) {
              ver.templateVersion = 1;
            }
            if (!ver.pageSize) {
              ver.pageSize = 'letter';
            }
          });
      });

    this.version(6)
      .stores({
        profiles: 'id',
        experiences: 'id, company',
        achievements: 'id, experienceId',
        skills: 'id, name, category',
        educations: 'id',
        projects: 'id',
        certifications: 'id',
        applications: 'id, status, updatedAt',
        versions: 'id, applicationId, kind, number, contentHash, createdAt',
        settings: 'id',
        preferences: 'id',
        resultCache: 'key, taskId, lastAccessedAt',
        performanceLog: 'id, taskId, createdAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((rec: { id: string; value?: AppSettings }) => {
            if (rec.value) {
              rec.value = migrateV5ToV6Records({ settings: rec.value }).settings;
            }
          });
        await tx
          .table('versions')
          .toCollection()
          .modify((ver: Record<string, unknown>) => {
            const mId = typeof ver.modelId === 'string' ? ver.modelId : '';
            if (
              !mId ||
              mId.toLowerCase().includes('llama') ||
              mId.toLowerCase().includes('ollama')
            ) {
              ver.modelId = 'Qwen2.5-1.5B-Instruct-4bit';
            }
          });
        await tx
          .table('skills')
          .toCollection()
          .modify((skill: Skill) => {
            const norm = normalizeBankSkill(skill);
            skill.category = norm.category;
            skill.aliases = norm.aliases;
            skill.related = norm.related;
          });
      });

    this.version(7)
      .stores({
        profiles: 'id',
        experiences: 'id, company',
        achievements: 'id, experienceId',
        skills: 'id, name, category',
        educations: 'id',
        projects: 'id',
        certifications: 'id',
        applications: 'id, status, updatedAt',
        versions: 'id, applicationId, kind, number, contentHash, createdAt',
        settings: 'id',
        preferences: 'id',
        resultCache: 'key, taskId, lastAccessedAt',
        performanceLog: 'id, taskId, createdAt',
      })
      .upgrade(async (tx) => {
        await tx
          .table('settings')
          .toCollection()
          .modify((rec: { id: string; value?: AppSettings }) => {
            if (!rec.value) return;
            const prevCfg = rec.value.providerConfigs?.['mlx-fastapi'] as
              | Record<string, unknown>
              | undefined;
            if (prevCfg?.model === 'cevin-3b-4bit-fused') {
              rec.value = {
                ...rec.value,
                providerConfigs: {
                  ...rec.value.providerConfigs,
                  'mlx-fastapi': {
                    ...prevCfg,
                    model: 'Qwen2.5-1.5B-Instruct-4bit',
                    modelPath: DEFAULT_MLX_1_5B_MODEL_PATH,
                  },
                },
              };
            }
          });
      });
  }
}

export const DEFAULT_APP_SETTINGS: AppSettings = {
  activeProviderId: 'mlx-fastapi',
  providerConfigs: {
    'mlx-fastapi': {
      baseUrl: 'http://localhost:8000',
      model: 'Qwen2.5-1.5B-Instruct-4bit',
      modelPath: DEFAULT_MLX_1_5B_MODEL_PATH,
      maxSeqLength: 1024,
    },
    mock: {
      model: 'Demo mode',
      embeddingModel: 'mock-embed-v1',
      simulatedLatencyMs: 15,
    },
  },
  theme: 'light',
  defaultTemplateId: 'classic',
  hasCompletedOnboarding: false,
  gettingStartedDismissed: false,
  sidebarCollapsed: false,
  applicationViewMode: 'list',
  applicationSortBy: 'updated',
  hidePracticalConflicts: false,
  remoteProviderConfirmed: {},
  smarterMatchingEnabled: false,
  parallelSlots: 1,
};

/**
 * Creates an in-memory LRU ResultCache (evicts oldest `lastAccessedAt` beyond `maxEntries`).
 */
export function createInMemoryResultCache(maxEntries = 5000): ResultCache {
  const store = new Map<string, CachedTaskResult>();

  return {
    async get(key: string): Promise<CachedTaskResult | null> {
      const found = store.get(key);
      if (!found) return null;
      const updated: CachedTaskResult = {
        ...found,
        lastAccessedAt: new Date().toISOString(),
      };
      store.delete(key);
      store.set(key, updated);
      return { ...updated };
    },
    async set(entry: CachedTaskResult): Promise<void> {
      if (store.has(entry.key)) {
        store.delete(entry.key);
      } else if (store.size >= maxEntries) {
        const oldestKey = store.keys().next().value;
        if (oldestKey) {
          store.delete(oldestKey);
        }
      }
      store.set(entry.key, { ...entry });
    },
    async clear(): Promise<void> {
      store.clear();
    },
    async count(): Promise<number> {
      return store.size;
    },
  };
}

function summarizePerformanceEntries(
  entries: PerformanceCallEntry[],
  limit = 20,
): PerformanceSummary {
  const sorted = [...entries].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
  const recentCalls = sorted.slice(0, limit);

  let readingSum = 0;
  let readingCount = 0;
  let writingSum = 0;
  let writingCount = 0;
  let cacheHits = 0;
  let repairs = 0;
  let fallbacks = 0;

  for (const call of sorted) {
    if (call.cached) cacheHits += 1;
    if (call.repaired) repairs += 1;
    if (call.fellBackToBaseline) fallbacks += 1;
    if (call.readingTokPerSec && call.readingTokPerSec > 0) {
      readingSum += call.readingTokPerSec;
      readingCount += 1;
    }
    if (call.writingTokPerSec && call.writingTokPerSec > 0) {
      writingSum += call.writingTokPerSec;
      writingCount += 1;
    }
  }

  return {
    readingSpeedTokPerSec:
      readingCount > 0 ? Math.round(readingSum / readingCount) : 0,
    writingSpeedTokPerSec:
      writingCount > 0 ? Math.round(writingSum / writingCount) : 0,
    totalCalls: sorted.length,
    cacheHits,
    repairs,
    fallbacks,
    recentCalls,
  };
}

export function createInMemoryPerformanceLog(maxEntries = 100): PerformanceLog {
  let entries: PerformanceCallEntry[] = [];

  return {
    async recordCall(entry: PerformanceCallEntry): Promise<void> {
      entries.push({ ...entry });
      if (entries.length > maxEntries) {
        entries = entries.slice(entries.length - maxEntries);
      }
    },
    async getSummary(limit = 20): Promise<PerformanceSummary> {
      return summarizePerformanceEntries(entries, limit);
    },
    async clear(): Promise<void> {
      entries = [];
    },
  };
}

export function createInMemoryRepositories(seedDemo = true): {
  bankRepo: BankRepository;
  appRepo: ApplicationRepository;
  settingsRepo: SettingsRepository;
  prefsRepo: PreferencesRepository;
  resultCache: ResultCache;
  performanceLog: PerformanceLog;
} {
  const demoBank = createDemoBankSnapshot();
  const demoApps = createDemoApplications(demoBank);

  let bankSnapshot: BankSnapshot = seedDemo
    ? JSON.parse(JSON.stringify(demoBank))
    : {
        profile: {
          id: 'profile-main',
          name: '',
          headline: '',
          email: '',
          phone: '',
          location: '',
          links: [],
        },
        experiences: [],
        achievements: [],
        skills: [],
        educations: [],
        projects: [],
        certifications: [],
      };

  let applications: Application[] = seedDemo
    ? JSON.parse(JSON.stringify(demoApps.applications))
    : [];
  let versions: DocumentVersion[] = seedDemo
    ? JSON.parse(JSON.stringify(demoApps.versions))
    : [];
  let currentSettings: AppSettings = JSON.parse(
    JSON.stringify(DEFAULT_APP_SETTINGS),
  );
  let currentPreferences: UserPreferences | null = seedDemo
    ? JSON.parse(JSON.stringify(DEFAULT_USER_PREFERENCES))
    : null;

  return {
    bankRepo: {
      async getSnapshot() {
        return JSON.parse(JSON.stringify(bankSnapshot));
      },
      async saveSnapshot(snapshot: BankSnapshot) {
        bankSnapshot = JSON.parse(JSON.stringify(snapshot));
      },
      async clear() {
        bankSnapshot = {
          profile: {
            id: 'profile-main',
            name: '',
            headline: '',
            email: '',
            phone: '',
            location: '',
            links: [],
          },
          experiences: [],
          achievements: [],
          skills: [],
          educations: [],
          projects: [],
          certifications: [],
        };
      },
    },
    appRepo: {
      async listApplications() {
        return [...applications].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        );
      },
      async getApplication(id: string) {
        const found = applications.find((a) => a.id === id);
        return found ? JSON.parse(JSON.stringify(found)) : null;
      },
      async saveApplication(app: Application) {
        const idx = applications.findIndex((a) => a.id === app.id);
        if (idx >= 0) {
          applications[idx] = JSON.parse(JSON.stringify(app));
        } else {
          applications.push(JSON.parse(JSON.stringify(app)));
        }
      },
      async deleteApplication(id: string) {
        applications = applications.filter((a) => a.id !== id);
        versions = versions.filter((v) => v.applicationId !== id);
      },
      async listVersions(applicationId: string) {
        return versions
          .filter((v) => v.applicationId === applicationId)
          .map((v) => ({
            ...v,
            kind: v.kind ?? 'resume',
            pdfBytes:
              v.pdfBytes instanceof Uint8Array
                ? new Uint8Array(v.pdfBytes)
                : undefined,
          }))
          .sort((a, b) => b.number - a.number);
      },
      async deleteVersion(versionId: string) {
        versions = versions.filter((v) => v.id !== versionId);
      },
      async saveVersion(version: DocumentVersion) {
        const clonedBytes =
          version.pdfBytes instanceof Uint8Array
            ? new Uint8Array(version.pdfBytes)
            : undefined;
        const normalized: DocumentVersion = {
          ...JSON.parse(JSON.stringify(version)),
          kind: version.kind ?? 'resume',
          pdfBytes: clonedBytes,
        };
        const idx = versions.findIndex((v) => v.id === version.id);
        if (idx >= 0) {
          versions[idx] = normalized;
        } else {
          versions.push(normalized);
        }
      },

      async clear() {
        applications = [];
        versions = [];
      },
    },
    settingsRepo: {
      async getSettings() {
        return JSON.parse(JSON.stringify(currentSettings));
      },
      async saveSettings(settings: AppSettings) {
        currentSettings = JSON.parse(JSON.stringify(settings));
      },
    },
    prefsRepo: {
      async getPreferences() {
        return currentPreferences
          ? JSON.parse(JSON.stringify(currentPreferences))
          : null;
      },
      async savePreferences(preferences: UserPreferences) {
        currentPreferences = JSON.parse(JSON.stringify(preferences));
      },
      async clear() {
        currentPreferences = null;
      },
    },
    resultCache: createInMemoryResultCache(5000),
    performanceLog: createInMemoryPerformanceLog(100),
  };
}

export function createDexieRepositories(): {
  bankRepo: BankRepository;
  appRepo: ApplicationRepository;
  settingsRepo: SettingsRepository;
  prefsRepo: PreferencesRepository;
  resultCache: ResultCache;
  performanceLog: PerformanceLog;
} {
  if (typeof indexedDB === 'undefined') {
    return createInMemoryRepositories(true);
  }

  const db = new CevinDexieDatabase();
  let initialized = false;

  const ensureSeeded = async () => {
    if (initialized) return;
    initialized = true;
    const profileCount = await db.profiles.count();
    const appCount = await db.applications.count();
    if (profileCount === 0 && appCount === 0) {
      const demoBank = createDemoBankSnapshot();
      const { applications, versions } = createDemoApplications(demoBank);
      await db.transaction(
        'rw',
        [
          db.profiles,
          db.experiences,
          db.achievements,
          db.skills,
          db.educations,
          db.projects,
          db.certifications,
          db.applications,
          db.versions,
          db.preferences,
        ],
        async () => {
          await db.profiles.put(demoBank.profile);
          await db.experiences.bulkPut(demoBank.experiences);
          await db.achievements.bulkPut(demoBank.achievements);
          await db.skills.bulkPut(demoBank.skills);
          await db.educations.bulkPut(demoBank.educations);
          await db.projects.bulkPut(demoBank.projects);
          await db.certifications.bulkPut(demoBank.certifications);
          await db.applications.bulkPut(applications);
          await db.versions.bulkPut(versions);
          await db.preferences.put({
            id: 'main',
            value: DEFAULT_USER_PREFERENCES,
          });
        },
      );
    } else {
      try {
        const p = await db.profiles.toCollection().first();
        if (p && p.email && /fastmail\.[a-z]+/i.test(p.email)) {
          await db.profiles.update(p.id, {
            email: p.email.replace(/@fastmail\.[a-z]+/gi, '@example.com'),
          });
        }
        if (p && p.name && !p.name.toLowerCase().includes('elena')) {
          if (
            p.links &&
            p.links.some(
              (l) =>
                l.url.includes('rostova') ||
                l.url.includes('elena'),
            )
          ) {
            const cleanLinks = p.links.filter(
              (l) =>
                !l.url.includes('rostova.systems') &&
                !l.url.includes('elena-rostova') &&
                !l.url.includes('erostova'),
            );
            await db.profiles.update(p.id, { links: cleanLinks });
          }
          await db.educations
            .filter(
              (e) =>
                e.institution !== 'Pacific Crest Institute of Technology' &&
                e.location === 'Seattle, WA',
            )
            .modify({ location: '' });
          await db.educations
            .filter(
              (e) =>
                e.institution !== 'Pacific Crest Institute of Technology' &&
                (e.highlights?.includes('Teaching Assistant for CSE 452') ??
                  false),
            )
            .modify({ highlights: '' });
          await db.projects
            .filter((proj) => proj.link?.includes('erostova') ?? false)
            .modify({ link: '' });
        }
        await db.educations
          .filter(
            (e) =>
              e.institution === 'University of Washington' ||
              e.institution === 'UC Berkeley',
          )
          .modify({ institution: 'Pacific Crest Institute of Technology' });
      } catch {
        // non-blocking
      }
    }
  };

  const bankRepo: BankRepository = {
    async getSnapshot(): Promise<BankSnapshot> {
      await ensureSeeded();
      const [
        profiles,
        experiences,
        achievements,
        skills,
        educations,
        projects,
        certifications,
      ] = await Promise.all([
        db.profiles.toArray(),
        db.experiences.toArray(),
        db.achievements.toArray(),
        db.skills.toArray(),
        db.educations.toArray(),
        db.projects.toArray(),
        db.certifications.toArray(),
      ]);

      const rawProfile = profiles[0] ?? {
        id: 'profile-main',
        name: '',
        headline: '',
        email: '',
        phone: '',
        location: '',
        links: [],
      };

      const isCustomizedCandidate = Boolean(
        rawProfile.name && !rawProfile.name.toLowerCase().includes('elena'),
      );

      const profile = {
        ...rawProfile,
        links: isCustomizedCandidate
          ? (rawProfile.links ?? []).filter(
              (l) =>
                !l.url.includes('rostova.systems') &&
                !l.url.includes('elena-rostova') &&
                !l.url.includes('erostova'),
            )
          : rawProfile.links ?? [],
      };

      const cleanedEducations = educations.map((e) => {
        if (
          isCustomizedCandidate &&
          e.institution !== 'Pacific Crest Institute of Technology'
        ) {
          return {
            ...e,
            location: e.location === 'Seattle, WA' ? '' : e.location,
            highlights:
              e.highlights &&
              e.highlights.includes('Teaching Assistant for CSE 452')
                ? ''
                : e.highlights,
          };
        }
        return e;
      });

      const cleanedProjects = projects.map((proj) => {
        if (isCustomizedCandidate && proj.link?.includes('erostova')) {
          return { ...proj, link: '' };
        }
        return proj;
      });

      const orderedExperiences = experiences.some(
        (e) => typeof e.sortOrder === 'number',
      )
        ? [...experiences].sort(
            (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999),
          )
        : experiences;

      return {
        profile,
        experiences: orderedExperiences,
        achievements,
        skills: skills.map((s) => normalizeBankSkill(s)),
        educations: cleanedEducations,
        projects: cleanedProjects,
        certifications,
      };
    },

    async saveSnapshot(snapshot: BankSnapshot): Promise<void> {
      initialized = true;
      const stampedExperiences = snapshot.experiences.map((exp, idx) => ({
        ...exp,
        sortOrder: idx,
      }));
      await db.transaction(
        'rw',
        [
          db.profiles,
          db.experiences,
          db.achievements,
          db.skills,
          db.educations,
          db.projects,
          db.certifications,
        ],
        async () => {
          await Promise.all([
            db.profiles.clear(),
            db.experiences.clear(),
            db.achievements.clear(),
            db.skills.clear(),
            db.educations.clear(),
            db.projects.clear(),
            db.certifications.clear(),
          ]);
          await db.profiles.put(snapshot.profile);
          if (stampedExperiences.length)
            await db.experiences.bulkPut(stampedExperiences);
          if (snapshot.achievements.length)
            await db.achievements.bulkPut(snapshot.achievements);
          if (snapshot.skills.length) await db.skills.bulkPut(snapshot.skills);
          if (snapshot.educations.length)
            await db.educations.bulkPut(snapshot.educations);
          if (snapshot.projects.length)
            await db.projects.bulkPut(snapshot.projects);
          if (snapshot.certifications.length)
            await db.certifications.bulkPut(snapshot.certifications);
        },
      );
    },

    async clear(): Promise<void> {
      initialized = true;
      await Promise.all([
        db.profiles.clear(),
        db.experiences.clear(),
        db.achievements.clear(),
        db.skills.clear(),
        db.educations.clear(),
        db.projects.clear(),
        db.certifications.clear(),
      ]);
    },
  };

  const appRepo: ApplicationRepository = {
    async listApplications(): Promise<Application[]> {
      await ensureSeeded();
      const all = await db.applications.toArray();
      return all.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    },

    async getApplication(id: string): Promise<Application | null> {
      await ensureSeeded();
      const found = await db.applications.get(id);
      return found ?? null;
    },

    async saveApplication(application: Application): Promise<void> {
      initialized = true;
      await db.applications.put(application);
    },

    async deleteApplication(id: string): Promise<void> {
      initialized = true;
      await db.applications.delete(id);
      const vers = await db.versions
        .where('applicationId')
        .equals(id)
        .primaryKeys();
      await db.versions.bulkDelete(vers);
    },

    async listVersions(applicationId: string): Promise<DocumentVersion[]> {
      await ensureSeeded();
      const vers = await db.versions
        .where('applicationId')
        .equals(applicationId)
        .toArray();
      return vers
        .map((v) => ({ ...v, kind: v.kind ?? 'resume' }))
        .sort((a, b) => b.number - a.number);
    },

    async deleteVersion(versionId: string): Promise<void> {
      initialized = true;
      await db.versions.delete(versionId);
    },

    async saveVersion(version: DocumentVersion): Promise<void> {
      initialized = true;
      await db.versions.put({
        ...version,
        kind: version.kind ?? 'resume',
      });
    },

    async clear(): Promise<void> {
      initialized = true;
      await Promise.all([db.applications.clear(), db.versions.clear()]);
    },
  };

  const settingsRepo: SettingsRepository = {
    async getSettings(): Promise<AppSettings> {
      const record = await db.settings.get('main');
      return migrateV5ToV6Records({ settings: record?.value }).settings;
    },
    async saveSettings(settings: AppSettings): Promise<void> {
      await db.settings.put({
        id: 'main',
        value: migrateV5ToV6Records({ settings }).settings,
      });
    },
  };

  const prefsRepo: PreferencesRepository = {
    async getPreferences(): Promise<UserPreferences | null> {
      await ensureSeeded();
      const record = await db.preferences.get('main');
      return record?.value ?? DEFAULT_USER_PREFERENCES;
    },
    async savePreferences(preferences: UserPreferences): Promise<void> {
      await db.preferences.put({ id: 'main', value: preferences });
    },
    async clear(): Promise<void> {
      await db.preferences.clear();
    },
  };

  const resultCache: ResultCache = {
    async get(key: string): Promise<CachedTaskResult | null> {
      const found = await db.resultCache.get(key);
      if (!found) return null;
      const updated: CachedTaskResult = {
        ...found,
        lastAccessedAt: new Date().toISOString(),
      };
      await db.resultCache.put(updated);
      return updated;
    },
    async set(entry: CachedTaskResult): Promise<void> {
      await db.resultCache.put(entry);
      const total = await db.resultCache.count();
      if (total > 5000) {
        const oldest = await db.resultCache
          .orderBy('lastAccessedAt')
          .limit(total - 5000)
          .primaryKeys();
        await db.resultCache.bulkDelete(oldest);
      }
    },
    async clear(): Promise<void> {
      await db.resultCache.clear();
    },
    async count(): Promise<number> {
      return db.resultCache.count();
    },
  };

  const performanceLog: PerformanceLog = {
    async recordCall(entry: PerformanceCallEntry): Promise<void> {
      await db.performanceLog.put(entry);
      const total = await db.performanceLog.count();
      if (total > 100) {
        const oldest = await db.performanceLog
          .orderBy('createdAt')
          .limit(total - 100)
          .primaryKeys();
        await db.performanceLog.bulkDelete(oldest);
      }
    },
    async getSummary(limit = 20): Promise<PerformanceSummary> {
      const all = await db.performanceLog.toArray();
      return summarizePerformanceEntries(all, limit);
    },
    async clear(): Promise<void> {
      await db.performanceLog.clear();
    },
  };

  return {
    bankRepo,
    appRepo,
    settingsRepo,
    prefsRepo,
    resultCache,
    performanceLog,
  };
}
