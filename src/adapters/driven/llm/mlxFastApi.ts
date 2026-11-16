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
  LlmMessage,
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
  resolveMlxModelPath,
} from '../../../core/application';
import { findUnverifiedSummaryNumbers } from '../../../core/domain';

export const DEFAULT_MLX_MODEL_ID = 'Qwen2.5-1.5B-Instruct-4bit';
export const LEGACY_CEVIN_3B_MODEL_ID = 'cevin-3b-4bit-fused';

export const INTEGRATED_MLX_MODELS: ModelInfo[] = [
  {
    id: DEFAULT_MLX_MODEL_ID,
    name: 'Qwen2.5 1.5B Fine-Tuned (4-bit)',
    family: 'qwen2.5-mlx-lora',
    parameterSize: '1.5B (4-bit fused)',
    description:
      'Default fine-tuned Rank-32 LoRA model for fast career reasoning (~1.2 GB unified memory).',
    estimatedMemoryGb: 1.15,
    isDefault: true,
    available: true,
    supportsEmbeddings: false,
  },
  {
    id: LEGACY_CEVIN_3B_MODEL_ID,
    name: 'Cevin 3B Fine-Tuned (4-bit)',
    family: 'qwen2.5-mlx-lora',
    parameterSize: '3B (4-bit fused)',
    description:
      'Fine-tuned Qwen2.5-3B LoRA model trained on structured career reasoning (~2.7 GB unified memory).',
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
  return 2.0;
}

export const MlxFastApiConfigSchema = z.object({
  baseUrl: z.string().url().default('http://localhost:8000'),
  model: z.string().min(1).default(DEFAULT_MLX_MODEL_ID),
  modelPath: z.string().default(DEFAULT_MLX_1_5B_MODEL_PATH),
  maxSeqLength: z.coerce.number().int().min(512).max(4096).default(1024),
});

export type MlxFastApiConfig = z.infer<typeof MlxFastApiConfigSchema>;

interface MlxFastApiInferPayload {
  text?: string;
  data?: Record<string, unknown> | null;
  result?: Record<string, unknown> | null;
  model?: string;
  task?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_ms?: number;
  };
}

interface MlxFastApiModelEntry {
  id?: string;
  name?: string;
  family?: string;
  parameter_size?: string;
  peak_ram_gb?: number;
  is_default?: boolean;
  description?: string;
  available?: boolean;
}

interface MlxFastApiModelsPayload {
  data?: MlxFastApiModelEntry[];
  active_model?: string;
}

interface MlxFastApiHealthPayload {
  status?: string;
  loaded?: boolean;
  model?: string;
  model_path?: string;
  max_seq_length?: number;
  backend?: string;
  peak_ram_gb?: number;
  available_models?: MlxFastApiModelEntry[];
  error?: string | null;
}

function mapMlxModelEntry(entry: MlxFastApiModelEntry): ModelInfo | null {
  const id = entry.id || entry.name;
  if (!id) return null;
  const known = INTEGRATED_MLX_MODELS.find((m) => m.id === id);
  return {
    id,
    name: entry.name || known?.name || id,
    family: entry.family || known?.family || 'qwen2.5-mlx-lora',
    parameterSize:
      entry.parameter_size || known?.parameterSize || '4-bit fused MLX',
    description: entry.description || known?.description,
    estimatedMemoryGb:
      entry.peak_ram_gb ??
      known?.estimatedMemoryGb ??
      estimateMemoryGbForModel(id),
    isDefault: entry.is_default ?? known?.isDefault ?? false,
    available: entry.available ?? true,
    supportsEmbeddings: false,
  };
}

function parseJsonFromMlxPayload(payload: MlxFastApiInferPayload): unknown {
  if (payload.data && typeof payload.data === 'object') {
    return payload.data;
  }
  if (payload.result && typeof payload.result === 'object') {
    return payload.result;
  }
  const rawText = payload.text ?? '{}';
  const cleaned = extractAndRepairJsonString(rawText);
  return JSON.parse(cleaned);
}

/**
 * Driven Adapter implementing `CareerIntelligencePort` for both fine-tuned Apple Silicon MLX models
 * (`Qwen2.5-1.5B-Instruct-4bit` [Rank-32 LoRA, default] and `cevin-3b-4bit-fused`) served via FastAPI (`http://localhost:8000/v1/cevin/infer`).
 *
 * Both models were trained on the exact same dataset with `mask_prompt: true`, so they route through
 * identical prompt formatting: exact `CEVIN_MLX_SYSTEM_PROMPT` + `TASK:` Chain-of-Thought prompts with
 * zero schema injections and zero few-shot turns. Only `model: config.model` varies at runtime.
 */
export function createMlxCareerIntelligenceAdapter(
  rawConfig?: Partial<MlxFastApiConfig>,
  fetchImpl: typeof fetch = fetch,
): CareerIntelligencePort {
  const config = MlxFastApiConfigSchema.parse(rawConfig ?? {});
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  const callMlxTask = async <T>(params: {
    task: MlxCareerTaskName;
    userPrompt: string;
    temperature: number;
    maxTokens?: number;
    schema: z.ZodType<T>;
    signal?: AbortSignal;
  }): Promise<T> => {
    const systemPrompt = CEVIN_MLX_SYSTEM_PROMPT;
    const messages: LlmMessage[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: params.userPrompt },
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

    const payload = (await response.json()) as MlxFastApiInferPayload;
    const parsed = parseJsonFromMlxPayload(payload);
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
        temperature: 0.0,
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
        temperature: 0.0,
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
        temperature: 0.0,
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
        temperature: 0.0,
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

      // Step 1: Creative synthesis at temp = 0.2
      const synthesis = await callMlxTask({
        task: 'executive_summary_synthesis',
        userPrompt,
        temperature: 0.2,
        maxTokens: 480,
        schema: ExecutiveSummaryDtoSchema,
      });

      // Step 2: Controlled Creativity Sandwich — verify every number in tailored_summary
      // appears in top_achievements; if any unverified number is detected, run Task 3
      // hallucination_audit at temp = 0.0.
      const unverifiedNums = findUnverifiedSummaryNumbers(
        synthesis.tailored_summary,
        candidateBank.top_achievements,
        candidateBank.profile.headline,
      );

      if (unverifiedNums.length > 0 && candidateBank.top_achievements.length > 0) {
        const combinedSource: SourceRecordDto = {
          record_id: candidateBank.top_achievements
            .map((a) => a.id)
            .join('+'),
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
          // If audit call fails, callers fall back deterministically
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
  rawConfig?: Partial<MlxFastApiConfig>,
  fetchImpl: typeof fetch = fetch,
): LlmProvider {
  const config = MlxFastApiConfigSchema.parse(rawConfig ?? {});
  const baseUrl = config.baseUrl.replace(/\/+$/, '');
  const careerIntelligence = createMlxCareerIntelligenceAdapter(
    config,
    fetchImpl,
  );

  return {
    careerIntelligence,

    async listModels(): Promise<ModelInfo[]> {
      // Prefer /v1/models when supported by mlx_server.py; fall back cleanly to /health
      try {
        const modelsRes = await fetchImpl(`${baseUrl}/v1/models`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (modelsRes.ok) {
          const payload = (await modelsRes.json()) as MlxFastApiModelsPayload;
          if (Array.isArray(payload.data) && payload.data.length > 0) {
            const mapped = payload.data
              .map(mapMlxModelEntry)
              .filter((m): m is ModelInfo => m !== null);
            if (mapped.length > 0) {
              return mapped;
            }
          }
        }
      } catch {
        // Fall through to /health probe so network errors surface consistently
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
      const data = (await response.json()) as MlxFastApiHealthPayload;
      if (data.loaded === false && !data.available_models?.length) {
        return [];
      }
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
      const known = INTEGRATED_MLX_MODELS.find((m) => m.id === modelId);
      return [
        known ?? {
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
      if (response.status === 404) {
        // Minimal/legacy server without explicit select-model endpoint still receives `model` per inference call
        return;
      }
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
          temperature: req.temperature ?? 0.0,
          max_tokens: 480,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `MLX FastAPI /v1/cevin/infer failed with HTTP ${response.status}`,
        );
      }
      const payload = (await response.json()) as MlxFastApiInferPayload;
      const text =
        payload.text ??
        (payload.data ? JSON.stringify(payload.data) : '');
      if (text) {
        yield text;
      }
    },

    async chatJSON<T>(req: LlmChatRequest, schema: z.ZodType<T>): Promise<T> {
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
          temperature: req.temperature ?? 0.0,
          max_tokens: 480,
        }),
      });

      if (!response.ok) {
        throw new Error(
          `MLX FastAPI structured inference failed with HTTP ${response.status}`,
        );
      }

      const payload = (await response.json()) as MlxFastApiInferPayload;
      const parsed = parseJsonFromMlxPayload(payload);
      return schema.parse(parsed);
    },

    async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
      const messagesToSend: LlmMessage[] =
        req.messages.length > 0
          ? req.messages
          : [
              { role: 'system', content: CEVIN_MLX_SYSTEM_PROMPT },
              { role: 'user', content: '' },
            ];

      const response = await fetchImpl(`${baseUrl}/v1/cevin/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
          model: config.model,
          messages: messagesToSend,
          temperature: req.options.temperature ?? 0.0,
          max_tokens: Math.min(512, req.options.numPredict ?? 380),
        }),
      });

      if (!response.ok) {
        throw new Error(
          `MLX FastAPI completion failed with HTTP ${response.status}`,
        );
      }

      const payload = (await response.json()) as MlxFastApiInferPayload;
      const totalMs = payload.usage?.total_ms ?? 120;
      const promptTokens = payload.usage?.prompt_tokens ?? 140;
      const completionTokens = payload.usage?.completion_tokens ?? 65;

      // If the response is a CoT JSON object from bullet_evaluation_and_rewrite or executive_summary_synthesis,
      // extract grounded_rewrite or tailored_summary when caller expects prose text
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

    async warm(req: {
      prefixMessages: LlmMessage[];
      maxSeqLength: number;
      signal?: AbortSignal;
    }): Promise<LlmUsageMetrics> {
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
        const data = (await response.json()) as MlxFastApiHealthPayload;
        const looksLikeMlx =
          typeof data.model === 'string' ||
          typeof data.loaded === 'boolean' ||
          Array.isArray(data.available_models);
        if (!looksLikeMlx) {
          return {
            reachable: false,
            loadedModels: [],
            activeModelLoaded: false,
            partlyOnCpu: false,
            memorySummary: "Can't reach MLX FastAPI server at localhost:8000",
          };
        }
        const activeModel = data.model || config.model || DEFAULT_MLX_MODEL_ID;
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

export const mlxFastApiProviderDescriptor: LlmProviderDescriptor<MlxFastApiConfig> =
  {
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
        helpText:
          'Local server address (default http://localhost:8000).',
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
        helpText:
          'Maximum token sequence length per request (default 1024).',
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
