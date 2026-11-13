import { z } from 'zod';
import {
  Application,
  BankSnapshot,
  DocumentKind,
  DocumentVersion,
  ExportableDocument,
  PositionedText,
  RawDocument,
  TemplateId,
  UserPreferences,
  VoiceLevel,
} from '../../../domain';

/**
 * Metadata describing a single configuration field on an LLM provider descriptor,
 * used by the driving web UI to generate the Settings form dynamically.
 */
export interface LlmConfigFieldMeta {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select-model' | 'select-embed-model' | 'password';
  helpText: string;
  placeholder?: string;
  secret?: boolean;
}

export interface ModelInfo {
  id: string;
  name: string;
  family?: string;
  parameterSize?: string;
  supportsEmbeddings?: boolean;
}

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmRequestOptions {
  maxSeqLength: number;
  temperature: number;
  topP: number;
  seed?: number;
  numPredict?: number;
  stop?: string[];
}

export interface LlmUsageMetrics {
  promptTokens?: number;
  completionTokens?: number;
  loadMs?: number;
  promptEvalMs?: number;
  evalMs?: number;
}

export interface LlmCompletionRequest {
  messages: LlmMessage[];
  options: LlmRequestOptions;
  format?: 'json';
  signal?: AbortSignal;
}

export interface LlmCompletionResponse {
  text: string;
  usage: LlmUsageMetrics;
}

export interface LlmRuntimeModelStatus {
  name: string;
  sizeBytes: number;
  sizeVramBytes: number;
  cpuPercent: number;
  vramPercent: number;
  partlyOnCpu: boolean;
  expiresAt?: string;
}

export interface LlmRuntimeStatus {
  reachable: boolean;
  loadedModels: LlmRuntimeModelStatus[];
  activeModelLoaded: boolean;
  partlyOnCpu: boolean;
  memorySummary: string;
}

export interface LlmChatRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  topP?: number;
  signal?: AbortSignal;
}

/**
 * Outbound port for talking to an LLM provider (local MLX FastAPI, mock, or future remote adapters).
 */
export interface LlmProvider {
  /** Lists models available on the configured endpoint. */
  listModels(): Promise<ModelInfo[]>;
  /** Streams response tokens; respects `req.signal` for cancellation. */
  chat(req: LlmChatRequest): AsyncIterable<string>;
  /** Generates structured JSON conforming to the given Zod schema. */
  chatJSON<T>(req: LlmChatRequest, schema: z.ZodType<T>): Promise<T>;
  /** Optional vector embeddings for semantic Bank-to-JD matching. */
  embed?(texts: string[], model?: string): Promise<number[][]>;
  /**
   * High-efficiency harness completion call with message-array prefix caching,
   * constant `maxSeqLength`, token caps, stop sequences, and timing metrics.
   */
  complete?(req: LlmCompletionRequest): Promise<LlmCompletionResponse>;
  /**
   * Warms the model weights and static system/few-shot prefix.
   */
  warm?(req: {
    prefixMessages: LlmMessage[];
    maxSeqLength: number;
    signal?: AbortSignal;
  }): Promise<LlmUsageMetrics>;
  /**
   * Queries currently loaded models and GPU memory status.
   */
  getRuntimeStatus?(): Promise<LlmRuntimeStatus>;
  /**
   * Releases model weights from memory immediately.
   */
  unload?(model?: string): Promise<void>;
  /**
   * Optional dedicated hexagonal CareerIntelligencePort implementation (Task 1–5 contracts).
   */
  careerIntelligence?: import('./careerIntelligence').CareerIntelligencePort;
}

/**
 * Descriptor registered in the LlmProviderCatalog.
 * Adding a new LLM provider requires one new adapter folder and one registry line.
 */
export interface LlmProviderDescriptor<TConfig = Record<string, unknown>> {
  id: string;
  label: string;
  description: string;
  locality: 'local' | 'remote';
  capabilities: {
    streaming: boolean;
    jsonSchema: boolean;
    embeddings: boolean;
    reportsTimings?: boolean;
    runtimeStatus?: boolean;
    parallel?: boolean;
  };
  configSchema: z.ZodType<TConfig>;
  configFields: LlmConfigFieldMeta[];
  defaultConfig: TConfig;
  create(config: TConfig): LlmProvider;
}

/**
 * Tuned parameter profile for a local model family (e.g., `cevin-3b-4bit-fused` on Apple Silicon).
 */
export interface ModelProfile {
  id: string;
  label: string;
  isRecommendedDefault: boolean;
  matches(modelName: string): boolean;
  /** Maximum sequence length supported per call. */
  maxSeqLength: number;
  parallelRecommended: number;
  temperatures: {
    classify: number;
    extract: number;
    bullet: number;
    summary: number;
    letter: number;
  };
  topP: number;
  tokenCaps: {
    bullet: number;
    summary: number;
    letterBlock: number;
    briefRefine: number;
    importClassify: number;
    jobFact?: number;
  };
  stop: string[];
  fewShotStyle: 'chat-turns' | 'inline';
  serverEnv: string[];
  /**
   * When true (e.g. for `cevin-3b-4bit-fused` trained with `mask_prompt: true`),
   * bypasses destructive raw prompt-string truncation in the gateway so structured JSON is never sliced.
   */
  disableRawPromptTrimming?: boolean;
}

export interface ModelProfileCatalog {
  list(): ModelProfile[];
  getById(id: string): ModelProfile | undefined;
  resolveForModel(modelName: string): ModelProfile;
}

export * from './careerIntelligence';

/**
 * Persistent LRU cache entry for deterministic LLM task outputs.
 */
export interface CachedTaskResult {
  key: string;
  taskId: string;
  modelName: string;
  profileId: string;
  promptVersion: string;
  voiceId: string;
  text: string;
  createdAt: string;
  lastAccessedAt: string;
}

export interface ResultCache {
  get(key: string): Promise<CachedTaskResult | null>;
  set(entry: CachedTaskResult): Promise<void>;
  clear(): Promise<void>;
  count(): Promise<number>;
}

export interface PerformanceCallEntry {
  id: string;
  taskId: string;
  modelName: string;
  cached: boolean;
  repaired: boolean;
  fellBackToBaseline: boolean;
  durationMs: number;
  loadMs?: number;
  promptEvalMs?: number;
  evalMs?: number;
  promptTokens?: number;
  completionTokens?: number;
  readingTokPerSec?: number;
  writingTokPerSec?: number;
  createdAt: string;
}

export interface PerformanceSummary {
  readingSpeedTokPerSec: number;
  writingSpeedTokPerSec: number;
  totalCalls: number;
  cacheHits: number;
  repairs: number;
  fallbacks: number;
  recentCalls: PerformanceCallEntry[];
}

export interface PerformanceProfile {
  calibratedAt: string;
  modelName: string;
  coldLoadMs: number;
  readingSpeedTokPerSec: number;
  writingSpeedTokPerSec: number;
  parallelGainRatio: number;
  recommendedParallelSlots: number;
  jsonValid: boolean;
  serverParallelWarning: boolean;
}

export interface PerformanceLog {
  recordCall(entry: PerformanceCallEntry): Promise<void>;
  getSummary(limit?: number): Promise<PerformanceSummary>;
  clear(): Promise<void>;
}

/**
 * Outbound port for file ingestion.
 * An importer only turns a File/Blob into a RawDocument; LLM structuring is a shared use case.
 */
export interface ResumeImporter {
  id: string;
  label: string;
  accepts: {
    extensions: string[];
    mimeTypes: string[];
  };
  parse(file: File): Promise<RawDocument>;
}

export interface ExportOptions {
  templateId: TemplateId;
  pageSize?: 'letter' | 'a4';
}

export interface RenderedPreviewArtifact {
  bytes: Uint8Array;
  pageCount: number;
  positionedText: PositionedText[];
  contentHash: string;
}

/**
 * Outbound port for document export (Resume and Cover Letter).
 * Exporters consume ONLY the format-agnostic ExportableDocument view model.
 */
export interface DocumentExporter {
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
  export(doc: ExportableDocument, options: ExportOptions): Promise<Blob>;
  /**
   * Renders a preview artifact with exact PDF bytes, page count, and positioned text spans
   * in a single pass so Studio preview and exported PDF are byte-identical.
   */
  renderPreview?(
    doc: ExportableDocument,
    options: ExportOptions,
  ): Promise<RenderedPreviewArtifact>;
  /**
   * Optional round-trip text extractor (implemented by PDF exporter via pdfjs)
   * so the ATS engine can inspect what an actual parser extracts from the rendered artifact.
   */
  extractTextFromBlob?(blob: Blob): Promise<string>;
  /**
   * Optional positioned-text extractor returning `{ text, page, x, y, fontSize, bold }[]`
   * so the Recruiter Appeal engine can inspect what lands in the top third of page 1.
   */
  extractPositionedTextFromBlob?(blob: Blob): Promise<PositionedText[]>;
}


export type ResumeExporter = DocumentExporter;

/**
 * Visual template descriptor for single-column ATS-safe layouts.
 */
export interface ResumeTemplate {
  id: TemplateId;
  label: string;
  description: string;
  fontFamily: 'serif' | 'sans' | 'mono-accent';
  density: 'comfortable' | 'balanced' | 'compact';
}

/**
 * Outbound port for persisting the user's central Experience & Skill Bank.
 */
export interface BankRepository {
  getSnapshot(): Promise<BankSnapshot>;
  saveSnapshot(snapshot: BankSnapshot): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Outbound port for persisting job applications and immutable document versions.
 */
export interface ApplicationRepository {
  listApplications(): Promise<Application[]>;
  getApplication(id: string): Promise<Application | null>;
  saveApplication(application: Application): Promise<void>;
  deleteApplication(id: string): Promise<void>;
  listVersions(applicationId: string): Promise<DocumentVersion[]>;
  deleteVersion?(versionId: string): Promise<void>;
  saveVersion(version: DocumentVersion): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Outbound port for persisting the user's practical fit preferences (Settings > My preferences).
 * Stored locally in IndexedDB and never transmitted to any AI.
 */
export interface PreferencesRepository {
  getPreferences(): Promise<UserPreferences | null>;
  savePreferences(preferences: UserPreferences): Promise<void>;
  clear(): Promise<void>;
}

export interface AppSettings {
  activeProviderId: string;
  providerConfigs: Record<string, Record<string, unknown>>;
  theme: 'light' | 'dark' | 'system';
  defaultTemplateId: TemplateId;
  defaultVoice?: VoiceLevel;
  pageSize?: 'letter' | 'a4';
  hasCompletedOnboarding: boolean;
  gettingStartedDismissed?: boolean;
  sidebarCollapsed?: boolean;
  applicationViewMode?: 'list' | 'board';
  applicationSortBy?: 'updated' | 'match' | 'fit' | 'company';
  hidePracticalConflicts?: boolean;
  remoteProviderConfirmed: Record<string, boolean>;
  smarterMatchingEnabled?: boolean;
  parallelSlots?: number;
  performanceProfile?: PerformanceProfile;
}

/**
 * Outbound port for persisting user preferences and LLM provider configuration.
 */
export interface SettingsRepository {
  getSettings(): Promise<AppSettings>;
  saveSettings(settings: AppSettings): Promise<void>;
}

/** Outbound port for deterministic time in tests. */
export interface Clock {
  nowIso(): string;
}

/** Outbound port for deterministic IDs in tests. */
export interface IdGenerator {
  nextId(prefix?: string): string;
}

/** Outbound catalog ports exposing registered extension points to the core. */
export interface ImporterCatalog {
  list(): ResumeImporter[];
  getById(id: string): ResumeImporter | undefined;
  findByFile(fileName: string, mimeType: string): ResumeImporter | undefined;
}

export interface ExporterCatalog {
  list(): DocumentExporter[];
  getById(id: string): DocumentExporter | undefined;
}

export interface TemplateCatalog {
  list(): ResumeTemplate[];
  getById(id: TemplateId): ResumeTemplate;
}

export interface LlmProviderCatalog {
  list(): LlmProviderDescriptor[];
  getById(id: string): LlmProviderDescriptor | undefined;
}
