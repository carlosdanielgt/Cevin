import { z } from 'zod';
import {
  BulletEvaluationDto,
  BulletEvaluationDtoSchema,
  CEVIN_MLX_SYSTEM_PROMPT,
  CandidateBankSubsetDto,
  CareerIntelligencePort,
  DEFAULT_MLX_1_5B_MODEL_PATH,
  EvidenceContextDto,
  ExecutiveSummaryDto,
  ExecutiveSummaryDtoSchema,
  ExperienceRecordDto,
  ExtractedExperienceDto,
  ExtractedExperienceDtoSchema,
  HallucinationAuditDto,
  HallucinationAuditDtoSchema,
  LlmChatRequest,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmProvider,
  LlmProviderDescriptor,
  LlmRuntimeStatus,
  LlmUsageMetrics,
  MlxCareerTaskName,
  ModelInfo,
  RequirementMatchDto,
  RequirementMatchDtoSchema,
  SourceRecordDto,
  buildMlxBulletEvaluationPrompt,
  buildMlxExecutiveSummaryPrompt,
  buildMlxExperienceExtractionPrompt,
  buildMlxHallucinationAuditPrompt,
  buildMlxRequirementMatchPrompt,
  extractAndRepairJsonString,
  getUntunedJsonSchemaHint,
  isFineTunedCevinMlxModel,
  resolveMlxModelPath,
} from '../../../core/application';
import { findUnverifiedSummaryNumbers } from '../../../core/domain';

export const DEFAULT_MLX_MODEL_ID = 'Qwen2.5-1.5B-Instruct-4bit';

export const INTEGRATED_MLX_MODELS: ModelInfo[] = [
  {
    id: DEFAULT_MLX_MODEL_ID,
    name: 'Cevin 1.5B',
    family: 'qwen2.5-mlx-lora',
    parameterSize: '1.5B (4-bit MLX)',
    description:
      'Default fine-tuned local model for fast everyday tailoring (~1.2 GB RAM).',
    estimatedMemoryGb: 1.15,
    isDefault: true,
    available: true,
    supportsEmbeddings: false,
  },
  {
    id: 'cevin-3b-4bit-fused',
    name: 'Cevin 3B',
    family: 'qwen2.5-mlx-lora',
    parameterSize: '3B (4-bit MLX)',
    description:
      'Higher-capacity fine-tuned local model for complex resumes (~2.7 GB RAM).',
    estimatedMemoryGb: 2.73,
    isDefault: false,
    available: true,
    supportsEmbeddings: false,
  },
];

export function resolveDefaultMlxModelPath(modelId: string): string {
  return resolveMlxModelPath(modelId);
}

function estimateMemoryGbForModel(modelId: string): number {
  const lower = modelId.trim().toLowerCase();
  if (lower.includes('1.5b')) return 1.15;
  if (lower.includes('3b') || lower.includes('cevin-3b')) return 2.73;
  return 2;
}

export const MlxFastApiConfigSchema = z.object({
  baseUrl: z.string().url().default('http://localhost:8000'),
  model: z.string().min(1).default(DEFAULT_MLX_MODEL_ID),
  modelPath: z.string().default(DEFAULT_MLX_1_5B_MODEL_PATH),
  maxSeqLength: z.number().int().min(512).max(4096).default(1024),
});

interface RawMlxModelEntry {
  id?: string;
  name?: string;
  family?: string;
  parameter_size?: string;
  description?: string;
  peak_ram_gb?: number;
  is_default?: boolean;
  available?: boolean;
}

interface RawMlxPayload {
  text?: string;
  data?: Record<string, unknown>;
  result?: Record<string, unknown>;
  usage?: {
    total_ms?: number;
    prompt_tokens?: number;
    completion_tokens?: number;
  };
}

function mapMlxModelEntry(entry: RawMlxModelEntry): ModelInfo | null {
  const id = entry.id || entry.name;
  if (!id) return null;
  const known = INTEGRATED_MLX_MODELS.find((m) => m.id === id);
  return {
    id,
    name: known?.name || entry.name || id,
    family: entry.family || known?.family || 'qwen2.5-mlx-lora',
    parameterSize:
      entry.parameter_size || known?.parameterSize || '4-bit fused MLX',
    description: known?.description || entry.description,
    estimatedMemoryGb:
      entry.peak_ram_gb ??
      known?.estimatedMemoryGb ??
      estimateMemoryGbForModel(id),
    isDefault: entry.is_default ?? known?.isDefault ?? false,
    available: entry.available ?? true,
    supportsEmbeddings: false,
  };
}

function parseJsonFromMlxPayload(payload: RawMlxPayload): unknown {
  if (payload.data && typeof payload.data === 'object') return payload.data;
  if (payload.result && typeof payload.result === 'object') return payload.result;
  const cleaned = extractAndRepairJsonString(payload.text ?? '{}');
  return JSON.parse(cleaned);
}

/**
 * Driven Adapter implementing `CareerIntelligencePort` for Apple Silicon MLX models
 * served via FastAPI (`http://localhost:8000/v1/cevin/infer`):
 * - Fine-tuned `Cevin 1.5B` and `Cevin 3B` route identically through exact `CEVIN_MLX_SYSTEM_PROMPT`
 *   + `TASK:` prompts with zero schema injections and zero few-shot turns.
 * - Un-tuned public base instruct models (e.g. `mlx-community/Qwen2.5-1.5B-Instruct-4bit`) receive
 *   explicit JSON key guidance so structured career tasks parse cleanly.
 */
export function createMlxCareerIntelligenceAdapter(
  rawConfig?: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): CareerIntelligencePort {
  const config = MlxFastApiConfigSchema.parse(rawConfig ?? {});
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const isFineTuned = isFineTunedCevinMlxModel(config.model);

  const callMlxTask = async <T>(params: {
    task: MlxCareerTaskName;
    userPrompt: string;
    temperature: number;
    maxTokens?: number;
    schema: z.ZodType<T>;
    signal?: AbortSignal;
  }): Promise<T> => {
    const systemPrompt = isFineTuned
      ? CEVIN_MLX_SYSTEM_PROMPT
      : `${CEVIN_MLX_SYSTEM_PROMPT}\n${getUntunedJsonSchemaHint(params.task)}`;
    const messages = [
      { role: 'system' as const, content: systemPrompt },
      { role: 'user' as const, content: params.userPrompt },
    ];
    const response = await fetchImpl(`${baseUrl}/v1/cevin/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        model: config.model,
        messages,
        system_prompt: systemPrompt,
        user_prompt: params.userPrompt,
        temperature: params.temperature,
        max_tokens: params.maxTokens ?? 480,
        task: params.task,
      }),
    });
    if (!response.ok) {
      throw new Error(
        `MLX FastAPI /v1/cevin/infer (${params.task}) failed with HTTP ${response.status}`,
      );
    }
    const parsed = parseJsonFromMlxPayload(
      (await response.json()) as RawMlxPayload,
    );
    return params.schema.parse(parsed);
  };

  return {
    async extractExperienceRecord(
      rawStatement: string,
      timeframe = 'Unspecified',
    ): Promise<ExtractedExperienceDto> {
      const userPrompt = buildMlxExperienceExtractionPrompt(
        rawStatement,
        timeframe,
      );
      return callMlxTask({
        task: 'experience_extraction',
        userPrompt,
        temperature: 0,
        maxTokens: 380,
        schema: ExtractedExperienceDtoSchema,
      });
    },

    async classifyRequirementMatch(
      requirement: string,
      experience: ExperienceRecordDto,
      targetRole?: string,
    ): Promise<RequirementMatchDto> {
      const userPrompt = buildMlxRequirementMatchPrompt(
        requirement,
        experience,
        targetRole,
      );
      return callMlxTask({
        task: 'experience_matching',
        userPrompt,
        temperature: 0,
        maxTokens: 320,
        schema: RequirementMatchDtoSchema,
      });
    },

    async auditBulletHallucination(
      sourceRecord: SourceRecordDto,
      generatedBullet: string,
    ): Promise<HallucinationAuditDto> {
      const userPrompt = buildMlxHallucinationAuditPrompt(
        sourceRecord,
        generatedBullet,
      );
      return callMlxTask({
        task: 'hallucination_audit',
        userPrompt,
        temperature: 0,
        maxTokens: 360,
        schema: HallucinationAuditDtoSchema,
      });
    },

    async evaluateAndRewriteBullet(
      draftBullet: string,
      evidence: EvidenceContextDto,
    ): Promise<BulletEvaluationDto> {
      const userPrompt = buildMlxBulletEvaluationPrompt(draftBullet, evidence);
      return callMlxTask({
        task: 'bullet_evaluation_and_rewrite',
        userPrompt,
        temperature: 0,
        maxTokens: 420,
        schema: BulletEvaluationDtoSchema,
      });
    },

    async synthesizeExecutiveSummary(
      jdExcerpt: string,
      candidateBank: CandidateBankSubsetDto,
    ): Promise<ExecutiveSummaryDto> {
      const userPrompt = buildMlxExecutiveSummaryPrompt(
        jdExcerpt,
        candidateBank,
      );
      const synthesis = await callMlxTask({
        task: 'executive_summary_synthesis',
        userPrompt,
        temperature: 0.2,
        maxTokens: 480,
        schema: ExecutiveSummaryDtoSchema,
      });
      if (
        findUnverifiedSummaryNumbers(
          synthesis.tailored_summary,
          candidateBank.top_achievements,
          candidateBank.profile.headline,
        ).length > 0 &&
        candidateBank.top_achievements.length > 0
      ) {
        const combinedSource: SourceRecordDto = {
          record_id: candidateBank.top_achievements.map((a) => a.id).join('+'),
          project: candidateBank.profile.headline,
          action: candidateBank.top_achievements
            .map((a) => a.action)
            .join('; '),
          technologies: candidateBank.matched_skills.map((s) => s.name),
          scale: candidateBank.top_achievements
            .map((a) => a.metric)
            .filter(Boolean)
            .join('; '),
          impact: candidateBank.top_achievements
            .map((a) => a.result)
            .join('; '),
        };
        try {
          const audit = await this.auditBulletHallucination(
            combinedSource,
            synthesis.tailored_summary,
          );
          if (
            (audit.verdict === 'unsupported' ||
              audit.verdict === 'hallucinated') &&
            audit.corrected_bullet.trim().length > 0
          ) {
            return {
              ...synthesis,
              tailored_summary: audit.corrected_bullet.trim(),
            };
          }
        } catch {
          // Return original synthesis if audit call fails
        }
      }
      return synthesis;
    },
  };
}

/**
 * Full `LlmProvider` adapter wrapping the FastAPI MLX microservice (`http://localhost:8000`)
 * and exposing `careerIntelligence: CareerIntelligencePort` plus multi-model discovery & switching.
 */
export function createMlxFastApiProvider(
  rawConfig?: Record<string, unknown>,
  fetchImpl: typeof fetch = fetch,
): LlmProvider {
  const config = MlxFastApiConfigSchema.parse(rawConfig ?? {});
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    careerIntelligence: createMlxCareerIntelligenceAdapter(config, fetchImpl),

    async listModels(): Promise<ModelInfo[]> {
      try {
        const modelsRes = await fetchImpl(`${baseUrl}/v1/models`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (modelsRes.ok) {
          const payload = (await modelsRes.json()) as {
            data?: RawMlxModelEntry[];
          };
          if (Array.isArray(payload.data) && payload.data.length > 0) {
            const mapped = payload.data
              .map(mapMlxModelEntry)
              .filter((m): m is ModelInfo => m !== null);
            if (mapped.length > 0) return mapped;
          }
        }
      } catch {
        // Fallback to /health
      }

      const response = await fetchImpl(`${baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(
          `MLX FastAPI server returned HTTP ${response.status} from /health`,
        );
      }
      const data = (await response.json()) as {
        loaded?: boolean;
        available_models?: RawMlxModelEntry[];
        model?: string;
        peak_ram_gb?: number;
      };
      if (data.loaded === false && !data.available_models?.length) return [];
      if (
        Array.isArray(data.available_models) &&
        data.available_models.length > 0
      ) {
        const mapped = data.available_models
          .map(mapMlxModelEntry)
          .filter((m): m is ModelInfo => m !== null);
        if (mapped.length > 0) return mapped;
      }
      const modelId = typeof data.model === 'string' ? data.model.trim() : '';
      if (!modelId) {
        throw new Error(
          `Endpoint at ${baseUrl}/health did not identify an MLX model server`,
        );
      }
      return [
        INTEGRATED_MLX_MODELS.find((m) => m.id === modelId) ?? {
          id: modelId,
          name: modelId,
          family: 'qwen2.5-mlx',
          parameterSize: '4-bit MLX',
          estimatedMemoryGb:
            data.peak_ram_gb ?? estimateMemoryGbForModel(modelId),
          supportsEmbeddings: false,
        },
      ];
    },

    async selectModel(modelId: string): Promise<void> {
      const target = modelId.trim();
      if (!target) return;
      const response = await fetchImpl(`${baseUrl}/v1/cevin/select-model`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: target }),
      });
      if (response.status === 404) return;
      if (!response.ok) {
        throw new Error(
          `Failed to switch MLX model to "${target}" (HTTP ${response.status})`,
        );
      }
    },

    async *chat(req: LlmChatRequest): AsyncIterable<string> {
      const response = await fetchImpl(`${baseUrl}/v1/cevin/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content: req.systemPrompt || CEVIN_MLX_SYSTEM_PROMPT,
            },
            { role: 'user', content: req.userPrompt },
          ],
          temperature: req.temperature ?? 0,
          max_tokens: 480,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `MLX FastAPI /v1/cevin/infer failed with HTTP ${response.status}`,
        );
      }
      const payload = (await response.json()) as RawMlxPayload;
      const text =
        payload.text ?? (payload.data ? JSON.stringify(payload.data) : '');
      if (text) yield text;
    },

    async chatJSON<T>(
      req: LlmChatRequest,
      schema: z.ZodType<T>,
    ): Promise<T> {
      const response = await fetchImpl(`${baseUrl}/v1/cevin/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
          model: config.model,
          messages: [
            {
              role: 'system',
              content: req.systemPrompt || CEVIN_MLX_SYSTEM_PROMPT,
            },
            { role: 'user', content: req.userPrompt },
          ],
          temperature: req.temperature ?? 0,
          max_tokens: 480,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `MLX FastAPI structured inference failed with HTTP ${response.status}`,
        );
      }
      const parsed = parseJsonFromMlxPayload(
        (await response.json()) as RawMlxPayload,
      );
      return schema.parse(parsed);
    },

    async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
      const messagesToSend =
        req.messages.length > 0
          ? req.messages
          : [
              { role: 'system' as const, content: CEVIN_MLX_SYSTEM_PROMPT },
              { role: 'user' as const, content: '' },
            ];
      const response = await fetchImpl(`${baseUrl}/v1/cevin/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
          model: config.model,
          messages: messagesToSend,
          temperature: req.options.temperature ?? 0,
          max_tokens: Math.min(512, req.options.numPredict ?? 380),
        }),
      });
      if (!response.ok) {
        throw new Error(
          `MLX FastAPI completion failed with HTTP ${response.status}`,
        );
      }
      const payload = (await response.json()) as RawMlxPayload;
      const totalMs = payload.usage?.total_ms ?? 120;
      const promptTokens = payload.usage?.prompt_tokens ?? 140;
      const completionTokens = payload.usage?.completion_tokens ?? 65;
      let textOut = payload.text ?? '';
      if (req.format !== 'json' && payload.data) {
        if (typeof payload.data.grounded_rewrite === 'string') {
          textOut = payload.data.grounded_rewrite;
        } else if (typeof payload.data.tailored_summary === 'string') {
          textOut = payload.data.tailored_summary;
        } else if (typeof payload.data.corrected_bullet === 'string') {
          textOut = payload.data.corrected_bullet;
        }
      }
      return {
        text: textOut,
        usage: {
          promptTokens,
          completionTokens,
          loadMs: 5,
          promptEvalMs: Math.max(10, Math.round(totalMs * 0.25)),
          evalMs: Math.max(20, Math.round(totalMs * 0.75)),
        },
      };
    },

    async warm(req): Promise<LlmUsageMetrics> {
      const start = Date.now();
      const response = await fetchImpl(`${baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        signal: req.signal,
      });
      if (!response.ok) {
        throw new Error(
          `MLX FastAPI health check failed with HTTP ${response.status}`,
        );
      }
      const elapsed = Math.max(5, Date.now() - start);
      return {
        promptTokens: 32,
        completionTokens: 0,
        loadMs: elapsed,
        promptEvalMs: elapsed,
        evalMs: 0,
      };
    },

    async unload(): Promise<void> {
      await fetchImpl(`${baseUrl}/v1/cevin/unload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
    },

    async getRuntimeStatus(): Promise<LlmRuntimeStatus> {
      try {
        const response = await fetchImpl(`${baseUrl}/health`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          return {
            reachable: false,
            loadedModels: [],
            activeModelLoaded: false,
            partlyOnCpu: false,
            memorySummary: 'Unable to query MLX FastAPI server',
          };
        }
        const data = (await response.json()) as {
          model?: string;
          loaded?: boolean;
          available_models?: RawMlxModelEntry[];
          peak_ram_gb?: number;
          error?: string;
        };
        if (
          !(
            typeof data.model === 'string' ||
            typeof data.loaded === 'boolean' ||
            Array.isArray(data.available_models)
          )
        ) {
          return {
            reachable: false,
            loadedModels: [],
            activeModelLoaded: false,
            partlyOnCpu: false,
            memorySummary: "Can't reach MLX FastAPI server at localhost:8000",
          };
        }
        const activeModel =
          data.model || config.model || DEFAULT_MLX_MODEL_ID;
        const loaded = data.loaded !== false;
        const peakRamGb =
          data.peak_ram_gb ?? estimateMemoryGbForModel(activeModel);
        const sizeBytes = Math.round(peakRamGb * 1024 * 1024 * 1024);
        return {
          reachable: true,
          loadedModels: loaded
            ? [
                {
                  name: activeModel,
                  sizeBytes,
                  sizeVramBytes: sizeBytes,
                  cpuPercent: 0,
                  vramPercent: 100,
                  partlyOnCpu: false,
                },
              ]
            : [],
          activeModelLoaded: loaded,
          partlyOnCpu: false,
          memorySummary: loaded
            ? `100% on Apple Metal GPU (${activeModel} · ${peakRamGb.toFixed(2)} GB)`
            : `Model not loaded (${data.error ?? `check ${resolveDefaultMlxModelPath(activeModel)}`})`,
        };
      } catch {
        return {
          reachable: false,
          loadedModels: [],
          activeModelLoaded: false,
          partlyOnCpu: false,
          memorySummary: "Can't reach MLX FastAPI server at localhost:8000",
        };
      }
    },
  };
}

export const mlxFastApiProviderDescriptor: LlmProviderDescriptor<
  z.infer<typeof MlxFastApiConfigSchema>
> = {
  id: 'mlx-fastapi',
  label: 'Cevin model (on this Mac)',
  description:
    'Runs locally on this Mac (Apple Silicon MLX). Supports Qwen2.5 1.5B Fine-Tuned (default) and Cevin 3B Fine-Tuned.',
  locality: 'local',
  capabilities: {
    streaming: true,
    jsonSchema: true,
    embeddings: false,
    reportsTimings: true,
    runtimeStatus: true,
    parallel: false,
  },
  configSchema: MlxFastApiConfigSchema,
  configFields: [
    {
      key: 'baseUrl',
      label: 'Model URL',
      type: 'text',
      placeholder: 'http://localhost:8000',
      helpText: 'Local server address (default http://localhost:8000).',
    },
    {
      key: 'model',
      label: 'Model name',
      type: 'select-model',
      placeholder: DEFAULT_MLX_MODEL_ID,
      helpText:
        'Integrated Apple Silicon MLX model (Qwen2.5-1.5B-Instruct-4bit or cevin-3b-4bit-fused).',
    },
    {
      key: 'maxSeqLength',
      label: 'Max sequence length',
      type: 'number',
      placeholder: '1024',
      helpText: 'Maximum token sequence length per request (default 1024).',
    },
  ],
  defaultConfig: {
    baseUrl: 'http://localhost:8000',
    model: DEFAULT_MLX_MODEL_ID,
    modelPath: DEFAULT_MLX_1_5B_MODEL_PATH,
    maxSeqLength: 1024,
  },
  supportedModels: INTEGRATED_MLX_MODELS,
  create: (config) => createMlxFastApiProvider(config),
};
