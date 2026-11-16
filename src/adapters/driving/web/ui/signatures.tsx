import {
  AlertTriangle,
  AlignJustify,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Briefcase,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  Database,
  Download,
  Eye,
  FileText,
  GitCompare,
  Link2,
  Lock,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sparkles,
  Trash2,
  Unlock,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { SidebarConnectionStatus } from '../../../../core/application';
import {
  APPLICATION_STATUS_ORDER,
  AppealLensScores,
  ApplicationStatus,
  AttentionTokenData,
  BankEvidenceItem,
  BankSnapshot,
  COUNTRY_ALIASES,
  CoverLetterBlock,
  CoverLetterBlockType,
  CoverLetterDocument,
  DocumentKind,
  DocumentVersion,
  EvaluatedFactItem,
  FACT_KIND_ORDER,
  FACT_KIND_REGISTRY,
  FactImportance,
  FactKey,
  GroupedCoverageSummary,
  JobFacts,
  KNOWN_LANGUAGES,
  METRO_AREAS,
  PageSize,
  PracticalFitEvaluation,
  PracticalFitStatus,
  QuickCheckVerdict,
  ResumeDocument,
  Skill,
  StudioStep,
  TemplateId,
  TextAlign,
  UserPreferences,
  VoiceLevel,
  findInlineCliches,
  findMetroAreaEntry,
  formatCount,
  getMachineMadeFeelLevel,
  getRecruiterQuestionTemplate,
  mapToCoverLetterDocument,
  mapToResumeDocument,
} from '../../../../core/domain';
import {
  PageThumbnail,
  PdfPreview,
  PdfPreviewArtifactInfo,
  PdfThumbnail,
  PreviewOverlay,
  SAMPLE_THUMBNAIL_RESUME,
} from './pdfPreview';
import {
  AutoGrowTextarea,
  Avatar,
  Badge,
  Button,
  CevinLogo,
  CevinMark,
  CevinStatusIndicator,
  Checkbox,
  CopyCommandField,
  DeltaChip,
  Dialog,
  DialogContent,
  IconButton,
  InfoTip,
  Input,
  Logo,
  MultiSelectChips,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Select,
  StatTile,
  Switch,
  Tooltip,
  TypeaheadField,
  cn,
} from './primitives';

export {
  CevinLogo,
  CevinMark,
  CevinStatusIndicator,
  PageThumbnail,
  PdfPreview,
  PdfThumbnail,
  PreviewOverlay,
  SAMPLE_THUMBNAIL_RESUME,
};
export type { PdfPreviewArtifactInfo };

/**
 * 24px warm assistant monogram mark ("C") used on Cevin status messages,
 * the Getting Started card, and the Review verdict band.
 */
export function CevinAvatar({
  size = 'sm',
  pulsing = false,
  className,
}: {
  size?: 'xs' | 'sm' | 'md';
  pulsing?: boolean;
  className?: string;
}) {
  return (
    <CevinMark
      state={pulsing ? 'writing' : 'idle'}
      size={size === 'xs' ? 16 : 24}
      variant="tile"
      className={className}
    />
  );
}

/**
 * 136px Radial Gauge (3/4 arc) with 10px stroke, gradient fill, tabular Fraunces numeral,
 * and 700ms ease-out sweep on mount (or instant under prefers-reduced-motion).
 */
export function Gauge({
  score,
  label,
  subtitle,
  tooltipText,
  size = 'lg',
  displayValue,
  delta,
  referenceVersionLabel,
}: {
  score: number;
  label: string;
  subtitle?: string;
  tooltipText?: string;
  size?: 'sm' | 'md' | 'lg';
  displayValue?: string;
  delta?: number;
  referenceVersionLabel?: string;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  // 270-degree (3/4) arc
  const arcLength = circumference * 0.75;
  const dashOffset = arcLength - (clamped / 100) * arcLength;

  const gradId = `gauge-grad-${label.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase()}`;
  const isHigh = clamped >= 85;
  const isMid = clamped >= 65 && clamped < 85;

  const sizeClass =
    size === 'sm'
      ? 'w-24 h-24'
      : size === 'md'
        ? 'w-28 h-28'
        : 'w-[136px] h-[136px]';

  const numberClass =
    size === 'sm'
      ? 'text-2xl'
      : size === 'md'
        ? 'text-3xl'
        : 'text-[40px] leading-none';

  return (
    <div className="flex flex-col items-center text-center">
      <div className={cn('relative flex items-center justify-center', sizeClass)}>
        <svg
          viewBox="0 0 128 128"
          className="w-full h-full overflow-visible"
          aria-label={`${label}: ${displayValue ?? clamped}`}
        >
          <defs>
            <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop
                offset="0%"
                stopColor={isHigh ? '#2448C8' : isMid ? '#2448C8' : '#9A5206'}
              />
              <stop
                offset="100%"
                stopColor={isHigh ? '#166E45' : isMid ? '#688BFF' : '#F5A524'}
              />
            </linearGradient>
          </defs>
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            transform="rotate(135 64 64)"
            className="stroke-surface-sunken"
          />
          <circle
            cx="64"
            cy="64"
            r={radius}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={`${arcLength} ${circumference}`}
            strokeDashoffset={mounted ? dashOffset : arcLength}
            transform="rotate(135 64 64)"
            className="transition-all duration-700 ease-out motion-reduce:transition-none"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-1">
          <span
            className={cn(
              'font-display font-bold tabular-nums tracking-tight text-ink',
              numberClass,
            )}
          >
            {displayValue ?? clamped}
          </span>
        </div>
      </div>
      <div className="mt-1 space-y-1 flex flex-col items-center">
        <div className="inline-flex items-center gap-1 text-xs font-semibold text-ink">
          <span>{label}</span>
          {tooltipText && <InfoTip text={tooltipText} />}
        </div>
        {subtitle && (
          <div className="text-xs text-ink-muted">{subtitle}</div>
        )}
        {delta !== undefined && Math.round(delta) !== 0 && (
          <DeltaChip delta={delta} referenceLabel={referenceVersionLabel} />
        )}
      </div>
    </div>
  );
}

export const ScoreGauge = Gauge;

/**
 * 36px (>= 32px) radial mini-ring for Application list rows.
 * Digits never clip even for 3-digit values.
 */
export function ScoreRing({
  score,
  label = 'Job match',
}: {
  score: number;
  label?: string;
}) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const r = 14.5;
  const c = 2 * Math.PI * r;
  const offset = c - (clamped / 100) * c;
  const strokeClass =
    clamped >= 80
      ? 'stroke-success'
      : clamped >= 65
        ? 'stroke-accent'
        : 'stroke-warning';

  return (
    <Tooltip content={`${label}: ${clamped}/100`}>
      <div
        aria-label={`${label}: ${clamped}`}
        className="relative w-9 h-9 inline-flex items-center justify-center shrink-0"
      >
        <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            strokeWidth="2.75"
            className="stroke-surface-sunken"
          />
          <circle
            cx="18"
            cy="18"
            r={r}
            fill="none"
            strokeWidth="2.75"
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={offset}
            className={strokeClass}
          />
        </svg>
        <span className="absolute text-[11px] font-sans font-bold tabular-nums text-ink leading-none">
          {clamped}
        </span>
      </div>
    </Tooltip>
  );
}

/**
 * Computes a 5-point band ("85–90") capped at 95 for Quick check and Prospect applications.
 * Never shows "100".
 */
export function formatQuickEstimateBand(score: number): string {
  const capped = Math.max(25, Math.min(93, Math.round(score)));
  const low = Math.min(90, Math.floor(capped / 5) * 5);
  const high = Math.min(95, low + 5);
  return `${low}–${high}`;
}

/**
 * EstimateRing: Dashed ring and "Est." label with a 5-point band ("85–90", capped at 95)
 * for Prospects and Quick check. Visually distinct from a real tailored score.
 */
export function EstimateRing({
  score,
  size = 'sm',
}: {
  score: number;
  size?: 'sm' | 'md';
}) {
  const capped = Math.max(25, Math.min(95, Math.round(score)));
  const band = formatQuickEstimateBand(capped);
  const strokeClass =
    capped >= 80
      ? 'stroke-success'
      : capped >= 65
        ? 'stroke-accent'
        : 'stroke-warning';

  if (size === 'md') {
    const r = 18;
    return (
      <Tooltip content={`Quick match estimate: ${band} (un-tailored Bank coverage, capped at 95)`}>
        <div
          aria-label={`Quick match estimate: ${band}`}
          className="inline-flex items-center gap-2.5 bg-surface border border-border rounded-lg px-3 py-1.5 shadow-xs"
        >
          <div className="relative w-11 h-11 inline-flex items-center justify-center shrink-0">
            <svg viewBox="0 0 44 44" className="w-11 h-11 -rotate-90">
              <circle
                cx="22"
                cy="22"
                r={r}
                fill="none"
                strokeWidth="2.75"
                strokeDasharray="3 2.5"
                className={strokeClass}
              />
            </svg>
            <span className="absolute text-[10px] font-sans font-bold uppercase tracking-wider text-ink-muted">
              Est.
            </span>
          </div>
          <div className="text-left">
            <div className="text-xs text-ink-muted font-medium">Quick estimate</div>
            <div className="text-base font-display font-bold tabular-nums text-ink leading-tight">
              {band}
            </div>
          </div>
        </div>
      </Tooltip>
    );
  }

  const r = 14.5;
  return (
    <Tooltip content={`Quick match estimate: ${band} (un-tailored Bank coverage)`}>
      <div
        aria-label={`Quick estimate: ${band}`}
        className="inline-flex flex-col items-center shrink-0"
      >
        <div className="relative w-9 h-9 inline-flex items-center justify-center">
          <svg viewBox="0 0 36 36" className="w-9 h-9 -rotate-90">
            <circle
              cx="18"
              cy="18"
              r={r}
              fill="none"
              strokeWidth="2.5"
              strokeDasharray="3 2.5"
              className={strokeClass}
            />
          </svg>
          <span className="absolute text-[9px] font-sans font-bold tabular-nums text-ink tracking-tighter leading-none">
            {band}
          </span>
        </div>
        <span className="text-[9px] font-medium uppercase tracking-wider text-ink-subtle leading-none mt-0.5">
          Est.
        </span>
      </div>
    </Tooltip>
  );
}

/**
 * Unified ScoreChip spec used everywhere (Studio Header, VersionCards, Detail headers).
 * Supports numeric scores (0-100) or explicit fractional displayValue (e.g. "6/6" for Checks).
 */
export function ScoreChip({
  label,
  score,
  fraction,
  isEstimate,
  displayValue,
  suffix,
  tooltip,
  tooltipText,
  onClick,
}: {
  label: string;
  score?: number;
  fraction?: { passed: number; total: number };
  isEstimate?: boolean;
  displayValue?: string;
  suffix?: string;
  tooltip?: string;
  tooltipText?: string;
  onClick?: () => void;
}) {
  const numericScore =
    score ??
    (fraction && fraction.total > 0
      ? Math.round((fraction.passed / fraction.total) * 100)
      : 100);
  const effectiveDisplayValue =
    displayValue ??
    (fraction ? `${fraction.passed}/${fraction.total}` : undefined);
  const effectiveTooltip =
    tooltip ??
    tooltipText ??
    (isEstimate
      ? 'An estimate based on common screening patterns. It does not predict hiring outcomes.'
      : undefined);

  const rounded = Math.max(0, Math.min(100, Math.round(numericScore)));
  const r = 8.5;
  const c = 2 * Math.PI * r;
  const offset = c - (rounded / 100) * c;

  const strokeClass =
    rounded >= 80
      ? 'stroke-success'
      : rounded >= 65
        ? 'stroke-accent'
        : 'stroke-warning';

  const toneClass =
    rounded >= 80
      ? 'text-success-700'
      : rounded >= 65
        ? 'text-accent-700'
        : 'text-warning-700';

  const inner = (
    <>
      <svg
        width="22"
        height="22"
        viewBox="0 0 22 22"
        aria-hidden="true"
        className="-rotate-90 shrink-0"
      >
        <circle
          cx="11"
          cy="11"
          r={r}
          fill="none"
          strokeWidth="2.25"
          className="stroke-surface-sunken"
        />
        <circle
          cx="11"
          cy="11"
          r={r}
          fill="none"
          strokeWidth="2.25"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className={strokeClass}
        />
      </svg>
      <span className="text-ink-muted font-medium">{label}</span>
      <span className={cn('font-bold tabular-nums', toneClass)}>
        {effectiveDisplayValue ?? `${rounded}${suffix || ''}`}
      </span>
    </>
  );

  const chipElement = onClick ? (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-xs font-sans bg-surface border border-border hover:bg-surface-raised px-2.5 py-1 rounded-full shadow-xs transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
    >
      {inner}
    </button>
  ) : (
    <span className="inline-flex items-center gap-1.5 text-xs font-sans bg-surface border border-hairline px-2.5 py-0.5 rounded-full whitespace-nowrap shrink-0">
      {inner}
    </span>
  );

  if (effectiveTooltip) {
    return <Tooltip content={effectiveTooltip}>{chipElement}</Tooltip>;
  }
  return chipElement;
}

/**
 * Three-Score Hero Band for the Studio Review step:
 * Three 136px radial gauges in a row (Job match, Recruiter appeal / Letter appeal, ATS readiness / Checks n/6)
 * with captions beneath each, and the Fraunces 24 verdict + weakest-score explanation placed below the gauges.
 * DeltaChips are shown only when non-zero.
 */
export function HeroScoreBand({
  jobMatch,
  appeal: appealProp,
  recruiterAppeal,
  letterAppeal,
  atsReadiness,
  documentKind = 'resume',
  checksPassedCount,
  checksTotalCount,
  jobMatchDelta,
  appealDelta,
  atsDelta,
  referenceVersionLabel = 'v1',
  verdictTitle,
  verdictSummary,
  lensFix,
}: {
  jobMatch: number;
  appeal?: number;
  recruiterAppeal?: number;
  letterAppeal?: number;
  atsReadiness: number;
  documentKind?: DocumentKind;
  checksPassedCount?: number;
  checksTotalCount?: number;
  jobMatchDelta?: number;
  appealDelta?: number;
  atsDelta?: number;
  referenceVersionLabel?: string;
  verdictTitle?: string;
  verdictSummary?: string;
  lensFix?: { title: string; onApply: () => void };
}) {
  const appeal =
    documentKind === 'coverLetter'
      ? (letterAppeal ?? appealProp ?? recruiterAppeal ?? 82)
      : (recruiterAppeal ?? appealProp ?? letterAppeal ?? 82);
  const checksPercent =
    checksTotalCount && checksTotalCount > 0
      ? Math.round(((checksPassedCount ?? 0) / checksTotalCount) * 100)
      : 100;

  const thirdScoreNumeric =
    documentKind === 'coverLetter' ? checksPercent : atsReadiness;
  const thirdScoreLabel =
    documentKind === 'coverLetter' ? 'Quality checks' : 'ATS readiness';
  const appealLabel =
    documentKind === 'coverLetter'
      ? 'Letter appeal (estimate)'
      : 'Recruiter appeal (estimate)';

  const combinedAvg = Math.round(
    (jobMatch + appeal + thirdScoreNumeric) / 3,
  );

  const triples = [
    { name: 'Job match', val: jobMatch },
    {
      name:
        documentKind === 'coverLetter' ? 'Letter appeal' : 'Recruiter appeal',
      val: appeal,
    },
    { name: thirdScoreLabel, val: thirdScoreNumeric },
  ];
  const weakest = [...triples].sort((a, b) => a.val - b.val)[0];

  const defaultVerdict =
    combinedAvg >= 85
      ? 'Strong across all three checks — ready to export'
      : combinedAvg >= 72
        ? 'Solid draft — a few targeted refinements available'
        : 'Needs a quick pass before exporting';

  const defaultSummary =
    documentKind === 'coverLetter'
      ? `${weakest.name} (${weakest.val}/100) is currently the lowest of the three; your letter passes ${checksPassedCount ?? 6}/${checksTotalCount ?? 6} quality checks with grounded Bank proof.`
      : `${weakest.name} (${weakest.val}/100) is the lowest of the three scores — review the top fixes below to strengthen it.`;

  return (
    <div className="bg-surface border border-border rounded-xl p-6 shadow-md space-y-5">
      {/* Three 136px radial gauges in a row with per-gauge DeltaChip directly beneath each */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-start justify-items-center">
        <Gauge
          score={jobMatch}
          label="Job match (estimate)"
          subtitle="Fit for the role"
          tooltipText="Estimated requirement coverage and title alignment against this job posting."
          size="lg"
          delta={jobMatchDelta}
          referenceVersionLabel={referenceVersionLabel}
        />
        <Gauge
          score={appeal}
          label={appealLabel}
          subtitle="10-second skim"
          tooltipText="An estimate based on common recruiter screening patterns. It does not predict hiring outcomes."
          size="lg"
          delta={appealDelta}
          referenceVersionLabel={referenceVersionLabel}
        />
        {documentKind === 'coverLetter' ? (
          <Gauge
            score={checksPercent}
            displayValue={`${checksPassedCount ?? 6}/${checksTotalCount ?? 6}`}
            label="Checks"
            subtitle="Quality checks"
            tooltipText="Deterministic checks for length, proof grounding, opening hook, and company specificity."
            size="lg"
          />
        ) : (
          <Gauge
            score={atsReadiness}
            label="ATS readiness (estimate)"
            subtitle="Machine read"
            tooltipText="Estimated single-column parseability, section headings, contact fields, and date consistency."
            size="lg"
            delta={atsDelta}
            referenceVersionLabel={referenceVersionLabel}
          />
        )}
      </div>

      {/* Verdict spans the full width below the three gauges */}
      <div className="border-t border-hairline pt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-1.5 flex-1 min-w-[240px]">
          <div className="inline-flex items-center gap-2">
            <CevinAvatar size="sm" />
            <span className="text-xs font-semibold uppercase tracking-wider text-accent-700">
              Cevin’s assessment
            </span>
          </div>
          <h3 className="text-2xl font-display font-semibold text-ink tracking-tight">
            {verdictTitle ?? defaultVerdict}
          </h3>
          <p className="text-sm text-ink-muted leading-relaxed">
            {verdictSummary ?? defaultSummary}
          </p>
        </div>
        {lensFix && (
          <div className="shrink-0 pt-1">
            <Button
              variant="secondary"
              size="sm"
              onClick={lensFix.onApply}
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>{lensFix.title}</span>
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}

export const ThreeScoreHeroBand = HeroScoreBand;

/**
 * LensBars: 4 rows (Skim, Proof, Clarity, Voice) for Recruiter appeal breakdown,
 * each showing label, progress bar, tabular score, and weakest sub-check hint.
 */
export function LensBars({
  lenses,
  weakestHints,
  onApplyLensFix,
  lensFixLabels,
}: {
  lenses: AppealLensScores;
  weakestHints?: {
    skim: string;
    proof: string;
    clarity: string;
    voice: string;
  };
  onApplyLensFix?: (lens: 'skim' | 'proof' | 'clarity' | 'voice') => void;
  lensFixLabels?: Partial<Record<'skim' | 'proof' | 'clarity' | 'voice', string>>;
}) {
  const hints = weakestHints ??
    lenses.weakestHints ??
    lenses.weakestSubcheckByLens ?? {
      skim: 'Role headline and top-third metrics',
      proof: 'Quantified outcome bullets',
      clarity: 'Crisp bullet length and balanced density',
      voice: 'Specific phrasing with varied verbs',
    };
  const rows: Array<{
    id: 'skim' | 'proof' | 'clarity' | 'voice';
    label: string;
    weightTooltip: string;
    score: number;
    hint: string;
    defaultFixLabel: string;
  }> = [
    {
      id: 'skim',
      label: 'Skim',
      weightTooltip: '35% of Recruiter appeal',
      score: lenses.skim,
      hint: hints.skim,
      defaultFixLabel: 'Tighten summary',
    },
    {
      id: 'proof',
      label: 'Proof',
      weightTooltip: '30% of Recruiter appeal',
      score: lenses.proof,
      hint: hints.proof,
      defaultFixLabel: 'Promote strongest bullet',
    },
    {
      id: 'clarity',
      label: 'Clarity',
      weightTooltip: '20% of Recruiter appeal',
      score: lenses.clarity,
      hint: hints.clarity,
      defaultFixLabel: 'Trim long bullets',
    },
    {
      id: 'voice',
      label: 'Voice',
      weightTooltip: '15% of Recruiter appeal',
      score: lenses.voice,
      hint: hints.voice,
      defaultFixLabel: 'Switch to Natural voice',
    },
  ];

  const widthLookup: Record<number, string> = {
    0: 'w-0',
    10: 'w-1/12',
    20: 'w-2/12',
    25: 'w-3/12',
    35: 'w-4/12',
    45: 'w-5/12',
    50: 'w-6/12',
    60: 'w-7/12',
    70: 'w-8/12',
    75: 'w-9/12',
    85: 'w-10/12',
    92: 'w-11/12',
    100: 'w-full',
  };

  const getBarWidthClass = (val: number) => {
    const keys = Object.keys(widthLookup).map(Number);
    let best = 100;
    let minDiff = Infinity;
    for (const k of keys) {
      const d = Math.abs(val - k);
      if (d < minDiff) {
        minDiff = d;
        best = k;
      }
    }
    return widthLookup[best] ?? 'w-9/12';
  };

  return (
    <div className="space-y-3" aria-label="Recruiter appeal lenses">
      {rows.map((row) => {
        const barTone =
          row.score >= 82
            ? 'bg-success'
            : row.score >= 65
              ? 'bg-accent'
              : 'bg-warning';
        const fixLabel = lensFixLabels?.[row.id] ?? row.defaultFixLabel;
        return (
          <div key={row.id} className="space-y-1">
            <div className="flex items-center justify-between gap-2 text-xs">
              <Tooltip content={row.weightTooltip}>
                <span className="font-semibold text-ink cursor-help">
                  {row.label}
                </span>
              </Tooltip>
              <div className="inline-flex items-center gap-2">
                {row.score < 80 && onApplyLensFix && (
                  <button
                    type="button"
                    onClick={() => onApplyLensFix(row.id)}
                    className="text-[11px] font-semibold text-accent hover:underline cursor-pointer"
                  >
                    {fixLabel}
                  </button>
                )}
                <span className="font-sans font-bold tabular-nums text-ink">
                  {row.score}
                </span>
              </div>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-sunken border border-hairline overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  barTone,
                  getBarWidthClass(row.score),
                )}
              />
            </div>
            <p className="text-xs text-ink-muted">{row.hint}</p>
          </div>
        );
      })}
    </div>
  );
}

/**
 * First-impression takeaway card showing what a 10-second skim picks up from the top of Page 1.
 */
export function TakeawayCard({
  takeawayText,
  takeaway,
  roleAligned,
  targetRoleMatches,
}: {
  takeawayText?: string;
  takeaway?: string;
  roleAligned?: boolean;
  targetRoleMatches?: boolean;
  layoutMode?: 'measured' | 'estimated';
  layoutEstimated?: boolean;
}) {
  const effectiveText = takeawayText ?? takeaway ?? '';
  const effectiveRoleAligned = roleAligned ?? targetRoleMatches ?? true;

  return (
    <div className="bg-surface-sunken border border-border rounded-lg p-4 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center gap-2">
          <Eye className="w-4 h-4 text-accent shrink-0" />
          <span className="text-xs font-semibold text-ink">
            First-impression takeaway
          </span>
        </div>
        <div className="inline-flex items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full border',
              effectiveRoleAligned
                ? 'bg-success-50 text-success-700 border-success/30'
                : 'bg-warning-50 text-warning-700 border-warning/35',
            )}
          >
            <span aria-hidden="true">{effectiveRoleAligned ? '✓' : '!'}</span>
            <span>
              {effectiveRoleAligned
                ? 'Matches target role'
                : 'Headline differs from target role'}
            </span>
          </span>
        </div>
      </div>

      <p className="text-sm font-medium text-ink font-sans leading-relaxed">
        {effectiveText}
      </p>
      <p className="text-xs text-ink-muted">
        Extracted from the top third of Page 1 (role, company, dates, visible skills, and strongest metric).
      </p>
    </div>
  );
}

export function SkimToggle({
  active,
  onToggle,
}: {
  active: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={() => onToggle(!active)}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        active
          ? 'bg-accent text-white shadow-xs'
          : 'text-ink hover:bg-surface-sunken',
      )}
    >
      <Eye className="w-3.5 h-3.5" />
      <span>Skim view</span>
    </button>
  );
}

export function SkimLegend({
  highlightedTerm,
  onClearHighlight,
}: {
  highlightedTerm?: string | null;
  onClearHighlight?: () => void;
}) {
  return (
    <div className="w-full max-w-[760px] bg-surface border border-border rounded-lg px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-ink-muted shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <Eye className="w-3.5 h-3.5 text-accent shrink-0" />
        <span className="font-semibold text-ink">Skim view active:</span>
        <span>
          Name, titles, dates, lead words, metrics, and must-have skills stay sharp.
        </span>
      </div>
      <div className="flex items-center gap-3">
        {highlightedTerm && onClearHighlight && (
          <button
            type="button"
            onClick={onClearHighlight}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-warning-50 text-warning-700 border border-warning/30 font-semibold cursor-pointer"
          >
            <span>Highlighting “{highlightedTerm}”</span>
            <X className="w-3 h-3" />
          </button>
        )}
        <span className="text-ink-subtle italic">
          Simulated skim, not eye-tracking.
        </span>
      </div>
    </div>
  );
}

const STATUS_DOT_TONES: Record<ApplicationStatus, string> = {
  Prospect: 'bg-accent',
  Draft: 'bg-ink-subtle',
  Applied: 'bg-info',
  Interviewing: 'bg-accent',
  Offer: 'bg-success',
  Rejected: 'bg-danger',
  Archived: 'bg-border-strong',
};

const STATUS_PILL_TONES: Record<ApplicationStatus, string> = {
  Prospect: 'bg-accent-50 text-accent-700 border-accent/25 border-dashed',
  Draft: 'bg-surface-sunken text-ink-muted border-hairline',
  Applied: 'bg-info-50 text-info-700 border-info/25',
  Interviewing: 'bg-accent-50 text-accent-700 border-accent/25',
  Offer: 'bg-success-50 text-success-700 border-success/25',
  Rejected: 'bg-danger-50 text-danger-700 border-danger/25',
  Archived: 'bg-surface-sunken text-ink-subtle border-hairline',
};

export function StatusBadge({ status }: { status: ApplicationStatus }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border whitespace-nowrap shrink-0',
        STATUS_PILL_TONES[status],
      )}
    >
      <span
        aria-hidden="true"
        className={cn('w-1.5 h-1.5 rounded-full shrink-0', STATUS_DOT_TONES[status])}
      />
      <span>{status}</span>
    </span>
  );
}

export function ProspectBadge() {
  return <StatusBadge status="Prospect" />;
}

/**
 * Interactive StatusPill dropdown for changing an application's status without a native HTML select element.
 */
export function StatusPill({
  status,
  onChange,
}: {
  status: ApplicationStatus;
  onChange: (next: ApplicationStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const statuses: ApplicationStatus[] = [...APPLICATION_STATUS_ORDER];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Application status: ${status}`}
          className={cn(
            'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            STATUS_PILL_TONES[status],
          )}
        >
          <span
            aria-hidden="true"
            className={cn('w-2 h-2 rounded-full', STATUS_DOT_TONES[status])}
          />
          <span>{status}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-44 p-1">
        <div role="menu" aria-label="Change application status">
          {statuses.map((s) => (
            <button
              key={s}
              type="button"
              role="menuitem"
              onClick={() => {
                onChange(s);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-sm text-xs text-left transition-colors cursor-pointer',
                s === status
                  ? 'bg-accent-50 text-accent-700 font-semibold'
                  : 'text-ink hover:bg-surface-raised',
              )}
            >
              <span className="inline-flex items-center gap-2">
                <span
                  aria-hidden="true"
                  className={cn('w-2 h-2 rounded-full', STATUS_DOT_TONES[s])}
                />
                <span>{s}</span>
              </span>
              {s === status && <Check className="w-3.5 h-3.5" />}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Consistent PageHeader for Applications, Experience Bank, and Settings.
 */
export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-border">
      <div>
        <h1 className="text-2xl font-display font-semibold text-ink tracking-tight">
          {title}
        </h1>
        {subtitle && (
          <p className="text-sm text-ink-muted mt-1">{subtitle}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2.5">{actions}</div>}
    </header>
  );
}

/**
 * Dark Ink Sidebar navigation (232px expanded, 72px collapsed) with sticky full-viewport height
 * so Quick actions (⌘K), StatusPill, and collapse/expand never scroll out of view.
 * In Studio below 1700px, expanding opens an overlay (shadow-lg) without pushing layout.
 */
export function SidebarNav({
  activeSection,
  collapsed,
  overlayExpanded = false,
  onToggleCollapsed,
  onCloseOverlay,
  onNavigate,
  onNewApplication,
  onOpenCommandPalette,
  connectionStatus,
  activityState,
}: {
  activeSection: 'applications' | 'bank' | 'settings' | 'design-system';
  collapsed: boolean;
  overlayExpanded?: boolean;
  onToggleCollapsed: () => void;
  onCloseOverlay?: () => void;
  onNavigate: (path: string) => void;
  onNewApplication: () => void;
  onOpenCommandPalette: () => void;
  connectionStatus: SidebarConnectionStatus;
  activityState?: {
    visible: boolean;
    visualState: 'idle' | 'thinking' | 'writing' | 'done' | 'error';
    label: string;
    announcement: string;
    progress?: number;
    handleThinkingLoopIteration?: () => void;
  };
}) {
  const navItems = [
    {
      id: 'applications' as const,
      label: 'Applications',
      path: '/applications',
      icon: Briefcase,
    },
    {
      id: 'bank' as const,
      label: 'Experience Bank',
      path: '/bank',
      icon: Database,
    },
    {
      id: 'settings' as const,
      label: 'Settings',
      path: '/settings',
      icon: Settings,
    },
  ];

  const hasLiveActivity = Boolean(activityState?.visible);
  const isWarmingOrBusy =
    hasLiveActivity ||
    connectionStatus.state === 'busy' ||
    connectionStatus.state === 'warming';

  const effectiveMarkState: 'idle' | 'thinking' | 'writing' | 'done' | 'error' =
    hasLiveActivity && activityState
      ? activityState.visualState
      : connectionStatus.state === 'warming'
        ? 'thinking'
        : connectionStatus.state === 'busy'
          ? 'writing'
          : connectionStatus.state === 'offline'
            ? 'error'
            : 'idle';

  const statusDotClass =
    connectionStatus.state === 'connected'
      ? 'bg-emerald-400'
      : isWarmingOrBusy
        ? 'bg-sky-400'
        : connectionStatus.state === 'demo'
          ? 'bg-sky-400'
          : 'bg-amber-400';

  const displayStatusLabel =
    hasLiveActivity && activityState?.label
      ? activityState.label
      : connectionStatus.state === 'warming'
        ? 'Cevin is warming up'
        : connectionStatus.state === 'busy'
          ? 'Cevin is writing'
          : connectionStatus.label;

  const isExpandedView = !collapsed || overlayExpanded;

  const renderAsideContent = (expanded: boolean) => (
    <aside
      aria-label="Primary navigation"
      className={cn(
        'shrink-0 bg-sidebar text-ink-100 border-r border-ink-800 flex flex-col py-4 transition-all duration-180 select-none min-h-[680px] overflow-y-auto overflow-x-hidden',
        overlayExpanded && expanded
          ? 'fixed left-0 top-0 h-screen w-sidebar px-3.5 z-40 shadow-lg'
          : expanded
            ? 'sticky top-0 h-screen w-sidebar px-3.5 z-20'
            : 'sticky top-0 h-screen w-rail px-2.5 z-20',
      )}
    >
      <div className="space-y-5">
        {/* Brand mark & collapse button */}
        <div
          className={cn(
            'flex items-center',
            !expanded ? 'justify-center' : 'justify-between px-1',
          )}
        >
          <button
            type="button"
            onClick={() => {
              onCloseOverlay?.();
              onNavigate('/applications');
            }}
            aria-label="Cevin home"
            className="inline-flex items-center gap-2.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-md cursor-pointer"
          >
            {expanded ? (
              <Logo variant="lockup" tone="ink" fontSize={24} size={26} />
            ) : (
              <div className="w-full flex items-center justify-center">
                <Logo variant="mark" tone="ink" size={28} />
              </div>
            )}
          </button>
          {expanded && (
            <IconButton
              label="Collapse sidebar"
              variant="ink"
              size="sm"
              onClick={() => {
                if (overlayExpanded && onCloseOverlay) {
                  onCloseOverlay();
                } else {
                  onToggleCollapsed();
                }
              }}
            >
              <ChevronLeft className="w-4 h-4" />
            </IconButton>
          )}
        </div>

        {/* + New application tonal dark button */}
        <div>
          {!expanded ? (
            <Tooltip content="New application (⌘N)">
              <button
                type="button"
                aria-label="New application"
                onClick={onNewApplication}
                className="w-full h-10 rounded-md bg-ink-800 hover:bg-ink-700 border border-ink-700 text-ink-100 flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              >
                <Plus className="w-4 h-4" />
              </button>
            </Tooltip>
          ) : (
            <button
              type="button"
              onClick={() => {
                onCloseOverlay?.();
                onNewApplication();
              }}
              className="w-full h-10 px-3 rounded-md bg-ink-800 hover:bg-ink-700 border border-ink-700 text-ink-100 text-sm font-medium flex items-center gap-2.5 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <Plus className="w-4 h-4 text-ink-400" />
              <span>New application</span>
            </button>
          )}
        </div>

        {/* 3 primary destinations */}
        <nav aria-label="Main sections" className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            const btn = (
              <button
                key={item.id}
                type="button"
                aria-label={item.label}
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  onCloseOverlay?.();
                  onNavigate(item.path);
                }}
                className={cn(
                  'w-full flex items-center gap-3 h-10 rounded-md text-sm font-medium transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                  !expanded ? 'justify-center px-0' : 'px-3',
                  active
                    ? 'bg-ink-800 text-white font-semibold border-l-[3px] border-l-accent'
                    : 'text-ink-100 hover:text-white hover:bg-ink-900',
                )}
              >
                <Icon
                  className={cn(
                    'w-4 h-4 shrink-0',
                    active ? 'text-sky-300' : 'text-ink-400',
                  )}
                />
                {expanded && <span className="truncate">{item.label}</span>}
              </button>
            );

            return !expanded ? (
              <Tooltip key={item.id} content={item.label}>
                {btn}
              </Tooltip>
            ) : (
              btn
            );
          })}
        </nav>
      </div>

      {/* Pinned bottom footer: Quick actions (⌘K), StatusPill, and Collapse/Expand chevron */}
      <div className="mt-auto shrink-0 pt-4 border-t border-ink-800 space-y-2">
        {expanded ? (
          <button
            type="button"
            onClick={() => {
              onCloseOverlay?.();
              onOpenCommandPalette();
            }}
            className="w-full flex items-center justify-between px-2.5 py-2 rounded-md text-xs text-ink-100 hover:text-white hover:bg-ink-900 transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              <Search className="w-3.5 h-3.5 text-ink-400" />
              <span>Quick actions</span>
            </span>
            <span className="text-ink-400 font-sans px-1.5 py-0.5 rounded-xs bg-ink-900 border border-ink-800">
              ⌘K
            </span>
          </button>
        ) : (
          <Tooltip content="Quick actions (⌘K)">
            <button
              type="button"
              aria-label="Quick actions"
              onClick={onOpenCommandPalette}
              className="w-full h-9 rounded-md flex items-center justify-center text-ink-400 hover:text-white hover:bg-ink-900 transition-colors cursor-pointer"
            >
              <Search className="w-4 h-4" />
            </button>
          </Tooltip>
        )}

        {!expanded ? (
          <div className="flex flex-col items-center gap-2">
            <Tooltip
              content={
                connectionStatus.modelName &&
                connectionStatus.state !== 'offline'
                  ? `${displayStatusLabel} (${connectionStatus.modelName}) — Click to open Settings`
                  : `${displayStatusLabel} — Click to open Settings`
              }
            >
              <button
                type="button"
                aria-label={`Connection status: ${displayStatusLabel}`}
                onClick={() => onNavigate('/settings')}
                className="w-9 h-9 rounded-md flex items-center justify-center bg-ink-900 border border-ink-800 hover:bg-ink-800 transition-colors cursor-pointer"
              >
                {isWarmingOrBusy ? (
                  <CevinMark
                    state={effectiveMarkState}
                    size={16}
                    variant="glyph"
                    progress={activityState?.progress}
                    onThinkingLoopIteration={
                      activityState?.handleThinkingLoopIteration
                    }
                    className="text-ink-100"
                  />
                ) : (
                  <span
                    className={cn('w-2.5 h-2.5 rounded-full', statusDotClass)}
                  />
                )}
              </button>
            </Tooltip>
            <Tooltip content="Expand sidebar">
              <IconButton
                label="Expand sidebar"
                variant="ink"
                size="sm"
                onClick={onToggleCollapsed}
              >
                <ChevronRight className="w-4 h-4" />
              </IconButton>
            </Tooltip>
          </div>
        ) : (
          <div
            title={connectionStatus.detail}
            className="flex items-center justify-between gap-2 px-2.5 py-2 rounded-md bg-ink-900 border border-ink-800"
          >
            <button
              type="button"
              onClick={() => {
                onCloseOverlay?.();
                onNavigate('/settings');
              }}
              className="flex items-center gap-2 min-w-0 text-left cursor-pointer focus-visible:outline-none"
            >
              {isWarmingOrBusy ? (
                <CevinMark
                  state={effectiveMarkState}
                  size={16}
                  variant="glyph"
                  progress={activityState?.progress}
                  onThinkingLoopIteration={
                    activityState?.handleThinkingLoopIteration
                  }
                  className="text-ink-100"
                />
              ) : (
                <span
                  aria-hidden="true"
                  className={cn('w-2 h-2 rounded-full shrink-0', statusDotClass)}
                />
              )}
              <span
                role="status"
                aria-live="polite"
                className="text-xs font-medium text-ink-100 truncate"
              >
                {displayStatusLabel}
              </span>
            </button>
            {(connectionStatus.state === 'offline' ||
              connectionStatus.state === 'partly-on-cpu') && (
              <button
                type="button"
                onClick={() => {
                  onCloseOverlay?.();
                  onNavigate('/settings');
                }}
                className="text-xs font-semibold text-sky-300 hover:underline shrink-0 cursor-pointer"
              >
                Fix
              </button>
            )}
          </div>
        )}
      </div>
    </aside>
  );

  if (overlayExpanded) {
    return (
      <>
        {/* Keep 72px rail placeholder in layout flow so Studio never shifts */}
        {renderAsideContent(false)}
        <div
          aria-hidden="true"
          onClick={onCloseOverlay}
          className="fixed inset-0 bg-ink-950/35 z-30"
        />
        {renderAsideContent(true)}
      </>
    );
  }

  return renderAsideContent(isExpandedView);
}

/**
 * DocumentSwitch (`Resume | Cover letter`) for the Studio header.
 */
export function DocumentSwitch({
  value,
  onChange,
}: {
  value: DocumentKind;
  onChange: (next: DocumentKind) => void;
}) {
  return (
    <SegmentedControl
      ariaLabel="Active document"
      size="sm"
      value={value}
      onValueChange={onChange}
      options={[
        { value: 'resume', label: 'Resume' },
        { value: 'coverLetter', label: 'Cover letter' },
      ]}
    />
  );
}

/**
 * Circular 3-step Stepper for the Studio header:
 * Numbered circles joined by a connector line, check for done, ring for current, and `aria-current="step"`.
 */
export function Stepper({
  documentKind,
  activeStep,
  completedSteps,
  onSelectStep,
}: {
  documentKind: DocumentKind;
  activeStep: StudioStep;
  completedSteps: StudioStep[];
  onSelectStep: (step: StudioStep) => void;
}) {
  const middleStep: { id: StudioStep; num: number; label: string } =
    documentKind === 'coverLetter'
      ? { id: 'write', num: 2, label: 'Write' }
      : { id: 'build', num: 2, label: 'Build' };

  const steps: Array<{ id: StudioStep; num: number; label: string }> = [
    { id: 'job', num: 1, label: 'Job' },
    middleStep,
    { id: 'review', num: 3, label: 'Review' },
  ];

  return (
    <nav aria-label="Studio steps" className="inline-flex items-center">
      {steps.map((step, idx) => {
        const isCurrent = step.id === activeStep;
        const isDone = completedSteps.includes(step.id) && !isCurrent;
        return (
          <React.Fragment key={step.id}>
            <button
              type="button"
              aria-current={isCurrent ? 'step' : undefined}
              onClick={() => onSelectStep(step.id)}
              className={cn(
                'inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-medium transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                isCurrent
                  ? 'text-ink font-semibold'
                  : isDone
                    ? 'text-ink hover:bg-surface-sunken'
                    : 'text-ink-muted hover:text-ink hover:bg-surface-sunken',
              )}
            >
              <span
                className={cn(
                  'w-6 h-6 rounded-full inline-flex items-center justify-center text-xs font-bold tabular-nums transition-all',
                  isCurrent
                    ? 'bg-accent text-white ring-4 ring-accent-50 shadow-xs'
                    : isDone
                      ? 'bg-success-50 text-success-700 border border-success/40'
                      : 'bg-surface-sunken text-ink-muted border border-border',
                )}
              >
                {isDone ? (
                  <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                ) : (
                  step.num
                )}
              </span>
              <span>{step.label}</span>
            </button>
            {idx < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  'w-5 h-[2px] mx-1 rounded-full',
                  isDone ? 'bg-success/50' : 'bg-border-strong',
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}

export const CompactStepper = Stepper;

/**
 * Unified 3-step Getting Started checklist on /applications.
 * Auto-hides when all 3 steps are complete, shows inline model start command when unreachable,
 * and adapts the primary action to the first incomplete step ("Import your resume" -> "New application").
 */
export function GettingStartedCard({
  aiConnectedOrDemo,
  hasExperience,
  hasApplication,
  isDemoDataLoaded = false,
  remediationCommand = 'uvicorn mlx_server:app --host 127.0.0.1 --port 8000',
  onConnectAi,
  onUseDemoMode,
  onAddExperience,
  onCreateApplication,
  onTryDemoData,
  onDismiss,
}: {
  aiConnectedOrDemo: boolean;
  hasExperience: boolean;
  hasApplication: boolean;
  isDemoDataLoaded?: boolean;
  remediationCommand?: string;
  onConnectAi: () => void;
  onUseDemoMode?: () => void;
  onAddExperience: () => void;
  onCreateApplication: () => void;
  onTryDemoData: () => void;
  onDismiss?: () => void;
}) {
  const steps = [
    {
      id: 'ai',
      label: 'Connect the model (or use Demo mode)',
      done: aiConnectedOrDemo,
      onClick: onConnectAi,
    },
    {
      id: 'bank',
      label: 'Add your experience',
      done: hasExperience,
      onClick: onAddExperience,
    },
    {
      id: 'app',
      label: 'Create your first application',
      done: hasApplication,
      onClick: onCreateApplication,
    },
  ];

  const primaryActionLabel = !hasExperience
    ? 'Import your resume'
    : 'New application';
  const handlePrimaryAction = !hasExperience
    ? onAddExperience
    : onCreateApplication;

  return (
    <div
      data-testid="getting-started-checklist"
      className="bg-surface border border-border rounded-xl p-5 shadow-sm space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="inline-flex items-center gap-2">
            <CevinAvatar size="sm" />
            <span className="text-sm font-semibold text-ink">
              Getting started
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {steps.map((s, idx) => (
              <button
                key={s.id}
                type="button"
                onClick={s.onClick}
                className={cn(
                  'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer',
                  s.done
                    ? 'bg-success-50 border-success/30 text-success-700'
                    : 'bg-surface-sunken border-border text-ink hover:border-border-strong',
                )}
              >
                {s.done ? (
                  <Check className="w-3.5 h-3.5 text-success-700" />
                ) : (
                  <span className="w-4 h-4 rounded-full bg-accent text-white text-[10px] font-bold inline-flex items-center justify-center tabular-nums">
                    {idx + 1}
                  </span>
                )}
                <span>{s.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Button
            variant="primary"
            size="sm"
            onClick={handlePrimaryAction}
          >
            <span>{primaryActionLabel}</span>
          </Button>
          {!isDemoDataLoaded && (
            <Button
              variant="secondary"
              size="sm"
              onClick={onTryDemoData}
            >
              <span>Load sample workspace</span>
            </Button>
          )}
          {onDismiss && hasApplication && (
            <IconButton
              label="Dismiss getting started checklist"
              size="sm"
              onClick={onDismiss}
            >
              <X className="w-4 h-4" />
            </IconButton>
          )}
        </div>
      </div>

      {!aiConnectedOrDemo && (
        <div className="p-3.5 rounded-lg bg-surface-sunken border border-hairline space-y-2 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="font-medium text-ink">
              Can&apos;t reach the Cevin model at http://localhost:8000. Start it in your project directory (inside your Python virtual environment):
            </span>
            {onUseDemoMode && (
              <Button
                variant="secondary"
                size="sm"
                onClick={onUseDemoMode}
              >
                Use demo mode
              </Button>
            )}
          </div>
          <CopyCommandField command={remediationCommand} />
        </div>
      )}
    </div>
  );
}

export const VOICE_DETENTS: Array<{
  level: VoiceLevel;
  label: string;
  shortLabel: string;
  angle: number;
  shortDesc: string;
}> = [
  {
    level: 'polished',
    label: 'Polished',
    shortLabel: 'Polished',
    angle: -110,
    shortDesc: 'Executive cadence with formal action verbs.',
  },
  {
    level: 'professional',
    label: 'Professional',
    shortLabel: 'Pro',
    angle: -55,
    shortDesc: 'Crisp industry-standard tone without fluff.',
  },
  {
    level: 'balanced',
    label: 'Balanced',
    shortLabel: 'Balanced',
    angle: 0,
    shortDesc: 'Direct peer tone — clear, grounded, and easy to scan.',
  },
  {
    level: 'natural',
    label: 'Natural',
    shortLabel: 'Natural',
    angle: 55,
    shortDesc: 'Conversational clarity with varied sentence rhythm.',
  },
  {
    level: 'plain',
    label: 'Plain-spoken',
    shortLabel: 'Plain',
    angle: 110,
    shortDesc: 'Strictly facts, concrete numbers, and plain verbs.',
  },
];

/**
 * 88px Tactile Rotary VoiceKnob with 5 engraved ticks + clickable stops on the arc,
 * pointer drag + click + keyboard arrow support, and 180ms ease-out settle.
 */
export function VoiceKnob({
  value,
  onChange,
}: {
  value: VoiceLevel;
  onChange: (next: VoiceLevel) => void;
}) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const draggingRef = useRef(false);

  const currentIndex = Math.max(
    0,
    VOICE_DETENTS.findIndex((d) => d.level === value),
  );
  const currentDetent = VOICE_DETENTS[currentIndex] ?? VOICE_DETENTS[2];

  const selectFromClientPoint = (clientX: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;
    // Angle in degrees where 0 is straight up (12 o'clock)
    const angleDeg = (Math.atan2(dx, -dy) * 180) / Math.PI;
    let closestIdx = 0;
    let minDiff = Infinity;
    VOICE_DETENTS.forEach((d, idx) => {
      const diff = Math.abs(angleDeg - d.angle);
      if (diff < minDiff) {
        minDiff = diff;
        closestIdx = idx;
      }
    });
    const nextLevel = VOICE_DETENTS[closestIdx]?.level;
    if (nextLevel && nextLevel !== value) {
      onChange(nextLevel);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      const next = Math.min(VOICE_DETENTS.length - 1, currentIndex + 1);
      onChange(VOICE_DETENTS[next].level);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      const prev = Math.max(0, currentIndex - 1);
      onChange(VOICE_DETENTS[prev].level);
    } else if (e.key === 'Home') {
      e.preventDefault();
      onChange(VOICE_DETENTS[0].level);
    } else if (e.key === 'End') {
      e.preventDefault();
      onChange(VOICE_DETENTS[VOICE_DETENTS.length - 1].level);
    }
  };

  return (
    <div className="inline-flex flex-col items-center select-none shrink-0">
      <div
        role="slider"
        tabIndex={0}
        aria-label="Writing voice"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={currentIndex}
        aria-valuetext={`${currentDetent.label}: ${currentDetent.shortDesc}`}
        onKeyDown={handleKeyDown}
        onPointerDown={(e) => {
          draggingRef.current = true;
          e.currentTarget.setPointerCapture?.(e.pointerId);
          selectFromClientPoint(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (!draggingRef.current) return;
          selectFromClientPoint(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          draggingRef.current = false;
        }}
        title="Drag knob, click a stop, or use Left/Right arrow keys"
        className="relative w-[88px] h-[88px] rounded-full flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <svg
          ref={svgRef}
          width="88"
          height="88"
          viewBox="0 0 88 88"
          aria-hidden="true"
        >
          {/* Outer recessed dial ring */}
          <circle
            cx="44"
            cy="44"
            r="39"
            className="fill-surface-sunken stroke-border"
            strokeWidth="1.5"
          />

          {/* 5 engraved detent ticks & dots around the 220-deg arc */}
          {VOICE_DETENTS.map((detent, idx) => {
            const rad = ((detent.angle - 90) * Math.PI) / 180;
            const x1 = 44 + Math.cos(rad) * 30;
            const y1 = 44 + Math.sin(rad) * 30;
            const x2 = 44 + Math.cos(rad) * 35;
            const y2 = 44 + Math.sin(rad) * 35;
            const dotX = 44 + Math.cos(rad) * 36.5;
            const dotY = 44 + Math.sin(rad) * 36.5;
            const active = idx === currentIndex;
            const passed = idx <= currentIndex;
            return (
              <g key={detent.level}>
                <line
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  strokeWidth={active ? '2.75' : '1.75'}
                  strokeLinecap="round"
                  className={
                    active
                      ? 'stroke-accent'
                      : passed
                        ? 'stroke-ink-muted'
                        : 'stroke-border-strong'
                  }
                />
                <circle
                  cx={dotX}
                  cy={dotY}
                  r={active ? '2.5' : '1.5'}
                  className={active ? 'fill-accent' : 'fill-transparent'}
                />
              </g>
            );
          })}

          {/* Raised tactile rotary cap */}
          <circle
            cx="44"
            cy="44"
            r="25"
            className="fill-surface stroke-border-strong"
            strokeWidth="1.75"
          />
          <circle
            cx="44"
            cy="44"
            r="21"
            className="fill-surface-raised stroke-hairline"
            strokeWidth="1"
          />

          {/* Pointer needle */}
          <g
            transform={`rotate(${currentDetent.angle} 44 44)`}
            className="transition-transform duration-180"
          >
            <line
              x1="44"
              y1="44"
              x2="44"
              y2="23"
              strokeWidth="3"
              strokeLinecap="round"
              className="stroke-accent"
            />
            <circle cx="44" cy="23" r="2.75" className="fill-accent" />
          </g>

          {/* Center cap spindle */}
          <circle cx="44" cy="44" r="3.5" className="fill-ink" />
        </svg>
      </div>

      {/* 5 engraved arc stop labels below the knob for direct 1-click stop selection (with full-name tooltip on abbreviated labels) */}
      <div
        role="group"
        aria-label="Voice stops"
        className="mt-1 flex items-center gap-1"
      >
        {VOICE_DETENTS.map((detent) => {
          const active = detent.level === value;
          const btn = (
            <button
              key={detent.level}
              type="button"
              onClick={() => onChange(detent.level)}
              aria-label={`Set voice to ${detent.label}`}
              className={cn(
                'px-1.5 py-0.5 rounded-xs text-[11px] font-sans transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                active
                  ? 'bg-accent-50 text-accent-700 font-bold border border-accent/25'
                  : 'text-ink-muted hover:text-ink hover:bg-surface-sunken',
              )}
            >
              {detent.shortLabel}
            </button>
          );
          if (detent.shortLabel !== detent.label) {
            return (
              <Tooltip key={detent.level} content={detent.label}>
                {btn}
              </Tooltip>
            );
          }
          return btn;
        })}
      </div>
    </div>
  );
}

/**
 * 40px Mini rotary knob SVG used in MiniKnobBar.
 * Clicking expands the full 88px rotary VoiceKnob.
 */
function MiniRotaryKnob({
  value,
  onClick,
}: {
  value: VoiceLevel;
  onClick: () => void;
}) {
  const currentIndex = Math.max(
    0,
    VOICE_DETENTS.findIndex((d) => d.level === value),
  );
  const currentDetent = VOICE_DETENTS[currentIndex] ?? VOICE_DETENTS[2];

  return (
    <Tooltip content={`Writing voice: ${currentDetent.label}. Click to expand voice dial`}>
      <button
        type="button"
        onClick={onClick}
        aria-expanded={false}
        aria-label={`Writing voice: ${currentDetent.label}. Click to expand voice dial`}
        className="relative w-10 h-10 rounded-full flex items-center justify-center shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true">
          <circle
            cx="20"
            cy="20"
            r="18"
            className="fill-surface-sunken stroke-border"
            strokeWidth="1.25"
          />
          {VOICE_DETENTS.map((detent, idx) => {
            const rad = ((detent.angle - 90) * Math.PI) / 180;
            const x1 = 20 + Math.cos(rad) * 13.5;
            const y1 = 20 + Math.sin(rad) * 13.5;
            const x2 = 20 + Math.cos(rad) * 16;
            const y2 = 20 + Math.sin(rad) * 16;
            const active = idx === currentIndex;
            return (
              <line
                key={detent.level}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                strokeWidth={active ? '2' : '1.25'}
                strokeLinecap="round"
                className={active ? 'stroke-accent' : 'stroke-border-strong'}
              />
            );
          })}
          <circle
            cx="20"
            cy="20"
            r="11.5"
            className="fill-surface stroke-border-strong"
            strokeWidth="1.25"
          />
          <g
            transform={`rotate(${currentDetent.angle} 20 20)`}
            className="transition-transform duration-180 motion-reduce:transition-none"
          >
            <line
              x1="20"
              y1="20"
              x2="20"
              y2="10.5"
              strokeWidth="2.25"
              strokeLinecap="round"
              className="stroke-accent"
            />
          </g>
          <circle cx="20" cy="20" r="2" className="fill-ink" />
        </svg>
      </button>
    </Tooltip>
  );
}

/**
 * VoiceControl / MiniKnobBar:
 * Compact mode uses a 40px mini rotary knob + inline 5-segment control with full voice names + Machine-made feel meter
 * (no duplicate dropdown). Clicking the mini knob expands the full 88px rotary VoiceKnob.
 */
export function VoiceControl({
  value,
  onChange,
  machineMadeScore,
  etaLabel,
  isUpdating = false,
  batchProgressLabel,
  onCancelUpdate,
  defaultCompact = false,
}: {
  value: VoiceLevel;
  onChange: (next: VoiceLevel) => void;
  machineMadeScore: number;
  etaLabel?: string;
  isUpdating?: boolean;
  batchProgressLabel?: string;
  onCancelUpdate?: () => void;
  defaultCompact?: boolean;
}) {
  const [expanded, setExpanded] = useState(!defaultCompact);
  const currentIndex = Math.max(
    0,
    VOICE_DETENTS.findIndex((d) => d.level === value),
  );
  const currentDetent = VOICE_DETENTS[currentIndex] ?? VOICE_DETENTS[2];
  const feelLevel = getMachineMadeFeelLevel(machineMadeScore);

  const activeSegments =
    feelLevel === 'Low' ? 1 : feelLevel === 'Medium' ? 3 : 5;
  const segmentColor =
    feelLevel === 'Low'
      ? 'bg-success'
      : feelLevel === 'Medium'
        ? 'bg-warning'
        : 'bg-danger';
  const feelTextClass =
    feelLevel === 'Low'
      ? 'text-success-700'
      : feelLevel === 'Medium'
        ? 'text-warning-700'
        : 'text-danger-700';

  const rewritingLabel = batchProgressLabel || 'Cevin is rewriting';

  if (!expanded) {
    return (
      <div className="min-h-[56px] flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 min-w-0">
          <MiniRotaryKnob value={value} onClick={() => setExpanded(true)} />

          <div
            role="group"
            aria-label="Writing voice"
            className="inline-flex items-center p-0.5 rounded-lg bg-surface-sunken border border-border"
          >
            {VOICE_DETENTS.map((d) => {
              const active = d.level === value;
              const stopBtn = (
                <button
                  key={d.level}
                  type="button"
                  aria-pressed={active}
                  onClick={() => onChange(d.level)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs font-sans transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                    active
                      ? 'bg-surface text-ink font-semibold shadow-xs border border-border/80'
                      : 'text-ink-muted hover:text-ink',
                  )}
                >
                  <span className="hidden md:inline">{d.label}</span>
                  <span className="md:hidden">{d.shortLabel}</span>
                </button>
              );
              return d.shortLabel !== d.label ? (
                <Tooltip key={d.level} content={`${d.label}: ${d.shortDesc}`}>
                  {stopBtn}
                </Tooltip>
              ) : (
                stopBtn
              );
            })}
          </div>

          {isUpdating && (
            <CevinStatusIndicator
              state="writing"
              size={16}
              variant="glyph"
              label={rewritingLabel}
              className="text-accent"
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <Tooltip content="Checks for stock AI verbs, uniform sentence lengths, and em-dash overuse. Never claims to bypass AI detectors.">
            <div className="inline-flex items-center gap-2 bg-surface-sunken border border-hairline rounded-md px-2.5 py-1.5 cursor-help text-xs">
              <span className="text-ink-muted">Machine-made feel</span>
              <span className={cn('font-bold', feelTextClass)}>
                {feelLevel}
              </span>
              <span
                aria-label={`Machine-made feel: ${feelLevel}`}
                className="inline-flex items-center gap-0.5"
              >
                {[1, 2, 3, 4, 5].map((seg) => (
                  <span
                    key={seg}
                    className={cn(
                      'w-3 h-1.5 rounded-xs',
                      seg <= activeSegments ? segmentColor : 'bg-border-strong',
                    )}
                  />
                ))}
              </span>
            </div>
          </Tooltip>
          {isUpdating && onCancelUpdate && (
            <Button variant="secondary" size="sm" onClick={onCancelUpdate}>
              Cancel
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-5">
      <div className="flex flex-wrap items-center gap-5 min-w-0">
        <VoiceKnob value={value} onChange={onChange} />

        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
              Writing voice
            </span>
            {etaLabel && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-sm bg-surface-sunken border border-hairline text-xs text-ink-muted tabular-nums">
                {etaLabel}
              </span>
            )}
            {isUpdating && (
              <CevinStatusIndicator
                state="writing"
                size={16}
                variant="glyph"
                label={rewritingLabel}
                className="text-accent"
              />
            )}
            {defaultCompact && (
              <button
                type="button"
                onClick={() => setExpanded(false)}
                className="text-xs text-ink-muted hover:text-ink underline cursor-pointer"
              >
                Compact view
              </button>
            )}
          </div>

          <div className="text-xl font-display font-semibold text-ink tracking-tight">
            {currentDetent.label}
          </div>

          <p className="text-xs text-ink-muted leading-relaxed">
            {currentDetent.shortDesc}
          </p>
        </div>
      </div>

      {/* 5-segment Machine-made feel meter + optional cancel */}
      <div className="flex items-center gap-4">
        <Tooltip content="Checks for stock AI verbs, uniform sentence lengths, and em-dash overuse. Never claims to bypass AI detectors.">
          <div className="bg-surface-sunken border border-hairline rounded-lg px-3.5 py-2.5 cursor-help space-y-1.5">
            <div className="flex items-center justify-between gap-4 text-xs">
              <span className="text-ink-muted font-medium">
                Machine-made feel
              </span>
              <span className={cn('font-bold', feelTextClass)}>
                {feelLevel}
              </span>
            </div>
            <div
              aria-label={`Machine-made feel: ${feelLevel}`}
              className="flex items-center gap-1"
            >
              {[1, 2, 3, 4, 5].map((seg) => (
                <span
                  key={seg}
                  className={cn(
                    'w-6 h-1.5 rounded-xs transition-colors',
                    seg <= activeSegments ? segmentColor : 'bg-border-strong',
                  )}
                />
              ))}
            </div>
          </div>
        </Tooltip>

        {isUpdating && onCancelUpdate && (
          <Button variant="secondary" size="sm" onClick={onCancelUpdate}>
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}

export const VoiceDial = VoiceControl;
export const MiniKnobBar = VoiceControl;

/**
 * Sticky GroupHeader for experience role groups in Studio Build.
 */
export function GroupHeader({
  company,
  title,
  dateRange,
  includedCount,
  totalCount,
  onMoveUp,
  onMoveDown,
  canMoveUp,
  canMoveDown,
}: {
  company: string;
  title: string;
  dateRange: string;
  includedCount: number;
  totalCount: number;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  canMoveUp?: boolean;
  canMoveDown?: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 bg-surface/95 backdrop-blur-xs py-2.5 px-3 border-b border-hairline flex flex-wrap items-center justify-between gap-2">
      <div className="flex items-center gap-2.5 min-w-0">
        <Avatar name={company} size="xs" />
        <div className="min-w-0">
          <span className="text-sm font-semibold text-ink">{title}</span>
          <span className="text-sm text-ink-muted"> · {company}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 text-xs text-ink-muted tabular-nums">
        <span>{dateRange}</span>
        <Badge tone="neutral">
          {includedCount} of {totalCount} included
        </Badge>
        {(onMoveUp || onMoveDown) && (
          <div className="flex items-center gap-0.5 ml-1 border-l border-hairline pl-1.5">
            <IconButton
              size="sm"
              label="Move experience up"
              disabled={!canMoveUp}
              onClick={onMoveUp}
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </IconButton>
            <IconButton
              size="sm"
              label="Move experience down"
              disabled={!canMoveDown}
              onClick={onMoveDown}
            >
              <ArrowDown className="w-3.5 h-3.5" />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * BulletRow for the Studio Build step:
 * Checkbox, 3-bar relevance meter with tooltip, auto-growing text, provenance marker (sparkle/pencil),
 * inline cliché popover ("architected → built [Apply] [Dismiss]"), and compact header actions:
 * `Rewrite`, `Remove bullet`, and `⋯` menu (Lock, Show sources, Compare with original, Move up/down, Remove).
 */
export function BulletRow({
  bulletText,
  originalText,
  locked,
  unverifiedClaims,
  keptOriginalWording = false,
  origin = 'ai',
  isRewriting = false,
  justUpdated = false,
  relevanceDots = 3,
  relevanceReason = 'Matches core job requirements',
  sourceSummary,
  isFirst,
  isLast,
  onChangeText,
  onRewrite,
  onToggleLock,
  onMoveUp,
  onMoveDown,
  onRemove,
  onHoverSource,
}: {
  bulletText: string;
  originalText: string;
  locked: boolean;
  unverifiedClaims: string[];
  keptOriginalWording?: boolean;
  origin?: 'ai' | 'user' | 'bank';
  isRewriting?: boolean;
  justUpdated?: boolean;
  relevanceDots?: 1 | 2 | 3;
  relevanceReason?: string;
  sourceSummary?: string;
  isFirst?: boolean;
  isLast?: boolean;
  onChangeText: (nextText: string) => void;
  onRewrite: () => void;
  onToggleLock: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onRemove: () => void;
  onHoverSource?: (hovering: boolean) => void;
}) {
  const [showDiff, setShowDiff] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dismissedCliches, setDismissedCliches] = useState<string[]>([]);

  const cliches = findInlineCliches(bulletText).filter(
    (c) => !dismissedCliches.includes(`${c.term}-${c.index}`),
  );

  const handleApplyClicheReplacement = (
    index: number,
    length: number,
    replacement: string,
  ) => {
    const updated =
      bulletText.slice(0, index) +
      replacement +
      bulletText.slice(index + length);
    onChangeText(updated);
  };

  return (
    <div
      onMouseEnter={() => onHoverSource?.(true)}
      onMouseLeave={() => onHoverSource?.(false)}
      className={cn(
        'group rounded-lg p-3 transition-colors duration-280 space-y-2 border',
        justUpdated
          ? 'border-accent bg-accent-50'
          : 'bg-surface border-hairline hover:border-border-strong',
      )}
    >
      {/* Header strip: Checkbox, 3-bar relevance meter, provenance icon, status pills, and hover/focus-within actions */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Checkbox
            checked={true}
            onCheckedChange={(checked) => {
              if (!checked) onRemove();
            }}
            label="Include achievement in resume"
          />

          <Tooltip content={relevanceReason}>
            <span
              aria-label={`Relevance: ${relevanceDots} out of 3`}
              className="inline-flex items-end gap-0.5 h-4 px-1 cursor-help"
            >
              <span
                className={cn(
                  'w-1 h-2 rounded-xs',
                  relevanceDots >= 1 ? 'bg-accent' : 'bg-border-strong',
                )}
              />
              <span
                className={cn(
                  'w-1 h-3 rounded-xs',
                  relevanceDots >= 2 ? 'bg-accent' : 'bg-border-strong',
                )}
              />
              <span
                className={cn(
                  'w-1 h-4 rounded-xs',
                  relevanceDots >= 3 ? 'bg-accent' : 'bg-border-strong',
                )}
              />
            </span>
          </Tooltip>

          {origin === 'user' ? (
            <Tooltip content="Edited by you">
              <span
                aria-label="Edited by you"
                className="text-ink-subtle inline-flex items-center gap-1 text-[11px]"
              >
                <Pencil className="w-3 h-3" />
                <span>Edited</span>
              </span>
            </Tooltip>
          ) : (
            <Tooltip content="Tailored by Cevin from your Bank">
              <span
                aria-label="Tailored by Cevin"
                className="text-accent inline-flex items-center gap-1 text-[11px] font-medium"
              >
                <Sparkles className="w-3 h-3" />
                <span>Tailored</span>
              </span>
            </Tooltip>
          )}

          {locked && !isRewriting && (
            <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-sm bg-accent-50 text-accent-700 border border-accent/20">
              <Lock className="w-3 h-3" />
              Locked
            </span>
          )}
          {keptOriginalWording && !isRewriting && (
            <span
              title="Kept your grounded baseline wording so every fact and number stays accurate."
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-sm bg-surface-sunken border border-hairline text-ink-muted"
            >
              Original wording kept
            </span>
          )}
        </div>

        {/* Actions in header strip on hover / focus-within so textarea gets 100% row width */}
        <div
          className={cn(
            'flex items-center gap-1 shrink-0 transition-opacity',
            menuOpen
              ? 'opacity-100'
              : 'opacity-85 group-hover:opacity-100 group-focus-within:opacity-100',
          )}
        >
          <Button
            variant="ghost"
            size="sm"
            aria-label="Rewrite in current voice"
            disabled={locked || isRewriting}
            onClick={onRewrite}
          >
            <Sparkles className="w-3.5 h-3.5 text-accent" />
            <span>Rewrite</span>
          </Button>

          <IconButton
            variant="danger"
            size="sm"
            label="Remove bullet"
            onClick={onRemove}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </IconButton>

          <Popover open={menuOpen} onOpenChange={setMenuOpen}>
            <PopoverTrigger asChild>
              <IconButton label="More bullet actions" size="sm">
                <MoreHorizontal className="w-4 h-4" />
              </IconButton>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-52 p-1">
              <div role="menu" aria-label="Bullet actions">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onToggleLock();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                >
                  {locked ? (
                    <Unlock className="w-3.5 h-3.5 text-accent" />
                  ) : (
                    <Lock className="w-3.5 h-3.5" />
                  )}
                  <span>{locked ? 'Unlock bullet' : 'Lock bullet'}</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowSources((v) => !v);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                >
                  <Link2 className="w-3.5 h-3.5" />
                  <span>
                    {showSources ? 'Hide Bank source' : 'Show source in Bank'}
                  </span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setShowDiff((v) => !v);
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                >
                  <GitCompare className="w-3.5 h-3.5" />
                  <span>
                    {showDiff
                      ? 'Hide original comparison'
                      : 'Compare with original'}
                  </span>
                </button>

                <div className="my-1 border-t border-hairline" />

                <button
                  type="button"
                  role="menuitem"
                  disabled={isFirst}
                  onClick={() => {
                    onMoveUp();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ArrowUp className="w-3.5 h-3.5" />
                  <span>Move bullet up</span>
                </button>

                <button
                  type="button"
                  role="menuitem"
                  disabled={isLast}
                  onClick={() => {
                    onMoveDown();
                    setMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer disabled:opacity-40 disabled:pointer-events-none"
                >
                  <ArrowDown className="w-3.5 h-3.5" />
                  <span>Move bullet down</span>
                </button>

                <div className="my-1 border-t border-hairline" />

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onRemove();
                  }}
                  className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-danger-700 rounded-sm hover:bg-danger-50 text-left cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remove bullet</span>
                </button>
              </div>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      {/* Full-width AutoGrowTextarea so multi-line bullets are never cropped */}
      <div className="w-full">
        {isRewriting ? (
          <div className="space-y-2 py-2 px-3 rounded-md bg-surface-sunken border border-hairline">
            <CevinStatusIndicator
              state="writing"
              size={16}
              variant="glyph"
              label="Cevin is rewriting"
              className="text-accent"
            />
            <div className="h-3 w-11/12 bg-border animate-pulse rounded-xs" />
            <div className="h-3 w-3/4 bg-border animate-pulse rounded-xs" />
          </div>
        ) : (
          <AutoGrowTextarea
            minRows={2}
            value={bulletText}
            disabled={locked}
            onChange={(e) => onChangeText(e.target.value)}
            aria-label="Tailored achievement bullet"
            className="text-sm py-2 px-3 w-full"
          />
        )}

        {/* Inline cliché underline popover suggestions */}
        {cliches.length > 0 && (
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {cliches.map((c) => {
              const key = `${c.term}-${c.index}`;
              return (
                <Popover key={key}>
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-sm bg-warning-50 text-warning-700 border border-warning/30 hover:bg-warning-subtle cursor-pointer"
                    >
                      <span className="underline decoration-dotted">
                        “{c.term}”
                      </span>
                      <span>→</span>
                      <span className="font-semibold">“{c.replacement}”</span>
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-64 p-3 space-y-2">
                    <div className="text-xs font-semibold text-ink">
                      Plain-language suggestion
                    </div>
                    <p className="text-xs text-ink-muted">
                      Replace stock phrase{' '}
                      <span className="font-medium text-ink">“{c.term}”</span>{' '}
                      with{' '}
                      <span className="font-semibold text-accent-700">
                        “{c.replacement}”
                      </span>
                      .
                    </p>
                    <div className="flex items-center gap-2 pt-1">
                      <Button
                        variant="primary"
                        size="sm"
                        onClick={() =>
                          handleApplyClicheReplacement(
                            c.index,
                            c.length,
                            c.replacement,
                          )
                        }
                      >
                        Apply
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setDismissedCliches((prev) => [...prev, key])
                        }
                      >
                        Dismiss
                      </Button>
                    </div>
                  </PopoverContent>
                </Popover>
              );
            })}
          </div>
        )}

        {/* Unverified claim alert */}
        {unverifiedClaims.length > 0 && (
          <div className="mt-1.5 flex items-center gap-1.5 text-xs text-danger-700 font-medium">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span>Unverified: {unverifiedClaims.join(', ')}</span>
          </div>
        )}
      </div>

      {showSources && sourceSummary && (
        <div className="text-xs text-ink-muted bg-surface-sunken px-3 py-2 rounded-sm border border-hairline">
          <span className="font-semibold text-ink">From your Bank: </span>
          <span>{sourceSummary}</span>
        </div>
      )}

      {showDiff && (
        <DiffText originalText={originalText} tailoredText={bulletText} />
      )}
    </div>
  );
}

const LETTER_BLOCK_LABELS: Record<CoverLetterBlockType, string> = {
  greeting: 'Greeting',
  opening: 'Opening',
  body1: 'Body paragraph 1',
  body2: 'Body paragraph 2',
  whyCompany: 'Why this company',
  closing: 'Closing',
  signoff: 'Sign-off',
};

/**
 * Editable LetterBlock for the Cover Letter Write step with 3px left accent rail,
 * "From:" source chips with doc icon & tooltip, Rewrite, Lock toggle, and auto-growing text.
 */
export function LetterBlock({
  block,
  sourceLabels,
  isRewriting = false,
  onChangeText,
  onRegenerate,
  onToggleLock,
  onHoverBlock,
}: {
  block: CoverLetterBlock;
  sourceLabels: string[];
  isRewriting?: boolean;
  onChangeText: (nextText: string) => void;
  onRegenerate: () => void;
  onToggleLock: () => void;
  onHoverBlock?: (hovering: boolean) => void;
}) {
  const isCompactBlock =
    block.type === 'greeting' || block.type === 'signoff';
  const cliches = findInlineCliches(block.text);

  return (
    <div
      onMouseEnter={() => onHoverBlock?.(true)}
      onMouseLeave={() => onHoverBlock?.(false)}
      className={cn(
        'bg-surface border border-hairline rounded-lg p-4 space-y-2.5 border-l-[3px] shadow-xs',
        sourceLabels.length > 0 ? 'border-l-accent' : 'border-l-border-strong',
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-ink">
            {LETTER_BLOCK_LABELS[block.type]}
          </span>
          {sourceLabels.map((lbl) => (
            <Tooltip key={lbl} content={`Grounded in Bank item: ${lbl}`}>
              <span className="inline-flex items-center gap-1 text-xs text-accent-700 bg-accent-50 px-2 py-0.5 rounded-sm border border-accent/20 cursor-help">
                <FileText className="w-3 h-3 shrink-0" />
                <span className="truncate max-w-[16rem]">From: {lbl}</span>
              </span>
            </Tooltip>
          ))}
        </div>

        <div className="flex items-center gap-1">
          {!isCompactBlock && (
            <Button
              variant="ghost"
              size="sm"
              disabled={block.locked || isRewriting}
              onClick={onRegenerate}
            >
              <Sparkles className="w-3.5 h-3.5 text-accent" />
              <span>Rewrite</span>
            </Button>
          )}
          <IconButton
            label={block.locked ? 'Unlock paragraph' : 'Lock paragraph'}
            size="sm"
            variant={block.locked ? 'subtle' : 'ghost'}
            onClick={onToggleLock}
          >
            {block.locked ? (
              <Lock className="w-3.5 h-3.5 text-accent" />
            ) : (
              <Unlock className="w-3.5 h-3.5" />
            )}
          </IconButton>
        </div>
      </div>

      {isRewriting ? (
        <div className="space-y-2 py-2 px-3 rounded-md bg-surface-sunken border border-hairline">
          <CevinStatusIndicator
            state="writing"
            size={16}
            variant="glyph"
            label="Cevin is writing"
            className="text-accent"
          />
          <div className="h-3 w-11/12 bg-border animate-pulse rounded-xs" />
          <div className="h-3 w-4/5 bg-border animate-pulse rounded-xs" />
        </div>
      ) : (
        <AutoGrowTextarea
          minRows={isCompactBlock ? 2 : 3}
          value={block.text}
          disabled={block.locked}
          onChange={(e) => onChangeText(e.target.value)}
          aria-label={LETTER_BLOCK_LABELS[block.type]}
        />
      )}

      {cliches.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {cliches.map((c) => (
            <button
              key={`${c.term}-${c.index}`}
              type="button"
              onClick={() => {
                const next =
                  block.text.slice(0, c.index) +
                  c.replacement +
                  block.text.slice(c.index + c.length);
                onChangeText(next);
              }}
              className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-sm bg-warning-50 text-warning-700 border border-warning/30 cursor-pointer"
            >
              <span className="underline decoration-dotted">“{c.term}”</span>
              <span>→</span>
              <span className="font-semibold">“{c.replacement}”</span>
            </button>
          ))}
        </div>
      )}

      {block.unverifiedClaims.length > 0 && (
        <div className="flex items-center gap-1.5 text-xs text-danger-700 font-medium">
          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
          <span>Unverified: {block.unverifiedClaims.join(', ')}</span>
        </div>
      )}
    </div>
  );
}

/**
 * Full-width SegmentedCoverageBar (10px tall) split into covered, partial,
 * and gap (striped warning) segments. The three StatTiles above already carry
 * the counts and labels, so the redundant text legend below is omitted.
 */
export function SegmentedCoverageBar({
  coveredCount,
  partialCount,
  gapCount,
  label = 'Requirement coverage',
}: {
  coveredCount: number;
  partialCount: number;
  gapCount: number;
  label?: string;
}) {
  const total = Math.max(1, coveredCount + partialCount + gapCount);
  const coveredWidth = Math.round((coveredCount / total) * 300);
  const partialWidth = Math.round((partialCount / total) * 300);
  const gapWidth = Math.max(0, 300 - coveredWidth - partialWidth);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-semibold text-ink">{label}</span>
        <span className="font-sans tabular-nums text-ink-muted">
          {coveredCount} of {coveredCount + partialCount + gapCount} matched
        </span>
      </div>
      <svg
        width="100%"
        height="10"
        viewBox="0 0 300 10"
        preserveAspectRatio="none"
        className="rounded-full overflow-hidden border border-hairline bg-surface-sunken"
        aria-label={`${coveredCount} covered, ${partialCount} partial, ${formatCount(gapCount, 'gap')}`}
      >
        <defs>
          <pattern
            id="gap-stripe"
            width="6"
            height="6"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="6"
              stroke="currentColor"
              strokeWidth="2"
              className="text-warning/55"
            />
          </pattern>
        </defs>
        <rect
          x="0"
          y="0"
          width={coveredWidth}
          height="10"
          className="fill-success"
        />
        <rect
          x={coveredWidth}
          y="0"
          width={partialWidth}
          height="10"
          className="fill-info"
        />
        <rect
          x={coveredWidth + partialWidth}
          y="0"
          width={gapWidth}
          height="10"
          fill="url(#gap-stripe)"
        />
      </svg>
    </div>
  );
}

export const CoverageBar = SegmentedCoverageBar;

/**
 * CoverageSummary: 3 clickable StatTiles (Covered, Partial, Gaps) with 28px Fraunces numerals
 * and 13px labels (zero is quiet/neutral; Gaps uses warning colors only when > 0),
 * plus the 10px SegmentedCoverageBar below.
 */
export function CoverageSummary({
  summary,
  coveredCount: coveredProp,
  partialCount: partialProp,
  gapCount: gapProp,
  activeFilter = 'all',
  onSelectFilter,
  onFilterChange,
  onUndoDismiss,
}: {
  summary?: GroupedCoverageSummary;
  coveredCount?: number;
  partialCount?: number;
  gapCount?: number;
  activeFilter?: 'all' | 'covered' | 'partial' | 'gap';
  onSelectFilter?: (next: 'all' | 'covered' | 'partial' | 'gap') => void;
  onFilterChange?: (next: 'all' | 'covered' | 'partial' | 'gap') => void;
  onUndoDismiss?: () => void;
}) {
  const coveredCount = summary?.coveredCount ?? coveredProp ?? 0;
  const partialCount = summary?.partialCount ?? partialProp ?? 0;
  const gapCount = summary?.gapCount ?? gapProp ?? 0;
  const dismissedCount = summary?.dismissedCount ?? 0;
  const handleSelect = onSelectFilter ?? onFilterChange;

  const toggleFilter = (target: 'covered' | 'partial' | 'gap') => {
    if (!handleSelect) return;
    handleSelect(activeFilter === target ? 'all' : target);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-3">
        <StatTile
          value={coveredCount}
          label="Covered"
          tone="neutral"
          active={activeFilter === 'covered'}
          onClick={handleSelect ? () => toggleFilter('covered') : undefined}
        />
        <StatTile
          value={partialCount}
          label="Partial"
          tone={partialCount > 0 ? 'info' : 'neutral'}
          active={activeFilter === 'partial'}
          onClick={handleSelect ? () => toggleFilter('partial') : undefined}
        />
        <StatTile
          value={gapCount}
          label={gapCount === 1 ? 'Gap' : 'Gaps'}
          tone={gapCount > 0 ? 'warning' : 'neutral'}
          active={activeFilter === 'gap'}
          onClick={handleSelect ? () => toggleFilter('gap') : undefined}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1 min-w-[200px]">
          <SegmentedCoverageBar
            coveredCount={coveredCount}
            partialCount={partialCount}
            gapCount={gapCount}
          />
        </div>
        {dismissedCount > 0 && onUndoDismiss && (
          <button
            type="button"
            onClick={onUndoDismiss}
            className="text-xs text-ink-muted hover:text-ink underline cursor-pointer shrink-0"
          >
            {dismissedCount} dismissed (Undo)
          </button>
        )}
      </div>
    </div>
  );
}

export function EvidencePopover({
  term,
  evidence,
  children,
}: {
  term: string;
  evidence: BankEvidenceItem[];
  children: React.ReactNode;
}) {
  const content =
    evidence.length > 0 ? (
      <div className="space-y-1.5">
        <div className="font-semibold text-white">
          Proved in your Bank ({formatCount(evidence.length, 'item')}):
        </div>
        <ul className="space-y-1 text-ink-100">
          {evidence.slice(0, 3).map((ev) => (
            <li key={ev.id} className="leading-snug">
              <span className="font-medium text-sky-300">{ev.title}:</span>{' '}
              <span>{ev.snippet}</span>
            </li>
          ))}
        </ul>
        <div className="text-[11px] text-ink-400 pt-0.5">
          Click chip to highlight on the paper preview.
        </div>
      </div>
    ) : (
      <span>Matched in your Experience Bank for “{term}”. Click to highlight on paper.</span>
    );

  return <Tooltip content={content}>{children}</Tooltip>;
}

/**
 * GapChip: solid warning-50 fill, warning border, `!` icon, and an actions menu:
 * `Add to Bank`, `I have this` (quick-add modal), and `Not relevant` (dismissal).
 */
export function GapChip({
  term,
  priority,
  onAddToBank,
  onConfirmIHaveThis,
  onDismissNotRelevant,
  onTogglePriority,
}: {
  term: string;
  priority?: 'must-have' | 'nice-to-have';
  onAddToBank?: () => void;
  onConfirmIHaveThis?: () => void;
  onDismissNotRelevant?: () => void;
  onTogglePriority?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-warning-50 text-warning-700 border border-warning/45 font-medium whitespace-nowrap shrink-0 shadow-xs">
      <span
        aria-hidden="true"
        className="w-4 h-4 rounded-full bg-warning text-white inline-flex items-center justify-center text-[10px] font-bold shrink-0"
      >
        !
      </span>
      <span className="font-semibold">{term}</span>

      {(onAddToBank || onConfirmIHaveThis || onDismissNotRelevant || onTogglePriority) && (
        <Popover open={menuOpen} onOpenChange={setMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Actions for gap ${term}`}
              className="ml-0.5 px-1.5 py-0.5 rounded-xs bg-surface/85 hover:bg-surface text-warning-700 border border-warning/30 text-[11px] font-semibold cursor-pointer"
            >
              Resolve ▾
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-56 p-1.5 space-y-0.5">
            {onConfirmIHaveThis && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onConfirmIHaveThis();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-sm text-xs font-semibold text-accent-700 hover:bg-accent-50 text-left cursor-pointer"
              >
                <Check className="w-3.5 h-3.5 shrink-0" />
                <span>I have this… (add & rescore)</span>
              </button>
            )}
            {onAddToBank && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onAddToBank();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-sm text-xs text-ink hover:bg-surface-raised text-left cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 shrink-0" />
                <span>Add to Bank</span>
              </button>
            )}
            {onDismissNotRelevant && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onDismissNotRelevant();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-sm text-xs text-ink-muted hover:bg-surface-raised text-left cursor-pointer"
              >
                <X className="w-3.5 h-3.5 shrink-0" />
                <span>Not relevant (dismiss)</span>
              </button>
            )}
            {priority && onTogglePriority && (
              <button
                type="button"
                onClick={() => {
                  setMenuOpen(false);
                  onTogglePriority();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-2 rounded-sm text-xs text-ink-muted hover:bg-surface-raised text-left cursor-pointer border-t border-hairline mt-1 pt-1.5"
              >
                <span>
                  {priority === 'must-have'
                    ? 'Move to Nice-to-have'
                    : 'Move to Must-have'}
                </span>
              </button>
            )}
          </PopoverContent>
        </Popover>
      )}
    </span>
  );
}

/**
 * PartialChip: info-tinted with `related: ...` showing the closest Bank match.
 */
export function PartialChip({
  term,
  relatedMatch,
  priority: _priority,
  onConfirmIHaveThis,
}: {
  term: string;
  relatedMatch?: string;
  priority?: string;
  onConfirmIHaveThis?: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-info-50 text-info-700 border border-info/35 whitespace-nowrap shrink-0">
      <span aria-hidden="true" className="font-bold">
        ◐
      </span>
      <span className="font-semibold">{term}</span>
      {relatedMatch && (
        <span className="text-[11px] text-info-700/85">
          (related: {relatedMatch})
        </span>
      )}
      {onConfirmIHaveThis && (
        <button
          type="button"
          onClick={onConfirmIHaveThis}
          className="ml-1 text-[11px] font-semibold underline hover:opacity-80 cursor-pointer"
        >
          I have this
        </button>
      )}
    </span>
  );
}

/**
 * CoveredChip: neutral surface, small check, no green wash.
 * Hovering shows EvidencePopover; clicking cross-highlights matching occurrences on the paper preview.
 */
export function CoveredChip({
  term,
  evidence,
  evidenceItems,
  highlighted = false,
  onClickHighlight,
}: {
  term: string;
  evidence?: BankEvidenceItem[];
  evidenceItems?: BankEvidenceItem[];
  highlighted?: boolean;
  onClickHighlight?: (term: string) => void;
}) {
  const effectiveEvidence = evidence ?? evidenceItems ?? [];
  const chip = (
    <button
      type="button"
      aria-pressed={highlighted}
      onClick={() => onClickHighlight?.(term)}
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md border transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        highlighted
          ? 'bg-accent-50 text-accent-700 border-accent ring-1 ring-accent font-semibold'
          : 'bg-surface text-ink border-border hover:bg-surface-raised',
      )}
    >
      <Check className="w-3 h-3 text-ink-muted shrink-0" />
      <span>{term}</span>
    </button>
  );

  return (
    <EvidencePopover term={term} evidence={effectiveEvidence}>
      {chip}
    </EvidencePopover>
  );
}

/**
 * RequirementChip backwards-compatible wrapper.
 */
export function RequirementChip({
  term,
  status,
  priority,
  relatedMatch,
  evidence,
  highlighted,
  onTogglePriority,
  onAddToBank,
  onConfirmIHaveThis,
  onDismissNotRelevant,
  onClickHighlight,
}: {
  term: string;
  status: 'covered' | 'partial' | 'gap';
  priority?: 'must-have' | 'nice-to-have';
  relatedMatch?: string;
  evidence?: BankEvidenceItem[];
  highlighted?: boolean;
  onTogglePriority?: () => void;
  onRemove?: () => void;
  onAddToBank?: () => void;
  onConfirmIHaveThis?: () => void;
  onDismissNotRelevant?: () => void;
  onClickHighlight?: (term: string) => void;
}) {
  if (status === 'gap') {
    return (
      <GapChip
        term={term}
        priority={priority}
        onAddToBank={onAddToBank}
        onConfirmIHaveThis={onConfirmIHaveThis}
        onDismissNotRelevant={onDismissNotRelevant}
        onTogglePriority={onTogglePriority}
      />
    );
  }
  if (status === 'partial') {
    return (
      <PartialChip
        term={term}
        relatedMatch={relatedMatch}
        onConfirmIHaveThis={onConfirmIHaveThis}
      />
    );
  }
  return (
    <CoveredChip
      term={term}
      evidence={evidence}
      highlighted={highlighted}
      onClickHighlight={onClickHighlight}
    />
  );
}

export const KeywordChip = RequirementChip;

/**
 * RequirementGroup: Orders "Needs attention" first (gaps, then partials) and
 * collapses "Covered (n)" by default with a disclosure. Nice-to-have items are grouped under each.
 */
export function RequirementGroup({
  summary,
  bank: _bank,
  filter: filterProp,
  activeFilter,
  highlightedTerm,
  onSelectTermHighlight,
  onSelectCoveredTerm,
  onAddGapToBank,
  onAddToBank,
  onOpenIHaveThis,
  onIHaveThis,
  onDismissGap,
  onDismissRequirement,
  onUndoDismissGap,
}: {
  summary: GroupedCoverageSummary;
  bank?: BankSnapshot;
  filter?: 'all' | 'covered' | 'partial' | 'gap';
  activeFilter?: 'all' | 'covered' | 'partial' | 'gap';
  highlightedTerm?: string | null;
  onSelectTermHighlight?: (term: string) => void;
  onSelectCoveredTerm?: (term: string | null) => void;
  onAddGapToBank?: (term: string) => void;
  onAddToBank?: (term: string) => void;
  onOpenIHaveThis?: (term: string) => void;
  onIHaveThis?: (term: string) => void;
  onDismissGap?: (term: string) => void;
  onDismissRequirement?: (reqId: string) => void;
  onUndoDismissGap?: (term: string) => void;
}) {
  const [coveredExpanded, setCoveredExpanded] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);

  const filter = activeFilter ?? filterProp ?? 'all';
  const effectiveAddGap = onAddGapToBank ?? onAddToBank;
  const effectiveIHaveThis = onOpenIHaveThis ?? onIHaveThis;
  const effectiveDismiss = onDismissGap ?? onDismissRequirement;
  const effectiveHighlight =
    onSelectTermHighlight ??
    (onSelectCoveredTerm
      ? (t: string) =>
          onSelectCoveredTerm(
            highlightedTerm?.toLowerCase() === t.toLowerCase() ? null : t,
          )
      : undefined);

  const showNeedsAttention =
    filter === 'all' || filter === 'gap' || filter === 'partial';
  const showCovered = filter === 'all' || filter === 'covered';

  const mustHaveAttention = summary.needsAttention.mustHave.filter((item) =>
    filter === 'all' ? true : item.status === filter,
  );
  const niceToHaveAttention = summary.needsAttention.niceToHave.filter((item) =>
    filter === 'all' ? true : item.status === filter,
  );

  const totalCovered =
    summary.covered.mustHave.length + summary.covered.niceToHave.length;
  const isCoveredOpen = coveredExpanded || filter === 'covered';

  return (
    <div className="space-y-4">
      {/* 1. Needs attention first (Gaps, then Partials) */}
      {showNeedsAttention && (
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-ink">
              Needs attention (
              {mustHaveAttention.length + niceToHaveAttention.length})
            </h4>
            {summary.dismissedTerms.length > 0 && (
              <button
                type="button"
                onClick={() => setShowDismissed((v) => !v)}
                className="text-xs text-ink-muted hover:text-ink underline cursor-pointer"
              >
                {summary.dismissedTerms.length} dismissed
              </button>
            )}
          </div>

          {mustHaveAttention.length === 0 && niceToHaveAttention.length === 0 ? (
            <p className="text-xs text-ink-muted py-1">
              No uncovered or partial requirements — all active requirements are covered.
            </p>
          ) : (
            <div className="space-y-2.5">
              {mustHaveAttention.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-ink-muted">
                    Must-have
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {mustHaveAttention.map((item) =>
                      item.status === 'gap' ? (
                        <GapChip
                          key={item.term}
                          term={item.term}
                          priority={item.priority}
                          onAddToBank={
                            effectiveAddGap
                              ? () => effectiveAddGap(item.term)
                              : undefined
                          }
                          onConfirmIHaveThis={
                            effectiveIHaveThis
                              ? () => effectiveIHaveThis(item.term)
                              : undefined
                          }
                          onDismissNotRelevant={
                            effectiveDismiss
                              ? () => effectiveDismiss(item.id || item.term)
                              : undefined
                          }
                        />
                      ) : (
                        <PartialChip
                          key={item.term}
                          term={item.term}
                          relatedMatch={item.relatedBankTerm}
                          onConfirmIHaveThis={
                            effectiveIHaveThis
                              ? () => effectiveIHaveThis(item.term)
                              : undefined
                          }
                        />
                      ),
                    )}
                  </div>
                </div>
              )}

              {niceToHaveAttention.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-ink-muted">
                    Nice-to-have
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {niceToHaveAttention.map((item) =>
                      item.status === 'gap' ? (
                        <GapChip
                          key={item.term}
                          term={item.term}
                          priority={item.priority}
                          onAddToBank={
                            effectiveAddGap
                              ? () => effectiveAddGap(item.term)
                              : undefined
                          }
                          onConfirmIHaveThis={
                            effectiveIHaveThis
                              ? () => effectiveIHaveThis(item.term)
                              : undefined
                          }
                          onDismissNotRelevant={
                            effectiveDismiss
                              ? () => effectiveDismiss(item.id || item.term)
                              : undefined
                          }
                        />
                      ) : (
                        <PartialChip
                          key={item.term}
                          term={item.term}
                          relatedMatch={item.relatedBankTerm}
                          onConfirmIHaveThis={
                            effectiveIHaveThis
                              ? () => effectiveIHaveThis(item.term)
                              : undefined
                          }
                        />
                      ),
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {showDismissed && summary.dismissedTerms.length > 0 && (
            <div className="bg-surface-sunken border border-hairline rounded-md p-2.5 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-ink-muted font-medium">Dismissed:</span>
              {summary.dismissedTerms.map((term) => (
                <span
                  key={term}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-surface border border-border text-ink-muted"
                >
                  <span>{term}</span>
                  {onUndoDismissGap && (
                    <button
                      type="button"
                      onClick={() => onUndoDismissGap(term)}
                      className="text-accent font-semibold hover:underline ml-1 cursor-pointer"
                    >
                      Undo
                    </button>
                  )}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 2. Covered (n) collapsed by default with a disclosure */}
      {showCovered && totalCovered > 0 && (
        <div className="border border-hairline rounded-lg bg-surface-sunken/40 overflow-hidden">
          <button
            type="button"
            aria-expanded={isCoveredOpen}
            onClick={() => setCoveredExpanded((v) => !v)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs font-semibold text-ink hover:bg-surface-sunken transition-colors cursor-pointer"
          >
            <span className="inline-flex items-center gap-2">
              {isCoveredOpen ? (
                <ChevronDown className="w-3.5 h-3.5 text-ink-muted" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-ink-muted" />
              )}
              <span>Covered ({totalCovered})</span>
            </span>
            <span className="text-ink-muted font-normal">
              {isCoveredOpen
                ? 'Hide covered'
                : `Show ${totalCovered} covered`}
            </span>
          </button>

          {isCoveredOpen && (
            <div className="p-3.5 border-t border-hairline bg-surface space-y-3">
              {summary.covered.mustHave.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-ink-muted">
                    Must-have
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {summary.covered.mustHave.map((item) => (
                      <CoveredChip
                        key={item.term}
                        term={item.term}
                        evidence={item.evidence}
                        highlighted={
                          Boolean(highlightedTerm) &&
                          highlightedTerm?.toLowerCase() ===
                            item.term.toLowerCase()
                        }
                        onClickHighlight={effectiveHighlight}
                      />
                    ))}
                  </div>
                </div>
              )}

              {summary.covered.niceToHave.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-semibold text-ink-muted">
                    Nice-to-have
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {summary.covered.niceToHave.map((item) => (
                      <CoveredChip
                        key={item.term}
                        term={item.term}
                        evidence={item.evidence}
                        highlighted={
                          Boolean(highlightedTerm) &&
                          highlightedTerm?.toLowerCase() ===
                            item.term.toLowerCase()
                        }
                        onClickHighlight={effectiveHighlight}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export const CoverageWall = RequirementGroup;

/**
 * Quick-add modal for "I have this" on a GapChip or PartialChip:
 * Adds the skill + optional aliases + optional achievement to a role in the Bank and rescores.
 */
export function IHaveThisModal({
  open,
  onOpenChange,
  initialSkillName,
  initialTerm,
  experiences: experiencesProp,
  bank,
  onConfirm,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialSkillName?: string;
  initialTerm?: string;
  experiences?: Array<{ id: string; company: string; title: string }>;
  bank?: BankSnapshot;
  onConfirm?: (params: {
    skillName: string;
    aliases: string[];
    category: Skill['category'];
    attachExperienceId?: string;
    achievementId?: string;
    newAchievement?: { action: string; result: string; metric?: string };
  }) => void;
  onSubmit?: (params: {
    skillName: string;
    aliases: string[];
    category: Skill['category'];
    attachExperienceId?: string;
    achievementId?: string;
    newAchievement?: { action: string; result: string; metric?: string };
  }) => void | Promise<void>;
}) {
  const effectiveInitial = initialSkillName ?? initialTerm ?? '';
  const experiences = experiencesProp ?? bank?.experiences ?? [];
  const [skillName, setSkillName] = useState(effectiveInitial);
  const [aliasesText, setAliasesText] = useState('');
  const [category, setCategory] = useState<Skill['category']>('Tools');
  const [attachExpId, setAttachExpId] = useState<string>('none');
  const [achAction, setAchAction] = useState('');
  const [achResult, setAchResult] = useState('');
  const [achMetric, setAchMetric] = useState('');

  useEffect(() => {
    setSkillName(effectiveInitial);
    setAliasesText('');
    setAttachExpId('none');
    setAchAction('');
    setAchResult('');
    setAchMetric('');
  }, [effectiveInitial, open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!skillName.trim()) return;
    const payload = {
      skillName: skillName.trim(),
      aliases: aliasesText
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      category,
      attachExperienceId: attachExpId !== 'none' ? attachExpId : undefined,
      newAchievement:
        attachExpId !== 'none' && achAction.trim() && achResult.trim()
          ? {
              action: achAction.trim(),
              result: achResult.trim(),
              metric: achMetric.trim() || undefined,
            }
          : undefined,
    };
    onConfirm?.(payload);
    void onSubmit?.(payload);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={`I have experience with ${effectiveInitial || 'this skill'}`}
        description="Add this skill to your Experience Bank and include it in this application. You can also attach a supporting achievement."
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="ihavethis-skill-name"
                className="block text-xs font-medium text-ink mb-1"
              >
                Skill name
              </label>
              <Input
                id="ihavethis-skill-name"
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Category
              </label>
              <Select
                ariaLabel="Skill category"
                value={category}
                onValueChange={(v) => setCategory(v as Skill['category'])}
                options={[
                  { value: 'Languages', label: 'Languages' },
                  { value: 'Frameworks', label: 'Frameworks' },
                  { value: 'Infrastructure', label: 'Infrastructure' },
                  { value: 'Data & AI', label: 'Data & AI' },
                  { value: 'Practices', label: 'Practices' },
                  { value: 'Tools', label: 'Tools' },
                ]}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="ihavethis-aliases"
              className="block text-xs font-medium text-ink mb-1"
            >
              Aliases (comma-separated, optional)
            </label>
            <Input
              id="ihavethis-aliases"
              value={aliasesText}
              onChange={(e) => setAliasesText(e.target.value)}
              placeholder="e.g. K8s, EKS"
            />
          </div>

          {experiences.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-hairline">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Attach a supporting achievement to a role (optional)
                </label>
                <Select
                  ariaLabel="Attach to role"
                  value={attachExpId}
                  onValueChange={setAttachExpId}
                  options={[
                    { value: 'none', label: 'Skill only — no new bullet' },
                    ...experiences.map((e) => ({
                      value: e.id,
                      label: `${e.title} · ${e.company}`,
                    })),
                  ]}
                />
              </div>

              {attachExpId !== 'none' && (
                <div className="space-y-2.5 bg-surface-sunken p-3 rounded-lg border border-hairline">
                  <div>
                    <label
                      htmlFor="ihavethis-ach-action"
                      className="block text-xs font-medium text-ink mb-1"
                    >
                      What you built or led
                    </label>
                    <Input
                      id="ihavethis-ach-action"
                      value={achAction}
                      onChange={(e) => setAchAction(e.target.value)}
                      placeholder={`Built production service using ${skillName}`}
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label
                        htmlFor="ihavethis-ach-result"
                        className="block text-xs font-medium text-ink mb-1"
                      >
                        Measurable outcome
                      </label>
                      <Input
                        id="ihavethis-ach-result"
                        value={achResult}
                        onChange={(e) => setAchResult(e.target.value)}
                        placeholder="cutting p99 latency by 35%"
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="ihavethis-ach-metric"
                        className="block text-xs font-medium text-ink mb-1"
                      >
                        Key metric (optional)
                      </label>
                      <Input
                        id="ihavethis-ach-metric"
                        value={achMetric}
                        onChange={(e) => setAchMetric(e.target.value)}
                        placeholder="35%"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" variant="primary">
              Add to Bank & rescore
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export const IHaveThisDialog = IHaveThisModal;

/**
 * Word-level DiffText comparing original Bank wording against tailored bullet wording.
 */
export function DiffText({
  originalText,
  tailoredText,
}: {
  originalText: string;
  tailoredText: string;
}) {
  const origWords = originalText.trim().split(/\s+/);
  const nextWords = tailoredText.trim().split(/\s+/);
  const origSet = new Set(origWords.map((w) => w.toLowerCase()));
  const nextSet = new Set(nextWords.map((w) => w.toLowerCase()));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs p-3 rounded-md bg-surface-sunken border border-hairline">
      <div>
        <div className="text-xs font-medium text-ink-muted mb-1">
          Original Bank wording
        </div>
        <p className="leading-relaxed text-ink-muted">
          {origWords.map((word, idx) => {
            const removed = !nextSet.has(word.toLowerCase());
            return (
              <span
                key={idx}
                className={
                  removed
                    ? 'line-through text-danger-700 bg-danger-50 px-0.5 rounded-xs'
                    : ''
                }
              >
                {word}{' '}
              </span>
            );
          })}
        </p>
      </div>
      <div>
        <div className="text-xs font-medium text-ink-muted mb-1">
          Tailored wording
        </div>
        <p className="leading-relaxed text-ink">
          {nextWords.map((word, idx) => {
            const added = !origSet.has(word.toLowerCase());
            return (
              <span
                key={idx}
                className={
                  added
                    ? 'text-success-700 font-medium bg-success-50 px-0.5 rounded-xs'
                    : ''
                }
              >
                {word}{' '}
              </span>
            );
          })}
        </p>
      </div>
    </div>
  );
}

export function StreamingText({
  text,
  isStreaming = false,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  return (
    <span className="leading-relaxed">
      {text}
      {isStreaming && (
        <span
          aria-hidden="true"
          className="inline-block w-1.5 h-4 ml-1 align-middle bg-accent animate-pulse"
        />
      )}
    </span>
  );
}

/**
 * Vertical 2px TimelineRail dot wrapper for Experience Bank role cards.
 */
export function TimelineRail({
  isCurrent = false,
  isLast = false,
  children,
}: {
  isCurrent?: boolean;
  isLast?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="relative pl-7">
      {!isLast && (
        <div
          aria-hidden="true"
          className="absolute left-[9px] top-6 bottom-0 w-[2px] bg-border"
        />
      )}
      <div
        aria-hidden="true"
        className={cn(
          'absolute left-1 top-5 w-3 h-3 rounded-full border-2 border-accent',
          isCurrent ? 'bg-accent ring-4 ring-accent-50' : 'bg-surface',
        )}
      />
      <div className="pb-5">{children}</div>
    </div>
  );
}

/**
 * Floating PreviewToolbar pill inside DeskPreview:
 * Template switcher with mini PageThumbnails, Skim view toggle, zoom control, page pager,
 * and WYSIWYG file size indicator (`PDF · 1 page · 48 KB`).
 */
export function PreviewToolbar({
  templateId,
  onChangeTemplate,
  textAlign = 'left',
  onChangeTextAlign,
  zoom,
  onChangeZoom,
  currentPage = 1,
  totalPages = 1,
  onChangePage,
  skimMode = false,
  onToggleSkimMode,
  byteSize,
}: {
  templateId: TemplateId;
  onChangeTemplate: (next: TemplateId) => void;
  textAlign?: TextAlign;
  onChangeTextAlign?: (next: TextAlign) => void;
  zoom: 'sm' | 'md' | 'lg';
  onChangeZoom: (next: 'sm' | 'md' | 'lg') => void;
  currentPage?: number;
  totalPages?: number;
  onChangePage?: (page: number) => void;
  skimMode?: boolean;
  onToggleSkimMode?: (next: boolean) => void;
  byteSize?: number;
}) {
  const [tplOpen, setTplOpen] = useState(false);
  const templates: Array<{ id: TemplateId; label: string; desc: string }> = [
    { id: 'classic', label: 'Classic', desc: 'Editorial serif headings' },
    { id: 'modern', label: 'Modern', desc: 'Clean cobalt accents' },
    { id: 'compact', label: 'Compact', desc: 'High-density 1-page fit' },
  ];

  const alignOptions: Array<{
    value: TextAlign;
    label: string;
    icon: typeof AlignLeft;
  }> = [
    {
      value: 'left',
      label: 'Left',
      icon: AlignLeft,
    },
    {
      value: 'justify',
      label: 'Justified',
      icon: AlignJustify,
    },
  ];

  const zoomPercent = zoom === 'sm' ? '90%' : zoom === 'lg' ? '110%' : '100%';
  const zoomLabel = zoom === 'md' ? 'Fit' : zoomPercent;
  const kbSize = byteSize ? Math.max(1, Math.round(byteSize / 1024)) : null;

  return (
    <div className="sticky top-2 z-20 inline-flex flex-wrap items-center gap-2 bg-surface/95 backdrop-blur-xs border border-border rounded-full px-3 py-1.5 shadow-md">
      {/* Template switcher with real mini PageThumbnails */}
      <Popover open={tplOpen} onOpenChange={setTplOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            aria-label={`Template: ${templateId}`}
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold text-ink hover:bg-surface-sunken transition-colors cursor-pointer"
          >
            <span>
              Template:{' '}
              {templates.find((t) => t.id === templateId)?.label ?? 'Classic'}
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent align="center" className="w-80 p-2.5">
          <div className="text-xs font-semibold text-ink mb-2 px-1">
            Choose page template
          </div>
          <div className="grid grid-cols-3 gap-2">
            {templates.map((t) => {
              const active = t.id === templateId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    onChangeTemplate(t.id);
                    setTplOpen(false);
                  }}
                  className={cn(
                    'flex flex-col items-center gap-1.5 p-2 rounded-md border text-center transition-all cursor-pointer',
                    active
                      ? 'border-accent bg-accent-50 ring-1 ring-accent'
                      : 'border-border hover:border-border-strong hover:bg-surface-sunken',
                  )}
                >
                  <PageThumbnail templateId={t.id} size="xs" />
                  <span className="text-xs font-semibold text-ink">
                    {t.label}
                  </span>
                </button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>

      {onChangeTextAlign && (
        <>
          <span aria-hidden="true" className="h-4 w-px bg-hairline" />
          <div
            role="group"
            aria-label="Section content alignment"
            className="inline-flex items-center gap-0.5 bg-surface-sunken/80 border border-hairline rounded-full p-0.5"
          >
            {alignOptions.map((opt) => {
              const Icon = opt.icon;
              const active = textAlign === opt.value;
              return (
                <Tooltip key={opt.value} content={opt.label}>
                  <button
                    type="button"
                    aria-label={opt.label}
                    aria-pressed={active}
                    onClick={() => onChangeTextAlign(opt.value)}
                    className={cn(
                      'w-6 h-6 rounded-full inline-flex items-center justify-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
                      active
                        ? 'bg-accent text-white shadow-xs'
                        : 'text-ink-muted hover:text-ink hover:bg-surface',
                    )}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </button>
                </Tooltip>
              );
            })}
          </div>
        </>
      )}

      {onToggleSkimMode && (
        <>
          <span aria-hidden="true" className="h-4 w-px bg-hairline" />
          <SkimToggle active={skimMode} onToggle={onToggleSkimMode} />
        </>
      )}

      <span aria-hidden="true" className="h-4 w-px bg-hairline" />

      {/* Zoom controls */}
      <div className="inline-flex items-center gap-1">
        <IconButton
          label="Zoom out preview"
          size="sm"
          disabled={zoom === 'sm'}
          onClick={() => onChangeZoom(zoom === 'lg' ? 'md' : 'sm')}
        >
          <ZoomOut className="w-3.5 h-3.5" />
        </IconButton>
        <Tooltip content={`Zoom: ${zoomPercent}`}>
          <span className="text-xs font-sans font-medium tabular-nums text-ink-muted px-1 cursor-help">
            {zoomLabel}
          </span>
        </Tooltip>
        <IconButton
          label="Zoom in preview"
          size="sm"
          disabled={zoom === 'lg'}
          onClick={() => onChangeZoom(zoom === 'sm' ? 'md' : 'lg')}
        >
          <ZoomIn className="w-3.5 h-3.5" />
        </IconButton>
      </div>

      <span aria-hidden="true" className="h-4 w-px bg-hairline" />

      {/* Page pager + WYSIWYG PDF badge */}
      <Tooltip content="This preview is the exported file.">
        <div className="inline-flex items-center gap-1.5 px-2 text-xs text-ink-muted tabular-nums cursor-help">
          {totalPages > 1 && onChangePage && (
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage <= 1}
              onClick={() => onChangePage(Math.max(1, currentPage - 1))}
              className="hover:text-ink disabled:opacity-40 cursor-pointer"
            >
              ‹
            </button>
          )}
          <span>
            PDF · {formatCount(Math.max(1, totalPages), 'page')}
            {kbSize ? ` · ${kbSize} KB` : ''}
          </span>
          {totalPages > 1 && onChangePage && (
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage >= totalPages}
              onClick={() => onChangePage(Math.min(totalPages, currentPage + 1))}
              className="hover:text-ink disabled:opacity-40 cursor-pointer"
            >
              ›
            </button>
          )}
        </div>
      </Tooltip>
    </div>
  );
}

/**
 * Recessed DeskPreview surface (`bg-surface-sunken rounded-xl shadow-inner p-5 lg:p-7`)
 * holding the floating PreviewToolbar pill, optional SkimLegend, and the true WYSIWYG PdfPreview.
 */
export function DeskPreview({
  documentKind,
  resumeDoc,
  coverLetterDoc,
  templateId,
  onChangeTemplate,
  textAlign = 'left',
  onChangeTextAlign,
  zoom,
  onChangeZoom,
  pageSize = 'letter',
  estimatedPages = 1,
  highlightedSourceId,
  hoveredBlockId,
  skimMode: controlledSkimMode,
  onToggleSkimMode,
  skimKeywordTerms = [],
  highlightedTerm,
  onClearHighlightedTerm,
  onArtifactReady,
  footerSlot,
}: {
  documentKind: DocumentKind;
  resumeDoc: ResumeDocument;
  coverLetterDoc: CoverLetterDocument;
  templateId: TemplateId;
  onChangeTemplate: (next: TemplateId) => void;
  textAlign?: TextAlign;
  onChangeTextAlign?: (next: TextAlign) => void;
  zoom: 'sm' | 'md' | 'lg';
  onChangeZoom: (next: 'sm' | 'md' | 'lg') => void;
  pageSize?: PageSize;
  estimatedPages?: number;
  highlightedSourceId?: string | null;
  hoveredBlockId?: string | null;
  skimMode?: boolean;
  onToggleSkimMode?: (next: boolean) => void;
  skimKeywordTerms?: string[];
  highlightedTerm?: string | null;
  onClearHighlightedTerm?: () => void;
  onArtifactReady?: (artifact: PdfPreviewArtifactInfo) => void;
  footerSlot?: React.ReactNode;
}) {
  const [currentPage, setCurrentPage] = useState(1);
  const [internalSkim, setInternalSkim] = useState(false);
  const [artifactInfo, setArtifactInfo] =
    useState<PdfPreviewArtifactInfo | null>(null);
  const effectiveSkim = controlledSkimMode ?? internalSkim;
  const handleToggleSkim = onToggleSkimMode ?? setInternalSkim;

  const activeDoc =
    documentKind === 'coverLetter' ? coverLetterDoc : resumeDoc;
  const actualPages =
    artifactInfo?.pageCount ??
    (documentKind === 'coverLetter' ? 1 : estimatedPages);

  return (
    <div className="bg-surface-sunken border border-border rounded-xl shadow-inner p-5 lg:p-7 flex flex-col items-center gap-4">
      <PreviewToolbar
        templateId={templateId}
        onChangeTemplate={onChangeTemplate}
        textAlign={textAlign}
        onChangeTextAlign={onChangeTextAlign}
        zoom={zoom}
        onChangeZoom={onChangeZoom}
        currentPage={currentPage}
        totalPages={actualPages}
        onChangePage={setCurrentPage}
        skimMode={effectiveSkim}
        onToggleSkimMode={handleToggleSkim}
        byteSize={artifactInfo?.bytes.byteLength}
      />

      {(effectiveSkim || highlightedTerm) && (
        <SkimLegend
          highlightedTerm={highlightedTerm}
          onClearHighlight={onClearHighlightedTerm}
        />
      )}

      <div className="w-full overflow-x-auto pb-2">
        <PdfPreview
          document={activeDoc}
          zoom={zoom}
          pageSize={pageSize}
          skimMode={effectiveSkim}
          skimKeywordTerms={skimKeywordTerms}
          highlightedTerm={highlightedTerm}
          highlightedSourceId={highlightedSourceId}
          hoveredBlockId={hoveredBlockId}
          onArtifactReady={(info) => {
            setArtifactInfo(info);
            onArtifactReady?.(info);
          }}
        />
      </div>

      {footerSlot && <div className="w-full">{footerSlot}</div>}
    </div>
  );
}

/**
 * Version timeline card with real 112x145 PageThumbnail rendered from stored PDF bytes,
 * "Latest" badge, "Regenerated" badge when restored from backup, 1 meta line, unified ScoreChips, compare checkbox, and `⋯` menu.
 */
export function VersionCard({
  version,
  bank,
  targetCompany = '',
  targetRole = '',
  isLatest = false,
  isSelectedForCompare,
  onToggleCompare,
  onOpenInStudio,
  onExportVersion,
  onDeleteVersion,
}: {
  version: DocumentVersion;
  bank?: BankSnapshot | null;
  targetCompany?: string;
  targetRole?: string;
  isLatest?: boolean;
  isSelectedForCompare: boolean;
  onToggleCompare: () => void;
  onOpenInStudio: () => void;
  onExportVersion: () => void;
  onDeleteVersion?: () => void;
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const formattedDate = new Date(version.createdAt).toLocaleDateString(
    'en-US',
    {
      month: 'short',
      day: 'numeric',
    },
  );

  const isCoverLetter = version.kind === 'coverLetter';
  const previewLines = isCoverLetter
    ? (version.coverLetterContent?.blocks ?? [])
        .slice(1, 3)
        .map((b) => b.text)
    : (version.content?.bullets ?? []).slice(0, 2).map((b) => b.text);

  const resumeThumbDoc =
    !isCoverLetter && bank && version.content
      ? mapToResumeDocument({
          draft: version.content,
          bank,
          versionNumber: version.number,
          templateId: version.templateId,
          voice: version.voice,
          targetCompany,
          targetRole,
          generatedAt: version.createdAt,
        })
      : undefined;

  const coverLetterThumbDoc =
    isCoverLetter && bank && version.coverLetterContent
      ? mapToCoverLetterDocument({
          draft: version.coverLetterContent,
          bank,
          versionNumber: version.number,
          templateId: version.templateId,
          targetCompany,
          targetRole,
          generatedAt: version.createdAt,
        })
      : undefined;

  const appealVal = isCoverLetter
    ? (version.letterChecks?.appeal ?? version.scores.appeal ?? 82)
    : (version.scores.appeal ?? 82);

  const checksPassed = version.letterChecks?.passedCount ?? 6;
  const checksTotal = version.letterChecks?.totalCount ?? 6;
  const checksPct = Math.round((checksPassed / Math.max(1, checksTotal)) * 100);

  return (
    <div
      className={cn(
        'bg-surface border rounded-xl p-4 transition-all flex items-start gap-4 shadow-xs',
        isSelectedForCompare
          ? 'border-accent bg-accent-50/40 ring-1 ring-accent'
          : 'border-border hover:border-border-strong',
      )}
    >
      <div className="pt-1">
        <Checkbox
          checked={isSelectedForCompare}
          onCheckedChange={onToggleCompare}
          label={`Select version ${version.number} to compare`}
        />
      </div>

      {/* Real 112x145 first-page PDF thumbnail */}
      <button
        type="button"
        onClick={onOpenInStudio}
        aria-label={`Open version ${version.number}`}
        className="group relative rounded-xs overflow-hidden cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent shrink-0"
      >
        <PageThumbnail
          pdfBytes={version.pdfBytes}
          pdfBytesBase64={version.pdfBytesBase64}
          resumeDoc={resumeThumbDoc}
          coverLetterDoc={coverLetterThumbDoc}
          templateId={version.templateId}
          size="md"
        />
      </button>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-ink truncate">
                v{version.number} · {version.label}
              </h4>
              {isLatest && <Badge tone="accent">Latest</Badge>}
              {version.regeneratedFromBackup && (
                <Badge tone="neutral">Regenerated</Badge>
              )}
            </div>
            <p className="text-xs text-ink-muted mt-0.5 truncate font-sans tabular-nums">
              {version.voice} · {version.templateId} · {version.modelId} ·{' '}
              {formattedDate}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <ScoreChip label="Match" score={version.scores.jobMatch} />
            <ScoreChip label="Appeal" score={appealVal} />
            {isCoverLetter ? (
              <ScoreChip
                label="Checks"
                score={checksPct}
                displayValue={`${checksPassed}/${checksTotal}`}
              />
            ) : (
              <ScoreChip label="ATS" score={version.scores.atsReadiness} />
            )}

            <Popover open={menuOpen} onOpenChange={setMenuOpen}>
              <PopoverTrigger asChild>
                <IconButton
                  label={`Actions for version ${version.number}`}
                  size="sm"
                >
                  <MoreHorizontal className="w-4 h-4" />
                </IconButton>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-48 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onOpenInStudio();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                >
                  <FileText className="w-3.5 h-3.5" />
                  <span>Open this version</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    onExportVersion();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>Export PDF</span>
                </button>
                {onDeleteVersion && (
                  <button
                    type="button"
                    onClick={() => {
                      setMenuOpen(false);
                      onDeleteVersion();
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger-700 rounded-sm hover:bg-danger-50 text-left cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete</span>
                  </button>
                )}
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {previewLines[0] && (
          <p className="mt-2.5 text-xs text-ink-muted line-clamp-2 leading-relaxed">
            {previewLines[0]}
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * CopyQuestionButton: copies a 1-sentence recruiter question in the posting's language (EN/FR)
 * when work-permit or salary is not stated.
 */
export function CopyQuestionButton({
  factKey,
  postingLanguage = 'en',
  roleTitle,
  company,
}: {
  factKey: 'workPermits' | 'salary';
  postingLanguage?: 'en' | 'fr';
  roleTitle?: string;
  company?: string;
}) {
  const [copied, setCopied] = useState(false);
  const question = getRecruiterQuestionTemplate(
    factKey,
    postingLanguage,
    roleTitle,
    company,
  );

  return (
    <Tooltip content={`Copy recruiter question: "${question}"`}>
      <button
        type="button"
        onClick={() => {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            void navigator.clipboard.writeText(question);
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs bg-surface border border-border hover:bg-surface-raised text-[11px] font-medium text-ink cursor-pointer"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 text-success" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3 h-3 text-ink-muted" />
            <span>Copy question</span>
          </>
        )}
      </button>
    </Tooltip>
  );
}

/**
 * FactChip: compact chip for application list rows and detail headers.
 * Conflicts show `✕` in warning/danger tone; not-stated shows `? n`; fits are quiet or hidden in list rows.
 */
export function FactChip({
  label,
  status: statusProp,
  fit,
  reason,
}: {
  label: string;
  status?: PracticalFitStatus;
  fit?: PracticalFitStatus | string;
  reason?: string;
}) {
  const status: PracticalFitStatus =
    statusProp ??
    (fit === 'conflict' || fit === 'fits' || fit === 'not-stated'
      ? fit
      : 'not-stated');

  const toneClass =
    status === 'conflict'
      ? 'bg-warning-50 text-warning-700 border-warning/40 font-semibold'
      : status === 'not-stated'
        ? 'bg-surface-sunken text-ink-muted border-hairline'
        : 'bg-surface text-ink-muted border-hairline';

  const prefix =
    status === 'conflict'
      ? '✕ '
      : status === 'not-stated'
        ? label.startsWith('?')
          ? ''
          : '? '
        : '✓ ';

  const chip = (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-xs text-[11px] font-sans border whitespace-nowrap shrink-0',
        toneClass,
      )}
    >
      {prefix}
      {label}
    </span>
  );

  if (reason) {
    return <Tooltip content={reason}>{chip}</Tooltip>;
  }
  return chip;
}

/**
 * ImportanceControl: 3-stop segmented control (`Dealbreaker | Important | Nice to know`)
 * per fact group in Settings > My preferences.
 */
export function ImportanceControl({
  value,
  onChange,
  ariaLabel = 'Fact importance',
}: {
  value: FactImportance;
  onChange: (next: FactImportance) => void;
  ariaLabel?: string;
}) {
  return (
    <SegmentedControl
      ariaLabel={ariaLabel}
      value={value}
      onValueChange={onChange}
      options={[
        { value: 'dealbreaker', label: 'Dealbreaker' },
        { value: 'important', label: 'Important' },
        { value: 'nice-to-know', label: 'Nice to know' },
      ]}
    />
  );
}

/**
 * AttentionToken: Single-token pill for the Applications list row (Attention budget = max 1 token).
 * Priority: critical fit (dealbreaker conflict) -> notable fit -> coverage gap.
 */
export function AttentionToken({
  token,
}: {
  token: AttentionTokenData | null;
}) {
  if (!token) return null;

  const toneClass =
    token.tone === 'danger'
      ? 'bg-warning-50 text-warning-700 border-warning/45 font-semibold'
      : token.tone === 'warning'
        ? 'bg-surface-sunken text-ink border-border font-medium'
        : 'bg-surface-sunken text-ink-muted border-hairline';

  const prefix =
    token.kind === 'critical-fit'
      ? '✕ '
      : token.kind === 'notable-fit'
        ? '! '
        : '';
  const cleanLabel = token.label.replace(/^[!✕✓⚠]\s*/, '');

  return (
    <Tooltip content={token.tooltip}>
      <span
        className={cn(
          'inline-flex items-center px-2 py-0.5 rounded-xs text-[11px] font-sans border whitespace-nowrap shrink-0',
          toneClass,
        )}
      >
        {prefix}
        {cleanLabel}
      </span>
    </Tooltip>
  );
}

/**
 * ViewMenu: Single compact menu button for Applications list sort (`Sort: Best fit | Recent`)
 * and filter (`Hide dealbreaker conflicts`). Replaces separate sort/toggle rows.
 */
export function ViewMenu({
  sortMode,
  onChangeSort,
  hideConflicts,
  onChangeHideConflicts,
}: {
  sortMode: 'best-fit' | 'recent';
  onChangeSort: (next: 'best-fit' | 'recent') => void;
  hideConflicts: boolean;
  onChangeHideConflicts: (next: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="secondary"
          size="sm"
          aria-label="View options: sort and filter applications"
        >
          <span>View</span>
          {hideConflicts && (
            <span className="w-1.5 h-1.5 rounded-full bg-accent shrink-0" />
          )}
          <ChevronDown className="w-3.5 h-3.5 text-ink-muted" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-3 space-y-3">
        <div className="space-y-1.5">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
            Sort applications
          </div>
          <div className="grid grid-cols-2 gap-1 bg-surface-sunken p-0.5 rounded-md border border-hairline">
            <button
              type="button"
              onClick={() => onChangeSort('best-fit')}
              className={cn(
                'px-2.5 py-1 rounded-xs text-xs font-medium cursor-pointer transition-colors',
                sortMode === 'best-fit'
                  ? 'bg-surface text-ink shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              Best fit
            </button>
            <button
              type="button"
              onClick={() => onChangeSort('recent')}
              className={cn(
                'px-2.5 py-1 rounded-xs text-xs font-medium cursor-pointer transition-colors',
                sortMode === 'recent'
                  ? 'bg-surface text-ink shadow-xs font-semibold'
                  : 'text-ink-muted hover:text-ink',
              )}
            >
              Recent
            </button>
          </div>
        </div>

        <div className="pt-2 border-t border-hairline flex items-center justify-between gap-2">
          <span className="text-xs text-ink">Hide dealbreaker conflicts</span>
          <Switch
            checked={hideConflicts}
            onCheckedChange={onChangeHideConflicts}
            label="Hide dealbreaker conflicts"
          />
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * FitStrip: One-line summary bar for Applications detail.
 * - No conflicts / flags: one quiet line `"Fits your preferences ✓"` with expand button.
 * - Conflicts or flags: summary bar `"1 dealbreaker · 1 flag"` with up to 3 salient pills
 *   (e.g. `"✕ Work permit"`) and `"+n"`, plus expand/collapse button.
 * Scores always stay above the fold regardless of how many facts exist (5, 10, or 15).
 */
export function FitStrip({
  evaluation,
  expanded,
  onToggleExpanded,
  onOpenPreferences,
}: {
  evaluation: PracticalFitEvaluation;
  expanded: boolean;
  onToggleExpanded: () => void;
  onOpenPreferences?: () => void;
}) {
  const salientItems = evaluation.salientItems;
  const visiblePills = salientItems.slice(0, 3);
  const overflowCount = Math.max(0, salientItems.length - 3);

  return (
    <div
      className={cn(
        'flex flex-wrap items-center justify-between gap-2.5 rounded-lg border px-3.5 py-2 text-xs transition-colors',
        evaluation.dealbreakerCount > 0
          ? 'bg-warning-50/45 border-warning/45'
          : 'bg-surface-sunken border-hairline',
      )}
    >
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        {evaluation.isQuiet ? (
          <span className="inline-flex items-center gap-1.5 font-semibold text-success-700">
            <Check className="w-3.5 h-3.5 text-success shrink-0" />
            <span>Fits your preferences ✓</span>
          </span>
        ) : (
          <span className="font-semibold text-ink">
            {evaluation.summaryLabel}
          </span>
        )}

        {visiblePills.map((item) => {
          const isCritical = item.salience === 'critical';
          return (
            <Tooltip key={item.key} content={`${item.label}: ${item.valueLabel} — ${item.reason}`}>
              <span
                className={cn(
                  'inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-[11px] border whitespace-nowrap',
                  isCritical
                    ? 'bg-warning-50 text-warning-700 border-warning/45 font-semibold'
                    : 'bg-surface text-ink border-border font-medium',
                )}
              >
                <span>{item.status === 'conflict' ? '✕' : '?'}</span>
                <span>{item.shortLabel}</span>
              </span>
            </Tooltip>
          );
        })}

        {overflowCount > 0 && (
          <span className="inline-flex items-center px-1.5 py-0.5 rounded-xs text-[11px] bg-surface border border-hairline text-ink-muted font-medium">
            +{overflowCount}
          </span>
        )}
      </div>

      <div className="flex items-center gap-3 shrink-0">
        {onOpenPreferences && (
          <button
            type="button"
            onClick={onOpenPreferences}
            className="text-xs font-medium text-ink-muted hover:text-ink underline cursor-pointer"
          >
            Preferences
          </button>
        )}
        <button
          type="button"
          onClick={onToggleExpanded}
          aria-expanded={expanded}
          className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline cursor-pointer"
        >
          <span>
            {expanded
              ? 'Hide facts'
              : `Job facts (${evaluation.orderedItems.length})`}
          </span>
          <ChevronDown
            className={cn(
              'w-3.5 h-3.5 transition-transform',
              expanded && 'rotate-180',
            )}
          />
        </button>
      </div>
    </div>
  );
}

/**
 * Plain-language tooltip for fact extraction source (replaces "Quote (rules)" jargon).
 */
function formatFactSourceTooltip(source: 'rules' | 'llm' | 'user'): string {
  if (source === 'user') return 'Set by you';
  if (source === 'llm') return 'Checked by your local AI';
  return 'Found in the posting';
}

/**
 * JobFactsTable: Dense scannable table (rows >= 36px) replacing the 5-card grid.
 * - "Needs a look" (critical + notable salience, or any conflict/review) rows appear first as full table rows.
 * - "Fits (n)" quiet items collapse into a single summary line with a "Show all" toggle.
 * - Scales cleanly to 5, 10, or 15+ facts without wrapping into multi-row card grids.
 */
export function JobFactsTable({
  facts,
  evaluation,
  roleTitle,
  company,
  readOnly = false,
  onUpdateFacts,
  onOverrideFact,
  onShowQuoteInPosting,
  onShowInPosting,
  onOpenPreferences,
}: {
  facts: JobFacts;
  evaluation: PracticalFitEvaluation;
  roleTitle?: string;
  company?: string;
  readOnly?: boolean;
  onUpdateFacts?: (patch: Partial<JobFacts>) => void;
  onOverrideFact?: (
    key: 'location' | 'workPermits' | 'languages' | 'salary' | 'employmentType',
    nextValue: unknown,
  ) => void;
  onShowQuoteInPosting?: (quote: string) => void;
  onShowInPosting?: (quote: string) => void;
  onCopyText?: (text: string) => void;
  onOpenPreferences?: () => void;
}) {
  const [showQuietFits, setShowQuietFits] = useState(false);
  const [openEditKey, setOpenEditKey] = useState<string | null>(null);

  const effectiveShowQuote = onShowQuoteInPosting ?? onShowInPosting;
  const canEdit = !readOnly && Boolean(onUpdateFacts || onOverrideFact);

  const applyFactPatch = <
    K extends
      | 'location'
      | 'workPermits'
      | 'languages'
      | 'salary'
      | 'employmentType',
  >(
    key: K,
    nextEntry: JobFacts[K],
  ) => {
    onUpdateFacts?.({ [key]: nextEntry } as Partial<JobFacts>);
    onOverrideFact?.(key, nextEntry.value);
  };

  const needsLookItems = evaluation.orderedItems.filter(
    (item) => item.salience !== 'quiet' || item.status !== 'fits',
  );
  const quietFitItems = evaluation.orderedItems.filter(
    (item) => item.salience === 'quiet' && item.status === 'fits',
  );

  const renderEditPopoverContent = (item: EvaluatedFactItem, close: () => void) => {
    if (item.key === 'location') {
      const locVal = facts.location.value;
      return (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-ink">
            Override work mode
          </div>
          <Select
            ariaLabel="Work mode"
            value={locVal.workMode}
            onValueChange={(val) => {
              applyFactPatch('location', {
                ...facts.location,
                value: {
                  ...locVal,
                  workMode: val as JobFacts['location']['value']['workMode'],
                },
                confidence: 'high',
                source: 'user',
              });
              close();
            }}
            options={[
              { value: 'remote', label: 'Remote' },
              { value: 'hybrid', label: 'Hybrid' },
              { value: 'on-site', label: 'On-site' },
              { value: 'unspecified', label: 'Not stated' },
            ]}
          />
        </div>
      );
    }

    if (item.key === 'workPermits') {
      const permVal = facts.workPermits.value;
      return (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-ink">
            Override sponsorship policy
          </div>
          <Select
            ariaLabel="Sponsorship policy"
            value={permVal.sponsorship}
            onValueChange={(val) => {
              applyFactPatch('workPermits', {
                ...facts.workPermits,
                value: {
                  ...permVal,
                  sponsorship:
                    val as JobFacts['workPermits']['value']['sponsorship'],
                },
                confidence: 'high',
                source: 'user',
              });
              close();
            }}
            options={[
              { value: 'yes', label: 'Sponsorship offered' },
              { value: 'no', label: 'No sponsorship' },
              { value: 'conditional', label: 'Case-by-case' },
              { value: 'not-stated', label: 'Not stated' },
            ]}
          />
        </div>
      );
    }

    if (item.key === 'languages') {
      const langVal = facts.languages.value;
      return (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-ink">
            Override required languages
          </div>
          <div className="flex flex-col gap-1">
            {[
              { label: 'English only', langs: ['English'] },
              { label: 'French only', langs: ['French'] },
              {
                label: 'English + French (Bilingual)',
                langs: ['English', 'French'],
              },
              { label: 'Not stated', langs: [] },
            ].map((opt) => (
              <button
                key={opt.label}
                type="button"
                onClick={() => {
                  applyFactPatch('languages', {
                    ...facts.languages,
                    value: {
                      ...langVal,
                      required: opt.langs.map((l) => ({
                        language: l,
                        level: 'fluent',
                      })),
                    },
                    confidence: 'high',
                    source: 'user',
                  });
                  close();
                }}
                className="text-left px-2 py-1.5 rounded-xs text-xs text-ink hover:bg-surface-raised cursor-pointer"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      );
    }

    if (item.key === 'employmentType') {
      const empVal = facts.employmentType.value;
      return (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-ink">
            Override employment type
          </div>
          <Select
            ariaLabel="Employment type"
            value={empVal.type}
            onValueChange={(val) => {
              applyFactPatch('employmentType', {
                ...facts.employmentType,
                value: {
                  type: val as JobFacts['employmentType']['value']['type'],
                },
                confidence: 'high',
                source: 'user',
              });
              close();
            }}
            options={[
              { value: 'full-time', label: 'Full-time' },
              { value: 'part-time', label: 'Part-time' },
              { value: 'contract', label: 'Contract' },
              { value: 'internship', label: 'Internship' },
              { value: 'temporary', label: 'Temporary' },
              { value: 'unspecified', label: 'Not stated' },
            ]}
          />
        </div>
      );
    }

    return null;
  };

  const renderRow = (item: EvaluatedFactItem) => {
    const canEditThisRow =
      canEdit &&
      (item.key === 'location' ||
        item.key === 'workPermits' ||
        item.key === 'languages' ||
        item.key === 'employmentType');

    const statusBadge =
      item.status === 'conflict' ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-[11px] font-semibold bg-warning-50 text-warning-700 border border-warning/45">
          ✕ Conflict
        </span>
      ) : item.status === 'fits' ? (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-[11px] font-medium bg-surface-sunken text-ink-muted border border-hairline">
          ✓ Fits
        </span>
      ) : (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-xs text-[11px] font-medium bg-surface-sunken text-ink-subtle border border-hairline">
          ? Not stated
        </span>
      );

    const sourceTip = formatFactSourceTooltip(item.source);

    return (
      <div
        key={item.key}
        className={cn(
          'min-h-[38px] px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 text-xs transition-colors',
          item.status === 'conflict' && item.salience === 'critical'
            ? 'bg-warning-50/35'
            : 'bg-surface hover:bg-surface-raised/60',
        )}
      >
        {/* Left: label + value + reason */}
        <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
          <span className="font-semibold text-ink w-32 shrink-0 truncate">
            {item.label}
          </span>
          <Tooltip content={`${item.reason} (${sourceTip})`}>
            <span className="font-medium text-ink truncate max-w-[18rem] cursor-help">
              {item.valueLabel}
            </span>
          </Tooltip>
          <span className="text-ink-muted hidden sm:inline truncate max-w-[20rem]">
            · {item.reason}
          </span>
        </div>

        {/* Right: status badge + evidence "Show in posting" + CopyQuestion + Edit */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {item.confidence === 'review' && (
            <span className="px-1.5 py-0.5 rounded-xs text-[10px] font-semibold bg-warning-50 text-warning-700 border border-warning/35">
              Needs review
            </span>
          )}

          {statusBadge}

          {item.evidenceQuotes.length > 0 && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  title={sourceTip}
                  className="text-[11px] text-ink-muted hover:text-ink underline cursor-pointer"
                >
                  Show in posting
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-72 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-ink">
                    Posting evidence
                  </span>
                  <span className="text-[10px] text-ink-muted">
                    {sourceTip}
                  </span>
                </div>
                {item.evidenceQuotes.map((q, idx) => (
                  <blockquote
                    key={idx}
                    className="text-xs text-ink-muted italic bg-surface-sunken p-2 rounded-sm border-l-2 border-accent"
                  >
                    “{q}”
                  </blockquote>
                ))}
                {effectiveShowQuote && item.evidenceQuotes[0] && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => effectiveShowQuote(item.evidenceQuotes[0])}
                  >
                    Highlight in posting
                  </Button>
                )}
              </PopoverContent>
            </Popover>
          )}

          {item.canAskRecruiter && item.status === 'not-stated' && (
            <CopyQuestionButton
              factKey={item.key === 'salary' ? 'salary' : 'workPermits'}
              postingLanguage="en"
              roleTitle={roleTitle}
              company={company}
            />
          )}

          {canEditThisRow && (
            <Popover
              open={openEditKey === item.key}
              onOpenChange={(o) => setOpenEditKey(o ? item.key : null)}
            >
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label={`Edit ${item.label}`}
                  className="inline-flex items-center gap-1 text-[11px] text-ink-muted hover:text-ink font-medium cursor-pointer"
                >
                  <Pencil className="w-3 h-3" />
                  <span>Edit</span>
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-64 p-3 space-y-2.5">
                {renderEditPopoverContent(item, () => setOpenEditKey(null))}
              </PopoverContent>
            </Popover>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-2" aria-label="Job facts and practical fit">
      <div className="border border-border rounded-lg overflow-hidden bg-surface divide-y divide-hairline shadow-xs">
        {/* Header bar */}
        <div className="px-3.5 py-2 bg-surface-sunken flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">
              Practical fit: {evaluation.summaryLabel}
            </span>
            {needsLookItems.length > 0 && (
              <span className="text-ink-muted">
                · Needs a look ({needsLookItems.length})
              </span>
            )}
          </div>
          {onOpenPreferences && (
            <button
              type="button"
              onClick={onOpenPreferences}
              className="text-xs font-medium text-accent hover:underline cursor-pointer"
            >
              Edit my preferences
            </button>
          )}
        </div>

        {/* Salient / Needs a look rows first */}
        {needsLookItems.map(renderRow)}

        {/* Quiet Fits (n) collapsed into a one-line list unless expanded */}
        {quietFitItems.length > 0 && (
          <>
            <div className="min-h-[38px] px-3.5 py-2 bg-surface-sunken/55 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                <span className="inline-flex items-center gap-1 font-semibold text-success-700 shrink-0">
                  <Check className="w-3.5 h-3.5 text-success" />
                  <span>Fits ({quietFitItems.length}):</span>
                </span>
                <span className="text-ink-muted truncate">
                  {quietFitItems
                    .map((i) => `${i.shortLabel} (${i.valueLabel})`)
                    .join(' · ')}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowQuietFits((v) => !v)}
                className="text-xs font-medium text-accent hover:underline cursor-pointer shrink-0"
              >
                {showQuietFits ? 'Collapse fits' : 'Show all'}
              </button>
            </div>
            {showQuietFits && quietFitItems.map(renderRow)}
          </>
        )}
      </div>
    </div>
  );
}

/**
 * JobFactsStrip & PracticalFitSummary aliases preserved for callers; render the scalable JobFactsTable.
 */
export const JobFactsStrip = JobFactsTable;
export const PracticalFitSummary = JobFactsTable;


/**
 * ApplicationDetailsForm: Edits optional postingUrl (opens in new tab with rel="noopener noreferrer"),
 * appliedDate (auto-set when status becomes Applied, editable), and notes (plain text, auto-grow).
 */
export function ApplicationDetailsForm({
  postingUrl = '',
  appliedDate = '',
  notes = '',
  onSave,
}: {
  postingUrl?: string;
  appliedDate?: string;
  notes?: string;
  onSave: (patch: {
    postingUrl?: string;
    appliedDate?: string;
    notes?: string;
  }) => void;
}) {
  const [urlVal, setUrlVal] = useState(postingUrl);
  const [dateVal, setDateVal] = useState(appliedDate);
  const [notesVal, setNotesVal] = useState(notes);

  useEffect(() => {
    setUrlVal(postingUrl);
    setDateVal(appliedDate);
    setNotesVal(notes);
  }, [postingUrl, appliedDate, notes]);

  return (
    <div className="bg-surface border border-border rounded-xl p-4 space-y-3 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-ink-muted">
          Application details & notes
        </h3>
        {urlVal.trim() && (
          <a
            href={urlVal.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
          >
            <Link2 className="w-3.5 h-3.5" />
            <span>Open posting ↗</span>
          </a>
        )}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label
            htmlFor="app-detail-posting-url"
            className="block text-xs font-medium text-ink mb-1"
          >
            Posting URL
          </label>
          <Input
            id="app-detail-posting-url"
            type="url"
            value={urlVal}
            onChange={(e) => setUrlVal(e.target.value)}
            onBlur={() => onSave({ postingUrl: urlVal.trim() || undefined })}
            placeholder="https://careers.example.com/jobs/..."
          />
        </div>
        <div>
          <label
            htmlFor="app-detail-applied-date"
            className="block text-xs font-medium text-ink mb-1"
          >
            Applied date
          </label>
          <Input
            id="app-detail-applied-date"
            type="date"
            value={dateVal ? dateVal.slice(0, 10) : ''}
            onChange={(e) => {
              const next = e.target.value;
              setDateVal(next);
              onSave({ appliedDate: next || undefined });
            }}
          />
        </div>
      </div>

      <div>
        <label
          htmlFor="app-detail-notes"
          className="block text-xs font-medium text-ink mb-1"
        >
          Private notes
        </label>
        <AutoGrowTextarea
          id="app-detail-notes"
          minRows={2}
          value={notesVal}
          onChange={(e) => setNotesVal(e.target.value)}
          onBlur={() => onSave({ notes: notesVal.trim() || undefined })}
          placeholder="Recruiter contact, referral notes, interview prep, or follow-up dates…"
        />
      </div>
    </div>
  );
}

const CANONICAL_COUNTRY_OPTIONS = Array.from(
  new Set(Object.values(COUNTRY_ALIASES)),
)
  .sort()
  .map((c) => ({ id: c, value: c, label: c }));

const METRO_TYPEAHEAD_OPTIONS = METRO_AREAS.map((m) => ({
  id: m.id,
  value: m.label,
  label: m.label,
  sublabel: `${m.country} · ${m.aliases.slice(0, 3).join(', ')}`,
}));

const LANGUAGE_TYPEAHEAD_OPTIONS = KNOWN_LANGUAGES.map((l) => ({
  id: l.code,
  value: l.label,
  label: l.label,
}));

function formatNumberWithCommas(raw: string): string {
  const digits = raw.replace(/[^\d]/g, '');
  if (!digits) return '';
  return Number(digits).toLocaleString('en-US');
}

/**
 * PreferencesForm for Settings > My preferences.
 * Stored only in the browser; never sent to any AI.
 * Includes:
 * - TypeaheadField for Home city/metro and Home country (with unrecognized warning)
 * - MultiSelectChips for Authorized countries and Citizenships
 * - Languages typeahead excluding already-selected languages + inline level selector
 * - Formatted salary floor with thousands separators + currency + period (year, month, hour)
 * - ImportanceControl (Dealbreaker | Important | Nice to know) per fact group
 */
export function PreferencesForm({
  preferences,
  onSave,
}: {
  preferences: UserPreferences;
  onSave: (next: Partial<UserPreferences>) => void;
}) {
  const [city, setCity] = useState(preferences.homeLocation.city);
  const [country, setCountry] = useState(preferences.homeLocation.country);
  const [newLangQuery, setNewLangQuery] = useState('');
  const [newLangLevel, setNewLangLevel] = useState<
    'basic' | 'conversational' | 'fluent' | 'native'
  >('fluent');
  const [salaryDisplay, setSalaryDisplay] = useState(
    preferences.salaryFloor?.amount
      ? preferences.salaryFloor.amount.toLocaleString('en-US')
      : '',
  );
  const [salaryCurrency, setSalaryCurrency] = useState(
    preferences.salaryFloor?.currency || 'USD',
  );
  const [salaryPeriod, setSalaryPeriod] = useState<'year' | 'month' | 'hour'>(
    preferences.salaryFloor?.period || 'year',
  );

  useEffect(() => {
    setCity(preferences.homeLocation.city);
    setCountry(preferences.homeLocation.country);
    setSalaryDisplay(
      preferences.salaryFloor?.amount
        ? preferences.salaryFloor.amount.toLocaleString('en-US')
        : '',
    );
    setSalaryCurrency(preferences.salaryFloor?.currency || 'USD');
    setSalaryPeriod(preferences.salaryFloor?.period || 'year');
  }, [preferences]);

  const recognizedMetro = city.trim()
    ? Boolean(findMetroAreaEntry(city.trim()))
    : true;
  const recognizedCountry = country.trim()
    ? Boolean(
        COUNTRY_ALIASES[country.trim().toLowerCase()] ||
          CANONICAL_COUNTRY_OPTIONS.some(
            (c) => c.value.toLowerCase() === country.trim().toLowerCase(),
          ),
      )
    : true;

  const setFactImportance = (key: FactKey, nextImp: FactImportance) => {
    onSave({
      importance: {
        ...(preferences.importance ?? {}),
        [key]: nextImp,
      },
    });
  };

  const getFactImportance = (key: FactKey): FactImportance =>
    preferences.importance?.[key] ??
    (FACT_KIND_REGISTRY.find((r) => r.id === key)?.defaultImportance ?? 'important');

  const toggleWorkMode = (mode: 'remote' | 'hybrid' | 'on-site') => {
    const exists = preferences.acceptedWorkModes.includes(mode);
    const next = exists
      ? preferences.acceptedWorkModes.filter((m) => m !== mode)
      : [...preferences.acceptedWorkModes, mode];
    onSave({ acceptedWorkModes: next.length > 0 ? next : ['remote'] });
  };

  const toggleEmpType = (
    t: 'full-time' | 'part-time' | 'contract' | 'internship' | 'temporary',
  ) => {
    const exists = preferences.acceptedEmploymentTypes.includes(t);
    const next = exists
      ? preferences.acceptedEmploymentTypes.filter((x) => x !== t)
      : [...preferences.acceptedEmploymentTypes, t];
    onSave({
      acceptedEmploymentTypes: next.length > 0 ? next : ['full-time'],
    });
  };

  const handleAddLanguage = (
    lang: string,
    level: 'basic' | 'conversational' | 'fluent' | 'native' = newLangLevel,
  ) => {
    const clean = lang.trim();
    if (!clean) return;
    const filtered = preferences.spokenLanguages.filter(
      (l) => l.language.toLowerCase() !== clean.toLowerCase(),
    );
    onSave({
      spokenLanguages: [...filtered, { language: clean, level }],
    });
    setNewLangQuery('');
  };

  const handleUpdateLanguageLevel = (
    lang: string,
    level: 'basic' | 'conversational' | 'fluent' | 'native',
  ) => {
    onSave({
      spokenLanguages: preferences.spokenLanguages.map((l) =>
        l.language.toLowerCase() === lang.toLowerCase() ? { ...l, level } : l,
      ),
    });
  };

  const handleRemoveLanguage = (lang: string) => {
    onSave({
      spokenLanguages: preferences.spokenLanguages.filter(
        (l) => l.language.toLowerCase() !== lang.toLowerCase(),
      ),
    });
  };

  const selectedLanguageNamesLower = new Set(
    preferences.spokenLanguages.map((l) => l.language.toLowerCase()),
  );
  const availableLanguageOptions = LANGUAGE_TYPEAHEAD_OPTIONS.filter(
    (opt) => !selectedLanguageNamesLower.has(opt.value.toLowerCase()),
  );
  const quickPresetLanguages = [
    { lang: 'English', level: 'native' as const },
    { lang: 'French', level: 'fluent' as const },
    { lang: 'Spanish', level: 'conversational' as const },
    { lang: 'German', level: 'conversational' as const },
  ].filter((p) => !selectedLanguageNamesLower.has(p.lang.toLowerCase()));

  const commitSalary = (
    rawDisplay: string,
    cur: string,
    per: 'year' | 'month' | 'hour',
  ) => {
    const digits = rawDisplay.replace(/[^\d]/g, '');
    const num = digits ? Number(digits) : 0;
    onSave({
      salaryFloor:
        num > 0
          ? {
              amount: num,
              currency: cur,
              period: per,
            }
          : undefined,
    });
  };

  return (
    <div className="space-y-6">
      {/* Privacy banner */}
      <div className="bg-surface-sunken border border-border rounded-lg px-4 py-3 flex items-center gap-2.5 text-xs text-ink-muted">
        <Lock className="w-4 h-4 text-accent shrink-0" />
        <span>
          Stored only in this browser. Matching runs on your computer and your preferences are never sent to any AI.
        </span>
      </div>

      {/* 1. Location & Work modes */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-ink">
              Location & work mode
            </div>
            <p className="text-xs text-ink-muted">
              Used to check remote, hybrid, and metro-area compatibility.
            </p>
          </div>
          <ImportanceControl
            ariaLabel="Location importance"
            value={getFactImportance('location')}
            onChange={(next) => setFactImportance('location', next)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label
              htmlFor="pref-home-city"
              className="block text-xs font-medium text-ink"
            >
              Home city / metro area
            </label>
            <TypeaheadField
              id="pref-home-city"
              value={city}
              options={METRO_TYPEAHEAD_OPTIONS}
              placeholder="e.g. San Francisco Bay Area, Montreal, Paris"
              onChange={(next) => setCity(next)}
              onSelect={(selected) => {
                const metro = findMetroAreaEntry(selected);
                const nextCountry = metro?.country || country;
                setCity(selected);
                if (metro?.country) setCountry(metro.country);
                onSave({
                  homeLocation: {
                    city: selected.trim(),
                    region: preferences.homeLocation.region || '',
                    country: nextCountry.trim(),
                  },
                });
              }}
              onBlur={() =>
                onSave({
                  homeLocation: {
                    city: city.trim(),
                    region: preferences.homeLocation.region || '',
                    country: country.trim(),
                  },
                })
              }
            />
            {!recognizedMetro && (
              <p className="text-[11px] text-warning-700">
                Not recognized: matching by exact name only.
              </p>
            )}
          </div>

          <div className="space-y-1">
            <label
              htmlFor="pref-home-country"
              className="block text-xs font-medium text-ink"
            >
              Home country
            </label>
            <TypeaheadField
              id="pref-home-country"
              value={country}
              options={CANONICAL_COUNTRY_OPTIONS}
              placeholder="e.g. United States, Canada, France"
              onChange={(next) => setCountry(next)}
              onSelect={(selected) => {
                setCountry(selected);
                onSave({
                  homeLocation: {
                    city: city.trim(),
                    region: preferences.homeLocation.region || '',
                    country: selected.trim(),
                  },
                });
              }}
              onBlur={() =>
                onSave({
                  homeLocation: {
                    city: city.trim(),
                    region: preferences.homeLocation.region || '',
                    country: country.trim(),
                  },
                })
              }
            />
            {!recognizedCountry && (
              <p className="text-[11px] text-warning-700">
                Not recognized: matching by exact name only.
              </p>
            )}
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="text-xs font-medium text-ink">Accepted work modes</div>
          <div className="flex flex-wrap items-center gap-2">
            {(['remote', 'hybrid', 'on-site'] as const).map((mode) => {
              const checked = preferences.acceptedWorkModes.includes(mode);
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={checked}
                  onClick={() => toggleWorkMode(mode)}
                  className={cn(
                    'px-3 py-1.5 rounded-md text-xs font-medium border transition-colors cursor-pointer capitalize',
                    checked
                      ? 'bg-accent-50 text-accent-700 border-accent/35 font-semibold'
                      : 'bg-surface text-ink-muted border-border hover:text-ink',
                  )}
                >
                  {checked ? '✓ ' : ''}
                  {mode}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-6 pt-2">
            <div className="flex items-center gap-2.5">
              <Switch
                checked={preferences.sameMetroOnly}
                onCheckedChange={(v) => onSave({ sameMetroOnly: v })}
                label="Hybrid or onsite in my metro area only"
              />
              <span className="text-xs text-ink">
                Hybrid/on-site in my metro area only
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <Switch
                checked={preferences.openToRelocation}
                onCheckedChange={(v) => onSave({ openToRelocation: v })}
                label="Open to relocation"
              />
              <span className="text-xs text-ink">Open to relocation</span>
            </div>
          </div>
        </div>
      </div>

      {/* 2. Work authorization & sponsorship */}
      <div className="space-y-3 pt-4 border-t border-hairline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-ink">
              Work permit & sponsorship
            </div>
            <p className="text-xs text-ink-muted">
              Flags roles that refuse sponsorship or require citizenship you do not hold.
            </p>
          </div>
          <ImportanceControl
            ariaLabel="Work permit importance"
            value={getFactImportance('workPermits')}
            onChange={(next) => setFactImportance('workPermits', next)}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label
              htmlFor="pref-auth-countries"
              className="block text-xs font-medium text-ink mb-1"
            >
              Countries where you are authorized to work without sponsorship
            </label>
            <MultiSelectChips
              id="pref-auth-countries"
              values={preferences.authorizedCountries}
              options={CANONICAL_COUNTRY_OPTIONS}
              onChange={(next) => onSave({ authorizedCountries: next })}
              placeholder="Add country (e.g. United States, Canada)…"
              ariaLabel="Authorized countries"
            />
          </div>
          <div>
            <label
              htmlFor="pref-citizenships"
              className="block text-xs font-medium text-ink mb-1"
            >
              Citizenships
            </label>
            <MultiSelectChips
              id="pref-citizenships"
              values={preferences.citizenships}
              options={CANONICAL_COUNTRY_OPTIONS}
              onChange={(next) => onSave({ citizenships: next })}
              placeholder="Add citizenship…"
              ariaLabel="Citizenships"
            />
          </div>
        </div>

        <div className="flex items-center gap-2.5 pt-1">
          <Switch
            checked={preferences.needsSponsorship === 'yes'}
            onCheckedChange={(v) =>
              onSave({ needsSponsorship: v ? 'yes' : 'no' })
            }
            label="I require visa sponsorship"
          />
          <span className="text-xs text-ink">
            I require employer visa sponsorship
          </span>
        </div>
      </div>

      {/* 3. Spoken languages */}
      <div className="space-y-3 pt-4 border-t border-hairline">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-ink">
              Spoken languages
            </div>
            <p className="text-xs text-ink-muted">
              Matches language requirements and proficiency levels in postings.
            </p>
          </div>
          <ImportanceControl
            ariaLabel="Languages importance"
            value={getFactImportance('languages')}
            onChange={(next) => setFactImportance('languages', next)}
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {preferences.spokenLanguages.map((l) => (
            <div
              key={l.language}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-surface-sunken border border-border text-ink"
            >
              <span className="font-semibold">{l.language}</span>
              <Select
                ariaLabel={`${l.language} proficiency level`}
                value={l.level}
                onValueChange={(lvl) =>
                  handleUpdateLanguageLevel(
                    l.language,
                    lvl as 'basic' | 'conversational' | 'fluent' | 'native',
                  )
                }
                options={[
                  { value: 'basic', label: 'Basic' },
                  { value: 'conversational', label: 'Conversational' },
                  { value: 'fluent', label: 'Fluent' },
                  { value: 'native', label: 'Native' },
                ]}
              />
              <button
                type="button"
                aria-label={`Remove ${l.language}`}
                onClick={() => handleRemoveLanguage(l.language)}
                className="text-ink-subtle hover:text-danger-700 cursor-pointer p-0.5"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* Add language via typeahead + level selector */}
        <div className="flex flex-wrap items-center gap-2 max-w-md">
          <div className="flex-1 min-w-[180px]">
            <TypeaheadField
              value={newLangQuery}
              options={availableLanguageOptions}
              onChange={setNewLangQuery}
              onSelect={(selected) => handleAddLanguage(selected, newLangLevel)}
              placeholder="Add a language (e.g. Spanish, Mandarin)…"
              ariaLabel="Add spoken language"
            />
          </div>
          <Select
            ariaLabel="New language proficiency level"
            value={newLangLevel}
            onValueChange={(lvl) =>
              setNewLangLevel(
                lvl as 'basic' | 'conversational' | 'fluent' | 'native',
              )
            }
            options={[
              { value: 'basic', label: 'Basic' },
              { value: 'conversational', label: 'Conversational' },
              { value: 'fluent', label: 'Fluent' },
              { value: 'native', label: 'Native' },
            ]}
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!newLangQuery.trim()}
            onClick={() => handleAddLanguage(newLangQuery, newLangLevel)}
          >
            Add
          </Button>
        </div>

        {quickPresetLanguages.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            {quickPresetLanguages.map((preset) => (
              <button
                key={preset.lang}
                type="button"
                onClick={() => handleAddLanguage(preset.lang, preset.level)}
                className="px-2.5 py-1 rounded-xs text-xs bg-surface border border-border hover:bg-surface-raised text-ink-muted hover:text-ink cursor-pointer"
              >
                + {preset.lang} ({preset.level})
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 4. Salary floor & 5. Employment types */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-hairline">
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <label
              htmlFor="pref-salary-floor"
              className="block text-sm font-semibold text-ink"
            >
              Salary floor (optional)
            </label>
            <ImportanceControl
              ariaLabel="Salary importance"
              value={getFactImportance('salary')}
              onChange={(next) => setFactImportance('salary', next)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-36">
              <Input
                id="pref-salary-floor"
                type="text"
                inputMode="numeric"
                value={salaryDisplay}
                onChange={(e) =>
                  setSalaryDisplay(formatNumberWithCommas(e.target.value))
                }
                onBlur={() =>
                  commitSalary(salaryDisplay, salaryCurrency, salaryPeriod)
                }
                placeholder="e.g. 165,000"
              />
            </div>
            <Select
              ariaLabel="Salary currency"
              value={salaryCurrency}
              onValueChange={(cur) => {
                setSalaryCurrency(cur);
                commitSalary(salaryDisplay, cur, salaryPeriod);
              }}
              options={[
                { value: 'USD', label: 'USD ($)' },
                { value: 'CAD', label: 'CAD ($)' },
                { value: 'EUR', label: 'EUR (€)' },
                { value: 'GBP', label: 'GBP (£)' },
              ]}
            />
            <Select
              ariaLabel="Salary period"
              value={salaryPeriod}
              onValueChange={(per) => {
                const nextPer = per as 'year' | 'month' | 'hour';
                setSalaryPeriod(nextPer);
                commitSalary(salaryDisplay, salaryCurrency, nextPer);
              }}
              options={[
                { value: 'year', label: 'per year' },
                { value: 'month', label: 'per month' },
                { value: 'hour', label: 'per hour' },
              ]}
            />
          </div>
        </div>

        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm font-semibold text-ink">
              Employment types
            </div>
            <ImportanceControl
              ariaLabel="Employment type importance"
              value={getFactImportance('employmentType')}
              onChange={(next) => setFactImportance('employmentType', next)}
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                'full-time',
                'part-time',
                'contract',
                'internship',
                'temporary',
              ] as const
            ).map((t) => {
              const active = preferences.acceptedEmploymentTypes.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={active}
                  onClick={() => toggleEmpType(t)}
                  className={cn(
                    'px-2.5 py-1 rounded-md text-xs border transition-colors cursor-pointer capitalize',
                    active
                      ? 'bg-accent-50 text-accent-700 border-accent/35 font-semibold'
                      : 'bg-surface text-ink-muted border-border hover:text-ink',
                  )}
                >
                  {active ? '✓ ' : ''}
                  {t}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * QuickCheckDialog: Full-width two-pane dialog opened by "New application" (⌘N) and ⌘K ("Quick check a posting").
 * Left pane: paste posting, auto-detects editable company and role.
 * Right pane: updates (debounced 350ms) with EstimateRing (5-pt band capped at 95), JobFactsTable,
 * CoverageSummary, and plain-language verdict.
 * Footer: Start tailoring (primary), Save as prospect (secondary), Discard (text button).
 */
export function QuickCheckDialog({
  open,
  onOpenChange,
  onEvaluatePosting,
  onEvaluate,
  onStartTailoring,
  onSaveAsProspect,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEvaluatePosting?: (
    rawPosting: string,
    overrides?: { company?: string; roleTitle?: string },
  ) => Promise<QuickCheckVerdict>;
  onEvaluate?: (params: {
    jobDescription: string;
    company?: string;
    roleTitle?: string;
  }) => Promise<QuickCheckVerdict>;
  onStartTailoring: (params: {
    rawPosting: string;
    jobDescription?: string;
    company?: string;
    roleTitle?: string;
  }) => Promise<unknown>;
  onSaveAsProspect: (params: {
    rawPosting: string;
    jobDescription?: string;
    company?: string;
    roleTitle?: string;
  }) => Promise<unknown>;
}) {
  const [rawPosting, setRawPosting] = useState('');
  const [companyOverride, setCompanyOverride] = useState('');
  const [roleOverride, setRoleOverride] = useState('');
  const [verdict, setVerdict] = useState<QuickCheckVerdict | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      const overrides = {
        company: companyOverride.trim() || undefined,
        roleTitle: roleOverride.trim() || undefined,
      };
      const evalPromise = onEvaluatePosting
        ? onEvaluatePosting(rawPosting, overrides)
        : onEvaluate
          ? onEvaluate({
              jobDescription: rawPosting,
              ...overrides,
            })
          : null;
      if (evalPromise) {
        if (rawPosting.trim()) {
          setIsEvaluating(true);
        }
        void evalPromise
          .then((res) => {
            if (!cancelled) {
              setVerdict(res);
            }
          })
          .finally(() => {
            if (!cancelled) {
              setIsEvaluating(false);
            }
          });
      }
    }, rawPosting.trim() ? 350 : 0);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [rawPosting, companyOverride, roleOverride, open, onEvaluatePosting, onEvaluate]);

  const effectiveCompany =
    companyOverride.trim() || verdict?.detectedCompany || '';
  const effectiveRole =
    roleOverride.trim() || verdict?.detectedRoleTitle || '';

  const handleStartTailoring = async () => {
    setIsBusy(true);
    try {
      await onStartTailoring({
        rawPosting,
        company: effectiveCompany || 'Target Company',
        roleTitle: effectiveRole || 'Senior Software Engineer',
      });
      setRawPosting('');
      setCompanyOverride('');
      setRoleOverride('');
      onOpenChange(false);
    } finally {
      setIsBusy(false);
    }
  };

  const handleSaveProspect = async () => {
    setIsBusy(true);
    try {
      await onSaveAsProspect({
        rawPosting,
        company: effectiveCompany || 'Target Company',
        roleTitle: effectiveRole || 'Senior Software Engineer',
      });
      setRawPosting('');
      setCompanyOverride('');
      setRoleOverride('');
      onOpenChange(false);
    } finally {
      setIsBusy(false);
    }
  };

  const handleDiscard = () => {
    setRawPosting('');
    setCompanyOverride('');
    setRoleOverride('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Quick check a job posting"
        description="Paste a job description to see practical fit against your preferences and requirement coverage against your Experience Bank before tailoring."
        className="w-[96vw] max-w-6xl xl:max-w-7xl p-6 lg:p-7"
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left pane: paste posting + editable company & role (Company and Role first per user preference) */}
            <div className="lg:col-span-5 space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label
                    htmlFor="quickcheck-company-input"
                    className="block text-xs font-semibold text-ink mb-1"
                  >
                    Target company
                  </label>
                  <Input
                    id="quickcheck-company-input"
                    value={companyOverride}
                    onChange={(e) => setCompanyOverride(e.target.value)}
                    placeholder={
                      verdict?.detectedCompany || 'e.g. Kestrel Pay'
                    }
                  />
                </div>
                <div>
                  <label
                    htmlFor="quickcheck-role-input"
                    className="block text-xs font-semibold text-ink mb-1"
                  >
                    Target role title
                  </label>
                  <Input
                    id="quickcheck-role-input"
                    value={roleOverride}
                    onChange={(e) => setRoleOverride(e.target.value)}
                    placeholder={
                      verdict?.detectedRoleTitle ||
                      'e.g. Senior Software Engineer'
                    }
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="quickcheck-posting-textarea"
                  className="block text-xs font-semibold text-ink mb-1.5"
                >
                  Job posting text
                </label>
                <AutoGrowTextarea
                  id="quickcheck-posting-textarea"
                  minRows={11}
                  maxRows={18}
                  value={rawPosting}
                  onChange={(e) => setRawPosting(e.target.value)}
                  placeholder="Paste the full job description here (Role:, Company:, location, work mode, requirements, salary)…"
                />
              </div>
            </div>

            {/* Right pane: live debounced verdict, practical fit table, and coverage */}
            <div className="lg:col-span-7 space-y-4 bg-surface-sunken/50 border border-border rounded-xl p-4">
              {(isEvaluating || isBusy) && (
                <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-accent-50 border border-accent/20">
                  <CevinStatusIndicator
                    state="thinking"
                    size={16}
                    variant="glyph"
                    label="Cevin is reading the posting"
                    className="text-accent-700"
                  />
                </div>
              )}
              {verdict && (
                <>
                  {/* Verdict & Quick match estimate band header */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-hairline">
                    <div className="space-y-1">
                      <div className="inline-flex items-center gap-2">
                        <CevinAvatar size="xs" />
                        <span
                          className={cn(
                            'text-base font-display font-semibold',
                            verdict.verdictTone === 'danger'
                              ? 'text-warning-700'
                              : verdict.verdictTone === 'warning'
                                ? 'text-accent-700'
                                : 'text-success-700',
                          )}
                        >
                          {verdict.verdictHeadline}
                        </span>
                      </div>
                      <p className="text-xs text-ink-muted">
                        {verdict.verdictDetail}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <EstimateRing score={verdict.quickMatchEstimate} size="md" />
                    </div>
                  </div>

                  {/* Dense JobFactsTable */}
                  <JobFactsTable
                    facts={verdict.jobFacts}
                    evaluation={verdict.practicalFit}
                    roleTitle={effectiveRole}
                    company={effectiveCompany}
                    readOnly
                  />

                  {/* Bank requirement coverage summary */}
                  <CoverageSummary
                    coveredCount={verdict.coverage.counts.covered}
                    partialCount={verdict.coverage.counts.partial}
                    gapCount={verdict.coverage.counts.gap}
                  />
                </>
              )}
            </div>
          </div>

          {/* Footer: Start tailoring (primary), Save as prospect (secondary), Discard (text button) */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-hairline">
            <Button variant="ghost" onClick={handleDiscard} disabled={isBusy}>
              Discard
            </Button>
            <div className="flex items-center gap-2.5">
              <Button
                variant="secondary"
                disabled={isBusy}
                onClick={() => void handleSaveProspect()}
              >
                {isBusy ? 'Saving…' : 'Save as prospect'}
              </Button>
              <Button
                variant="primary"
                disabled={isBusy}
                onClick={() => void handleStartTailoring()}
              >
                {isBusy ? (
                  <CevinStatusIndicator
                    state="thinking"
                    size={16}
                    variant="glyph"
                    label="Cevin is reading the posting"
                    className="text-white"
                  />
                ) : (
                  'Start tailoring'
                )}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * CommandPalette (Ctrl/Cmd+K) for fast keyboard navigation and actions.
 */
export function CommandPalette({
  open,
  onOpenChange,
  applications,
  onNavigate,
  onNewApplication,
  onToggleTheme,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  applications: Array<{ id: string; company: string; roleTitle: string }>;
  onNavigate: (path: string) => void;
  onNewApplication: () => void;
  onToggleTheme: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.trim().toLowerCase();

  const items = [
    {
      id: 'quick-check',
      label: 'Quick check a posting',
      shortcut: '⌘N',
      action: () => onNewApplication(),
    },
    {
      id: 'new-app',
      label: 'New application',
      shortcut: '⌘N',
      action: () => onNewApplication(),
    },
    {
      id: 'nav-apps',
      label: 'Go to Applications',
      action: () => onNavigate('/applications'),
    },
    {
      id: 'nav-bank',
      label: 'Go to Experience Bank',
      action: () => onNavigate('/bank'),
    },
    {
      id: 'nav-settings',
      label: 'Go to Settings & My preferences',
      action: () => onNavigate('/settings'),
    },
    {
      id: 'toggle-theme',
      label: 'Switch appearance (Light / Dark)',
      action: () => onToggleTheme(),
    },
    ...applications.map((app) => ({
      id: `app-${app.id}`,
      label: `Open ${app.company} — ${app.roleTitle}`,
      shortcut: undefined,
      action: () => onNavigate(`/applications/${app.id}/studio/resume/build`),
    })),
  ].filter((item) => !q || item.label.toLowerCase().includes(q));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title="Quick actions"
        description="Jump to any application, screen, or action."
        className="max-w-lg"
      >
        <div className="space-y-3">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or search applications…"
            aria-label="Search commands"
          />
          <div className="max-h-64 overflow-y-auto divide-y divide-hairline border border-border rounded-md">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  setQuery('');
                  item.action();
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 text-sm text-ink hover:bg-surface-raised text-left transition-colors cursor-pointer"
              >
                <span className="truncate">{item.label}</span>
                {item.shortcut && (
                  <span className="text-xs text-ink-subtle font-sans">
                    {item.shortcut}
                  </span>
                )}
              </button>
            ))}
            {items.length === 0 && (
              <div className="p-4 text-xs text-ink-muted text-center">
                No matching actions found.
              </div>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  Eye,
  FileText,
  Lock,
  Minus,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Unlock,
  X,
};
