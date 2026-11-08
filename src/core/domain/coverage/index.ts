import {
  BankSnapshot,
  ParsedJob,
  RequirementChip,
  RequirementPriority,
} from '../entities';
import {
  evaluateKeywordPresence,
  expandKeywordAliases,
  normalizeKeyword,
} from '../keywords';
import { buildCustomAliasMap } from '../matching';

export type CoverageFilter = 'all' | 'gap' | 'partial' | 'covered';

export interface BankEvidenceItem {
  id: string;
  kind: 'skill' | 'achievement' | 'project' | 'certification';
  title: string;
  snippet?: string;
  detail?: string;
}

export interface CoverageItem {
  id: string;
  term: string;
  priority: RequirementPriority;
  status: 'covered' | 'partial' | 'gap' | 'dismissed';
  requirement: RequirementChip;
  relatedBankTerm?: string;
  evidence?: BankEvidenceItem[];
}

export interface GroupedCoverageSummary {
  allItems: CoverageItem[];
  needsAttention: {
    mustHave: CoverageItem[];
    niceToHave: CoverageItem[];
  };
  covered: {
    mustHave: CoverageItem[];
    niceToHave: CoverageItem[];
  };
  dismissedTerms: string[];
  coveredCount: number;
  gapCount: number;
  partialCount: number;
  dismissedCount: number;
  totalActiveCount: number;
  counts: {
    covered: number;
    gap: number;
    partial: number;
    dismissed: number;
  };
}

/**
 * Searches Bank skills, achievements, projects, and certifications
 * to find concrete evidence backing a given requirement or keyword term.
 */
export function findBankEvidenceForTerm(
  term: string,
  bank: BankSnapshot,
): BankEvidenceItem[] {
  const customAliases = buildCustomAliasMap(bank.skills);
  const variants = expandKeywordAliases(term, customAliases).map((v) =>
    v.toLowerCase().trim(),
  );
  const results: BankEvidenceItem[] = [];
  const matchedSkillIds = new Set<string>();

  // 1. Bank Skills
  for (const skill of bank.skills) {
    const sNameNorm = skill.name.toLowerCase().trim();
    const sAliasesNorm = skill.aliases.map((a) => a.toLowerCase().trim());
    const isDirectMatch =
      variants.includes(sNameNorm) ||
      sAliasesNorm.some((a) => variants.includes(a));
    const skillCorpus = `${skill.name} ${skill.aliases.join(' ')}`;
    const presence = evaluateKeywordPresence(term, skillCorpus, customAliases);

    if (isDirectMatch || presence !== 'gap') {
      matchedSkillIds.add(skill.id);
      results.push({
        id: skill.id,
        kind: 'skill',
        title: skill.name,
        snippet: skill.aliases.length > 0 ? skill.aliases.join(', ') : skill.category,
        detail: skill.category,
      });
    }
  }

  // 2. Bank Achievements
  for (const ach of bank.achievements) {
    const sharesSkill = ach.skillIds.some((id) => matchedSkillIds.has(id));
    const achText = `${ach.action} ${ach.result} ${ach.metric ?? ''}`;
    const presence = evaluateKeywordPresence(term, achText, customAliases);

    if (sharesSkill || presence !== 'gap') {
      results.push({
        id: ach.id,
        kind: 'achievement',
        title: ach.action,
        snippet: ach.metric || ach.result,
        detail: ach.metric || ach.result,
      });
    }
  }

  // 3. Bank Projects
  for (const proj of bank.projects) {
    const projText = `${proj.name} ${proj.description} ${proj.highlights.join(' ')}`;
    const presence = evaluateKeywordPresence(term, projText, customAliases);
    if (presence !== 'gap') {
      results.push({
        id: proj.id,
        kind: 'project',
        title: proj.name,
        snippet: proj.description,
        detail: proj.role,
      });
    }
  }

  // 4. Bank Certifications
  for (const cert of bank.certifications) {
    const certText = `${cert.name} ${cert.issuer}`;
    const presence = evaluateKeywordPresence(term, certText, customAliases);
    if (presence !== 'gap') {
      results.push({
        id: cert.id,
        kind: 'certification',
        title: cert.name,
        snippet: cert.issuer,
        detail: cert.issuer,
      });
    }
  }

  return results;
}

export interface BuildCoverageSummaryParams {
  parsedJob?: ParsedJob | null;
  bank: BankSnapshot;
  resumeText?: string;
  dismissedRequirementIds?: string[];
  dismissedTerms?: string[];
}

/**
 * Builds a deterministic, grouped coverage breakdown for a job's requirements,
 * categorizing them into Needs Attention (gaps and partials) vs. Covered items,
 * and mapping evidence from the Bank.
 */
export function buildGroupedCoverageSummary(
  params: BuildCoverageSummaryParams,
): GroupedCoverageSummary {
  const {
    parsedJob,
    bank,
    resumeText,
    dismissedRequirementIds = [],
    dismissedTerms = [],
  } = params;

  if (!parsedJob) {
    return {
      allItems: [],
      needsAttention: { mustHave: [], niceToHave: [] },
      covered: { mustHave: [], niceToHave: [] },
      dismissedTerms: [],
      coveredCount: 0,
      gapCount: 0,
      partialCount: 0,
      dismissedCount: 0,
      totalActiveCount: 0,
      counts: { covered: 0, gap: 0, partial: 0, dismissed: 0 },
    };
  }

  const customAliases = buildCustomAliasMap(bank.skills);

  const dismissedSet = new Set<string>([
    ...dismissedRequirementIds.map((id) => id.toLowerCase().trim()),
    ...dismissedRequirementIds.map((id) => normalizeKeyword(id)),
    ...dismissedTerms.map((t) => t.toLowerCase().trim()),
    ...dismissedTerms.map((t) => normalizeKeyword(t)),
  ]);

  const bankCorpus = [
    ...bank.skills.map((s) => `${s.name} ${s.aliases.join(' ')}`),
    ...bank.achievements.map((a) => `${a.action} ${a.result} ${a.metric ?? ''}`),
    ...bank.projects.map((p) => `${p.name} ${p.description}`),
  ].join(' \n ');

  const evalCorpus = resumeText?.trim() ? resumeText : bankCorpus;

  const allItems: CoverageItem[] = [];
  const dismissedTermsList: string[] = [];

  for (const req of parsedJob.requirements) {
    const reqNorm = req.normalizedKey || normalizeKeyword(req.text);
    const isDismissed =
      dismissedSet.has(req.id.toLowerCase().trim()) ||
      dismissedSet.has(req.text.toLowerCase().trim()) ||
      dismissedSet.has(reqNorm);

    if (isDismissed) {
      dismissedTermsList.push(req.text);
      allItems.push({
        id: req.id,
        term: req.text,
        priority: req.priority,
        status: 'dismissed',
        requirement: req,
      });
      continue;
    }

    const presence = evaluateKeywordPresence(
      req.text,
      evalCorpus,
      customAliases,
    );

    const evidence = findBankEvidenceForTerm(req.text, bank);
    const relatedSkill = bank.skills.find((s) => {
      const sNorm = normalizeKeyword(s.name);
      return (
        sNorm === reqNorm ||
        s.aliases.some((a) => normalizeKeyword(a) === reqNorm)
      );
    });

    let status: 'covered' | 'partial' | 'gap';
    if (presence === 'covered') {
      status = 'covered';
    } else if (presence === 'partial') {
      status = 'partial';
    } else if (evidence.length > 0) {
      status = 'partial';
    } else {
      status = 'gap';
    }

    allItems.push({
      id: req.id,
      term: req.text,
      priority: req.priority,
      status,
      requirement: req,
      relatedBankTerm: relatedSkill?.name,
      evidence: evidence.length > 0 ? evidence : undefined,
    });
  }

  const needsAttentionMustHave = allItems.filter(
    (i) =>
      i.priority === 'must-have' &&
      (i.status === 'gap' || i.status === 'partial'),
  );
  const needsAttentionNiceToHave = allItems.filter(
    (i) =>
      i.priority === 'nice-to-have' &&
      (i.status === 'gap' || i.status === 'partial'),
  );

  const coveredMustHave = allItems.filter(
    (i) => i.priority === 'must-have' && i.status === 'covered',
  );
  const coveredNiceToHave = allItems.filter(
    (i) => i.priority === 'nice-to-have' && i.status === 'covered',
  );

  const coveredCount = allItems.filter((i) => i.status === 'covered').length;
  const gapCount = allItems.filter((i) => i.status === 'gap').length;
  const partialCount = allItems.filter((i) => i.status === 'partial').length;
  const dismissedCount = allItems.filter((i) => i.status === 'dismissed').length;
  const totalActiveCount = coveredCount + partialCount + gapCount;

  return {
    allItems,
    needsAttention: {
      mustHave: needsAttentionMustHave,
      niceToHave: needsAttentionNiceToHave,
    },
    covered: {
      mustHave: coveredMustHave,
      niceToHave: coveredNiceToHave,
    },
    dismissedTerms: dismissedTermsList,
    coveredCount,
    gapCount,
    partialCount,
    dismissedCount,
    totalActiveCount,
    counts: {
      covered: coveredCount,
      gap: gapCount,
      partial: partialCount,
      dismissed: dismissedCount,
    },
  };
}
