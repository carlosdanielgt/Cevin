import { z } from 'zod';
import {
  LlmChatRequest,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmProvider,
  LlmProviderDescriptor,
  LlmRuntimeModelStatus,
  LlmRuntimeStatus,
  LlmUsageMetrics,
  ModelInfo,
} from '../../../core/application';

export const OllamaConfigSchema = z.object({
  baseUrl: z.string().url().default('http://localhost:11434'),
  model: z.string().min(1).default('llama3.1:8b'),
  embeddingModel: z.string().optional().default(''),
  numCtx: z.coerce.number().int().min(2048).max(131072).default(4096),
});

export type OllamaConfig = z.infer<typeof OllamaConfigSchema>;

interface OllamaChatResponsePayload {
  message?: { content?: string };
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

function nsToMs(ns?: number): number | undefined {
  if (typeof ns !== 'number' || Number.isNaN(ns)) return undefined;
  return Math.max(1, Math.round(ns / 1_000_000));
}

function extractTimings(payload: OllamaChatResponsePayload): LlmUsageMetrics {
  return {
    promptTokens: payload.prompt_eval_count,
    completionTokens: payload.eval_count,
    loadMs: nsToMs(payload.load_duration),
    promptEvalMs: nsToMs(payload.prompt_eval_duration),
    evalMs: nsToMs(payload.eval_duration),
  };
}

export function createOllamaProvider(
  rawConfig: OllamaConfig,
  fetchImpl: typeof fetch = fetch,
): LlmProvider {
  const config = OllamaConfigSchema.parse(rawConfig);
  const baseUrl = config.baseUrl.replace(/\/+$/, '');

  return {
    async listModels(): Promise<ModelInfo[]> {
      const response = await fetchImpl(`${baseUrl}/api/tags`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) {
        throw new Error(
          `Ollama server returned HTTP ${response.status} from /api/tags`,
        );
      }
      const data = (await response.json()) as {
        models?: Array<{
          name: string;
          model?: string;
          details?: { family?: string; parameter_size?: string };
        }>;
      };
      return (data.models ?? []).map((m) => ({
        id: m.name,
        name: m.name,
        family: m.details?.family,
        parameterSize: m.details?.parameter_size,
        supportsEmbeddings:
          m.name.includes('embed') ||
          m.name.includes('nomic') ||
          m.name.includes('bge'),
      }));
    },

    async *chat(req: LlmChatRequest): AsyncIterable<string> {
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
          model: config.model,
          stream: true,
          keep_alive: '30m',
          options: {
            num_ctx: config.numCtx,
            temperature: req.temperature ?? 0.4,
            top_p: req.topP ?? 0.9,
          },
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ],
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`Ollama /api/chat failed with HTTP ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (req.signal?.aborted) {
          await reader.cancel();
          throw new Error('Request aborted');
        }
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as {
            message?: { content?: string };
          };
          if (parsed.message?.content) {
            yield parsed.message.content;
          }
        }
      }
    },

    async chatJSON<T>(req: LlmChatRequest, schema: z.ZodType<T>): Promise<T> {
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
          model: config.model,
          stream: false,
          format: 'json',
          keep_alive: '30m',
          options: {
            num_ctx: config.numCtx,
            temperature: req.temperature ?? 0,
            top_p: req.topP ?? 0.9,
          },
          messages: [
            { role: 'system', content: req.systemPrompt },
            { role: 'user', content: req.userPrompt },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama structured chat failed with HTTP ${response.status}`,
        );
      }

      const payload = (await response.json()) as OllamaChatResponsePayload;
      const rawJson = payload.message?.content ?? '{}';
      const parsed = JSON.parse(rawJson);
      return schema.parse(parsed);
    },

    async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
      const body: Record<string, unknown> = {
        model: config.model,
        stream: false,
        keep_alive: req.options.keepAlive ?? '30m',
        options: {
          num_ctx: req.options.numCtx,
          temperature: req.options.temperature,
          top_p: req.options.topP,
          ...(typeof req.options.seed === 'number'
            ? { seed: req.options.seed }
            : {}),
          ...(typeof req.options.numPredict === 'number'
            ? { num_predict: req.options.numPredict }
            : {}),
          ...(req.options.stop && req.options.stop.length > 0
            ? { stop: req.options.stop }
            : {}),
        },
        messages: req.messages,
      };
      if (req.format === 'json') {
        body.format = 'json';
      }

      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(
          `Ollama /api/chat completion failed with HTTP ${response.status}`,
        );
      }

      const payload = (await response.json()) as OllamaChatResponsePayload;
      return {
        text: payload.message?.content ?? '',
        usage: extractTimings(payload),
      };
    },

    async warm(req: {
      prefixMessages: LlmMessage[];
      numCtx: number;
      keepAlive: string;
      signal?: AbortSignal;
    }): Promise<LlmUsageMetrics> {
      const response = await fetchImpl(`${baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: req.signal,
        body: JSON.stringify({
          model: config.model,
          stream: false,
          keep_alive: req.keepAlive,
          options: {
            num_ctx: req.numCtx,
            num_predict: 0,
            temperature: 0,
          },
          messages: req.prefixMessages,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama warm-up failed with HTTP ${response.status}`);
      }

      const payload = (await response.json()) as OllamaChatResponsePayload;
      return extractTimings(payload);
    },

    async getRuntimeStatus(): Promise<LlmRuntimeStatus> {
      try {
        const response = await fetchImpl(`${baseUrl}/api/ps`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });
        if (!response.ok) {
          return {
            reachable: false,
            loadedModels: [],
            activeModelLoaded: false,
            partlyOnCpu: false,
            memorySummary: 'Unable to query running models',
          };
        }
        const data = (await response.json()) as {
          models?: Array<{
            name: string;
            size?: number;
            size_vram?: number;
            expires_at?: string;
          }>;
        };

        const loadedModels: LlmRuntimeModelStatus[] = (data.models ?? []).map(
          (m) => {
            const sizeBytes = m.size ?? 0;
            const sizeVramBytes = m.size_vram ?? sizeBytes;
            const vramRatio =
              sizeBytes > 0 ? Math.min(1, sizeVramBytes / sizeBytes) : 1;
            const vramPercent = Math.round(vramRatio * 100);
            const cpuPercent = Math.max(0, 100 - vramPercent);
            const partlyOnCpu = sizeBytes > 0 && vramPercent < 95;
            return {
              name: m.name,
              sizeBytes,
              sizeVramBytes,
              cpuPercent,
              vramPercent,
              partlyOnCpu,
              expiresAt: m.expires_at,
            };
          },
        );

        const activeEntry =
          loadedModels.find(
            (m) => m.name.toLowerCase() === config.model.toLowerCase(),
          ) ?? loadedModels[0];

        if (!activeEntry) {
          return {
            reachable: true,
            loadedModels: [],
            activeModelLoaded: false,
            partlyOnCpu: false,
            memorySummary: 'Idle (0 GB in memory)',
          };
        }

        const gb = (activeEntry.sizeBytes / (1024 * 1024 * 1024)).toFixed(1);
        const memorySummary = activeEntry.partlyOnCpu
          ? `Partly on CPU (${activeEntry.vramPercent}% GPU / ${activeEntry.cpuPercent}% CPU · ${gb} GB)`
          : `100% on GPU (${gb} GB)`;

        return {
          reachable: true,
          loadedModels,
          activeModelLoaded: true,
          partlyOnCpu: activeEntry.partlyOnCpu,
          memorySummary,
        };
      } catch {
        return {
          reachable: false,
          loadedModels: [],
          activeModelLoaded: false,
          partlyOnCpu: false,
          memorySummary: "Can't reach Ollama",
        };
      }
    },

    async unload(modelOverride?: string): Promise<void> {
      const targetModel = modelOverride || config.model;
      const response = await fetchImpl(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: targetModel,
          keep_alive: 0,
        }),
      });
      if (!response.ok) {
        throw new Error(
          `Ollama unload failed with HTTP ${response.status} for ${targetModel}`,
        );
      }
    },

    async embed(texts: string[], modelOverride?: string): Promise<number[][]> {
      const embedModel =
        modelOverride || config.embeddingModel || 'nomic-embed-text';
      const response = await fetchImpl(`${baseUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: embedModel,
          input: texts,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama /api/embed failed with HTTP ${response.status}`);
      }
      const data = (await response.json()) as { embeddings?: number[][] };
      return data.embeddings ?? [];
    },
  };
}

/**
 * Ollama LLM provider descriptor registered in the LlmProviderCatalog.
 */
export const ollamaProviderDescriptor: LlmProviderDescriptor<OllamaConfig> = {
  id: 'ollama',
  label: 'Ollama (on this computer)',
  description:
    'Runs locally on this computer using Ollama. Tuned for llama3.1:8b on Apple Silicon.',
  locality: 'local',
  capabilities: {
    streaming: true,
    jsonSchema: true,
    embeddings: true,
    reportsTimings: true,
    keepAlive: true,
    runtimeStatus: true,
    parallel: true,
  },
  configSchema: OllamaConfigSchema,
  configFields: [
    {
      key: 'baseUrl',
      label: 'Ollama URL',
      type: 'text',
      placeholder: 'http://localhost:11434',
      helpText:
        'Default is http://localhost:11434. Your browser connects directly to this address.',
    },
    {
      key: 'model',
      label: 'Model',
      type: 'select-model',
      placeholder: 'llama3.1:8b',
      helpText:
        'Cevin is tuned for llama3.1:8b. Click Test connection to list installed models.',
    },
    {
      key: 'numCtx',
      label: 'Context window per slot',
      type: 'number',
      placeholder: '4096',
      helpText:
        'Kept constant at 4096 tokens per slot so Ollama never reallocates memory mid-session.',
    },
  ],
  defaultConfig: {
    baseUrl: 'http://localhost:11434',
    model: 'llama3.1:8b',
    embeddingModel: '',
    numCtx: 4096,
  },
  create: (config) => createOllamaProvider(config),
};
