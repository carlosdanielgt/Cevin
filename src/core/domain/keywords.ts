import { Skill, SkillCategory } from './entities';

/**
 * Pure domain keyword normalization, synonym alias expansion, related-skill expansion,
 * and deterministic skill category taxonomy.
 *
 * Rules:
 * - `KEYWORD_ALIAS_GROUPS` and `skill.aliases` are strictly true synonyms/abbreviations
 *   (e.g., "JS" for "JavaScript", "TS" for "TypeScript", "k8s" for "Kubernetes",
 *   "Postgres" for "PostgreSQL"). Matching a synonym produces `'covered'`.
 * - `KEYWORD_RELATED_GROUPS` and `skill.related` are related tools or adjacent technologies
 *   (e.g., "TypeScript" <-> "JavaScript", "Node.js" <-> "Express",
 *   "Observability" <-> "OpenTelemetry" / "Prometheus" / "Grafana",
 *   "CI/CD" <-> "GitHub Actions"). Matching a related skill produces `'partial'`, NEVER `'covered'`.
 */
export const KEYWORD_ALIAS_GROUPS: Record<string, string[]> = {
  typescript: ['ts'],
  javascript: ['js', 'ecmascript', 'es6', 'es2022'],
  golang: ['go', 'go language'],
  python: ['py', 'python3'],
  kubernetes: ['k8s', 'kube'],
  postgresql: ['postgres', 'psql', 'pg'],
  'amazon web services': ['aws'],
  'google cloud platform': ['gcp', 'google cloud'],
  'microsoft azure': ['azure'],
  'ci/cd': [
    'cicd',
    'ci cd',
    'continuous integration',
    'continuous delivery',
    'continuous deployment',
  ],
  terraform: ['tf', 'hcl', 'infrastructure as code', 'iac'],
  docker: ['containers', 'oci', 'containerization'],
  react: ['reactjs', 'react.js', 'react 18', 'react 19'],
  'node.js': ['nodejs', 'node'],
  kafka: ['apache kafka'],
  redis: ['redis cache'],
  graphql: ['gql'],
  observability: ['o11y'],
  microservices: ['microservice architecture', 'service-oriented architecture'],
  'technical architecture': ['system architecture', 'software architecture'],
  'machine learning': ['ml'],
  'large language models': ['llm', 'llms', 'genai', 'generative ai'],
};

/**
 * Adjacent / ecosystem relationships that grant `'partial'` coverage (never `'covered'`).
 */
export const KEYWORD_RELATED_GROUPS: Record<string, string[]> = {
  javascript: ['typescript', 'node.js', 'react'],
  typescript: ['javascript'],
  'node.js': ['express', 'nestjs', 'fastify'],
  express: ['node.js'],
  kubernetes: ['helm', 'eks', 'gke', 'aks', 'docker'],
  helm: ['kubernetes'],
  'amazon web services': ['ec2', 's3', 'ecs', 'eks', 'rds', 'lambda'],
  'ci/cd': ['github actions', 'gitlab ci', 'jenkins', 'canary deploys'],
  'github actions': ['ci/cd'],
  observability: [
    'opentelemetry',
    'otel',
    'prometheus',
    'promql',
    'grafana',
    'datadog',
    'distributed tracing',
    'sre',
    'site reliability engineering',
  ],
  opentelemetry: ['observability', 'distributed tracing'],
  prometheus: ['observability', 'grafana', 'promql'],
  grafana: ['observability', 'prometheus'],
  kafka: ['event streaming', 'rabbitmq'],
  redis: ['distributed caching'],
  microservices: ['distributed systems', 'grpc', 'rest api'],
};

const REVERSE_ALIAS_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(KEYWORD_ALIAS_GROUPS)) {
    map.set(canonical, canonical);
    for (const alias of aliases) {
      map.set(alias.toLowerCase().trim(), canonical);
    }
  }
  return map;
})();

const TAXONOMY_BY_CATEGORY: Record<SkillCategory, string[]> = {
  Languages: [
    'typescript',
    'javascript',
    'golang',
    'go',
    'python',
    'rust',
    'java',
    'c++',
    'c#',
    'c',
    'sql',
    'ruby',
    'kotlin',
    'swift',
    'scala',
    'php',
    'bash',
    'shell',
    'html',
    'css',
  ],
  Frameworks: [
    'react',
    'node.js',
    'next.js',
    'express',
    'fastapi',
    'django',
    'flask',
    'spring',
    'spring boot',
    'vue',
    'angular',
    'svelte',
    'nestjs',
    'graphql',
    'grpc',
    'tailwind css',
  ],
  Infrastructure: [
    'kubernetes',
    'docker',
    'terraform',
    'amazon web services',
    'aws',
    'google cloud platform',
    'gcp',
    'microsoft azure',
    'azure',
    'linux',
    'helm',
    'nginx',
    'cloudflare',
    'ebpf',
    'envoy',
    'istio',
  ],
  'Data & AI': [
    'postgresql',
    'redis',
    'kafka',
    'mysql',
    'mongodb',
    'elasticsearch',
    'snowflake',
    'bigquery',
    'spark',
    'clickhouse',
    'dynamodb',
    'rabbitmq',
    'machine learning',
    'large language models',
    'pytorch',
    'mlx',
  ],
  Practices: [
    'ci/cd',
    'microservices',
    'technical architecture',
    'system design',
    'distributed systems',
    'incident response',
    'site reliability engineering',
    'sre',
    'agile',
    'scrum',
    'tdd',
    'test-driven development',
    'domain-driven design',
    'ddd',
    'hexagonal architecture',
    'security',
    'performance tuning',
    'cost optimization',
    'mentoring',
  ],
  Tools: [
    'observability',
    'opentelemetry',
    'prometheus',
    'grafana',
    'datadog',
    'git',
    'github',
    'github actions',
    'gitlab',
    'jira',
    'Jenkins',
    'playwright',
    'vitest',
    'jest',
    'webpack',
    'vite',
  ],
  Other: [],
};

/**
 * Normalizes any raw skill or keyword string into its canonical lowercase form.
 */
export function normalizeKeyword(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .replace(/[()[\]{}'"`]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return REVERSE_ALIAS_LOOKUP.get(cleaned) ?? cleaned;
}

/**
 * Deterministically assigns a `SkillCategory` using the built-in taxonomy first,
 * falling back to `'Other'` when a term is not recognized (or correcting known
 * misclassifications such as "Microservices" or "Technical Architecture" in `Languages`).
 */
export function classifySkillCategory(
  skillName: string,
  requestedCategory?: SkillCategory,
): SkillCategory {
  const rawLower = skillName.toLowerCase().trim();
  const norm = normalizeKeyword(skillName);

  for (const [category, terms] of Object.entries(TAXONOMY_BY_CATEGORY) as Array<
    [SkillCategory, string[]]
  >) {
    if (category === 'Other') continue;
    for (const term of terms) {
      const termLower = term.toLowerCase();
      if (rawLower === termLower || norm === normalizeKeyword(termLower)) {
        return category;
      }
    }
  }

  // Heuristic suffixes for unlisted items
  if (
    /\b(architecture|design|microservices|methodology|leadership|management|mentoring|agile|testing|ci\/cd|devops|sre|reliability)\b/i.test(
      rawLower,
    )
  ) {
    return 'Practices';
  }
  if (/\b(db|database|sql|warehouse|analytics|ml|ai)\b/i.test(rawLower)) {
    return 'Data & AI';
  }
  if (/\b(cloud|cluster|container|network|infra)\b/i.test(rawLower)) {
    return 'Infrastructure';
  }

  // If the caller explicitly provided a non-Languages category (or if it truly isn't a programming language),
  // prevent non-language terms from landing in Languages.
  if (requestedCategory && requestedCategory !== 'Languages') {
    return requestedCategory;
  }
  return 'Other';
}

/**
 * Separates non-synonym related skills out of `aliases` and into `related`
 * so `aliases` only ever contains true synonyms.
 */
export function sanitizeSkillAliasesAndRelated(
  skillName: string,
  rawAliases: string[] = [],
  rawRelated: string[] = [],
): { aliases: string[]; related: string[] } {
  const canonical = normalizeKeyword(skillName);
  const trueSynonymsSet = new Set<string>([
    canonical,
    skillName.toLowerCase().trim(),
    ...(KEYWORD_ALIAS_GROUPS[canonical] ?? []).map((a) => a.toLowerCase()),
  ]);

  const knownRelatedSet = new Set<string>(
    (KEYWORD_RELATED_GROUPS[canonical] ?? []).map((r) => r.toLowerCase()),
  );

  const cleanAliases: string[] = [];
  const cleanRelated: string[] = [...rawRelated];

  for (const item of rawAliases) {
    const trimmed = item.trim();
    if (!trimmed) continue;
    const itemLower = trimmed.toLowerCase();
    const itemCanonical = normalizeKeyword(trimmed);

    if (itemLower === skillName.toLowerCase().trim()) {
      continue;
    }

    // If the alias normalizes to a DIFFERENT canonical skill in our dictionary or is in knownRelatedSet,
    // it is a related skill/tool, NOT a synonym!
    const isDifferentKnownSkill =
      (REVERSE_ALIAS_LOOKUP.has(itemLower) && itemCanonical !== canonical) ||
      knownRelatedSet.has(itemLower) ||
      knownRelatedSet.has(itemCanonical);

    if (isDifferentKnownSkill && !trueSynonymsSet.has(itemLower)) {
      cleanRelated.push(trimmed);
    } else {
      cleanAliases.push(trimmed);
    }
  }

  const dedupAliases = Array.from(new Set(cleanAliases));
  const dedupRelated = Array.from(
    new Set(
      cleanRelated
        .map((r) => r.trim())
        .filter(
          (r) =>
            Boolean(r) &&
            r.toLowerCase() !== skillName.toLowerCase().trim() &&
            !dedupAliases.some((a) => a.toLowerCase() === r.toLowerCase()),
        ),
    ),
  );

  return { aliases: dedupAliases, related: dedupRelated };
}

export type CustomTermLookup =
  | Map<string, string[]>
  | Record<string, string[]>;

function lookupCustomTerms(
  lookup: CustomTermLookup | undefined,
  key: string,
): string[] {
  if (!lookup) return [];
  if (lookup instanceof Map) {
    return lookup.get(key) ?? [];
  }
  return lookup[key] ?? [];
}

/**
 * Returns all known surface forms (canonical + true synonym aliases) for a given keyword.
 */
export function expandKeywordAliases(
  term: string,
  customAliases?: CustomTermLookup,
): string[] {
  const canonical = normalizeKeyword(term);
  const rawLower = term.toLowerCase().trim();
  const builtIn = KEYWORD_ALIAS_GROUPS[canonical] ?? [];
  const userDefined = [
    ...lookupCustomTerms(customAliases, canonical),
    ...lookupCustomTerms(customAliases, rawLower),
  ];
  const set = new Set<string>([
    canonical,
    rawLower,
    ...builtIn,
    ...userDefined,
  ]);
  return Array.from(set).filter(Boolean);
}

/**
 * Returns all related (adjacent/ecosystem) terms for a given keyword.
 */
export function expandRelatedKeywords(
  term: string,
  customRelated?: CustomTermLookup,
): string[] {
  const canonical = normalizeKeyword(term);
  const rawLower = term.toLowerCase().trim();
  const builtIn = [
    ...(KEYWORD_RELATED_GROUPS[canonical] ?? []),
    ...(KEYWORD_RELATED_GROUPS[rawLower] ?? []),
  ];
  const userDefined = [
    ...lookupCustomTerms(customRelated, canonical),
    ...lookupCustomTerms(customRelated, rawLower),
  ];
  const set = new Set<string>([...builtIn, ...userDefined]);
  for (const rel of Array.from(set)) {
    for (const syn of expandKeywordAliases(rel)) {
      set.add(syn);
    }
  }
  return Array.from(set).filter(Boolean);
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasBoundaryMatch(form: string, lowerCorpus: string): boolean {
  if (!form) return false;
  const pattern = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegex(form)}(?:$|[^a-z0-9])`,
    'i',
  );
  return pattern.test(lowerCorpus);
}

/**
 * Checks if a requirement/keyword is covered, partially covered, or a gap in a target text corpus.
 * - Exact or synonym match -> `'covered'`
 * - Related skill/tool match or multi-word token overlap -> `'partial'` (never `'covered'`)
 * - Otherwise -> `'gap'`
 */
export function evaluateKeywordPresence(
  requirementTerm: string,
  corpusText: string,
  customAliases?: CustomTermLookup,
  customRelated?: CustomTermLookup,
): 'covered' | 'partial' | 'gap' {
  const lowerCorpus = corpusText.toLowerCase();
  const forms = expandKeywordAliases(requirementTerm, customAliases);

  for (const form of forms) {
    if (hasBoundaryMatch(form, lowerCorpus)) {
      return 'covered';
    }
  }

  // Check related skills/tools (produces 'partial', never 'covered')
  const relatedForms = expandRelatedKeywords(requirementTerm, customRelated);
  for (const relForm of relatedForms) {
    if (hasBoundaryMatch(relForm, lowerCorpus)) {
      return 'partial';
    }
  }

  // Check partial token overlap for multi-word requirements (e.g., "PostgreSQL partition routing")
  const tokens = normalizeKeyword(requirementTerm)
    .split(/\s+/)
    .filter(
      (t) =>
        t.length > 2 &&
        ![
          'and',
          'the',
          'for',
          'with',
          'using',
          'experience',
          'strong',
          'deep',
        ].includes(t),
    );

  if (tokens.length >= 2) {
    const matchedTokens = tokens.filter((t) => hasBoundaryMatch(t, lowerCorpus));
    if (matchedTokens.length >= Math.ceil(tokens.length / 2)) {
      return 'partial';
    }
  }

  return 'gap';
}

/**
 * Extracts recognized technical & domain keywords from raw job description or resume text.
 */
export function extractDomainKeywordsFromText(rawText: string): Array<{
  term: string;
  normalized: string;
  kind: 'hard-skill' | 'tool' | 'soft-skill';
}> {
  const lower = rawText.toLowerCase();
  const results: Array<{
    term: string;
    normalized: string;
    kind: 'hard-skill' | 'tool' | 'soft-skill';
  }> = [];
  const seen = new Set<string>();

  const DISPLAY_LABELS: Record<string, string> = {
    typescript: 'TypeScript',
    javascript: 'JavaScript',
    golang: 'Go',
    python: 'Python',
    kubernetes: 'Kubernetes',
    postgresql: 'PostgreSQL',
    'amazon web services': 'AWS',
    'google cloud platform': 'GCP',
    'microsoft azure': 'Azure',
    'ci/cd': 'CI/CD',
    terraform: 'Terraform',
    docker: 'Docker',
    react: 'React',
    'node.js': 'Node.js',
    kafka: 'Kafka',
    redis: 'Redis',
    graphql: 'GraphQL',
    observability: 'Observability',
    microservices: 'Microservices',
    'technical architecture': 'Technical Architecture',
    'machine learning': 'Machine Learning',
    'large language models': 'LLMs',
  };

  const TOOL_CANONICALS = new Set([
    'kubernetes',
    'postgresql',
    'amazon web services',
    'google cloud platform',
    'microsoft azure',
    'terraform',
    'docker',
    'kafka',
    'redis',
    'observability',
  ]);

  for (const [canonical, aliases] of Object.entries(KEYWORD_ALIAS_GROUPS)) {
    const candidates = [canonical, ...aliases];
    const matched = candidates.some((c) => hasBoundaryMatch(c, lower));
    if (matched && !seen.has(canonical)) {
      seen.add(canonical);
      results.push({
        term: DISPLAY_LABELS[canonical] ?? canonical,
        normalized: canonical,
        kind: TOOL_CANONICALS.has(canonical) ? 'tool' : 'hard-skill',
      });
    }
  }

  const EXTRA_TERMS: Array<{
    label: string;
    norm: string;
    kind: 'hard-skill' | 'tool' | 'soft-skill';
  }> = [
    { label: 'Rust', norm: 'rust', kind: 'hard-skill' },
    { label: 'Java', norm: 'java', kind: 'hard-skill' },
    { label: 'C++', norm: 'c++', kind: 'hard-skill' },
    { label: 'SQL', norm: 'sql', kind: 'hard-skill' },
    { label: 'gRPC', norm: 'grpc', kind: 'hard-skill' },
    { label: 'REST APIs', norm: 'rest api', kind: 'hard-skill' },
    { label: 'Linux', norm: 'linux', kind: 'tool' },
    { label: 'Helm', norm: 'helm', kind: 'tool' },
    { label: 'Prometheus', norm: 'prometheus', kind: 'tool' },
    { label: 'OpenTelemetry', norm: 'opentelemetry', kind: 'tool' },
    { label: 'Grafana', norm: 'grafana', kind: 'tool' },
    { label: 'GitHub Actions', norm: 'github actions', kind: 'tool' },
    { label: 'System Design', norm: 'system design', kind: 'hard-skill' },
    { label: 'Mentoring', norm: 'mentoring', kind: 'soft-skill' },
    { label: 'Incident Response', norm: 'incident response', kind: 'soft-skill' },
  ];

  for (const extra of EXTRA_TERMS) {
    if (seen.has(extra.norm)) continue;
    if (hasBoundaryMatch(extra.norm, lower)) {
      seen.add(extra.norm);
      results.push({
        term: extra.label,
        normalized: extra.norm,
        kind: extra.kind,
      });
    }
  }

  return results;
}

/**
 * Helper to normalize a Bank `Skill` record's category, aliases, and related skills.
 */
export function normalizeBankSkill(skill: Skill): Skill {
  const { aliases, related } = sanitizeSkillAliasesAndRelated(
    skill.name,
    skill.aliases,
    skill.related ?? [],
  );
  const category = classifySkillCategory(skill.name, skill.category);
  return {
    ...skill,
    category,
    aliases,
    related: related.length > 0 ? related : undefined,
  };
}
