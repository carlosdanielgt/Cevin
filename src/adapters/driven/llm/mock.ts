import { z } from 'zod';
import {
  LlmChatRequest,
  LlmCompletionRequest,
  LlmCompletionResponse,
  LlmMessage,
  LlmProvider,
  LlmProviderDescriptor,
  LlmRuntimeStatus,
  LlmUsageMetrics,
  ModelInfo,
  deterministicParseJobDescription,
} from '../../../core/application';
import {
  VoiceLevel,
  assembleBullet,
  extractDomainKeywordsFromText,
} from '../../../core/domain';

export const MockConfigSchema = z.object({
  model: z.string().default('Demo mode'),
  embeddingModel: z.string().optional().default('mock-embed-v1'),
  simulatedLatencyMs: z.coerce.number().int().min(0).max(2000).default(15),
  simulatePartlyOnCpu: z.boolean().optional().default(false),
  failValidationFirstAttempt: z.boolean().optional().default(false),
  alwaysFailValidation: z.boolean().optional().default(false),
  mockJobFactMode: z
    .enum(['valid', 'invalid-enum', 'fabricated-quote'])
    .optional()
    .default('valid'),
});

export type MockConfig = z.infer<typeof MockConfigSchema>;

function parseFactsFromPrompt(userMessage: string): {
  action: string;
  result: string;
  metric?: string;
  voice: VoiceLevel;
} {
  const actionMatch = userMessage.match(/ACTION:\s*(.+)/i);
  const resultMatch = userMessage.match(/RESULT:\s*(.+)/i);
  const metricMatch = userMessage.match(/METRIC:\s*(.+)/i);
  const voiceMatch = userMessage.match(/VOICE:\s*(\w+)/i);

  const action =
    actionMatch?.[1]?.trim() ||
    'Built multi-region Kubernetes metric ingestion in Go and Kafka';
  const result =
    resultMatch?.[1]?.trim() ||
    'sustaining 1.4M events/sec and cutting cross-AZ egress spend by 38%';
  const metric = metricMatch?.[1]?.trim();
  const rawVoice = (voiceMatch?.[1]?.toLowerCase() ?? 'balanced') as VoiceLevel;
  const validVoices: VoiceLevel[] = [
    'polished',
    'professional',
    'balanced',
    'natural',
    'plain',
  ];
  const voice = validVoices.includes(rawVoice) ? rawVoice : 'balanced';

  return { action, result, metric, voice };
}

export function createMockProvider(
  rawConfig?: Partial<MockConfig>,
): LlmProvider {
  const config = MockConfigSchema.parse(rawConfig ?? {});
  let memoryLoaded = true;
  let callCounter = 0;

  return {
    async listModels(): Promise<ModelInfo[]> {
      return [
        {
          id: 'Demo mode',
          name: 'Demo mode (Built-in)',
          family: 'llama',
          parameterSize: '8B',
          supportsEmbeddings: false,
        },
        {
          id: 'llama3.1:8b',
          name: 'llama3.1:8b',
          family: 'llama',
          parameterSize: '8B',
          supportsEmbeddings: false,
        },
        {
          id: 'mock-embed-v1',
          name: 'Local keyword embeddings',
          family: 'local',
          parameterSize: 'instant',
          supportsEmbeddings: true,
        },
      ];
    },

    async *chat(req: LlmChatRequest): AsyncIterable<string> {
      const tokens = [
        '{"bullet": ',
        '"Re-architected multi-region Kubernetes ingestion in Go and Kafka, ',
        'cutting cross-AZ egress spend by 38% at 1.4M events/sec."}',
      ];
      for (const token of tokens) {
        if (req.signal?.aborted) {
          throw new Error('Request aborted');
        }
        if (config.simulatedLatencyMs > 0) {
          await new Promise((r) => setTimeout(r, config.simulatedLatencyMs));
        }
        yield token;
      }
    },

    async chatJSON<T>(req: LlmChatRequest, schema: z.ZodType<T>): Promise<T> {
      if (req.signal?.aborted) {
        throw new Error('Request aborted');
      }

      const sys = req.systemPrompt.toLowerCase();
      let candidate: unknown = {};

      if (sys.includes('job description analyzer')) {
        let counter = 1;
        candidate = deterministicParseJobDescription(req.userPrompt, {
          nextId: (prefix = 'id') => `${prefix}-mock-${counter++}`,
        });
      } else if (sys.includes('resume parser')) {
        const kws = extractDomainKeywordsFromText(req.userPrompt);
        candidate = {
          name: 'Elena Rostova',
          headline: 'Senior Distributed Systems & Platform Engineer',
          email: 'elena.rostova@example.com',
          phone: '+1 (415) 890-4312',
          location: 'San Francisco, CA',
          experiences: [
            {
              company: 'Apex Cloud Infrastructure',
              title: 'Senior Platform Engineer',
              location: 'San Francisco, CA',
              start: '2022-03',
              end: 'Present',
              achievements: [
                {
                  action:
                    'Automated multi-cluster Kubernetes upgrades and Terraform state validation',
                  result:
                    'cutting maintenance windows from 3 hours to 12 minutes across 18 clusters',
                  metric: '3 hours to 12 minutes maintenance',
                  tags: ['kubernetes', 'terraform', 'automation'],
                },
                {
                  action:
                    'Tuned PostgreSQL read-replica routing and Redis cache invalidation',
                  result:
                    'reducing checkout API p95 latency by 41% during peak traffic',
                  metric: '41% p95 latency reduction',
                  tags: ['postgresql', 'redis', 'performance'],
                },
              ],
            },
          ],
          skills:
            kws.length > 0
              ? kws.map((k) => ({
                  name: k.term,
                  category: k.kind === 'tool' ? 'Infrastructure' : 'Languages',
                  aliases: [],
                }))
              : [
                  {
                    name: 'Kubernetes',
                    category: 'Infrastructure',
                    aliases: ['k8s', 'Helm'],
                  },
                  {
                    name: 'TypeScript',
                    category: 'Languages',
                    aliases: ['TS'],
                  },
                ],
        };
      } else if (sys.includes('summary writer')) {
        candidate = {
          summary:
            'Senior Distributed Systems & Platform Engineer experienced in Kubernetes, Go, TypeScript, and PostgreSQL. Proven track record of cutting p99 latency from 420ms to 68ms and operating high-throughput telemetry and settlement pipelines.',
        };
      } else if (sys.includes('cover letter writer')) {
        candidate = {
          blocks: [
            { type: 'greeting', text: 'Dear Hiring Team,', sourceIds: [] },
            {
              type: 'opening',
              text: 'At Vanguard Telemetry Systems, I re-architected our multi-region Kubernetes metric ingestion pipeline in Go and Kafka, sustaining 1.4M events/sec while cutting cross-AZ egress spend by 38%. I am applying to bring this hands-on distributed systems experience to your engineering team.',
              sourceIds: ['ach-k8s-ingest', 'exp-chronosphere'],
            },
            {
              type: 'body1',
              text: 'In my current role as Staff Platform Engineer, I designed a zero-downtime PostgreSQL partition routing and connection pooling layer, dropping p99 query latency from 420ms to 68ms across 120+ enterprise tenants.',
              sourceIds: ['ach-pg-sharding', 'exp-chronosphere'],
            },
            {
              type: 'body2',
              text: 'Previously at Meridian Clearing Corp, I implemented idempotency keys and Redis distributed locks for settlement APIs, processing $2.8B in annual volume with 99.995% availability and zero double-charges.',
              sourceIds: ['ach-ledger-idempotency', 'exp-finledger'],
            },
            {
              type: 'whyCompany',
              text: 'What draws me to this role is the focus on resilient production systems and predictable low-latency execution at scale.',
              sourceIds: ['exp-chronosphere'],
            },
            {
              type: 'closing',
              text: 'Thank you for your time and consideration. I would welcome a conversation about how my background fits your roadmap.',
              sourceIds: [],
            },
            {
              type: 'signoff',
              text: 'Sincerely,\nElena Rostova',
              sourceIds: [],
            },
          ],
        };
      } else if (sys.includes('cover letter editor')) {
        candidate = {
          text: 'At Vanguard Telemetry Systems, I built our multi-region Kubernetes ingestion pipeline in Go and Kafka, sustaining 1.4M events/sec and cutting cross-AZ egress spend by 38%.',
        };
      } else {
        candidate = {
          bullet:
            'Built multi-region Kubernetes metric ingestion in Go and Kafka, sustaining 1.4M events/sec and cutting egress spend by 38%.',
        };
      }

      return schema.parse(candidate);
    },

    async complete(req: LlmCompletionRequest): Promise<LlmCompletionResponse> {
      if (req.signal?.aborted) {
        throw new Error('Request aborted');
      }
      if (config.simulatedLatencyMs > 0) {
        await new Promise((r) => setTimeout(r, config.simulatedLatencyMs));
      }
      if (req.signal?.aborted) {
        throw new Error('Request aborted');
      }

      callCounter += 1;
      memoryLoaded = true;

      const systemMsg =
        req.messages.find((m) => m.role === 'system')?.content.toLowerCase() ??
        '';
      const lastUserMsg =
        [...req.messages].reverse().find((m) => m.role === 'user')?.content ??
        '';
      const isRepairTurn =
        req.messages.filter((m) => m.role === 'user').length > 4 ||
        lastUserMsg.startsWith('Fix the ');

      const promptChars = req.messages.reduce(
        (acc, m) => acc + m.content.length,
        0,
      );
      const promptTokens = Math.max(24, Math.round(promptChars / 3.8));

      // Handle simulated validation failures for testing the 1-shot repair + baseline fallback loop
      if (config.alwaysFailValidation) {
        return {
          text: 'I synergized 9999% world-class Databricks magic.',
          usage: {
            promptTokens,
            completionTokens: 12,
            loadMs: 5,
            promptEvalMs: 45,
            evalMs: 180,
          },
        };
      }

      if (config.failValidationFirstAttempt && !isRepairTurn) {
        return {
          text: 'I synergized 9999% world-class magic.',
          usage: {
            promptTokens,
            completionTokens: 10,
            loadMs: 5,
            promptEvalMs: 45,
            evalMs: 160,
          },
        };
      }

      let outputText = '';
      if (req.format === 'json') {
        if (systemMsg.includes('import block classifier')) {
          outputText = JSON.stringify({
            blocks: [
              { index: 0, kind: 'contact', confidence: 0.98 },
              { index: 1, kind: 'experience', confidence: 0.95 },
              { index: 2, kind: 'skills', confidence: 0.94 },
            ],
          });
        } else if (systemMsg.includes('job brief refiner')) {
          outputText = JSON.stringify({
            title: 'Staff Distributed Systems Engineer',
            company: 'Aether Cloud',
            seniority: 'Staff',
            topSkills: ['Kubernetes', 'Go', 'PostgreSQL', 'Kafka'],
          });
        } else if (systemMsg.includes('job posting fact classifier')) {
          if (config.mockJobFactMode === 'invalid-enum') {
            outputText = JSON.stringify({
              value: 'super-hybrid-invalid',
              quote: 'some quote',
            });
          } else if (config.mockJobFactMode === 'fabricated-quote') {
            outputText = JSON.stringify({
              value: 'sponsored',
              quote: 'We definitely sponsor all visas on Mars 100% guaranteed.',
            });
          } else {
            const sourceUserMsg = isRepairTurn
              ? req.messages[req.messages.length - 3]?.content ?? lastUserMsg
              : lastUserMsg;
            const factMatch = sourceUserMsg.match(/FACT:\s*(\w+)/i);
            const textMatch = sourceUserMsg.match(/TEXT:\s*([\s\S]+)$/i);
            const factKey = factMatch?.[1]?.trim() ?? 'workPermits';
            const snippetText = (textMatch?.[1] ?? '').trim();
            const firstSentence =
              snippetText.split(/(?<=[.!?])\s+/)[0]?.trim() || snippetText;
            const lower = snippetText.toLowerCase();
            let val = 'not-stated';
            if (factKey === 'workPermits') {
              if (
                lower.includes('no sponsorship') ||
                lower.includes('unable to sponsor') ||
                lower.includes('cannot sponsor') ||
                lower.includes('do not sponsor')
              ) {
                val = 'not-offered';
              } else if (
                lower.includes('may consider') ||
                lower.includes('case-by-case') ||
                lower.includes('transfer')
              ) {
                val = 'conditional';
              } else if (lower.includes('sponsor')) {
                val = 'sponsors';
              }
            } else if (factKey === 'location') {
              if (lower.includes('hybrid') || lower.includes('hybride')) {
                val = 'hybrid';
              } else if (lower.includes('remote') || lower.includes('télétravail')) {
                val = 'remote';
              } else if (lower.includes('on-site') || lower.includes('onsite') || lower.includes('présentiel')) {
                val = 'onsite';
              }
            } else if (factKey === 'languages') {
              if (lower.includes('bilingual') || lower.includes('bilingue')) {
                val = 'bilingual';
              } else if (lower.includes('french') || lower.includes('français')) {
                val = 'french';
              } else if (lower.includes('english') || lower.includes('anglais')) {
                val = 'english';
              }
            } else if (factKey === 'employmentType') {
              if (lower.includes('contract') || lower.includes('pigiste')) {
                val = 'contract';
              } else if (lower.includes('full-time') || lower.includes('temps plein')) {
                val = 'full-time';
              }
            }
            outputText = JSON.stringify({
              value: val,
              quote: val === 'not-stated' ? '' : firstSentence,
            });
          }
        } else {
          outputText = JSON.stringify({ ok: true });
        }
      } else if (systemMsg.includes('resume summary writer')) {
        const headlineMatch = lastUserMsg.match(/HEADLINE:\s*(.+)/i);
        const skillsMatch = lastUserMsg.match(/SKILLS:\s*(.+)/i);
        const metricMatch = lastUserMsg.match(/TOP_OUTCOME:\s*(.+)/i);
        const headline =
          headlineMatch?.[1]?.trim() ||
          'Staff Distributed Systems & Platform Engineer';
        const skills =
          skillsMatch?.[1]?.trim() || 'Kubernetes, Go, PostgreSQL, and Kafka';
        const outcome =
          metricMatch?.[1]?.trim() ||
          'cutting p99 latency from 420ms to 68ms across multi-region clusters';
        outputText = `${headline} specializing in ${skills}. Proven track record of ${outcome} while maintaining high production reliability.`;
      } else if (systemMsg.includes('cover letter paragraph writer')) {
        const proofMatch = lastUserMsg.match(/PROOF:\s*(.+)/i);
        const companyMatch = lastUserMsg.match(/COMPANY:\s*(.+)/i);
        const roleMatch = lastUserMsg.match(/ROLE:\s*(.+)/i);
        const proof =
          proofMatch?.[1]?.trim() ||
          'built multi-region Kubernetes metric ingestion in Go and Kafka sustaining 1.4M events/sec';
        const company = companyMatch?.[1]?.trim() || 'your team';
        const role = roleMatch?.[1]?.trim() || 'Staff Platform Engineer';
        outputText = `In my recent platform work, ${proof}. Bringing this hands-on systems background to ${company} will help the ${role} team deliver reliable low-latency infrastructure from day one.`;
      } else {
        // Bullet rewrite task
        const facts = parseFactsFromPrompt(
          isRepairTurn
            ? req.messages[req.messages.length - 3]?.content ?? lastUserMsg
            : lastUserMsg,
        );
        outputText = assembleBullet(
          {
            action: facts.action,
            result: facts.result,
            metric: facts.metric,
          },
          facts.voice,
          callCounter % 2,
        );
      }

      const completionTokens = Math.max(
        12,
        Math.round(outputText.length / 3.8),
      );
      return {
        text: outputText,
        usage: {
          promptTokens,
          completionTokens,
          loadMs: callCounter === 1 ? 110 : 4,
          promptEvalMs: Math.max(18, Math.round(promptTokens * 0.42)),
          evalMs: Math.max(60, Math.round(completionTokens * 22)),
        },
      };
    },

    async warm(req: {
      prefixMessages: LlmMessage[];
      numCtx: number;
      keepAlive: string;
      signal?: AbortSignal;
    }): Promise<LlmUsageMetrics> {
      if (req.signal?.aborted) {
        throw new Error('Request aborted');
      }
      memoryLoaded = true;
      const chars = req.prefixMessages.reduce(
        (acc, m) => acc + m.content.length,
        0,
      );
      const promptTokens = Math.max(30, Math.round(chars / 3.8));
      return {
        promptTokens,
        completionTokens: 0,
        loadMs: 45,
        promptEvalMs: 65,
        evalMs: 0,
      };
    },

    async getRuntimeStatus(): Promise<LlmRuntimeStatus> {
      if (!memoryLoaded) {
        return {
          reachable: true,
          loadedModels: [],
          activeModelLoaded: false,
          partlyOnCpu: false,
          memorySummary: 'Idle (0 GB in memory)',
        };
      }
      const sizeBytes = 4_920_000_000;
      const sizeVramBytes = config.simulatePartlyOnCpu
        ? Math.round(sizeBytes * 0.65)
        : sizeBytes;
      const vramPercent = config.simulatePartlyOnCpu ? 65 : 100;
      const cpuPercent = config.simulatePartlyOnCpu ? 35 : 0;
      return {
        reachable: true,
        loadedModels: [
          {
            name: config.model,
            sizeBytes,
            sizeVramBytes,
            cpuPercent,
            vramPercent,
            partlyOnCpu: Boolean(config.simulatePartlyOnCpu),
          },
        ],
        activeModelLoaded: true,
        partlyOnCpu: Boolean(config.simulatePartlyOnCpu),
        memorySummary: config.simulatePartlyOnCpu
          ? 'Partly on CPU (65% GPU / 35% CPU · 4.6 GB)'
          : '100% on GPU (4.6 GB)',
      };
    },

    async unload(): Promise<void> {
      memoryLoaded = false;
    },

    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((text) => {
        const lower = text.toLowerCase();
        const dims = [
          lower.includes('kubernetes') || lower.includes('k8s') ? 1 : 0.1,
          lower.includes('postgres') || lower.includes('sql') ? 1 : 0.1,
          lower.includes('go') || lower.includes('golang') ? 1 : 0.1,
          lower.includes('typescript') || lower.includes('react') ? 1 : 0.1,
          lower.includes('terraform') || lower.includes('ci/cd') ? 1 : 0.1,
          lower.includes('kafka') || lower.includes('redis') ? 1 : 0.1,
          lower.includes('observability') || lower.includes('otel') ? 1 : 0.1,
          0.5,
        ];
        return dims;
      });
    },
  };
}

export const mockProviderDescriptor: LlmProviderDescriptor<Partial<MockConfig>> = {
  id: 'mock',
  label: 'Demo mode (no AI needed)',
  description:
    'Try Cevin right away with sample responses — no local AI server required.',
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
  configSchema: MockConfigSchema,
  configFields: [],
  defaultConfig: {
    model: 'Demo mode',
    embeddingModel: 'mock-embed-v1',
    simulatedLatencyMs: 15,
    simulatePartlyOnCpu: false,
    failValidationFirstAttempt: false,
    alwaysFailValidation: false,
    mockJobFactMode: 'valid',
  },
  create: (config) => createMockProvider(config),
};
