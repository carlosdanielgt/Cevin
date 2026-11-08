import { z } from 'zod';
import {
  COVER_LETTER_CLICHE_OPENERS,
  COVER_LETTER_LENGTH_BANDS,
  CoverLetterBlockType,
  CoverLetterLength,
  VoiceLevel,
  getVoiceStyleSpec,
} from '../../domain';
import { LlmChatRequest, LlmProvider } from '../ports/outbound';

export const PROMPT_VERSION = '1.3.0';

/**
 * Prompt template for structuring raw resume text into Bank items.
 * Designed for 7B–8B local models: explicit rules, concrete JSON shape, zero hallucination.
 */
export function buildStructureResumePrompt(rawText: string): LlmChatRequest {
  return {
    temperature: 0.15,
    topP: 0.85,
    systemPrompt: [
      `You are Cevin's truthfulness-first resume parser (prompt v${PROMPT_VERSION}).`,
      'Extract ONLY facts present in the source resume text.',
      'Never invent companies, dates, metrics, degrees, or skills.',
      'Split experience bullets into achievements with { action, result, metric, tags }.',
      'Return valid JSON matching the requested schema.',
    ].join(' '),
    userPrompt: `Parse the following resume text into structured JSON:\n\n---\n${rawText.slice(0, 12000)}\n---`,
  };
}

/**
 * Prompt template for extracting a structured Job Description analysis.
 */
export function buildAnalyzeJobPrompt(jobDescription: string): LlmChatRequest {
  return {
    temperature: 0.1,
    topP: 0.85,
    systemPrompt: [
      `You are Cevin's job description analyzer (prompt v${PROMPT_VERSION}).`,
      'Extract role title, company name, seniority level, must-have vs nice-to-have requirements,',
      'core responsibilities, and technical/domain keywords.',
      'Keep requirement chip text concise (2 to 5 words each, e.g. "Kubernetes & Helm", "PostgreSQL tuning", "TypeScript").',
      'Return valid JSON only.',
    ].join(' '),
    userPrompt: `Analyze this job description and extract structured requirements:\n\n---\n${jobDescription.slice(0, 10000)}\n---`,
  };
}

/**
 * Prompt template for rewriting a single Bank achievement in the user's selected Voice.
 */
export function buildTailorBulletPrompt(params: {
  action: string;
  result: string;
  metric?: string;
  company: string;
  roleTitle: string;
  targetJobTitle: string;
  matchedKeywords: string[];
  voice: VoiceLevel;
}): LlmChatRequest {
  const spec = getVoiceStyleSpec(params.voice);
  return {
    temperature: spec.temperature,
    topP: spec.topP,
    systemPrompt: [
      `You are Cevin's truthful resume writer (prompt v${PROMPT_VERSION}).`,
      'STRICT RULE: You may rephrase, tighten, and reorder facts from the provided Bank item.',
      'You must NEVER invent numbers, metrics, employers, dates, or tools not listed in the source.',
      `Voice level: ${spec.label} (${spec.tagline})`,
      `Sentence rhythm: ${spec.sentenceVariance}`,
      `Verb style: ${spec.verbGuidance}`,
      `Concreteness: ${spec.concreteness}`,
      `Banned clichés (DO NOT USE): ${spec.bannedCliches.join(', ')}`,
      'Return JSON: { "bullet": "<single tailored bullet string>" }.',
    ].join('\n'),
    userPrompt: [
      `Target Role: ${params.targetJobTitle}`,
      `Source Experience: ${params.roleTitle} at ${params.company}`,
      `Source Action: ${params.action}`,
      `Source Result: ${params.result}`,
      params.metric ? `Source Verified Metric: ${params.metric}` : '',
      params.matchedKeywords.length > 0
        ? `Emphasize these verified keywords if naturally applicable: ${params.matchedKeywords.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/**
 * Prompt template for generating a truthful 2-sentence executive summary grounded in the Bank.
 */
export function buildTailorSummaryPrompt(params: {
  headline: string;
  targetRole: string;
  targetCompany: string;
  verifiedSkills: string[];
  verifiedCompanies: string[];
  voice: VoiceLevel;
}): LlmChatRequest {
  const spec = getVoiceStyleSpec(params.voice);
  return {
    temperature: spec.temperature,
    topP: spec.topP,
    systemPrompt: [
      `You are Cevin's truthful summary writer (prompt v${PROMPT_VERSION}).`,
      'Write a 2-sentence resume summary using ONLY the verified skills and companies provided.',
      'Do not use first-person pronouns (I, my, we).',
      `Voice level: ${spec.label}. Banned words: ${spec.bannedCliches.join(', ')}.`,
      'Return JSON: { "summary": "<2-sentence summary>" }.',
    ].join('\n'),
    userPrompt: [
      `Candidate Headline: ${params.headline}`,
      `Target Role: ${params.targetRole} at ${params.targetCompany}`,
      `Verified Skills: ${params.verifiedSkills.slice(0, 10).join(', ')}`,
      `Prior Companies: ${params.verifiedCompanies.join(', ')}`,
    ].join('\n'),
  };
}

/**
 * Prompt template for generating a grounded, truthful Cover Letter structured into blocks.
 */
export function buildCoverLetterPrompt(params: {
  candidateName: string;
  targetCompany: string;
  targetRole: string;
  recipient: string;
  length: CoverLetterLength;
  voice: VoiceLevel;
  proofAchievements: Array<{
    id: string;
    company: string;
    title: string;
    action: string;
    result: string;
    metric?: string;
  }>;
  jobRequirements: string[];
  whyCompanyNotes: string;
}): LlmChatRequest {
  const spec = getVoiceStyleSpec(params.voice);
  const band = COVER_LETTER_LENGTH_BANDS[params.length];

  return {
    temperature: spec.temperature,
    topP: spec.topP,
    systemPrompt: [
      `You are Cevin's truthful cover letter writer (prompt v${PROMPT_VERSION}).`,
      'STRICT GROUNDING RULE: Every claim about the user must come from the provided Bank achievements.',
      'Every claim about the company must come from the job requirements or the user notes.',
      'Never invent employers, metrics, projects, or company initiatives.',
      `Target word count: ${band.targetWords}.`,
      `Voice level: ${spec.label} (${spec.tagline}).`,
      `Never use stock openers: ${COVER_LETTER_CLICHE_OPENERS.join(', ')}.`,
      `Never use banned clichés: ${spec.bannedCliches.join(', ')}.`,
      'Return valid JSON with { blocks: Array<{ type, text, sourceIds }> }.',
    ].join('\n'),
    userPrompt: [
      `Candidate: ${params.candidateName}`,
      `Target Role: ${params.targetRole} at ${params.targetCompany}`,
      `Recipient: ${params.recipient}`,
      `Top Job Requirements: ${params.jobRequirements.join(', ')}`,
      params.whyCompanyNotes
        ? `Why This Company Notes: ${params.whyCompanyNotes}`
        : '',
      'Proof Achievements from Bank:',
      ...params.proofAchievements.map(
        (a) =>
          `- [${a.id}] (${a.title} at ${a.company}): ${a.action} -> ${a.result}${a.metric ? ` (${a.metric})` : ''}`,
      ),
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/**
 * Prompt template for rewriting a single Cover Letter paragraph block.
 */
export function buildRewriteLetterBlockPrompt(params: {
  blockType: CoverLetterBlockType;
  currentText: string;
  targetCompany: string;
  targetRole: string;
  voice: VoiceLevel;
  sourceSummaries: string[];
}): LlmChatRequest {
  const spec = getVoiceStyleSpec(params.voice);
  return {
    temperature: spec.temperature,
    topP: spec.topP,
    systemPrompt: [
      `You are Cevin's truthful cover letter editor (prompt v${PROMPT_VERSION}).`,
      `Rewrite the "${params.blockType}" paragraph in the "${spec.label}" voice (${spec.tagline}).`,
      'Preserve all verified facts, numbers, and company names. Never invent new metrics or facts.',
      `Avoid banned clichés: ${spec.bannedCliches.join(', ')}.`,
      'Return JSON: { "text": "<rewritten paragraph>" }.',
    ].join('\n'),
    userPrompt: [
      `Target Role: ${params.targetRole} at ${params.targetCompany}`,
      `Current Paragraph: ${params.currentText}`,
      params.sourceSummaries.length > 0
        ? `Verified Sources: ${params.sourceSummaries.join(' | ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/**
 * Extracts JSON block from a raw LLM string response when a provider lacks native JSON schema mode.
 */
export function extractAndRepairJsonString(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

/**
 * Shared capability fallback & Zod validation helper in `core/application`.
 */
export async function executeStructuredLlmCall<T>(
  provider: LlmProvider,
  req: LlmChatRequest,
  schema: z.ZodType<T>,
  supportsNativeJsonSchema = true,
): Promise<T> {
  const attempt = async (promptOverride?: string): Promise<T> => {
    const effectiveReq: LlmChatRequest = promptOverride
      ? { ...req, userPrompt: promptOverride }
      : req;

    if (supportsNativeJsonSchema) {
      const rawResult = await provider.chatJSON(effectiveReq, schema);
      return schema.parse(rawResult);
    }

    let collected = '';
    for await (const token of provider.chat({
      ...effectiveReq,
      systemPrompt: `${effectiveReq.systemPrompt}\nIMPORTANT: Respond ONLY with valid JSON. No markdown prose.`,
    })) {
      collected += token;
    }
    const repaired = extractAndRepairJsonString(collected);
    const parsed = JSON.parse(repaired);
    return schema.parse(parsed);
  };

  try {
    return await attempt();
  } catch (firstErr) {
    const errorMsg =
      firstErr instanceof Error ? firstErr.message : String(firstErr);
    const retryPrompt = `${req.userPrompt}\n\nYour previous JSON response failed validation:\n${errorMsg}\nPlease correct the JSON structure and return valid JSON only.`;
    return await attempt(retryPrompt);
  }
}
