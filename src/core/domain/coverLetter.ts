import { computeLetterAppealScore, hasBannedLetterOpener } from './appeal';
import { assembleBullet } from './bulletAssembler';
import { deriveDocumentHeadline } from './documentMapper';
import {
  Achievement,
  Application,
  BankSnapshot,
  CoverLetterBlock,
  CoverLetterBlockType,
  CoverLetterDocument,
  CoverLetterDraft,
  CoverLetterLength,
  LetterCheckItem,
  LetterCheckReport,
  PageSize,
  ParsedJob,
  TemplateId,
  VoiceLevel,
} from './entities';
import { formatCount } from './format';
import { GroundingValidationResult } from './grounding';
import { evaluateKeywordPresence, expandKeywordAliases } from './keywords';
import { lintMachineMadeScore } from './linter';
import { buildCustomAliasMap, rankBankItemsForJob } from './matching';
import {
  TEMPLATE_SPEC_VERSION,
  computeDocumentContentHash,
} from './templateSpec';
import { getMachineMadeFeelLevel, getOneStepMoreHumanVoice } from './voice';

export const COVER_LETTER_LENGTH_BANDS: Record<
  CoverLetterLength,
  { label: string; minWords: number; maxWords: number; targetWords: string }
> = {
  short: {
    label: 'Short',
    minWords: 130,
    maxWords: 230,
    targetWords: '150–220 words',
  },
  standard: {
    label: 'Standard',
    minWords: 220,
    maxWords: 360,
    targetWords: '250–350 words',
  },
  detailed: {
    label: 'Detailed',
    minWords: 330,
    maxWords: 470,
    targetWords: '350–450 words',
  },
};

export const COVER_LETTER_CLICHE_OPENERS = [
  'i am writing to express my interest',
  'i am writing to apply',
  'i am writing to',
  "i'm writing to",
  'i am applying for',
  "i'm applying for",
  'i am excited to apply',
  "i'm excited to apply",
  'please accept this letter',
  'to whom it may concern',
  'i am a passionate',
  'i believe i am a great fit',
  'i would be a perfect fit',
  'thrilled to apply',
];

export interface CoverLetterPrioritizedFix {
  id: string;
  title: string;
  description: string;
  actionType:
    | 'replace-cliche-opening'
    | 'add-proof-point'
    | 'adjust-length'
    | 'soften-voice'
    | 'mention-company-role';
}

/**
 * Validates that a cover letter block only references numbers/metrics and tools
 * present in its cited Bank sources, the Job Description, or the user's "Why this company" notes.
 */
export function validateCoverLetterGrounding(
  blockText: string,
  sourceIds: string[],
  bank: BankSnapshot,
  jobDescription = '',
  whyCompanyNotes = '',
): GroundingValidationResult {
  const achById = new Map(bank.achievements.map((a) => [a.id, a]));
  const expById = new Map(bank.experiences.map((e) => [e.id, e]));
  const projById = new Map(bank.projects.map((p) => [p.id, p]));
  const skillById = new Map(bank.skills.map((s) => [s.id, s]));

  const verifiedSourceIds: string[] = [];
  const sourceFragments: string[] = [
    bank.profile.name,
    bank.profile.headline,
    bank.profile.location,
    jobDescription,
    whyCompanyNotes,
  ];

  const effectiveSourceIds =
    sourceIds.length > 0
      ? sourceIds
      : [
          ...bank.experiences.map((e) => e.id),
          ...bank.achievements.map((a) => a.id),
        ];

  for (const id of effectiveSourceIds) {
    const ach = achById.get(id);
    if (ach) {
      verifiedSourceIds.push(id);
      sourceFragments.push(
        ach.action,
        ach.result,
        ach.metric ?? '',
        ...ach.tags,
      );
      const exp = expById.get(ach.experienceId);
      if (exp) {
        sourceFragments.push(exp.company, exp.title, exp.start, exp.end);
      }
      for (const sId of ach.skillIds) {
        const s = skillById.get(sId);
        if (s) {
          sourceFragments.push(
            s.name,
            ...s.aliases,
            ...expandKeywordAliases(s.name),
          );
        }
      }
    }
    const exp = expById.get(id);
    if (exp) {
      verifiedSourceIds.push(id);
      sourceFragments.push(exp.company, exp.title, exp.start, exp.end);
    }
    const proj = projById.get(id);
    if (proj) {
      verifiedSourceIds.push(id);
      sourceFragments.push(proj.name, proj.description, ...proj.highlights);
    }
  }

  for (const skill of bank.skills) {
    sourceFragments.push(
      skill.name,
      ...skill.aliases,
      ...expandKeywordAliases(skill.name),
    );
  }

  const sourceCorpus = sourceFragments.join(' \n ').toLowerCase();
  const unverifiedClaims: string[] = [];

  const numberMatches =
    blockText.match(/\$?\d+(?:[.,]\d+)*(?:%|x|ms|s|k|m|b|\+)?/gi) ?? [];
  for (const rawNum of numberMatches) {
    const normalizedNum = rawNum.toLowerCase().replace(/,/g, '');
    const digitsOnly = normalizedNum.replace(/[^0-9.]/g, '');
    // Ignore simple 1-digit counts like "2" or "3" or current years
    if (digitsOnly.length <= 1 || /^20\d\d$/.test(digitsOnly)) continue;
    const normalizedSource = sourceCorpus.replace(/,/g, '');
    if (
      !normalizedSource.includes(normalizedNum) &&
      (!digitsOnly || !normalizedSource.includes(digitsOnly))
    ) {
      unverifiedClaims.push(`Unverified metric: "${rawNum}"`);
    }
  }

  const KNOWN_TECH_PROPER_NOUNS = [
    'Kubernetes',
    'Terraform',
    'PostgreSQL',
    'GraphQL',
    'Kafka',
    'Redis',
    'Docker',
    'AWS',
    'GCP',
    'Azure',
    'Rust',
    'Golang',
    'Python',
    'TypeScript',
    'React',
    'DynamoDB',
    'Snowflake',
    'Databricks',
    'Spark',
  ];

  for (const tool of KNOWN_TECH_PROPER_NOUNS) {
    const regex = new RegExp(`\\b${tool}\\b`, 'i');
    if (regex.test(blockText)) {
      const variants = expandKeywordAliases(tool);
      const presentInSource = variants.some((v) => sourceCorpus.includes(v));
      if (!presentInSource) {
        unverifiedClaims.push(`Unverified tool/skill: "${tool}"`);
      }
    }
  }

  return {
    isGrounded: unverifiedClaims.length === 0,
    unverifiedClaims,
    verifiedSourceIds,
  };
}

const PROPER_NOUN_OR_ACRONYM_PREFIXES = new Set([
  'aws',
  'gcp',
  'sql',
  'postgresql',
  'postgres',
  'kubernetes',
  'k8s',
  'kafka',
  'redis',
  'go',
  'golang',
  'typescript',
  'react',
  'python',
  'rust',
  'java',
  'c++',
  'terraform',
  'docker',
  'linux',
  'grpc',
  'rest',
  'graphql',
  'ci/cd',
  'sre',
  'api',
  'apis',
  'sdk',
  'sdks',
  'ui',
  'ux',
  'llm',
  'ai',
  'ml',
  'i',
]);

const SINGULAR_COUNTABLE_HEAD_NOUNS = new Set([
  'pipeline',
  'layer',
  'inspector',
  'system',
  'service',
  'platform',
  'engine',
  'architecture',
  'cluster',
  'module',
  'framework',
  'tool',
  'workflow',
  'gateway',
  'router',
  'scheduler',
  'compiler',
  'dashboard',
  'console',
]);

const EXISTING_DETERMINERS = new Set([
  'a',
  'an',
  'the',
  'our',
  'my',
  'their',
  'this',
  'that',
  'these',
  'those',
  'all',
  'both',
  'multiple',
  'several',
  'zero',
  'one',
  'two',
  'three',
  'four',
  'five',
]);

const PREPOSITION_BOUNDARIES = new Set([
  'in',
  'on',
  'at',
  'for',
  'with',
  'across',
  'to',
  'from',
  'by',
  'into',
  'over',
  'under',
  'while',
  'sustaining',
  'dropping',
  'reducing',
  'cutting',
  'shrinking',
  'speeding',
  'processing',
  'eliminating',
  'achieving',
]);

function chooseIndefiniteArticle(nextWord: string): 'a' | 'an' {
  const clean = nextWord.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  if (!clean) return 'a';
  if (/^(?:honest|hour|heir|sre|sql|sdk|api|llm)/i.test(clean)) return 'an';
  if (/^(?:uni|use|user|euro|one)/i.test(clean)) return 'a';
  return /^[aeiou]/i.test(clean) ? 'an' : 'a';
}

/**
 * Inserts an indefinite article ("a" / "an") after a leading transitive action verb
 * when a telegraphic resume bullet omits the article before a singular countable noun phrase
 * (e.g., `"rebuilt multi-region Kubernetes metric ingestion pipeline..."` ->
 * `"rebuilt a multi-region Kubernetes metric ingestion pipeline..."`).
 */
export function insertArticleForEmbeddedProof(clause: string): string {
  const match = clause.match(
    /^([a-zA-Z-]+(?:\s+(?:out|up|down|in|over)\b)?(?:\s+and\s+[a-zA-Z-]+)?)\s+(.+)$/,
  );
  if (!match) return clause;

  const verbPhrase = match[1];
  const rest = match[2];
  const restTokens = rest.split(/\s+/);
  const firstAfterVerb = (restTokens[0] ?? '')
    .replace(/[^a-zA-Z0-9-]/g, '')
    .toLowerCase();

  if (
    !firstAfterVerb ||
    EXISTING_DETERMINERS.has(firstAfterVerb) ||
    PREPOSITION_BOUNDARIES.has(firstAfterVerb) ||
    /^\d/.test(firstAfterVerb)
  ) {
    return clause;
  }

  // Inspect the first noun phrase up to a preposition/comma/participle boundary (max 8 words)
  const npWords: string[] = [];
  for (const tok of restTokens.slice(0, 8)) {
    const clean = tok.replace(/[.,;:—–-]/g, '').toLowerCase();
    if (PREPOSITION_BOUNDARIES.has(clean)) break;
    npWords.push(clean);
    if (/[.,;:]/.test(tok)) break;
  }

  const hasSingularCountableNoun = npWords.some((w) =>
    SINGULAR_COUNTABLE_HEAD_NOUNS.has(w),
  );
  if (!hasSingularCountableNoun) {
    return clause;
  }

  const article = chooseIndefiniteArticle(restTokens[0] ?? '');
  return `${verbPhrase} ${article} ${rest}`;
}

/**
 * Normalizes a resume bullet or proof clause before embedding it mid-sentence
 * (e.g., after `"In my role at X, I "` or `"Previously at Y, I "`).
 * Lowercases a leading past-tense verb (`"Re-architected..."` -> `"re-architected..."`),
 * preserves proper nouns and acronyms (`"AWS..."`, `"Kubernetes..."`), and inserts
 * missing articles (`"rebuilt a multi-region..."`).
 */
export function normalizeEmbeddedProofText(raw: string): string {
  const trimmed = raw
    .trim()
    .replace(/^[,;:\-–—\s]+/, '')
    .replace(/^(i\s+)/i, '')
    .trim();
  if (!trimmed) return '';

  const firstTokenMatch = trimmed.match(/^([A-Za-z0-9+/.-]+)/);
  const firstToken = firstTokenMatch?.[1] ?? '';
  const baseWord = firstToken.split('-')[0] ?? firstToken;

  const isAllCapsAcronym =
    baseWord.length >= 2 &&
    baseWord === baseWord.toUpperCase() &&
    /[A-Z]/.test(baseWord);
  const isKnownProperNoun =
    PROPER_NOUN_OR_ACRONYM_PREFIXES.has(firstToken.toLowerCase()) ||
    PROPER_NOUN_OR_ACRONYM_PREFIXES.has(baseWord.toLowerCase());

  const cased =
    isAllCapsAcronym || isKnownProperNoun
      ? trimmed
      : trimmed.charAt(0).toLowerCase() + trimmed.slice(1);

  return insertArticleForEmbeddedProof(cased);
}

/**
 * Deduplicates employer names while preserving order so closing sentences never repeat
 * the same company (`"Vanguard Telemetry Systems and Vanguard Telemetry Systems"`).
 */
export function deduplicateEmployerNames(
  names: Array<string | undefined | null>,
): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const clean = (name ?? '').trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(clean);
    }
  }
  return result;
}

/**
 * Generates deterministic, grounded cover letter blocks from the selected proof points,
 * Bank items, target job, and voice level.
 */
export function buildGroundedCoverLetterBlocks(params: {
  company: string;
  roleTitle: string;
  recipient: string;
  length: CoverLetterLength;
  voice: VoiceLevel;
  selectedProofAchievementIds: string[];
  whyCompanyNotes: string;
  parsedJob: ParsedJob | null;
  jobDescription: string;
  bank: BankSnapshot;
  existingBlocks?: CoverLetterBlock[];
}): CoverLetterBlock[] {
  const {
    company,
    roleTitle,
    recipient,
    length,
    voice,
    selectedProofAchievementIds,
    whyCompanyNotes,
    parsedJob,
    jobDescription,
    bank,
    existingBlocks = [],
  } = params;

  const lockedByType = new Map<CoverLetterBlockType, CoverLetterBlock>();
  for (const b of existingBlocks) {
    if (b.locked) {
      lockedByType.set(b.type, b);
    }
  }

  const expById = new Map(bank.experiences.map((e) => [e.id, e]));
  const achById = new Map(bank.achievements.map((a) => [a.id, a]));

  // Deduplicate selected proof achievements and ensure distinct achievements for opening, body1, and body2
  const uniqueProofs: Achievement[] = [];
  const seenAchIds = new Set<string>();

  for (const id of selectedProofAchievementIds) {
    const found = achById.get(id);
    if (found && !seenAchIds.has(found.id)) {
      seenAchIds.add(found.id);
      uniqueProofs.push(found);
    }
  }

  for (const ach of bank.achievements) {
    if (uniqueProofs.length >= 4) break;
    if (!seenAchIds.has(ach.id)) {
      seenAchIds.add(ach.id);
      uniqueProofs.push(ach);
    }
  }

  const openingAch = uniqueProofs[0] ?? bank.achievements[0];
  const body1Ach = uniqueProofs[1] ?? uniqueProofs[0] ?? bank.achievements[0];
  const body2Ach =
    uniqueProofs[2] ??
    uniqueProofs.find(
      (a) => a.id !== openingAch?.id && a.id !== body1Ach?.id,
    ) ??
    uniqueProofs[1];
  const tertiaryAch = uniqueProofs[3];

  const openingExp = openingAch
    ? expById.get(openingAch.experienceId)
    : bank.experiences[0];
  const body1Exp = body1Ach
    ? expById.get(body1Ach.experienceId)
    : bank.experiences[0];
  const body2Exp = body2Ach
    ? expById.get(body2Ach.experienceId)
    : bank.experiences[1] ?? bank.experiences[0];

  const topReqs = (parsedJob?.requirements ?? [])
    .slice(0, 3)
    .map((r) => r.text);
  const reqSummary =
    topReqs.length >= 2
      ? `${topReqs[0]} and ${topReqs[1]}`
      : topReqs[0] || 'high-reliability production systems';

  const cleanRecipient = recipient.trim() || 'Hiring Team';
  const cleanCompany = company.trim() || parsedJob?.company || 'your team';
  const cleanRole =
    roleTitle.trim() || parsedJob?.title || bank.profile.headline;

  // 1. Greeting
  const greetingText = `Dear ${cleanRecipient},`;

  // 2. Opening (leads with strongest relevant proof point; reason only from mission/responsibilities or whyCompanyNotes, never JD keyword lists)
  const primaryFact = openingAch
    ? normalizeEmbeddedProofText(
        assembleBullet(openingAch, voice, 1).replace(/\.$/, ''),
      )
    : `built and scaled production services at ${openingExp?.company ?? 'scale'}`;

  const trimmedWhy = whyCompanyNotes.trim().replace(/\.$/, '');
  const groundedResponsibility = parsedJob?.responsibilities?.[0]
    ?.trim()
    .replace(/\.$/, '');

  const reasonSentence = trimmedWhy
    ? `Your focus on ${normalizeEmbeddedProofText(trimmedWhy)} directly matches the systems challenges I have solved in production for the ${cleanRole} mandate at ${cleanCompany}.`
    : groundedResponsibility
      ? `The ${cleanRole} mandate at ${cleanCompany} to ${normalizeEmbeddedProofText(groundedResponsibility)} directly matches the production challenges I have solved.`
      : `That production track record aligns directly with the ${cleanRole} role at ${cleanCompany}.`;

  const openingText =
    voice === 'plain' || voice === 'natural'
      ? `At ${openingExp?.company ?? 'my current team'}, I ${primaryFact}. ${reasonSentence}`
      : `As ${openingExp?.title ?? bank.profile.headline} at ${openingExp?.company ?? 'my current organization'}, I ${primaryFact}. ${reasonSentence}`;

  // 3. Body 1 (uses distinct proof #2, properly cased after "I ")
  const body1Fact = body1Ach
    ? normalizeEmbeddedProofText(assembleBullet(body1Ach, voice, 2))
    : 'led critical reliability and latency improvements across core services.';
  const body1Extra =
    length === 'short'
      ? `In my role as ${body1Exp?.title ?? 'lead engineer'} at ${body1Exp?.company ?? 'work'}, I ${body1Fact} That work required balancing strict reliability guarantees with day-to-day developer velocity across ${reqSummary}.`
      : `In my role as ${body1Exp?.title ?? 'lead engineer'} at ${body1Exp?.company ?? 'work'}, I ${body1Fact} We focused on observable failure modes, predictable rollouts, and clear operational ownership across ${reqSummary} so product teams could ship without latency regressions.`;

  // 4. Body 2 (uses distinct proof #3)
  const secFact = body2Ach
    ? normalizeEmbeddedProofText(assembleBullet(body2Ach, voice, 3))
    : '';
  const tertFact =
    length === 'detailed' && tertiaryAch
      ? ` Alongside that, at ${expById.get(tertiaryAch.experienceId)?.company ?? openingExp?.company ?? 'scale'}, I ${normalizeEmbeddedProofText(assembleBullet(tertiaryAch, voice, 4))}`
      : '';

  const skillNames = bank.skills
    .slice(0, 2)
    .map((s) => s.name)
    .join(' and ');
  const body2Text = body2Ach
    ? `Previously at ${body2Exp?.company ?? openingExp?.company ?? 'work'}, I ${secFact} Combining practical depth in ${skillNames || 'distributed systems'} with disciplined production operations has helped me deliver measurable outcomes under tight service-level targets.${tertFact}`
    : `Across my work with ${skillNames || 'distributed systems'}, I focus on turning ambiguous reliability and architecture bottlenecks into measurable production gains.`;

  // 5. Why this company (only uses JD mission/responsibilities or user's notes)
  const trimmedNotes = whyCompanyNotes.trim();
  const jdSummaryPhrase =
    parsedJob?.responsibilities?.[0] ??
    parsedJob?.summary ??
    `building resilient systems for ${cleanCompany}`;
  const whyCompanyText = trimmedNotes
    ? `What draws me specifically to ${cleanCompany} is ${normalizeEmbeddedProofText(trimmedNotes.replace(/\.$/, ''))}. Having solved closely related challenges, I can contribute immediately to the ${cleanRole} team.`
    : groundedResponsibility
      ? `What stands out about ${cleanCompany}'s ${cleanRole} role is the emphasis on ${normalizeEmbeddedProofText(jdSummaryPhrase.replace(/\.$/, ''))}. Having solved closely related production challenges, I can contribute immediately without a long ramp-up.`
      : `Having solved closely related reliability and architecture challenges in production, I can contribute immediately to ${cleanCompany}'s ${cleanRole} team without a long ramp-up.`;

  // 6. Closing (deduplicated employer names so we never get "X and X")
  const uniqueEmployers = deduplicateEmployerNames([
    openingExp?.company,
    body1Exp?.company,
    body2Exp?.company,
  ]);
  const employerListPhrase =
    uniqueEmployers.length >= 2
      ? `${uniqueEmployers[0]} and ${uniqueEmployers[1]}`
      : uniqueEmployers[0] ?? 'recent engineering teams';

  const closingText =
    length === 'short'
      ? `Thank you for reviewing my application and experience. I would welcome a conversation about how my background fits ${cleanCompany}'s roadmap for the ${cleanRole} role.`
      : `Thank you for your time and consideration. I would welcome the opportunity to discuss how my experience at ${employerListPhrase} can support ${cleanCompany}'s goals for the ${cleanRole} team.`;

  // 7. Sign-off
  const signoffText = `Sincerely,\n${bank.profile.name}`;

  const rawBlocks: Array<{
    type: CoverLetterBlockType;
    text: string;
    sourceIds: string[];
  }> = [
    {
      type: 'greeting',
      text: greetingText,
      sourceIds: [],
    },
    {
      type: 'opening',
      text: openingText,
      sourceIds: openingAch
        ? [openingAch.id, openingAch.experienceId]
        : openingExp
          ? [openingExp.id]
          : [],
    },
    {
      type: 'body1',
      text: body1Extra,
      sourceIds: body1Ach
        ? [body1Ach.id, body1Ach.experienceId]
        : body1Exp
          ? [body1Exp.id]
          : [],
    },
    {
      type: 'body2',
      text: body2Text,
      sourceIds: [
        ...(body2Ach ? [body2Ach.id, body2Ach.experienceId] : []),
        ...(length === 'detailed' && tertiaryAch
          ? [tertiaryAch.id, tertiaryAch.experienceId]
          : []),
      ],
    },
    {
      type: 'whyCompany',
      text: whyCompanyText,
      sourceIds: openingExp ? [openingExp.id] : [],
    },
    {
      type: 'closing',
      text: closingText,
      sourceIds: [],
    },
    {
      type: 'signoff',
      text: signoffText,
      sourceIds: [],
    },
  ];

  return rawBlocks.map((item, idx) => {
    const locked = lockedByType.get(item.type);
    if (locked) return locked;
    const grounding = validateCoverLetterGrounding(
      item.text,
      item.sourceIds,
      bank,
      jobDescription,
      whyCompanyNotes,
    );
    return {
      id: `cl-block-${item.type}-${idx + 1}`,
      type: item.type,
      text: item.text,
      sourceIds: item.sourceIds,
      locked: false,
      unverifiedClaims: grounding.unverifiedClaims,
    };
  });
}

export function createDefaultCoverLetterDraft(
  application: Pick<
    Application,
    | 'company'
    | 'roleTitle'
    | 'voice'
    | 'parsedJob'
    | 'jobDescription'
    | 'workingDraft'
  >,
  bank: BankSnapshot,
): CoverLetterDraft {
  const letterVoice = getOneStepMoreHumanVoice(application.voice);
  const ranked = application.parsedJob
    ? rankBankItemsForJob(bank, application.parsedJob).rankedAchievements
    : [];
  const topProofIds =
    ranked.length > 0
      ? ranked.slice(0, 3).map((r) => r.achievement.id)
      : application.workingDraft.selectedAchievementIds.slice(0, 3);

  const blocks = buildGroundedCoverLetterBlocks({
    company: application.company,
    roleTitle: application.roleTitle,
    recipient: 'Hiring Team',
    length: 'standard',
    voice: letterVoice,
    selectedProofAchievementIds: topProofIds,
    whyCompanyNotes: '',
    parsedJob: application.parsedJob,
    jobDescription: application.jobDescription,
    bank,
  });

  return {
    recipient: 'Hiring Team',
    length: 'standard',
    selectedProofAchievementIds: topProofIds,
    whyCompanyNotes: '',
    voice: letterVoice,
    blocks,
  };
}

/**
 * Evaluates a CoverLetterDraft against the 6 deterministic quality checks,
 * computes Job Match and Letter Appeal (estimate) for the letter, and returns prioritized 1-click fixes.
 */
export function evaluateCoverLetterChecks(params: {
  draft: CoverLetterDraft;
  parsedJob: ParsedJob | null;
  bank: BankSnapshot;
  company: string;
  roleTitle: string;
}): {
  report: LetterCheckReport;
  jobMatch: number;
  coveredKeywords: string[];
  gapKeywords: string[];
  fixes: CoverLetterPrioritizedFix[];
} {
  const { draft, parsedJob, bank, company, roleTitle } = params;
  const band = COVER_LETTER_LENGTH_BANDS[draft.length];

  const bodyBlocks = draft.blocks.filter(
    (b) => b.type !== 'greeting' && b.type !== 'signoff',
  );
  const openingBlock = draft.blocks.find((b) => b.type === 'opening');
  const fullText = draft.blocks.map((b) => b.text).join('\n\n');
  const bodyText = bodyBlocks.map((b) => b.text).join(' ');
  const words = bodyText
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 0);
  const wordCount = words.length;
  const paragraphCount = bodyBlocks.filter(
    (b) => b.text.trim().length > 0,
  ).length;

  // 1. Word count within selected length band
  const withinLengthBand =
    wordCount >= band.minWords && wordCount <= band.maxWords;

  // 2. Mentions target role and company by name
  const lowerFull = fullText.toLowerCase();
  const targetCompany = (company || parsedJob?.company || '').trim();
  const targetRole = (roleTitle || parsedJob?.title || '').trim();
  const companyMentioned = targetCompany
    ? lowerFull.includes(targetCompany.toLowerCase())
    : true;
  const roleTokens = targetRole
    .toLowerCase()
    .split(/[\s,—–-]+/)
    .filter((t) => t.length > 3);
  const roleMentioned =
    roleTokens.length === 0
      ? true
      : roleTokens.some((tok) => lowerFull.includes(tok));
  const mentionsRoleAndCompany = companyMentioned && roleMentioned;

  // 3. Covers at least 3 of the job's top requirements
  const customAliases = buildCustomAliasMap(bank.skills);
  const coveredKeywords: string[] = [];
  const gapKeywords: string[] = [];

  if (parsedJob) {
    for (const req of parsedJob.requirements) {
      const status = evaluateKeywordPresence(req.text, fullText, customAliases);
      if (status === 'covered' || status === 'partial') {
        coveredKeywords.push(req.text);
      } else {
        gapKeywords.push(req.text);
      }
    }
  }
  const requiredCoveredTarget = Math.min(
    3,
    parsedJob?.requirements.length ?? 3,
  );
  const coversTopRequirements =
    coveredKeywords.length >= requiredCoveredTarget ||
    (parsedJob?.requirements.length ?? 0) === 0;

  // 4. Includes at least 2 specific proof points (numbers or named outcomes from Bank)
  const citedSourceCount = new Set(
    bodyBlocks.flatMap((b) => b.sourceIds),
  ).size;
  const metricMatches =
    bodyText.match(/\$?\d+(?:[.,]\d+)*(?:%|x|ms|s|k|m|b|\+)?/gi) ?? [];
  const hasTwoProofPoints =
    citedSourceCount >= 2 || metricMatches.length >= 2;

  // 5. Zero cliché openers
  const bannedOpener = openingBlock
    ? hasBannedLetterOpener(openingBlock.text)
    : null;
  const foundClicheOpeners = [
    ...(bannedOpener ? [bannedOpener] : []),
    ...COVER_LETTER_CLICHE_OPENERS.filter((phrase) => lowerFull.includes(phrase)),
  ];
  const zeroClicheOpeners = foundClicheOpeners.length === 0;

  // 6. Zero unverified claims
  const unverifiedList = draft.blocks.flatMap((b) => b.unverifiedClaims);
  const zeroUnverified = unverifiedList.length === 0;

  // Sentence starter ratio ("I ...")
  const sentences = bodyText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const iStarterCount = sentences.filter((s) => /^i\b/i.test(s)).length;
  const iStarterRatio =
    sentences.length > 0
      ? Math.round((iStarterCount / sentences.length) * 100)
      : 0;

  // Machine-made feel
  const lintReport = lintMachineMadeScore(bodyBlocks.map((b) => b.text));
  const machineMadeFeel = getMachineMadeFeelLevel(
    lintReport.score + (foundClicheOpeners.length > 0 ? 25 : 0),
  );

  const checks: LetterCheckItem[] = [
    {
      id: 'word-count',
      label: `Word count within ${band.label} target (${band.targetWords})`,
      passed: withinLengthBand,
      detail: `${formatCount(wordCount, 'word')} across ${formatCount(paragraphCount, 'paragraph')}.`,
    },
    {
      id: 'role-company',
      label: 'Names target role and company',
      passed: mentionsRoleAndCompany,
      detail: mentionsRoleAndCompany
        ? `Mentions ${targetCompany || 'company'} and ${targetRole || 'role'}.`
        : 'Add explicit mention of both the company and role title.',
    },
    {
      id: 'top-requirements',
      label: 'Covers at least 3 core job requirements',
      passed: coversTopRequirements,
      detail: `${formatCount(coveredKeywords.length, 'job requirement')} referenced in letter.`,
    },
    {
      id: 'proof-points',
      label: 'Includes at least 2 concrete proof points from Bank',
      passed: hasTwoProofPoints,
      detail: hasTwoProofPoints
        ? `${formatCount(Math.max(2, metricMatches.length), 'grounded outcome')} included.`
        : 'Select at least 2 achievements with concrete outcomes.',
    },
    {
      id: 'no-cliche-openers',
      label: 'No stock cover-letter clichés',
      passed: zeroClicheOpeners,
      detail: zeroClicheOpeners
        ? 'Opening leads directly with proof and avoids generic phrases.'
        : `Found stock opener: "${foundClicheOpeners[0]}".`,
    },
    {
      id: 'no-unverified-claims',
      label: 'All facts and metrics trace to your Bank',
      passed: zeroUnverified,
      detail: zeroUnverified
        ? 'Every number and tool is grounded in your Experience Bank.'
        : unverifiedList[0] ?? 'Contains unverified claim.',
    },
  ];

  const passedCount = checks.filter((c) => c.passed).length;

  // Letter appeal (estimate) calibrated with passedChecksCount
  const letterAppeal = computeLetterAppealScore({
    draft,
    parsedJob,
    passedChecksCount: passedCount,
    totalChecksCount: checks.length,
    company,
    roleTitle,
  });
  const totalReqs = Math.max(1, parsedJob?.requirements.length ?? 6);
  const rawMatch = Math.round(
    Math.min(
      100,
      ((coveredKeywords.length + Math.min(2, citedSourceCount)) /
        Math.min(6, totalReqs)) *
        100,
    ),
  );
  const jobMatch = Math.max(60, Math.min(98, rawMatch));

  const fixes: CoverLetterPrioritizedFix[] = [];
  if (!zeroClicheOpeners) {
    fixes.push({
      id: 'fix-letter-cliche',
      title: 'Replace stock opening with a direct proof-led hook',
      description: `Removes "${foundClicheOpeners[0]}" and opens with your strongest relevant achievement.`,
      actionType: 'replace-cliche-opening',
    });
  }
  if (!withinLengthBand) {
    fixes.push({
      id: 'fix-letter-length',
      title: `Regenerate letter to fit ${band.label} length (${band.targetWords})`,
      description: `Current letter is ${formatCount(wordCount, 'word')}.`,
      actionType: 'adjust-length',
    });
  }
  if (!hasTwoProofPoints || !coversTopRequirements) {
    fixes.push({
      id: 'fix-letter-proofs',
      title: 'Weave in top-matching Bank achievements',
      description:
        'Grounds body paragraphs in your highest-relevance metrics and tools.',
      actionType: 'add-proof-point',
    });
  }
  if (machineMadeFeel !== 'Low' || iStarterRatio > 50) {
    fixes.push({
      id: 'fix-letter-voice',
      title: 'Shift voice one step toward Natural',
      description: 'Softens formal transitions and varies sentence starters so the letter reads like a human note.',
      actionType: 'soften-voice',
    });
  }

  return {
    report: {
      passedCount,
      totalCount: checks.length,
      wordCount,
      targetMinWords: band.minWords,
      targetMaxWords: band.maxWords,
      paragraphCount,
      iStarterRatio,
      machineMadeFeel,
      appeal: letterAppeal.score,
      letterAppeal: letterAppeal.score,
      checks,
    },
    jobMatch,
    coveredKeywords,
    gapKeywords,
    fixes: fixes.slice(0, 3),
  };
}

export function mapToCoverLetterDocument(params: {
  draft: CoverLetterDraft;
  bank: BankSnapshot;
  versionNumber: number;
  templateId: TemplateId;
  pageSize?: PageSize;
  targetCompany: string;
  targetRole: string;
  targetHeadline?: string;
  generatedAt?: string;
}): CoverLetterDocument {
  const {
    draft,
    bank,
    versionNumber,
    templateId,
    pageSize = 'letter',
    targetCompany,
    targetRole,
    targetHeadline,
    generatedAt = new Date().toISOString(),
  } = params;

  const headline = deriveDocumentHeadline({
    targetHeadline,
    roleTitle: targetRole,
    profileHeadline: bank.profile.headline,
  });

  const expById = new Map(bank.experiences.map((e) => [e.id, e]));
  const achById = new Map(bank.achievements.map((a) => [a.id, a]));

  const formattedDate = new Date(generatedAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });

  const blocks = draft.blocks.map((block) => {
    const sourceTitles: string[] = [];
    for (const sId of block.sourceIds) {
      const exp = expById.get(sId);
      if (exp) {
        const label = `${exp.company} — ${exp.title}`;
        if (!sourceTitles.includes(label)) sourceTitles.push(label);
      }
      const ach = achById.get(sId);
      if (ach) {
        const parent = expById.get(ach.experienceId);
        const label = parent
          ? `${parent.company} — ${parent.title}`
          : ach.action.slice(0, 36);
        if (!sourceTitles.includes(label)) sourceTitles.push(label);
      }
    }
    return {
      id: block.id,
      type: block.type,
      text: block.text,
      sourceIds: block.sourceIds,
      sourceTitles,
      unverifiedClaims: block.unverifiedClaims,
    };
  });

  const bodyWords = draft.blocks
    .filter((b) => b.type !== 'greeting' && b.type !== 'signoff')
    .map((b) => b.text)
    .join(' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const baseDoc: CoverLetterDocument = {
    kind: 'coverLetter',
    contentHash: '',
    meta: {
      versionNumber,
      templateId,
      templateVersion: TEMPLATE_SPEC_VERSION,
      pageSize,
      textAlign: draft.textAlign ?? 'left',
      voice: draft.voice,
      targetCompany,
      targetRole,
      recipient: draft.recipient || 'Hiring Team',
      length: draft.length,
      generatedAt,
    },
    header: {
      name: bank.profile.name,
      headline,
      email: bank.profile.email,
      phone: bank.profile.phone,
      location: bank.profile.location,
      links: bank.profile.links,
    },
    dateLine: formattedDate,
    recipientLine: `${draft.recipient || 'Hiring Team'}${targetCompany ? ` · ${targetCompany}` : ''}`,
    blocks,
    wordCount: bodyWords,
  };

  const contentHash = computeDocumentContentHash(baseDoc);
  baseDoc.contentHash = contentHash;
  baseDoc.meta.contentHash = contentHash;
  return baseDoc;
}

export function mapApplicationToCoverLetterDocument(
  application: Application,
  bank: BankSnapshot,
  versionNumber = 1,
  pageSize: PageSize = 'letter',
): CoverLetterDocument {
  const baseDraft =
    application.coverLetterDraft ??
    application.documents?.coverLetter ??
    createDefaultCoverLetterDraft(application, bank);
  const draft = {
    ...baseDraft,
    textAlign:
      application.coverLetterDraft?.textAlign ??
      application.documents?.coverLetter?.textAlign ??
      application.workingDraft?.textAlign ??
      'left',
  };
  return mapToCoverLetterDocument({
    draft,
    bank,
    versionNumber,
    templateId: application.templateId,
    pageSize,
    targetCompany: application.company,
    targetRole: application.roleTitle,
    targetHeadline: application.workingDraft.targetHeadline,
    generatedAt: application.updatedAt,
  });
}

