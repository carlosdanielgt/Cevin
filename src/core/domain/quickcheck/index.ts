import { BankSnapshot, ParsedJob } from '../entities';
import { buildGroupedCoverageSummary, GroupedCoverageSummary } from '../coverage';
import { formatCount } from '../format';
import {
  evaluateFit,
  extractJobFactsByRules,
  JobFacts,
  PracticalFitEvaluation,
  UserPreferences,
} from '../jobfacts';
import { JOB_MATCH_WEIGHTS } from '../ats/weights';
import { extractDomainKeywordsFromText } from '../keywords';

export interface QuickCheckVerdict {
  headline: string;
  verdictHeadline: string;
  tone: 'positive' | 'caution' | 'neutral';
  verdictTone: 'success' | 'warning' | 'danger';
  subline: string;
  verdictDetail: string;
  quickMatchScore: number;
  quickMatchEstimate: number;
  quickMatchBand: string;
  detectedCompany: string;
  detectedRoleTitle: string;
  detectedRole: string;
  coverage: GroupedCoverageSummary;
  facts: JobFacts;
  jobFacts: JobFacts;
  fit: PracticalFitEvaluation;
  practicalFit: PracticalFitEvaluation;
  fitEvaluation: PracticalFitEvaluation;
}

export function formatQuickEstimateBand(score: number): string {
  const clamped = Math.max(25, Math.min(95, Math.round(score)));
  const bandLow = Math.min(90, Math.floor(Math.min(93, clamped) / 5) * 5);
  const bandHigh = Math.min(95, bandLow + 5);
  return `${bandLow}–${bandHigh}`;
}


function parseQuickPostingHeader(rawPosting: string): {
  company: string;
  roleTitle: string;
} {
  const companyMatch = rawPosting.match(
    /(?:^|\n)\s*(?:company|employer|entreprise)\s*:\s*([^\n\r]+)/i,
  );
  const roleMatch = rawPosting.match(
    /(?:^|\n)\s*(?:role|title|position|poste)\s*:\s*([^\n\r]+)/i,
  );
  const firstLine =
    rawPosting
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean) ?? '';

  let company = companyMatch?.[1]?.trim() || '';
  let roleTitle = roleMatch?.[1]?.trim() || '';

  if (!company || !roleTitle) {
    const atSplit = firstLine.match(/^(.+?)\s+(?:at|@|—|-|chez)\s+(.+)$/i);
    if (atSplit) {
      if (!roleTitle) roleTitle = atSplit[1].trim();
      if (!company) company = atSplit[2].trim();
    }
  }

  return {
    company: company || 'Target Company',
    roleTitle: roleTitle || (firstLine.slice(0, 64) || 'Software Engineer'),
  };
}

function buildQuickParsedJobFallback(
  rawPosting: string,
  company: string,
  roleTitle: string,
): ParsedJob {
  const kws = extractDomainKeywordsFromText(rawPosting);
  return {
    title: roleTitle,
    company,
    seniority: 'Senior',
    summary: rawPosting.slice(0, 220),
    requirements: kws.map((k, idx) => ({
      id: `qc-req-${idx + 1}`,
      text: k.term,
      normalizedKey: k.normalized,
      priority: idx < 6 ? 'must-have' : 'nice-to-have',
      category: k.kind === 'tool' ? 'tool' : 'hard-skill',
    })),
    responsibilities: [],
    keywords: kws,
  };
}

/**
 * Deterministically computes a Quick check verdict, quick match estimate (capped at 95, 5-pt band),
 * CoverageSummary against the user's Bank, and Practical fit against Preferences.
 */
export function evaluateQuickCheckPosting(params: {
  rawPosting: string;
  parsedJob?: ParsedJob | null;
  bank: BankSnapshot;
  preferences: UserPreferences | null;
  existingFacts?: JobFacts;
  companyOverride?: string;
  roleTitleOverride?: string;
}): QuickCheckVerdict {
  const {
    rawPosting,
    bank,
    preferences,
    existingFacts,
    companyOverride,
    roleTitleOverride,
  } = params;
  const headerDetected = parseQuickPostingHeader(rawPosting);
  const detectedCompany =
    companyOverride?.trim() ||
    params.parsedJob?.company?.trim() ||
    headerDetected.company;
  const detectedRoleTitle =
    roleTitleOverride?.trim() ||
    params.parsedJob?.title?.trim() ||
    headerDetected.roleTitle;

  const effectiveParsedJob =
    params.parsedJob ??
    buildQuickParsedJobFallback(rawPosting, detectedCompany, detectedRoleTitle);

  const facts = existingFacts ?? extractJobFactsByRules(rawPosting);
  const fit = evaluateFit(facts, preferences);
  const coverage = buildGroupedCoverageSummary({
    parsedJob: effectiveParsedJob,
    bank,
  });

  // Compute deterministic quick match score against the whole Bank (capped at 95, never 100)
  let totalWeight = 0;
  let earnedWeight = 0;
  for (const item of coverage.allItems) {
    if (item.status === 'dismissed') continue;
    const weight =
      item.priority === 'must-have'
        ? JOB_MATCH_WEIGHTS.mustHaveRequirement
        : JOB_MATCH_WEIGHTS.niceToHaveRequirement;
    totalWeight += weight;
    if (item.status === 'covered') {
      earnedWeight += weight;
    } else if (item.status === 'partial') {
      earnedWeight += weight * 0.5;
    }
  }

  const rawRatioScore =
    totalWeight === 0
      ? 72
      : Math.round((earnedWeight / totalWeight) * 95);
  const quickMatchScore = Math.max(25, Math.min(95, rawRatioScore));
  const quickMatchBand = formatQuickEstimateBand(quickMatchScore);


  let headline = 'Looks like a good fit';
  let tone: 'positive' | 'caution' | 'neutral' = 'positive';
  let verdictTone: 'success' | 'warning' | 'danger' = 'success';
  let subline = `${formatCount(coverage.coveredCount, 'requirement')} covered in your Bank`;

  if (fit.conflictCount > 0) {
    headline = `${formatCount(fit.conflictCount, 'conflict')} with your preferences`;
    tone = 'caution';
    verdictTone = 'danger';
    const conflictLabels = fit.orderedItems
      .filter((i) => i.status === 'conflict')
      .map((i) => i.valueSummary);
    subline = conflictLabels.join(' · ');
  } else if (coverage.gapCount >= 3 || quickMatchScore < 65) {
    headline = `${formatCount(coverage.gapCount, 'requirement gap')} to review`;
    tone = 'caution';
    verdictTone = 'warning';
    subline = `Est. ${quickMatchBand} match across ${formatCount(coverage.totalActiveCount, 'requirement')}`;
  } else if (quickMatchScore >= 85 && coverage.gapCount <= 1) {
    headline = 'Looks like a strong fit';
    tone = 'positive';
    verdictTone = 'success';
    subline =
      coverage.gapCount === 0
        ? `All ${formatCount(coverage.coveredCount, 'requirement')} covered in your Bank`
        : `${formatCount(coverage.coveredCount, 'requirement')} covered · ${formatCount(coverage.gapCount, 'gap')}`;
  }

  return {
    headline,
    verdictHeadline: headline,
    tone,
    verdictTone,
    subline,
    verdictDetail: subline,
    quickMatchScore,
    quickMatchEstimate: quickMatchScore,
    quickMatchBand,
    detectedCompany,
    detectedRoleTitle,
    detectedRole: detectedRoleTitle,
    coverage,
    facts,
    jobFacts: facts,
    fit,
    practicalFit: fit,
    fitEvaluation: fit,
  };
}
