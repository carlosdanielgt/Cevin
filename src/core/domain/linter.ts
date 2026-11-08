export interface MachineMadeLintIssue {
  kind: 'stock-verb' | 'stock-adjective' | 'em-dash' | 'uniform-rhythm';
  term: string;
  explanation: string;
  penalty: number;
}

export interface MachineMadeLintReport {
  /**
   * 0 to 100 heuristic score indicating how formulaic or "machine-made"
   * the phrasing sounds. Drops visibly as Voice moves toward Plain-spoken.
   */
  score: number;
  label: 'Human & varied' | 'Slightly formal' | 'Formulaic' | 'Heavily templated';
  issues: MachineMadeLintIssue[];
}

const STOCK_AI_VERBS = [
  'spearheaded',
  'orchestrated',
  'synergized',
  'revolutionized',
  'catalyzed',
  'pioneered',
  'championed',
  'leveraged',
  'utilized',
  'architected',
  'streamlined',
  'empowered',
  'fostered',
];

const STOCK_AI_ADJECTIVES = [
  'cutting-edge',
  'seamless',
  'seamlessly',
  'robust',
  'transformative',
  'mission-critical',
  'paradigm-shifting',
  'world-class',
  'best-in-class',
  'holistic',
  'next-generation',
  'state-of-the-art',
  'thereby',
];

/**
 * Deterministic linter for clichés and AI-isms: stock verbs and adjectives,
 * uniform bullet length and rhythm, and em-dash overuse.
 * Note: This is an honest stylistic heuristic, never claimed as an AI detector bypass.
 */
export function lintMachineMadeScore(bullets: string[]): MachineMadeLintReport {
  if (bullets.length === 0) {
    return { score: 0, label: 'Human & varied', issues: [] };
  }

  const issues: MachineMadeLintIssue[] = [];
  const joined = bullets.join(' \n ');
  const lower = joined.toLowerCase();

  for (const verb of STOCK_AI_VERBS) {
    const regex = new RegExp(`\\b${verb}\\b`, 'gi');
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      issues.push({
        kind: 'stock-verb',
        term: verb,
        explanation: `"${verb}" is an overused resume cliché (${matches.length}×). Prefer direct verbs like "built", "ran", or "led".`,
        penalty: Math.min(24, matches.length * 9),
      });
    }
  }

  for (const adj of STOCK_AI_ADJECTIVES) {
    const escaped = adj.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(^|[^a-z])${escaped}([^a-z]|$)`, 'gi');
    const matches = lower.match(regex);
    if (matches && matches.length > 0) {
      issues.push({
        kind: 'stock-adjective',
        term: adj,
        explanation: `"${adj}" reads like filler. Replace with a concrete number or constraint.`,
        penalty: Math.min(20, matches.length * 8),
      });
    }
  }

  // Check em-dash overuse
  const emDashCount = (joined.match(/—|--/g) ?? []).length;
  if (emDashCount >= 2) {
    issues.push({
      kind: 'em-dash',
      term: '— (em-dash)',
      explanation: `Em-dashes appear ${emDashCount} times across bullets—a common LLM punctuation habit.`,
      penalty: Math.min(22, emDashCount * 7),
    });
  }

  // Check uniform bullet word count & participle clause rhythm (", thereby ", ", resulting in ", ", ensuring ")
  const participleMatches = (
    lower.match(/,\s*(thereby|resulting in|ensuring|enabling|driving|achieving)\b/g) ?? []
  ).length;
  if (participleMatches >= 2) {
    issues.push({
      kind: 'uniform-rhythm',
      term: '", resulting in / thereby..."',
      explanation: `${participleMatches} bullets end with the same trailing participle cadence. Break some into two crisp sentences.`,
      penalty: Math.min(20, participleMatches * 7),
    });
  }

  if (bullets.length >= 3) {
    const wordLengths = bullets.map(
      (b) => b.trim().split(/\s+/).filter(Boolean).length,
    );
    const mean =
      wordLengths.reduce((acc, n) => acc + n, 0) / wordLengths.length;
    const variance =
      wordLengths.reduce((acc, n) => acc + (n - mean) ** 2, 0) /
      wordLengths.length;
    const stdDev = Math.sqrt(variance);
    if (stdDev < 2.2) {
      issues.push({
        kind: 'uniform-rhythm',
        term: 'Uniform bullet length',
        explanation: `Bullets have nearly identical word counts (σ = ${stdDev.toFixed(1)} words). Vary short punchy lines with detailed ones.`,
        penalty: 12,
      });
    }
  }

  const rawPenalty = issues.reduce((acc, i) => acc + i.penalty, 0);
  const score = Math.max(4, Math.min(96, rawPenalty + 6));

  const label: MachineMadeLintReport['label'] =
    score < 22
      ? 'Human & varied'
      : score < 45
        ? 'Slightly formal'
        : score < 70
          ? 'Formulaic'
          : 'Heavily templated';

  return {
    score,
    label,
    issues,
  };
}
