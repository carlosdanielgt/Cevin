import { z } from 'zod';
import {
  CandidateBankSubsetSlice,
  EvidenceContextSlice,
  ExperienceRecordSlice,
  SourceRecordSlice,
} from '../../../domain';

/**
 * Exact system prompt trained with `mask_prompt: true` and `max_seq_length: 1024`
 * across both fine-tuned Cevin MLX models:
 * - `Qwen2.5-1.5B-Instruct-4bit` (Rank-32 LoRA, default)
 * - `cevin-3b-4bit-fused` (`adapters_3b_v4`)
 *
 * Both models were trained on the exact same dataset and share this identical
 * system prompt without extra schema injections or few-shot examples.
 */
export const CEVIN_MLX_SYSTEM_PROMPT =
  "You are Cevin's specialized Career Intelligence Engine. You operate strictly on structured career evidence. Never invent metrics, technologies, or experience not grounded in the source data. Always respond in valid JSON.";

export const DEFAULT_MLX_1_5B_MODEL_PATH = './cevin-1.5b-4bit-fused';
export const CEVIN_3B_MODEL_PATH = './cevin-3b-4bit-fused';

/**
 * Resolves the local fused directory path on Apple Silicon for an integrated MLX model ID or alias.
 */
export function resolveMlxModelPath(modelIdOrPath: string): string {
  const clean = modelIdOrPath.trim();
  if (!clean) return DEFAULT_MLX_1_5B_MODEL_PATH;
  const lower = clean.toLowerCase();
  if (
    lower === 'qwen2.5-1.5b-instruct-4bit' ||
    lower === 'cevin-1.5b-4bit-fused' ||
    lower === './qwen2.5-1.5b-instruct-4bit' ||
    lower === 'qwen2.5-1.5b'
  ) {
    return DEFAULT_MLX_1_5B_MODEL_PATH;
  }
  if (lower === 'cevin-3b-4bit-fused') {
    return CEVIN_3B_MODEL_PATH;
  }
  if (clean.startsWith('./') || clean.startsWith('/')) return clean;
  return `./${clean}`;
}

export type MlxCareerTaskName =
  | 'experience_extraction'
  | 'experience_matching'
  | 'hallucination_audit'
  | 'bullet_evaluation_and_rewrite'
  | 'executive_summary_synthesis';

// ============================================================================
// Task 1: experience_extraction (temp = 0.0)
// ============================================================================

export const ExtractedExperienceDtoSchema = z.object({
  task: z.literal('experience_extraction').default('experience_extraction'),
  evidence_quote: z.string(),
  domain: z.string(),
  company: z.string(),
  role_context: z.string(),
  timeframe: z.string(),
  project: z.string(),
  action: z.string(),
  technologies: z.array(z.string()),
  scale: z.string(),
  impact: z.string(),
});

export type ExtractedExperienceDto = z.infer<
  typeof ExtractedExperienceDtoSchema
>;

export function buildMlxExperienceExtractionPrompt(
  rawStatement: string,
  timeframe = 'Unspecified',
): string {
  return [
    'TASK: Extract a structured Experience Bank record from the following raw career statement.',
    `CONTEXT_TIMEFRAME: ${timeframe.trim() || 'Unspecified'}`,
    `RAW_STATEMENT: "${rawStatement.replace(/"/g, '\\"').trim()}"`,
  ].join('\n');
}

// ============================================================================
// Task 2: experience_matching (temp = 0.0)
// Preserves CoT key ordering: direct_evidence, missing_evidence, reasoning -> confidence, match_level
// ============================================================================

export type ExperienceRecordDto = ExperienceRecordSlice;

export const RequirementMatchDtoSchema = z.object({
  task: z.literal('experience_matching').default('experience_matching'),
  experience_id: z.string(),
  direct_evidence: z.string(),
  missing_evidence: z.string(),
  reasoning: z.string(),
  confidence: z.number().min(0).max(1),
  match_level: z.enum(['strong', 'covered', 'partial', 'none', 'gap']),
});

export type RequirementMatchDto = z.infer<typeof RequirementMatchDtoSchema>;

export function buildMlxRequirementMatchPrompt(
  requirement: string,
  experience: ExperienceRecordDto,
  targetRole?: string,
): string {
  const cleanReq = requirement.trim();
  const formattedReq =
    /\[Role:\s*[^\]]+\]/i.test(cleanReq) || !targetRole?.trim()
      ? cleanReq
      : `${cleanReq} [Role: ${targetRole.trim()}]`;

  const orderedRecord = {
    experience_id: experience.experience_id,
    project: experience.project,
    role: experience.role,
    action: experience.action,
    technologies: experience.technologies,
    scale: experience.scale,
    impact: experience.impact,
    domain: experience.domain,
  };

  return [
    'TASK: Classify how well the Experience Bank record satisfies the Job Requirement.',
    `JOB_REQUIREMENT: "${formattedReq.replace(/"/g, '\\"')}"`,
    `EXPERIENCE_RECORD: ${JSON.stringify(orderedRecord)}`,
  ].join('\n');
}

// ============================================================================
// Task 3: hallucination_audit (temp = 0.0)
// Preserves CoT key ordering: violations, explanation, factual_consistency_score, verdict, corrected_bullet
// ============================================================================

export type SourceRecordDto = SourceRecordSlice;

export const HallucinationAuditDtoSchema = z.object({
  task: z.literal('hallucination_audit').default('hallucination_audit'),
  violations: z.array(z.string()),
  explanation: z.string(),
  factual_consistency_score: z.number().min(0).max(1),
  verdict: z.enum(['supported', 'unsupported', 'grounded', 'hallucinated']),
  corrected_bullet: z.string(),
});

export type HallucinationAuditDto = z.infer<typeof HallucinationAuditDtoSchema>;

export function buildMlxHallucinationAuditPrompt(
  sourceRecord: SourceRecordDto,
  generatedBullet: string,
): string {
  const orderedSource = {
    record_id: sourceRecord.record_id,
    project: sourceRecord.project,
    action: sourceRecord.action,
    technologies: sourceRecord.technologies,
    scale: sourceRecord.scale,
    impact: sourceRecord.impact,
  };

  return [
    'TASK: Audit the generated resume bullet against the source Experience Bank record for hallucinations or unverified claims.',
    `SOURCE_RECORD: ${JSON.stringify(orderedSource)}`,
    `GENERATED_BULLET: "${generatedBullet.replace(/"/g, '\\"').trim()}"`,
  ].join('\n');
}

// ============================================================================
// Task 4: bullet_evaluation_and_rewrite (temp = 0.0)
// Header A when both scale and impact are present; Header B when either is null/empty
// Preserves CoT key ordering: critique, draft_scores, missing_evidence_questions, grounded_rewrite
// ============================================================================

export type EvidenceContextDto = EvidenceContextSlice;

export const BulletEvaluationDtoSchema = z.object({
  task: z
    .literal('bullet_evaluation_and_rewrite')
    .default('bullet_evaluation_and_rewrite'),
  critique: z.string(),
  draft_scores: z.object({
    ownership: z.number(),
    action: z.number(),
    technical_depth: z.number(),
    scope: z.number(),
    impact: z.number(),
    clarity: z.number(),
  }),
  missing_evidence_questions: z.array(z.string()),
  grounded_rewrite: z.string(),
});

export type BulletEvaluationDto = z.infer<typeof BulletEvaluationDtoSchema>;

export const MLX_BULLET_REWRITE_HEADER_COMPLETE =
  'TASK: Evaluate the draft resume bullet and rewrite it using ONLY the provided Experience Bank evidence.';

export const MLX_BULLET_REWRITE_HEADER_PARTIAL =
  'TASK: Evaluate the draft resume bullet against the partial Experience Bank record. Do NOT invent missing metrics; surface follow-up questions instead.';

export function buildMlxBulletEvaluationPrompt(
  draftBullet: string,
  evidence: EvidenceContextDto,
): string {
  const hasCompleteEvidence = Boolean(
    evidence.scale &&
      evidence.scale.trim().length > 0 &&
      evidence.impact &&
      evidence.impact.trim().length > 0,
  );
  const header = hasCompleteEvidence
    ? MLX_BULLET_REWRITE_HEADER_COMPLETE
    : MLX_BULLET_REWRITE_HEADER_PARTIAL;

  const orderedEvidence = {
    project: evidence.project,
    action: evidence.action,
    technologies: evidence.technologies,
    scale:
      evidence.scale && evidence.scale.trim().length > 0
        ? evidence.scale.trim()
        : null,
    impact:
      evidence.impact && evidence.impact.trim().length > 0
        ? evidence.impact.trim()
        : null,
  };

  return [
    header,
    `DRAFT_BULLET: "${draftBullet.replace(/"/g, '\\"').trim()}"`,
    `EXPERIENCE_BANK_EVIDENCE: ${JSON.stringify(orderedEvidence)}`,
  ].join('\n');
}

// ============================================================================
// Task 5: executive_summary_synthesis (temp = 0.2 + Mandatory Audit Sandwich)
// Preserves CoT key ordering: jd_sentiment_and_pain_point, ideal_candidate_archetype,
// selected_skills, omitted_jd_skills, verified_metrics_used, tailored_summary
// ============================================================================

export type CandidateBankSubsetDto = CandidateBankSubsetSlice;

export const ExecutiveSummaryDtoSchema = z.object({
  task: z
    .literal('executive_summary_synthesis')
    .default('executive_summary_synthesis'),
  jd_sentiment_and_pain_point: z.string(),
  ideal_candidate_archetype: z.string(),
  selected_skills: z.array(z.string()),
  omitted_jd_skills: z.array(z.string()),
  verified_metrics_used: z.array(z.string()),
  tailored_summary: z.string(),
});

export type ExecutiveSummaryDto = z.infer<typeof ExecutiveSummaryDtoSchema>;

export function buildMlxExecutiveSummaryPrompt(
  jdExcerpt: string,
  candidateBank: CandidateBankSubsetDto,
): string {
  const orderedBank = {
    profile: {
      id: candidateBank.profile.id,
      headline: candidateBank.profile.headline,
    },
    matched_skills: candidateBank.matched_skills.slice(0, 5).map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
    })),
    top_achievements: candidateBank.top_achievements.slice(0, 2).map((a) => ({
      id: a.id,
      experienceId: a.experienceId,
      action: a.action,
      result: a.result,
      metric: a.metric,
      skillIds: a.skillIds,
      tags: a.tags,
    })),
  };

  return [
    "TASK: Analyze the Job Description's underlying pain points and synthesize a tailored, factual Executive Summary using ONLY the candidate's matched Cevin Experience Bank records.",
    `TARGET_JD_EXCERPT: "${jdExcerpt.replace(/"/g, '\\"').trim()}"`,
    `CEVIN_CANDIDATE_BANK: ${JSON.stringify(orderedBank)}`,
  ].join('\n');
}

// ============================================================================
// Domain Port: CareerIntelligencePort
// ============================================================================

export interface CareerIntelligencePort {
  extractExperienceRecord(
    rawStatement: string,
    timeframe?: string,
  ): Promise<ExtractedExperienceDto>;

  classifyRequirementMatch(
    requirement: string,
    experience: ExperienceRecordDto,
    targetRole?: string,
  ): Promise<RequirementMatchDto>;

  auditBulletHallucination(
    sourceRecord: SourceRecordDto,
    generatedBullet: string,
  ): Promise<HallucinationAuditDto>;

  evaluateAndRewriteBullet(
    draftBullet: string,
    evidence: EvidenceContextDto,
  ): Promise<BulletEvaluationDto>;

  synthesizeExecutiveSummary(
    jdExcerpt: string,
    candidateBank: CandidateBankSubsetDto,
  ): Promise<ExecutiveSummaryDto>;
}
