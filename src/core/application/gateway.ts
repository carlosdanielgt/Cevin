import {
  VoiceLevel,
  buildCacheKey,
  defaultTokenEstimator,
  deriveSeed,
} from '../domain';
import {
  Clock,
  IdGenerator,
  LlmMessage,
  LlmProvider,
  ModelProfile,
  PerformanceLog,
  ResultCache,
} from './ports/outbound';
import { LlmTaskDefinition, rewriteBulletTask } from './tasks';

export type TaskPriority = 'interactive' | 'visible' | 'background';

const PRIORITY_RANK: Record<TaskPriority, number> = {
  interactive: 0,
  visible: 1,
  background: 2,
};

export interface GatewayRunOptions {
  itemKey: string;
  priority: TaskPriority;
  bypassCache?: boolean;
  seedOffset?: number;
  signal?: AbortSignal;
}

export interface GatewayRunResult {
  text: string;
  cached: boolean;
  repaired: boolean;
  fellBackToBaseline: boolean;
  keptOriginalWording: boolean;
  attemptCount: number;
  durationMs: number;
}

export interface GatewayLiveActivity {
  activeCount: number;
  queuedCount: number;
  maxSlots: number;
  warmingUp: boolean;
}

interface QueuedJob<TInput> {
  id: string;
  itemKey: string;
  priority: TaskPriority;
  enqueuedAt: number;
  task: LlmTaskDefinition<TInput>;
  input: TInput;
  options: GatewayRunOptions;
  controller: AbortController;
  resolve: (res: GatewayRunResult) => void;
  reject: (err: Error) => void;
}

export interface LlmGatewayDependencies {
  getProviderAndProfile: () => Promise<{
    provider: LlmProvider;
    providerId: string;
    modelName: string;
    profile: ModelProfile;
    parallelSlots: number;
  }>;
  resultCache: ResultCache;
  performanceLog: PerformanceLog;
  clock: Clock;
  idGen: IdGenerator;
}

export interface LlmGateway {
  executeTask<TInput>(
    task: LlmTaskDefinition<TInput>,
    input: TInput,
    options: GatewayRunOptions,
  ): Promise<GatewayRunResult>;
  warmPrefix(voice?: VoiceLevel): Promise<void>;
  cancelItem(itemKey: string): void;
  cancelByPrefix(itemKeyPrefix: string): void;
  cancelAll(): void;
  getLiveActivity(): GatewayLiveActivity;
  estimateEtaSeconds(params: {
    bulletCount: number;
    parallelSlots?: number;
  }): Promise<{ seconds: number; label: string }>;
}

/**
 * Single orchestrator (`LlmGateway`) for all local model calls:
 * - Priority queue (`interactive` > `visible` > `background`) bounded by `parallelSlots` (1–3)
 * - Per-item `AbortController` supersession: a new job with the same `itemKey` aborts the previous one
 * - Constant `profile.numCtx` (4096) on every call so Ollama never reallocates the KV cache
 * - Byte-identical `prefixMessages` + variable `suffixMessage` for KV prefix reuse
 * - Persistent `ResultCache` lookup before calling the provider
 * - 1-shot targeted repair call on validator failure; falls back to `task.baseline(input)` with `keptOriginalWording: true` if repair still fails
 */
export function createLlmGateway(deps: LlmGatewayDependencies): LlmGateway {
  const queue: Array<QueuedJob<unknown>> = [];
  const inFlightByItemKey = new Map<string, AbortController>();
  let activeCount = 0;
  let configuredMaxSlots = 2;
  let warmingUp = false;

  const cancelItem = (itemKey: string): void => {
    // Remove any queued jobs for this itemKey
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].itemKey === itemKey) {
        const [removed] = queue.splice(i, 1);
        removed.controller.abort();
        removed.reject(new Error('Superseded by newer request'));
      }
    }
    // Abort in-flight job if present
    const activeCtrl = inFlightByItemKey.get(itemKey);
    if (activeCtrl) {
      activeCtrl.abort();
      inFlightByItemKey.delete(itemKey);
    }
  };

  const cancelByPrefix = (prefix: string): void => {
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].itemKey.startsWith(prefix)) {
        const [removed] = queue.splice(i, 1);
        removed.controller.abort();
        removed.reject(new Error('Cancelled by prefix'));
      }
    }
    for (const [key, ctrl] of inFlightByItemKey.entries()) {
      if (key.startsWith(prefix)) {
        ctrl.abort();
        inFlightByItemKey.delete(key);
      }
    }
  };

  const cancelAll = (): void => {
    while (queue.length > 0) {
      const removed = queue.shift();
      if (removed) {
        removed.controller.abort();
        removed.reject(new Error('Cancelled all pending tasks'));
      }
    }
    for (const ctrl of inFlightByItemKey.values()) {
      ctrl.abort();
    }
    inFlightByItemKey.clear();
  };

  const pumpQueue = async (): Promise<void> => {
    if (queue.length === 0) return;
    const { parallelSlots } = await deps.getProviderAndProfile();
    configuredMaxSlots = Math.max(1, Math.min(3, parallelSlots || 2));

    while (activeCount < configuredMaxSlots && queue.length > 0) {
      // Sort queue by priority rank, then FIFO enqueuedAt
      queue.sort((a, b) => {
        const pDiff = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
        if (pDiff !== 0) return pDiff;
        return a.enqueuedAt - b.enqueuedAt;
      });

      const nextJob = queue.shift();
      if (!nextJob) break;
      activeCount += 1;
      inFlightByItemKey.set(nextJob.itemKey, nextJob.controller);

      void runSingleJob(nextJob).finally(() => {
        activeCount = Math.max(0, activeCount - 1);
        if (inFlightByItemKey.get(nextJob.itemKey) === nextJob.controller) {
          inFlightByItemKey.delete(nextJob.itemKey);
        }
        void pumpQueue();
      });
    }
  };

  const runSingleJob = async <TInput>(
    job: QueuedJob<TInput>,
  ): Promise<void> => {
    const startTime = Date.now();
    const { task, input, options, controller } = job;

    try {
      if (controller.signal.aborted) {
        throw new Error('Request aborted');
      }

      const { provider, providerId, modelName, profile } =
        await deps.getProviderAndProfile();
      const builtPrompt = task.buildPrompt(input);
      const seed = deriveSeed(options.itemKey, options.seedOffset ?? 0);

      const cacheKey = buildCacheKey({
        modelName,
        profileId: profile.id,
        taskId: task.id,
        promptVersion: task.promptVersion,
        voiceId: builtPrompt.voiceId,
        inputHash: builtPrompt.inputHash,
        briefHash: builtPrompt.briefHash,
        seed,
      });

      // 1. Check ResultCache first (unless bypassed for explicit variation)
      if (!options.bypassCache) {
        const cachedHit = await deps.resultCache.get(cacheKey);
        if (cachedHit) {
          const durationMs = Math.max(1, Date.now() - startTime);
          await deps.performanceLog.recordCall({
            id: deps.idGen.nextId('perf'),
            taskId: task.id,
            modelName,
            cached: true,
            repaired: false,
            fellBackToBaseline: false,
            durationMs,
            createdAt: deps.clock.nowIso(),
          });
          job.resolve({
            text: cachedHit.text,
            cached: true,
            repaired: false,
            fellBackToBaseline: false,
            keptOriginalWording: false,
            attemptCount: 0,
            durationMs,
          });
          return;
        }
      }

      // If provider is Demo mode ('mock') and does not have failure simulation enabled,
      // still run through provider.complete if available so timings, repair tests, and cache work identically.
      const baseMessages: LlmMessage[] = [
        ...builtPrompt.prefixMessages,
        builtPrompt.suffixMessage,
      ];

      // Enforce per-slot context budget (< 4096 tokens input + output)
      const totalChars = baseMessages.reduce(
        (sum, m) => sum + m.content.length,
        0,
      );
      const estimatedInputTokens =
        defaultTokenEstimator.estimateTokens(
          baseMessages.map((m) => m.content).join('\n'),
        );
      const tokenCap = task.getTokenCap(profile);

      if (estimatedInputTokens + tokenCap > profile.numCtx) {
        // Trim suffix message if needed so we never exceed profile.numCtx (4096)
        const maxSuffixChars = Math.max(
          400,
          Math.floor((profile.numCtx - tokenCap - 450) * 3.5),
        );
        const lastIdx = baseMessages.length - 1;
        baseMessages[lastIdx] = {
          ...baseMessages[lastIdx],
          content: baseMessages[lastIdx].content.slice(0, maxSuffixChars),
        };
      }

      const invokeProvider = async (
        messages: LlmMessage[],
        attemptSeed: number,
      ) => {
        if (provider.complete) {
          return provider.complete({
            messages,
            format: task.format,
            options: {
              numCtx: profile.numCtx,
              temperature: task.getTemperature(profile),
              topP: profile.topP,
              seed: attemptSeed,
              numPredict: tokenCap,
              stop: task.stopSequences ?? profile.stop,
              keepAlive: profile.keepAlive,
            },
            signal: controller.signal,
          });
        }
        // Fallback for minimal providers that only implement streaming `chat()`
        const sys = messages
          .filter((m) => m.role === 'system')
          .map((m) => m.content)
          .join('\n');
        const usr = messages
          .filter((m) => m.role !== 'system')
          .map((m) => `${m.role.toUpperCase()}: ${m.content}`)
          .join('\n\n');
        let acc = '';
        for await (const chunk of provider.chat({
          systemPrompt: sys,
          userPrompt: usr,
          temperature: task.getTemperature(profile),
          topP: profile.topP,
          signal: controller.signal,
        })) {
          acc += chunk;
        }
        return {
          text: acc,
          usage: {
            promptTokens: estimatedInputTokens,
            completionTokens: defaultTokenEstimator.estimateTokens(acc),
          },
        };
      };

      // Attempt 0
      const firstResponse = await invokeProvider(baseMessages, seed);
      if (firstResponse.usage.promptTokens) {
        defaultTokenEstimator.recordObservation(
          totalChars,
          firstResponse.usage.promptTokens,
        );
      }

      const firstValidation = task.validate(firstResponse.text, input);
      if (firstValidation.valid) {
        const durationMs = Math.max(1, Date.now() - startTime);
        const nowIso = deps.clock.nowIso();
        await deps.resultCache.set({
          key: cacheKey,
          taskId: task.id,
          modelName,
          profileId: profile.id,
          promptVersion: task.promptVersion,
          voiceId: builtPrompt.voiceId,
          text: firstValidation.sanitizedText,
          createdAt: nowIso,
          lastAccessedAt: nowIso,
        });

        const readingTokPerSec =
          firstResponse.usage.promptTokens && firstResponse.usage.promptEvalMs
            ? Math.round(
                (firstResponse.usage.promptTokens /
                  firstResponse.usage.promptEvalMs) *
                  1000,
              )
            : undefined;
        const writingTokPerSec =
          firstResponse.usage.completionTokens && firstResponse.usage.evalMs
            ? Math.round(
                (firstResponse.usage.completionTokens /
                  firstResponse.usage.evalMs) *
                  1000,
              )
            : undefined;

        await deps.performanceLog.recordCall({
          id: deps.idGen.nextId('perf'),
          taskId: task.id,
          modelName,
          cached: false,
          repaired: false,
          fellBackToBaseline: false,
          durationMs,
          loadMs: firstResponse.usage.loadMs,
          promptEvalMs: firstResponse.usage.promptEvalMs,
          evalMs: firstResponse.usage.evalMs,
          promptTokens: firstResponse.usage.promptTokens,
          completionTokens: firstResponse.usage.completionTokens,
          readingTokPerSec,
          writingTokPerSec,
          createdAt: nowIso,
        });

        job.resolve({
          text: firstValidation.sanitizedText,
          cached: false,
          repaired: false,
          fellBackToBaseline: false,
          keptOriginalWording: false,
          attemptCount: 1,
          durationMs,
        });
        return;
      }

      // Attempt 1: 1-shot targeted repair call
      const repairInstruction =
        firstValidation.repairInstruction ||
        task.repair(firstValidation.failures);
      const repairMessages: LlmMessage[] = [
        ...baseMessages,
        { role: 'assistant', content: firstResponse.text },
        { role: 'user', content: repairInstruction },
      ];
      const repairSeed = deriveSeed(options.itemKey, (options.seedOffset ?? 0) + 1);
      const secondResponse = await invokeProvider(repairMessages, repairSeed);
      const secondValidation = task.validate(secondResponse.text, input);

      if (secondValidation.valid) {
        const durationMs = Math.max(1, Date.now() - startTime);
        const nowIso = deps.clock.nowIso();
        await deps.resultCache.set({
          key: cacheKey,
          taskId: task.id,
          modelName,
          profileId: profile.id,
          promptVersion: task.promptVersion,
          voiceId: builtPrompt.voiceId,
          text: secondValidation.sanitizedText,
          createdAt: nowIso,
          lastAccessedAt: nowIso,
        });

        await deps.performanceLog.recordCall({
          id: deps.idGen.nextId('perf'),
          taskId: task.id,
          modelName,
          cached: false,
          repaired: true,
          fellBackToBaseline: false,
          durationMs,
          loadMs: secondResponse.usage.loadMs,
          promptEvalMs: secondResponse.usage.promptEvalMs,
          evalMs: secondResponse.usage.evalMs,
          promptTokens: secondResponse.usage.promptTokens,
          completionTokens: secondResponse.usage.completionTokens,
          createdAt: nowIso,
        });

        job.resolve({
          text: secondValidation.sanitizedText,
          cached: false,
          repaired: true,
          fellBackToBaseline: false,
          keptOriginalWording: false,
          attemptCount: 2,
          durationMs,
        });
        return;
      }

      // Both attempts failed validation -> deterministic baseline fallback + "Original wording kept"
      const baselineText = task.baseline(input);
      const durationMs = Math.max(1, Date.now() - startTime);
      await deps.performanceLog.recordCall({
        id: deps.idGen.nextId('perf'),
        taskId: task.id,
        modelName: providerId === 'mock' ? 'Demo mode' : modelName,
        cached: false,
        repaired: true,
        fellBackToBaseline: true,
        durationMs,
        createdAt: deps.clock.nowIso(),
      });

      job.resolve({
        text: baselineText,
        cached: false,
        repaired: true,
        fellBackToBaseline: true,
        keptOriginalWording: true,
        attemptCount: 2,
        durationMs,
      });
    } catch (err) {
      if (controller.signal.aborted) {
        job.reject(
          err instanceof Error ? err : new Error('Request was cancelled'),
        );
        return;
      }
      // On network / provider error, gracefully return the deterministic baseline
      const baselineText = task.baseline(input);
      const durationMs = Math.max(1, Date.now() - startTime);
      await deps.performanceLog.recordCall({
        id: deps.idGen.nextId('perf'),
        taskId: task.id,
        modelName: 'fallback',
        cached: false,
        repaired: false,
        fellBackToBaseline: true,
        durationMs,
        createdAt: deps.clock.nowIso(),
      });
      job.resolve({
        text: baselineText,
        cached: false,
        repaired: false,
        fellBackToBaseline: true,
        keptOriginalWording: true,
        attemptCount: 1,
        durationMs,
      });
    }
  };

  return {
    executeTask<TInput>(
      task: LlmTaskDefinition<TInput>,
      input: TInput,
      options: GatewayRunOptions,
    ): Promise<GatewayRunResult> {
      // Supersede any existing queued or in-flight job for the same itemKey
      cancelItem(options.itemKey);

      const controller = new AbortController();
      if (options.signal) {
        if (options.signal.aborted) {
          controller.abort();
        } else {
          options.signal.addEventListener('abort', () => controller.abort(), {
            once: true,
          });
        }
      }

      return new Promise<GatewayRunResult>((resolve, reject) => {
        const job: QueuedJob<TInput> = {
          id: deps.idGen.nextId('job'),
          itemKey: options.itemKey,
          priority: options.priority,
          enqueuedAt: Date.now(),
          task,
          input,
          options,
          controller,
          resolve,
          reject,
        };
        queue.push(job as QueuedJob<unknown>);
        void pumpQueue();
      });
    },

    async warmPrefix(voice: VoiceLevel = 'balanced'): Promise<void> {
      // Never warm while an interactive or visible job is running
      if (activeCount > 0 || queue.length > 0) return;
      try {
        warmingUp = true;
        const { provider, profile } = await deps.getProviderAndProfile();
        if (!provider.warm) return;
        const dummyPrompt = rewriteBulletTask.buildPrompt({
          bulletId: 'warm',
          action: 'Built service',
          result: 'cut latency by 20%',
          company: 'Company',
          roleTitle: 'Engineer',
          allowedTerms: [],
          jdOnlyTerms: [],
          briefText: 'ROLE: Engineer',
          briefHash: 'warm',
          voice,
        });
        await provider.warm({
          prefixMessages: dummyPrompt.prefixMessages,
          numCtx: profile.numCtx,
          keepAlive: profile.keepAlive,
        });
      } catch {
        // Ignore background warm-up errors
      } finally {
        warmingUp = false;
      }
    },

    cancelItem,
    cancelByPrefix,
    cancelAll,

    getLiveActivity(): GatewayLiveActivity {
      return {
        activeCount,
        queuedCount: queue.length,
        maxSlots: configuredMaxSlots,
        warmingUp,
      };
    },

    async estimateEtaSeconds({
      bulletCount,
      parallelSlots,
    }): Promise<{ seconds: number; label: string }> {
      if (bulletCount <= 0) {
        return { seconds: 0, label: 'ready' };
      }
      const summary = await deps.performanceLog.getSummary(20);
      const { parallelSlots: configuredSlots } =
        await deps.getProviderAndProfile();
      const slots = Math.max(
        1,
        Math.min(3, parallelSlots ?? configuredSlots ?? 2),
      );

      // Estimate per-bullet time from measured reading/writing speeds (defaulting to M1 16GB llama3.1:8b numbers: ~3.5s per bullet)
      const writeSpeed = Math.max(12, summary.writingSpeedTokPerSec || 38);
      const readSpeed = Math.max(60, summary.readingSpeedTokPerSec || 195);
      const perBulletSec = 110 / readSpeed + 32 / writeSpeed + 0.45;
      const waves = Math.ceil(bulletCount / slots);
      const totalSec = Math.max(2, Math.round(waves * perBulletSec));

      const label =
        bulletCount === 1
          ? `about ${Math.max(2, Math.round(perBulletSec))} s per bullet`
          : `about ${totalSec} s for ${bulletCount} bullets`;

      return { seconds: totalSec, label };
    },
  };
}
