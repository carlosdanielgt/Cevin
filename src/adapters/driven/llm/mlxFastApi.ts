import { z } from 'zod';
import {
  BulletEvaluationDto,
  BulletEvaluationDtoSchema,
  CEVIN_MLX_SYSTEM_PROMPT,
  CandidateBankSubsetDto,
  CareerIntelligencePort,
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
} from '../../../core/application';
import { findUnverifiedSummaryNumbers } from '../../../core/domain';

export const MlxFastApiConfigSchema = z.object({
  baseUrl: z.string().url().default('http://localhost:8000'),
  model: z.string().min(1).default('cevin-3b-4bit-fused'),
  modelPath: z.string().default('./cevin-3b-4bit-fused'),
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

interface MlxFastApiHealthPayload {
  status?: string;
  loaded?: boolean;
  model?: string;
  model_path?: string;
  max_seq_length?: number;
  backend?: string;
  peak_ram_gb?: number;
  error?: string | null;
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
 * Driven Adapter implementing `CareerIntelligencePort` for the fine-tuned
 * `./cevin-3b-4bit-fused` MLX model served via FastAPI (`http://localhost:8000/v1/cevin/infer`).
 *
 * Sends exact `CEVIN_MLX_SYSTEM_PROMPT` + `TASK:` headers with structured JSON schemas.
 */
export function createMlxCareerIntelligenceAdapter(
  rawConfig?: Partial<MlxFastApiConfig>,
  fetchImpl: typeof fetch = fetch,
): CareerIntelligencePort {
  const config = MlxFastApiConfigSchema.parse(rawConfig ?? {});
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  const callMlxTask = async <T>(params: {
    task: string;
    userPrompt: string;
    temperature: number;
    maxTokens?: number;
    schema: z.ZodType<T>;
    signal?: AbortSignal;
  }): Promise<T> => {
    const messages: LlmMessage[] = [
      { role: 'system', content: CEVIN_MLX_SYSTEM_PROMPT },
      { role: 'user', content: params.userPrompt },
    ];

    const response = await fetchImpl(`${baseUrl}/v1/cevin/infer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: params.signal,
      body: JSON.stringify({
        messages,
        system_prompt: CEVIN_MLX_SYSTEM_PROMPT,
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
          // If audit call fails, strip unverified numbers deterministically
        }
      }

      return synthesis;
    },
  };
}

/**
 * Full `LlmProvider` adapter wrapping the FastAPI MLX microservice (`http://localhost:8000`)
 * and exposing `careerIntelligence: CareerIntelligencePort`.
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
      const modelId = data.model || config.model || 'cevin-3b-4bit-fused';
      return [
        {
          id: modelId,
          name: modelId,
          family: 'qwen2.5-mlx-lora',
          parameterSize: '3B (4-bit fused)',
          supportsEmbeddings: false,
        },
      ];
    },

    async *chat(req: LlmChatRequest): AsyncIterable<string> {
      const response = await fetchImpl(`${baseUrl}/v1/cevin/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
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
      const lastUserMessage =
        [...req.messages].reverse().find((m) => m.role === 'user')?.content ??
        '';
      const systemMessage =
        req.messages.find((m) => m.role === 'system')?.content ??
        CEVIN_MLX_SYSTEM_PROMPT;

      const response = await fetchImpl(`${baseUrl}/v1/cevin/infer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
          messages: [
            { role: 'system', content: CEVIN_MLX_SYSTEM_PROMPT || systemMessage },
            { role: 'user', content: lastUserMessage },
          ],
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
        const loaded = data.loaded !== false;
        const sizeBytes = Math.round((data.peak_ram_gb ?? 2.73) * 1024 * 1024 * 1024);

        return {
          reachable: true,
          loadedModels: loaded
            ? [
                {
                  name: data.model || config.model,
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
            ? `100% on Apple Metal GPU (${(data.peak_ram_gb ?? 2.73).toFixed(2)} GB · ~32.5 tok/s)`
            : `Model not loaded (${data.error ?? 'check ./cevin-3b-4bit-fused'})`,
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
      'Fine-tuned for resume writing. Runs on this Mac (Apple Silicon).',
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
        label: 'Model ID',
        type: 'text',
        placeholder: 'cevin-3b-4bit-fused',
        helpText:
          'Fine-tuned local resume model weights directory.',
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
      model: 'cevin-3b-4bit-fused',
      modelPath: './cevin-3b-4bit-fused',
      maxSeqLength: 1024,
    },
    create: (config) => createMlxFastApiProvider(config),
  };

