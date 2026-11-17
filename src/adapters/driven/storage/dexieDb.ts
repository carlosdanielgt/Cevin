import Dexie, { Table } from 'dexie';
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
  createDefaultCoverLetterDraft,
  extractJobFactsByRules,
  isPlaceholderExperience,
  normalizeBankSkill,
} from '../../../core/domain';

export function migrateV1ToV2Records(params: {
  applications?: Application[];
  versions?: Array<Omit<DocumentVersion, 'kind'> & { kind?: DocumentVersion['kind'] }>;
  bank: BankSnapshot;
}): {
  applications: Application[];
  versions: DocumentVersion[];
} {
  const applications = (params.applications ?? []).map((app) => {
    const coverLetterDraft =
      app.coverLetterDraft ?? createDefaultCoverLetterDraft(app, params.bank);
    return {
      ...app,
      coverLetterDraft,
      documents: app.documents ?? {
        resume: app.workingDraft,
        coverLetter: coverLetterDraft,
      },
    };
  });
  const versions: DocumentVersion[] = (params.versions ?? []).map((ver) => ({
    ...ver,
    kind: ver.kind ?? 'resume',
  }));
  return { applications, versions };
}

export function migrateV3ToV4Records(params: {
  applications?: Application[];
  preferences?: UserPreferences | null;
}): {
  applications: Application[];
  preferences: UserPreferences;
} {
  const applications = (params.applications ?? []).map((app) => ({
    ...app,
    jobFacts:
      app.jobFacts ??
      extractJobFactsByRules(
        typeof app.jobDescription === 'string' ? app.jobDescription : '',
      ).facts,
    dismissedRequirementIds: Array.isArray(app.dismissedRequirementIds)
      ? app.dismissedRequirementIds
      : [],
    latestScores: {
      ...app.latestScores,
      recruiterAppeal:
        typeof app.latestScores?.recruiterAppeal === 'number'
          ? app.latestScores.recruiterAppeal
          : 0,
    },
  }));
  return {
    applications,
    preferences: params.preferences ?? DEFAULT_USER_PREFERENCES,
  };
}

/**
 * Pure migration helper upgrading v5 records to v6/v7:
 * - Migrates persisted settings with legacy provider IDs to `mlx-fastapi` and legacy model IDs
 *   (`llama3.1:8b`) to `Qwen2.5-1.5B-Instruct-4bit`, while preserving explicit valid model selections
 *   (`Qwen2.5-1.5B-Instruct-4bit` or `cevin-3b-4bit-fused`).
 * - Migrates legacy version `modelId` values (`llama3.1:8b`) to `Qwen2.5-1.5B-Instruct-4bit`.
 * - Normalizes Bank skills (categories and synonyms vs related skills) and deduplicates placeholder roles.
 * - Normalizes document `textAlign` so `'right'` becomes `'left'`.
 */
export function migrateV5ToV6Records(params: {
  settings?: Partial<AppSettings>;
  applications?: Application[];
  versions?: DocumentVersion[];
  bank?: BankSnapshot;
}): {
  settings: AppSettings;
  applications: Application[];
  versions: DocumentVersion[];
  bank: BankSnapshot;
} {
  const rawSettings = (params.settings ?? {}) as Partial<AppSettings> & {
    providerConfigs?: Record<string, Record<string, unknown>>;
  };
  const activeProviderId =
    (rawSettings.activeProviderId ?? 'mlx-fastapi') === 'mock'
      ? 'mock'
      : 'mlx-fastapi';
  const prevMlxCfg =
    rawSettings.providerConfigs?.['mlx-fastapi'] ??
    rawSettings.providerConfigs?.['cevin-3b-mlx'] ??
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
    typeof prevMlxCfg.modelPath === 'string'
      ? prevMlxCfg.modelPath.trim()
      : '';
  const resolvedModelPath =
    !isLegacyModel &&
    rawPrevPath &&
    !(
      rawPrevPath === './Qwen2.5-1.5B-Instruct-4bit' ||
      rawPrevPath === 'Qwen2.5-1.5B-Instruct-4bit'
    )
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
              textAlign: normalizeAlign(
                app.documents.resume?.textAlign ?? resumeAlign,
              ),
            },
            coverLetter: coverLetterDraft ?? app.documents.coverLetter,
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

interface KeyValueRecord<T> {
  id: string;
  value: T;
}

class CevinDexieDatabase extends Dexie {
  profiles!: Table<Profile, string>;
  experiences!: Table<Experience & { sortOrder?: number }, string>;
  achievements!: Table<Achievement, string>;
  skills!: Table<Skill, string>;
  educations!: Table<Education, string>;
  projects!: Table<Project, string>;
  certifications!: Table<Certification, string>;
  applications!: Table<Application, string>;
  versions!: Table<DocumentVersion, string>;
  settings!: Table<KeyValueRecord<AppSettings>, string>;
  preferences!: Table<KeyValueRecord<UserPreferences>, string>;
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
          .modify((ver: { kind?: DocumentVersion['kind'] }) => {
            if (!ver.kind) ver.kind = 'resume';
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
          .modify((app: Partial<Application>) => {
            if (!app.jobFacts) {
              app.jobFacts = extractJobFactsByRules(
                typeof app.jobDescription === 'string'
                  ? app.jobDescription
                  : '',
              ).facts;
            }
            if (!Array.isArray(app.dismissedRequirementIds)) {
              app.dismissedRequirementIds = [];
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
          .modify((ver: Partial<DocumentVersion>) => {
            if (!ver.templateVersion) ver.templateVersion = '1';
            if (!ver.pageSize) ver.pageSize = 'letter';
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
          .modify((rec: { value?: Partial<AppSettings> }) => {
            if (rec.value) {
              rec.value = migrateV5ToV6Records({
                settings: rec.value,
              }).settings;
            }
          });
        await tx
          .table('versions')
          .toCollection()
          .modify((ver: { modelId?: string }) => {
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
          .modify((rec: { value?: AppSettings }) => {
            if (!rec.value) return;
            const prevCfg = rec.value.providerConfigs?.['mlx-fastapi'];
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
        if (oldestKey) store.delete(oldestKey);
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

export function createInMemoryPerformanceLog(
  maxEntries = 100,
): PerformanceLog {
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
    ? (JSON.parse(JSON.stringify(demoBank)) as BankSnapshot)
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
    ? (JSON.parse(JSON.stringify(demoApps.applications)) as Application[])
    : [];
  let versions: DocumentVersion[] = seedDemo
    ? (JSON.parse(JSON.stringify(demoApps.versions)) as DocumentVersion[])
    : [];
  let currentSettings: AppSettings = JSON.parse(
    JSON.stringify(DEFAULT_APP_SETTINGS),
  ) as AppSettings;
  let currentPreferences: UserPreferences | null = seedDemo
    ? (JSON.parse(JSON.stringify(DEFAULT_USER_PREFERENCES)) as UserPreferences)
    : null;

  return {
    bankRepo: {
      async getSnapshot(): Promise<BankSnapshot> {
        return JSON.parse(JSON.stringify(bankSnapshot)) as BankSnapshot;
      },
      async saveSnapshot(snapshot: BankSnapshot): Promise<void> {
        bankSnapshot = JSON.parse(JSON.stringify(snapshot)) as BankSnapshot;
      },
      async clear(): Promise<void> {
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
      async listApplications(): Promise<Application[]> {
        return [...applications].sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        );
      },
      async getApplication(id: string): Promise<Application | null> {
        const found = applications.find((a) => a.id === id);
        return found
          ? (JSON.parse(JSON.stringify(found)) as Application)
          : null;
      },
      async saveApplication(app: Application): Promise<void> {
        const idx = applications.findIndex((a) => a.id === app.id);
        const copy = JSON.parse(JSON.stringify(app)) as Application;
        if (idx >= 0) applications[idx] = copy;
        else applications.push(copy);
      },
      async deleteApplication(id: string): Promise<void> {
        applications = applications.filter((a) => a.id !== id);
        versions = versions.filter((v) => v.applicationId !== id);
      },
      async listVersions(applicationId: string): Promise<DocumentVersion[]> {
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
      async deleteVersion(versionId: string): Promise<void> {
        versions = versions.filter((v) => v.id !== versionId);
      },
      async saveVersion(version: DocumentVersion): Promise<void> {
        const clonedBytes =
          version.pdfBytes instanceof Uint8Array
            ? new Uint8Array(version.pdfBytes)
            : undefined;
        const normalized: DocumentVersion = {
          ...(JSON.parse(JSON.stringify(version)) as DocumentVersion),
          kind: version.kind ?? 'resume',
          pdfBytes: clonedBytes,
        };
        const idx = versions.findIndex((v) => v.id === version.id);
        if (idx >= 0) versions[idx] = normalized;
        else versions.push(normalized);
      },
      async clear(): Promise<void> {
        applications = [];
        versions = [];
      },
    },
    settingsRepo: {
      async getSettings(): Promise<AppSettings> {
        return JSON.parse(JSON.stringify(currentSettings)) as AppSettings;
      },
      async saveSettings(settings: AppSettings): Promise<void> {
        currentSettings = JSON.parse(JSON.stringify(settings)) as AppSettings;
      },
    },
    prefsRepo: {
      async getPreferences(): Promise<UserPreferences | null> {
        return currentPreferences
          ? (JSON.parse(JSON.stringify(currentPreferences)) as UserPreferences)
          : null;
      },
      async savePreferences(preferences: UserPreferences): Promise<void> {
        currentPreferences = JSON.parse(
          JSON.stringify(preferences),
        ) as UserPreferences;
      },
      async clear(): Promise<void> {
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

  const ensureSeeded = async (): Promise<void> => {
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
                l.url.includes('rostova') || l.url.includes('elena'),
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
        // Ignore cleanup failure
      }
    }
  };

  return {
    bankRepo: {
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

        const rawProfile: Profile = profiles[0] ?? {
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
        const profile: Profile = {
          ...rawProfile,
          links: isCustomizedCandidate
            ? (rawProfile.links ?? []).filter(
                (l) =>
                  !l.url.includes('rostova.systems') &&
                  !l.url.includes('elena-rostova') &&
                  !l.url.includes('erostova'),
              )
            : (rawProfile.links ?? []),
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

        return {
          profile,
          experiences: experiences.some((e) => typeof e.sortOrder === 'number')
            ? [...experiences].sort(
                (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999),
              )
            : experiences,
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
            if (stampedExperiences.length) {
              await db.experiences.bulkPut(stampedExperiences);
            }
            if (snapshot.achievements.length) {
              await db.achievements.bulkPut(snapshot.achievements);
            }
            if (snapshot.skills.length) {
              await db.skills.bulkPut(snapshot.skills);
            }
            if (snapshot.educations.length) {
              await db.educations.bulkPut(snapshot.educations);
            }
            if (snapshot.projects.length) {
              await db.projects.bulkPut(snapshot.projects);
            }
            if (snapshot.certifications.length) {
              await db.certifications.bulkPut(snapshot.certifications);
            }
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
    },

    appRepo: {
      async listApplications(): Promise<Application[]> {
        await ensureSeeded();
        return (await db.applications.toArray()).sort((a, b) =>
          b.updatedAt.localeCompare(a.updatedAt),
        );
      },
      async getApplication(id: string): Promise<Application | null> {
        await ensureSeeded();
        return (await db.applications.get(id)) ?? null;
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
        return (
          await db.versions
            .where('applicationId')
            .equals(applicationId)
            .toArray()
        )
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
    },

    settingsRepo: {
      async getSettings(): Promise<AppSettings> {
        const rec = await db.settings.get('main');
        return migrateV5ToV6Records({ settings: rec?.value }).settings;
      },
      async saveSettings(settings: AppSettings): Promise<void> {
        await db.settings.put({
          id: 'main',
          value: migrateV5ToV6Records({ settings }).settings,
        });
      },
    },

    prefsRepo: {
      async getPreferences(): Promise<UserPreferences | null> {
        await ensureSeeded();
        return (
          (await db.preferences.get('main'))?.value ?? DEFAULT_USER_PREFERENCES
        );
      },
      async savePreferences(preferences: UserPreferences): Promise<void> {
        await db.preferences.put({ id: 'main', value: preferences });
      },
      async clear(): Promise<void> {
        await db.preferences.clear();
      },
    },

    resultCache: {
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
    },

    performanceLog: {
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
        return summarizePerformanceEntries(
          await db.performanceLog.toArray(),
          limit,
        );
      },
      async clear(): Promise<void> {
        await db.performanceLog.clear();
      },
    },
  };
}
