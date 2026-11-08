/**
 * Canonical alias map for technical and professional terms.
 * Maps canonical lower-case name -> list of synonyms/abbreviations.
 */
export const KEYWORD_ALIAS_GROUPS: Record<string, string[]> = {
  javascript: ['js', 'ecmascript', 'es6', 'es2022', 'vanilla js'],
  typescript: ['ts'],
  kubernetes: ['k8s', 'eks', 'gke', 'aks', 'kube'],
  postgresql: ['postgres', 'psql', 'pg'],
  'ci/cd': [
    'cicd',
    'continuous integration',
    'continuous delivery',
    'continuous deployment',
    'github actions',
    'gitlab ci',
  ],
  react: ['reactjs', 'react.js', 'react 18', 'react 19'],
  'node.js': ['node', 'nodejs'],
  'amazon web services': ['aws', 'ec2', 's3', 'lambda', 'ecs'],
  'google cloud platform': ['gcp', 'google cloud', 'cloud run', 'bigquery'],
  python: ['py', 'python3'],
  terraform: ['tf', 'infrastructure as code', 'iac'],
  graphql: ['gql', 'apollo graphql'],
  docker: ['containers', 'containerization', 'oci'],
  observability: [
    'opentelemetry',
    'otel',
    'prometheus',
    'grafana',
    'datadog',
    'telemetry',
  ],
  microservices: ['distributed systems', 'service-oriented architecture', 'soa'],
  'machine learning': ['ml', 'deep learning', 'ai/ml'],
  'large language models': ['llm', 'llms', 'genai', 'generative ai', 'ollama'],
  accessibility: ['a11y', 'wcag', 'wcag aa', 'aria'],
  redis: ['in-memory cache', 'distributed caching'],
  kafka: ['apache kafka', 'event streaming'],
  golang: ['go'],
  rust: ['rustlang'],
};

const REVERSE_ALIAS_LOOKUP: Map<string, string> = (() => {
  const map = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(KEYWORD_ALIAS_GROUPS)) {
    map.set(canonical, canonical);
    for (const alias of aliases) {
      map.set(alias.toLowerCase(), canonical);
    }
  }
  return map;
})();

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'has',
  'he',
  'in',
  'is',
  'it',
  'its',
  'of',
  'on',
  'that',
  'the',
  'to',
  'was',
  'were',
  'will',
  'with',
  'you',
  'your',
  'our',
  'we',
  'who',
  'experience',
  'years',
  'work',
  'working',
  'team',
  'role',
  'strong',
  'ability',
  'skills',
  'using',
  'build',
  'building',
]);

/**
 * Lightweight deterministic stemmer + canonical alias resolver.
 */
export function normalizeKeyword(raw: string): string {
  const cleaned = raw
    .toLowerCase()
    .trim()
    .replace(/^[.,/#!$%^&*;:{}=\-_`~()]+|[.,/#!$%^&*;:{}=\-_`~()]+$/g, '')
    .replace(/\s+/g, ' ');

  if (!cleaned) return '';

  const directAlias = REVERSE_ALIAS_LOOKUP.get(cleaned);
  if (directAlias) return directAlias;

  if (cleaned.length > 5 && cleaned.endsWith('ing')) {
    const stem = cleaned.slice(0, -3);
    return REVERSE_ALIAS_LOOKUP.get(stem) ?? stem;
  }
  if (cleaned.length > 4 && cleaned.endsWith('ies')) {
    const stem = `${cleaned.slice(0, -3)}y`;
    return REVERSE_ALIAS_LOOKUP.get(stem) ?? stem;
  }
  if (cleaned.length > 4 && cleaned.endsWith('es') && !cleaned.endsWith('ses')) {
    const stem = cleaned.slice(0, -1);
    if (REVERSE_ALIAS_LOOKUP.has(stem)) {
      return REVERSE_ALIAS_LOOKUP.get(stem)!;
    }
  }
  if (
    cleaned.length > 3 &&
    cleaned.endsWith('s') &&
    !cleaned.endsWith('ss') &&
    !cleaned.endsWith('js') &&
    !cleaned.endsWith('ts') &&
    !cleaned.endsWith('aws') &&
    !cleaned.endsWith('k8s')
  ) {
    const singular = cleaned.slice(0, -1);
    return REVERSE_ALIAS_LOOKUP.get(singular) ?? singular;
  }

  return cleaned;
}

/**
 * Returns all surface variations (canonical + known aliases + custom skill aliases)
 * for a given keyword.
 */
export function expandKeywordAliases(
  term: string,
  customAliases: Map<string, string[]> = new Map(),
): string[] {
  const norm = normalizeKeyword(term);
  const set = new Set<string>([term.toLowerCase().trim(), norm]);

  const builtin = KEYWORD_ALIAS_GROUPS[norm];
  if (builtin) {
    for (const alias of builtin) set.add(alias.toLowerCase());
  }

  const custom = customAliases.get(norm);
  if (custom) {
    for (const alias of custom) set.add(alias.toLowerCase());
  }

  return Array.from(set).filter(Boolean);
}

/**
 * Checks whether a target keyword (or any of its aliases) appears in the given text corpus.
 * Returns 'covered' for exact/alias phrase match, 'partial' for token overlap, or 'gap'.
 */
export function evaluateKeywordPresence(
  keyword: string,
  corpusText: string,
  customAliases: Map<string, string[]> = new Map(),
): 'covered' | 'partial' | 'gap' {
  const lowerCorpus = corpusText.toLowerCase();
  const variants = expandKeywordAliases(keyword, customAliases);

  for (const variant of variants) {
    if (!variant) continue;
    const escaped = variant.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
    if (regex.test(lowerCorpus)) {
      return 'covered';
    }
  }

  const tokens = normalizeKeyword(keyword)
    .split(/\s+/)
    .filter((t) => t.length > 2 && !STOP_WORDS.has(t));

  if (tokens.length > 1) {
    const matchedTokens = tokens.filter((tok) => lowerCorpus.includes(tok));
    if (matchedTokens.length > 0) {
      return 'partial';
    }
  }

  return 'gap';
}

/**
 * Extracts normalized technical and domain keywords from raw job description text.
 */
export function extractDomainKeywordsFromText(text: string): Array<{
  term: string;
  normalized: string;
  kind: 'hard-skill' | 'tool' | 'soft-skill';
}> {
  const found = new Map<
    string,
    { term: string; normalized: string; kind: 'hard-skill' | 'tool' | 'soft-skill' }
  >();

  const lower = text.toLowerCase();

  const knownTools = new Set([
    'kubernetes',
    'docker',
    'terraform',
    'postgresql',
    'redis',
    'kafka',
    'amazon web services',
    'google cloud platform',
    'ci/cd',
    'observability',
  ]);

  for (const [canonical, aliases] of Object.entries(KEYWORD_ALIAS_GROUPS)) {
    const allForms = [canonical, ...aliases];
    for (const form of allForms) {
      const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const regex = new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i');
      if (regex.test(lower)) {
        const display =
          canonical === 'ci/cd'
            ? 'CI/CD'
            : canonical === 'postgresql'
              ? 'PostgreSQL'
              : canonical === 'javascript'
                ? 'JavaScript'
                : canonical === 'typescript'
                  ? 'TypeScript'
                  : canonical === 'graphql'
                    ? 'GraphQL'
                    : canonical === 'node.js'
                      ? 'Node.js'
                      : canonical
                          .split(' ')
                          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                          .join(' ');
        found.set(canonical, {
          term: display,
          normalized: canonical,
          kind: knownTools.has(canonical) ? 'tool' : 'hard-skill',
        });
        break;
      }
    }
  }

  const softSkillPatterns: Array<[string, string]> = [
    ['mentoring', 'Mentoring'],
    ['cross-functional', 'Cross-functional collaboration'],
    ['system design', 'System Design'],
    ['architecture', 'Technical Architecture'],
    ['incident response', 'Incident Response'],
    ['stakeholder', 'Stakeholder Communication'],
    ['performance optimization', 'Performance Optimization'],
  ];

  for (const [pattern, label] of softSkillPatterns) {
    if (lower.includes(pattern)) {
      const norm = normalizeKeyword(pattern);
      if (!found.has(norm)) {
        found.set(norm, {
          term: label,
          normalized: norm,
          kind:
            pattern === 'system design' ||
            pattern === 'architecture' ||
            pattern === 'performance optimization'
              ? 'hard-skill'
              : 'soft-skill',
        });
      }
    }
  }

  return Array.from(found.values());
}
