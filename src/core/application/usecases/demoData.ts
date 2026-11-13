import {
  Application,
  BankSnapshot,
  DocumentVersion,
  computeAtsAndJobMatchScores,
  createDefaultCoverLetterDraft,
  evaluateCoverLetterChecks,
  extractJobFactsByRules,
  formatAchievementInVoice,
  validateBulletGrounding,
} from '../../domain';

export function createDemoBankSnapshot(): BankSnapshot {
  return {
    profile: {
      id: 'profile-main',
      name: 'Elena Rostova',
      headline: 'Senior Distributed Systems & Platform Engineer',
      email: 'elena.rostova@example.com',
      phone: '+1 (415) 890-4312',
      location: 'San Francisco, CA',
      links: [
        { label: 'GitHub', url: 'https://github.com/erostova' },
        { label: 'LinkedIn', url: 'https://linkedin.com/in/elena-rostova' },
        { label: 'Technical Blog', url: 'https://rostova.systems' },
      ],
    },
    experiences: [
      {
        id: 'exp-chronosphere',
        company: 'Vanguard Telemetry Systems',
        title: 'Staff Platform Engineer',
        location: 'San Francisco, CA',
        start: '2023-02',
        end: 'Present',
      },
      {
        id: 'exp-finledger',
        company: 'Meridian Clearing Corp',
        title: 'Senior Backend & Infrastructure Engineer',
        location: 'New York, NY (Remote)',
        start: '2020-06',
        end: '2023-01',
      },
      {
        id: 'exp-cloudmesh',
        company: 'Lattice Cloud Labs',
        title: 'Software Engineer, Core Runtime',
        location: 'Seattle, WA',
        start: '2018-07',
        end: '2020-05',
      },
    ],
    achievements: [
      {
        id: 'ach-k8s-ingest',
        experienceId: 'exp-chronosphere',
        action:
          'Re-architected a multi-region Kubernetes metric ingestion pipeline in Go and Kafka',
        result:
          'sustaining 1.4M events/sec while cutting cross-AZ egress spend by 38%',
        metric: '38% egress reduction at 1.4M events/sec',
        skillIds: ['skill-k8s', 'skill-go', 'skill-kafka', 'skill-aws'],
        tags: ['infrastructure', 'scalability', 'cost-optimization'],
      },
      {
        id: 'ach-pg-sharding',
        experienceId: 'exp-chronosphere',
        action:
          'Designed a zero-downtime PostgreSQL partition routing and connection pooling layer',
        result:
          'dropping p99 query latency from 420ms to 68ms across 120+ enterprise tenants',
        metric: '420ms to 68ms p99 latency',
        skillIds: ['skill-postgres', 'skill-go', 'skill-observability'],
        tags: ['databases', 'latency', 'multi-tenancy', 'reliability'],
      },
      {
        id: 'ach-tf-cicd',
        experienceId: 'exp-chronosphere',
        action:
          'Built declarative Terraform modules and GitHub Actions CI/CD canary rollouts',
        result:
          'shrinking production cluster provisioning time from 4 hours to 14 minutes',
        metric: '4 hours to 14 minutes provisioning',
        skillIds: ['skill-terraform', 'skill-cicd', 'skill-k8s'],
        tags: ['infrastructure', 'devops', 'reliability'],
      },
      {
        id: 'ach-ts-console',
        experienceId: 'exp-chronosphere',
        action:
          'Built a TypeScript and React real-time query cardinality inspector for on-call teams',
        result:
          'reducing mean time to resolution (MTTR) during high-cardinality incidents by 44%',
        metric: '44% faster incident MTTR',
        skillIds: ['skill-ts', 'skill-react', 'skill-observability'],
        tags: ['observability', 'developer-experience', 'reliability'],
      },
      {
        id: 'ach-ledger-idempotency',
        experienceId: 'exp-finledger',
        action:
          'Implemented idempotency keys and Redis distributed locks for settlement APIs',
        result:
          'processing $2.8B in annual volume with 99.995% availability and zero double-charges',
        metric: '99.995% availability on $2.8B volume',
        skillIds: ['skill-postgres', 'skill-redis', 'skill-ts', 'skill-node'],
        tags: ['databases', 'reliability', 'scalability'],
      },
      {
        id: 'ach-otel-tracing',
        experienceId: 'exp-finledger',
        action:
          'Rolled out OpenTelemetry distributed tracing across 34 Node.js and Go microservices',
        result:
          'eliminating blind spots in partner webhook retries and cutting sev-2 alerts by 52%',
        metric: '52% reduction in sev-2 alerts',
        skillIds: ['skill-observability', 'skill-node', 'skill-go', 'skill-docker'],
        tags: ['observability', 'microservices', 'reliability'],
      },
      {
        id: 'ach-docker-build',
        experienceId: 'exp-cloudmesh',
        action:
          'Converted monolithic build scripts into multi-stage Docker images with remote layer caching',
        result:
          'speeding up CI test and build pipelines by 3.2x for 45 engineers',
        metric: '3.2x faster CI builds',
        skillIds: ['skill-docker', 'skill-cicd', 'skill-python'],
        tags: ['devops', 'infrastructure', 'developer-experience'],
      },
    ],
    skills: [
      {
        id: 'skill-ts',
        name: 'TypeScript',
        category: 'Languages',
        aliases: ['TS'],
        related: ['JavaScript', 'ES2022'],
      },
      {
        id: 'skill-go',
        name: 'Go',
        category: 'Languages',
        aliases: ['Golang'],
      },
      {
        id: 'skill-python',
        name: 'Python',
        category: 'Languages',
        aliases: ['Py', 'Python3'],
      },
      {
        id: 'skill-k8s',
        name: 'Kubernetes',
        category: 'Infrastructure',
        aliases: ['k8s'],
        related: ['EKS', 'Helm'],
      },
      {
        id: 'skill-terraform',
        name: 'Terraform',
        category: 'Infrastructure',
        aliases: ['TF', 'Infrastructure as Code', 'IaC'],
      },
      {
        id: 'skill-aws',
        name: 'Amazon Web Services',
        category: 'Infrastructure',
        aliases: ['AWS'],
        related: ['EC2', 'S3', 'ECS'],
      },
      {
        id: 'skill-docker',
        name: 'Docker',
        category: 'Infrastructure',
        aliases: ['Containers', 'OCI'],
      },
      {
        id: 'skill-postgres',
        name: 'PostgreSQL',
        category: 'Data & AI',
        aliases: ['Postgres', 'PSQL'],
      },
      {
        id: 'skill-kafka',
        name: 'Kafka',
        category: 'Data & AI',
        aliases: ['Apache Kafka'],
        related: ['Event Streaming'],
      },
      {
        id: 'skill-redis',
        name: 'Redis',
        category: 'Data & AI',
        aliases: [],
        related: ['Distributed Caching'],
      },
      {
        id: 'skill-react',
        name: 'React',
        category: 'Frameworks',
        aliases: ['React 18', 'React.js'],
      },
      {
        id: 'skill-node',
        name: 'Node.js',
        category: 'Frameworks',
        aliases: ['Node'],
        related: ['Express'],
      },
      {
        id: 'skill-cicd',
        name: 'CI/CD',
        category: 'Practices',
        aliases: ['Continuous Integration'],
        related: ['GitHub Actions', 'Canary Deploys'],
      },
      {
        id: 'skill-observability',
        name: 'Observability',
        category: 'Tools',
        aliases: ['o11y'],
        related: ['OpenTelemetry', 'Prometheus', 'Grafana'],
      },
    ],
    educations: [
      {
        id: 'edu-uw',
        institution: 'Pacific Crest Institute of Technology',
        degree: 'B.S. in Computer Science',
        field: 'Distributed Systems & Databases',
        location: 'Seattle, WA',
        start: '2014',
        end: '2018',
        highlights: 'Cum Laude · Teaching Assistant for CSE 452 Distributed Systems',
      },
    ],
    projects: [
      {
        id: 'proj-pg-drift',
        name: 'pg-schema-guard',
        role: 'Creator & Maintainer',
        description:
          'Open-source CLI linter detecting unsafe PostgreSQL lock-acquiring migrations in CI pipelines.',
        link: 'https://github.com/erostova/pg-schema-guard',
        skillIds: ['skill-postgres', 'skill-go', 'skill-cicd'],
        highlights: [],
      },
    ],
    certifications: [
      {
        id: 'cert-cka',
        name: 'Certified Kubernetes Administrator (CKA)',
        issuer: 'Cloud Native Computing Foundation',
        date: '2024',
        credentialId: 'LF-CKA-90412',
      },
    ],
  };
}

export const SAMPLE_KESTREL_JD = `Role: Staff Infrastructure & Reliability Engineer
Company: Kestrel Pay
Location: San Francisco, CA (Hybrid, 3 days in office)
Employment Type: Full-time permanent
Compensation: $195,000 - $230,000 USD base salary
Seniority: Staff (L4)

About the role:
We are looking for a Staff Infrastructure Engineer to lead our core storage and container orchestration reliability initiatives at Kestrel Pay. You will design high-throughput, low-latency services that power global financial settlement. Fluent English is required. Visa sponsorship is available for H-1B transfers.

Must-Have Requirements:
- Production experience operating Kubernetes (k8s) clusters at scale on AWS
- Deep expertise in Go or TypeScript for building resilient distributed systems
- Hands-on experience tuning PostgreSQL and Redis under high-concurrency workloads
- Proven track record with Terraform (IaC) and automated CI/CD canary pipelines
- Strong foundation in Observability (OpenTelemetry, Prometheus, distributed tracing)

Nice-to-Have Requirements:
- Experience with Apache Kafka event streaming
- Rust or eBPF kernel instrumentation experience
- Incident response leadership and mentoring engineers

Key Responsibilities:
- Architect multi-region service reliability and automated failover mechanisms
- Drive p99 latency and cloud infrastructure cost efficiency across core payment APIs
- Partner with product engineering teams to establish golden paths for deployment`;

export const SAMPLE_ALTERNATIVE_JD = SAMPLE_KESTREL_JD;

export function createDemoApplications(bank: BankSnapshot): {
  applications: Application[];
  versions: DocumentVersion[];
} {
  const selectedIds = [
    'ach-k8s-ingest',
    'ach-pg-sharding',
    'ach-tf-cicd',
    'ach-ledger-idempotency',
    'ach-otel-tracing',
    'ach-ts-console',
  ];

  const makeBullets = (voice: 'balanced' | 'polished' | 'plain') =>
    selectedIds
      .map((id) => bank.achievements.find((a) => a.id === id)!)
      .filter(Boolean)
      .map((ach, idx) => {
        const originalText = formatAchievementInVoice(ach, 'professional', idx);
        const text = formatAchievementInVoice(ach, voice, idx);
        const grounding = validateBulletGrounding(text, [ach.id], bank);
        const origin: 'ai' | 'user' | 'bank' =
          idx === 1 ? 'user' : idx === 4 ? 'bank' : 'ai';
        return {
          id: `bullet-${ach.id}`,
          experienceId: ach.experienceId,
          text,
          originalText,
          sourceIds: [ach.id],
          locked: false,
          unverifiedClaims: grounding.unverifiedClaims,
          origin,
        };
      });

  const kestrelApp: Application = {
    id: 'app-kestrel-infra',
    company: 'Kestrel Pay',
    roleTitle: 'Staff Infrastructure & Reliability Engineer',
    jobDescription: SAMPLE_KESTREL_JD,
    jobFacts: extractJobFactsByRules(SAMPLE_KESTREL_JD).facts,
    dismissedRequirements: [],
    parsedJob: {
      title: 'Staff Infrastructure & Reliability Engineer',
      company: 'Kestrel Pay',
      seniority: 'Staff',
      summary:
        'Lead core storage, container orchestration, and multi-region settlement reliability at high throughput.',
      requirements: [
        {
          id: 'req-k8s',
          text: 'Kubernetes',
          normalizedKey: 'kubernetes',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-aws',
          text: 'Amazon Web Services',
          normalizedKey: 'amazon web services',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-go',
          text: 'Go',
          normalizedKey: 'golang',
          priority: 'must-have',
          category: 'hard-skill',
        },
        {
          id: 'req-ts',
          text: 'TypeScript',
          normalizedKey: 'typescript',
          priority: 'must-have',
          category: 'hard-skill',
        },
        {
          id: 'req-pg',
          text: 'PostgreSQL',
          normalizedKey: 'postgresql',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-redis',
          text: 'Redis',
          normalizedKey: 'redis',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-tf',
          text: 'Terraform',
          normalizedKey: 'terraform',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-cicd',
          text: 'CI/CD',
          normalizedKey: 'ci/cd',
          priority: 'must-have',
          category: 'hard-skill',
        },
        {
          id: 'req-obs',
          text: 'Observability',
          normalizedKey: 'observability',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-kafka',
          text: 'Kafka',
          normalizedKey: 'kafka',
          priority: 'nice-to-have',
          category: 'tool',
        },
        {
          id: 'req-rust',
          text: 'Rust / eBPF',
          normalizedKey: 'rust',
          priority: 'nice-to-have',
          category: 'hard-skill',
        },
      ],
      responsibilities: [
        'Architect multi-region service reliability and automated failover mechanisms',
        'Drive p99 latency and cloud infrastructure cost efficiency across core payment APIs',
        'Partner with product engineering teams to establish golden paths for deployment',
      ],
      keywords: [
        { term: 'Kubernetes', normalized: 'kubernetes', kind: 'tool' },
        { term: 'PostgreSQL', normalized: 'postgresql', kind: 'tool' },
        { term: 'Terraform', normalized: 'terraform', kind: 'tool' },
        { term: 'Go', normalized: 'golang', kind: 'hard-skill' },
        { term: 'TypeScript', normalized: 'typescript', kind: 'hard-skill' },
        { term: 'Redis', normalized: 'redis', kind: 'tool' },
        { term: 'Kafka', normalized: 'kafka', kind: 'tool' },
        { term: 'Observability', normalized: 'observability', kind: 'tool' },
        { term: 'CI/CD', normalized: 'ci/cd', kind: 'hard-skill' },
      ],
    },
    status: 'Interviewing',
    voice: 'balanced',
    templateId: 'classic',
    activeStep: 2,
    lastActiveDoc: 'resume',
    lastActiveStep: 'build',
    workingDraft: {
      targetHeadline: 'Staff Infrastructure & Reliability Engineer',
      summary:
        'Staff Platform & Distributed Systems Engineer with 7+ years scaling Kubernetes, PostgreSQL, and Go services across Vanguard Telemetry Systems and Meridian Clearing Corp. Track record of cutting p99 latency from 420ms to 68ms and operating $2.8B settlement infrastructure at 99.995% availability.',
      summaryLocked: false,
      summarySourceIds: ['ach-k8s-ingest', 'ach-pg-sharding', 'ach-ledger-idempotency'],
      selectedAchievementIds: selectedIds,
      selectedSkillIds: [
        'skill-k8s',
        'skill-aws',
        'skill-terraform',
        'skill-docker',
        'skill-go',
        'skill-postgres',
        'skill-kafka',
        'skill-redis',
        'skill-cicd',
        'skill-observability',
      ],
      selectedProjectIds: ['proj-pg-drift'],
      selectedEducationIds: ['edu-uw'],
      selectedCertificationIds: ['cert-cka'],
      bullets: makeBullets('balanced'),
    },
    latestScores: {
      jobMatch: 92,
      atsReadiness: 94,
      appeal: 91,
      machineMadeScore: 14,
      subscores: {
        keywordCoverage: 92,
        structureAndParseability: 100,
        contentQuality: 95,
        lengthAndDensity: 95,
        titleAlignment: 100,
      },
      coveredKeywords: [
        'Kubernetes',
        'Amazon Web Services',
        'Go',
        'TypeScript',
        'PostgreSQL',
        'Redis',
        'Terraform',
        'CI/CD',
        'Observability',
        'Kafka',
      ],
      partialKeywords: [],
      gapKeywords: ['Rust / eBPF'],
      estimatedPages: 1,
    },
    createdAt: '2026-10-28T14:20:00.000Z',
    updatedAt: '2026-11-06T12:45:00.000Z',
    postingUrl: 'https://careers.kestrelpay.example/jobs/staff-infra-sre',
    appliedDate: '2026-11-01',
    notes: 'Referred by Marcus Chen on the Core Storage team. System design loop scheduled for next Tuesday.',
  };

  const kestrelCoverLetter = createDefaultCoverLetterDraft(kestrelApp, bank);
  kestrelCoverLetter.whyCompanyNotes =
    'your engineering focus on zero-downtime financial settlement and predictable p99 latency at global scale';
  const kestrelLetterChecks = evaluateCoverLetterChecks({
    draft: kestrelCoverLetter,
    parsedJob: kestrelApp.parsedJob,
    bank,
    company: kestrelApp.company,
    roleTitle: kestrelApp.roleTitle,
  });

  kestrelApp.coverLetterDraft = kestrelCoverLetter;
  kestrelApp.documents = {
    resume: kestrelApp.workingDraft,
    coverLetter: kestrelCoverLetter,
  };
  kestrelApp.latestLetterChecks = kestrelLetterChecks.report;

  const kestrelAnalysis = computeAtsAndJobMatchScores(kestrelApp, bank);
  kestrelApp.latestScores = kestrelAnalysis.scores;

  const v1Draft = {
    ...kestrelApp.workingDraft,
    targetHeadline: 'Senior Backend Engineer',
    summary:
      'Backend engineer experienced in Go, TypeScript, and PostgreSQL distributed systems.',
    selectedSkillIds: bank.skills.slice(0, 4).map((s) => s.id),
    bullets: makeBullets('polished').slice(0, 2),
  };
  const v1Scores = computeAtsAndJobMatchScores(
    { ...kestrelApp, voice: 'polished', workingDraft: v1Draft },
    bank,
  ).scores;

  const kestrelV1: DocumentVersion = {
    id: 'ver-kestrel-1',
    applicationId: kestrelApp.id,
    kind: 'resume',
    number: 1,
    label: 'Initial formal draft',
    content: v1Draft,
    voice: 'polished',
    templateId: 'classic',
    modelId: 'cevin-3b-4bit-fused',
    scores: v1Scores,
    createdAt: '2026-11-01T10:15:00.000Z',
  };

  const v2Draft = {
    ...kestrelApp.workingDraft,
    targetHeadline: 'Staff Platform Engineer',
    selectedSkillIds: bank.skills.slice(0, 6).map((s) => s.id),
    bullets: makeBullets('balanced').slice(0, 3),
  };
  const v2Scores = computeAtsAndJobMatchScores(
    { ...kestrelApp, voice: 'professional', workingDraft: v2Draft },
    bank,
  ).scores;

  const kestrelV2: DocumentVersion = {
    id: 'ver-kestrel-2',
    applicationId: kestrelApp.id,
    kind: 'resume',
    number: 2,
    label: 'Added core Kubernetes & Redis metrics',
    content: v2Draft,
    voice: 'balanced',
    templateId: 'classic',
    modelId: 'cevin-3b-4bit-fused',
    scores: v2Scores,
    createdAt: '2026-11-03T14:20:00.000Z',
  };

  const kestrelV3: DocumentVersion = {
    id: 'ver-kestrel-3',
    applicationId: kestrelApp.id,
    kind: 'resume',
    number: 3,
    label: 'Balanced voice + PostgreSQL latency emphasis',
    content: kestrelApp.workingDraft,
    voice: 'balanced',
    templateId: 'classic',
    modelId: 'cevin-3b-4bit-fused',
    scores: kestrelApp.latestScores,
    createdAt: '2026-11-05T18:45:00.000Z',
  };

  const kestrelClV1: DocumentVersion = {
    id: 'ver-kestrel-cl-1',
    applicationId: kestrelApp.id,
    kind: 'coverLetter',
    number: 1,
    label: 'Natural voice cover letter for Hiring Team',
    coverLetterContent: kestrelCoverLetter,
    voice: kestrelCoverLetter.voice,
    templateId: 'classic',
    modelId: 'cevin-3b-4bit-fused',
    scores: {
      ...kestrelApp.latestScores,
      jobMatch: kestrelLetterChecks.jobMatch,
    },
    letterChecks: kestrelLetterChecks.report,
    createdAt: '2026-11-06T09:10:00.000Z',
  };

  const northstarJd = `Role: Senior Systems & Full-Stack Engineer
Company: Northstar Orbit
Location: Remote (United States)
Employment Type: Full-time
Salary: $180,000 - $210,000 USD

Seeking a Senior Systems Engineer experienced in TypeScript, React, PostgreSQL, Node.js, and real-time observability tooling to build high-craft developer software. Must be authorized to work in the United States; we do not provide visa sponsorship at this time.`;

  const northstarApp: Application = {
    id: 'app-northstar-systems',
    company: 'Northstar Orbit',
    roleTitle: 'Senior Systems & Full-Stack Engineer',
    jobDescription: northstarJd,
    jobFacts: extractJobFactsByRules(northstarJd).facts,
    dismissedRequirements: [],
    parsedJob: {
      title: 'Senior Systems & Full-Stack Engineer',
      company: 'Northstar Orbit',
      seniority: 'Senior',
      summary:
        'Build high-craft developer tools with TypeScript, React, PostgreSQL, and low-latency sync infrastructure.',
      requirements: [
        {
          id: 'req-lin-ts',
          text: 'TypeScript',
          normalizedKey: 'typescript',
          priority: 'must-have',
          category: 'hard-skill',
        },
        {
          id: 'req-lin-react',
          text: 'React',
          normalizedKey: 'react',
          priority: 'must-have',
          category: 'hard-skill',
        },
        {
          id: 'req-lin-pg',
          text: 'PostgreSQL',
          normalizedKey: 'postgresql',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-lin-node',
          text: 'Node.js',
          normalizedKey: 'node.js',
          priority: 'nice-to-have',
          category: 'hard-skill',
        },
      ],
      responsibilities: [
        'Architect responsive client-side state engines and fast PostgreSQL queries',
        'Maintain sub-100ms interaction latency across large enterprise workspaces',
      ],
      keywords: [
        { term: 'TypeScript', normalized: 'typescript', kind: 'hard-skill' },
        { term: 'React', normalized: 'react', kind: 'hard-skill' },
        { term: 'PostgreSQL', normalized: 'postgresql', kind: 'tool' },
        { term: 'Node.js', normalized: 'node.js', kind: 'hard-skill' },
      ],
    },
    status: 'Applied',
    voice: 'natural',
    templateId: 'modern',
    activeStep: 4,
    lastActiveDoc: 'resume',
    lastActiveStep: 'review',
    workingDraft: {
      targetHeadline: 'Senior Systems & Full-Stack Engineer',
      summary:
        'Senior Systems Engineer building low-latency TypeScript, React, and PostgreSQL tools. Cut p99 query latency from 420ms to 68ms and sped up incident resolution by 44% at Vanguard Telemetry Systems.',
      summaryLocked: false,
      summarySourceIds: ['ach-ts-console', 'ach-pg-sharding'],
      selectedAchievementIds: [
        'ach-ts-console',
        'ach-pg-sharding',
        'ach-ledger-idempotency',
        'ach-otel-tracing',
      ],
      selectedSkillIds: [
        'skill-ts',
        'skill-react',
        'skill-node',
        'skill-postgres',
        'skill-redis',
        'skill-observability',
      ],
      selectedProjectIds: ['proj-pg-drift'],
      selectedEducationIds: ['edu-uw'],
      selectedCertificationIds: [],
      bullets: makeBullets('plain').slice(0, 4),
    },
    latestScores: {
      jobMatch: 96,
      atsReadiness: 91,
      appeal: 89,
      machineMadeScore: 10,
      subscores: {
        keywordCoverage: 100,
        structureAndParseability: 95,
        contentQuality: 90,
        lengthAndDensity: 90,
        titleAlignment: 100,
      },
      coveredKeywords: ['TypeScript', 'React', 'PostgreSQL', 'Node.js'],
      partialKeywords: [],
      gapKeywords: [],
      estimatedPages: 1,
    },
    createdAt: '2026-10-20T09:00:00.000Z',
    updatedAt: '2026-11-02T16:30:00.000Z',
  };

  const northstarCoverLetter = createDefaultCoverLetterDraft(northstarApp, bank);
  const northstarChecks = evaluateCoverLetterChecks({
    draft: northstarCoverLetter,
    parsedJob: northstarApp.parsedJob,
    bank,
    company: northstarApp.company,
    roleTitle: northstarApp.roleTitle,
  });
  northstarApp.coverLetterDraft = northstarCoverLetter;
  northstarApp.documents = {
    resume: northstarApp.workingDraft,
    coverLetter: northstarCoverLetter,
  };
  northstarApp.latestLetterChecks = northstarChecks.report;
  northstarApp.latestScores = computeAtsAndJobMatchScores(
    northstarApp,
    bank,
  ).scores;

  const northstarV1: DocumentVersion = {
    id: 'ver-northstar-1',
    applicationId: northstarApp.id,
    kind: 'resume',
    number: 1,
    label: 'Natural voice export for application',
    content: northstarApp.workingDraft,
    voice: 'natural',
    templateId: 'modern',
    modelId: 'cevin-3b-4bit-fused',
    scores: northstarApp.latestScores,
    createdAt: '2026-11-02T16:30:00.000Z',
  };

  const northstarClV1: DocumentVersion = {
    id: 'ver-northstar-cl-1',
    applicationId: northstarApp.id,
    kind: 'coverLetter',
    number: 1,
    label: 'Plain-spoken cover letter for Northstar Orbit',
    coverLetterContent: northstarCoverLetter,
    voice: northstarCoverLetter.voice,
    templateId: 'modern',
    modelId: 'cevin-3b-4bit-fused',
    scores: northstarApp.latestScores,
    letterChecks: northstarChecks.report,
    createdAt: '2026-11-02T16:35:00.000Z',
  };

  const heliosJd = `Role: Principal Ingestion Systems Engineer
Company: Helios Metrics
Location: New York, NY (Hybrid, 2 days/week)
Employment Type: Full-time

Lead high-volume telemetry ingestion pipelines in Go, Kafka, and Kubernetes. Experience with OpenTelemetry, Prometheus, and multi-tenant cost control is essential. Fluent English required.`;

  const heliosApp: Application = {
    id: 'app-helios-draft',
    company: 'Helios Metrics',
    roleTitle: 'Principal Ingestion Systems Engineer',
    jobDescription: heliosJd,
    jobFacts: extractJobFactsByRules(heliosJd).facts,
    dismissedRequirements: [],
    parsedJob: {
      title: 'Principal Ingestion Systems Engineer',
      company: 'Helios Metrics',
      seniority: 'Principal',
      summary:
        'Scale multi-tenant metric and trace ingestion pipelines using Go, Kafka, and Kubernetes.',
      requirements: [
        {
          id: 'req-dd-go',
          text: 'Go',
          normalizedKey: 'golang',
          priority: 'must-have',
          category: 'hard-skill',
        },
        {
          id: 'req-dd-kafka',
          text: 'Kafka',
          normalizedKey: 'kafka',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-dd-k8s',
          text: 'Kubernetes',
          normalizedKey: 'kubernetes',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-dd-otel',
          text: 'Observability',
          normalizedKey: 'observability',
          priority: 'must-have',
          category: 'tool',
        },
      ],
      responsibilities: [
        'Scale high-cardinality telemetry ingestion above 1M events/sec',
        'Reduce cross-AZ network transfer overhead',
      ],
      keywords: [
        { term: 'Go', normalized: 'golang', kind: 'hard-skill' },
        { term: 'Kafka', normalized: 'kafka', kind: 'tool' },
        { term: 'Kubernetes', normalized: 'kubernetes', kind: 'tool' },
        { term: 'Observability', normalized: 'observability', kind: 'tool' },
      ],
    },
    status: 'Draft',
    voice: 'professional',
    templateId: 'compact',
    activeStep: 2,
    lastActiveDoc: 'resume',
    lastActiveStep: 'build',
    workingDraft: {
      targetHeadline: 'Principal Ingestion Systems Engineer',
      summary:
        'Staff Platform Engineer specializing in Go, Kafka, and Kubernetes telemetry pipelines at 1.4M events/sec.',
      summaryLocked: false,
      summarySourceIds: ['ach-k8s-ingest', 'ach-otel-tracing'],
      selectedAchievementIds: [
        'ach-k8s-ingest',
        'ach-otel-tracing',
        'ach-pg-sharding',
        'ach-tf-cicd',
      ],
      selectedSkillIds: [
        'skill-go',
        'skill-kafka',
        'skill-k8s',
        'skill-observability',
        'skill-aws',
      ],
      selectedProjectIds: ['proj-pg-drift'],
      selectedEducationIds: ['edu-uw'],
      selectedCertificationIds: ['cert-cka'],
      bullets: makeBullets('polished').slice(0, 4),
    },
    latestScores: {
      jobMatch: 98,
      atsReadiness: 89,
      appeal: 87,
      machineMadeScore: 48,
      subscores: {
        keywordCoverage: 100,
        structureAndParseability: 95,
        contentQuality: 85,
        lengthAndDensity: 90,
        titleAlignment: 100,
      },
      coveredKeywords: ['Go', 'Kafka', 'Kubernetes', 'Observability'],
      partialKeywords: [],
      gapKeywords: [],
      estimatedPages: 1,
    },
    createdAt: '2026-11-04T11:00:00.000Z',
    updatedAt: '2026-11-06T08:15:00.000Z',
  };

  const heliosCoverLetter = createDefaultCoverLetterDraft(heliosApp, bank);
  const heliosChecks = evaluateCoverLetterChecks({
    draft: heliosCoverLetter,
    parsedJob: heliosApp.parsedJob,
    bank,
    company: heliosApp.company,
    roleTitle: heliosApp.roleTitle,
  });
  heliosApp.coverLetterDraft = heliosCoverLetter;
  heliosApp.documents = {
    resume: heliosApp.workingDraft,
    coverLetter: heliosCoverLetter,
  };
  heliosApp.latestLetterChecks = heliosChecks.report;
  heliosApp.latestScores = computeAtsAndJobMatchScores(
    heliosApp,
    bank,
  ).scores;

  const borealJd = `Role: Principal Cloud Infrastructure Architect
Company: Boreal Cloud
Location: Montreal, QC (Hybrid, 3 days in office)
Employment Type: Full-time permanent
Compensation: $185,000 - $215,000 CAD

We are hiring a Principal Cloud Infrastructure Architect in Montreal. Bilingual French and English required (Français courant exigé). Candidates must be legally authorized to work in Canada; no visa sponsorship is available. Core stack: Kubernetes, Terraform, Go, PostgreSQL, and AWS.`;

  const borealApp: Application = {
    id: 'app-boreal-prospect',
    company: 'Boreal Cloud',
    roleTitle: 'Principal Cloud Infrastructure Architect',
    jobDescription: borealJd,
    jobFacts: extractJobFactsByRules(borealJd).facts,
    dismissedRequirements: [],
    parsedJob: {
      title: 'Principal Cloud Infrastructure Architect',
      company: 'Boreal Cloud',
      seniority: 'Principal',
      summary:
        'Architect multi-region cloud infrastructure on Kubernetes, Terraform, Go, and PostgreSQL.',
      requirements: [
        {
          id: 'req-bor-k8s',
          text: 'Kubernetes',
          normalizedKey: 'kubernetes',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-bor-tf',
          text: 'Terraform',
          normalizedKey: 'terraform',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-bor-go',
          text: 'Go',
          normalizedKey: 'golang',
          priority: 'must-have',
          category: 'hard-skill',
        },
        {
          id: 'req-bor-pg',
          text: 'PostgreSQL',
          normalizedKey: 'postgresql',
          priority: 'must-have',
          category: 'tool',
        },
        {
          id: 'req-bor-aws',
          text: 'Amazon Web Services',
          normalizedKey: 'amazon web services',
          priority: 'must-have',
          category: 'tool',
        },
      ],
      responsibilities: [
        'Lead multi-region Kubernetes and Terraform platform architecture',
        'Partner with security and database reliability teams across Montreal and Toronto',
      ],
      keywords: [
        { term: 'Kubernetes', normalized: 'kubernetes', kind: 'tool' },
        { term: 'Terraform', normalized: 'terraform', kind: 'tool' },
        { term: 'Go', normalized: 'golang', kind: 'hard-skill' },
        { term: 'PostgreSQL', normalized: 'postgresql', kind: 'tool' },
        { term: 'Amazon Web Services', normalized: 'amazon web services', kind: 'tool' },
      ],
    },
    status: 'Prospect',
    voice: 'balanced',
    templateId: 'classic',
    activeStep: 1,
    lastActiveDoc: 'resume',
    lastActiveStep: 'job',
    workingDraft: {
      targetHeadline: 'Principal Cloud Infrastructure Architect',
      summary:
        'Staff Platform Engineer experienced in Kubernetes, Terraform, Go, and PostgreSQL on AWS.',
      summaryLocked: false,
      summarySourceIds: ['ach-k8s-ingest', 'ach-tf-cicd'],
      selectedAchievementIds: [
        'ach-k8s-ingest',
        'ach-pg-sharding',
        'ach-tf-cicd',
      ],
      selectedSkillIds: [
        'skill-k8s',
        'skill-terraform',
        'skill-go',
        'skill-postgres',
        'skill-aws',
      ],
      selectedProjectIds: ['proj-pg-drift'],
      selectedEducationIds: ['edu-uw'],
      selectedCertificationIds: ['cert-cka'],
      bullets: makeBullets('balanced').slice(0, 3),
    },
    latestScores: {
      jobMatch: 95,
      atsReadiness: 90,
      appeal: 88,
      machineMadeScore: 12,
      subscores: {
        keywordCoverage: 100,
        structureAndParseability: 95,
        contentQuality: 90,
        lengthAndDensity: 85,
        titleAlignment: 100,
      },
      coveredKeywords: [
        'Kubernetes',
        'Terraform',
        'Go',
        'PostgreSQL',
        'Amazon Web Services',
      ],
      partialKeywords: [],
      gapKeywords: [],
      estimatedPages: 1,
    },
    createdAt: '2026-11-06T15:00:00.000Z',
    updatedAt: '2026-11-06T15:00:00.000Z',
  };
  const borealComputed = computeAtsAndJobMatchScores(borealApp, bank).scores;
  borealApp.latestScores = {
    ...borealComputed,
    jobMatch: Math.min(88, borealComputed.jobMatch),
  };

  return {
    applications: [kestrelApp, northstarApp, heliosApp, borealApp],
    versions: [
      kestrelV1,
      kestrelV2,
      kestrelV3,
      kestrelClV1,
      northstarV1,
      northstarClV1,
    ],
  };
}

