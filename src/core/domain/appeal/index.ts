import { z } from 'zod';
import {
  Application,
  BankSnapshot,
  CoverLetterDocument,
  CoverLetterDraft,
  ParsedJob,
  ResumeDocument,
} from '../entities';
import { normalizeKeyword } from '../keywords';
import { lintMachineMadeScore } from '../linter';

export const PositionedTextSchema = z.object({
  text: z.string(),
  page: z.number().int().positive(),
  x: z.number(),
  y: z.number(),
  width: z.number().optional(),
  height: z.number().optional(),
  fontSize: z.number().optional(),
  bold: z.boolean().optional(),
});
export type PositionedText = z.infer<typeof PositionedTextSchema>;

export const AppealLensScoresSchema = z.object({
  skim: z.number(),
  proof: z.number(),
  clarity: z.number(),
  voice: z.number(),
  layoutEstimated: z.boolean().optional(),
  weakestSubcheckByLens: z
    .object({
      skim: z.string(),
      proof: z.string(),
      clarity: z.string(),
      voice: z.string(),
    })
    .optional(),
  weakestHints: z
    .object({
      skim: z.string(),
      proof: z.string(),
      clarity: z.string(),
      voice: z.string(),
    })
    .optional(),
});
export type AppealLensScores = z.infer<typeof AppealLensScoresSchema>;

import { mapApplicationToResumeDocument } from '../documentMapper';

export interface TakeawaySummary {
  line: string;
  takeaway: string;
  roleTitle: string;
  company: string;
  tenure: string;
  topSkills: string[];
  headlineMetric: string;
  matchesTargetRole: boolean;
  targetRoleMatches: boolean;
  statusLabel: string;
}

export interface AppealSuggestedFix {
  id: string;
  title: string;
  impactPoints: number;
  description: string;
  actionType:
    | 'promote-strongest-bullet'
    | 'trim-long-bullet'
    | 'shorten-summary'
    | 'align-headline';
  actionPayload?: string;
}

export interface RecruiterAppealReport {
  score: number;
  total: number;
  recruiterAppeal: number;
  lenses: AppealLensScores;
  takeaway: TakeawaySummary;
  firstImpressionTakeaway: string;
  targetRoleMatches: boolean;
  weakestSubcheckHints: {
    skim: string;
    proof: string;
    clarity: string;
    voice: string;
  };
  weakestLens: 'skim' | 'proof' | 'clarity' | 'voice';
  layoutEstimated: boolean;
  fixes: AppealSuggestedFix[];
}

const OUTCOME_VERBS = new Set([
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
  'optimized',
  'improved',
  'launched',
  'ran',
  'wrote',
  'trimmed',
  'replaced',
  'established',
  'rebuilt',
  're-architected',
  'rolled',
  'dropped',
  'shrunk',
]);

const DUTY_OPENERS_REGEX =
  /^(?:was\s+responsible\s+for|responsible\s+for|worked\s+on|helped\s+(?:with|to)|assisted\s+(?:in|with)|tasked\s+with|duties\s+included|participated\s+in|involved\s+in)\b/i;

const VAGUE_BUZZWORDS_REGEX =
  /\b(?:results-driven|passionate|dynamic|synergy|go-getter|thought\s+leader|guru|rockstar|ninja|world-class|best-of-breed|cutting-edge|game-changing|detail-oriented|hard-working|team\s+player)\b/i;

const METRIC_NUMBER_REGEX =
  /(?:\$?\d+(?:[.,]\d+)*(?:\s*(?:%|x|ms|s|sec|seconds?|mins?|minutes?|hrs?|hours?|days?|weeks?|months?|k|m|b|tb|gb|mb|rps|qps|events\/sec|\+))|\b\d+\s*(?:to|→|->)\s*\d+)/i;

const SCALE_OR_TIME_REGEX =
  /\b(?:\d+(?:[.,]\d+)?\s*(?:k|m|b|tb|gb|events\/sec|rps|qps|requests|users|tenants|clusters|regions|services|microservices|nodes|repositories|repos|ms|s|sec|minutes?|hours?|days?|weeks?|months?))\b/i;

/**
 * Per-bullet impact-strength heuristic (Section 2.2):
 * - Has a metric (+3)
 * - Has scale or time (+1)
 * - Starts with an outcome verb (+1)
 * - Relevance to the JD from ranking / keywords (+2)
 */
export function computeBulletImpactStrength(
  bulletText: string,
  jdRelevantTerms: string[] = [],
): number {
  const trimmed = bulletText.trim();
  if (!trimmed) return 0;

  let score = 0;
  if (METRIC_NUMBER_REGEX.test(trimmed)) {
    score += 3;
  }
  if (SCALE_OR_TIME_REGEX.test(trimmed)) {
    score += 1;
  }

  const firstWord = trimmed
    .split(/\s+/)[0]
    ?.toLowerCase()
    .replace(/[^a-z-]/g, '');
  if (firstWord && OUTCOME_VERBS.has(firstWord)) {
    score += 1;
  }

  if (jdRelevantTerms.length > 0) {
    const lowerBullet = trimmed.toLowerCase();
    const hits = jdRelevantTerms.some((term) => {
      const clean = term.trim().toLowerCase();
      return clean.length >= 2 && lowerBullet.includes(clean);
    });
    if (hits) {
      score += 2;
    }
  }

  return score;
}

const DANGLING_END_WORDS = new Set([
  'and',
  'or',
  'with',
  'for',
  'to',
  'in',
  'by',
  'through',
  'across',
  'via',
  'of',
  'the',
  'a',
  'an',
  'from',
  'into',
  'on',
  'at',
  'as',
  'including',
  'using',
  'while',
  'during',
  'between',
]);

function stripDanglingTailWords(text: string): string {
  const words = text
    .replace(/[.!?;:,—–-]+$/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (
    words.length > 4 &&
    DANGLING_END_WORDS.has(
      words[words.length - 1].toLowerCase().replace(/[^a-z]/g, ''),
    )
  ) {
    words.pop();
  }
  return words.join(' ').replace(/[,;:\s]+$/, '');
}

/**
 * Smartly trims a resume bullet to <= maxWords (default 24) and <= maxChars (default 160, <= 2 lines)
 * while strictly preserving quantitative metrics/numbers and opening action verbs.
 */
export function smartTrimBulletText(
  rawText: string,
  maxWords = 24,
  maxChars = 160,
): string {
  let cleaned = rawText
    .replace(/\s+/g, ' ')
    .replace(/\bin order to\b/gi, 'to')
    .replace(/\bby (?:utilizing|leveraging)\b/gi, 'using')
    .replace(/\b(?:utilizing|leveraging)\b/gi, 'using')
    .replace(/\bwhile simultaneously\b/gi, 'while')
    .replace(/\bacross multiple\b/gi, 'across')
    .trim();

  const initialWords = cleaned.split(/\s+/).filter(Boolean);
  if (initialWords.length <= maxWords && cleaned.length <= maxChars) {
    return cleaned.endsWith('.') ? cleaned : `${cleaned.replace(/[.!?;:,]+$/, '')}.`;
  }

  const body = cleaned.replace(/[.!?]+$/, '').trim();
  const clauses = body
    .split(/\s*(?:,\s+|\s+[—–-]\s+|;\s*)\s*/)
    .map((c) => c.trim())
    .filter(Boolean);

  if (clauses.length >= 2) {
    const firstClause = clauses[0];
    const metricClauses = clauses.slice(1).filter((c) => /\d/.test(c));
    const nonMetricClauses = clauses.slice(1).filter((c) => !/\d/.test(c));

    // Start with opening clause + all metric-bearing clauses
    const essential = [firstClause, ...metricClauses];
    let assembled = essential.join(', ');

    // Try adding non-metric clauses in original order if they still fit within budget
    if (
      assembled.split(/\s+/).length <= maxWords &&
      assembled.length + 1 <= maxChars
    ) {
      const selectedSet = new Set<string>(essential);
      for (const nm of nonMetricClauses) {
        const trialList = clauses.filter(
          (c) => selectedSet.has(c) || c === nm,
        );
        const trial = trialList.join(', ');
        if (
          trial.split(/\s+/).length <= maxWords &&
          trial.length + 1 <= maxChars
        ) {
          selectedSet.add(nm);
          assembled = trial;
        }
      }
      const cleanClauseResult = stripDanglingTailWords(assembled);
      if (
        cleanClauseResult.split(/\s+/).length <= maxWords &&
        cleanClauseResult.length + 1 <= maxChars
      ) {
        return `${cleanClauseResult}.`;
      }
    }

    // If opening clause + metric clauses exceed budget, trim non-numeric tail of opening clause
    if (metricClauses.length > 0) {
      const metricTail = metricClauses.join(', ');
      const remainingChars = Math.max(45, maxChars - metricTail.length - 3);
      const remainingWords = Math.max(
        6,
        maxWords - metricTail.split(/\s+/).length,
      );
      const firstWords = firstClause.split(/\s+/);
      const keptFirst: string[] = [];
      for (const w of firstWords) {
        const nextStr = [...keptFirst, w].join(' ');
        if (
          keptFirst.length >= remainingWords ||
          nextStr.length > remainingChars
        ) {
          break;
        }
        keptFirst.push(w);
      }
      const trimmedFirst = stripDanglingTailWords(keptFirst.join(' '));
      const combined = `${trimmedFirst}, ${metricTail}`;
      if (
        combined.split(/\s+/).length <= maxWords + 2 &&
        combined.length + 1 <= maxChars + 12
      ) {
        return `${stripDanglingTailWords(combined)}.`;
      }
    }
  }

  // Fallback: word-by-word budget preserving any trailing metric tokens if present
  const allWords = body.split(/\s+/).filter(Boolean);
  const kept: string[] = [];
  for (const w of allWords) {
    const candidateStr = [...kept, w].join(' ');
    if (kept.length >= maxWords || candidateStr.length + 1 > maxChars) {
      break;
    }
    kept.push(w);
  }
  return `${stripDanglingTailWords(kept.join(' '))}.`;
}

/**
 * Extracts the corpus of text that falls within the top third of Page 1.
 * Uses `PositionedText[]` from the PDF round-trip when available (auto-detecting top-down vs bottom-up y),
 * otherwise estimates from the template's line metrics (~18 lines on page 1 top third).
 */
export function extractFirstThirdPageText(
  doc: ResumeDocument,
  positionedText?: PositionedText[],
): { text: string; layoutEstimated: boolean } {
  if (positionedText && positionedText.length > 0) {
    const page1Items = positionedText.filter((item) => item.page === 1);
    if (page1Items.length > 0) {
      const firstY = page1Items[0].y;
      const lastY = page1Items[page1Items.length - 1].y;
      // Bottom-up PDF coordinates have larger Y at the top of Page 1 (e.g. 740 -> 90).
      // Top-down coordinates emitted by pdfEngine have smaller Y at the top of Page 1 (e.g. 50 -> 680).
      const isBottomUp = firstY > lastY && firstY > 400;
      const topItems = isBottomUp
        ? page1Items.filter((item) => item.y >= 516)
        : page1Items.filter((item) => item.y <= 320);
      if (topItems.length > 0) {
        return {
          text: topItems.map((i) => i.text).join(' \n '),
          layoutEstimated: false,
        };
      }
    }
  }

  // Fallback estimation from template line metrics
  const maxCharsPerLine = doc.meta.templateId === 'compact' ? 92 : 82;
  const maxLinesInFirstThird = doc.meta.templateId === 'compact' ? 20 : 17;
  const lines: string[] = [];

  lines.push(doc.header.name);
  if (doc.header.headline) lines.push(doc.header.headline);
  lines.push(`${doc.header.email} ${doc.header.location}`);

  if (doc.summary.trim()) {
    const summaryLines = Math.ceil(doc.summary.length / maxCharsPerLine);
    lines.push(doc.summary);
    for (let i = 1; i < summaryLines; i++) lines.push('');
  }

  for (const exp of doc.experiences) {
    if (lines.length >= maxLinesInFirstThird) break;
    lines.push(`${exp.title} ${exp.company} ${exp.dateRange}`);
    for (const b of exp.bullets) {
      if (lines.length >= maxLinesInFirstThird) break;
      const bLines = Math.max(1, Math.ceil(b.text.length / maxCharsPerLine));
      lines.push(b.text);
      for (let i = 1; i < bLines; i++) lines.push('');
    }
  }

  return {
    text: lines.filter(Boolean).join(' \n '),
    layoutEstimated: true,
  };
}

function parseEndYear(dateRange: string): number {
  if (/\b(?:present|now|current|aujourd'hui|actuel)\b/i.test(dateRange)) {
    return new Date().getFullYear();
  }
  const years = dateRange.match(/\b(19\d{2}|20\d{2})\b/g);
  if (!years || years.length === 0) return new Date().getFullYear();
  return Number(years[years.length - 1]);
}

function headlinesAlign(headline: string, targetRole: string): boolean {
  const h = headline.trim().toLowerCase();
  const t = targetRole.trim().toLowerCase();
  if (!h) return false;
  if (!t) return true;
  if (h.includes(t) || t.includes(h)) return true;

  const stopWords = new Set(['and', 'or', 'the', 'of', 'for', 'in', 'at', '&', '-', '/']);
  const hTokens = new Set(
    h
      .split(/[\s,/&-]+/)
      .filter((w) => w.length > 2 && !stopWords.has(w)),
  );
  const tTokens = t
    .split(/[\s,/&-]+/)
    .filter((w) => w.length > 2 && !stopWords.has(w));

  if (tTokens.length === 0) return true;
  const overlap = tTokens.filter((tok) => hTokens.has(tok)).length;
  return overlap / tTokens.length >= 0.5;
}

/**
 * Extracts the strongest metric with unit and context from a list of bullet strings
 * (e.g. "p99 420→68 ms", never a bare number).
 */
export function extractStrongestMetricWithContext(bullets: string[]): string {
  let headlineMetric = '';
  for (const bText of bullets) {
    // 1. Highest priority: before -> after transition with optional context label (e.g. "p99 latency from 420ms to 68ms" -> "p99 420→68 ms")
    const p99Arrow = bText.match(
      /\b(p99|p95|latency|build|deploy|recovery|failover)\b[^.;,]{0,24}?(\d+(?:\.\d+)?)\s*(ms|s|sec|minutes?|mins?|hours?|hrs?|%)?\s*(?:from\s+)?(?:to|→|->)\s*(\d+(?:\.\d+)?)\s*(ms|s|sec|minutes?|mins?|hours?|hrs?|%)/i,
    );
    if (p99Arrow) {
      const ctx = p99Arrow[1].toLowerCase() === 'latency' ? 'p99' : p99Arrow[1];
      const n1 = p99Arrow[2];
      const n2 = p99Arrow[4];
      const unit = p99Arrow[5] || p99Arrow[3] || 'ms';
      return `${ctx} ${n1}→${n2} ${unit}`;
    }

    const genericArrow = bText.match(
      /(\d+(?:\.\d+)?)\s*(ms|s|sec|hours?|hrs?|mins?|minutes?|%)?\s*(?:to|→|->)\s*(\d+(?:\.\d+)?)\s*(ms|s|sec|minutes?|mins?|hours?|hrs?|%)/i,
    );
    if (genericArrow) {
      const n1 = genericArrow[1];
      const n2 = genericArrow[3];
      const unit = genericArrow[4] || genericArrow[2] || 'ms';
      const hasP99 = /\bp99\b/i.test(bText);
      return `${hasP99 ? 'p99 ' : ''}${n1}→${n2} ${unit}`;
    }

    // 2. Second priority: percentage + context noun phrase (e.g. "38% cloud egress reduction")
    const pctMatch = bText.match(
      /(\d+(?:\.\d+)?%\s+[a-z0-9-]+(?:\s+[a-z0-9-]+){0,2})/i,
    );
    if (pctMatch && !headlineMetric) {
      headlineMetric = pctMatch[1].trim();
    }

    // 3. Third priority: throughput / scale with unit and context
    const scaleMatch = bText.match(
      /(\$?\d+(?:[.,]\d+)?\s*(?:M|B|k|TB|GB|events\/sec|rps|qps|ms)(?:\s+[a-z-]+)?)/i,
    );
    if (scaleMatch && !headlineMetric) {
      headlineMetric = scaleMatch[1].trim();
    }
  }
  return headlineMetric;
}

/**
 * Composes the deterministic First-impression takeaway line from the ResumeDocument:
 * e.g. "Staff Platform Engineer · Vanguard Telemetry Systems · 2023–Present · Kubernetes, PostgreSQL, Go · 420ms→68ms"
 */
export function composeFirstImpressionTakeaway(

  docOrApp: ResumeDocument | Application,
  targetRoleOrBank?: string | BankSnapshot,
  topMustHaves: string[] = [],
): TakeawaySummary {
  let doc: ResumeDocument;
  let targetRole = '';
  let mustHaves = topMustHaves;

  if ('header' in docOrApp && 'skillsByCategory' in docOrApp) {
    doc = docOrApp;
    targetRole =
      typeof targetRoleOrBank === 'string'
        ? targetRoleOrBank
        : doc.meta.targetRole;
  } else {
    const bank = targetRoleOrBank as BankSnapshot;
    doc = mapApplicationToResumeDocument(docOrApp, bank, 1);
    targetRole = docOrApp.parsedJob?.title || docOrApp.roleTitle;
    if (mustHaves.length === 0 && docOrApp.parsedJob) {
      mustHaves = docOrApp.parsedJob.requirements
        .filter((r) => r.priority === 'must-have')
        .map((r) => r.text);
    }
  }

  const mostRecent = doc.experiences[0];
  const roleTitle =
    mostRecent?.title || doc.header.headline || 'Software Engineer';
  const company = mostRecent?.company || 'Independent';
  const tenure = mostRecent?.dateRange || 'Current';


  const allSkills = doc.skillsByCategory.flatMap((c) => c.skills);
  const matchedMustHaves = mustHaves.filter((mh) =>
    allSkills.some((s) => normalizeKeyword(s) === normalizeKeyword(mh)),
  );
  const topSkills = (
    matchedMustHaves.length >= 2
      ? matchedMustHaves.slice(0, 3)
      : [...matchedMustHaves, ...allSkills].slice(0, 3)
  ).filter(Boolean);

  // Find the strongest headline metric with unit and context (e.g. "p99 420→68 ms", never a bare number)
  const allBullets = doc.experiences.flatMap((e) =>
    e.bullets.map((b) => b.text),
  );
  const headlineMetric = extractStrongestMetricWithContext(allBullets);

  const segments = [

    roleTitle,
    company,
    tenure,
    topSkills.length > 0 ? topSkills.join(', ') : '',
    headlineMetric,
  ].filter(Boolean);

  const matchesTargetRole = headlinesAlign(
    `${doc.header.headline} ${roleTitle}`,
    targetRole || doc.meta.targetRole,
  );
  const line = segments.join(' · ');

  return {
    line,
    takeaway: line,
    roleTitle,
    company,
    tenure,
    topSkills,
    headlineMetric,
    matchesTargetRole,
    targetRoleMatches: matchesTargetRole,
    statusLabel: matchesTargetRole
      ? 'Matches target role'
      : 'Headline differs from target role',
  };
}

/**
 * Deterministically computes Recruiter appeal (estimate) 0–100 across the 4 lenses:
 * - Skim (35%)
 * - Proof (30%)
 * - Clarity (20%)
 * - Voice (15%)
 *
 * Fairness guard: never inspects or rewards photos, age, marital status, or full street address.
 */
export function computeRecruiterAppeal(
  paramsOrApp:
    | {
        doc?: ResumeDocument;
        parsedJob?: ParsedJob | null;
        application?: Application;
        bank?: BankSnapshot;
        positionedText?: PositionedText[];
      }
    | Application,
  maybeBank?: BankSnapshot,
  maybePositionedText?: PositionedText[],
): RecruiterAppealReport {
  let doc: ResumeDocument;
  let parsedJob: ParsedJob | null = null;
  let positionedText: PositionedText[] | undefined;

  if ('workingDraft' in paramsOrApp) {
    const app = paramsOrApp;
    const bank = maybeBank!;
    doc = mapApplicationToResumeDocument(app, bank, 1);
    parsedJob = app.parsedJob;
    positionedText = maybePositionedText;
  } else {
    if (paramsOrApp.doc) {
      doc = paramsOrApp.doc;
    } else if (paramsOrApp.application && paramsOrApp.bank) {
      doc = mapApplicationToResumeDocument(
        paramsOrApp.application,
        paramsOrApp.bank,
        1,
      );
    } else {
      throw new Error('computeRecruiterAppeal requires doc or application+bank');
    }
    parsedJob =
      paramsOrApp.parsedJob !== undefined
        ? paramsOrApp.parsedJob
        : (paramsOrApp.application?.parsedJob ?? null);
    positionedText = paramsOrApp.positionedText;
  }

  const targetRole = parsedJob?.title || doc.meta.targetRole || '';
  const mustHaves =
    parsedJob?.requirements
      .filter((r) => r.priority === 'must-have')
      .map((r) => r.text) ?? [];
  const top3MustHaves = mustHaves.slice(0, 3);
  const allBullets = doc.experiences.flatMap((e) =>
    e.bullets.map((b) => b.text),
  );

  // --------------------------------------------------------------------------
  // LENS 1: SKIM (Weight 35) — 90 base pts + 10 stretch pts
  // --------------------------------------------------------------------------
  const firstThird = extractFirstThirdPageText(doc, positionedText);
  const firstThirdLower = firstThird.text.toLowerCase();

  // 1a. Headline matches target role title (27 pts)
  const headlineMatches = headlinesAlign(doc.header.headline, targetRole);
  const skimHeadlinePts = headlineMatches ? 27 : doc.header.headline.trim() ? 11 : 0;

  // 1b. Most recent title, company, and tenure appear in the first third of page 1 (18 pts)
  const recentExp = doc.experiences[0];
  const recentInFirstThird = Boolean(
    recentExp &&
      firstThirdLower.includes(recentExp.title.toLowerCase()) &&
      firstThirdLower.includes(recentExp.company.toLowerCase()),
  );
  const skimRecentPts = recentInFirstThird ? 18 : recentExp ? 7 : 0;

  // 1c. At least 2 of the top-3 must-haves appear in the first third (23 pts)
  let skimMustHavePts = 20;
  let matchedMustHavesInTop = 0;
  if (top3MustHaves.length > 0) {
    matchedMustHavesInTop = top3MustHaves.filter((mh) => {
      const norm = normalizeKeyword(mh);
      return (
        firstThirdLower.includes(mh.toLowerCase()) ||
        firstThirdLower.includes(norm.toLowerCase())
      );
    }).length;
    const targetCount = Math.min(2, top3MustHaves.length);
    skimMustHavePts =
      matchedMustHavesInTop >= targetCount
        ? 23
        : matchedMustHavesInTop === 1
          ? 12
          : 0;
  }

  // 1d. A quantified result appears in the first third (22 pts)
  const hasMetricInFirstThird = METRIC_NUMBER_REGEX.test(firstThird.text);
  const skimMetricPts = hasMetricInFirstThird ? 22 : 0;

  // 1e. Stretch criterion (10 pts): before->after transition in top third + all top-3 must-haves in top third
  const hasBeforeAfterInTop = /\b\d+(?:\.\d+)?\s*(?:ms|s|sec|mins?|hours?|%)?\s*(?:to|→|->)\s*\d+/i.test(
    firstThird.text,
  );
  const allTop3InFirstThird =
    top3MustHaves.length >= 3 && matchedMustHavesInTop >= 3;
  const skimStretchPts =
    (hasBeforeAfterInTop ? 6 : 0) + (allTop3InFirstThird ? 4 : 0);

  const skimScore = Math.max(
    0,
    Math.min(
      100,
      skimHeadlinePts +
        skimRecentPts +
        skimMustHavePts +
        skimMetricPts +
        skimStretchPts,
    ),
  );

  let skimWeakest = 'Strong first-third anchor placement';
  if (skimHeadlinePts < 27) {
    skimWeakest = 'Align your headline with the target role title';
  } else if (skimMustHavePts < 23) {
    skimWeakest = 'Surface top must-have skills in your summary or first role';
  } else if (skimMetricPts < 22) {
    skimWeakest = 'Place a quantified result in the top third of page 1';
  } else if (skimRecentPts < 18) {
    skimWeakest = 'Keep your most recent role in the top third of page 1';
  }

  // --------------------------------------------------------------------------
  // LENS 2: PROOF (Weight 30) — 90 base pts + 10 stretch pts
  // --------------------------------------------------------------------------
  const totalBulletCount = allBullets.length;
  const quantifiedBulletCount = allBullets.filter((b) =>
    METRIC_NUMBER_REGEX.test(b),
  ).length;
  const quantifiedRatio =
    totalBulletCount > 0 ? quantifiedBulletCount / totalBulletCount : 0;

  // 2a. Share of bullets with a quantified result, graded curve up to 65% (36 pts)
  const proofQuantifiedPts =
    totalBulletCount === 0
      ? 0
      : quantifiedRatio >= 0.65
        ? 36
        : Math.round((quantifiedRatio / 0.65) * 36);

  // 2b. No duty-style openers like "responsible for / worked on" (18 pts)
  const dutyViolations = allBullets.filter((b) =>
    DUTY_OPENERS_REGEX.test(b.trim()),
  ).length;
  const proofDutyPts = Math.max(0, 18 - dutyViolations * 9);

  // 2c. Each role leads with its strongest bullet by the impact heuristic (22 pts)
  let rolesLeadingWithStrongest = 0;
  let rolesWithBullets = 0;
  for (const exp of doc.experiences) {
    if (exp.bullets.length === 0) continue;
    rolesWithBullets += 1;
    const strengths = exp.bullets.map((b) =>
      computeBulletImpactStrength(b.text, mustHaves),
    );
    const maxStrength = Math.max(...strengths);
    if (strengths[0] >= maxStrength) {
      rolesLeadingWithStrongest += 1;
    }
  }
  const proofLeadPts =
    rolesWithBullets === 0
      ? 0
      : Math.round((rolesLeadingWithStrongest / rolesWithBullets) * 22);

  // 2d. Variety of metric types: scale, time, money, percent (14 pts)
  const fullBulletText = allBullets.join(' ');
  let metricTypesFound = 0;
  if (/\b\d+(?:[.,]\d+)?\s*(?:events\/sec|rps|qps|requests|users|tenants|clusters|regions|services|microservices|repos|repositories|M|B|k\+)\b/i.test(fullBulletText)) {
    metricTypesFound += 1; // scale
  }
  if (/\b\d+(?:[.,]\d+)?\s*(?:ms|s|sec|seconds?|mins?|minutes?|hrs?|hours?|days?|weeks?|months?)\b/i.test(fullBulletText)) {
    metricTypesFound += 1; // time
  }
  if (/(?:\$\d+|\b\d+(?:[.,]\d+)?\s*(?:spend|cost|revenue|arr|egress))\b/i.test(fullBulletText)) {
    metricTypesFound += 1; // money
  }
  if (/\b\d+(?:[.,]\d+)?\s*(?:%|x)\b/i.test(fullBulletText)) {
    metricTypesFound += 1; // percent/multiplier
  }
  const proofVarietyPts =
    metricTypesFound >= 3
      ? 14
      : metricTypesFound === 2
        ? 10
        : metricTypesFound === 1
          ? 5
          : 0;

  // 2e. Stretch criterion (10 pts): >= 80% quantified bullets AND >= 2 before->after comparisons AND all 4 metric types
  const beforeAfterCount = allBullets.filter((b) =>
    /\b\d+(?:\.\d+)?\s*(?:ms|s|sec|mins?|hours?|%)?\s*(?:to|→|->)\s*\d+/i.test(b),
  ).length;
  const proofStretchPts =
    (quantifiedRatio >= 0.8 ? 4 : 0) +
    (beforeAfterCount >= 2 ? 3 : 0) +
    (metricTypesFound >= 4 ? 3 : 0);

  const proofScore = Math.max(
    0,
    Math.min(
      100,
      proofQuantifiedPts +
        proofDutyPts +
        proofLeadPts +
        proofVarietyPts +
        proofStretchPts,
    ),
  );

  let proofWeakest = 'Concrete metrics lead every role';
  if (proofQuantifiedPts < 32) {
    proofWeakest = 'Add quantified outcomes to at least 60% of bullets';
  } else if (proofLeadPts < 22) {
    proofWeakest = 'Move your highest-impact bullet to the top of each role';
  } else if (proofDutyPts < 18) {
    proofWeakest = 'Replace duty openers ("Responsible for", "Worked on") with action verbs';
  } else if (proofVarietyPts < 10) {
    proofWeakest = 'Mix metric types (percent, latency/time, scale, or cost)';
  }

  // --------------------------------------------------------------------------
  // LENS 3: CLARITY (Weight 20) — 90 base pts + 10 stretch pts
  // --------------------------------------------------------------------------
  const maxCharsPerLine = doc.meta.templateId === 'compact' ? 92 : 82;

  // 3a. Bullets are at most 26 words and 2 lines (27 pts)
  const longBullets = allBullets.filter((b) => {
    const words = b.trim().split(/\s+/).filter(Boolean).length;
    const lines = Math.ceil(b.trim().length / maxCharsPerLine);
    return words > 26 || lines > 2;
  }).length;
  const clarityBulletLenPts =
    totalBulletCount === 0
      ? 0
      : Math.max(0, 27 - longBullets * 9);

  // 3b. Recent roles (<=5 yrs) have 3–5 bullets and older roles (>5 yrs) have at most 3 (22 pts)
  const currentYear = new Date().getFullYear();
  let roleCountViolations = 0;
  for (const exp of doc.experiences) {
    const endYr = parseEndYear(exp.dateRange);
    const isOlderThan5Yrs = currentYear - endYr > 5;
    if (isOlderThan5Yrs) {
      if (exp.bullets.length > 3) roleCountViolations += 1;
    } else {
      if (exp.bullets.length < 2 || exp.bullets.length > 5) {
        roleCountViolations += 1;
      }
    }
  }
  const clarityRoleCountPts =
    doc.experiences.length === 0
      ? 0
      : Math.max(0, 22 - roleCountViolations * 9);

  // 3c. Summary is at most 60 words and 3 lines (18 pts)
  const summaryTrimmed = doc.summary.trim();
  const summaryWords = summaryTrimmed
    ? summaryTrimmed.split(/\s+/).filter(Boolean).length
    : 0;
  const summaryLines = summaryTrimmed
    ? Math.ceil(summaryTrimmed.length / maxCharsPerLine)
    : 0;
  const claritySummaryPts =
    summaryWords === 0
      ? 6
      : summaryWords <= 60 && summaryLines <= 3
        ? 18
        : 6;

  // 3d. Dates are consistent (10 pts)
  const datesConsistent = doc.experiences.every((e) =>
    /\d{4}/.test(e.dateRange),
  );
  const clarityDatesPts = datesConsistent ? 10 : 4;

  // 3e. Text density is within a comfortable band (13 pts)
  const totalWords =
    summaryWords +
    allBullets.reduce(
      (acc, b) => acc + b.trim().split(/\s+/).filter(Boolean).length,
      0,
    );
  const clarityDensityPts =
    totalWords >= 80 && totalWords <= 420 ? 13 : totalWords > 0 ? 6 : 0;

  // 3f. Stretch criterion (10 pts): every bullet <= 21 words AND summary 20-42 words
  const allBulletsCrisp =
    totalBulletCount > 0 &&
    allBullets.every(
      (b) => b.trim().split(/\s+/).filter(Boolean).length <= 21,
    );
  const summaryIdeal = summaryWords >= 20 && summaryWords <= 42;
  const clarityStretchPts =
    (allBulletsCrisp ? 6 : 0) + (summaryIdeal ? 4 : 0);

  const clarityScore = Math.max(
    0,
    Math.min(
      100,
      clarityBulletLenPts +
        clarityRoleCountPts +
        claritySummaryPts +
        clarityDatesPts +
        clarityDensityPts +
        clarityStretchPts,
    ),
  );

  let clarityWeakest = 'Crisp bullet length and balanced role density';
  if (clarityBulletLenPts < 27) {
    clarityWeakest = 'Trim bullets over 26 words or 2 lines';
  } else if (claritySummaryPts < 18) {
    clarityWeakest =
      summaryWords === 0
        ? 'Add a concise 2-sentence summary'
        : 'Shorten your summary to 60 words or fewer';
  } else if (clarityRoleCountPts < 22) {
    clarityWeakest = 'Keep recent roles to 3–5 bullets and older roles to at most 3';
  }

  // --------------------------------------------------------------------------
  // LENS 4: VOICE (Weight 15) — 90 base pts + 10 stretch pts
  // --------------------------------------------------------------------------
  // 4a. Inverse of Machine-made feel (36 pts)
  const machineMade = lintMachineMadeScore([doc.summary, ...allBullets]);
  const voiceHumanPts = Math.round(((100 - machineMade.score) / 100) * 36);

  // 4b. Specificity: concrete nouns, tools, and numbers per bullet (27 pts)
  const knownSkillNames = doc.skillsByCategory
    .flatMap((c) => c.skills)
    .map((s) => s.toLowerCase());
  const specificBullets = allBullets.filter((b) => {
    const lower = b.toLowerCase();
    const hasNum = METRIC_NUMBER_REGEX.test(b);
    const hasSkill = knownSkillNames.some((s) => s.length >= 2 && lower.includes(s));
    return hasNum && hasSkill;
  }).length;
  const partiallySpecificBullets = allBullets.filter((b) => {
    const lower = b.toLowerCase();
    const hasNum = METRIC_NUMBER_REGEX.test(b);
    const hasSkill = knownSkillNames.some((s) => s.length >= 2 && lower.includes(s));
    return hasNum || hasSkill;
  }).length;
  const voiceSpecificityPts =
    totalBulletCount === 0
      ? 0
      : Math.round(
          ((specificBullets * 0.65 + partiallySpecificBullets * 0.35) /
            totalBulletCount) *
            27,
        );

  // 4c. No vague superlatives or buzzwords (18 pts)
  const buzzwordHits = [doc.summary, ...allBullets].filter((t) =>
    VAGUE_BUZZWORDS_REGEX.test(t),
  ).length;
  const voiceBuzzwordPts = Math.max(0, 18 - buzzwordHits * 9);

  // 4d. Verb variety: no opening verb used more than twice (9 pts)
  const verbCounts = new Map<string, number>();
  for (const b of allBullets) {
    const first = b
      .trim()
      .split(/\s+/)[0]
      ?.toLowerCase()
      .replace(/[^a-z-]/g, '');
    if (first) {
      verbCounts.set(first, (verbCounts.get(first) ?? 0) + 1);
    }
  }
  const repeatedVerbOver2 = Array.from(verbCounts.values()).some((c) => c > 2);
  const allUniqueVerbs =
    totalBulletCount >= 4 &&
    Array.from(verbCounts.values()).every((c) => c === 1);
  const voiceVerbVarietyPts = repeatedVerbOver2 ? 3 : 9;

  // 4e. Stretch criterion (10 pts): machine-made score <= 10 AND all unique opening verbs AND >=80% bullets have both tool & number
  const voiceStretchPts =
    (machineMade.score <= 10 ? 4 : 0) +
    (allUniqueVerbs ? 3 : 0) +
    (totalBulletCount > 0 && specificBullets / totalBulletCount >= 0.8 ? 3 : 0);

  const voiceScore = Math.max(
    0,
    Math.min(
      100,
      voiceHumanPts +
        voiceSpecificityPts +
        voiceBuzzwordPts +
        voiceVerbVarietyPts +
        voiceStretchPts,
    ),
  );

  let voiceWeakest = 'Specific, natural phrasing with varied verbs';
  if (voiceBuzzwordPts < 18) {
    voiceWeakest = 'Remove vague buzzwords ("results-driven", "passionate", "dynamic")';
  } else if (voiceHumanPts < 26) {
    voiceWeakest = 'Soften formal AI-sounding verbs toward Balanced or Natural voice';
  } else if (voiceVerbVarietyPts < 9) {
    voiceWeakest = 'Vary opening action verbs so no verb repeats more than twice';
  } else if (voiceSpecificityPts < 22) {
    voiceWeakest = 'Include concrete tools and numbers in every bullet';
  }

  // Weighted sum: Skim (35%) + Proof (30%) + Clarity (20%) + Voice (15%)
  const weightedScore = Math.round(
    skimScore * 0.35 +
      proofScore * 0.3 +
      clarityScore * 0.2 +
      voiceScore * 0.15,
  );

  const lensEntries: Array<['skim' | 'proof' | 'clarity' | 'voice', number]> = [
    ['skim', skimScore],
    ['proof', proofScore],
    ['clarity', clarityScore],
    ['voice', voiceScore],
  ];
  lensEntries.sort((a, b) => a[1] - b[1]);
  const weakestLens = lensEntries[0][0];

  const takeaway = composeFirstImpressionTakeaway(
    doc,
    targetRole,
    top3MustHaves,
  );

  const finalScore = Math.max(0, Math.min(96, weightedScore));
  const weakestSubcheckHints = {
    skim: skimWeakest,
    proof: proofWeakest,
    clarity: clarityWeakest,
    voice: voiceWeakest,
  };

  const appealFixes: AppealSuggestedFix[] = [];
  if (skimHeadlinePts < 30 && targetRole) {
    appealFixes.push({
      id: 'fix-appeal-align-headline',
      title: `Align headline to "${targetRole}"`,
      impactPoints: 6,
      description: 'Surfaces the exact target role in the first 3 seconds of a recruiter skim.',
      actionType: 'align-headline',
      actionPayload: targetRole,
    });
  }
  if (proofLeadPts < 25) {
    appealFixes.push({
      id: 'fix-appeal-promote-bullet',
      title: 'Lead each role with its highest-impact quantified bullet',
      impactPoints: 5,
      description: 'Recruiters read the first bullet of each role most closely.',
      actionType: 'promote-strongest-bullet',
    });
  }
  if (longBullets > 0) {
    appealFixes.push({
      id: 'fix-appeal-trim-bullet',
      title: 'Trim bullets over 26 words to 2 crisp lines',
      impactPoints: 4,
      description: 'Keeps every achievement scannable without dense text walls.',
      actionType: 'trim-long-bullet',
    });
  }
  if (claritySummaryPts < 20) {
    appealFixes.push({
      id: 'fix-appeal-shorten-summary',
      title: 'Tighten summary to 2 sentences (under 55 words)',
      impactPoints: 4,
      description: 'Brings your first experience role higher into the top third of Page 1.',
      actionType: 'shorten-summary',
    });
  }

  return {
    score: finalScore,
    total: finalScore,
    recruiterAppeal: finalScore,
    lenses: {
      skim: skimScore,
      proof: proofScore,
      clarity: clarityScore,
      voice: voiceScore,
      layoutEstimated: firstThird.layoutEstimated,
      weakestSubcheckByLens: weakestSubcheckHints,
      weakestHints: weakestSubcheckHints,
    },
    takeaway,
    firstImpressionTakeaway: takeaway.line,
    targetRoleMatches: takeaway.matchesTargetRole,
    weakestSubcheckHints,
    weakestLens,
    layoutEstimated: firstThird.layoutEstimated,
    fixes: appealFixes,
  };
}

// ============================================================================
// SKIM VIEW ANCHOR SELECTION (PURE DOMAIN)
// ============================================================================

export interface BulletTextSegment {
  text: string;
  isSkimAnchor: boolean;
  isCrossHighlighted: boolean;
  isHighlighted: boolean;
  isKeyword: boolean;
  isMetric: boolean;
}

/**
 * Splits a bullet string into segments for Skim view and Cross-highlighting:
 * - First 3 words of each bullet are always Skim anchors
 * - Numbers / metrics are Skim anchors
 * - Top must-have keywords are Skim anchors
 * - Non-anchor middle prose is marked `isSkimAnchor: false` so the UI can blur it with a static Tailwind class.
 */
export function segmentBulletForSkimAndHighlight(
  bulletTextOrOpts:
    | string
    | {
        text: string;
        keywordTerms?: string[];
        highlightedTerm?: string | null;
      },
  topMustHaves: string[] = [],
  crossHighlightTerm?: string | null,
): BulletTextSegment[] {
  const bulletText =
    typeof bulletTextOrOpts === 'string'
      ? bulletTextOrOpts
      : bulletTextOrOpts.text;
  const effectiveMustHaves =
    typeof bulletTextOrOpts === 'string'
      ? topMustHaves
      : (bulletTextOrOpts.keywordTerms ?? []);
  const effectiveHighlight =
    typeof bulletTextOrOpts === 'string'
      ? crossHighlightTerm
      : bulletTextOrOpts.highlightedTerm;

  const words = bulletText.trim().split(/(\s+)/);
  if (words.length === 0) return [];

  const mustHaveLower = effectiveMustHaves
    .map((m) => m.trim().toLowerCase())
    .filter((m) => m.length >= 2);
  const highlightLower = effectiveHighlight?.trim().toLowerCase() || '';

  const rawTokens: BulletTextSegment[] = [];
  let wordIndex = 0;

  for (const token of words) {
    if (/^\s+$/.test(token)) {
      rawTokens.push({
        text: token,
        isSkimAnchor: rawTokens[rawTokens.length - 1]?.isSkimAnchor ?? true,
        isCrossHighlighted: false,
        isHighlighted: false,
        isKeyword: false,
        isMetric: false,
      });
      continue;
    }

    const cleanToken = token.replace(/^[.,;:(["']+|[.,;:)\]"']+$/g, '').toLowerCase();
    const isFirstThree = wordIndex < 3;
    const isNumberOrMetric =
      /\d/.test(token) ||
      /^(?:ms|sec|rps|qps|events\/sec|p99|p95)$/i.test(cleanToken);
    const isMustHave = mustHaveLower.some(
      (mh) =>
        cleanToken === mh ||
        (cleanToken.length >= 3 && mh.split(/[\s/-]+/).includes(cleanToken)),
    );
    const isCross =
      Boolean(highlightLower) &&
      cleanToken.length >= 2 &&
      (cleanToken === highlightLower ||
        highlightLower.split(/[\s/-]+/).includes(cleanToken) ||
        normalizeKeyword(cleanToken) === normalizeKeyword(highlightLower));

    rawTokens.push({
      text: token,
      isSkimAnchor: isFirstThree || isNumberOrMetric || isMustHave || isCross,
      isCrossHighlighted: isCross,
      isHighlighted: isCross,
      isKeyword: isMustHave,
      isMetric: isNumberOrMetric,
    });
    wordIndex += 1;
  }

  // Merge adjacent segments with identical flags to keep DOM node count tiny
  const merged: BulletTextSegment[] = [];
  for (const seg of rawTokens) {
    const prev = merged[merged.length - 1];
    if (
      prev &&
      prev.isSkimAnchor === seg.isSkimAnchor &&
      prev.isCrossHighlighted === seg.isCrossHighlighted &&
      prev.isKeyword === seg.isKeyword &&
      prev.isMetric === seg.isMetric
    ) {
      prev.text += seg.text;
    } else {
      merged.push({ ...seg });
    }
  }
  return merged;
}

// ============================================================================
// LETTER APPEAL & OPENING VALIDATION (SECTION 2.5)
// ============================================================================

export const BANNED_LETTER_OPENERS_REGEX =
  /^\s*(?:i\s+am\s+applying\s+for|i'm\s+applying\s+for|i\s+am\s+writing\s+to|i'm\s+writing\s+to|i\s+am\s+excited\s+to\s+apply|i'm\s+excited\s+to\s+apply|i\s+am\s+thrilled\s+to\s+apply|i'm\s+thrilled\s+to\s+apply|please\s+accept\s+this\s+letter)/i;

export function hasBannedLetterOpener(openingText: string): boolean {
  const sentences = openingText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return sentences.some((s) => BANNED_LETTER_OPENERS_REGEX.test(s));
}

export interface LetterAppealScoreResult {
  score: number;
  appealScore: number;
  letterAppeal: number;
  passedChecksCount: number;
  totalChecksCount: number;
  hasConcreteOpeningProof: boolean;
  iStarterRatio: number;
  hasKeywordStuffedSentence: boolean;
}

/**
 * Computes Letter appeal (estimate) 0–100 + 6-check status (Section 2.5):
 * - Concrete proof in the first two sentences & no banned stock opener (25 pts)
 * - "you" vs "I" ratio: warn above 50% of sentences starting with "I" (20 pts)
 * - Specificity: concrete tools and numbers from Bank (20 pts)
 * - Length band (15 pts)
 * - No keyword-list sentences: at most 2 JD keywords per sentence (20 pts)
 */
export function computeLetterAppealScore(params: {
  draft: CoverLetterDraft;
  parsedJob: ParsedJob | null;
  passedChecksCount?: number;
  totalChecksCount?: number;
  company?: string;
  roleTitle?: string;
}): LetterAppealScoreResult {
  const {
    draft,
    parsedJob,
    passedChecksCount = 6,
    totalChecksCount = 6,
  } = params;
  const openingBlock = draft.blocks.find((b) => b.type === 'opening');
  const openingText = openingBlock?.text ?? '';

  const coreText = draft.blocks
    .filter((b) => b.type !== 'greeting' && b.type !== 'signoff')
    .map((b) => b.text)
    .join(' ');

  const sentences = coreText
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);

  const firstTwoSentences = sentences.slice(0, 2).join(' ');
  const hasConcreteOpeningProof =
    METRIC_NUMBER_REGEX.test(firstTwoSentences) &&
    !hasBannedLetterOpener(openingText);

  const iStarters = sentences.filter((s) => /^i\b/i.test(s)).length;
  const iStarterRatio =
    sentences.length > 0 ? iStarters / sentences.length : 0;

  const jdTerms =
    parsedJob?.requirements.map((r) => r.text.toLowerCase()) ?? [];
  let hasKeywordStuffedSentence = false;
  if (jdTerms.length > 0) {
    for (const s of sentences) {
      const lower = s.toLowerCase();
      const hitsInSentence = jdTerms.filter(
        (term) => term.length >= 2 && lower.includes(term),
      ).length;
      if (hitsInSentence > 3) {
        hasKeywordStuffedSentence = true;
        break;
      }
    }
  }

  const metricHits =
    coreText.match(
      /(?:\$?\d+(?:[.,]\d+)*(?:\s*(?:%|x|ms|s|sec|mins?|hours?|k|m|b|tb|gb|rps|qps|events\/sec|\+))|\b\d+\s*(?:to|→|->)\s*\d+)/gi,
    ) ?? [];
  const hasBeforeAfterInLetter = /\b\d+(?:\.\d+)?\s*(?:ms|s|sec|mins?|hours?|%)?\s*(?:to|→|->)\s*\d+/i.test(
    coreText,
  );
  const buzzwordsInLetter = VAGUE_BUZZWORDS_REGEX.test(coreText);

  let score = 0;
  // 1. Opening proof & no stock opener (21 base + 4 stretch for before->after delta)
  if (hasConcreteOpeningProof) {
    score += 21;
    if (hasBeforeAfterInLetter) score += 4;
  } else if (!hasBannedLetterOpener(openingText) && metricHits.length >= 1) {
    score += 15;
  } else if (!hasBannedLetterOpener(openingText)) {
    score += 9;
  } else {
    score += 3;
  }

  // 2. "I" starter ratio (16 base + 3 stretch when === 0)
  if (iStarterRatio === 0 && sentences.length >= 3) {
    score += 19;
  } else if (iStarterRatio <= 0.35) {
    score += 16;
  } else if (iStarterRatio <= 0.5) {
    score += 14;
  } else if (iStarterRatio <= 0.65) {
    score += 10;
  } else {
    score += 5;
  }

  // 3. Specificity & multiple grounded metrics (16 base + 4 stretch for >= 4 metrics & before->after)
  if (metricHits.length >= 4 && hasBeforeAfterInLetter && !buzzwordsInLetter) {
    score += 20;
  } else if (metricHits.length >= 2 && !buzzwordsInLetter) {
    score += 16;
  } else if (metricHits.length === 1) {
    score += 11;
  } else {
    score += 4;
  }

  // 4. Keyword stuffing & natural prose (16 pts)
  score += hasKeywordStuffedSentence ? 6 : buzzwordsInLetter ? 10 : 16;

  // 5. Checks alignment (16 pts)
  score += Math.round((passedChecksCount / Math.max(1, totalChecksCount)) * 16);

  // Cap at 96 so even a gold-standard letter never shows a synthetic 100
  const clamped = Math.max(0, Math.min(96, score));
  return {
    score: clamped,
    appealScore: clamped,
    letterAppeal: clamped,
    passedChecksCount,
    totalChecksCount,
    hasConcreteOpeningProof,
    iStarterRatio,
    hasKeywordStuffedSentence,
  };
}

// ============================================================================
// CALIBRATION FIXTURES (POOR < 55, AVERAGE 55–75, GOOD 75–90, GOLD 88–96)
// ============================================================================

const CALIBRATION_PARSED_JOB: ParsedJob = {
  title: 'Staff Infrastructure Engineer',
  company: 'Kestrel Pay',
  seniority: 'Staff',
  summary: 'Lead multi-region Kubernetes, Go, and PostgreSQL payment infrastructure.',
  requirements: [
    {
      id: 'cal-req-1',
      text: 'Kubernetes',
      normalizedKey: 'kubernetes',
      priority: 'must-have',
      category: 'tool',
    },
    {
      id: 'cal-req-2',
      text: 'Go',
      normalizedKey: 'go',
      priority: 'must-have',
      category: 'hard-skill',
    },
    {
      id: 'cal-req-3',
      text: 'PostgreSQL',
      normalizedKey: 'postgresql',
      priority: 'must-have',
      category: 'tool',
    },
  ],
  responsibilities: ['Scale payment settlement pipelines'],
  keywords: [],
};

function makeCalibrationResumeDoc(overrides: {
  headline: string;
  summary: string;
  bullets: string[];
}): ResumeDocument {
  return {
    kind: 'resume',
    contentHash: 'calibration-fixture',
    meta: {
      versionNumber: 1,
      templateId: 'classic',
      templateVersion: '1.0.0',
      pageSize: 'letter',
      voice: 'balanced',
      targetCompany: 'Kestrel Pay',
      targetRole: 'Staff Infrastructure Engineer',
      generatedAt: '2026-03-01T00:00:00.000Z',
    },
    header: {
      name: 'Alex Morgan',
      headline: overrides.headline,
      email: 'alex@example.com',
      phone: '555-0192',
      location: 'San Francisco, CA',
      links: [{ label: 'github', url: 'github.com/alexmorgan' }],
    },
    summary: overrides.summary,
    experiences: [
      {
        id: 'exp-1',
        company: 'Vanguard Telemetry',
        title: 'Staff Platform Engineer',
        location: 'San Francisco, CA',
        dateRange: '2022 – Present',
        bullets: overrides.bullets.map((text, idx) => ({
          id: `b-${idx + 1}`,
          text,
          sourceIds: [`src-${idx + 1}`],
          locked: false,
          unverifiedClaims: [],
        })),
      },
    ],
    projects: [],
    skillsByCategory: [
      {
        category: 'Infrastructure & Languages',
        skills: ['Kubernetes', 'Go', 'PostgreSQL', 'Terraform', 'Kafka'],
      },
    ],
    educations: [
      {
        id: 'edu-1',
        institution: 'Pacific Crest Institute of Technology',
        degreeLine: 'B.S. Computer Science',
        location: 'Berkeley, CA',
        dateRange: '2014 – 2018',
      },
    ],
    certifications: [],
  };
}

export const APPEAL_CALIBRATION_FIXTURES: Record<
  'poor' | 'average' | 'good' | 'gold',
  { doc: ResumeDocument; parsedJob: ParsedJob; expectedBand: [number, number] }
> = {
  poor: {
    parsedJob: CALIBRATION_PARSED_JOB,
    expectedBand: [0, 54],
    doc: makeCalibrationResumeDoc({
      headline: 'Generalist Developer',
      summary:
        'Results-driven, passionate, dynamic team player and thought leader looking for a new role.',
      bullets: [
        'Responsible for maintaining backend servers and helping with database tickets across various internal teams when needed by management and stakeholders during busy sprint cycles.',
        'Worked on deployment scripts and participated in weekly team meetings to discuss ongoing maintenance tasks, bug fixes, and documentation updates across legacy repositories.',
      ],
    }),
  },
  average: {
    parsedJob: CALIBRATION_PARSED_JOB,
    expectedBand: [55, 75],
    doc: makeCalibrationResumeDoc({
      headline: 'Backend Software Engineer',
      summary:
        'Backend engineer experienced with Kubernetes and distributed services in cloud environments.',
      bullets: [
        'Worked on Kubernetes cluster upgrades across 12 services to improve deployment reliability.',
        'Built internal Go tooling for database migrations and developer workflows.',
        'Maintained PostgreSQL read replicas and assisted with on-call incident response.',
      ],
    }),
  },
  good: {
    parsedJob: CALIBRATION_PARSED_JOB,
    expectedBand: [75, 90],
    doc: makeCalibrationResumeDoc({
      headline: 'Staff Infrastructure Engineer',
      summary:
        'Staff Infrastructure Engineer building high-throughput Go and Kubernetes platforms with strict PostgreSQL reliability guarantees.',
      bullets: [
        'Rebuilt Go settlement ingestion on Kubernetes, cutting p99 latency by 45% across 80k rps.',
        'Automated PostgreSQL zero-downtime schema migrations across 14 production clusters.',
        'Reduced cloud infrastructure spend by 28% through autoscaling and right-sizing.',
      ],
    }),
  },
  gold: {
    parsedJob: CALIBRATION_PARSED_JOB,
    expectedBand: [88, 96],
    doc: makeCalibrationResumeDoc({
      headline: 'Staff Infrastructure Engineer',
      summary:
        'Staff Infrastructure Engineer specializing in multi-region Kubernetes, Go, and PostgreSQL payment systems, cutting p99 latency from 420ms to 68ms.',
      bullets: [
        'Rebuilt Go settlement router on Kubernetes, dropping p99 latency from 420ms to 68ms at 120k rps.',
        'Engineered zero-downtime PostgreSQL sharding, reducing failover recovery from 18 mins to 25 sec.',
        'Trimmed annual cloud egress spend by $1.4M (38%) via locality-aware Kafka and Envoy routing.',
        'Shipped Terraform cell-isolation guardrails across 6 regions with 99.995% availability.',
      ],
    }),
  },
};

function makeCalibrationLetterDraft(overrides: {
  opening: string;
  body1: string;
  body2: string;
}): CoverLetterDraft {
  return {
    recipient: 'Hiring Team',
    length: 'standard',
    selectedProofAchievementIds: ['ach-1', 'ach-2'],
    whyCompanyNotes: '',
    voice: 'natural',
    blocks: [
      {
        id: 'cl-1',
        type: 'greeting',
        text: 'Dear Hiring Team,',
        sourceIds: [],
        locked: false,
        unverifiedClaims: [],
      },
      {
        id: 'cl-2',
        type: 'opening',
        text: overrides.opening,
        sourceIds: ['ach-1'],
        locked: false,
        unverifiedClaims: [],
      },
      {
        id: 'cl-3',
        type: 'body1',
        text: overrides.body1,
        sourceIds: ['ach-2'],
        locked: false,
        unverifiedClaims: [],
      },
      {
        id: 'cl-4',
        type: 'body2',
        text: overrides.body2,
        sourceIds: [],
        locked: false,
        unverifiedClaims: [],
      },
      {
        id: 'cl-5',
        type: 'signoff',
        text: 'Sincerely,\nAlex Morgan',
        sourceIds: [],
        locked: false,
        unverifiedClaims: [],
      },
    ],
  };
}

export const LETTER_APPEAL_CALIBRATION_FIXTURES: Record<
  'poor' | 'average' | 'good' | 'gold',
  {
    draft: CoverLetterDraft;
    parsedJob: ParsedJob;
    passedChecksCount: number;
    expectedBand: [number, number];
  }
> = {
  poor: {
    parsedJob: CALIBRATION_PARSED_JOB,
    passedChecksCount: 2,
    expectedBand: [0, 54],
    draft: makeCalibrationLetterDraft({
      opening:
        'I am writing to apply for the open position at your company. I am a passionate, results-driven thought leader.',
      body1:
        'I have worked on many software projects. I am a hard-working team player who enjoys collaborating.',
      body2:
        'I hope to hear from you soon regarding this exciting opportunity.',
    }),
  },
  average: {
    parsedJob: CALIBRATION_PARSED_JOB,
    passedChecksCount: 4,
    expectedBand: [55, 75],
    draft: makeCalibrationLetterDraft({
      opening:
        'At Vanguard Telemetry, my team maintained production Kubernetes clusters for internal platform teams.',
      body1:
        'I built Go services and maintained 12+ PostgreSQL databases to support engineering teams.',
      body2:
        'I would welcome a conversation about how my background fits Kestrel Pay.',
    }),
  },
  good: {
    parsedJob: CALIBRATION_PARSED_JOB,
    passedChecksCount: 5,
    expectedBand: [75, 90],
    draft: makeCalibrationLetterDraft({
      opening:
        'At Vanguard Telemetry, I rebuilt our Go settlement router on Kubernetes and cut latency by 45% across 80k rps. That experience aligns directly with the Staff Infrastructure Engineer mandate at Kestrel Pay.',
      body1:
        'Our platform team automated PostgreSQL schema migrations across 14 production clusters while cutting cloud spend by 28%.',
      body2:
        'Thank you for reviewing my application for the Kestrel Pay infrastructure team.',
    }),
  },
  gold: {
    parsedJob: CALIBRATION_PARSED_JOB,
    passedChecksCount: 6,
    expectedBand: [88, 96],
    draft: makeCalibrationLetterDraft({
      opening:
        'At Vanguard Telemetry, I rebuilt our Go settlement router on Kubernetes, cutting p99 latency from 420ms to 68ms at 120k rps. Kestrel Pay’s focus on resilient multi-region settlement directly matches that production work.',
      body1:
        'Collaborating with product teams, we engineered zero-downtime PostgreSQL sharding that reduced failover recovery from 18 mins to 25 sec and trimmed annual egress spend by $1.4M.',
      body2:
        'Having solved closely related reliability bottlenecks, our shared focus on predictable rollouts would let me contribute immediately to the Staff Infrastructure Engineer team at Kestrel Pay.',
    }),
  },
};
