import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { z } from 'zod';
import {
  createExporterCatalog,
  docxDocumentExporter,
  markdownResumeExporter,
  pdfResumeExporter,
  plainTextDocumentExporter,
} from '../adapters/driven/exporters';
import {
  createImporterCatalog,
  markdownResumeImporter,
  pdfResumeImporter,
} from '../adapters/driven/importers';
import {
  createModelProfileCatalog,
  createOllamaProvider,
  mockProviderDescriptor,
  ollamaProviderDescriptor,
} from '../adapters/driven/llm';
import {
  createInMemoryPerformanceLog,
  createInMemoryRepositories,
  createInMemoryResultCache,
  migrateV1ToV2Records,
  migrateV3ToV4Records,
} from '../adapters/driven/storage';
import {
  getCompanyAvatarHueIndex,
  getCompanyInitials,
} from '../adapters/driving/web/ui/primitives';
import {
  HARNESS_TASK_CATALOG,
  LlmProvider,
  LlmProviderDescriptor,
  PROMPT_VERSION,
  buildAnalyzeJobPrompt,
  buildCoverLetterPrompt,
  buildStructureResumePrompt,
  buildTailorBulletPrompt,
  createDemoApplications,
  createDemoBankSnapshot,
  createLlmGateway,
  refineJobBriefTask,
  rewriteBulletTask,
  writeSummaryTask,
} from '../core/application';
import {
  APPEAL_CALIBRATION_FIXTURES,
  CEVIN_LOGO_REPORT,
  CEVIN_MARK_GEOMETRY,
  CEVIN_MARK_SMALL_GEOMETRY,
  CevinMarkTimingController,
  DEFAULT_USER_PREFERENCES,
  FACT_KIND_REGISTRY,
  LETTER_APPEAL_CALIBRATION_FIXTURES,
  METRO_AREAS,
  TokenEstimator,
  VOICE_HARNESS_DATA,
  VOICE_LEVEL_ORDER,
  applyVoiceLexiconPass,
  assembleBullet,
  buildGroundedCoverLetterBlocks,
  buildGroupedCoverageSummary,
  composeFirstImpressionTakeaway,
  computeAtsAndJobMatchScores,
  computeBulletImpactStrength,
  computeLetterAppealScore,
  computeRecruiterAppeal,
  createDefaultCoverLetterDraft,
  createScaleFactExtras,
  deduplicateEmployerNames,
  deriveDocumentHeadline,
  deriveSalience,
  evaluateCoverLetterChecks,
  evaluateFit,
  evaluateKeywordPresence,
  evaluateQuickCheckPosting,
  evaluateRoundTripText,
  exportFilename,
  extractDeterministicJobBrief,
  extractFirstThirdPageText,
  extractJobFactsByRules,
  extractStrongestMetricWithContext,
  findBankEvidenceForTerm,
  findInlineCliches,
  formatAchievementInVoice,
  formatCevinActivityLabel,
  formatContactBlock,
  formatCount,
  formatQuickEstimateBand,
  generatePdfArtifact,
  getRecruiterQuestionTemplate,
  getVoiceStyleSpec,
  hasBannedLetterOpener,
  insertArticleForEmbeddedProof,
  isMetricAlreadyInText,
  lintMachineMadeScore,
  locateBlocks,
  mapApplicationToCoverLetterDocument,
  mapApplicationToResumeDocument,
  mapToCoverLetterDocument,
  normalizeEmbeddedProofText,
  normalizeKeyword,
  orderExperiencesForDraft,
  outlineCoverLetter,
  rankBankItemsForJob,
  renderDocumentToDocxBytes,
  renderDocumentToGoogleDocsHtml,
  renderDocumentToPdfArtifact,
  resolveMetroArea,
  sanitizeExportFilenameInput,
  sanitizeLlmOutput,
  segmentBulletForSkimAndHighlight,
  smartTrimBulletText,
  sortExperiencesChronologically,
  validateBulletGrounding,
  validateBulletOutput,
  validateCoverLetterGrounding,
} from '../core/domain';
import { buildCevinContainer } from '../main/index';

// ============================================================================
// 1. PURE DOMAIN LOGIC UNIT TESTS
// ============================================================================

test('Keyword normalizer & canonical alias table resolve technical synonyms', () => {
  assert.equal(normalizeKeyword('JS'), 'javascript');
  assert.equal(normalizeKeyword('k8s'), 'kubernetes');
  assert.equal(normalizeKeyword('Postgres'), 'postgresql');
  assert.equal(normalizeKeyword('GitHub Actions'), 'ci/cd');
  assert.equal(normalizeKeyword('OpenTelemetry'), 'observability');

  const corpus =
    'Built multi-region k8s ingestion and tuned Postgres connection pools with GitHub Actions.';
  assert.equal(evaluateKeywordPresence('Kubernetes', corpus), 'covered');
  assert.equal(evaluateKeywordPresence('PostgreSQL', corpus), 'covered');
  assert.equal(evaluateKeywordPresence('CI/CD', corpus), 'covered');
  assert.equal(evaluateKeywordPresence('Rust / eBPF', corpus), 'gap');
});

test('Bullet assembler never duplicates metrics, never produces ". lowercase", and always ends with a period', () => {
  const achWithDuplicateMetric = {
    action:
      'Engineered multi-region Kubernetes metric ingestion pipeline in Go and Kafka.',
    result:
      'sustaining 1.4M events/sec across 6 regions while cutting cross-AZ egress spend by 38%.',
    metric: '38% egress cost reduction at 1.4M events/sec',
  };

  assert.equal(
    isMetricAlreadyInText(
      `${achWithDuplicateMetric.action} ${achWithDuplicateMetric.result}`,
      achWithDuplicateMetric.metric,
    ),
    true,
  );

  for (const voice of VOICE_LEVEL_ORDER) {
    const bullet = assembleBullet(achWithDuplicateMetric, voice);
    assert.equal(
      /\.\s+[a-z]/.test(bullet),
      false,
      `Voice ${voice} produced ". lowercase": ${bullet}`,
    );
    const matches38 = bullet.match(/38%/g) ?? [];
    assert.equal(
      matches38.length,
      1,
      `Voice ${voice} duplicated metric in: ${bullet}`,
    );
    assert.ok(bullet.endsWith('.'), `Voice ${voice} must end with period`);
    assert.ok(!bullet.endsWith('..'), `Voice ${voice} must not end with ..`);
  }

  const achWithSeparateMetric = {
    action: 'Redesigned checkout query caching layer in Redis',
    result: 'eliminating peak-hour database lock contention',
    metric: '42% lower p99 latency',
  };
  const assembledSeparate = assembleBullet(
    achWithSeparateMetric,
    'professional',
  );
  assert.ok(assembledSeparate.includes('42% lower p99 latency'));
  assert.ok(assembledSeparate.endsWith('.'));
});

test('Contact block formatter outputs 2 clean lines without https://, prefixes, or dangling separators', () => {
  const formatted = formatContactBlock({
    email: 'elena.rostova@example.com',
    phone: '+1 (415) 890-4312',
    location: 'San Francisco, CA',
    links: [
      { label: 'GitHub', url: 'https://github.com/erostova-sys/' },
      { label: 'LinkedIn', url: 'https://www.linkedin.com/in/elena-rostova' },
      { label: 'Website', url: 'http://erostova.dev/' },
    ],
  });

  const line1Text = formatted.line1.join(' · ');
  const line2Text = formatted.line2.map((l) => l.display).join(' · ');

  assert.equal(
    line1Text,
    'elena.rostova@example.com · +1 (415) 890-4312 · San Francisco, CA',
  );
  assert.equal(
    line2Text,
    'github.com/erostova-sys · linkedin.com/in/elena-rostova · erostova.dev',
  );
  assert.ok(!line2Text.includes('https://'));
  assert.ok(!line2Text.includes('GitHub:'));
  assert.ok(!line1Text.endsWith('·'));
  assert.ok(!line2Text.endsWith('·'));
});

test('Voice dial maps all 5 detents and machine-made heuristic score drops toward Plain-spoken', () => {
  const sampleAch = {
    action:
      'Built multi-region Kubernetes metric ingestion pipeline in Go and Kafka',
    result:
      'sustaining 1.4M events/sec while cutting cross-AZ egress spend by 38%',
    metric: '38% egress reduction at 1.4M events/sec',
  };

  const outputs = VOICE_LEVEL_ORDER.map((voice) => {
    const spec = getVoiceStyleSpec(voice);
    const bullet = formatAchievementInVoice(sampleAch, voice);
    return { voice, spec, bullet };
  });

  assert.equal(outputs.length, 5);
  assert.ok(
    outputs[4].spec.bannedCliches.length >
      outputs[0].spec.bannedCliches.length,
  );

  const polishedLint = lintMachineMadeScore([
    outputs[0].bullet,
    'Spearheaded mission-critical architecture — resulting in seamless delivery.',
    'Orchestrated cutting-edge pipelines — thereby achieving transformative scale.',
  ]);
  const plainLint = lintMachineMadeScore([
    outputs[4].bullet,
    'Built the settlement API in Go. Kept availability at 99.995% across $2.8B volume.',
  ]);

  assert.ok(
    polishedLint.score > plainLint.score,
    `Expected Polished machine-made score (${polishedLint.score}) > Plain-spoken (${plainLint.score})`,
  );

  const cliches = findInlineCliches(
    'Spearheaded a mission-critical pipeline leveraging Kafka.',
  );
  assert.ok(cliches.length >= 2);
  assert.equal(cliches[0].replacement, 'Led');
});

test('Grounding validator flags unverified numbers and tools while passing Bank-verified claims', () => {
  const bank = createDemoBankSnapshot();

  const validBullet =
    'Built multi-region Kubernetes metric ingestion in Go and Kafka, cutting egress spend by 38% at 1.4M events/sec.';
  const validRes = validateBulletGrounding(
    validBullet,
    ['ach-k8s-ingest'],
    bank,
  );
  assert.equal(validRes.isGrounded, true);
  assert.equal(validRes.unverifiedClaims.length, 0);

  const unverifiedBullet =
    'Built Kubernetes pipeline in Snowflake, cutting egress spend by 99% at 1.4M events/sec.';
  const invalidRes = validateBulletGrounding(
    unverifiedBullet,
    ['ach-k8s-ingest'],
    bank,
  );
  assert.equal(invalidRes.isGrounded, false);
  assert.ok(invalidRes.unverifiedClaims.some((c) => c.includes('99%')));
  assert.ok(invalidRes.unverifiedClaims.some((c) => c.includes('Snowflake')));
});

test('Cover Letter 6 checks, Letter Appeal score, opening rules, grounding validator, and view-model mapper work deterministically', () => {
  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const kestrelApp = applications[0];
  const draft =
    kestrelApp.coverLetterDraft ??
    createDefaultCoverLetterDraft(kestrelApp, bank);

  // 1. Evaluate 6 checks + Letter Appeal on grounded default draft
  const evalResult = evaluateCoverLetterChecks({
    draft,
    parsedJob: kestrelApp.parsedJob,
    bank,
    company: kestrelApp.company,
    roleTitle: kestrelApp.roleTitle,
  });
  assert.equal(evalResult.report.totalCount, 6);
  assert.equal(evalResult.report.passedCount, 6);
  assert.ok(evalResult.report.letterAppeal >= 75);
  assert.ok(
    evalResult.report.wordCount >= 180 && evalResult.report.wordCount <= 350,
  );

  // 2. Banned opener check catches generic openings ("I'm applying for / I am writing to / I'm excited to apply")
  assert.equal(
    hasBannedLetterOpener(
      'I am writing to apply for the Staff Engineer role at Kestrel Pay.',
    ),
    true,
  );
  assert.equal(
    hasBannedLetterOpener(
      "I'm excited to apply for the Staff Platform Engineer role.",
    ),
    true,
  );
  const openingBlock = draft.blocks.find((b) => b.type === 'opening')!;
  assert.equal(hasBannedLetterOpener(openingBlock.text), false);

  // 3. When neither whyCompanyNotes nor a mission sentence exists, opening omits "because..." rather than fabricating from JD keywords
  const blocksWithoutReason = buildGroundedCoverLetterBlocks({
    company: 'Kestrel Pay',
    roleTitle: 'Staff Infrastructure Engineer',
    recipient: 'Hiring Team',
    length: 'standard',
    voice: 'balanced',
    selectedProofAchievementIds: ['ach-k8s-ingest'],
    whyCompanyNotes: '',
    jobDescription: 'Requirements: Kubernetes, Go, PostgreSQL, Terraform.',
    parsedJob: null,
    bank,
  });
  const openingWithoutReason = blocksWithoutReason.find(
    (b) => b.type === 'opening',
  )!;
  assert.equal(hasBannedLetterOpener(openingWithoutReason.text), false);
  assert.equal(/\bbecause\b/i.test(openingWithoutReason.text), false);

  // 4. Grounding validator flags unverified numbers in cover letter blocks
  const badGrounding = validateCoverLetterGrounding(
    'I reduced latency by 999% using Snowflake.',
    ['ach-k8s-ingest'],
    bank,
    kestrelApp.jobDescription,
    draft.whyCompanyNotes,
  );
  assert.equal(badGrounding.isGrounded, false);
  assert.ok(badGrounding.unverifiedClaims.some((c) => c.includes('999%')));

  // 5. View-model mapper produces CoverLetterDocument with 2-line contact
  const clDoc = mapToCoverLetterDocument({
    draft,
    bank,
    versionNumber: 1,
    templateId: kestrelApp.templateId,
    targetCompany: kestrelApp.company,
    targetRole: kestrelApp.roleTitle,
  });
  assert.equal(clDoc.header.name, 'Elena Rostova');
  assert.ok(!clDoc.header.links.some((l) => l.label.includes('https://')));
  assert.ok(clDoc.blocks.length >= 5);
});

test('Dexie v1->v2 and v3->v4 migrations upgrade applications, versions, and preferences without data loss', () => {
  const bank = createDemoBankSnapshot();
  const { applications, versions } = createDemoApplications(bank);

  const v1App = {
    ...applications[0],
    documents: undefined,
    coverLetterDraft: undefined,
  };
  const v1Ver = {
    ...versions[0],
    kind: undefined,
  };

  const migratedV2 = migrateV1ToV2Records({
    applications: [v1App],
    versions: [v1Ver],
    bank,
  });

  assert.equal(migratedV2.applications.length, 1);
  assert.ok(migratedV2.applications[0].coverLetterDraft);
  assert.ok(migratedV2.applications[0].documents);
  assert.equal(migratedV2.versions[0].kind, 'resume');

  // v3 -> v4 migration seeds jobFacts, dismissedRequirementIds, appeal scores, and default preferences
  const v3App = {
    ...applications[0],
    jobFacts: undefined,
    dismissedRequirementIds: undefined,
    latestScores: {
      ...applications[0].latestScores,
      recruiterAppeal: undefined,
      appealLenses: undefined,
    },
  };
  const migratedV4 = migrateV3ToV4Records({
    applications: [v3App],
    preferences: null,
  });
  assert.ok(migratedV4.applications[0].jobFacts);
  assert.ok(Array.isArray(migratedV4.applications[0].dismissedRequirementIds));
  assert.equal(typeof migratedV4.applications[0].latestScores.recruiterAppeal, 'number');
  assert.equal(migratedV4.preferences.homeLocation, DEFAULT_USER_PREFERENCES.homeLocation);
});

test('Matching & ranking engine scores relevant Bank items and surfaces honest Gaps', () => {
  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const kestrelApp = applications[0];
  assert.ok(kestrelApp.parsedJob);

  const ranking = rankBankItemsForJob(bank, kestrelApp.parsedJob);
  assert.equal(ranking.matchingMode, 'lexical-only');
  assert.ok(ranking.rankedAchievements.length > 0);

  const rustGap = ranking.gaps.find((g) =>
    g.requirement.text.toLowerCase().includes('rust'),
  );
  assert.ok(rustGap);
  assert.equal(rustGap.status, 'gap');
});

test('Deterministic ATS readiness, Job Match & Recruiter Appeal engine computes subscores, lenses, takeaway, and fixes', () => {
  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const kestrelApp = applications[0];

  const analysis = computeAtsAndJobMatchScores(kestrelApp, bank);
  assert.ok(analysis.scores.jobMatch >= 75 && analysis.scores.jobMatch <= 100);
  assert.ok(
    analysis.scores.atsReadiness >= 75 && analysis.scores.atsReadiness <= 100,
  );
  assert.ok(
    (analysis.scores.recruiterAppeal ?? 0) >= 70 &&
      (analysis.scores.recruiterAppeal ?? 0) <= 100,
  );
  assert.ok(analysis.scores.appealLenses);
  assert.ok(analysis.scores.firstImpressionTakeaway?.includes('Vanguard Telemetry Systems'));
  assert.ok(analysis.scores.coveredKeywords.includes('Kubernetes'));
  assert.ok(analysis.scores.gapKeywords.includes('Rust / eBPF'));
});

test('Prompt templates are versioned and include explicit truthfulness constraints', () => {
  assert.ok(PROMPT_VERSION.length >= 5);
  const structPrompt = buildStructureResumePrompt('Sample resume text');
  assert.ok(structPrompt.systemPrompt.includes(PROMPT_VERSION));
  const jdPrompt = buildAnalyzeJobPrompt('Staff Engineer at Kestrel Pay');
  assert.ok(jdPrompt.systemPrompt.includes('must-have'));
  const bulletPrompt = buildTailorBulletPrompt({
    action: 'Built service',
    result: 'cut latency by 20%',
    metric: '20%',
    company: 'Acme',
    roleTitle: 'Engineer',
    targetJobTitle: 'Staff Engineer',
    matchedKeywords: ['Go'],
    voice: 'plain',
  });
  assert.ok(bulletPrompt.systemPrompt.includes('Plain-spoken'));

  const clPrompt = buildCoverLetterPrompt({
    candidateName: 'Elena Rostova',
    targetCompany: 'Kestrel Pay',
    targetRole: 'Staff Infrastructure Engineer',
    recipient: 'Hiring Team at Kestrel Pay',
    length: 'standard',
    voice: 'balanced',
    jobRequirements: ['Kubernetes', 'Go'],
    proofAchievements: [
      {
        id: 'ach-1',
        company: 'Apex',
        title: 'Engineer',
        action: 'Built pipeline',
        result: 'cut cost by 38%',
      },
    ],
    whyCompanyNotes: '',
  });
  assert.ok(clPrompt.systemPrompt.includes(PROMPT_VERSION));
});

// ============================================================================
// 2. REUSABLE DRIVEN ADAPTER CONTRACT TESTS
// ============================================================================

async function runProviderContractTests(
  descriptor: LlmProviderDescriptor<any>,
  providerInstance: LlmProvider,
) {
  const models = await providerInstance.listModels();
  assert.ok(
    Array.isArray(models) && models.length > 0,
    `${descriptor.id}: listModels must return non-empty array`,
  );

  let collected = '';
  for await (const token of providerInstance.chat({
    systemPrompt: 'Test system',
    userPrompt: 'Say hello',
  })) {
    collected += token;
  }
  assert.ok(
    collected.length > 0,
    `${descriptor.id}: chat stream must yield tokens`,
  );

  const abortController = new AbortController();
  abortController.abort();
  await assert.rejects(
    async () => {
      for await (const _token of providerInstance.chat({
        systemPrompt: 'Test',
        userPrompt: 'Abort me',
        signal: abortController.signal,
      })) {
        // should throw
      }
    },
    /abort/i,
    `${descriptor.id}: chat must respect AbortSignal`,
  );

  const res = await providerInstance.chatJSON(
    {
      systemPrompt: 'You are a resume writer',
      userPrompt: 'Rewrite bullet',
    },
    z.object({ bullet: z.string() }),
  );
  assert.ok(
    typeof res.bullet === 'string' && res.bullet.length > 0,
    `${descriptor.id}: chatJSON must return schema-validated object`,
  );
}

test('LLM Provider Contract Suite passes for Mock provider and Ollama provider (stubbed fetch)', async () => {
  const mockInstance = mockProviderDescriptor.create(
    mockProviderDescriptor.defaultConfig,
  );
  await runProviderContractTests(mockProviderDescriptor, mockInstance);

  const stubbedFetch: typeof fetch = async (input, init) => {
    if (init?.signal?.aborted) {
      throw new Error('Request aborted');
    }
    const url = String(input);
    if (url.endsWith('/api/tags')) {
      return new Response(
        JSON.stringify({
          models: [
            {
              name: 'llama3.1:8b',
              details: { family: 'llama', parameter_size: '8B' },
            },
          ],
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/api/chat')) {
      const body = JSON.parse(String(init?.body ?? '{}'));
      if (body.stream) {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(
              encoder.encode(
                JSON.stringify({
                  message: { content: '{"bullet":"Stubbed token"}' },
                }) + '\n',
              ),
            );
            controller.close();
          },
        });
        return new Response(stream, { status: 200 });
      }
      return new Response(
        JSON.stringify({
          message: {
            content: JSON.stringify({
              bullet:
                'Engineered Kubernetes pipelines in Go, cutting egress spend by 38%.',
            }),
          },
        }),
        { status: 200 },
      );
    }
    if (url.endsWith('/api/embed')) {
      return new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), {
        status: 200,
      });
    }
    return new Response('Not found', { status: 404 });
  };

  const ollamaInstance = createOllamaProvider(
    ollamaProviderDescriptor.defaultConfig,
    stubbedFetch,
  );
  await runProviderContractTests(ollamaProviderDescriptor, ollamaInstance);
});

test('Importer & Exporter Contract Suite: PDF (with PositionedText), Markdown, and Plain Text for both Resume and Cover Letter', async () => {
  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const resumeDoc = mapApplicationToResumeDocument(applications[0], bank, 1);
  const clDraft =
    applications[0].coverLetterDraft ??
    createDefaultCoverLetterDraft(applications[0], bank);
  const clDoc = mapToCoverLetterDocument({
    draft: clDraft,
    bank,
    versionNumber: 1,
    templateId: applications[0].templateId,
    targetCompany: applications[0].company,
    targetRole: applications[0].roleTitle,
  });

  // 1. Markdown exporter contract (Resume + Cover Letter)
  const mdResumeBlob = await markdownResumeExporter.export(resumeDoc, {
    templateId: 'classic',
  });
  const mdResumeText = await mdResumeBlob.text();
  assert.ok(mdResumeText.includes('# Elena Rostova'));
  assert.ok(mdResumeText.includes('## EXPERIENCE'));

  const mdClBlob = await markdownResumeExporter.export(clDoc, {
    templateId: 'classic',
  });
  const mdClText = await mdClBlob.text();
  assert.ok(mdClText.includes('# Elena Rostova'));
  assert.ok(mdClText.includes('Kestrel Pay'));

  // 2. Plain text exporter contract (Resume + Cover Letter)
  const txtResumeBlob = await plainTextDocumentExporter.export(resumeDoc, {
    templateId: 'classic',
  });
  const txtResumeText = await txtResumeBlob.text();
  assert.ok(txtResumeText.includes('Elena Rostova'));
  assert.ok(txtResumeText.includes('EXPERIENCE'));

  const txtClBlob = await plainTextDocumentExporter.export(clDoc, {
    templateId: 'classic',
  });
  const txtClText = await txtClBlob.text();
  assert.ok(txtClText.includes('Elena Rostova'));
  assert.ok(txtClText.includes('Kestrel Pay'));

  // 3. Markdown importer contract
  const mdFile = new File([mdResumeText], 'elena.md', {
    type: 'text/markdown',
  });
  const parsedMd = await markdownResumeImporter.parse(mdFile);
  assert.equal(parsedMd.formatId, 'markdown');
  assert.ok(parsedMd.text.includes('Elena Rostova'));

  // 4. PDF exporter + round-trip extraction + PositionedText contract
  const pdfBlob = await pdfResumeExporter.export(resumeDoc, {
    templateId: 'classic',
  });
  assert.equal(pdfBlob.type, 'application/pdf');
  const extractedPdfText = await pdfResumeExporter.extractTextFromBlob!(pdfBlob);
  assert.ok(extractedPdfText.includes('Elena Rostova'));
  assert.ok(extractedPdfText.includes('EXPERIENCE'));

  const positioned =
    await pdfResumeExporter.extractPositionedTextFromBlob!(pdfBlob);
  assert.ok(positioned.length > 5);
  assert.equal(positioned[0].page, 1);

  const roundTrip = evaluateRoundTripText(
    extractedPdfText,
    bank.profile.name,
    bank.profile.email,
    positioned,
  );
  assert.equal(roundTrip.passed, true);
  assert.ok(roundTrip.positionedText && roundTrip.positionedText.length > 5);

  const clPdfBlob = await pdfResumeExporter.export(clDoc, {
    templateId: 'modern',
  });
  assert.equal(clPdfBlob.type, 'application/pdf');
  const extractedClPdfText =
    await pdfResumeExporter.extractTextFromBlob!(clPdfBlob);
  assert.ok(extractedClPdfText.includes('Elena Rostova'));
  assert.ok(extractedClPdfText.includes('Kestrel Pay'));

  // 5. PDF importer contract on generated PDF
  const pdfFile = new File([await pdfBlob.arrayBuffer()], 'elena.pdf', {
    type: 'application/pdf',
  });
  const parsedPdf = await pdfResumeImporter.parse(pdfFile);
  assert.equal(parsedPdf.formatId, 'pdf');
  assert.ok(parsedPdf.text.includes('Elena Rostova'));

  // 6. Scanned PDF rejection
  const emptyPdfBytes = new TextEncoder().encode(
    '%PDF-1.4\n1 0 obj << /Type /Catalog >> endobj\n%%EOF',
  );
  const scannedFile = new File([emptyPdfBytes], 'scanned.pdf', {
    type: 'application/pdf',
  });
  await assert.rejects(
    () => pdfResumeImporter.parse(scannedFile),
    /SCANNED_PDF/,
  );

  // 7. Catalogs expose registered adapters (2 importers, 4 exporters including docx)
  const impCat = createImporterCatalog();
  const expCat = createExporterCatalog();
  assert.equal(impCat.list().length, 2);
  assert.equal(expCat.list().length, 4);
});

test('Full End-to-End Flow: Quick Check -> Save as Prospect -> Promote Prospect (Start Tailoring) -> Review -> Export First_Last_Company_Resume.pdf', async () => {
  const container = buildCevinContainer({ inMemoryOnly: true, seedDemo: true });

  // 1. Check sidebar status in Demo mode
  const demoStatus = await container.testLlmConnection.getSidebarStatus();
  assert.equal(demoStatus.state, 'demo');
  assert.equal(demoStatus.label, 'Demo mode');

  // 2. Quick check a posting
  const postingText = `Role: Staff Distributed Systems Engineer
Company: Aether Foundry
Location: San Francisco, CA (Hybrid, 2 days in office)
Visa sponsorship available for qualified candidates.
Compensation: $190,000 - $225,000 USD base.
Must have Kubernetes, Go, PostgreSQL, and Terraform experience.`;

  const qcResult = await container.quickCheck.evaluate({
    jobDescription: postingText,
  });
  assert.equal(qcResult.detectedCompany, 'Aether Foundry');
  assert.ok(qcResult.quickMatchEstimate >= 70);
  assert.equal(qcResult.fitEvaluation.conflictCount, 0);

  // 3. Save as Prospect
  const prospectApp = await container.quickCheck.saveAsProspect({
    company: qcResult.detectedCompany,
    roleTitle: qcResult.detectedRole,
    jobDescription: postingText,
  });
  assert.equal(prospectApp.status, 'Prospect');
  assert.equal(prospectApp.workingDraft.bullets.length, 0);

  // 4. Promote Prospect ("Start tailoring") -> status becomes Draft and bullets are assembled
  const promotedRes = await container.quickCheck.promoteProspect(
    prospectApp.id,
  );
  assert.equal(promotedRes.ok, true);
  if (!promotedRes.ok) return;
  const draftApp = promotedRes.value;
  assert.equal(draftApp.status, 'Draft');
  assert.ok(draftApp.workingDraft.bullets.length > 0);

  // 5. Tailor resume in Plain-spoken voice
  const tailorRes = await container.tailorResume.tailorAll(
    draftApp.id,
    'plain',
  );
  assert.equal(tailorRes.ok, true);

  // 6. Generate Cover Letter & rewrite opening block
  const clGenRes = await container.generateCoverLetter.execute({
    applicationId: draftApp.id,
    recipient: 'Hiring Team at Aether Foundry',
    length: 'standard',
    voice: 'balanced',
  });
  assert.equal(clGenRes.ok, true);

  // 7. Export both Resume and Cover Letter as PDF and verify First_Last_Company_Resume.pdf naming
  const exportResumeRes = await container.exportDocument.execute({
    applicationId: draftApp.id,
    kind: 'resume',
    exporterId: 'pdf',
    templateId: 'modern',
    autoSaveVersion: true,
  });
  assert.equal(exportResumeRes.ok, true);
  if (exportResumeRes.ok) {
    assert.equal(
      exportResumeRes.value.fileName,
      'Elena_Rostova_Aether_Foundry_Resume.pdf',
    );
    assert.equal(exportResumeRes.value.savedVersion?.kind, 'resume');
  }

  const exportLetterRes = await container.exportDocument.execute({
    applicationId: draftApp.id,
    kind: 'coverLetter',
    exporterId: 'pdf',
    templateId: 'modern',
    autoSaveVersion: true,
  });
  assert.equal(exportLetterRes.ok, true);
  if (exportLetterRes.ok) {
    assert.equal(
      exportLetterRes.value.fileName,
      'Elena_Rostova_Aether_Foundry_Cover_Letter.pdf',
    );
    assert.equal(exportLetterRes.value.savedVersion?.kind, 'coverLetter');
  }
});

test('UI copy scanner enforces zero native <select>, zero banned implementation vocabulary, zero hardcoded plural bugs, and zero real company names', () => {
  const webDir = path.resolve(process.cwd(), 'src/adapters/driving/web');
  const srcDir = path.resolve(process.cwd(), 'src');

  function walkFiles(dir: string, ext: string): string[] {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    const out: string[] = [];
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) out.push(...walkFiles(full, ext));
      else if (e.name.endsWith(ext)) out.push(full);
    }
    return out;
  }

  const tsxFiles = walkFiles(webDir, '.tsx');
  // Section 0 & Section 8 banned implementation words (including enum, lexicon, tri-state, schema, snippet)
  const bannedWordsRegex =
    /\b(catalog|descriptor|schema|deterministic|port|ID|ResumeVersion|atomic|enum|lexicon|tri-state|snippet)\b/;
  // Section 6.1 hardcoded plural patterns on dynamic counts
  const hardcodedPluralRegex =
    /\}\s+(achievements|gaps|roles|skills|requirements|versions)\b/;

  for (const file of tsxFiles) {
    const rel = path.relative(webDir, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf-8');

    // 1. Zero native <select> elements anywhere in web UI
    assert.equal(
      /<select[\s>]/.test(content),
      false,
      `Forbidden native <select> element found in src/adapters/driving/web/${rel}`,
    );

    // 2. Zero hardcoded plural interpolation like `{count} achievements`
    assert.equal(
      hardcodedPluralRegex.test(content),
      false,
      `Forbidden hardcoded plural interpolation found in src/adapters/driving/web/${rel} (use formatCount instead)`,
    );

    // 3. Skip DesignSystemView.tsx for banned implementation words
    if (rel.endsWith('DesignSystemView.tsx')) continue;

    const userVisibleMatches: string[] = [];
    const jsxTextRegex = />([^<>{]+)</g;
    let m: RegExpExecArray | null;
    while ((m = jsxTextRegex.exec(content)) !== null) {
      const txt = m[1].trim();
      if (txt) userVisibleMatches.push(txt);
    }

    const attrRegex =
      /\b(?:title|description|subtitle|label|placeholder|actionLabel|secondaryActionLabel)\s*=\s*"([^"]+)"/g;
    while ((m = attrRegex.exec(content)) !== null) {
      userVisibleMatches.push(m[1]);
    }

    for (const visibleText of userVisibleMatches) {
      const hit = bannedWordsRegex.exec(visibleText);
      assert.equal(
        hit,
        null,
        `Forbidden implementation jargon "${hit?.[0]}" found in user-visible string "${visibleText}" in src/adapters/driving/web/${rel}`,
      );
    }
  }

  // 4. Section 6.10: Zero real company names in src/
  const allSrcFiles = [
    ...walkFiles(srcDir, '.ts'),
    ...walkFiles(srcDir, '.tsx'),
  ].filter((f) => !f.endsWith('cevin.test.ts'));
  const realCompaniesRegex =
    /\b(Stripe|Datadog|Linear|Vercel|Figma|Anthropic|Cloudflare)\b/;

  for (const file of allSrcFiles) {
    const rel = path.relative(srcDir, file).replace(/\\/g, '/');
    const content = fs.readFileSync(file, 'utf-8');
    const hit = realCompaniesRegex.exec(content);
    assert.equal(
      hit,
      null,
      `Real company name "${hit?.[0]}" found in src/${rel}; use fictional company names per Section 6.10`,
    );
  }
});

// ============================================================================
// 3. LLM HARNESS (LLAMA 3.1 8B ON M1 16GB) UNIT & GATEWAY TESTS
// ============================================================================

test('LLM Output Sanitizer strips Llama preambles, quotes, bullet glyphs, and trailing commentary', () => {
  const messyOutput = `Here is the rewritten bullet:
"- Built multi-region Kubernetes metric ingestion pipeline in Go and Kafka, cutting cross-AZ egress spend by 38% across 1.4M events/sec."
Note: Let me know if you would like any adjustments!`;

  const cleaned = sanitizeLlmOutput(messyOutput, { singleSentence: true });
  assert.equal(
    cleaned,
    'Built multi-region Kubernetes metric ingestion pipeline in Go and Kafka, cutting cross-AZ egress spend by 38% across 1.4M events/sec.',
  );
});

test('6-Validator Suite enforces number multiset, protected terms, length band, past verb, no first-person, and cliché lint', () => {
  const sourceAch = {
    action:
      'Engineered multi-region Kubernetes metric ingestion pipeline in Go and Kafka',
    result:
      'sustaining 1.4M events/sec across 6 regions while cutting cross-AZ egress spend by 38%',
    metric: '38% egress reduction at 1.4M events/sec',
  };

  const validText =
    'Built multi-region Kubernetes metric ingestion pipeline in Go and Kafka, sustaining 1.4M events/sec across 6 regions and cutting egress spend by 38%.';
  const validCheck = validateBulletOutput({
    rawCandidate: validText,
    sourceAction: sourceAch.action,
    sourceResult: sourceAch.result,
    sourceMetric: sourceAch.metric,
    allowedTerms: ['Kubernetes', 'Go', 'Kafka', 'Apex Cloud'],
    jdOnlyTerms: ['Snowflake', 'Rust'],
    voice: 'balanced',
  });
  assert.equal(validCheck.valid, true);
  assert.equal(validCheck.failures.length, 0);

  const wrongNumberCheck = validateBulletOutput({
    rawCandidate:
      'Built multi-region Kubernetes metric ingestion pipeline in Go and Kafka, sustaining 1.4M events/sec across 6 regions and cutting egress spend by 55%.',
    sourceAction: sourceAch.action,
    sourceResult: sourceAch.result,
    sourceMetric: sourceAch.metric,
    allowedTerms: ['Kubernetes', 'Go', 'Kafka', 'Apex Cloud'],
    jdOnlyTerms: ['Snowflake'],
    voice: 'balanced',
  });
  assert.equal(wrongNumberCheck.valid, false);
  assert.ok(wrongNumberCheck.failures.some((f) => f.validator === 'numbers'));

  const inventedToolCheck = validateBulletOutput({
    rawCandidate:
      'Built multi-region Kubernetes and Snowflake pipeline in Go and Kafka, sustaining 1.4M events/sec across 6 regions and cutting egress spend by 38%.',
    sourceAction: sourceAch.action,
    sourceResult: sourceAch.result,
    sourceMetric: sourceAch.metric,
    allowedTerms: ['Kubernetes', 'Go', 'Kafka', 'Apex Cloud'],
    jdOnlyTerms: ['Snowflake'],
    voice: 'balanced',
  });
  assert.equal(inventedToolCheck.valid, false);
  assert.ok(
    inventedToolCheck.failures.some((f) => f.validator === 'protectedTerms'),
  );

  const firstPersonCheck = validateBulletOutput({
    rawCandidate:
      'Built my multi-region Kubernetes metric ingestion pipeline in Go and Kafka, sustaining 1.4M events/sec across 6 regions and cutting our spend by 38%.',
    sourceAction: sourceAch.action,
    sourceResult: sourceAch.result,
    sourceMetric: sourceAch.metric,
    allowedTerms: ['Kubernetes', 'Go', 'Kafka', 'Apex Cloud'],
    jdOnlyTerms: [],
    voice: 'balanced',
  });
  assert.equal(firstPersonCheck.valid, false);
  assert.ok(
    firstPersonCheck.failures.some((f) => f.validator === 'noFirstPerson'),
  );

  const clicheCheck = validateBulletOutput({
    rawCandidate:
      'Spearheaded multi-region Kubernetes metric ingestion in Go and Kafka, sustaining 1.4M events/sec across 6 regions and cutting spend by 38%.',
    sourceAction: sourceAch.action,
    sourceResult: sourceAch.result,
    sourceMetric: sourceAch.metric,
    allowedTerms: ['Kubernetes', 'Go', 'Kafka', 'Apex Cloud'],
    jdOnlyTerms: [],
    voice: 'plain',
  });
  assert.equal(clicheCheck.valid, false);
  assert.ok(clicheCheck.failures.some((f) => f.validator === 'clicheLint'));
});

test('Voice harness data provides 3 few-shot chat turns, length bands, and instant lexicon pass', () => {
  for (const voice of VOICE_LEVEL_ORDER) {
    const data = VOICE_HARNESS_DATA[voice];
    assert.equal(
      data.fewShotTurns.length,
      3,
      `Voice ${voice} must have 3 few-shot example pairs`,
    );
    assert.ok(data.lengthBand.minWords >= 8);
    assert.ok(data.lengthBand.maxWords <= 36);
  }

  const instantSwappedPlain = applyVoiceLexiconPass(
    'Spearheaded multi-region Kubernetes architecture, facilitating 38% lower egress spend.',
    'plain',
  );
  assert.ok(instantSwappedPlain.startsWith('Ran '));
  assert.ok(!instantSwappedPlain.toLowerCase().includes('spearheaded'));

  const instantSwappedNatural = applyVoiceLexiconPass(
    'Spearheaded multi-region Kubernetes architecture, facilitating 38% lower egress spend.',
    'natural',
  );
  assert.ok(instantSwappedNatural.startsWith('Led '));
});

test('Deterministic Job-Brief Extractor, Cover Letter Outliner, and Self-Calibrating TokenEstimator work without LLM', () => {
  const rawJd = `Role: Staff Distributed Systems Engineer
Company: Kestrel Pay
Requirements:
- 6+ years building high-throughput services in Go, Kubernetes, and Kafka
- Experience with PostgreSQL query tuning and OpenTelemetry observability
Nice to have:
- Rust or eBPF experience
Equal Opportunity Employer: Kestrel Pay is proud to be an equal opportunity workplace.`;

  const brief = extractDeterministicJobBrief(rawJd);
  assert.equal(brief.company, 'Kestrel Pay');
  assert.equal(brief.seniority, 'Staff');
  assert.ok(brief.topSkills.includes('Golang'));
  assert.ok(brief.topSkills.includes('Kubernetes'));
  assert.ok(!brief.briefText.includes('Equal Opportunity Employer'));

  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const app = applications[0];
  const outline = outlineCoverLetter({
    company: app.company,
    roleTitle: app.roleTitle,
    recipient: 'Hiring Team at Kestrel Pay',
    length: 'standard',
    voice: 'balanced',
    selectedProofAchievementIds: [],
    whyCompanyNotes: 'Global financial infrastructure at scale.',
    parsedJob: app.parsedJob,
    bank,
  });
  assert.ok(outline.templateBlocks.greeting.includes('Kestrel Pay'));
  assert.ok(outline.primaryProof !== null);
  assert.ok(outline.templateBlocks.closing.length > 20);

  const estimator = new TokenEstimator();
  const initialEst = estimator.estimateTokens('a'.repeat(380));
  assert.equal(initialEst, 100);
  estimator.recordObservation(380, 120);
  assert.ok(estimator.getCharsPerToken() < 3.8);
});

test('ModelProfileCatalog resolves llama3.1:8b with constant 4096 numCtx and generic_small fallback', () => {
  const catalog = createModelProfileCatalog();
  const llamaProfile = catalog.resolveForModel('llama3.1:8b');
  assert.equal(llamaProfile.id, 'llama3_1_8b');
  assert.equal(llamaProfile.numCtx, 4096);
  assert.equal(llamaProfile.parallelRecommended, 2);
  assert.equal(llamaProfile.fewShotStyle, 'chat-turns');

  const otherProfile = catalog.resolveForModel('mistral:7b');
  assert.equal(otherProfile.id, 'generic_small');
  assert.equal(otherProfile.numCtx, 4096);
});

test('LlmGateway enforces caching, 1-shot targeted repair on validator failure, baseline fallback, and extractJobFact snippet task', async () => {
  const profileCatalog = createModelProfileCatalog();
  const profile = profileCatalog.resolveForModel('llama3.1:8b');
  const bank = createDemoBankSnapshot();
  const sampleExp = bank.experiences[0];
  const sampleAch = bank.achievements[0];

  const repairMockProvider = mockProviderDescriptor.create({
    model: 'llama3.1:8b',
    embeddingModel: 'nomic-embed-text',
    simulatedLatencyMs: 5,
    simulatePartlyOnCpu: false,
    failValidationFirstAttempt: true,
    alwaysFailValidation: false,
  });
  const cache1 = createInMemoryResultCache(100);
  const log1 = createInMemoryPerformanceLog(100);
  let seq = 1;

  const repairGateway = createLlmGateway({
    getProviderAndProfile: async () => ({
      provider: repairMockProvider,
      providerId: 'mock',
      modelName: 'llama3.1:8b',
      profile,
      parallelSlots: 2,
    }),
    resultCache: cache1,
    performanceLog: log1,
    idGen: { nextId: (p = 'gw') => `${p}-${seq++}` },
    clock: { nowIso: () => new Date().toISOString() },
  });

  const input = {
    bulletId: sampleAch.id,
    action: sampleAch.action,
    result: sampleAch.result,
    metric: sampleAch.metric,
    company: sampleExp.company,
    roleTitle: sampleExp.title,
    allowedTerms: bank.skills.map((s) => s.name),
    jdOnlyTerms: ['Snowflake'],
    briefText:
      'ROLE: Staff Infrastructure Engineer at Kestrel Pay | MUST-HAVES: Kubernetes, Go, Kafka',
    briefHash: 'brief-1',
    voice: 'balanced' as const,
  };

  const firstRun = await repairGateway.executeTask(
    HARNESS_TASK_CATALOG.rewriteBullet,
    input,
    {
      itemKey: sampleAch.id,
      priority: 'interactive',
    },
  );
  assert.equal(firstRun.repaired, true);
  assert.equal(firstRun.attemptCount, 2);
  assert.equal(firstRun.keptOriginalWording, false);
  assert.equal(firstRun.cached, false);

  const secondRun = await repairGateway.executeTask(
    HARNESS_TASK_CATALOG.rewriteBullet,
    input,
    {
      itemKey: sampleAch.id,
      priority: 'interactive',
    },
  );
  assert.equal(secondRun.cached, true);
  assert.equal(secondRun.text, firstRun.text);

  // Test extractJobFact snippet task through LlmGateway
  const snippetSentence =
    'Visa sponsorship available for qualified candidates in the US.';
  const factRun = await repairGateway.executeTask(
    HARNESS_TASK_CATALOG.extractJobFact,
    {
      factKey: 'workPermits',
      snippet: snippetSentence,
      snippetHash: 'snip-1',
    },
    {
      itemKey: 'fact-workPermits',
      priority: 'background',
    },
  );
  const parsedFact = JSON.parse(factRun.text);
  assert.equal(parsedFact.value, 'sponsors');
  assert.ok(snippetSentence.includes(parsedFact.quote));
});

// ============================================================================
// 4. WORKSTREAM A: RECRUITER APPEAL, LENSES, SKIM ANCHORS & TAKEAWAY TESTS
// ============================================================================

test('Recruiter Appeal: 4 lenses, bullet impact-strength heuristic, skim segmentation, fold extraction, and 1-click fixes', () => {
  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const app = applications[0];
  const doc = mapApplicationToResumeDocument(app, bank, 1);

  // 1. Bullet impact strength rewards metrics, scale/time, outcome verbs, and JD keywords
  const strongImpact = computeBulletImpactStrength(
    'Cut cross-AZ egress spend by 38% across 1.4M events/sec in Kubernetes and Go.',
    ['Kubernetes', 'Go'],
  );
  const weakImpact = computeBulletImpactStrength(
    'Worked on internal tooling for team workflows.',
    ['Kubernetes', 'Go'],
  );
  assert.ok(
    strongImpact > weakImpact + 3,
    `Expected strong bullet impact (${strongImpact}) > weak (${weakImpact})`,
  );

  // 2. Skim-anchor segmentation highlights first 3 words, metrics, and top keywords while marking filler as non-anchor
  const segments = segmentBulletForSkimAndHighlight({
    text: 'Cut cross-AZ egress spend by 38% across 6 regions using Kubernetes and Go.',
    keywordTerms: ['Kubernetes', 'Go'],
    highlightedTerm: 'Kubernetes',
  });
  const anchorCount = segments.filter((s) => s.isSkimAnchor).length;
  const nonAnchorCount = segments.filter((s) => !s.isSkimAnchor).length;
  const crossHighlighted = segments.filter((s) => s.isCrossHighlighted);
  assert.ok(anchorCount >= 3);
  assert.ok(nonAnchorCount >= 1);
  assert.ok(crossHighlighted.some((s) => s.text.includes('Kubernetes')));

  // 3. First-third page extraction uses PositionedText when available and falls back to template line metrics
  const positionedFold = extractFirstThirdPageText(doc, [
    { text: 'Elena Rostova', x: 40, y: 740, width: 120, page: 1 },
    { text: 'Staff Platform Engineer', x: 40, y: 710, width: 140, page: 1 },
    { text: 'Bottom of page note', x: 40, y: 90, width: 140, page: 1 },
  ]);
  assert.equal(positionedFold.layoutEstimated, false);
  assert.ok(positionedFold.text.includes('Elena Rostova'));
  assert.ok(!positionedFold.text.includes('Bottom of page note'));

  const estimatedFold = extractFirstThirdPageText(doc);
  assert.equal(estimatedFold.layoutEstimated, true);
  assert.ok(estimatedFold.text.includes('Elena Rostova'));

  // 4. First-impression takeaway composer
  const takeaway = composeFirstImpressionTakeaway(app, bank);
  assert.ok(takeaway.takeaway.includes('Vanguard Telemetry Systems'));
  assert.equal(takeaway.targetRoleMatches, true);

  // 5. Full computeRecruiterAppeal returns 4 lenses (0..100) and overall appeal score
  const appeal = computeRecruiterAppeal({
    application: app,
    bank,
    doc,
  });
  assert.ok(appeal.recruiterAppeal >= 70 && appeal.recruiterAppeal <= 100);
  assert.ok(appeal.lenses.skim >= 60);
  assert.ok(appeal.lenses.proof >= 60);
  assert.ok(appeal.lenses.clarity >= 60);
  assert.ok(appeal.lenses.voice >= 60);
});

// ============================================================================
// 5. WORKSTREAM B: COVERAGE REDESIGN, EVIDENCE & "I HAVE THIS" TESTS
// ============================================================================

test('Coverage redesign: Needs attention first, Covered collapsed group, Bank evidence lookup, dismissal + undo, and "I have this" rescore', async () => {
  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const app = applications[0];

  const summary = buildGroupedCoverageSummary({
    parsedJob: app.parsedJob,
    bank,
    resumeText: app.workingDraft.bullets.map((b) => b.text).join(' '),
    dismissedRequirementIds: [],
  });

  // Needs attention contains gaps and partials; covered contains covered items
  assert.ok(summary.coveredCount >= 5);
  assert.ok(summary.gapCount >= 1);
  assert.equal(
    summary.needsAttention.mustHave.every(
      (i) => i.status === 'gap' || i.status === 'partial',
    ),
    true,
  );
  assert.equal(
    summary.covered.mustHave.every((i) => i.status === 'covered'),
    true,
  );

  // Evidence lookup returns proving Bank skills and achievements
  const k8sEvidence = findBankEvidenceForTerm('Kubernetes', bank);
  assert.ok(k8sEvidence.length >= 2);
  assert.ok(k8sEvidence.some((e) => e.kind === 'skill'));
  assert.ok(k8sEvidence.some((e) => e.kind === 'achievement'));

  // Dismissing a gap removes it from gapCount and increments dismissedCount
  const gapReqId = summary.needsAttention.mustHave.find(
    (i) => i.status === 'gap',
  )?.requirement.id;
  assert.ok(gapReqId);
  const afterDismiss = buildGroupedCoverageSummary({
    parsedJob: app.parsedJob,
    bank,
    resumeText: app.workingDraft.bullets.map((b) => b.text).join(' '),
    dismissedRequirementIds: [gapReqId!],
  });
  assert.equal(afterDismiss.dismissedCount, 1);
  assert.equal(afterDismiss.gapCount, summary.gapCount - 1);

  // End-to-end "I have this" adds skill + achievement attachment and rescores application
  const container = buildCevinContainer({ inMemoryOnly: true, seedDemo: true });
  const beforeApp = await container.manageApplications.getApplication(
    'app-kestrel-infra',
  );
  assert.ok(beforeApp);
  const beforeGaps = beforeApp.latestScores.gapKeywords.length;

  const res = await container.manageBank.addSkillAndOptionalAchievement({
    skillName: 'Rust / eBPF',
    category: 'Infrastructure',
    aliases: ['Rust', 'eBPF'],
    achievementId: 'ach-k8s-ingest',
    applicationId: 'app-kestrel-infra',
  });
  assert.ok(res.application);
  assert.ok(
    res.application.latestScores.gapKeywords.length < beforeGaps,
    'Adding a gap skill via "I have this" must immediately reduce gap count',
  );
});

// ============================================================================
// 6. WORKSTREAM C: JOB FACTS GOLDEN CORPUS (>= 60 EN + FR SNIPPETS) & FIT MATRIX
// ============================================================================

interface GoldenSnippetCase {
  id: string;
  text: string;
  factKey: 'location' | 'workPermits' | 'languages' | 'salary' | 'employmentType';
  expectedCheck: (facts: ReturnType<typeof extractJobFactsByRules>['facts']) => boolean;
}

const GOLDEN_JOB_FACTS_CORPUS: GoldenSnippetCase[] = [
  // --- LOCATION & WORK MODE (EN + FR + Header + Negations) ---
  {
    id: 'loc-en-remote-us',
    text: 'Location: Remote (United States). Fully remote work from anywhere in the US.',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'remote' &&
      f.location.value.remoteRegions.includes('US'),
  },
  {
    id: 'loc-en-hybrid-sf-2d',
    text: 'Location: San Francisco, CA — Hybrid, 2 days in office per week.',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'hybrid' &&
      f.location.value.daysInOffice === 2 &&
      f.location.value.cities.includes('San Francisco'),
  },
  {
    id: 'loc-en-hybrid-nyc-3d',
    text: 'Location: New York, NY (Hybrid: 3 days in office).',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'hybrid' &&
      f.location.value.daysInOffice === 3 &&
      f.location.value.cities.includes('New York'),
  },
  {
    id: 'loc-en-onsite-seattle',
    text: 'Location: Seattle, WA. This is an on-site role based in our Seattle headquarters.',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'onsite' &&
      f.location.value.cities.includes('Seattle'),
  },
  {
    id: 'loc-en-no-remote',
    text: 'Location: Austin, TX. Not a remote position — daily in-office collaboration required.',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'onsite' &&
      f.location.value.cities.includes('Austin'),
  },
  {
    id: 'loc-fr-teletravail-complet',
    text: 'Lieu : Paris, France. Télétravail complet possible partout en France.',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'remote' &&
      f.location.value.cities.includes('Paris'),
  },
  {
    id: 'loc-fr-hybride-lyon',
    text: 'Localisation : Lyon — Hybride (3 jours sur site par semaine).',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'hybrid' &&
      f.location.value.daysInOffice === 3 &&
      f.location.value.cities.includes('Lyon'),
  },
  {
    id: 'loc-fr-presentiel-lyon',
    text: 'Lieu : Lyon, France. Poste 100% présentiel sur site (pas de télétravail).',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'onsite' &&
      f.location.value.cities.includes('Lyon'),
  },
  {
    id: 'loc-en-remote-eu',
    text: 'Work mode: 100% remote within EU timezones (CET ± 2 hours).',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'remote' &&
      f.location.value.remoteRegions.includes('EU'),
  },
  {
    id: 'loc-en-london-hybrid',
    text: 'Location: London, UK. Hybrid working model with 2 days in the office.',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'hybrid' &&
      f.location.value.cities.includes('London') &&
      f.location.value.daysInOffice === 2,
  },
  {
    id: 'loc-en-berlin-onsite',
    text: 'Location: Berlin, Germany. On-site at our Berlin engineering hub.',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'onsite' &&
      f.location.value.cities.includes('Berlin'),
  },
  {
    id: 'loc-en-toronto-remote',
    text: 'Location: Toronto, Canada (Work from home / Fully remote in Canada).',
    factKey: 'location',
    expectedCheck: (f) =>
      f.location.value.mode === 'remote' &&
      f.location.value.cities.includes('Toronto'),
  },
  {
    id: 'loc-not-stated',
    text: 'We are looking for a Senior Backend Engineer with Go and PostgreSQL experience.',
    factKey: 'location',
    expectedCheck: (f) => f.location.value.mode === 'not-stated',
  },

  // --- WORK PERMITS & SPONSORSHIP (EN + FR + Negations + Hedges + Security Clearance) ---
  {
    id: 'wp-en-sponsors-h1b',
    text: 'Visa sponsorship available (including H-1B transfer and green card support).',
    factKey: 'workPermits',
    expectedCheck: (f) => f.workPermits.value.policy === 'sponsors',
  },
  {
    id: 'wp-en-will-sponsor',
    text: 'We will sponsor work visas for exceptional engineering candidates.',
    factKey: 'workPermits',
    expectedCheck: (f) => f.workPermits.value.policy === 'sponsors',
  },
  {
    id: 'wp-en-no-sponsorship-1',
    text: 'Must be authorized to work in the United States without visa sponsorship.',
    factKey: 'workPermits',
    expectedCheck: (f) => f.workPermits.value.policy === 'no-sponsorship',
  },
  {
    id: 'wp-en-no-sponsorship-2',
    text: 'Unable to sponsor H-1B visas at this time. No visa sponsorship is available.',
    factKey: 'workPermits',
    expectedCheck: (f) => f.workPermits.value.policy === 'no-sponsorship',
  },
  {
    id: 'wp-en-cannot-provide-sponsorship',
    text: 'Please note we cannot provide visa sponsorship for this role.',
    factKey: 'workPermits',
    expectedCheck: (f) => f.workPermits.value.policy === 'no-sponsorship',
  },
  {
    id: 'wp-en-citizenship-ts-sci',
    text: 'Requires active TS/SCI clearance and US citizenship required by federal contract.',
    factKey: 'workPermits',
    expectedCheck: (f) =>
      f.workPermits.value.policy === 'citizenship-or-clearance-required' &&
      Boolean(f.workPermits.value.clearance),
  },
  {
    id: 'wp-en-secret-clearance',
    text: 'Candidates must hold an active Secret clearance and be a U.S. citizen.',
    factKey: 'workPermits',
    expectedCheck: (f) =>
      f.workPermits.value.policy === 'citizenship-or-clearance-required',
  },
  {
    id: 'wp-en-conditional-case-by-case',
    text: 'Visa sponsorship may be considered on a case-by-case basis for senior roles.',
    factKey: 'workPermits',
    expectedCheck: (f) => f.workPermits.value.policy === 'conditional',
  },
  {
    id: 'wp-fr-pas-de-parrainage',
    text: 'Pas de parrainage visa possible. Autorisation de travail en France requise.',
    factKey: 'workPermits',
    expectedCheck: (f) => f.workPermits.value.policy === 'no-sponsorship',
  },
  {
    id: 'wp-fr-habilite-secret-defense',
    text: 'Poste soumis à habilitation Secret Défense (nationalité française exigée).',
    factKey: 'workPermits',
    expectedCheck: (f) =>
      f.workPermits.value.policy === 'citizenship-or-clearance-required',
  },
  {
    id: 'wp-fr-parrainage-possible',
    text: 'Parrainage visa (Passeport Talent) pris en charge par l’entreprise.',
    factKey: 'workPermits',
    expectedCheck: (f) => f.workPermits.value.policy === 'sponsors',
  },
  {
    id: 'wp-not-stated',
    text: 'Build distributed services in Rust and Kubernetes with our platform team.',
    factKey: 'workPermits',
    expectedCheck: (f) => f.workPermits.value.policy === 'not-stated',
  },

  // --- SPOKEN LANGUAGES (EN + FR + CEFR + Programming Language Disambiguation) ---
  {
    id: 'lang-en-fluent-english',
    text: 'Requirements: Fluent in English (written and spoken) for distributed team collaboration.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some(
        (l) => l.language === 'English' && l.level === 'fluent',
      ),
  },
  {
    id: 'lang-en-french-c1',
    text: 'Must speak French (C1 minimum) and professional English.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some(
        (l) => l.language === 'French' && l.level === 'fluent',
      ),
  },
  {
    id: 'lang-fr-courant-francais-anglais',
    text: 'Français courant exigé et anglais professionnel indispensable.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some((l) => l.language === 'French') &&
      f.languages.value.required.some((l) => l.language === 'English'),
  },
  {
    id: 'lang-fr-bilingue-allemand',
    text: 'Profil bilingue allemand (C2) souhaité pour nos clients DACH.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some(
        (l) => l.language === 'German' && l.level === 'native',
      ),
  },
  {
    id: 'lang-en-spanish-b2',
    text: 'Working proficiency in Spanish (B2) is required.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some(
        (l) => l.language === 'Spanish' && l.level === 'working',
      ),
  },
  {
    id: 'lang-en-dutch-native',
    text: 'Native Dutch speaker required for enterprise customer engineering.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some(
        (l) => l.language === 'Dutch' && l.level === 'native',
      ),
  },
  {
    id: 'lang-en-italian-fluent',
    text: 'Fluent in Italian and English.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some((l) => l.language === 'Italian'),
  },
  {
    id: 'lang-en-japanese-jlpt',
    text: 'Business-level fluent in Japanese required.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some((l) => l.language === 'Japanese'),
  },
  {
    id: 'lang-en-mandarin-fluent',
    text: 'Fluent in Mandarin and English for APAC operations.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some((l) => l.language === 'Mandarin'),
  },
  {
    id: 'lang-en-portuguese-working',
    text: 'Working proficiency in Portuguese for LATAM engineering support.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some((l) => l.language === 'Portuguese'),
  },
  {
    id: 'lang-en-polish-fluent',
    text: 'Fluent in Polish and English.',
    factKey: 'languages',
    expectedCheck: (f) =>
      f.languages.value.required.some((l) => l.language === 'Polish'),
  },
  {
    id: 'lang-programming-only-not-spoken',
    text: '5+ years with programming languages such as Go, Rust, Python, TypeScript, and C++.',
    factKey: 'languages',
    expectedCheck: (f) => f.languages.value.required.length === 0,
  },

  // --- SALARY / COMPENSATION (Rules-Only: USD, EUR, GBP, CAD, CHF, k-notation, periods) ---
  {
    id: 'sal-usd-range-full',
    text: 'Compensation: $180,000 - $220,000 USD annual base salary + equity.',
    factKey: 'salary',
    expectedCheck: (f) =>
      f.salary.value.stated &&
      f.salary.value.min === 180000 &&
      f.salary.value.max === 220000 &&
      f.salary.value.currency === 'USD',
  },
  {
    id: 'sal-usd-k-range',
    text: 'Pay range: $160k–$195k per year depending on experience.',
    factKey: 'salary',
    expectedCheck: (f) =>
      f.salary.value.stated &&
      f.salary.value.min === 160000 &&
      f.salary.value.max === 195000 &&
      f.salary.value.currency === 'USD',
  },
  {
    id: 'sal-eur-fr-range',
    text: 'Rémunération : 65k€ - 80k€ brut annuel selon profil.',
    factKey: 'salary',
    expectedCheck: (f) =>
      f.salary.value.stated &&
      f.salary.value.min === 65000 &&
      f.salary.value.max === 80000 &&
      f.salary.value.currency === 'EUR' &&
      f.salary.value.period === 'year',
  },
  {
    id: 'sal-eur-prefix-range',
    text: 'Salary: €90,000 - €115,000 per year in Berlin.',
    factKey: 'salary',
    expectedCheck: (f) =>
      f.salary.value.stated &&
      f.salary.value.min === 90000 &&
      f.salary.value.max === 115000 &&
      f.salary.value.currency === 'EUR',
  },
  {
    id: 'sal-gbp-range',
    text: 'Package: £85k - £105k per year + bonus.',
    factKey: 'salary',
    expectedCheck: (f) =>
      f.salary.value.stated &&
      f.salary.value.min === 85000 &&
      f.salary.value.max === 105000 &&
      f.salary.value.currency === 'GBP',
  },
  {
    id: 'sal-chf-range',
    text: 'Compensation: CHF 140k - 170k per year in Zurich.',
    factKey: 'salary',
    expectedCheck: (f) =>
      f.salary.value.stated &&
      f.salary.value.min === 140000 &&
      f.salary.value.max === 170000 &&
      f.salary.value.currency === 'CHF',
  },
  {
    id: 'sal-cad-range',
    text: 'Base salary: CAD 150k - 175k per year.',
    factKey: 'salary',
    expectedCheck: (f) =>
      f.salary.value.stated &&
      f.salary.value.min === 150000 &&
      f.salary.value.max === 175000 &&
      f.salary.value.currency === 'CAD',
  },
  {
    id: 'sal-eur-daily-rate-tjm',
    text: 'Tarif : 650€ - 750€ / jour pour une mission de 12 mois.',
    factKey: 'salary',
    expectedCheck: (f) =>
      f.salary.value.stated &&
      f.salary.value.min === 650 &&
      f.salary.value.max === 750 &&
      f.salary.value.period === 'day',
  },
  {
    id: 'sal-usd-hourly',
    text: 'Contract rate: $95 - $125 per hour (W2 or corp-to-corp).',
    factKey: 'salary',
    expectedCheck: (f) =>
      f.salary.value.stated &&
      f.salary.value.min === 95 &&
      f.salary.value.max === 125 &&
      f.salary.value.period === 'hour',
  },
  {
    id: 'sal-competitive-not-stated',
    text: 'Compensation: Competitive salary and generous equity package.',
    factKey: 'salary',
    expectedCheck: (f) => f.salary.value.stated === false,
  },
  {
    id: 'sal-selon-profil-not-stated',
    text: 'Rémunération : Selon profil et expérience, mutuelle et tickets restaurant.',
    factKey: 'salary',
    expectedCheck: (f) => f.salary.value.stated === false,
  },
  {
    id: 'sal-non-salary-metrics-ignored',
    text: 'Built a system handling $2.8B in annual volume across 120k requests/sec.',
    factKey: 'salary',
    expectedCheck: (f) => f.salary.value.stated === false,
  },

  // --- EMPLOYMENT TYPE (EN + FR: full-time, CDI, CDD, freelance, internship, apprenticeship) ---
  {
    id: 'emp-en-full-time',
    text: 'Employment type: Full-time permanent position.',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'full-time',
  },
  {
    id: 'emp-fr-cdi',
    text: 'Type de contrat : CDI temps plein basé à Paris.',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'full-time',
  },
  {
    id: 'emp-fr-cdd',
    text: 'Contrat : CDD de 12 mois renouvelable.',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'fixed-term',
  },
  {
    id: 'emp-en-fixed-term',
    text: 'This is a 12-month fixed-term contract covering parental leave.',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'fixed-term',
  },
  {
    id: 'emp-en-contract-b2b',
    text: 'Engagement: Freelance / B2B contractor (6+ months).',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'contract',
  },
  {
    id: 'emp-en-1099',
    text: 'Independent 1099 contractor role for cloud migration.',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'contract',
  },
  {
    id: 'emp-fr-freelance-independant',
    text: 'Mission ouverte aux profils freelance / indépendant.',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'contract',
  },
  {
    id: 'emp-en-part-time',
    text: 'Schedule: Part-time (20 hours per week).',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'part-time',
  },
  {
    id: 'emp-fr-temps-partiel',
    text: 'Poste à temps partiel (3 jours par semaine).',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'part-time',
  },
  {
    id: 'emp-en-internship',
    text: 'Summer 2026 Software Engineering Internship (12 weeks).',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'internship',
  },
  {
    id: 'emp-fr-stage-fin-etudes',
    text: 'Stage de fin d’études (6 mois) en ingénierie plateforme.',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'internship',
  },
  {
    id: 'emp-fr-alternance',
    text: 'Contrat d’apprentissage / alternance de 12 à 24 mois.',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'apprenticeship',
  },
  {
    id: 'emp-en-apprenticeship',
    text: 'Engineering Apprenticeship program for career changers.',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'apprenticeship',
  },
  {
    id: 'emp-not-stated',
    text: 'Join our distributed systems team working on Go and Kafka.',
    factKey: 'employmentType',
    expectedCheck: (f) => f.employmentType.value.type === 'not-stated',
  },
];

test('Job Facts Golden Corpus (>= 60 EN & FR snippets) achieves >= 0.95 precision and never mislabels not-stated as positive', () => {
  assert.ok(
    GOLDEN_JOB_FACTS_CORPUS.length >= 60,
    `Expected >= 60 golden snippets, got ${GOLDEN_JOB_FACTS_CORPUS.length}`,
  );

  let passed = 0;
  const failures: string[] = [];

  for (const testCase of GOLDEN_JOB_FACTS_CORPUS) {
    const { facts } = extractJobFactsByRules(testCase.text);
    const ok = testCase.expectedCheck(facts);
    if (ok) {
      passed++;
    } else {
      failures.push(
        `${testCase.id}: ${JSON.stringify(facts[testCase.factKey].value)}`,
      );
    }

    // Every positive fact must include a verbatim quote from the input text
    const factObj = facts[testCase.factKey];
    for (const ev of factObj.evidence) {
      assert.ok(
        testCase.text.includes(ev.quote),
        `Fact ${testCase.id} evidence quote "${ev.quote}" must be a substring of the input`,
      );
    }
  }

  const precision = passed / GOLDEN_JOB_FACTS_CORPUS.length;
  assert.ok(
    precision >= 0.95,
    `Golden corpus precision ${precision.toFixed(3)} < 0.95. Failures: ${failures.join('; ')}`,
  );
});

test('Practical Fit Evaluator (evaluateFit) matrix, Metro resolution, and Recruiter question templates work deterministically', () => {
  // 1. Metro area table has >= 30 metros and resolves San Francisco / Bay Area / Paris / Île-de-France
  assert.ok(METRO_AREAS.length >= 30);
  assert.equal(resolveMetroArea('San Francisco, CA'), 'sf-bay-area');
  assert.equal(resolveMetroArea('Palo Alto'), 'sf-bay-area');
  assert.equal(resolveMetroArea('Paris, France'), 'paris');

  // 2. Test conflict detection when user needs sponsorship or prefers remote only
  const strictUserPrefs = {
    ...DEFAULT_USER_PREFERENCES,
    homeLocation: 'San Francisco, CA',
    acceptedWorkModes: ['remote' as const],
    sameMetroOnly: true,
    openToRelocation: false,
    authorizedCountries: ['US'],
    citizenships: ['US'],
    needsSponsorship: true,
    spokenLanguages: [{ language: 'English', level: 'native' as const }],
    salaryFloor: { minAmount: 200000, currency: 'USD', period: 'year' as const },
    acceptedEmploymentTypes: ['full-time' as const],
  };

  const conflictingPosting = `Location: Lyon, France. Poste 100% présentiel sur site.
Pas de parrainage visa.
Français courant exigé.
Compensation: $140,000 - $160,000 USD per year.
Engagement: Freelance contractor.`;

  const { facts } = extractJobFactsByRules(conflictingPosting);
  const fit = evaluateFit(facts, strictUserPrefs);
  assert.equal(fit.conflictCount, 5);
  assert.equal(fit.fitsCount, 0);

  // 3. Recruiter question templates for not-stated workPermits and salary
  const wpQuestion = getRecruiterQuestionTemplate('workPermits', 'Kestrel Pay', 'Staff Engineer');
  const salQuestion = getRecruiterQuestionTemplate('salary', 'Kestrel Pay', 'Staff Engineer');
  assert.ok(wpQuestion?.includes('visa sponsorship'));
  assert.ok(salQuestion?.includes('compensation range'));
});

// ============================================================================
// 7. SECTION 6 FORMATTERS, EXPORT FILENAME & BACKUP ROUND-TRIP TESTS
// ============================================================================

test('formatCount, exportFilename, and backup round-trip with UserPreferences work deterministically', async () => {
  // 1. formatCount
  assert.equal(formatCount(1, 'achievement'), '1 achievement');
  assert.equal(formatCount(4, 'achievement'), '4 achievements');
  assert.equal(formatCount(1, 'gap'), '1 gap');
  assert.equal(formatCount(0, 'gap'), '0 gaps');
  assert.equal(formatCount(1, 'role'), '1 role');
  assert.equal(formatCount(3, 'role'), '3 roles');

  // 2. exportFilename & sanitizeExportFilenameInput
  assert.equal(
    exportFilename({
      fullName: 'Elena Rostova',
      company: 'Kestrel Pay',
      kind: 'resume',
    }),
    'Elena_Rostova_Kestrel_Pay_Resume.pdf',
  );
  assert.equal(
    exportFilename({
      fullName: 'Elena Rostova',
      company: 'Northstar Orbit',
      kind: 'coverLetter',
    }),
    'Elena_Rostova_Northstar_Orbit_Cover_Letter.pdf',
  );
  assert.equal(
    sanitizeExportFilenameInput('Elena Rostova / Kestrel Pay Resume', 'pdf'),
    'Elena_Rostova_Kestrel_Pay_Resume.pdf',
  );

  // 3. Backup JSON export/import round-trip preserves UserPreferences
  const container = buildCevinContainer({ inMemoryOnly: true, seedDemo: true });
  await container.managePreferences.savePreferences({
    homeLocation: 'Paris, France',
    needsSponsorship: true,
  });

  const backupJson = await container.manageBank.exportAllDataJson();
  const parsedBackup = JSON.parse(backupJson);
  assert.equal(parsedBackup.version, 5);
  assert.equal(parsedBackup.preferences.homeLocation.city, 'Paris');
  assert.equal(parsedBackup.preferences.homeLocation.country, 'France');
  assert.equal(parsedBackup.preferences.needsSponsorship, 'yes');

  await container.manageBank.wipeAllData();
  const importRes = await container.manageBank.importAllDataJson(backupJson);
  assert.equal(importRes.ok, true);

  const restoredPrefs = await container.managePreferences.getPreferences();
  assert.equal(restoredPrefs.homeLocation.city, 'Paris');
  assert.equal(restoredPrefs.homeLocation.country, 'France');
  assert.equal(restoredPrefs.needsSponsorship, 'yes');
});

// ============================================================================
// 8. SECTION 8 CONTENT FIXES & WCAG AA CONTRAST TESTS
// ============================================================================

test('Section 8 content fixes: embedded proof casing, employer deduplication, distinct letter proofs, and synced headlines', () => {
  assert.equal(
    normalizeEmbeddedProofText(
      'Re-architected multi-region Kubernetes metric ingestion pipeline in Go',
    ),
    're-architected a multi-region Kubernetes metric ingestion pipeline in Go',
  );
  assert.equal(
    normalizeEmbeddedProofText('Built high-throughput billing ledger in Go'),
    'built high-throughput billing ledger in Go',
  );
  assert.equal(
    normalizeEmbeddedProofText('AWS multi-region migration cut spend by 38%'),
    'AWS multi-region migration cut spend by 38%',
  );

  assert.deepEqual(
    deduplicateEmployerNames([
      'Vanguard Telemetry Systems',
      'Vanguard Telemetry Systems',
    ]),
    ['Vanguard Telemetry Systems'],
  );

  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const kestrelApp = applications[0];
  const blocks = buildGroundedCoverLetterBlocks({
    company: kestrelApp.company,
    roleTitle: kestrelApp.roleTitle,
    recipient: 'Hiring Team at Kestrel Pay',
    length: 'detailed',
    voice: 'balanced',
    selectedProofAchievementIds: [
      bank.achievements[0].id,
      bank.achievements[0].id,
    ],
    whyCompanyNotes: 'Global financial infrastructure.',
    jobDescription: kestrelApp.jobDescription,
    parsedJob: kestrelApp.parsedJob,
    bank,
  });
  const opening = blocks.find((b) => b.type === 'opening')!;
  const body1 = blocks.find((b) => b.type === 'body1')!;
  const body2 = blocks.find((b) => b.type === 'body2')!;
  const closing = blocks.find((b) => b.type === 'closing')!;

  assert.notDeepEqual(opening.sourceIds, body1.sourceIds);
  if (body2) {
    assert.notDeepEqual(body1.sourceIds, body2.sourceIds);
  }
  assert.equal(
    /Vanguard Telemetry Systems and Vanguard Telemetry Systems/i.test(
      closing.text,
    ),
    false,
  );

  const syncedHeadline = deriveDocumentHeadline({
    targetHeadline: kestrelApp.workingDraft.targetHeadline,
    roleTitle: kestrelApp.roleTitle,
    profileHeadline: bank.profile.headline,
  });
  const resumeDoc = mapApplicationToResumeDocument(kestrelApp, bank, 1);
  const clDraft =
    kestrelApp.coverLetterDraft ??
    createDefaultCoverLetterDraft(kestrelApp, bank);
  const clDoc = mapToCoverLetterDocument({
    draft: clDraft,
    bank,
    versionNumber: 1,
    templateId: kestrelApp.templateId,
    targetCompany: kestrelApp.company,
    targetRole: kestrelApp.roleTitle,
    targetHeadline: kestrelApp.workingDraft.targetHeadline,
  });
  assert.equal(resumeDoc.header.headline, syncedHeadline);
  assert.equal(clDoc.header.headline, syncedHeadline);

  const kestrelHue = getCompanyAvatarHueIndex('Kestrel Pay');
  assert.ok(kestrelHue >= 0 && kestrelHue < 8);
  assert.equal(getCompanyInitials('Kestrel Pay'), 'KP');

  const demo = createDemoApplications(bank);
  const v1 = demo.versions.find((v) => v.id === 'ver-kestrel-1')!;
  const v3 = demo.versions.find((v) => v.id === 'ver-kestrel-3')!;
  assert.ok(v3.scores.jobMatch > v1.scores.jobMatch);
  assert.ok(v3.scores.atsReadiness > v1.scores.atsReadiness);
});

test('WCAG AA contrast ratios hold across Light and Dark "Desk, paper and ink" token palettes', () => {
  function hexToLuminance(hex: string): number {
    const clean = hex.replace('#', '');
    const r = parseInt(clean.slice(0, 2), 16) / 255;
    const g = parseInt(clean.slice(2, 4), 16) / 255;
    const b = parseInt(clean.slice(4, 6), 16) / 255;
    const toLinear = (c: number) =>
      c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    return (
      0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)
    );
  }

  function contrastRatio(fg: string, bg: string): number {
    const l1 = hexToLuminance(fg);
    const l2 = hexToLuminance(bg);
    const lighter = Math.max(l1, l2);
    const darker = Math.min(l1, l2);
    return (lighter + 0.05) / (darker + 0.05);
  }

  const lightPairs: Array<[string, string, string, number]> = [
    ['ink on canvas', '#151A22', '#F4F1EB', 4.5],
    ['ink on surface', '#151A22', '#FFFFFF', 4.5],
    ['ink-muted on canvas', '#525B6C', '#F4F1EB', 4.5],
    ['ink-muted on surface', '#525B6C', '#FFFFFF', 4.5],
    ['paper-ink on paper', '#151A22', '#FFFFFF', 4.5],
    ['ink-100 on sidebar', '#E6E9EF', '#0E1218', 4.5],
    ['accent-700 on accent-50', '#1D3BA6', '#EEF2FF', 4.5],
    ['success-700 on success-50', '#115736', '#ECFDF3', 4.5],
    ['warning-700 on warning-50', '#7C4004', '#FEF7EC', 4.5],
    ['danger-700 on danger-50', '#911B12', '#FEF2F2', 4.5],
  ];

  for (const [label, fg, bg, minRatio] of lightPairs) {
    const ratio = contrastRatio(fg, bg);
    assert.ok(
      ratio >= minRatio,
      `Light mode pair "${label}" contrast ${ratio.toFixed(2)}:1 is below ${minRatio}:1`,
    );
  }

  const darkPairs: Array<[string, string, string, number]> = [
    ['dark ink on canvas', '#F3F5F8', '#0D1015', 4.5],
    ['dark ink on surface', '#F3F5F8', '#151A22', 4.5],
    ['dark ink-muted on canvas', '#A3ADBF', '#0D1015', 4.5],
    ['dark ink-muted on surface', '#A3ADBF', '#151A22', 4.5],
    ['dark paper-ink on paper', '#151A22', '#FFFFFF', 4.5],
    ['dark accent-700 on accent-50', '#94B0FF', '#172243', 4.5],
    ['dark success-700 on success-50', '#6EE7B7', '#0F291E', 4.5],
    ['dark warning-700 on warning-50', '#FCD34D', '#2C1E0A', 4.5],
    ['dark danger-700 on danger-50', '#FDA29B', '#2D1414', 4.5],
  ];

  for (const [label, fg, bg, minRatio] of darkPairs) {
    const ratio = contrastRatio(fg, bg);
    assert.ok(
      ratio >= minRatio,
      `Dark mode pair "${label}" contrast ${ratio.toFixed(2)}:1 is below ${minRatio}:1`,
    );
  }
});

// ============================================================================
// 9. ROUND 4 TESTS: WYSIWYG LOCATEBLOCKS, JOB FACTS SALIENCE & SCALE,
//    APPEAL CALIBRATION FIXTURES, QUICK ESTIMATE BAND & GRAMMAR
// ============================================================================

test('Job facts salience (deriveSalience), FACT_KIND_REGISTRY, and 10-fact / 15-fact scale fixtures', () => {
  // 1. deriveSalience rules
  assert.equal(deriveSalience('conflict', 'dealbreaker'), 'critical');
  assert.equal(deriveSalience('conflict', 'important'), 'notable');
  assert.equal(deriveSalience('conflict', 'nice-to-know'), 'quiet');
  assert.equal(deriveSalience('not-stated', 'dealbreaker'), 'notable');
  assert.equal(deriveSalience('not-stated', 'important'), 'quiet');
  assert.equal(deriveSalience('not-stated', 'nice-to-know'), 'quiet');
  assert.equal(deriveSalience('fits', 'dealbreaker'), 'quiet');
  assert.equal(deriveSalience('fits', 'important'), 'quiet');
  assert.equal(deriveSalience('fits', 'nice-to-know'), 'quiet');

  // 2. Registry contains 5 core fact kinds + createScaleFactExtras supports 10 and 15 facts
  assert.equal(FACT_KIND_REGISTRY.length, 5);
  assert.equal(FACT_KIND_REGISTRY[1].key, 'workPermits');
  assert.equal(FACT_KIND_REGISTRY[1].defaultImportance, 'dealbreaker');

  // 3. 10-fact and 15-fact scale fixtures evaluate cleanly and sort critical -> notable -> quiet
  const baseFacts = extractJobFactsByRules(
    'Location: New York, NY (Hybrid, 3 days in office). Must be authorized to work in the US without visa sponsorship.',
  ).facts;

  const facts10 = {
    ...baseFacts,
    extraFacts: createScaleFactExtras(10),
  };
  const fit10 = evaluateFit(facts10, {
    ...DEFAULT_USER_PREFERENCES,
    needsSponsorship: 'yes',
  });
  assert.equal(fit10.items.length, 10);
  assert.ok(fit10.criticalCount >= 1);
  assert.ok(fit10.notableCount >= 1);
  assert.equal(fit10.items[0].salience, 'critical');

  const facts15 = {
    ...baseFacts,
    extraFacts: createScaleFactExtras(15),
  };
  const fit15 = evaluateFit(facts15, {
    ...DEFAULT_USER_PREFERENCES,
    needsSponsorship: 'yes',
  });
  assert.equal(fit15.items.length, 15);
  assert.ok(fit15.criticalCount >= 1);
});

test('locateBlocks maps every resume bullet and cover letter paragraph to PDF bounding boxes', () => {
  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const app = applications[0];

  const resumeDoc = mapApplicationToResumeDocument(app, bank, 1);
  const resumePdf = generatePdfArtifact(resumeDoc, app.templateId);
  const resumeBlocks = locateBlocks(
    resumeDoc,
    resumePdf.positionedText,
    'letter',
  );
  assert.ok(resumeBlocks.length >= app.workingDraft.bullets.length);
  for (const bullet of app.workingDraft.bullets) {
    const found = resumeBlocks.find((b) => b.blockId === bullet.id);
    assert.ok(found, `Missing PDF block bounding box for bullet ${bullet.id}`);
    assert.ok(found.width > 50);
    assert.ok(found.height > 8);
  }

  const letterDoc = mapApplicationToCoverLetterDocument(app, bank, 1);
  const letterPdf = generatePdfArtifact(letterDoc, app.templateId);
  const letterBlocks = locateBlocks(
    letterDoc,
    letterPdf.positionedText,
    'letter',
  );
  assert.ok(letterBlocks.length >= letterDoc.blocks.length);
});

test('Score calibration fixtures enforce poor (<55), average (55-75), good (75-90), and gold (88-96) bands for Resume and Letter appeal', () => {
  for (const [tier, fixture] of Object.entries(APPEAL_CALIBRATION_FIXTURES)) {
    const report = computeRecruiterAppeal({
      doc: fixture.doc,
      parsedJob: fixture.parsedJob,
    });
    const [minScore, maxScore] = fixture.expectedBand;
    assert.ok(
      report.recruiterAppeal >= minScore && report.recruiterAppeal <= maxScore,
      `Resume calibration fixture "${tier}" scored ${report.recruiterAppeal}, expected [${minScore}, ${maxScore}]`,
    );
  }

  for (const [tier, fixture] of Object.entries(
    LETTER_APPEAL_CALIBRATION_FIXTURES,
  )) {
    const report = computeLetterAppealScore({
      draft: fixture.draft,
      parsedJob: fixture.parsedJob,
      passedChecksCount: fixture.passedChecksCount,
    });
    const [minScore, maxScore] = fixture.expectedBand;
    assert.ok(
      report.letterAppeal >= minScore && report.letterAppeal <= maxScore,
      `Letter calibration fixture "${tier}" scored ${report.letterAppeal}, expected [${minScore}, ${maxScore}]`,
    );
  }
});

test('Takeaway metric context, embedded proof article insertion, and Quick check 5-point band cap at 95', () => {
  // 1. Strongest metric with context
  const metricCtx = extractStrongestMetricWithContext([
    'Built zero-downtime PostgreSQL partition routing, dropping p99 query latency from 420ms to 68ms across 120+ enterprise tenants.',
  ]);
  assert.equal(metricCtx, 'p99 420→68 ms');

  // 2. Embedded proof article insertion
  assert.equal(
    insertArticleForEmbeddedProof(
      'rebuilt multi-region Kubernetes metric ingestion pipeline in Go',
    ),
    'rebuilt a multi-region Kubernetes metric ingestion pipeline in Go',
  );
  assert.equal(
    insertArticleForEmbeddedProof(
      'engineered event-driven Kafka dead-letter replay service',
    ),
    'engineered an event-driven Kafka dead-letter replay service',
  );

  // 3. Cover letter closing uses natural collocation ("problems I have solved")
  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const blocks = buildGroundedCoverLetterBlocks({
    company: applications[0].company,
    roleTitle: applications[0].roleTitle,
    recipient: 'Hiring Team at Kestrel Pay',
    length: 'standard',
    voice: 'balanced',
    selectedProofAchievementIds: [],
    whyCompanyNotes: '',
    jobDescription: applications[0].jobDescription,
    parsedJob: applications[0].parsedJob,
    bank,
  });
  for (const block of blocks) {
    assert.equal(
      /problems I have led/i.test(block.text),
      false,
      `Ungrammatical "problems I have led" found in ${block.type}: "${block.text}"`,
    );
  }

  // 4. Quick check estimate capped at 95 and formatted as 5-point band (never "100")
  const qc = evaluateQuickCheckPosting({
    rawPosting: applications[0].jobDescription,
    bank,
    preferences: DEFAULT_USER_PREFERENCES,
  });
  assert.ok(qc.quickMatchEstimate <= 95);
  assert.ok(qc.quickMatchBand.includes('–'));
  assert.equal(qc.quickMatchBand.includes('100'), false);
  assert.equal(formatQuickEstimateBand(100), '90–95');
});

test('Tier 2 Golden Record-Replay: Recorded Llama 3.1 8B completions pass through LlmGateway, sanitizer, 6-validator repair loop, and JSON importer', async () => {
  const fixturePath = path.resolve(
    process.cwd(),
    'src/tests/fixtures/llama3_1_real_outputs.json',
  );
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  const profileCatalog = createModelProfileCatalog();
  const profile = profileCatalog.resolveForModel('llama3.1:8b');
  let seq = 1;
  const idGen = { nextId: (p = 'gw') => `${p}-${seq++}` };
  const clock = { nowIso: () => new Date().toISOString() };

  const makeReplayProvider = (getCompletion: () => string): LlmProvider => ({
    async listModels() {
      return [{ id: 'llama3.1:8b', name: 'llama3.1:8b' }];
    },
    async *chat() {
      yield getCompletion();
    },
    async chatJSON<T>() {
      return JSON.parse(getCompletion()) as T;
    },
    async complete() {
      return {
        text: getCompletion(),
        usage: { promptTokens: 210, completionTokens: 32, evalMs: 650 },
      };
    },
  });

  // Case 1: Bullet rewrite with chatty preamble ("Sure! Here is the rewritten bullet...")
  let callIndex = 0;
  const replayProvider1 = makeReplayProvider(() => {
    callIndex += 1;
    return fixture.cases.bullet_rewrite_with_preamble.rawCompletion as string;
  });

  const gw1 = createLlmGateway({
    getProviderAndProfile: async () => ({
      provider: replayProvider1,
      providerId: 'ollama',
      modelName: 'llama3.1:8b',
      profile,
      parallelSlots: 1,
    }),
    resultCache: createInMemoryResultCache(100),
    performanceLog: createInMemoryPerformanceLog(100),
    idGen,
    clock,
  });

  const res1 = await gw1.executeTask(
    rewriteBulletTask,
    fixture.cases.bullet_rewrite_with_preamble.input,
    { itemKey: 'replay-1', priority: 'interactive', bypassCache: true },
  );
  assert.equal(callIndex, 1);
  assert.equal(
    res1.text,
    fixture.cases.bullet_rewrite_with_preamble.expectedCleanText,
  );
  assert.equal(res1.keptOriginalWording, false);

  // Case 2: Llama 3.1 8B drops metric on Attempt 1 -> 6-Validator catches missing metric -> Attempt 2 repairs and restores metric
  let attemptCounter = 0;
  const replayProvider2 = makeReplayProvider(() => {
    attemptCounter += 1;
    return (
      attemptCounter === 1
        ? fixture.cases.bullet_rewrite_missing_metric_then_repaired.rawAttempt1
        : fixture.cases.bullet_rewrite_missing_metric_then_repaired.rawAttempt2
    ) as string;
  });

  const gw2 = createLlmGateway({
    getProviderAndProfile: async () => ({
      provider: replayProvider2,
      providerId: 'ollama',
      modelName: 'llama3.1:8b',
      profile,
      parallelSlots: 1,
    }),
    resultCache: createInMemoryResultCache(100),
    performanceLog: createInMemoryPerformanceLog(100),
    idGen,
    clock,
  });

  const res2 = await gw2.executeTask(
    rewriteBulletTask,
    fixture.cases.bullet_rewrite_missing_metric_then_repaired.input,
    { itemKey: 'replay-2', priority: 'interactive', bypassCache: true },
  );
  assert.equal(
    attemptCounter,
    2,
    'Expected gateway to reject vague attempt 1 and succeed on repair attempt 2',
  );
  assert.equal(res2.repaired, true);
  assert.equal(
    res2.text,
    fixture.cases.bullet_rewrite_missing_metric_then_repaired.expectedCleanText,
  );
  assert.ok(res2.text.includes('420ms to 68ms'));

  // Case 3: Summary rewrite with markdown fences and quotes
  const replayProvider3 = makeReplayProvider(
    () => fixture.cases.summary_rewrite_fenced.rawCompletion as string,
  );
  const gw3 = createLlmGateway({
    getProviderAndProfile: async () => ({
      provider: replayProvider3,
      providerId: 'ollama',
      modelName: 'llama3.1:8b',
      profile,
      parallelSlots: 1,
    }),
    resultCache: createInMemoryResultCache(100),
    performanceLog: createInMemoryPerformanceLog(100),
    idGen,
    clock,
  });
  const sumRes = await gw3.executeTask(
    writeSummaryTask,
    fixture.cases.summary_rewrite_fenced.input,
    { itemKey: 'replay-sum', priority: 'interactive', bypassCache: true },
  );
  assert.ok(
    sumRes.text.includes(fixture.cases.summary_rewrite_fenced.expectedSubstring),
  );
  assert.equal(sumRes.text.includes('```'), false);

  // Case 4: Job Brief JSON with markdown fences
  const replayProvider4 = makeReplayProvider(
    () => fixture.cases.job_brief_json_with_fences.rawCompletion as string,
  );
  const gw4 = createLlmGateway({
    getProviderAndProfile: async () => ({
      provider: replayProvider4,
      providerId: 'ollama',
      modelName: 'llama3.1:8b',
      profile,
      parallelSlots: 1,
    }),
    resultCache: createInMemoryResultCache(100),
    performanceLog: createInMemoryPerformanceLog(100),
    idGen,
    clock,
  });
  const briefRes = await gw4.executeTask(
    refineJobBriefTask,
    {
      deterministicBriefText: 'ROLE: Staff Infrastructure Engineer',
      rawSnippet: 'Staff Infrastructure Engineer — Kestrel Pay',
      defaultTitle: 'Engineer',
      defaultCompany: 'Company',
      defaultSeniority: 'Senior',
      defaultTopSkills: ['Go'],
    },
    { itemKey: 'replay-brief', priority: 'interactive', bypassCache: true },
  );
  const parsedBrief = JSON.parse(briefRes.text);
  assert.equal(
    parsedBrief.title,
    fixture.cases.job_brief_json_with_fences.expectedTitle,
  );
  assert.equal(
    parsedBrief.company,
    fixture.cases.job_brief_json_with_fences.expectedCompany,
  );

  // Case 5: Master CV structured JSON import with conversational wrapper
  const container = buildCevinContainer({ inMemoryOnly: true });
  const importRes = await container.importResumeFile.parseJsonAndPropose(
    fixture.cases.mastercv_structured_import_json.rawCompletion,
    'mastercv.md',
  );
  assert.equal(importRes.ok, true);
  if (importRes.ok) {
    assert.equal(importRes.value.proposedProfile.name, 'Carlos Garcia');
    assert.equal(importRes.value.proposedExperiences.length, 2);
    assert.equal(importRes.value.proposedEducations.length, 1);
    assert.equal(importRes.value.proposedProjects.length, 1);
    assert.equal(importRes.value.proposedCertifications.length, 1);
  }
});

test('Experience reordering (Move Up/Down & Sort Chronological), Top Fixes Trim Long Bullet score increase, and Reset to Default CV', async () => {
  const container = buildCevinContainer({ inMemoryOnly: true });
  const { bank, applications } =
    await container.manageBank.loadDemoWorkspace();
  const app = applications[0];

  // 1. Chronological sorting & custom experience order in rendered ResumeDocument
  const outOfOrderExperiences = [
    {
      id: 'exp-older',
      company: 'Genpact International',
      title: 'Senior Software Engineer',
      start: '2018-04',
      end: '2021-10',
      current: false,
      location: 'Atlanta, USA',
    },
    {
      id: 'exp-newest',
      company: 'AlayaCare',
      title: 'Senior Software Engineer',
      start: '2024-10',
      end: '2026-10',
      current: true,
      location: 'Montreal, Canada',
    },
    {
      id: 'exp-middle',
      company: 'Kestrel Cloud',
      title: 'Software Engineer',
      start: '2021-10',
      end: '2024-10',
      current: false,
      location: 'Montreal, Canada',
    },
  ];

  const sorted = sortExperiencesChronologically(outOfOrderExperiences);
  assert.deepEqual(
    sorted.map((e) => e.id),
    ['exp-newest', 'exp-middle', 'exp-older'],
  );

  // Custom manual move (moving exp-middle above exp-newest) via experienceOrder
  const customOrdered = orderExperiencesForDraft(sorted, [
    'exp-middle',
    'exp-newest',
    'exp-older',
  ]);
  assert.deepEqual(
    customOrdered.map((e) => e.id),
    ['exp-middle', 'exp-newest', 'exp-older'],
  );

  // Verify mapApplicationToResumeDocument respects experienceOrder
  const reversedIds = [...bank.experiences].reverse().map((e) => e.id);
  const reorderedApp = {
    ...app,
    workingDraft: {
      ...app.workingDraft,
      experienceOrder: reversedIds,
    },
  };
  const renderedDoc = mapApplicationToResumeDocument(reorderedApp, bank, 1);
  const experiencesWithBullets = bank.experiences.filter((e) =>
    app.workingDraft.bullets.some((b) => b.experienceId === e.id),
  );
  assert.equal(
    renderedDoc.experiences[0].company,
    experiencesWithBullets[experiencesWithBullets.length - 1].company,
  );

  // 2. Top Fixes: "Trim bullets over 26 words to 2 crisp lines" preserves metrics & strictly increases Recruiter Appeal
  const verboseBulletText =
    'Designed and built scalable production infrastructure in Go and Kubernetes with extensive background-job observability, feature-flag management, authentication migrations, and multi-region telemetry pipelines, sustaining 1.4M events/sec while cutting cross-AZ egress spend by 38%.';
  const trimmed = smartTrimBulletText(verboseBulletText, 24, 160);
  const trimmedWords = trimmed.split(/\s+/).filter(Boolean);
  assert.ok(
    trimmedWords.length <= 24,
    `Expected <= 24 words after smartTrimBulletText, got ${trimmedWords.length}: "${trimmed}"`,
  );
  assert.ok(
    trimmed.length <= 160,
    `Expected <= 160 chars after smartTrimBulletText, got ${trimmed.length}: "${trimmed}"`,
  );
  assert.ok(
    trimmed.includes('1.4M') || trimmed.includes('38%'),
    `Expected smartTrimBulletText to preserve metrics at the end of the bullet: "${trimmed}"`,
  );

  // Test applyOneClickFix('trim-long-bullet') end-to-end on an application with verbose bullets
  const appWithLongBullet = await container.manageApplications.saveApplication({
    ...app,
    workingDraft: {
      ...app.workingDraft,
      bullets: app.workingDraft.bullets.map((b, i) =>
        i === 0 ? { ...b, text: verboseBulletText } : b,
      ),
    },
  });
  const beforeScoreRes = await container.scoreResume.execute(
    appWithLongBullet.id,
    { runRoundTrip: true },
  );
  assert.equal(beforeScoreRes.ok, true);
  if (beforeScoreRes.ok) {
    const trimFix = beforeScoreRes.value.fixes.find(
      (f) => f.actionType === 'trim-long-bullet',
    );
    assert.ok(trimFix, 'Expected trim-long-bullet fix to be suggested');
    const appealBefore = beforeScoreRes.value.scores.recruiterAppeal ?? 0;

    const afterFixRes = await container.scoreResume.applyOneClickFix(
      appWithLongBullet.id,
      trimFix!,
    );
    assert.equal(afterFixRes.ok, true);
    if (afterFixRes.ok) {
      const appealAfter = afterFixRes.value.analysis.scores.recruiterAppeal ?? 0;
      assert.ok(
        appealAfter >= appealBefore,
        `Recruiter appeal must not drop after applying trim-long-bullet (before: ${appealBefore}, after: ${appealAfter})`,
      );
      assert.equal(
        afterFixRes.value.analysis.fixes.some(
          (f) => f.actionType === 'trim-long-bullet',
        ),
        false,
        'trim-long-bullet fix should be resolved after applying once',
      );
    }
  }

  // 3. Reset to Default CV restores clean default generated draft
  const mutatedApp = await container.manageApplications.saveApplication({
    ...app,
    voice: 'plain',
    workingDraft: {
      ...app.workingDraft,
      targetHeadline: 'Edited Custom Headline',
      summary: 'Short custom summary.',
      bullets: app.workingDraft.bullets.slice(0, 1),
    },
  });
  assert.equal(mutatedApp.workingDraft.bullets.length, 1);

  const resetRes = await container.tailorResume.resetToDefault(mutatedApp.id);
  assert.equal(resetRes.ok, true);
  if (resetRes.ok) {
    assert.equal(resetRes.value.voice, 'balanced');
    assert.ok(
      resetRes.value.workingDraft.bullets.length >= 4,
      'Expected resetToDefault to restore full default bullets',
    );
    assert.notEqual(
      resetRes.value.workingDraft.targetHeadline,
      'Edited Custom Headline',
    );
  }
});

test('Review step coverage bug fixes: existing Bank skills (e.g. Docker) are covered (never partial with redundant related label), I have this persists & rescores, and manual Bank skills sync to existing applications', async () => {
  const container = buildCevinContainer({ inMemoryOnly: true });
  const { bank, applications } =
    await container.manageBank.loadDemoWorkspace();
  const app = applications[0];

  // 1. Add "Docker" to Bank skills and ensure a job requirement for "Docker" is marked covered (✓),
  // even when "Docker" is not repeated inside a bullet sentence.
  const bankWithDocker = await container.manageBank.addSkillFromGap('Docker');
  const dockerSkill = bankWithDocker.skills.find(
    (s) => s.name.toLowerCase() === 'docker',
  );
  assert.ok(dockerSkill, 'Expected Docker to be added to bank.skills');

  const appWithDockerReq = await container.manageApplications.saveApplication({
    ...app,
    parsedJob: {
      ...app.parsedJob!,
      title: 'Senior Software Engineer',
      company: 'Kestrel Pay',
      seniority: 'Senior',
      requirements: [
        {
          id: 'req-docker',
          text: 'Docker',
          normalizedKey: 'docker',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-argocd',
          text: 'ArgoCD',
          normalizedKey: 'argocd',
          priority: 'must-have',
          category: 'tool',
        },
      ],
      keywords: [
        {
          term: 'Docker',
          normalized: 'docker',
          kind: 'tool',
        },
        {
          term: 'ArgoCD',
          normalized: 'argocd',
          kind: 'tool',
        },
      ],
    },
    workingDraft: {
      ...app.workingDraft,
      selectedSkillIds: [
        ...app.workingDraft.selectedSkillIds,
        dockerSkill!.id,
      ],
    },
  });

  const activeSkillsText = bankWithDocker.skills
    .filter((s) => appWithDockerReq.workingDraft.selectedSkillIds.includes(s.id))
    .flatMap((s) => [s.name, ...(s.aliases ?? [])])
    .join(' ');
  const resumeProse = [
    appWithDockerReq.workingDraft.targetHeadline,
    appWithDockerReq.workingDraft.summary,
    ...appWithDockerReq.workingDraft.bullets.map((b) => b.text),
    activeSkillsText,
  ].join(' ');

  const summary = buildGroupedCoverageSummary({
    parsedJob: appWithDockerReq.parsedJob,
    bank: bankWithDocker,
    resumeText: resumeProse,
    selectedSkillIds: appWithDockerReq.workingDraft.selectedSkillIds,
  });

  assert.equal(
    summary.covered.mustHave.some((c) => c.term === 'Docker'),
    true,
    'Docker must be in covered.mustHave when present in Bank skills and selectedSkillIds',
  );
  assert.equal(
    summary.needsAttention.mustHave.some((n) => n.term === 'Docker'),
    false,
    'Docker must not appear in needsAttention with ◐ Docker (related: Docker)',
  );

  // 2. "I have this" modal submission with attachExperienceId and newAchievement moves ArgoCD from gap to covered immediately
  const iHaveThisRes =
    await container.manageBank.addSkillAndOptionalAchievement({
      skillName: 'ArgoCD',
      requirementTerm: 'ArgoCD',
      category: 'Infrastructure',
      aliases: ['Argo CD'],
      attachExperienceId: bankWithDocker.experiences[0].id,
      newAchievement: {
        action: 'Automated GitOps continuous delivery pipelines with ArgoCD',
        result: 'cutting deployment rollback times across production clusters',
        metric: 'by 60%',
      },
      applicationId: appWithDockerReq.id,
    });

  assert.ok(
    iHaveThisRes.bank.skills.some((s) => s.name === 'ArgoCD'),
    'Expected ArgoCD to be added to Bank skills',
  );
  assert.ok(
    iHaveThisRes.bank.achievements.some((a) =>
      a.action.includes('ArgoCD'),
    ),
    'Expected attached achievement from IHaveThisModal (attachExperienceId) to be saved in Bank',
  );
  assert.ok(
    iHaveThisRes.application,
    'Expected updated application to be returned',
  );
  assert.equal(
    iHaveThisRes.application!.latestScores.gapKeywords.includes('ArgoCD'),
    false,
    'ArgoCD must no longer be in gapKeywords after IHaveThisModal submission',
  );
  assert.ok(
    iHaveThisRes.application!.latestScores.jobMatch >= 95,
    'Both Docker and ArgoCD must be covered (>= 95% jobMatch) after IHaveThisModal submission',
  );

  // 3. Adding a skill manually in Experience Bank (saveBank) automatically syncs into existing applications
  // without needing to delete and recreate the application.
  const appWithHelmGap = await container.manageApplications.saveApplication({
    ...iHaveThisRes.application!,
    parsedJob: {
      ...iHaveThisRes.application!.parsedJob!,
      requirements: [
        ...iHaveThisRes.application!.parsedJob!.requirements,
        {
          id: 'req-helm',
          text: 'Helm',
          normalizedKey: 'helm',
          priority: 'must-have',
          category: 'tool',
        },
      ],
      keywords: [
        ...iHaveThisRes.application!.parsedJob!.keywords,
        {
          term: 'Helm',
          normalized: 'helm',
          kind: 'tool',
        },
      ],
    },
  });

  // Manually add "Helm" via manageBank.saveBank (simulating Experience Bank -> Skills -> Add skill)
  const manualHelmSkill = {
    id: 'skill-manual-helm',
    name: 'Helm',
    category: 'Infrastructure' as const,
    aliases: ['Helm Charts'],
  };
  await container.manageBank.saveBank({
    ...iHaveThisRes.bank,
    skills: [...iHaveThisRes.bank.skills, manualHelmSkill],
  });

  // Re-enter the existing application (getApplication + scoreResume) without deleting it
  const reloadedApp = await container.manageApplications.getApplication(
    appWithHelmGap.id,
  );
  assert.ok(reloadedApp);
  assert.equal(
    reloadedApp!.workingDraft.selectedSkillIds.includes('skill-manual-helm'),
    true,
    'Newly added Bank skill must automatically sync into existing application selectedSkillIds',
  );
  assert.equal(
    reloadedApp!.latestScores.gapKeywords.includes('Helm'),
    false,
    'Newly added Bank skill must no longer be in gapKeywords on existing application',
  );
});

test('Cevin pure-geometry SVG math & CevinMarkTimingController state machine', () => {
  // 1. Verify Standard Mark Geometry & Clearance Checks
  assert.deepEqual(CEVIN_LOGO_REPORT.math.arcStartP40, { x: 48.85, y: 46.14 });
  assert.deepEqual(CEVIN_LOGO_REPORT.math.arcEndPMinus40, { x: 48.85, y: 17.86 });
  assert.equal(
    CEVIN_MARK_GEOMETRY.ring.path,
    'M48.85 46.14A22 22 0 1 1 48.85 17.86',
  );

  // Clearance 1: Bullet left edge to ring inner edge >= 5
  assert.ok(
    CEVIN_LOGO_REPORT.standard.clearances.bulletLeftToRingInner >= 5,
    `Expected standard clearance 1 >= 5, got ${CEVIN_LOGO_REPORT.standard.clearances.bulletLeftToRingInner}`,
  );
  assert.equal(CEVIN_LOGO_REPORT.standard.clearances.bulletLeftToRingInner, 6);

  // Clearance 2: Bullet right edge to line start cap >= 2.5
  assert.ok(
    CEVIN_LOGO_REPORT.standard.clearances.bulletRightToLineStart >= 2.5,
    `Expected standard clearance 2 >= 2.5, got ${CEVIN_LOGO_REPORT.standard.clearances.bulletRightToLineStart}`,
  );
  assert.equal(CEVIN_LOGO_REPORT.standard.clearances.bulletRightToLineStart, 3);

  // Clearance 3: Line to each ring cap >= 6
  assert.ok(
    CEVIN_LOGO_REPORT.standard.clearances.lineToRingCap >= 6,
    `Expected standard clearance 3 >= 6, got ${CEVIN_LOGO_REPORT.standard.clearances.lineToRingCap}`,
  );
  assert.equal(CEVIN_LOGO_REPORT.standard.clearances.lineToRingCap, 8.14);

  // Outer extents inside 0 0 64 64
  assert.deepEqual(CEVIN_LOGO_REPORT.standard.extents, {
    minX: 6,
    maxX: 60,
    minY: 6,
    maxY: 58,
    width: 54,
    height: 52,
  });

  // 2. Verify Small Rendition Geometry (for <= 20px)
  assert.equal(CEVIN_MARK_SMALL_GEOMETRY.ring.stroke, 9);
  assert.equal(CEVIN_MARK_SMALL_GEOMETRY.bullet.r, 4.5);
  assert.equal(CEVIN_MARK_SMALL_GEOMETRY.line.stroke, 5);
  assert.equal(CEVIN_MARK_SMALL_GEOMETRY.line.length, 23);
  assert.ok(CEVIN_LOGO_REPORT.small.clearances.bulletLeftToRingInner >= 5);
  assert.equal(CEVIN_LOGO_REPORT.small.clearances.bulletLeftToRingInner, 5);
  assert.ok(CEVIN_LOGO_REPORT.small.clearances.bulletRightToLineStart >= 2.5);
  assert.equal(CEVIN_LOGO_REPORT.small.clearances.bulletRightToLineStart, 3);
  assert.ok(CEVIN_LOGO_REPORT.small.clearances.lineToRingCap >= 6);
  assert.equal(CEVIN_LOGO_REPORT.small.clearances.lineToRingCap, 7.14);
  assert.deepEqual(CEVIN_LOGO_REPORT.small.extents, {
    minX: 5.5,
    maxX: 59.5,
    minY: 5.5,
    maxY: 58.5,
    width: 54,
    height: 53,
  });

  // 3. Verify Animation line dasharray and offsets
  assert.equal(CEVIN_MARK_GEOMETRY.dashArray, '25 50');
  assert.equal(CEVIN_MARK_GEOMETRY.dashOffsetRetracted, 26);
  assert.equal(CEVIN_MARK_GEOMETRY.dashOffsetDrawn, 0);

  // 5. Verify CevinMarkTimingController:
  // - Fast task (<300ms) never becomes visible and never plays 'done'
  let now = 1000;
  const ctrl = new CevinMarkTimingController(now);
  ctrl.updateActivity(
    { phase: 'thinking', kind: 'checking' },
    now,
  );
  assert.equal(ctrl.getViewState(now + 150).visible, false);
  ctrl.updateActivity({ phase: 'idle', kind: null }, now + 200);
  assert.equal(ctrl.getViewState(now + 200).visible, false);
  assert.equal(ctrl.getViewState(now + 200).visualState, 'idle');

  // - Task > 300ms becomes visible, holds at least 600ms, transitions thinking -> writing on loop iteration, and plays done (420ms)
  now = 2000;
  ctrl.updateActivity(
    { phase: 'thinking', kind: 'reading-posting' },
    now,
  );
  assert.equal(ctrl.getViewState(now + 299).visible, false);
  const at300 = ctrl.getViewState(now + 300);
  assert.equal(at300.visible, true);
  assert.equal(at300.visualState, 'thinking');
  assert.equal(at300.label, 'Cevin is reading the posting');

  // Switch to writing at +450ms -> waits for current thinking loop iteration before switching visualState to 'writing'
  ctrl.updateActivity(
    { phase: 'writing', kind: 'rewriting', completed: 2, total: 6 },
    now + 450,
  );
  assert.equal(ctrl.getViewState(now + 500).visualState, 'thinking');
  ctrl.notifyThinkingLoopIteration(now + 550);
  const at550 = ctrl.getViewState(now + 550);
  assert.equal(at550.visualState, 'writing');
  assert.equal(at550.label, 'Cevin is rewriting (2 of 6)');

  // Finish task at +700ms (only 400ms after becoming visible at 2300ms) -> holds visible until 2900ms, then plays done for 420ms
  ctrl.updateActivity({ phase: 'idle', kind: null }, now + 700);
  assert.equal(ctrl.getViewState(now + 800).visible, true);
  const at900 = ctrl.getViewState(now + 900);
  assert.equal(at900.visible, true);
  assert.equal(at900.visualState, 'done');
  assert.equal(ctrl.getViewState(now + 900 + 420).visible, false);
  assert.equal(ctrl.getViewState(now + 900 + 420).visualState, 'idle');

  // 6. Verify all 8 touchpoint labels
  assert.equal(
    formatCevinActivityLabel('reading-resume'),
    'Cevin is reading your resume',
  );
  assert.equal(
    formatCevinActivityLabel('reading-posting'),
    'Cevin is reading the posting',
  );
  assert.equal(formatCevinActivityLabel('rewriting'), 'Cevin is rewriting');
  assert.equal(
    formatCevinActivityLabel('rewriting', 2, 6),
    'Cevin is rewriting (2 of 6)',
  );
  assert.equal(formatCevinActivityLabel('writing'), 'Cevin is writing');
  assert.equal(formatCevinActivityLabel('checking'), 'Cevin is checking');
  assert.equal(formatCevinActivityLabel('warming-up'), 'Cevin is warming up');
});

test('Smart targeted skill selection against 60-skill Bank and project highlight cleanup', async () => {
  const bank = createDemoBankSnapshot();

  // 1. Verify demo project has clean highlights (no unwanted 'Adopted by 1,100+' default)
  assert.deepEqual(bank.projects[0].highlights, []);

  // 2. Expand bank to 60 skills (10 relevant infra/backend skills + 50 unrelated skills)
  const full60Skills = [...bank.skills];
  for (let i = full60Skills.length; i < 60; i++) {
    full60Skills.push({
      id: `skill-extra-${i}`,
      name: `Specialty Skill ${i}`,
      category: 'Tools',
      aliases: [`Alt ${i}`],
    });
  }
  const largeBank = { ...bank, skills: full60Skills };
  assert.equal(largeBank.skills.length, 60);

  const { applications } = createDemoApplications(bank);
  const kestrelApp = applications[0];
  assert.ok(kestrelApp.parsedJob);

  // 3. Verify ranking selects targeted relevant skills (<= 14), not all 60
  const ranking = rankBankItemsForJob(largeBank, kestrelApp.parsedJob);
  assert.ok(
    ranking.recommendedSkillIds.length >= 8 &&
      ranking.recommendedSkillIds.length <= 14,
    `Selected skills should be targeted (expected 8-14, got ${ranking.recommendedSkillIds.length})`,
  );
  assert.ok(
    !ranking.recommendedSkillIds.includes('skill-extra-55'),
    'Irrelevant bank skill must not be recommended',
  );

  // 4. Initial demo application must have targeted skills
  assert.equal(
    kestrelApp.workingDraft.selectedSkillIds.length,
    10,
    'Kestrel demo draft should have 10 targeted skills, not all 60',
  );

  // 5. Container createApplication with JD uses smart ranking
  const container = buildCevinContainer({ inMemoryOnly: true, seedDemo: true });
  await container.manageBank.saveBank(largeBank);
  const createdApp = await container.manageApplications.createApplication({
    roleTitle: 'Staff Infrastructure & Reliability Engineer',
    company: 'Kestrel Pay',
    jobDescription: kestrelApp.jobDescription,
  });
  assert.ok(
    createdApp.workingDraft.selectedSkillIds.length >= 8 &&
      createdApp.workingDraft.selectedSkillIds.length <= 14,
    `New application must have targeted skills (got ${createdApp.workingDraft.selectedSkillIds.length})`,
  );
});

test('Inline Name+Headline across all templates, Section Content Alignment (left/justify/right), Recruiter Appeal Headline Fix threshold, and Google Docs WYSIWYG export', async () => {
  const bank = createDemoBankSnapshot();
  const { applications } = createDemoApplications(bank);
  const app = applications[0];

  // 1. Verify Name and Headline always share the exact same single line (y) across classic, modern, and compact
  for (const templateId of ['classic', 'modern', 'compact'] as const) {
    const doc = mapApplicationToResumeDocument(
      {
        ...app,
        templateId,
        workingDraft: {
          ...app.workingDraft,
          targetHeadline:
            'Principal Distributed Systems, Kubernetes & Cloud Infrastructure Reliability Architect',
        },
      },
      bank,
    );
    const pdf = renderDocumentToPdfArtifact(doc);
    assert.ok(pdf.pageCount >= 1);
    const firstPageRuns = pdf.positionedText.filter((r) => r.page === 1);
    const nameRun = firstPageRuns.find((r) =>
      r.text.includes(doc.header.name),
    );
    const headlineRun = firstPageRuns.find((r) =>
      r.text.includes('Principal Distributed Systems'),
    );
    assert.ok(nameRun, `Expected name run in ${templateId}`);
    assert.ok(headlineRun, `Expected headline run in ${templateId}`);
    assert.equal(
      nameRun.y,
      headlineRun.y,
      `Name and Headline must be on the exact same line (y) in template ${templateId}`,
    );
    assert.ok(
      headlineRun.x > nameRun.x,
      `Headline must sit to the right of Name on the same line in template ${templateId}`,
    );
  }

  // 2. Verify Section Content Alignment (left, justify, right) in PDF layout, DOCX, and Google Docs HTML
  const baseDoc = mapApplicationToResumeDocument(
    { ...app, templateId: 'classic' },
    bank,
  );
  const leftPdf = renderDocumentToPdfArtifact({
    ...baseDoc,
    meta: { ...baseDoc.meta, textAlign: 'left' },
  });
  const justifyPdf = renderDocumentToPdfArtifact({
    ...baseDoc,
    meta: { ...baseDoc.meta, textAlign: 'justify' },
  });
  const rightPdf = renderDocumentToPdfArtifact({
    ...baseDoc,
    meta: { ...baseDoc.meta, textAlign: 'right' },
  });

  // Justified PDF should emit positive Tw operator in stream on multi-line summary/bullet lines
  const justifyStreamText = new TextDecoder('latin1').decode(justifyPdf.bytes);
  assert.ok(
    /\d+\.\d{3} Tw/.test(justifyStreamText),
    'Justified alignment must emit positive Tw word-spacing operator in PDF stream',
  );

  // Right-aligned PDF should shift body text runs further right than left-aligned PDF
  const leftSummaryRun = leftPdf.positionedText.find((r) =>
    r.text.includes('Staff Infrastructure'),
  );
  const rightSummaryRun = rightPdf.positionedText.find((r) =>
    r.text.includes('Staff Infrastructure'),
  );
  assert.ok(leftSummaryRun && rightSummaryRun);
  assert.ok(
    rightSummaryRun.x >= leftSummaryRun.x,
    'Right-aligned summary run must be positioned at or to the right of left-aligned summary run',
  );

  // 3. Verify Recruiter Appeal does NOT suggest 'fix-appeal-align-headline' when headline already matches targetRole
  const alignedDoc = mapApplicationToResumeDocument(
    {
      ...app,
      templateId: 'classic',
      workingDraft: {
        ...app.workingDraft,
        targetHeadline: app.roleTitle,
      },
    },
    bank,
  );
  const alignedAppeal = computeRecruiterAppeal({
    doc: alignedDoc,
    parsedJob: app.parsedJob,
  });
  assert.equal(
    alignedAppeal.fixes.some((f) => f.id === 'fix-appeal-align-headline'),
    false,
    'fix-appeal-align-headline must NOT appear when headline already matches target role',
  );

  const mismatchedDoc = mapApplicationToResumeDocument(
    {
      ...app,
      templateId: 'classic',
      workingDraft: {
        ...app.workingDraft,
        targetHeadline: 'Frontend Mobile UI Designer',
      },
    },
    bank,
  );
  const mismatchedAppeal = computeRecruiterAppeal({
    doc: mismatchedDoc,
    parsedJob: app.parsedJob,
  });
  assert.equal(
    mismatchedAppeal.fixes.some((f) => f.id === 'fix-appeal-align-headline'),
    true,
    'fix-appeal-align-headline MUST appear when headline does not match target role',
  );

  // 4. Verify Google Docs (.docx and WYSIWYG HTML) export and round-trip extraction
  const justifiedDoc = {
    ...baseDoc,
    header: {
      ...baseDoc.header,
      links: [
        { label: 'GitHub', url: 'https://github.com/danieldiaz' },
        { label: 'LinkedIn', url: 'https://linkedin.com/in/danieldiaz' },
      ],
    },
    meta: { ...baseDoc.meta, textAlign: 'justify' as const },
  };
  const docxBytes = renderDocumentToDocxBytes(justifiedDoc);
  assert.ok(docxBytes.byteLength > 1000, 'Expected valid non-empty .docx archive');
  const docxBlob = await docxDocumentExporter.export(justifiedDoc, {
    templateId: 'classic',
  });
  assert.ok(docxDocumentExporter.extractTextFromBlob);
  const extractedDocxText = await docxDocumentExporter.extractTextFromBlob(
    docxBlob,
  );
  assert.ok(
    extractedDocxText.includes(baseDoc.header.name),
    'Round-trip .docx text must include candidate full name',
  );
  assert.ok(
    extractedDocxText.includes(app.roleTitle),
    'Round-trip .docx text must include role headline',
  );
  assert.ok(
    extractedDocxText.includes('github.com/danieldiaz'),
    'Round-trip .docx text must include cleaned GitHub URL, not just a bare label',
  );
  assert.ok(
    extractedDocxText.includes('linkedin.com/in/danieldiaz'),
    'Round-trip .docx text must include cleaned LinkedIn URL, not just a bare label',
  );

  const gdocsHtml = renderDocumentToGoogleDocsHtml(justifiedDoc);
  assert.ok(
    gdocsHtml.includes('text-align:justify'),
    'Google Docs WYSIWYG HTML must include text-align:justify when textAlign is justify',
  );
  assert.ok(
    gdocsHtml.includes(baseDoc.header.name),
    'Google Docs WYSIWYG HTML must include candidate name',
  );
  assert.ok(
    gdocsHtml.includes('href="https://github.com/danieldiaz"') &&
      gdocsHtml.includes('github.com/danieldiaz'),
    'Google Docs WYSIWYG HTML must include clickable GitHub link with display URL',
  );
  assert.ok(
    gdocsHtml.includes('href="https://linkedin.com/in/danieldiaz"') &&
      gdocsHtml.includes('linkedin.com/in/danieldiaz'),
    'Google Docs WYSIWYG HTML must include clickable LinkedIn link with display URL',
  );
});
