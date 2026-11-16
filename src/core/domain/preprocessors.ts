import {
  Achievement,
  BankSnapshot,
  Experience,
  ParsedJob,
  Skill,
} from './entities';
import { extractNormalizedNumbers } from './harness';
import {
  evaluateKeywordPresence,
  expandKeywordAliases,
  normalizeKeyword,
} from './keywords';
import { buildCustomAliasMap, rankBankItemsForJob } from './matching';


/**
 * Domain Pre-Processor micro-schemas shared across Cevin's fine-tuned MLX models
 * (`Qwen2.5-1.5B-Instruct-4bit` Rank-32 LoRA and `cevin-3b-4bit-fused`).
 * Strictly decoupled from generic fallback prompt compression so structured JSON is never truncated mid-string.
 */

export interface ExperienceRecordSlice {
  experience_id: string;
  project: string;
  role: string;
  action: string;
  technologies: string[];
  scale: string;
  impact: string;
  domain: string;
}

export interface SourceRecordSlice {
  record_id: string;
  project: string;
  action: string;
  technologies: string[];
  scale: string;
  impact: string;
}

export interface EvidenceContextSlice {
  project: string;
  action: string;
  technologies: string[];
  scale: string | null;
  impact: string | null;
}

export interface CandidateBankSubsetSlice {
  profile: {
    id: string;
    headline: string;
  };
  matched_skills: Array<{
    id: string;
    name: string;
    category: string;
  }>;
  top_achievements: Array<{
    id: string;
    experienceId: string;
    action: string;
    result: string;
    metric: string;
    skillIds: string[];
    tags: string[];
  }>;
}

export interface ExtractedExperienceInput {
  task?: 'experience_extraction';
  evidence_quote?: string;
  domain: string;
  company: string;
  role_context: string;
  timeframe: string;
  project: string;
  action: string;
  technologies: string[];
  scale: string;
  impact: string;
}

const MLX_BOILERPLATE_BLOCK_PATTERNS: RegExp[] = [
  /\b(?:equal opportunity employer|eeo statement|all qualified applicants will receive consideration|without regard to race|sexual orientation|gender identity|veteran status|disability accommodation|affirmative action)\b[\s\S]*$/i,
  /\b(?:benefits and perks|what we offer|our benefits|comprehensive health|medical,?\s*dental,?\s*(?:and\s+)?vision|401\s*\(k\)|unlimited pto|paid parental leave|commuter benefits)\b[\s\S]*$/i,
  /\b(?:pay transparency|compensation range|base salary range|california privacy notice|ccpa|applicant privacy|legal disclaimer)\b[\s\S]*$/i,
];

const MLX_INLINE_BOILERPLATE_LINE_PATTERNS: RegExp[] = [
  /^(?:salary|compensation|base pay|pay range|benefits|perks|eeo|equal opportunity|legal)\s*:/i,
  /\$\d{2,3},\d{3}\s*(?:-|to|–|—)\s*\$\d{2,3},\d{3}/i,
  /\b(?:401\(k\)|dental and vision|equal opportunity employer|background check required)\b/i,
];

/**
 * Strips EEO statements, company benefits, salary disclosures, and legal footers
 * from raw job descriptions while keeping role summary, responsibilities, and technical requirements,
 * capped at `maxWords` (default 280 words, well within the 1024-token MLX context ceiling).
 */
export function stripJdBoilerplateForMlx(
  rawJd: string,
  maxWords = 280,
): string {
  if (!rawJd || !rawJd.trim()) return '';

  let cleaned = rawJd.trim();
  for (const blockPattern of MLX_BOILERPLATE_BLOCK_PATTERNS) {
    cleaned = cleaned.replace(blockPattern, '').trim();
  }

  const keptLines = cleaned
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => {
      if (!line) return false;
      return !MLX_INLINE_BOILERPLATE_LINE_PATTERNS.some((pat) =>
        pat.test(line),
      );
    });

  const joined = keptLines.join(' ').replace(/\s+/g, ' ').trim();
  const words = joined.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return joined;
  }
  return words.slice(0, maxWords).join(' ');
}

/**
 * Produces a clean 2–4 sentence `TARGET_JD_EXCERPT` (capped at ~250–300 words)
 * focused on core engineering problems, architecture, and desired skills for Task 5 (`executive_summary_synthesis`).
 */
export function extractTargetJdExcerpt(rawJd: string, maxWords = 260): string {
  const stripped = stripJdBoilerplateForMlx(rawJd, maxWords);
  if (!stripped) return '';

  // Split into sentences or bullet lines and select up to 4 most informative statements
  const rawSegments = stripped
    .split(/(?<=[.!?])\s+|\s*[-•*]\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 15);

  if (rawSegments.length === 0) {
    return stripped;
  }

  const selected = rawSegments.slice(0, 4).map((seg) => {
    const trimmed = seg.replace(/[.!?]+$/, '').trim();
    return `${trimmed}.`;
  });

  const combined = selected.join(' ');
  const words = combined.split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return combined;
  }
  return `${words.slice(0, maxWords).join(' ').replace(/[.!?]+$/, '')}.`;
}

/**
 * Splits raw CV text or career notes into individual bullet points/statements
 * so Task 1 (`experience_extraction`) processes one atomic statement at a time.
 */
export function splitCareerStatements(rawText: string): string[] {
  if (!rawText || !rawText.trim()) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.replace(/^(?:[-•*‣▪]|\d+[.)])\s+/, '').trim())
    .filter((line) => line.length >= 18);

  const statements: string[] = [];
  for (const line of lines) {
    // Skip section headers or contact lines
    if (
      /^(?:experience|education|skills|projects|summary|certifications|contact)$/i.test(
        line,
      )
    ) {
      continue;
    }
    if (line.includes('@') && line.length < 90) {
      continue;
    }
    statements.push(line);
  }
  return statements;
}

/**
 * Runs a deterministic dictionary/alias scan over `project + action + technologies`
 * against Cevin's `skills` table to populate `achievements[].skillIds`.
 * (Since the 3B model conservatively extracts tools following "using/with" into `technologies`).
 */
export function scanDeterministicSkillIds(params: {
  project?: string;
  action: string;
  technologies: string[];
  skills: Skill[];
}): string[] {
  const corpus = [
    params.project ?? '',
    params.action,
    ...params.technologies,
  ]
    .join(' ')
    .toLowerCase();

  const techNormSet = new Set(
    params.technologies.map((t) => normalizeKeyword(t)).filter(Boolean),
  );

  const matchedIds: string[] = [];
  const seen = new Set<string>();

  for (const skill of params.skills) {
    const candidates = [
      skill.name,
      ...skill.aliases,
      ...expandKeywordAliases(skill.name),
    ];

    let matched = false;
    for (const candidate of candidates) {
      const clean = candidate.trim();
      if (!clean) continue;
      const norm = normalizeKeyword(clean);
      if (techNormSet.has(norm)) {
        matched = true;
        break;
      }
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const boundaryRegex = new RegExp(
        `(?:^|[^a-z0-9])${escaped}(?:$|[^a-z0-9])`,
        'i',
      );
      if (boundaryRegex.test(corpus)) {
        matched = true;
        break;
      }
    }

    if (matched && !seen.has(skill.id)) {
      seen.add(skill.id);
      matchedIds.push(skill.id);
    }
  }

  return matchedIds;
}

/**
 * Post-processes Task 1 (`experience_extraction`) output into a canonical Cevin `Achievement` entity:
 * - Maps `action` -> `achievements[].action`
 * - Maps `impact` -> `achievements[].result`
 * - Maps `scale` -> `achievements[].metric`
 * - Maps `domain` -> `achievements[].tags`
 * - Runs deterministic dictionary/alias scan over `project + action + technologies` against `skills`
 */
export function mapExtractedExperienceToAchievement(params: {
  extracted: ExtractedExperienceInput;
  experienceId: string;
  achievementId: string;
  skills: Skill[];
}): Achievement {
  const { extracted, experienceId, achievementId, skills } = params;
  const skillIds = scanDeterministicSkillIds({
    project: extracted.project,
    action: extracted.action,
    technologies: extracted.technologies ?? [],
    skills,
  });

  const tags = Array.from(
    new Set(
      [
        extracted.domain?.trim(),
        ...(extracted.technologies ?? []).map((t) => t.trim().toLowerCase()),
      ].filter((t): t is string => Boolean(t)),
    ),
  );

  return {
    id: achievementId,
    experienceId,
    action: extracted.action.trim(),
    result: extracted.impact.trim(),
    metric: extracted.scale?.trim() || undefined,
    skillIds,
    tags,
  };
}

function resolveTechnologiesForAchievement(
  ach: Achievement,
  skills: Skill[],
): string[] {
  const skillById = new Map(skills.map((s) => [s.id, s.name]));
  const fromSkills = ach.skillIds
    .map((id) => skillById.get(id))
    .filter((name): name is string => Boolean(name));
  if (fromSkills.length > 0) {
    return fromSkills;
  }
  return ach.tags.slice(0, 6);
}

/**
 * Slices a Cevin `Achievement` + `Experience` into the compact Task 2 (`experience_matching`) micro-schema.
 */
export function sliceExperienceRecordForMatching(
  ach: Achievement,
  exp: Experience | undefined,
  skills: Skill[],
  projectOverride?: string,
): ExperienceRecordSlice {
  const technologies = resolveTechnologiesForAchievement(ach, skills);
  return {
    experience_id: ach.id,
    project:
      projectOverride?.trim() ||
      exp?.company ||
      ach.tags[0] ||
      'Core Engineering Platform',
    role: exp?.title || 'Software Engineer',
    action: ach.action,
    technologies,
    scale: ach.metric ?? '',
    impact: ach.result,
    domain: ach.tags[0] ?? 'Software Engineering',
  };
}

/**
 * Slices a Cevin `Achievement` + `Experience` into the compact Task 3 (`hallucination_audit`) micro-schema.
 */
export function sliceSourceRecordForAudit(
  ach: Achievement,
  exp: Experience | undefined,
  skills: Skill[],
  projectOverride?: string,
): SourceRecordSlice {
  const technologies = resolveTechnologiesForAchievement(ach, skills);
  return {
    record_id: ach.id,
    project:
      projectOverride?.trim() ||
      exp?.company ||
      ach.tags[0] ||
      'Core Engineering Platform',
    action: ach.action,
    technologies,
    scale: ach.metric ?? '',
    impact: ach.result,
  };
}

/**
 * Slices a Cevin `Achievement` + `Experience` into the compact Task 4 (`bullet_evaluation_and_rewrite`) micro-schema.
 * Preserves `null` when `scale` (`metric`) or `impact` (`result`) is empty so Task 4 selects Header B.
 */
export function sliceEvidenceForBulletRewrite(
  ach: Achievement,
  exp: Experience | undefined,
  skills: Skill[],
  projectOverride?: string,
): EvidenceContextSlice {
  const technologies = resolveTechnologiesForAchievement(ach, skills);
  const cleanScale = ach.metric?.trim() || null;
  const cleanImpact = ach.result?.trim() || null;
  return {
    project:
      projectOverride?.trim() ||
      exp?.company ||
      ach.tags[0] ||
      'Core Engineering Platform',
    action: ach.action,
    technologies,
    scale: cleanScale,
    impact: cleanImpact,
  };
}

/**
 * Slices the candidate's `BankSnapshot` into the compact Task 5 (`executive_summary_synthesis`) micro-schema:
 * - `profile`: `{ id, headline }`
 * - `matched_skills`: up to 5 skills from Cevin's skills array that overlap with the JD
 * - `top_achievements`: Top 2 highest-scoring achievements for the job
 */
export function sliceCandidateBankForSummary(params: {
  bank: BankSnapshot;
  parsedJob: ParsedJob | null;
  rawJd?: string;
  selectedSkillIds?: string[];
  selectedAchievementIds?: string[];
}): CandidateBankSubsetSlice {
  const { bank, parsedJob, rawJd, selectedSkillIds, selectedAchievementIds } =
    params;

  const customAliases = buildCustomAliasMap(bank.skills);
  const jdCorpus = [
    parsedJob?.title ?? '',
    ...(parsedJob?.requirements.map((r) => r.text) ?? []),
    ...(parsedJob?.keywords.map((k) => k.term) ?? []),
    ...(parsedJob?.responsibilities ?? []),
    rawJd ?? '',
  ]
    .join(' ')
    .trim();

  // Select up to 5 matched skills overlapping with the JD
  const matchedSkills: Skill[] = [];
  for (const skill of bank.skills) {
    if (matchedSkills.length >= 5) break;
    if (jdCorpus) {
      const skillCorpus = `${skill.name} ${skill.aliases.join(' ')}`;
      const directMatch =
        evaluateKeywordPresence(skill.name, jdCorpus, customAliases) !== 'gap';
      const reqMatch =
        parsedJob?.requirements.some(
          (r) =>
            evaluateKeywordPresence(r.text, skillCorpus, customAliases) !==
            'gap',
        ) ?? false;
      if (directMatch || reqMatch) {
        matchedSkills.push(skill);
      }
    }
  }

  // Fallback to selectedSkillIds or top bank skills if fewer than 5 matched directly
  if (matchedSkills.length < 5) {
    const fallbackPool =
      selectedSkillIds && selectedSkillIds.length > 0
        ? bank.skills.filter((s) => selectedSkillIds.includes(s.id))
        : bank.skills;
    for (const s of fallbackPool) {
      if (matchedSkills.length >= 5) break;
      if (!matchedSkills.some((m) => m.id === s.id)) {
        matchedSkills.push(s);
      }
    }
  }

  // Select Top 2 highest-scoring achievements
  let topAchievements: Achievement[] = [];
  if (parsedJob) {
    const ranking = rankBankItemsForJob(bank, parsedJob);
    topAchievements = ranking.rankedAchievements
      .slice(0, 2)
      .map((r) => r.achievement);
  }
  if (topAchievements.length < 2 && selectedAchievementIds?.length) {
    for (const id of selectedAchievementIds) {
      if (topAchievements.length >= 2) break;
      const found = bank.achievements.find((a) => a.id === id);
      if (found && !topAchievements.some((a) => a.id === found.id)) {
        topAchievements.push(found);
      }
    }
  }
  if (topAchievements.length < 2) {
    for (const ach of bank.achievements) {
      if (topAchievements.length >= 2) break;
      if (!topAchievements.some((a) => a.id === ach.id)) {
        topAchievements.push(ach);
      }
    }
  }

  return {
    profile: {
      id: bank.profile.id || 'profile-main',
      headline: bank.profile.headline || 'Senior Software Engineer',
    },
    matched_skills: matchedSkills.slice(0, 5).map((s) => ({
      id: s.id,
      name: s.name,
      category: s.category,
    })),
    top_achievements: topAchievements.slice(0, 2).map((a) => ({
      id: a.id,
      experienceId: a.experienceId,
      action: a.action,
      result: a.result,
      metric: a.metric ?? '',
      skillIds: a.skillIds,
      tags: a.tags,
    })),
  };
}

/**
 * Post-processing check for the Controlled Creativity Sandwich (`executive_summary_synthesis`):
 * Verifies that every number/metric in `tailoredSummary` appears in `topAchievements` (or `headline`).
 * Returns an array of any unverified number tokens (empty array means 100% grounded).
 */
export function findUnverifiedSummaryNumbers(
  tailoredSummary: string,
  topAchievements: Array<{ action: string; result: string; metric?: string }>,
  headline = '',
): string[] {
  const summaryNums = extractNormalizedNumbers(tailoredSummary);
  if (summaryNums.length === 0) return [];

  const sourceCorpus = [
    headline,
    ...topAchievements.map(
      (a) => `${a.action} ${a.result} ${a.metric ?? ''}`,
    ),
  ].join(' ');

  const sourceNums = extractNormalizedNumbers(sourceCorpus);
  const sourceDigitsSet = new Set(
    sourceNums.map((n) => n.replace(/[^0-9.]/g, '')).filter(Boolean),
  );
  const rawSourceLower = sourceCorpus.toLowerCase().replace(/,/g, '');

  const unverified: string[] = [];
  for (const sNum of summaryNums) {
    const sDigits = sNum.replace(/[^0-9.]/g, '');
    if (!sDigits) continue;
    const isVerified =
      sourceNums.includes(sNum) ||
      sourceDigitsSet.has(sDigits) ||
      rawSourceLower.includes(sNum);
    if (!isVerified) {
      unverified.push(sNum);
    }
  }

  return unverified;
}
