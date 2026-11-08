import React, { useState } from 'react';
import {
  DEFAULT_USER_PREFERENCES,
  DocumentKind,
  FactImportance,
  StudioStep,
  VoiceLevel,
  evaluateFit,
  extractJobFactsByRules,
} from '../../../../../core/domain';
import {
  AttentionToken,
  Avatar,
  Badge,
  Banner,
  BulletRow,
  Button,
  Card,
  Checkbox,
  CompactStepper,
  CoverageBar,
  CoveredChip,
  DeltaChip,
  DiffText,
  DocumentSwitch,
  EmptyState,
  EstimateRing,
  FactChip,
  FitStrip,
  GapChip,
  HeroScoreBand,
  ImportanceControl,
  Input,
  JobFactsTable,
  LensBars,
  MetricChip,
  MiniKnobBar,
  MultiSelectChips,
  PageHeader,
  PageThumbnail,
  Panel,
  PanelSection,
  PartialChip,
  ProspectBadge,
  ScoreChip,
  ScoreRing,
  SegmentedControl,
  Select,
  Skeleton,
  SkimLegend,
  SkimToggle,
  SplitButton,
  StatusBadge,
  Switch,
  TagChip,
  TakeawayCard,
  TimelineRail,
  TypeaheadField,
  ViewMenu,
  VoiceControl,
} from '../../ui';

const COLOR_TOKENS = [
  { name: 'canvas', bgClass: 'bg-canvas', desc: 'Warm stone / carbon slate canvas' },
  { name: 'surface', bgClass: 'bg-surface', desc: 'Elevated work panel surface' },
  { name: 'surface-sunken', bgClass: 'bg-surface-sunken', desc: 'Recessed desk & wells' },
  { name: 'paper', bgClass: 'bg-paper', desc: 'True white WYSIWYG paper' },
  { name: 'sidebar', bgClass: 'bg-sidebar', desc: 'Deep ink navigation anchor' },
  { name: 'accent', bgClass: 'bg-accent', desc: 'Primary action cobalt' },
  { name: 'success', bgClass: 'bg-success', desc: 'Verified & covered state' },
  { name: 'warning', bgClass: 'bg-warning', desc: 'Partial match / notice' },
  { name: 'danger', bgClass: 'bg-danger', desc: 'Unverified claim / gap' },
] as const;

const SHADOW_SPECIMENS = [
  { name: 'shadow-xs', shadowClass: 'shadow-xs', desc: 'Inputs, buttons & chips' },
  { name: 'shadow-sm', shadowClass: 'shadow-sm', desc: 'Elevated work panels' },
  { name: 'shadow-md', shadowClass: 'shadow-md', desc: 'Hero band & floating toolbar' },
  { name: 'shadow-lg', shadowClass: 'shadow-lg', desc: 'Popovers, modals & drawers' },
  { name: 'shadow-paper', shadowClass: 'shadow-paper', desc: 'Physical paper sheet on desk' },
] as const;

const AVATAR_COMPANIES = [
  'Kestrel Pay',
  'Vanguard Telemetry',
  'CloudScale',
  'Northstar Orbit',
  'Helios Metrics',
  'Boreal Cloud',
  'Aether Foundry',
  'Cinder Queue',
] as const;

const SAMPLE_FACTS = extractJobFactsByRules(
  `Location: New York, NY (Hybrid, 3 days in office).
Must be authorized to work in the US without visa sponsorship.
Compensation: $180,000 - $215,000 USD annual base.
Employment type: Full-time permanent position.
Fluent in English required.`,
).facts;

export function DesignSystemView() {
  const [demoVoice, setDemoVoice] = useState<VoiceLevel>('balanced');
  const [demoDoc, setDemoDoc] = useState<DocumentKind>('resume');
  const [demoStep, setDemoStep] = useState<StudioStep>('build');
  const [demoChecked, setDemoChecked] = useState(true);
  const [demoSwitch, setDemoSwitch] = useState(true);
  const [demoSelect, setDemoSelect] = useState('classic');
  const [demoSkim, setDemoSkim] = useState(false);
  const [demoImportance, setDemoImportance] = useState<FactImportance>('dealbreaker');
  const [demoFactsExpanded, setDemoFactsExpanded] = useState(false);
  const [demoSortMode, setDemoSortMode] = useState<'best-fit' | 'recent'>('best-fit');
  const [demoHideConflicts, setDemoHideConflicts] = useState(false);
  const [demoCity, setDemoCity] = useState('San Francisco');
  const [demoCountries, setDemoCountries] = useState<string[]>(['US', 'CA']);
  const [demoBulletText, setDemoBulletText] = useState(
    'Built multi-region Kubernetes metric ingestion in Go and Kafka, sustaining 1.4M events/sec while cutting cross-AZ egress spend by 38%.',
  );

  const demoFit = evaluateFit(SAMPLE_FACTS, {
    ...DEFAULT_USER_PREFERENCES,
    needsSponsorship: 'yes',
  });

  return (
    <div className="space-y-8 pb-16">
      <PageHeader
        title="Cevin Living Design System"
        subtitle="Desk, paper and ink — True WYSIWYG PDF.js Preview, Scalable Job Facts Hierarchy, Calibrated 3-Score Hero Band, and Uncropped Studio Controls."
      />

      {/* 01. Elevation & 4-Level Surface Ladder (Light & Dark Side-by-Side) */}
      <Panel>
        <PanelSection className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-base font-display font-semibold text-ink">
              01. Elevation & Surface Ladder (Desk, Paper & Ink)
            </h2>
            <Badge tone="accent">4 Surface Levels + 5 Shadow Tokens</Badge>
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* Light Preview Frame */}
            <div className="rounded-xl border border-border p-5 bg-[#F5F3EE] text-[#151A22] space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-[#525B6C]">
                Light Theme — Warm Stone Desk & Crisp Paper
              </div>
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#161A22] text-[#ECEEF3] border border-[#2C3444]">
                  <div className="font-bold">0. Sidebar</div>
                  <div className="opacity-75 mt-1">#161A22 Ink</div>
                </div>
                <div className="p-3 rounded-lg bg-[#EAE6DD] text-[#151A22] border border-[#D8D3C8] shadow-inner">
                  <div className="font-bold">1. Sunken Desk</div>
                  <div className="opacity-75 mt-1">#EAE6DD</div>
                </div>
                <div className="p-3 rounded-lg bg-[#FDFCFA] text-[#151A22] border border-[#E4E0D6] shadow-sm">
                  <div className="font-bold">2. Work Panel</div>
                  <div className="opacity-75 mt-1">#FDFCFA</div>
                </div>
                <div className="p-3 rounded-xs bg-paper text-paper-ink border border-paper-border shadow-paper">
                  <div className="font-bold">3. Paper Sheet</div>
                  <div className="opacity-75 mt-1">#FFFFFF</div>
                </div>
              </div>
            </div>

            {/* Dark Preview Frame */}
            <div className="dark rounded-xl border border-[#252D3B] p-5 bg-[#0F1319] text-[#EEF0F4] space-y-4">
              <div className="text-xs font-bold uppercase tracking-wider text-[#9CA5B5]">
                Dark Theme — Carbon Slate Desk & True White Paper
              </div>
              <div className="grid grid-cols-4 gap-3 text-xs">
                <div className="p-3 rounded-lg bg-[#0A0D12] text-[#EEF0F4] border border-[#252D3B]">
                  <div className="font-bold">0. Sidebar</div>
                  <div className="opacity-75 mt-1">#0A0D12 Ink</div>
                </div>
                <div className="p-3 rounded-lg bg-[#0B0E13] text-[#EEF0F4] border border-[#252D3B] shadow-inner">
                  <div className="font-bold">1. Sunken Desk</div>
                  <div className="opacity-75 mt-1">#0B0E13</div>
                </div>
                <div className="p-3 rounded-lg bg-[#161B23] text-[#EEF0F4] border border-[#252D3B] shadow-sm">
                  <div className="font-bold">2. Work Panel</div>
                  <div className="opacity-75 mt-1">#161B23</div>
                </div>
                <div className="p-3 rounded-xs bg-paper text-paper-ink border border-paper-border shadow-paper">
                  <div className="font-bold">3. Paper Sheet</div>
                  <div className="opacity-75 mt-1">#FFFFFF (WYSIWYG)</div>
                </div>
              </div>
            </div>
          </div>

          {/* Shadow scale specimens */}
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-2">
            {SHADOW_SPECIMENS.map((s) => (
              <div
                key={s.name}
                className={`p-4 rounded-lg bg-surface border border-border ${s.shadowClass}`}
              >
                <div className="text-xs font-mono font-semibold text-ink">
                  {s.name}
                </div>
                <div className="text-xs text-ink-muted mt-1">{s.desc}</div>
              </div>
            ))}
          </div>
        </PanelSection>
      </Panel>

      {/* 02. Semantic Color Tokens & Company Avatar Hues */}
      <Card className="p-6 space-y-5">
        <h2 className="text-base font-display font-semibold text-ink">
          02. Semantic Color Tokens (@theme) & Deterministic Company Avatars
        </h2>
        <div className="grid grid-cols-3 md:grid-cols-5 xl:grid-cols-9 gap-3">
          {COLOR_TOKENS.map((t) => (
            <div
              key={t.name}
              className="border border-border rounded-md p-2.5 bg-surface space-y-2"
            >
              <div
                className={`h-11 w-full rounded-xs border border-border ${t.bgClass}`}
              />
              <div className="text-xs font-mono font-semibold text-ink">
                --color-{t.name}
              </div>
              <div className="text-xs text-ink-muted leading-tight">
                {t.desc}
              </div>
            </div>
          ))}
        </div>

        <div className="pt-3 border-t border-hairline flex flex-wrap items-center gap-4">
          <span className="text-xs font-semibold text-ink-muted">
            8 Curated Company Avatar Hues:
          </span>
          {AVATAR_COMPANIES.map((co) => (
            <div key={co} className="inline-flex items-center gap-2">
              <Avatar name={co} size="sm" />
              <span className="text-xs font-medium text-ink">{co}</span>
            </div>
          ))}
        </div>
      </Card>

      {/* 03. Typography Scale */}
      <Card className="p-6 space-y-3">
        <h2 className="text-base font-display font-semibold text-ink">
          03. Typography Scale (2+1 Font Rule — Embedded in PDF Engine)
        </h2>
        <div className="space-y-3 border-t border-hairline pt-3">
          <div>
            <span className="text-xs font-mono text-ink-subtle">
              --font-display (Fraunces Editorial Serif — Headings, Hero Numerals & Classic PDF Template)
            </span>
            <p className="text-2xl font-display font-semibold text-ink">
              Truthful by construction, tailored for human readers.
            </p>
          </div>
          <div>
            <span className="text-xs font-mono text-ink-subtle">
              --font-sans (Plus Jakarta Sans — UI Controls, Tabular Numbers & Resume Prose)
            </span>
            <p className="text-sm font-sans text-ink">
              Designed zero-downtime PostgreSQL partition routing, dropping p99 query latency from 420ms to 68ms across 120+ enterprise tenants.
            </p>
          </div>
          <div>
            <span className="text-xs font-mono text-ink-subtle">
              --font-mono (JetBrains Mono — Strictly for terminal commands & paths)
            </span>
            <p className="text-sm font-mono text-ink">
              http://localhost:11434 · ollama pull llama3.1:8b
            </p>
          </div>
        </div>
      </Card>

      {/* 04. Signature Components */}
      <Card className="p-6 space-y-6">
        <h2 className="text-base font-display font-semibold text-ink">
          04. Signature Components & Scalable Job Facts Hierarchy
        </h2>

        {/* Studio Header Controls */}
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 rounded-lg bg-surface-sunken border border-hairline">
          <DocumentSwitch value={demoDoc} onChange={setDemoDoc} />
          <CompactStepper
            documentKind={demoDoc}
            activeStep={demoStep}
            completedSteps={['job']}
            onSelectStep={setDemoStep}
          />
          <ViewMenu
            sortMode={demoSortMode}
            onChangeSort={setDemoSortMode}
            hideConflicts={demoHideConflicts}
            onChangeHideConflicts={setDemoHideConflicts}
          />
        </div>

        {/* Three-Score Hero Band + Recruiter Appeal Lenses + TakeawayCard */}
        <HeroScoreBand
          jobMatch={92}
          recruiterAppeal={88}
          atsReadiness={91}
          jobMatchDelta={6}
          appealDelta={4}
          atsDelta={3}
          referenceVersionLabel="v2"
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
          <LensBars
            lenses={{ skim: 90, proof: 88, clarity: 85, voice: 88 }}
            weakestHints={{
              skim: 'First role, headline, and metrics appear above the fold',
              proof: 'Strongest quantified bullet leads the recent role',
              clarity: 'Bullets average 19 words without jargon chains',
              voice: 'Natural tone with zero repetitive verb openers',
            }}
          />
          <div className="space-y-3">
            <TakeawayCard
              takeaway="Staff Platform Engineer · Vanguard Telemetry Systems · 2023–Present · Kubernetes, PostgreSQL, Go · p99 420→68 ms"
              targetRoleMatches={true}
            />
            <div className="flex items-center justify-between p-3 rounded-lg bg-surface-sunken border border-hairline">
              <SkimToggle active={demoSkim} onToggle={setDemoSkim} />
              <div className="flex items-center gap-3">
                <ProspectBadge />
                <EstimateRing score={88} />
                <ScoreRing score={92} />
              </div>
            </div>
            {demoSkim && <SkimLegend />}
          </div>
        </div>

        {/* FitStrip + JobFactsTable + AttentionToken + ImportanceControl */}
        <div className="space-y-3 p-4 rounded-xl border border-border bg-surface-sunken/50">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs font-semibold text-ink">
              Job Facts Hierarchy: FitStrip (1 line) · AttentionToken (max 1 per row) · ImportanceControl
            </div>
            <div className="flex items-center gap-2">
              <AttentionToken token={demoFit.attentionToken} />
              <ImportanceControl
                value={demoImportance}
                onChange={setDemoImportance}
              />
            </div>
          </div>

          <FitStrip
            evaluation={demoFit}
            expanded={demoFactsExpanded}
            onToggleExpanded={() => setDemoFactsExpanded((prev) => !prev)}
          />

          {demoFactsExpanded && (
            <JobFactsTable
              facts={SAMPLE_FACTS}
              evaluation={demoFit}
              company="Northstar Orbit"
              roleTitle="Principal Systems Engineer"
            />
          )}
        </div>


        {/* MiniKnobBar & Expandable Rotary VoiceControl */}
        <div className="space-y-3">
          <MiniKnobBar
            value={demoVoice}
            onChange={setDemoVoice}
            machineMadeScore={demoVoice === 'polished' ? 68 : 14}
          />
          <div className="p-4 rounded-xl border border-border bg-surface">
            <VoiceControl
              value={demoVoice}
              onChange={setDemoVoice}
              machineMadeScore={demoVoice === 'polished' ? 68 : 14}
            />
          </div>
        </div>

        {/* Uncropped Full-Width BulletRow */}
        <BulletRow
          bulletText={demoBulletText}
          originalText="Engineered multi-region Kubernetes metric ingestion pipeline in Go and Kafka, sustaining 1.4M events/sec."
          locked={false}
          unverifiedClaims={[]}
          relevanceDots={3}
          relevanceReason="Strong match for distributed systems & Go"
          sourceSummary="Vanguard Telemetry Systems · Staff Platform Engineer"
          onChangeText={setDemoBulletText}
          onRewrite={() => undefined}
          onToggleLock={() => undefined}
          onMoveUp={() => undefined}
          onMoveDown={() => undefined}
          onRemove={() => undefined}
        />

        {/* Coverage Bar + Quiet Covered / Tinted Partial / Loud Gap Chips + FactChips */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
          <CoverageBar coveredCount={8} partialCount={2} gapCount={1} />
          <div className="flex flex-wrap gap-2">
            <CoveredChip term="Kubernetes" evidenceItems={[]} />
            <CoveredChip term="PostgreSQL" evidenceItems={[]} />
            <PartialChip
              term="Event Streaming"
              relatedMatch="Kafka"
              priority="must-have"
            />
            <GapChip
              term="Rust / eBPF"
              priority="must-have"
              onAddToBank={() => undefined}
            />
            <FactChip fit="conflict" label="✕ Work permit" />
          </div>
        </div>

        {/* Real PDF.js PageThumbnails & TimelineRail */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-2">
          <div className="space-y-2">
            <div className="text-xs font-semibold text-ink">
              Real PDF.js PageThumbnails (Classic, Modern, Compact)
            </div>
            <div className="flex items-center gap-4 p-4 rounded-lg bg-surface-sunken border border-hairline">
              <PageThumbnail templateId="classic" size="md" />
              <PageThumbnail templateId="modern" size="md" />
              <PageThumbnail templateId="compact" size="md" />
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-xs font-semibold text-ink">
              Experience Bank TimelineRail + MetricChip & TagChip
            </div>
            <TimelineRail isCurrent={true} isLast={false}>
              <div className="p-3.5 rounded-lg bg-surface border border-border space-y-2">
                <div className="text-xs font-semibold text-ink">
                  Staff Platform Engineer · Vanguard Telemetry
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <MetricChip>-38% cross-AZ egress</MetricChip>
                  <TagChip>Kubernetes</TagChip>
                  <TagChip>Go</TagChip>
                </div>
              </div>
            </TimelineRail>
          </div>
        </div>

        <DiffText
          originalText="Engineered multi-region Kubernetes metric ingestion pipeline in Go and Kafka, sustaining 1.4M events/sec."
          tailoredText="Built multi-region Kubernetes metric ingestion in Go and Kafka, sustaining 1.4M events/sec while cutting egress spend by 38%."
        />
      </Card>

      {/* 05. Interactive Primitives & States */}
      <Card className="p-6 space-y-5">
        <h2 className="text-base font-display font-semibold text-ink">
          05. Interactive Primitives, Typeahead & States
        </h2>

        <div className="flex flex-wrap items-center gap-3">
          <Button variant="primary">Primary Action</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="tonal">Tonal</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="outline-danger">Outline Danger</Button>
          <Button variant="danger">Danger</Button>
          <SplitButton
            primaryLabel="Export PDF"
            onPrimaryClick={() => undefined}
            items={[
              {
                id: 'pdf',
                label: 'Export PDF (.pdf)',
                onSelect: () => undefined,
              },
              {
                id: 'md',
                label: 'Export Markdown (.md)',
                onSelect: () => undefined,
              },
              {
                id: 'txt',
                label: 'Export plain text (.txt)',
                onSelect: () => undefined,
              },
            ]}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input placeholder="Standard text input…" aria-label="Demo input" />
          <Select
            ariaLabel="Demo select"
            value={demoSelect}
            onValueChange={setDemoSelect}
            options={[
              { value: 'classic', label: 'Classic Editorial Template' },
              { value: 'modern', label: 'Modern Technical Template' },
              { value: 'compact', label: 'Compact High-Density Template' },
            ]}
          />
          <div className="flex items-center gap-6">
            <SegmentedControl
              ariaLabel="Demo segmented control"
              value={demoChecked ? 'on' : 'off'}
              onValueChange={(v) => setDemoChecked(v === 'on')}
              options={[
                { value: 'on', label: 'Active' },
                { value: 'off', label: 'Muted' },
              ]}
            />
            <div className="flex items-center gap-3 text-xs text-ink">
              <Checkbox
                checked={demoChecked}
                onCheckedChange={setDemoChecked}
                label="Demo checkbox"
              />
              <Switch
                checked={demoSwitch}
                onCheckedChange={setDemoSwitch}
                label="Demo switch"
              />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-hairline">
          <div className="space-y-1">
            <span className="text-xs font-semibold text-ink">
              TypeaheadField (Recognized City / Country Lookup)
            </span>
            <TypeaheadField
              ariaLabel="Demo city typeahead"
              value={demoCity}
              onChange={setDemoCity}
              options={[
                { value: 'San Francisco', label: 'San Francisco', sublabel: 'SF Bay Area' },
                { value: 'New York', label: 'New York', sublabel: 'NYC Metro' },
                { value: 'Paris', label: 'Paris', sublabel: 'Île-de-France' },
              ]}
            />
          </div>
          <div className="space-y-1">
            <span className="text-xs font-semibold text-ink">
              MultiSelectChips (Authorized Countries)
            </span>
            <MultiSelectChips
              ariaLabel="Demo country chips"
              values={demoCountries}
              onChange={setDemoCountries}
              options={[
                { value: 'US', label: 'United States' },
                { value: 'CA', label: 'Canada' },
                { value: 'FR', label: 'France' },
                { value: 'GB', label: 'United Kingdom' },
              ]}
            />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-hairline">
          <ScoreChip label="Match" score={94} />
          <ScoreChip label="Appeal" score={88} isEstimate={true} />
          <ScoreChip label="ATS" score={91} />
          <ScoreChip label="Checks" fraction={{ passed: 6, total: 6 }} />
          <ScoreRing score={88} />
          <EstimateRing score={88} />
          <DeltaChip delta={6} referenceLabel="v2" />
          <DeltaChip delta={-2} referenceLabel="v2" />
          <StatusBadge status="Prospect" />
          <StatusBadge status="Draft" />
          <StatusBadge status="Applied" />
          <StatusBadge status="Interviewing" />
          <StatusBadge status="Offer" />
          <Badge tone="success">Verified Grounding</Badge>
          <Skeleton className="h-5 w-28" />
        </div>

        <Banner tone="info" title="Local-first privacy guarantee">
          All Experience Bank records, preferences, and application snapshots remain inside your browser’s IndexedDB database.
        </Banner>

        <EmptyState
          illustrationKind="applications"
          title="Example Empty State with SpotIllustration"
          description="Calm density with 120px 1-color line art and one clear primary action."
          actionLabel="Primary Action"
          onAction={() => undefined}
        />
      </Card>
    </div>
  );
}

