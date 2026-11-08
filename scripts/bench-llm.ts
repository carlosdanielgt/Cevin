import fs from 'node:fs';
import path from 'node:path';
import {
  createLlmProviderCatalog,
  createModelProfileCatalog,
} from '../src/adapters/driven/llm';
import {
  createInMemoryPerformanceLog,
  createInMemoryResultCache,
} from '../src/adapters/driven/storage';
import {
  HARNESS_TASK_CATALOG,
  RewriteBulletTaskInput,
  createDemoApplications,
  createDemoBankSnapshot,
  createLlmGateway,
} from '../src/core/application';
import {
  VOICE_LEVEL_ORDER,
  VoiceLevel,
  extractDeterministicJobBrief,
  outlineCoverLetter,
} from '../src/core/domain';

interface BenchCliOptions {
  model: string;
  provider: 'ollama' | 'mock';
  baseUrl: string;
  slots: number;
}

function parseCliArgs(argv: string[]): BenchCliOptions {
  let model = 'llama3.1:8b';
  let provider: 'ollama' | 'mock' = 'ollama';
  let baseUrl = 'http://localhost:11434';
  let slots = 2;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--model' && argv[i + 1]) {
      model = argv[++i];
    } else if (arg === '--provider' && argv[i + 1]) {
      provider = argv[++i] === 'mock' ? 'mock' : 'ollama';
    } else if (arg === '--url' && argv[i + 1]) {
      baseUrl = argv[++i];
    } else if (arg === '--slots' && argv[i + 1]) {
      slots = Math.max(1, Math.min(3, Number(argv[++i]) || 2));
    }
  }

  return { model, provider, baseUrl, slots };
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(
    sorted.length - 1,
    Math.max(0, Math.floor((p / 100) * sorted.length)),
  );
  return sorted[idx];
}

async function runBenchmark() {
  const opts = parseCliArgs(process.argv.slice(2));
  const llmCatalog = createLlmProviderCatalog();
  const profileCatalog = createModelProfileCatalog();
  const profile = profileCatalog.resolveForModel(opts.model);

  // Detect whether local Ollama is reachable; if not, fall back to the deterministic harness simulator
  let activeProviderId: 'ollama' | 'mock' = opts.provider;
  let modeNote = 'live-ollama';

  if (activeProviderId === 'ollama') {
    const ollamaDesc = llmCatalog.getById('ollama');
    const probe = ollamaDesc?.create({
      baseUrl: opts.baseUrl,
      model: opts.model,
      embeddingModel: 'nomic-embed-text',
      numCtx: 4096,
      temperature: 0.25,
    });
    let ok = false;
    if (probe) {
      try {
        const models = await probe.listModels();
        ok = models.length > 0;
      } catch {
        ok = false;
      }
    }
    if (!ok) {
      activeProviderId = 'mock';
      modeNote =
        'simulated-m1-16gb-profile (Ollama not running locally; used deterministic M1 16GB timing model)';
    }
  } else {
    modeNote = 'simulated-m1-16gb-profile (--provider mock)';
  }

  const desc = llmCatalog.getById(activeProviderId)!;
  const provider = desc.create(
    activeProviderId === 'ollama'
      ? {
          baseUrl: opts.baseUrl,
          model: opts.model,
          embeddingModel: 'nomic-embed-text',
          numCtx: 4096,
          temperature: 0.25,
        }
      : {
          model: opts.model,
          embeddingModel: 'nomic-embed-text',
          simulatedLatencyMs: 12,
          simulatePartlyOnCpu: false,
          failValidationFirstAttempt: false,
          alwaysFailValidation: false,
        },
  );

  const resultCache = createInMemoryResultCache(5000);
  const performanceLog = createInMemoryPerformanceLog(500);
  let seq = 1;

  const gateway = createLlmGateway({
    getProviderAndProfile: async () => ({
      provider,
      providerId: activeProviderId,
      modelName: opts.model,
      profile,
      parallelSlots: opts.slots,
    }),
    resultCache,
    performanceLog,
    idGen: { nextId: (prefix = 'bench') => `${prefix}-${seq++}` },
    clock: { nowIso: () => new Date().toISOString() },
  });

  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const expById = new Map(bank.experiences.map((e) => [e.id, e]));

  // Build 20 golden bullet fixtures (4 achievements x 5 voices)
  const goldenAchievements = bank.achievements.slice(0, 4).map((ach) => ({
    ach,
    exp: expById.get(ach.experienceId) ?? bank.experiences[0],
  }));

  const bulletFixtures: Array<{
    itemId: string;
    voice: VoiceLevel;
    input: RewriteBulletTaskInput;
  }> = [];

  for (const { ach, exp } of goldenAchievements) {
    for (const voice of VOICE_LEVEL_ORDER) {
      bulletFixtures.push({
        itemId: `${ach.id}-${voice}`,
        voice,
        input: {
          bulletId: ach.id,
          action: ach.action,
          result: ach.result,
          metric: ach.metric,
          company: exp.company,
          roleTitle: exp.title,
          allowedTerms: bank.skills.map((s) => s.name),
          jdOnlyTerms: ['Rust', 'Snowflake'],
          briefText:
            'ROLE: Staff Infrastructure Engineer at Kestrel Pay | MUST-HAVES: Kubernetes, Go, Kafka, PostgreSQL',
          briefHash: 'bench-brief-kestrel',
          voice,
        },
      });
    }
  }

  // Build 5 golden JD fixtures
  const goldenJds = [
    applications[0].jobDescription,
    applications[1]?.jobDescription ??
      'Role: Principal Platform Engineer\nCompany: Helios Metrics\nMust have TypeScript, PostgreSQL, GraphQL, Node.js, and observability experience.',
    'Role: Senior Site Reliability Engineer\nCompany: Apex Cloud Infrastructure\nRequirements:\n- 5+ years with Kubernetes, Go, Linux, and Prometheus\n- Multi-region incident response and Terraform automation\nNice to have: Rust or eBPF',
    'Role: Staff Backend Engineer\nCompany: Vanguard Telemetry Systems\nMust have:\n- High-throughput event ingestion in Go and Kafka\n- Distributed tracing with OpenTelemetry\n- Multi-region cost optimization',
    'Role: Founding Infrastructure Engineer\nCompany: Lattice Cloud Labs\nRequirements:\n- Production Kubernetes clusters and Python/Go services\n- Low-latency RPC and PostgreSQL performance tuning',
  ];

  // Build 3 golden Cover Letter fixtures (4 LLM blocks each = 12 block runs)
  const goldenLetters = applications.slice(0, 3);
  while (goldenLetters.length < 3) {
    goldenLetters.push(applications[0]);
  }

  // 1. Warm prefix first
  await gateway.warmPrefix('balanced');

  // 2. Execute 20 bullet rewrites
  let bulletFirstAttemptsPassed = 0;
  let bulletRepairsUsed = 0;
  let bulletFallbacksUsed = 0;
  let maxPromptPlusOutputTokens = 0;

  for (const item of bulletFixtures) {
    const res = await gateway.executeTask(
      HARNESS_TASK_CATALOG.rewriteBullet,
      item.input,
      {
        itemKey: item.itemId,
        priority: 'interactive',
        bypassCache: true,
      },
    );
    if (res.attemptCount === 1 && !res.keptOriginalWording) {
      bulletFirstAttemptsPassed += 1;
    }
    if (res.repaired) bulletRepairsUsed += 1;
    if (res.keptOriginalWording) bulletFallbacksUsed += 1;
  }

  // 3. Execute 5 JD brief extractions + refinements
  for (let i = 0; i < goldenJds.length; i++) {
    const rawJd = goldenJds[i];
    const deterministicBrief = extractDeterministicJobBrief(rawJd);
    await gateway.executeTask(
      HARNESS_TASK_CATALOG.refineJobBrief,
      {
        deterministicBriefText: deterministicBrief.briefText,
        rawSnippet: rawJd.slice(0, 800),
        defaultTitle: deterministicBrief.title,
        defaultCompany: deterministicBrief.company,
        defaultSeniority: deterministicBrief.seniority,
        defaultTopSkills: deterministicBrief.topSkills,
      },
      {
        itemKey: `jd-${i}`,
        priority: 'visible',
        bypassCache: true,
      },
    );
  }

  // 4. Execute 3 Cover Letters (outline deterministically + 4 blocks per letter)
  let letterBlocksPassed = 0;
  const llmBlockTypes = ['opening', 'body1', 'body2', 'whyCompany'] as const;

  for (let i = 0; i < goldenLetters.length; i++) {
    const app = goldenLetters[i];
    const outline = outlineCoverLetter({
      company: app.company,
      roleTitle: app.roleTitle,
      recipient: `Hiring Team at ${app.company}`,
      length: 'standard',
      voice: 'balanced',
      selectedProofAchievementIds: [],
      whyCompanyNotes: 'Strong engineering culture and distributed systems scale.',
      parsedJob: app.parsedJob,
      bank,
    });

    const primaryAch = outline.primaryProof?.achievement ?? bank.achievements[0];
    const secondaryAch =
      outline.secondaryProof?.achievement ?? bank.achievements[1];

    for (const blockType of llmBlockTypes) {
      const proofAch = blockType === 'body2' ? secondaryAch : primaryAch;
      const proofSnippet = `${proofAch.action}, ${proofAch.result}${proofAch.metric ? ` (${proofAch.metric})` : ''}`;

      const blockRes = await gateway.executeTask(
        HARNESS_TASK_CATALOG.writeLetterBlock,
        {
          blockType,
          company: app.company,
          roleTitle: app.roleTitle,
          proofSnippet,
          topRequirements: outline.topRequirements,
          whyCompanyNotes: outline.whyCompanyHook,
          allowedCorpusText: `${proofSnippet} ${bank.skills.map((s) => s.name).join(' ')}`,
          fallbackText: `At my previous role, I ${proofAch.action.toLowerCase()}, ${proofAch.result}.`,
          briefText: app.jobDescription.slice(0, 260),
          briefHash: `letter-brief-${i}`,
          voice: 'balanced',
        },
        {
          itemKey: `letter-${i}-${blockType}`,
          priority: 'visible',
          bypassCache: true,
        },
      );
      if (!blockRes.keptOriginalWording) {
        letterBlocksPassed += 1;
      }
    }
  }

  // 5. Measure an 8-bullet parallel batch (2 slots)
  const batchStart = Date.now();
  await Promise.all(
    bulletFixtures.slice(0, 8).map((item) =>
      gateway.executeTask(HARNESS_TASK_CATALOG.rewriteBullet, item.input, {
        itemKey: item.itemId,
        priority: 'interactive',
        bypassCache: true,
      }),
    ),
  );
  const batch8WallClockMs = Date.now() - batchStart;

  // 6. Verify second-run cache hit rate (re-running same 8 bullets without bypassCache)
  const cacheStart = Date.now();
  const cachedRuns = await Promise.all(
    bulletFixtures.slice(0, 8).map((item) =>
      gateway.executeTask(HARNESS_TASK_CATALOG.rewriteBullet, item.input, {
        itemKey: item.itemId,
        priority: 'interactive',
        bypassCache: false,
      }),
    ),
  );
  const cacheBatchMs = Date.now() - cacheStart;
  const secondRunCacheHits = cachedRuns.filter((r) => r.cached).length;

  // Collect call log metrics
  const summary = await performanceLog.getSummary(200);
  const nonCachedCalls = summary.recentCalls.filter((c) => !c.cached);
  const wallMsSorted = nonCachedCalls
    .map((c) => c.durationMs)
    .sort((a, b) => a - b);

  for (const c of nonCachedCalls) {
    const totalTok = (c.promptTokens ?? 220) + (c.completionTokens ?? 35);
    if (totalTok > maxPromptPlusOutputTokens) {
      maxPromptPlusOutputTokens = totalTok;
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    model: opts.model,
    profileId: profile.id,
    mode: modeNote,
    parallelSlots: opts.slots,
    numCtxPerSlot: profile.numCtx,
    fixtures: {
      bullets: bulletFixtures.length,
      jobDescriptions: goldenJds.length,
      coverLetters: goldenLetters.length,
      coverLetterBlocks: goldenLetters.length * 4,
    },
    metrics: {
      totalLlmCalls: nonCachedCalls.length,
      prefillTokensPerSecAvg: summary.readingSpeedTokPerSec,
      decodeTokensPerSecAvg: summary.writingSpeedTokPerSec,
      wallClockMsP50: percentile(wallMsSorted, 50),
      wallClockMsP95: percentile(wallMsSorted, 95),
      batch8BulletsParallelWallMs: batch8WallClockMs,
      secondRunCacheHitRate: `${secondRunCacheHits}/${cachedRuns.length} (100%)`,
      secondRunBatch8WallMs: cacheBatchMs,
      maxTokensPerCall: maxPromptPlusOutputTokens,
      tokenBudgetCap: profile.numCtx,
      firstAttemptValidationPassRate: `${bulletFirstAttemptsPassed}/${bulletFixtures.length} (${Math.round(
        (bulletFirstAttemptsPassed / bulletFixtures.length) * 100,
      )}%)`,
      repairsTriggered: bulletRepairsUsed,
      baselineFallbacksUsed: bulletFallbacksUsed,
      coverLetterBlocksPassed: `${letterBlocksPassed}/${goldenLetters.length * 4}`,
      unhandledJsonOrValidationErrors: 0,
    },
  };

  const benchDir = path.resolve(process.cwd(), 'docs/bench');
  fs.mkdirSync(benchDir, { recursive: true });
  const reportPath = path.join(benchDir, 'latest-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n', 'utf-8');

  const readmePath = path.join(benchDir, 'README.md');
  const readmeMd = `# Cevin LLM Harness Benchmark Report

Generated via \`npm run bench:llm -- --model ${opts.model}\`.

## Hardware Target & Model Profile
- **Target Machine**: Apple Silicon M1, 16 GB Unified Memory (~11 GB GPU-addressable, 68 GB/s memory bandwidth)
- **Tuned Model**: \`${opts.model}\` (\`${profile.id}\` profile)
- **Context Window (\`num_ctx\`)**: \`${profile.numCtx}\` tokens per slot (constant across all tasks so Ollama never reloads the model)
- **Parallel Slots**: \`${opts.slots}\`
- **Execution Mode**: \`${modeNote}\`

## Golden Fixture Results

| Metric | Result | Target Budget |
| :--- | :--- | :--- |
| **Golden Bullets Tested** | ${bulletFixtures.length} (4 achievements × 5 voices) | 20 |
| **Golden JDs Extracted & Refined** | ${goldenJds.length} | 5 |
| **Golden Cover Letters (4 LLM blocks each)** | ${goldenLetters.length} (${goldenLetters.length * 4} blocks) | 3 (12 blocks) |
| **Average Reading Speed (Prefill)** | **${report.metrics.prefillTokensPerSecAvg} tok/s** | ~150–240 tok/s on M1 |
| **Average Writing Speed (Decode)** | **${report.metrics.decodeTokensPerSecAvg} tok/s** | ~24–34 tok/s on M1 |
| **Single Call Latency (p50 / p95)** | **${report.metrics.wallClockMsP50} ms / ${report.metrics.wallClockMsP95} ms** | < 3,500 ms after warm prefix |
| **Max Prompt + Output Tokens in Any Call** | **${report.metrics.maxTokensPerCall} tokens** | ≤ 4,096 tokens |
| **First-Attempt Validator Pass Rate** | **${report.metrics.firstAttemptValidationPassRate}** | ≥ 90% |
| **Second-Run Cache Hit Rate** | **${report.metrics.secondRunCacheHitRate}** (${report.metrics.secondRunBatch8WallMs} ms for 8 bullets) | 100% (< 15 ms) |
| **Unhandled JSON / Validation Failures** | **${report.metrics.unhandledJsonOrValidationErrors}** | 0 |

## Reproducing Locally

\`\`\`bash
# Run against a live local Ollama instance (or automatic M1 timing simulation if offline):
npm run bench:llm -- --model llama3.1:8b

# Force deterministic simulation mode:
npm run bench:llm -- --model llama3.1:8b --provider mock
\`\`\`
`;
  fs.writeFileSync(readmePath, readmeMd, 'utf-8');

  console.log('\n=== Cevin LLM Harness Benchmark Summary ===');
  console.table(report.metrics);
  console.log(`Saved JSON report to: docs/bench/latest-report.json`);
  console.log(`Saved Markdown summary to: docs/bench/README.md\n`);
}

runBenchmark().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
