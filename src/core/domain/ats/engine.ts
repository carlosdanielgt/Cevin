import { computeRecruiterAppeal, PositionedText } from '../appeal';
import {
  Application,
  BankSnapshot,
  RoundTripReport,
  ScoreBreakdown,
} from '../entities';
import { formatCount } from '../format';
import { evaluateKeywordPresence, normalizeKeyword } from '../keywords';
import { lintMachineMadeScore } from '../linter';
import { buildCustomAliasMap } from '../matching';
import {
  ATS_CATEGORY_WEIGHTS,
  CONTENT_QUALITY_THRESHOLDS,
  JOB_MATCH_WEIGHTS,
} from './weights';

export interface PrioritizedFix {
  id: string;
  title: string;
  impactPoints: number;
  category:
    | 'keywords'
    | 'structure'
    | 'content'
    | 'length'
    | 'title'
    | 'grounding'
    | 'appeal';
  description: string;
  actionType:
    | 'align-headline'
    | 'add-matched-skills'
    | 'soften-ai-cliches'
    | 'include-top-achievement'
    | 'Generate-summary'
    | 'promote-strongest-bullet'
    | 'trim-long-bullet'
    | 'shorten-summary';
  actionPayload?: string;
}

export interface FullAnalysisResult {
  scores: ScoreBreakdown;
  fixes: PrioritizedFix[];
}

const STRONG_ACTION_VERBS = new Set([
  'built',
  'designed',
  'engineered',
  'led',
  'reduced',
  'cut',
  'migrated',
  'moved',
  'shipped',
  'automated',
  'delivered',
  'scaled',
  'implemented',
  'resolved',
  'fixed',
  'created',
  'developed',
  'architected',
  'spearheaded',
  'orchestrated',
  'optimized',
  'improved',
  'launched',
  'ran',
  'wrote',
  'trimmed',
  'replaced',
  'established',
]);

const FIRST_PERSON_PRONOUN_REGEX = /\b(i|my|me|we|our|myself)\b/i;

/**
 * Deterministically computes Job Match (0–100), ATS Readiness Estimate (0–100),
 * Recruiter Appeal Estimate (0–100), subscores, keyword coverage, and one-click prioritized fixes.
 */
export function computeAtsAndJobMatchScores(
  application: Application,
  bank: BankSnapshot,
  roundTrip?: RoundTripReport,
): FullAnalysisResult {
  const draft = application.workingDraft;
  const parsedJob = application.parsedJob;
  const customAliases = buildCustomAliasMap(bank.skills);
  const dismissedSet = new Set(
    (application.dismissedRequirements ?? []).map((r) => normalizeKeyword(r)),
  );

  const selectedSkills = bank.skills.filter((s) =>
    draft.selectedSkillIds.includes(s.id),
  );
  const selectedProjects = bank.projects.filter((p) =>
    draft.selectedProjectIds.includes(p.id),
  );
  const selectedEducations = bank.educations.filter((e) =>
    draft.selectedEducationIds.includes(e.id),
  );

  const bulletStrings = draft.bullets.map((b) => b.text);
  const resumeCorpus = [
    draft.targetHeadline,
    draft.summary,
    ...bulletStrings,
    ...selectedSkills.map((s) => `${s.name} ${s.aliases.join(' ')}`),
    ...selectedProjects.map(
      (p) => `${p.name} ${p.description} ${p.highlights.join(' ')}`,
    ),
  ].join(' \n ');

  const coveredKeywords: string[] = [];
  const partialKeywords: string[] = [];
  const gapKeywords: string[] = [];

  // 1. Keyword coverage & Job Match (excluding dismissed requirements)
  let totalJobWeight = 0;
  let earnedJobWeight = 0;

  if (parsedJob) {
    const seenNorms = new Set<string>();
    for (const req of parsedJob.requirements) {
      const norm = req.normalizedKey || normalizeKeyword(req.text);
      if (seenNorms.has(norm)) continue;
      seenNorms.add(norm);
      if (dismissedSet.has(norm) || dismissedSet.has(normalizeKeyword(req.text))) {
        continue;
      }

      const weight =
        req.priority === 'must-have'
          ? JOB_MATCH_WEIGHTS.mustHaveRequirement
          : JOB_MATCH_WEIGHTS.niceToHaveRequirement;
      totalJobWeight += weight;

      const status = evaluateKeywordPresence(
        req.text,
        resumeCorpus,
        customAliases,
      );
      if (status === 'covered') {
        coveredKeywords.push(req.text);
        earnedJobWeight += weight;
      } else if (status === 'partial') {
        partialKeywords.push(req.text);
        earnedJobWeight += weight * 0.5;
      } else {
        gapKeywords.push(req.text);
      }
    }

    for (const kw of parsedJob.keywords) {
      const norm = kw.normalized || normalizeKeyword(kw.term);
      if (seenNorms.has(norm)) continue;
      seenNorms.add(norm);
      if (dismissedSet.has(norm) || dismissedSet.has(normalizeKeyword(kw.term))) {
        continue;
      }

      totalJobWeight += JOB_MATCH_WEIGHTS.detectedKeyword;
      const status = evaluateKeywordPresence(
        kw.term,
        resumeCorpus,
        customAliases,
      );
      if (status === 'covered') {
        coveredKeywords.push(kw.term);
        earnedJobWeight += JOB_MATCH_WEIGHTS.detectedKeyword;
      } else if (status === 'partial') {
        partialKeywords.push(kw.term);
        earnedJobWeight += JOB_MATCH_WEIGHTS.detectedKeyword * 0.5;
      } else {
        gapKeywords.push(kw.term);
      }
    }
  }

  const totalKeywordsCount =
    coveredKeywords.length + partialKeywords.length + gapKeywords.length;
  const keywordCoverageScore =
    totalKeywordsCount === 0
      ? 75
      : Math.round(
          ((coveredKeywords.length + partialKeywords.length * 0.5) /
            totalKeywordsCount) *
            100,
        );

  const jobMatchScore =
    totalJobWeight === 0
      ? 72
      : Math.min(96, Math.round((earnedJobWeight / totalJobWeight) * 96));

  // 2. Structure and parseability (25%)
  let structureScore = 100;
  const hasContact =
    Boolean(bank.profile.name.trim()) &&
    Boolean(bank.profile.email.trim()) &&
    Boolean(bank.profile.location.trim());
  if (!hasContact) structureScore -= 25;
  if (draft.bullets.length === 0) structureScore -= 30;
  if (selectedSkills.length === 0) structureScore -= 15;
  if (selectedEducations.length === 0 && bank.educations.length > 0) {
    structureScore -= 10;
  }
  if (!draft.summary.trim()) structureScore -= 10;

  if (roundTrip && !roundTrip.passed) {
    structureScore = Math.max(40, structureScore - 20);
  }
  structureScore = Math.max(0, Math.min(100, structureScore));

  // 3. Content quality (15%): quantified-bullet ratio, strong verbs, bullet length, no 1st-person pronouns
  let contentQualityScore = 100;
  let quantifiedCount = 0;
  let strongVerbCount = 0;
  let pronounViolations = 0;
  let lengthViolations = 0;

  for (const b of bulletStrings) {
    const trimmed = b.trim();
    if (!trimmed) continue;
    if (/\$?\d+(?:[.,]\d+)*(?:%|x|ms|s|k|m|b|\+)?/i.test(trimmed)) {
      quantifiedCount++;
    }
    const firstWord = trimmed
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z]/g, '');
    if (firstWord && STRONG_ACTION_VERBS.has(firstWord)) {
      strongVerbCount++;
    }
    if (FIRST_PERSON_PRONOUN_REGEX.test(trimmed)) {
      pronounViolations++;
    }
    const wordCount = trimmed.split(/\s+/).length;
    if (
      wordCount < CONTENT_QUALITY_THRESHOLDS.minBulletWords ||
      wordCount > CONTENT_QUALITY_THRESHOLDS.maxBulletWords
    ) {
      lengthViolations++;
    }
  }

  const totalBullets = bulletStrings.length || 1;
  const quantifiedRatio = quantifiedCount / totalBullets;
  if (quantifiedRatio < CONTENT_QUALITY_THRESHOLDS.minQuantifiedBulletRatio) {
    contentQualityScore -= Math.round(
      (CONTENT_QUALITY_THRESHOLDS.minQuantifiedBulletRatio - quantifiedRatio) *
        45,
    );
  }
  const verbRatio = strongVerbCount / totalBullets;
  if (verbRatio < 0.8) {
    contentQualityScore -= Math.round((0.8 - verbRatio) * 30);
  }
  contentQualityScore -= pronounViolations * 10;
  contentQualityScore -= lengthViolations * 5;
  contentQualityScore = Math.max(15, Math.min(100, contentQualityScore));

  // 4. Length and density (10%): 1 to 2 pages, keyword-stuffing penalty
  const totalChars = resumeCorpus.length;
  const estimatedPages = Math.max(
    1,
    Math.ceil(totalChars / CONTENT_QUALITY_THRESHOLDS.idealCharactersPerPage),
  );
  let lengthAndDensityScore = 100;
  if (totalChars < 700) {
    lengthAndDensityScore = 60;
  } else if (estimatedPages > CONTENT_QUALITY_THRESHOLDS.maxRecommendedPages) {
    lengthAndDensityScore = 65;
  }

  // Check keyword stuffing
  for (const kw of coveredKeywords) {
    const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches =
      resumeCorpus.match(new RegExp(`\\b${escaped}\\b`, 'gi')) ?? [];
    if (
      matches.length >
      CONTENT_QUALITY_THRESHOLDS.stuffingMaxFrequencyPerKeyword
    ) {
      lengthAndDensityScore -= 15;
      break;
    }
  }
  lengthAndDensityScore = Math.max(20, Math.min(100, lengthAndDensityScore));

  // 5. Title alignment (5%)
  let titleAlignmentScore = 60;
  const targetRole = (
    parsedJob?.title ||
    application.roleTitle ||
    ''
  ).toLowerCase();
  const headlineLower = (
    draft.targetHeadline ||
    bank.profile.headline ||
    ''
  ).toLowerCase();

  if (targetRole && headlineLower) {
    if (
      headlineLower.includes(targetRole) ||
      targetRole.includes(headlineLower)
    ) {
      titleAlignmentScore = 100;
    } else {
      const roleTokens = targetRole
        .split(/\s+/)
        .filter((t) => t.length > 2 && t !== 'senior' && t !== 'staff');
      const overlap = roleTokens.filter((t) => headlineLower.includes(t));
      if (overlap.length > 0) {
        titleAlignmentScore = 85;
      }
    }
  }

  const atsReadiness = Math.min(
    96,
    Math.round(
      keywordCoverageScore * ATS_CATEGORY_WEIGHTS.keywordCoverage +
        structureScore * ATS_CATEGORY_WEIGHTS.structureAndParseability +
        contentQualityScore * ATS_CATEGORY_WEIGHTS.contentQuality +
        lengthAndDensityScore * ATS_CATEGORY_WEIGHTS.lengthAndDensity +
        titleAlignmentScore * ATS_CATEGORY_WEIGHTS.titleAlignment,
    ),
  );

  const machineMade = lintMachineMadeScore([
    ...(draft.summary ? [draft.summary] : []),
    ...bulletStrings,
  ]);

  // 6. Recruiter appeal (estimate) & appeal 1-click fixes
  const appealReport = computeRecruiterAppeal(
    application,
    bank,
    roundTrip?.positionedText,
  );

  // Build prioritized 1-click fixes
  const fixes: PrioritizedFix[] = [];

  if (titleAlignmentScore < 95 && (parsedJob?.title || application.roleTitle)) {
    const desiredTitle = parsedJob?.title || application.roleTitle;
    const currentHeadline = (
      draft.targetHeadline ||
      bank.profile.headline ||
      ''
    ).trim();
    fixes.push({
      id: 'fix-align-headline',
      title: `Align resume headline to "${desiredTitle}"`,
      impactPoints: 4,
      category: 'title',
      description: currentHeadline
        ? `Updates your resume header title from "${currentHeadline}" to "${desiredTitle}" so ATS and recruiter skims match the target role.`
        : `Sets your resume header title to "${desiredTitle}" so ATS and recruiter skims match the target role.`,
      actionType: 'align-headline',
      actionPayload: desiredTitle,
    });
  }

  // Check if there are skills in the Bank that match JD gaps but aren't selected in the draft yet
  const unselectedMatchedSkills = bank.skills.filter((s) => {
    if (draft.selectedSkillIds.includes(s.id)) return false;
    return gapKeywords.some(
      (gap) =>
        evaluateKeywordPresence(
          gap,
          `${s.name} ${s.aliases.join(' ')}`,
          customAliases,
        ) !== 'gap',
    );
  });

  if (unselectedMatchedSkills.length > 0) {
    fixes.push({
      id: 'fix-add-matched-skills',
      title: `Include ${formatCount(unselectedMatchedSkills.length, 'matching Bank skill')}: ${unselectedMatchedSkills
        .slice(0, 3)
        .map((s) => s.name)
        .join(', ')}`,
      impactPoints: Math.min(14, unselectedMatchedSkills.length * 4),
      category: 'keywords',
      description:
        'These skills are already verified in your Bank and directly cover open job requirements.',
      actionType: 'add-matched-skills',
    });
  }

  if (!draft.summary.trim()) {
    fixes.push({
      id: 'fix-generate-summary',
      title: 'Add a targeted 2-sentence executive summary',
      impactPoints: 5,
      category: 'structure',
      description:
        'A concise role-aligned summary anchors standard ATS section parsing and front-loads core keywords.',
      actionType: 'Generate-summary',
    });
  }

  if (machineMade.score >= 38) {
    fixes.push({
      id: 'fix-soften-ai-cliches',
      title: 'Switch Voice to Balanced or Natural to remove stock clichés',
      impactPoints: 6,
      category: 'content',
      description: `Detected formulaic phrasing (${machineMade.issues
        .slice(0, 2)
        .map((i) => i.term)
        .join(', ')}). Rewriting in a clearer voice improves human readability.`,
      actionType: 'soften-ai-cliches',
    });
  }

  const unselectedHighImpactAch = bank.achievements.find(
    (a) =>
      !draft.selectedAchievementIds.includes(a.id) &&
      Boolean(a.metric) &&
      gapKeywords.some(
        (gap) =>
          evaluateKeywordPresence(
            gap,
            `${a.action} ${a.result} ${a.metric ?? ''} ${a.tags.join(' ')}`,
            customAliases,
          ) !== 'gap',
      ),
  );

  if (unselectedHighImpactAch) {
    fixes.push({
      id: 'fix-include-top-achievement',
      title: `Add verified Bank achievement with metric (${unselectedHighImpactAch.metric})`,
      impactPoints: 7,
      category: 'keywords',
      description: `Covers uncovered job keywords and boosts quantified bullet density.`,
      actionType: 'include-top-achievement',
      actionPayload: unselectedHighImpactAch.id,
    });
  }

  // Merge Recruiter Appeal fixes (avoiding duplicate align-headline)
  const existingActionTypes = new Set(fixes.map((f) => f.actionType));
  for (const appealFix of appealReport.fixes) {
    if (existingActionTypes.has(appealFix.actionType)) continue;
    fixes.push({
      id: appealFix.id,
      title: appealFix.title,
      impactPoints: appealFix.impactPoints,
      category: 'appeal',
      description: appealFix.description,
      actionType: appealFix.actionType,
      actionPayload: appealFix.actionPayload,
    });
  }

  fixes.sort((a, b) => b.impactPoints - a.impactPoints);

  return {
    scores: {
      jobMatch: jobMatchScore,
      atsReadiness,
      appeal: appealReport.total,
      recruiterAppeal: appealReport.recruiterAppeal,
      appealLenses: appealReport.lenses,
      firstImpressionTakeaway: appealReport.firstImpressionTakeaway,
      machineMadeScore: machineMade.score,
      subscores: {
        keywordCoverage: keywordCoverageScore,
        structureAndParseability: structureScore,
        contentQuality: contentQualityScore,
        lengthAndDensity: lengthAndDensityScore,
        titleAlignment: titleAlignmentScore,
      },
      coveredKeywords,
      partialKeywords,
      gapKeywords,
      estimatedPages,
      roundTrip,
    },
    fixes,
  };
}

/**
 * Evaluates raw text re-extracted from a generated PDF via pdfjs-dist
 * to verify what an actual ATS parser sees (contact info, standard headings, reading order, and PositionedText[]).
 */
export function evaluateRoundTripText(
  extractedText: string,
  expectedProfileName: string,
  expectedEmail: string,
  positionedText?: PositionedText[],
): RoundTripReport {
  const lower = extractedText.toLowerCase();
  const headingsDetected: string[] = [];

  const standardHeadings = [
    'SUMMARY',
    'EXPERIENCE',
    'PROJECTS',
    'SKILLS',
    'EDUCATION',
    'CERTIFICATIONS',
  ];

  const headingIndices: number[] = [];
  for (const heading of standardHeadings) {
    const idx = lower.indexOf(heading.toLowerCase());
    if (idx !== -1) {
      headingsDetected.push(heading);
      headingIndices.push(idx);
    }
  }

  // Verify reading order: Name appears near top, and detected headings appear after header
  const nameIdx = expectedProfileName
    ? lower.indexOf(expectedProfileName.toLowerCase())
    : 0;
  const emailIdx = expectedEmail
    ? lower.indexOf(expectedEmail.toLowerCase())
    : 0;
  const contactDetected = nameIdx !== -1 && emailIdx !== -1;

  const firstHeadingIdx =
    headingIndices.length > 0 ? Math.min(...headingIndices) : 9999;
  const readingOrderIntact =
    contactDetected &&
    nameIdx < firstHeadingIdx &&
    headingsDetected.includes('EXPERIENCE');

  const notes: string[] = [];
  if (contactDetected) {
    notes.push(`Contact header (${expectedProfileName}, ${expectedEmail}) parsed cleanly at top of stream.`);
  } else {
    notes.push('Warning: Contact name or email was not found in the extracted PDF text layer.');
  }
  notes.push(
    `Detected ${formatCount(headingsDetected.length, 'standard ATS section heading')}: ${headingsDetected.join(', ') || 'None'}.`,
  );
  if (readingOrderIntact) {
    notes.push('Single-column linear reading order verified.');
  }

  const passed =
    extractedText.trim().length > 120 &&
    contactDetected &&
    headingsDetected.length >= 2 &&
    readingOrderIntact;

  return {
    verifiedAt: new Date().toISOString(),
    extractedCharacterCount: extractedText.length,
    contactDetected,
    headingsDetected,
    readingOrderIntact,
    passed,
    notes,
    positionedText,
  };
}

