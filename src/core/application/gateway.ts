import {
  CevinActivityKind,
  CevinActivityPhase,
  VoiceLevel,
  buildCacheKey,
  defaultTokenEstimator,
  deriveSeed,
  formatCevinActivityLabel,
  mapKindToDefaultPhase,
} from '../domain';
import { CevinActivitySnapshot } from './ports/inbound';
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

export type CevinActivityListener = (snapshot: CevinActivitySnapshot) => void;

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
  getActivitySnapshot(): CevinActivitySnapshot;
  subscribeActivity(listener: CevinActivityListener): () => void;
  runWithActivity<T>(
    kind: CevinActivityKind,
    fn: () => Promise<T>,
    options?: {
      phase?: CevinActivityPhase;
      batchCompleted?: number;
      batchTotal?: number;
    },
  ): Promise<T>;
  updateBatchProgress(completed: number, total: number): void;
  estimateEtaSeconds(params: {
    bulletCount: number;
    parallelSlots?: number;
  }): Promise<{ seconds: number; label: string }>;
}

interface ScopedActivityEntry {
  id: number;
  kind: CevinActivityKind;
  phase: CevinActivityPhase;
  batchCompleted?: number;
  batchTotal?: number;
}

function mapTaskIdToActivityKind(taskId: string): CevinActivityKind {
  switch (taskId) {
    case 'rewrite-bullet':
      return 'rewriting';
    case 'write-summary':
    case 'write-letter-block':
      return 'writing';
    case 'refine-job-brief':
    case 'extract-job-fact':
      return 'reading-posting';
    case 'structure-resume':
      return 'reading-resume';
    default:
      return 'writing';
  }
}

/**
 * Single orchestrator (`LlmGateway`) for all local model calls:
 * - Priority queue (`interactive` > `visible` > `background`) bounded by `parallelSlots` (1–3)
 * - Per-item `AbortController` supersession: a new job with the same `itemKey` aborts the previous one
 * - Constant `profile.maxSeqLength` per call
 * - Byte-identical `prefixMessages` + variable `suffixMessage` for KV prefix reuse
 * - Persistent `ResultCache` lookup before calling the provider
 * - 1-shot targeted repair call on validator failure; falls back to `task.baseline(input)` with `keptOriginalWording: true` if repair still fails
 */
export function createLlmGateway(deps: LlmGatewayDependencies): LlmGateway {
  const queue: Array<QueuedJob<unknown>> = [];
  const inFlightByItemKey = new Map<string, AbortController>();
  const inFlightTaskKinds = new Map<string, CevinActivityKind>();
  const scopedStack: ScopedActivityEntry[] = [];
  const listeners = new Set<CevinActivityListener>();
  let nextScopeId = 1;
  let activeCount = 0;
  let configuredMaxSlots = 2;
  let warmingUp = false;

  const buildActivitySnapshot = (): CevinActivitySnapshot => {
    const topScope =
      scopedStack.length > 0 ? scopedStack[scopedStack.length - 1] : undefined;
    let kind: CevinActivityKind = 'idle';
    let phase: CevinActivityPhase = 'idle';
    let batchCompleted: number | undefined;
    let batchTotal: number | undefined;

    if (topScope) {
      kind = topScope.kind;
      phase = topScope.phase;
      batchCompleted = topScope.batchCompleted;
      batchTotal = topScope.batchTotal;
    } else if (activeCount > 0 || queue.length > 0) {
      const firstInFlight = inFlightTaskKinds.values().next().value;
      const firstQueued = queue[0]
        ? mapTaskIdToActivityKind(queue[0].task.id)
        : undefined;
      kind = firstInFlight ?? firstQueued ?? 'writing';
      phase = mapKindToDefaultPhase(kind);
    } else if (warmingUp) {
      kind = 'warming';
      phase = 'warming';
    }

    const progress =
      batchTotal !== undefined &&
      batchTotal > 0 &&
      batchCompleted !== undefined
        ? Math.max(0, Math.min(1, batchCompleted / batchTotal))
        : undefined;

    return {
      phase,
      kind,
      label: formatCevinActivityLabel(kind, batchCompleted, batchTotal),
      activeCount,
      queuedCount: queue.length,
      maxSlots: configuredMaxSlots,
      warmingUp,
      batchCompleted,
      batchTotal,
      progress,
      updatedAtMs: Date.now(),
    };
  };

  const notifyListeners = (): void => {
    if (listeners.size === 0) return;
    const snap = buildActivitySnapshot();
    for (const listener of listeners) {
      try {
        listener(snap);
      } catch {
        // Ignore subscriber errors
      }
    }
  };

  const cancelItem = (itemKey: string): void => {
    let changed = false;
    // Remove any queued jobs for this itemKey
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].itemKey === itemKey) {
        const [removed] = queue.splice(i, 1);
        removed.controller.abort();
        removed.reject(new Error('Superseded by newer request'));
        changed = true;
      }
    }
    // Abort in-flight job if present
    const activeCtrl = inFlightByItemKey.get(itemKey);
    if (activeCtrl) {
      activeCtrl.abort();
      inFlightByItemKey.delete(itemKey);
      inFlightTaskKinds.delete(itemKey);
      changed = true;
    }
    if (changed) notifyListeners();
  };

  const cancelByPrefix = (prefix: string): void => {
    let changed = false;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i].itemKey.startsWith(prefix)) {
        const [removed] = queue.splice(i, 1);
        removed.controller.abort();
        removed.reject(new Error('Cancelled by prefix'));
        changed = true;
      }
    }
    for (const [key, ctrl] of inFlightByItemKey.entries()) {
      if (key.startsWith(prefix)) {
        ctrl.abort();
        inFlightByItemKey.delete(key);
        inFlightTaskKinds.delete(key);
        changed = true;
      }
    }
    if (changed) notifyListeners();
  };

  const cancelAll = (): void => {
    let changed = false;
    while (queue.length > 0) {
      const removed = queue.shift();
      if (removed) {
        removed.controller.abort();
        removed.reject(new Error('Cancelled all pending tasks'));
        changed = true;
      }
    }
    for (const ctrl of inFlightByItemKey.values()) {
      ctrl.abort();
      changed = true;
    }
    inFlightByItemKey.clear();
    inFlightTaskKinds.clear();
    if (changed) notifyListeners();
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
      inFlightTaskKinds.set(
        nextJob.itemKey,
        mapTaskIdToActivityKind(nextJob.task.id),
      );
      notifyListeners();

      void runSingleJob(nextJob).finally(() => {
        activeCount = Math.max(0, activeCount - 1);
        if (inFlightByItemKey.get(nextJob.itemKey) === nextJob.controller) {
          inFlightByItemKey.delete(nextJob.itemKey);
          inFlightTaskKinds.delete(nextJob.itemKey);
        }
        notifyListeners();
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

      if (
        !profile.disableRawPromptTrimming &&
        estimatedInputTokens + tokenCap > profile.maxSeqLength
      ) {
        const maxSuffixChars = Math.max(
          400,
          Math.floor((profile.maxSeqLength - tokenCap - 450) * 3.5),
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
              maxSeqLength: profile.maxSeqLength,
              temperature: task.getTemperature(profile),
              topP: profile.topP,
              seed: attemptSeed,
              numPredict: tokenCap,
              stop: task.stopSequences ?? profile.stop,
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
      if (firstResponse.usage?.promptTokens) {
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
          firstResponse.usage?.promptTokens && firstResponse.usage?.promptEvalMs
            ? Math.round(
                (firstResponse.usage.promptTokens /
                  firstResponse.usage.promptEvalMs) *
                  1000,
              )
            : undefined;
        const writingTokPerSec =
          firstResponse.usage?.completionTokens && firstResponse.usage?.evalMs
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
          loadMs: firstResponse.usage?.loadMs,
          promptEvalMs: firstResponse.usage?.promptEvalMs,
          evalMs: firstResponse.usage?.evalMs,
          promptTokens: firstResponse.usage?.promptTokens,
          completionTokens: firstResponse.usage?.completionTokens,
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
          loadMs: secondResponse.usage?.loadMs,
          promptEvalMs: secondResponse.usage?.promptEvalMs,
          evalMs: secondResponse.usage?.evalMs,
          promptTokens: secondResponse.usage?.promptTokens,
          completionTokens: secondResponse.usage?.completionTokens,
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
        notifyListeners();
        void pumpQueue();
      });
    },

    async warmPrefix(voice: VoiceLevel = 'balanced'): Promise<void> {
      // Never warm while an interactive or visible job is running
      if (activeCount > 0 || queue.length > 0) return;
      try {
        warmingUp = true;
        notifyListeners();
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
          maxSeqLength: profile.maxSeqLength,
        });
      } catch {
        // Ignore background warm-up errors
      } finally {
        warmingUp = false;
        notifyListeners();
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

    getActivitySnapshot(): CevinActivitySnapshot {
      return buildActivitySnapshot();
    },

    subscribeActivity(listener: CevinActivityListener): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    async runWithActivity<T>(
      kind: CevinActivityKind,
      fn: () => Promise<T>,
      options?: {
        phase?: CevinActivityPhase;
        batchCompleted?: number;
        batchTotal?: number;
      },
    ): Promise<T> {
      const scopeId = nextScopeId++;
      const entry: ScopedActivityEntry = {
        id: scopeId,
        kind,
        phase: options?.phase ?? mapKindToDefaultPhase(kind),
        batchCompleted: options?.batchCompleted,
        batchTotal: options?.batchTotal,
      };
      scopedStack.push(entry);
      notifyListeners();
      try {
        return await fn();
      } finally {
        const idx = scopedStack.findIndex((s) => s.id === scopeId);
        if (idx !== -1) {
          scopedStack.splice(idx, 1);
        }
        notifyListeners();
      }
    },

    updateBatchProgress(completed: number, total: number): void {
      if (scopedStack.length === 0) return;
      const top = scopedStack[scopedStack.length - 1];
      top.batchCompleted = completed;
      top.batchTotal = total;
      notifyListeners();
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

      // Estimate per-bullet time from measured reading/writing speeds (defaulting to Apple Silicon 3B MLX numbers)
      const writeSpeed = Math.max(12, summary.writingSpeedTokPerSec || 33);
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
