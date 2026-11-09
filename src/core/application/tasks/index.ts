import { z } from 'zod';
import {
  CoverLetterBlockType,
  HarnessValidationFailure,
  HarnessValidationResult,
  VOICE_HARNESS_DATA,
  VOICE_STYLE_SPECS,
  VoiceLevel,
  applyVoiceLexiconPass,
  assembleBullet,
  fnv1aHash,
  sanitizeLlmOutput,
  validateBulletOutput,
  validateLetterBlockOutput,
  validateSummaryOutput,
} from '../../domain';
import { LlmMessage, ModelProfile } from '../ports/outbound';

export type HarnessTaskId =
  | 'classifyImportBlocks'
  | 'refineJobBrief'
  | 'rewriteBullet'
  | 'writeSummary'
  | 'writeLetterBlock'
  | 'extractJobFact';

export interface BuiltTaskPrompt {
  /**
   * Static system prompt + few-shot chat turns.
   * Must be byte-identical across calls of the same task and voice so Ollama's KV prefix cache hits.
   */
  prefixMessages: LlmMessage[];
  /**
   * Variable per-item payload placed strictly in the final user message.
   */
  suffixMessage: LlmMessage;
  inputHash: string;
  briefHash: string;
  voiceId: string;
}

export interface LlmTaskDefinition<TInput> {
  id: HarnessTaskId;
  promptVersion: string;
  format?: 'json';
  stopSequences?: string[];
  getTokenCap(profile: ModelProfile): number;
  getTemperature(profile: ModelProfile): number;
  buildPrompt(input: TInput): BuiltTaskPrompt;
  validate(rawOutput: string, input: TInput): HarnessValidationResult;
  repair(failures: HarnessValidationFailure[]): string;
  baseline(input: TInput): string;
}

// ============================================================================
// 1. rewriteBullet Task (Prose, 1 sentence, stop: ["\n"], max ~80 tokens)
// ============================================================================

export interface RewriteBulletTaskInput {
  bulletId: string;
  action: string;
  result: string;
  metric?: string;
  company: string;
  roleTitle: string;
  allowedTerms: string[];
  jdOnlyTerms: string[];
  briefText: string;
  briefHash: string;
  voice: VoiceLevel;
  variationSeed?: number;
}

const REWRITE_BULLET_SYSTEM_PREFIX = (voice: VoiceLevel): string => {
  const spec = VOICE_STYLE_SPECS[voice];
  const band = VOICE_HARNESS_DATA[voice].lengthBand;
  return [
    'You are a truthful resume bullet rewriter.',
    `Voice style: ${spec.label} (${spec.tagline})`,
    `Verb guidance: ${spec.verbGuidance}`,
    `Length: ${band.minWords} to ${band.maxWords} words in ONE single sentence.`,
    'STRICT RULES:',
    '1. Start directly with a past-tense action verb. No bullet symbols (-, •, *), no quotes, no preamble.',
    '2. Keep EVERY number, percentage, and metric from FACTS unchanged. You MUST preserve the concrete measurable evidence and quantitative outcome (scale, latency, volume, percentages, dollars). Never drop, omit, or generalize measurable outcomes into vague qualitative claims.',
    '3. Only name tools or skills listed in FACTS or ALLOWED_TERMS. Never add unverified JD skills.',
    '4. Never use first-person pronouns (I, me, my, we, our).',
    `5. Never use banned clichés: ${spec.bannedCliches.join(', ')}.`,
  ].join('\n');
};

export const rewriteBulletTask: LlmTaskDefinition<RewriteBulletTaskInput> = {
  id: 'rewriteBullet',
  promptVersion: 'v2.1',
  stopSequences: ['\n'],
  getTokenCap: (profile) => profile.tokenCaps.bullet,
  getTemperature: (profile) => profile.temperatures.bullet,
  buildPrompt(input) {
    const voiceData = VOICE_HARNESS_DATA[input.voice];
    const prefixMessages: LlmMessage[] = [
      { role: 'system', content: REWRITE_BULLET_SYSTEM_PREFIX(input.voice) },
      { role: 'user', content: voiceData.fewShotTurns[0].user },
      { role: 'assistant', content: voiceData.fewShotTurns[0].assistant },
      { role: 'user', content: voiceData.fewShotTurns[1].user },
      { role: 'assistant', content: voiceData.fewShotTurns[1].assistant },
      { role: 'user', content: voiceData.fewShotTurns[2].user },
      { role: 'assistant', content: voiceData.fewShotTurns[2].assistant },
    ];

    const suffixContent = [
      `JOB_BRIEF: ${input.briefText.replace(/\n+/g, ' | ')}`,
      `ROLE_CONTEXT: ${input.roleTitle} at ${input.company}`,
      `ACTION: ${input.action}`,
      `RESULT: ${input.result}`,
      ...(input.metric ? [`METRIC_TO_PRESERVE: ${input.metric}`] : []),
      `ALLOWED_TERMS: ${input.allowedTerms.join(', ') || 'none'}`,
      `VOICE: ${VOICE_STYLE_SPECS[input.voice].label}`,
      'INSTRUCTION: Preserve the exact measurable outcome, numbers, and scale. Output ONE complete sentence starting with a strong past verb.',
    ].join('\n');

    return {
      prefixMessages,
      suffixMessage: { role: 'user', content: suffixContent },
      inputHash: fnv1aHash(
        `${input.action}|${input.result}|${input.metric ?? ''}|${input.allowedTerms.join(',')}`,
      ),
      briefHash: input.briefHash || fnv1aHash(input.briefText),
      voiceId: input.voice,
    };
  },
  validate(rawOutput, input) {
    return validateBulletOutput({
      rawCandidate: rawOutput,
      sourceAction: input.action,
      sourceResult: input.result,
      sourceMetric: input.metric,
      allowedTerms: [
        ...input.allowedTerms,
        input.company,
        input.roleTitle,
      ].filter(Boolean),
      jdOnlyTerms: input.jdOnlyTerms,
      voice: input.voice,
    });
  },
  repair(failures) {
    return `Fix the previous rewrite: ${failures.map((f) => f.repairHint).join(' ')} Output ONLY the single-sentence bullet.`;
  },
  baseline(input) {
    const assembled = assembleBullet(
      {
        action: input.action,
        result: input.result,
        metric: input.metric,
      },
      input.voice,
      input.variationSeed ?? 0,
    );
    return applyVoiceLexiconPass(assembled, input.voice, {
      action: input.action,
      result: input.result,
      metric: input.metric,
    });
  },
};

// ============================================================================
// 2. writeSummary Task (Prose, 2-3 sentences, max ~110 tokens)
// ============================================================================

export interface WriteSummaryTaskInput {
  headline: string;
  targetRole: string;
  targetCompany: string;
  verifiedSkills: string[];
  verifiedCompanies: string[];
  topMetricSnippet?: string;
  briefText: string;
  briefHash: string;
  voice: VoiceLevel;
}

const WRITE_SUMMARY_SYSTEM_PREFIX = (voice: VoiceLevel): string => {
  const spec = VOICE_STYLE_SPECS[voice];
  return [
    'You are a truthful resume summary writer.',
    `Voice style: ${spec.label} (${spec.tagline})`,
    'Write a 2-sentence professional summary (25 to 55 words) grounded strictly in the provided skills, companies, and outcomes.',
    'STRICT RULES:',
    '1. Never use first-person pronouns (I, me, my, we, our).',
    '2. Only mention tools, companies, and metrics present in the user prompt.',
    `3. Avoid banned clichés: ${spec.bannedCliches.join(', ')}.`,
    '4. Output ONLY the summary prose with no heading, no quotes, and no preamble.',
  ].join('\n');
};

export const writeSummaryTask: LlmTaskDefinition<WriteSummaryTaskInput> = {
  id: 'writeSummary',
  promptVersion: 'v2.1',
  stopSequences: ['\n\n'],
  getTokenCap: (profile) => profile.tokenCaps.summary,
  getTemperature: (profile) => profile.temperatures.summary,
  buildPrompt(input) {
    const prefixMessages: LlmMessage[] = [
      { role: 'system', content: WRITE_SUMMARY_SYSTEM_PREFIX(input.voice) },
    ];
    const suffixContent = [
      `JOB_BRIEF: ${input.briefText.replace(/\n+/g, ' | ')}`,
      `HEADLINE: ${input.targetRole || input.headline}`,
      `SKILLS: ${input.verifiedSkills.slice(0, 6).join(', ')}`,
      `COMPANIES: ${input.verifiedCompanies.slice(0, 3).join(', ')}`,
      ...(input.topMetricSnippet
        ? [`TOP_OUTCOME: ${input.topMetricSnippet}`]
        : []),
      `VOICE: ${VOICE_STYLE_SPECS[input.voice].label}`,
    ].join('\n');

    return {
      prefixMessages,
      suffixMessage: { role: 'user', content: suffixContent },
      inputHash: fnv1aHash(suffixContent),
      briefHash: input.briefHash || fnv1aHash(input.briefText),
      voiceId: input.voice,
    };
  },
  validate(rawOutput, input) {
    return validateSummaryOutput({
      rawCandidate: rawOutput,
      allowedTerms: [
        ...input.verifiedSkills,
        ...input.verifiedCompanies,
        input.headline,
        input.targetRole,
        input.topMetricSnippet ?? '',
      ],
      voice: input.voice,
    });
  },
  repair(failures) {
    return `Fix the summary: ${failures.map((f) => f.repairHint).join(' ')} Output ONLY the 2-sentence summary.`;
  },
  baseline(input) {
    const skillList =
      input.verifiedSkills.length > 0
        ? input.verifiedSkills.slice(0, 4).join(', ')
        : 'distributed systems and modern cloud infrastructure';
    const companyPhrase =
      input.verifiedCompanies.length > 0
        ? ` across ${input.verifiedCompanies.slice(0, 2).join(' and ')}`
        : '';
    const metricPhrase = input.topMetricSnippet
      ? `, including verified delivery of ${input.topMetricSnippet}`
      : '';
    const title = input.targetRole || input.headline || 'Senior Software Engineer';

    if (input.voice === 'plain' || input.voice === 'natural') {
      return `${title} experienced in ${skillList}${companyPhrase}. Focused on reliable systems, clear architecture, and measurable engineering outcomes${metricPhrase}.`;
    }
    return `${title} specializing in ${skillList}${companyPhrase}. Proven track record of delivering resilient production infrastructure and quantifiable reliability improvements${metricPhrase}.`;
  },
};

// ============================================================================
// 3. writeLetterBlock Task (Prose, 1 paragraph <= 70 words, max ~170 tokens, v2.2)
// ============================================================================

export interface WriteLetterBlockTaskInput {
  blockType: CoverLetterBlockType;
  company: string;
  roleTitle: string;
  proofSnippet: string;
  topRequirements: string[];
  whyCompanyNotes: string;
  allowedCorpusText: string;
  fallbackText: string;
  briefText: string;
  briefHash: string;
  voice: VoiceLevel;
}

const WRITE_LETTER_BLOCK_SYSTEM_PREFIX = (voice: VoiceLevel): string => {
  const spec = VOICE_STYLE_SPECS[voice];
  return [
    'You are a truthful cover letter paragraph writer.',
    `Voice style: ${spec.label} (${spec.tagline})`,
    'Write ONE concise cover-letter paragraph (30 to 68 words, 2–3 sentences) using ONLY the facts provided in PROOF and JOB_BRIEF.',
    'STRICT RULES:',
    '1. Never start with "I\'m applying for", "I am applying for", "I am writing to", "I\'m excited to apply", or "thrilled to apply".',
    '2. For opening paragraphs, lead directly with the strongest concrete proof point and metric in the first sentence, then follow with a role-specific reason grounded ONLY in the posting\'s mission/responsibilities or WHY_COMPANY_NOTES (if neither exists, omit the "because..." clause; never turn JD keyword lists into a reason).',
    '3. Never invent metrics, employers, or tools not in PROOF.',
    '4. Output ONLY the single paragraph with no greeting, sign-off, or preamble.',
  ].join('\n');
};

export const writeLetterBlockTask: LlmTaskDefinition<WriteLetterBlockTaskInput> =
  {
    id: 'writeLetterBlock',
    promptVersion: 'v2.2',
    stopSequences: ['\n\n'],
    getTokenCap: (profile) => profile.tokenCaps.letterBlock,
    getTemperature: (profile) => profile.temperatures.letter,
    buildPrompt(input) {
      const prefixMessages: LlmMessage[] = [
        {
          role: 'system',
          content: WRITE_LETTER_BLOCK_SYSTEM_PREFIX(input.voice),
        },
      ];
      const suffixContent = [
        `PARAGRAPH_ROLE: ${input.blockType}`,
        `COMPANY: ${input.company}`,
        `ROLE: ${input.roleTitle}`,
        `PROOF: ${input.proofSnippet}`,
        ...(input.whyCompanyNotes
          ? [`WHY_COMPANY_NOTES: ${input.whyCompanyNotes}`]
          : []),
        `VOICE: ${VOICE_STYLE_SPECS[input.voice].label}`,
      ].join('\n');

      return {
        prefixMessages,
        suffixMessage: { role: 'user', content: suffixContent },
        inputHash: fnv1aHash(suffixContent),
        briefHash: input.briefHash || fnv1aHash(input.briefText),
        voiceId: input.voice,
      };
    },
    validate(rawOutput, input) {
      return validateLetterBlockOutput({
        rawCandidate: rawOutput,
        blockType: input.blockType,
        allowedCorpusText: `${input.allowedCorpusText} ${input.proofSnippet} ${input.company} ${input.roleTitle} ${input.whyCompanyNotes}`,
        voice: input.voice,
      });
    },
    repair(failures) {
      return `Fix the paragraph: ${failures.map((f) => f.repairHint).join(' ')} Output ONLY the corrected paragraph.`;
    },
    baseline(input) {
      return input.fallbackText;
    },
  };

// ============================================================================
// 4. refineJobBrief Task (Flat JSON, max ~200 tokens, temperature 0)
// ============================================================================

export interface RefineJobBriefTaskInput {
  deterministicBriefText: string;
  rawSnippet: string;
  defaultTitle: string;
  defaultCompany: string;
  defaultSeniority: string;
  defaultTopSkills: string[];
}

export const RefinedJobBriefSchema = z.object({
  title: z.string(),
  company: z.string(),
  seniority: z.string(),
  topSkills: z.array(z.string()),
});

export const refineJobBriefTask: LlmTaskDefinition<RefineJobBriefTaskInput> = {
  id: 'refineJobBrief',
  promptVersion: 'v2.1',
  format: 'json',
  getTokenCap: (profile) => profile.tokenCaps.briefRefine,
  getTemperature: (profile) => profile.temperatures.extract,
  buildPrompt(input) {
    const prefixMessages: LlmMessage[] = [
      {
        role: 'system',
        content:
          'You are a job brief refiner. Return a flat JSON object with keys: {"title": string, "company": string, "seniority": string, "topSkills": string[]}. Use only facts present in the text.',
      },
    ];
    const suffixContent = [
      `INITIAL_BRIEF:\n${input.deterministicBriefText}`,
      `EXCERPT:\n${input.rawSnippet.slice(0, 900)}`,
    ].join('\n\n');

    return {
      prefixMessages,
      suffixMessage: { role: 'user', content: suffixContent },
      inputHash: fnv1aHash(suffixContent),
      briefHash: fnv1aHash(input.deterministicBriefText),
      voiceId: 'neutral',
    };
  },
  validate(rawOutput) {
    try {
      const cleaned = sanitizeLlmOutput(rawOutput)
        .replace(/\.$/, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      RefinedJobBriefSchema.parse(parsed);
      return {
        valid: true,
        sanitizedText: JSON.stringify(parsed),
        failures: [],
        repairInstruction: '',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON';
      return {
        valid: false,
        sanitizedText: rawOutput,
        failures: [
          {
            validator: 'protectedTerms',
            reason: `JSON schema validation failed: ${msg}`,
            repairHint:
              'Return valid JSON matching {"title": string, "company": string, "seniority": string, "topSkills": string[]}.',
          },
        ],
        repairInstruction:
          'Return valid JSON matching {"title": string, "company": string, "seniority": string, "topSkills": string[]}.',
      };
    }
  },
  repair() {
    return 'Return ONLY valid JSON matching {"title": string, "company": string, "seniority": string, "topSkills": string[]}.';
  },
  baseline(input) {
    return JSON.stringify({
      title: input.defaultTitle,
      company: input.defaultCompany,
      seniority: input.defaultSeniority,
      topSkills: input.defaultTopSkills,
    });
  },
};

// ============================================================================
// 5. classifyImportBlocks Task (Flat JSON, max ~450 tokens, temperature 0)
// ============================================================================

export interface ClassifyImportBlocksTaskInput {
  blocks: string[];
}

export const ClassifiedImportBlocksSchema = z.object({
  blocks: z.array(
    z.object({
      index: z.number().int().nonnegative(),
      kind: z.enum([
        'contact',
        'summary',
        'experience',
        'skills',
        'education',
        'projects',
      ]),
      confidence: z.number(),
    }),
  ),
});

export const classifyImportBlocksTask: LlmTaskDefinition<ClassifyImportBlocksTaskInput> =
  {
    id: 'classifyImportBlocks',
    promptVersion: 'v2.1',
    format: 'json',
    getTokenCap: (profile) => profile.tokenCaps.importClassify,
    getTemperature: (profile) => profile.temperatures.classify,
    buildPrompt(input) {
      const prefixMessages: LlmMessage[] = [
        {
          role: 'system',
          content:
            'You are a resume import block classifier. Classify each numbered text block as contact, summary, experience, skills, education, or projects. Return JSON: {"blocks": [{"index": number, "kind": string, "confidence": number}]}.',
        },
      ];
      const suffixContent = input.blocks
        .slice(0, 12)
        .map((b, i) => `[${i}] ${b.slice(0, 220)}`)
        .join('\n');

      return {
        prefixMessages,
        suffixMessage: { role: 'user', content: suffixContent },
        inputHash: fnv1aHash(suffixContent),
        briefHash: 'import',
        voiceId: 'neutral',
      };
    },
    validate(rawOutput) {
      try {
        const cleaned = sanitizeLlmOutput(rawOutput)
          .replace(/\.$/, '')
          .trim();
        const parsed = JSON.parse(cleaned);
        ClassifiedImportBlocksSchema.parse(parsed);
        return {
          valid: true,
          sanitizedText: JSON.stringify(parsed),
          failures: [],
          repairInstruction: '',
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Invalid JSON';
        return {
          valid: false,
          sanitizedText: rawOutput,
          failures: [
            {
              validator: 'protectedTerms',
              reason: `Invalid JSON: ${msg}`,
              repairHint:
                'Return valid JSON: {"blocks": [{"index": 0, "kind": "experience", "confidence": 0.9}]}.',
            },
          ],
          repairInstruction:
            'Return valid JSON: {"blocks": [{"index": 0, "kind": "experience", "confidence": 0.9}]}.',
        };
      }
    },
    repair() {
      return 'Return ONLY valid JSON: {"blocks": [{"index": 0, "kind": "experience", "confidence": 0.9}]}.';
    },
    baseline(input) {
      return JSON.stringify({
        blocks: input.blocks.map((block, index) => {
          const lower = block.toLowerCase();
          let kind:
            | 'contact'
            | 'summary'
            | 'experience'
            | 'skills'
            | 'education'
            | 'projects' = 'experience';
          if (index === 0 || lower.includes('@')) kind = 'contact';
          else if (lower.includes('skills') || lower.includes('technologies'))
            kind = 'skills';
          else if (lower.includes('university') || lower.includes('b.s.'))
            kind = 'education';
          return { index, kind, confidence: 0.9 };
        }),
      });
    },
  };

// ============================================================================
// 6. extractJobFact Task (Snippet JSON, <= 220 tokens in, <= 80 tokens out, temp 0)
// ============================================================================

export type ExtractableJobFactKey =
  | 'location'
  | 'workPermits'
  | 'languages'
  | 'employmentType';

export interface ExtractJobFactTaskInput {
  factKey: ExtractableJobFactKey;
  snippet: string;
  rawPosting?: string;
  snippetHash?: string;
}

export const JOB_FACT_ALLOWED_VALUES: Record<ExtractableJobFactKey, string[]> = {
  location: ['remote', 'hybrid', 'onsite', 'not-stated'],
  workPermits: [
    'sponsors',
    'sponsored',
    'no-sponsorship',
    'not-offered',
    'conditional',
    'citizen-or-pr-only',
    'citizenship-or-clearance-required',
    'clearance-required',
    'not-stated',
  ],
  languages: ['english', 'french', 'bilingual', 'not-stated'],
  employmentType: [
    'full-time',
    'part-time',
    'contract',
    'fixed-term',
    'internship',
    'apprenticeship',
    'temporary',
    'not-stated',
  ],
};

export const ExtractedJobFactOutputSchema = z.object({
  value: z.string(),
  quote: z.string(),
});

const EXTRACT_JOB_FACT_FEW_SHOTS: LlmMessage[] = [
  {
    role: 'user',
    content:
      'FACT: workPermits\nALLOWED_VALUES: sponsored, not-offered, conditional, citizen-or-pr-only, clearance-required, not-stated\nTEXT: Must be authorized to work in the United States; we are unable to sponsor visas at this time.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      value: 'not-offered',
      quote: 'we are unable to sponsor visas at this time.',
    }),
  },
  {
    role: 'user',
    content:
      'FACT: workPermits\nALLOWED_VALUES: sponsored, not-offered, conditional, citizen-or-pr-only, clearance-required, not-stated\nTEXT: Visa sponsorship may be considered for exceptional candidates with H-1B transfer.',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      value: 'conditional',
      quote:
        'Visa sponsorship may be considered for exceptional candidates with H-1B transfer.',
    }),
  },
  {
    role: 'user',
    content:
      'FACT: location\nALLOWED_VALUES: remote, hybrid, onsite, not-stated\nTEXT: Poste en mode hybride (3 jours au bureau à Montréal, 2 jours en télétravail).',
  },
  {
    role: 'assistant',
    content: JSON.stringify({
      value: 'hybrid',
      quote:
        'Poste en mode hybride (3 jours au bureau à Montréal, 2 jours en télétravail).',
    }),
  },
];

export const extractJobFactTask: LlmTaskDefinition<ExtractJobFactTaskInput> = {
  id: 'extractJobFact',
  promptVersion: 'v1.0',
  format: 'json',
  getTokenCap: (profile) => profile.tokenCaps.jobFact ?? 80,
  getTemperature: () => 0,
  buildPrompt(input) {
    const allowed = JOB_FACT_ALLOWED_VALUES[input.factKey];
    const prefixMessages: LlmMessage[] = [
      {
        role: 'system',
        content:
          'You are a job posting fact classifier. Classify the requested FACT from the TEXT into one of ALLOWED_VALUES and return a verbatim quote from TEXT. Return JSON: {"value": string, "quote": string}. If uncertain or not stated, return {"value": "not-stated", "quote": ""}.',
      },
      ...EXTRACT_JOB_FACT_FEW_SHOTS,
    ];
    // Cap snippet at ~220 tokens (~840 chars)
    const boundedSnippet = input.snippet.slice(0, 840);
    const suffixContent = [
      `FACT: ${input.factKey}`,
      `ALLOWED_VALUES: ${allowed.join(', ')}`,
      `TEXT: ${boundedSnippet}`,
    ].join('\n');

    return {
      prefixMessages,
      suffixMessage: { role: 'user', content: suffixContent },
      inputHash:
        input.snippetHash || fnv1aHash(`${input.factKey}|${boundedSnippet}`),
      briefHash: 'jobfact',
      voiceId: 'neutral',
    };
  },
  validate(rawOutput, input) {
    const allowed = JOB_FACT_ALLOWED_VALUES[input.factKey];
    const rawPosting = input.rawPosting ?? input.snippet;
    try {
      const cleaned = sanitizeLlmOutput(rawOutput)
        .replace(/\.$/, '')
        .trim();
      const parsed = JSON.parse(cleaned);
      const result = ExtractedJobFactOutputSchema.parse(parsed);
      const normalizedVal = result.value.trim().toLowerCase();

      if (!allowed.includes(normalizedVal)) {
        return {
          valid: false,
          sanitizedText: rawOutput,
          failures: [
            {
              validator: 'protectedTerms',
              reason: `Value "${result.value}" is not in allowed values [${allowed.join(', ')}].`,
              repairHint: `Choose "value" strictly from: ${allowed.join(', ')}.`,
            },
          ],
          repairInstruction: `Return valid JSON with "value" in [${allowed.join(', ')}] and a verbatim "quote" from TEXT.`,
        };
      }

      if (normalizedVal !== 'not-stated') {
        const quoteTrimmed = result.quote.trim();
        const inRaw =
          quoteTrimmed.length >= 3 &&
          (rawPosting.includes(quoteTrimmed) ||
            input.snippet.includes(quoteTrimmed) ||
            rawPosting
              .toLowerCase()
              .includes(quoteTrimmed.toLowerCase()));
        if (!inRaw) {
          return {
            valid: false,
            sanitizedText: rawOutput,
            failures: [
              {
                validator: 'protectedTerms',
                reason: `Quote "${quoteTrimmed}" does not appear verbatim in the posting text.`,
                repairHint:
                  'Copy "quote" verbatim from TEXT, or return {"value": "not-stated", "quote": ""}.',
              },
            ],
            repairInstruction:
              'Copy "quote" verbatim from TEXT, or return {"value": "not-stated", "quote": ""}.',
          };
        }
      }

      return {
        valid: true,
        sanitizedText: JSON.stringify({
          value: normalizedVal,
          quote: result.quote.trim(),
        }),
        failures: [],
        repairInstruction: '',
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Invalid JSON';
      return {
        valid: false,
        sanitizedText: rawOutput,
        failures: [
          {
            validator: 'protectedTerms',
            reason: `Invalid JSON: ${msg}`,
            repairHint: `Return valid JSON: {"value": "${allowed[0]}", "quote": "..."}.`,
          },
        ],
        repairInstruction: `Return valid JSON: {"value": "${allowed[0]}", "quote": "..."}.`,
      };
    }
  },
  repair(failures) {
    return `Fix the JSON response: ${failures.map((f) => f.repairHint).join(' ')}`;
  },
  baseline() {
    return JSON.stringify({ value: 'not-stated', quote: '' });
  },
};

export const HARNESS_TASK_CATALOG = {
  rewriteBullet: rewriteBulletTask,
  writeSummary: writeSummaryTask,
  writeLetterBlock: writeLetterBlockTask,
  refineJobBrief: refineJobBriefTask,
  classifyImportBlocks: classifyImportBlocksTask,
  extractJobFact: extractJobFactTask,
} as const;

