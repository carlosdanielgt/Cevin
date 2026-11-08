import { z } from 'zod';
import { ApplicationStatus } from '../entities';
import { formatCount } from '../format';
import type {
  EvaluatedFactItem,
  FactConfidence,
  FactEvidence,
  FactSource,
  JobFactKey,
  PracticalFitEvaluation,
  PracticalFitStatus,
} from './index';

export const FactImportanceSchema = z.enum([
  'dealbreaker',
  'important',
  'nice-to-know',
]);
export type FactImportance = z.infer<typeof FactImportanceSchema>;

export const FactSalienceSchema = z.enum(['critical', 'notable', 'quiet']);
export type FactSalience = z.infer<typeof FactSalienceSchema>;

export type FactIconName =
  | 'map-pin'
  | 'shield'
  | 'globe'
  | 'dollar-sign'
  | 'briefcase'
  | 'clock'
  | 'plane'
  | 'lock'
  | 'award'
  | 'users'
  | 'calendar'
  | 'laptop'
  | 'heart'
  | 'building'
  | 'graduation-cap';

export const DEFAULT_FACT_IMPORTANCE: Record<JobFactKey, FactImportance> = {
  location: 'important',
  workPermits: 'dealbreaker',
  languages: 'important',
  salary: 'important',
  employmentType: 'nice-to-know',
};

/**
 * Pure salience derivation (Section 2.3):
 * - Critical: conflict on a Dealbreaker.
 * - Notable: conflict on an Important fact, or not stated on a Dealbreaker.
 * - Quiet: everything else (fits, not stated on Important or Nice to know, conflict on Nice to know).
 */
export function deriveSalience(
  status: PracticalFitStatus,
  importance: FactImportance,
): FactSalience {
  if (status === 'conflict' && importance === 'dealbreaker') {
    return 'critical';
  }
  if (
    (status === 'conflict' && importance === 'important') ||
    (status === 'not-stated' && importance === 'dealbreaker')
  ) {
    return 'notable';
  }
  return 'quiet';
}

export function getFactSourceTooltip(
  source: FactSource,
): 'Found in the posting' | 'Checked by your local AI' | 'Set by you' {
  switch (source) {
    case 'user':
      return 'Set by you';
    case 'llm':
      return 'Checked by your local AI';
    case 'rules':
    default:
      return 'Found in the posting';
  }
}

export const formatFactSourceTooltip = getFactSourceTooltip;

export function getFactImportance(
  key: string,
  overrides?: Record<string, FactImportance>,
): FactImportance {
  if (overrides && overrides[key]) {
    return overrides[key];
  }
  if (key in DEFAULT_FACT_IMPORTANCE) {
    return DEFAULT_FACT_IMPORTANCE[key as JobFactKey];
  }
  return 'important';
}

export function getFactStatusCopy(
  status: PracticalFitStatus,
): 'Fits' | 'Conflict' | 'Not stated' {
  switch (status) {
    case 'fits':
      return 'Fits';
    case 'conflict':
      return 'Conflict';
    case 'not-stated':
    default:
      return 'Not stated';
  }
}

export type FactKey = JobFactKey;

export const FACT_KIND_ORDER: JobFactKey[] = [
  'location',
  'workPermits',
  'languages',
  'salary',
  'employmentType',
];

export interface FactKindMetadata {
  id: JobFactKey;
  key: JobFactKey;
  kind: JobFactKey;
  label: string;
  shortLabel: string;
  icon: FactIconName;
  defaultImportance: FactImportance;
  helpText: string;
}

/**
 * Registry of Job Fact kinds.
 * Adding a new fact kind requires one descriptor module + one line in FACT_KIND_REGISTRY.
 * Every surface (Settings, JobFactsTable, FitStrip, AttentionToken) iterates this registry.
 */
export const FACT_KIND_REGISTRY: FactKindMetadata[] = [
  {
    id: 'location',
    key: 'location',
    kind: 'location',
    label: 'Location & work mode',
    shortLabel: 'Location',
    icon: 'map-pin',
    defaultImportance: 'important',
    helpText:
      'Matches remote, hybrid, or on-site work modes and office cities against your home metro.',
  },
  {
    id: 'workPermits',
    key: 'workPermits',
    kind: 'workPermits',
    label: 'Work permits & sponsorship',
    shortLabel: 'Work permit',
    icon: 'shield',
    defaultImportance: 'dealbreaker',
    helpText:
      'Flags postings that decline visa sponsorship, require citizenship, or need security clearance.',
  },
  {
    id: 'languages',
    key: 'languages',
    kind: 'languages',
    label: 'Languages',
    shortLabel: 'Language',
    icon: 'globe',
    defaultImportance: 'important',
    helpText:
      'Checks required and nice-to-have spoken languages against the languages you speak.',
  },
  {
    id: 'salary',
    key: 'salary',
    kind: 'salary',
    label: 'Salary range',
    shortLabel: 'Salary',
    icon: 'dollar-sign',
    defaultImportance: 'important',
    helpText:
      'Compares stated compensation bands against your minimum target pay.',
  },
  {
    id: 'employmentType',
    key: 'employmentType',
    kind: 'employmentType',
    label: 'Employment type',
    shortLabel: 'Employment type',
    icon: 'briefcase',
    defaultImportance: 'nice-to-know',
    helpText:
      'Checks whether the posting is full-time, contract, part-time, or an internship.',
  },
];

export interface AttentionTokenData {
  kind: 'critical-fit' | 'notable-fit' | 'coverage-gap';
  label: string;
  tone: 'danger' | 'warning' | 'muted';
  reason: string;
  tooltip: string;
}

export type RowAttentionToken = AttentionTokenData;


export interface FitStripPill {
  key: string;
  label: string;
  salience: 'critical' | 'notable';
  status: PracticalFitStatus;
  reason: string;
}

export interface FitStripSummary {
  isQuiet: boolean;
  summaryText: string;
  pills: FitStripPill[];
  overflowCount: number;
  dealbreakerCount: number;
  flagCount: number;
}

export type StageFactsDefaultMode =
  | 'table-expanded'
  | 'strip-collapsed'
  | 'quiet-line'
  | 'hidden-link';

export function getStageDefaultFactsMode(
  status: ApplicationStatus,
): StageFactsDefaultMode {
  switch (status) {
    case 'Prospect':
      return 'table-expanded';
    case 'Draft':
      return 'strip-collapsed';
    case 'Applied':
    case 'Interviewing':
    case 'Offer':
      return 'quiet-line';
    case 'Rejected':
    case 'Archived':
      return 'hidden-link';
    default:
      return 'strip-collapsed';
  }
}

/**
 * Derives the single AttentionToken for an Applications list row (Section 2.4 & 2.5):
 * At most 1 token. Priority: critical fit -> notable fit -> coverage gap.
 * Unknowns surface ONLY when notable (e.g., not-stated on a dealbreaker).
 */
export function deriveRowAttentionToken(params: {
  fit: PracticalFitEvaluation;
  mustHaveGapCount?: number;
  firstGapTerm?: string;
}): AttentionTokenData | null {
  const { fit, mustHaveGapCount = 0, firstGapTerm } = params;

  const criticalItem = fit.orderedItems.find(
    (item) => item.salience === 'critical',
  );
  if (criticalItem) {
    return {
      kind: 'critical-fit',
      label: `✕ ${criticalItem.shortLabel}`,
      tone: 'danger',
      reason: criticalItem.reason,
      tooltip: criticalItem.reason,
    };
  }

  const notableItem = fit.orderedItems.find(
    (item) => item.salience === 'notable',
  );
  if (notableItem) {
    const prefix = notableItem.status === 'conflict' ? '✕' : '!';
    const suffix = notableItem.status === 'not-stated' ? ' not stated' : '';
    return {
      kind: 'notable-fit',
      label: `${prefix} ${notableItem.shortLabel}${suffix}`,
      tone: 'warning',
      reason: notableItem.reason,
      tooltip: notableItem.reason,
    };
  }

  if (mustHaveGapCount > 0) {
    const label =
      mustHaveGapCount === 1 && firstGapTerm
        ? `Gap: ${firstGapTerm}`
        : formatCount(mustHaveGapCount, 'must-have gap');
    const reason = `${formatCount(mustHaveGapCount, 'must-have requirement')} not yet covered in your draft.`;
    return {
      kind: 'coverage-gap',
      label,
      tone: 'muted',
      reason,
      tooltip: reason,
    };
  }

  return null;
}


/**
 * Builds the one-line FitStrip summary for Applications detail (Section 2.4 & 2.6):
 * - With no salient conflicts/flags: "Fits your preferences ✓" (quiet).
 * - Otherwise: "1 dealbreaker · 1 flag" with up to 3 salient pills ("✕ Work permit") and "+n".
 */
export function buildFitStripSummary(
  orderedItems: EvaluatedFactItem[],
): FitStripSummary {
  const criticalItems = orderedItems.filter((i) => i.salience === 'critical');
  const notableItems = orderedItems.filter((i) => i.salience === 'notable');
  const salientItems = [...criticalItems, ...notableItems];

  const dealbreakerCount = criticalItems.length;
  const flagCount = notableItems.length;

  if (salientItems.length === 0) {
    return {
      isQuiet: true,
      summaryText: 'Fits your preferences ✓',
      pills: [],
      overflowCount: 0,
      dealbreakerCount: 0,
      flagCount: 0,
    };
  }

  const parts: string[] = [];
  if (dealbreakerCount > 0) {
    parts.push(formatCount(dealbreakerCount, 'dealbreaker'));
  }
  if (flagCount > 0) {
    parts.push(formatCount(flagCount, 'flag'));
  }
  const summaryText = parts.join(' · ');

  const visiblePills: FitStripPill[] = salientItems.slice(0, 3).map((item) => ({
    key: item.key,
    label: item.salientPillLabel,
    salience: item.salience === 'critical' ? 'critical' : 'notable',
    status: item.status,
    reason: item.reason,
  }));

  const overflowCount = Math.max(0, salientItems.length - 3);

  return {
    isQuiet: false,
    summaryText,
    pills: visiblePills,
    overflowCount,
    dealbreakerCount,
    flagCount,
  };
}

export interface ExtraFactSpec {
  key: string;
  label: string;
  shortLabel: string;
  icon: FactIconName;
  valueSummary: string;
  status: PracticalFitStatus;
  importance: FactImportance;
  reason: string;
  confidence?: FactConfidence;
  source?: FactSource;
  evidence?: FactEvidence[];
}

/**
 * Generates deterministic 10-fact or 15-fact scale fixtures with mixed statuses
 * (`fits`, `conflict`, `not-stated`) and importance levels (`dealbreaker`, `important`, `nice-to-know`)
 * for Workstream B Section 2.9 scale testing.
 */
export function createScaleFactExtras(totalTargetCount: 10 | 15): ExtraFactSpec[] {
  const pool: ExtraFactSpec[] = [
    {
      key: 'timezoneOverlap',
      label: 'Time zone overlap',
      shortLabel: 'Time zone',
      icon: 'clock',
      valueSummary: 'Requires 4 hrs overlap with CET',
      status: 'conflict',
      importance: 'important',
      reason: 'Posting requires CET morning overlap outside your preferred hours.',
      source: 'rules',
      evidence: [
        {
          quote: 'Must maintain at least 4 hours of daily overlap with our Zurich (CET) engineering team.',
          startOffset: 0,
          endOffset: 88,
        },
      ],
    },
    {
      key: 'onCallRotation',
      label: 'On-call rotation',
      shortLabel: 'On-call',
      icon: 'clock',
      valueSummary: '1 week in 6 (24/7 primary)',
      status: 'fits',
      importance: 'important',
      reason: 'Matches your accepted on-call frequency.',
      source: 'rules',
      evidence: [
        {
          quote: 'Participate in a healthy 1-in-6 primary on-call rotation with comp time.',
          startOffset: 0,
          endOffset: 72,
        },
      ],
    },
    {
      key: 'travelRequirement',
      label: 'Business travel',
      shortLabel: 'Travel',
      icon: 'plane',
      valueSummary: 'Up to 10% quarterly offsites',
      status: 'fits',
      importance: 'nice-to-know',
      reason: 'Within your 15% maximum travel preference.',
      source: 'rules',
    },
    {
      key: 'securityClearance',
      label: 'Security clearance',
      shortLabel: 'Clearance',
      icon: 'lock',
      valueSummary: 'None required',
      status: 'fits',
      importance: 'dealbreaker',
      reason: 'No government security clearance required.',
      source: 'rules',
    },
    {
      key: 'equityRefreshers',
      label: 'Equity & refreshers',
      shortLabel: 'Equity',
      icon: 'award',
      valueSummary: 'Annual performance RSU refreshers',
      status: 'fits',
      importance: 'nice-to-know',
      reason: 'Includes equity participation.',
      source: 'rules',
    },
    {
      key: 'relocationSupport',
      label: 'Relocation package',
      shortLabel: 'Relocation',
      icon: 'building',
      valueSummary: 'Not stated',
      status: 'not-stated',
      importance: 'nice-to-know',
      reason: 'Relocation assistance is not mentioned in the posting.',
      source: 'rules',
    },
    {
      key: 'teamTopology',
      label: 'Team size & reporting',
      shortLabel: 'Team size',
      icon: 'users',
      valueSummary: '8 engineers · reports to VP Eng',
      status: 'fits',
      importance: 'nice-to-know',
      reason: 'Matches your preferred platform team scope.',
      source: 'llm',
    },
    {
      key: 'ptoPolicy',
      label: 'Paid time off',
      shortLabel: 'PTO',
      icon: 'calendar',
      valueSummary: '25 days minimum + company shutdowns',
      status: 'fits',
      importance: 'important',
      reason: 'Meets your minimum PTO preference.',
      source: 'rules',
    },
    {
      key: 'hardwareChoice',
      label: 'Hardware & OS choice',
      shortLabel: 'Hardware',
      icon: 'laptop',
      valueSummary: 'MacBook Pro M3 Max or Linux workstation',
      status: 'fits',
      importance: 'nice-to-know',
      reason: 'Supports macOS and Linux development environments.',
      source: 'rules',
    },
    {
      key: 'educationPolicy',
      label: 'Degree requirement',
      shortLabel: 'Degree',
      icon: 'graduation-cap',
      valueSummary: 'BS in CS or equivalent practical experience',
      status: 'fits',
      importance: 'important',
      reason: 'Matches your Computer Science degree.',
      source: 'rules',
    },
  ];

  const needed = Math.max(0, totalTargetCount - 5);
  return pool.slice(0, needed);
}
