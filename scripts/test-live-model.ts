import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  createModelProfileCatalog,
  createOllamaProvider,
} from '../src/adapters/driven/llm';
import {
  createInMemoryPerformanceLog,
  createInMemoryResultCache,
} from '../src/adapters/driven/storage';
import {
  createDemoBankSnapshot,
  createLlmGateway,
  refineJobBriefTask,
  rewriteBulletTask,
  writeSummaryTask,
} from '../src/core/application';
import { validateBulletGrounding } from '../src/core/domain';

const OLLAMA_ENDPOINT = process.env.OLLAMA_ENDPOINT || 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama3.1:8b';
const RECORD_MODE = process.argv.includes('--record');
const FIXTURE_PATH = path.resolve(
  process.cwd(),
  'src/tests/fixtures/llama3_1_real_outputs.json',
);

async function main() {
  console.log(
    `[Tier 3 Live LLM Runner] Checking Ollama at ${OLLAMA_ENDPOINT} (model: ${OLLAMA_MODEL})...`,
  );

  const provider = createOllamaProvider({
    baseUrl: OLLAMA_ENDPOINT,
    model: OLLAMA_MODEL,
    embeddingModel: '',
    numCtx: 4096,
  });

  let models;
  try {
    models = await provider.listModels();
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(
      `[Tier 3 Live LLM Runner] SKIPPED — Local Ollama is not reachable at ${OLLAMA_ENDPOINT} (${msg}).`,
    );
    console.log(
      `[Tier 3 Live LLM Runner] Tip: On your machine with Ollama running, run "npm run test:live-llm" (or "npm run test:live-llm -- --record" to update golden snapshots).`,
    );
    process.exit(0);
  }

  const hasModel = models.some(
    (m) => m.id === OLLAMA_MODEL || m.id.startsWith(OLLAMA_MODEL.split(':')[0]),
  );
  if (!hasModel) {
    console.log(
      `[Tier 3 Live LLM Runner] SKIPPED — Connected to Ollama, but model "${OLLAMA_MODEL}" is not pulled. Available: ${models.map((m) => m.id).join(', ') || 'none'}.`,
    );
    process.exit(0);
  }

  const profileCatalog = createModelProfileCatalog();
  const resultCache = createInMemoryResultCache(100);
  const performanceLog = createInMemoryPerformanceLog(100);
  let seq = 1;

  const gateway = createLlmGateway({
    getProviderAndProfile: async () => ({
      provider,
      providerId: 'ollama',
      modelName: OLLAMA_MODEL,
      profile: profileCatalog.resolveForModel(OLLAMA_MODEL),
      parallelSlots: 1,
    }),
    resultCache,
    performanceLog,
    idGen: { nextId: (p = 'live') => `${p}-${seq++}` },
    clock: { nowIso: () => new Date().toISOString() },
  });

  const bank = createDemoBankSnapshot();

  // 1. Live Bullet Rewrite + Grounding & Metric Preservation Check
  console.log('[1/3] Testing live rewriteBulletTask with metric preservation...');
  const bulletInput = {
    bulletId: 'live-ach-1',
    action:
      'Re-architected multi-region Kubernetes metric ingestion pipeline in Go and Kafka',
    result:
      'sustaining 1.4M events/sec while cutting cross-AZ egress spend by 38%',
    metric: '1.4M events/sec, 38%',
    company: 'Vanguard Telemetry',
    roleTitle: 'Staff Platform Engineer',
    allowedTerms: ['Go', 'Kafka', 'Kubernetes'],
    jdOnlyTerms: ['Rust'],
    briefText:
      'ROLE: Staff Platform Engineer at Kestrel Pay | MUST-HAVES: Kubernetes, Go, Kafka',
    briefHash: 'live-1',
    voice: 'balanced' as const,
  };

  const bulletRes = await gateway.executeTask(rewriteBulletTask, bulletInput, {
    itemKey: 'live-bullet-1',
    priority: 'interactive',
    bypassCache: true,
  });

  console.log(`      Output (${bulletRes.durationMs}ms): "${bulletRes.text}"`);
  assert.ok(bulletRes.text.length >= 25, 'Bullet must be non-trivial');
  assert.ok(
    bulletRes.text.includes('1.4M') || bulletRes.text.includes('38%'),
    `Bullet must preserve quantitative metric: "${bulletRes.text}"`,
  );
  const grounding = validateBulletGrounding(bulletRes.text, ['ach-1'], bank);
  assert.equal(
    grounding.unverifiedClaims.length,
    0,
    `Expected 0 fabricated claims, got: ${grounding.unverifiedClaims.join(', ')}`,
  );

  // 2. Live Executive Summary Generation
  console.log('[2/3] Testing live writeSummaryTask...');
  const sumInput = {
    headline: 'Staff Infrastructure & Platform Engineer',
    targetRole: 'Staff Infrastructure Engineer',
    targetCompany: 'Kestrel Pay',
    verifiedSkills: ['Kubernetes', 'Go', 'Kafka', 'PostgreSQL', 'Terraform'],
    verifiedCompanies: ['Vanguard Telemetry', 'Apex Cloud'],
    topMetricSnippet: '1.4M events/sec and 38% egress reduction',
    briefText: 'ROLE: Staff Infrastructure Engineer at Kestrel Pay',
    briefHash: 'live-sum',
    voice: 'balanced' as const,
  };
  const sumRes = await gateway.executeTask(writeSummaryTask, sumInput, {
    itemKey: 'live-sum-1',
    priority: 'interactive',
    bypassCache: true,
  });
  console.log(`      Output (${sumRes.durationMs}ms): "${sumRes.text}"`);
  assert.ok(sumRes.text.length >= 30, 'Summary must be non-empty');

  // 3. Live Structured JSON Job Brief Refinement
  console.log('[3/3] Testing live refineJobBriefTask (JSON compliance)...');
  const briefRes = await gateway.executeTask(
    refineJobBriefTask,
    {
      deterministicBriefText:
        'ROLE: Staff Infrastructure Engineer at Kestrel Pay',
      rawSnippet:
        'Staff Infrastructure Engineer — Kestrel Pay. Must have Kubernetes, Go, Kafka, and PostgreSQL.',
      defaultTitle: 'Staff Infrastructure Engineer',
      defaultCompany: 'Kestrel Pay',
      defaultSeniority: 'Staff',
      defaultTopSkills: ['Kubernetes', 'Go', 'Kafka', 'PostgreSQL'],
    },
    {
      itemKey: 'live-brief-1',
      priority: 'interactive',
      bypassCache: true,
    },
  );
  console.log(`      Output (${briefRes.durationMs}ms): ${briefRes.text}`);
  const parsedBrief = JSON.parse(briefRes.text);
  assert.ok(parsedBrief.title, 'Parsed brief JSON must include title');

  if (RECORD_MODE && fs.existsSync(FIXTURE_PATH)) {
    const existing = JSON.parse(fs.readFileSync(FIXTURE_PATH, 'utf8'));
    existing.recordedAt = new Date().toISOString();
    existing.model = OLLAMA_MODEL;
    existing.cases.bullet_rewrite_with_preamble.rawCompletion = bulletRes.text;
    existing.cases.bullet_rewrite_with_preamble.expectedCleanText =
      bulletRes.text;
    existing.cases.summary_rewrite_fenced.rawCompletion = sumRes.text;
    fs.writeFileSync(FIXTURE_PATH, JSON.stringify(existing, null, 2) + '\n');
    console.log(
      `[Tier 3 Live LLM Runner] Updated golden fixture at ${FIXTURE_PATH}`,
    );
  }

  console.log('[Tier 3 Live LLM Runner] ALL LIVE MODEL CHECKS PASSED.');
}

main().catch((err) => {
  console.error('[Tier 3 Live LLM Runner] FAILED:', err);
  process.exit(1);
});
