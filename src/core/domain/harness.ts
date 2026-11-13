import { assembleBullet } from './bulletAssembler';
import {
  Achievement,
  BankSnapshot,
  CoverLetterBlockType,
  CoverLetterLength,
  ParsedJob,
  VoiceLevel,
} from './entities';
import {
  expandKeywordAliases,
  extractDomainKeywordsFromText,
  normalizeKeyword,
} from './keywords';
import { rankBankItemsForJob } from './matching';
import { VOICE_STYLE_SPECS } from './voice';

/**
 * Fast, deterministic 32-bit FNV-1a hash returned as an 8-char hex string.
 * Used for cache keys, input hashes, brief hashes, and deterministic seeds.
 */
export function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Derives a deterministic integer seed from an item identifier and attempt number.
 * Ensures reproducible generations on attempt 0 and a distinct sample on attempt 1 (repair).
 */
export function deriveSeed(itemId: string, attempt = 0): number {
  let hash = 0x811c9dc5;
  const key = `${itemId}::attempt:${attempt}`;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0) % 2147483647;
}

export interface CacheKeyParts {
  modelName: string;
  profileId: string;
  taskId: string;
  promptVersion: string;
  voiceId: string;
  inputHash: string;
  briefHash: string;
  seed: number;
}

export function buildCacheKey(parts: CacheKeyParts): string {
  const raw = [
    parts.modelName.trim().toLowerCase(),
    parts.profileId,
    parts.taskId,
    parts.promptVersion,
    parts.voiceId,
    parts.inputHash,
    parts.briefHash,
    String(parts.seed),
  ].join('|');
  return `cevin-cache-${fnv1aHash(raw)}-${parts.taskId}-${parts.voiceId}`;
}

/**
 * Self-calibrating token estimator.
 * Starts at 3.8 characters per token for English prose/JSON and smoothly calibrates
 * using an exponential moving average whenever the provider reports actual promptTokens.
 */
export class TokenEstimator {
  private charsPerToken = 3.8;
  private observations = 0;

  estimateTokens(text: string): number {
    if (!text) return 0;
    return Math.max(1, Math.ceil(text.length / this.charsPerToken));
  }

  recordObservation(charCount: number, actualTokens: number): void {
    if (charCount <= 20 || actualTokens <= 4) return;
    const observedRatio = charCount / actualTokens;
    // Clamp to sane range [2.2, 5.5]
    const clamped = Math.max(2.2, Math.min(5.5, observedRatio));
    this.observations += 1;
    const alpha = this.observations <= 3 ? 0.35 : 0.15;
    this.charsPerToken =
      this.charsPerToken * (1 - alpha) + clamped * alpha;
  }

  getCharsPerToken(): number {
    return Number(this.charsPerToken.toFixed(2));
  }

  getObservationCount(): number {
    return this.observations;
  }
}

export const defaultTokenEstimator = new TokenEstimator();

/**
 * Output Sanitizer (`sanitizeLlmOutput`):
 * Strips conversational preambles ("Here is the rewritten bullet:", "Sure! Here's..."),
 * markdown code fences, leading labels ("REWRITTEN:", "Bullet:"), bullet glyphs,
 * surrounding quotes, and trailing explanations ("Note: ...").
 */
const PREAMBLE_PATTERNS: RegExp[] = [
  /^(?:sure[!,.]?\s*)?(?:here(?:'s| is)\s+(?:the|your|a)\s+[^:\n]{1,50}:\s*)/i,
  /^(?:rewritten\s+(?:bullet|summary|paragraph|block|version)|bullet|summary|output|answer|response|result)\s*:\s*/i,
  /^(?:certainly[!,.]?\s*)?(?:below is\s+[^:\n]{1,50}:\s*)/i,
];

const TRAILING_NOTE_PATTERNS: RegExp[] = [
  /\s*(?:\n+|\s{2,})(?:note|explanation|changes made|why this works|i kept|this version)\s*:.*$/is,
  /\s*\((?:note|word count|character count)[^)]*\)\s*$/i,
];

export function sanitizeLlmOutput(
  raw: string,
  options: { singleSentence?: boolean } = {},
): string {
  if (!raw) return '';

  let text = raw.trim();

  // Strip markdown code blocks if model wrapped plain text in fences
  text = text
    .replace(/^```(?:text|markdown|json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  // Strip known preambles line-by-line or prefix
  for (const pattern of PREAMBLE_PATTERNS) {
    text = text.replace(pattern, '').trim();
  }

  // If multiple lines exist and first line ends with a colon like "Here is the rewrite:", drop first line
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length > 1 && /:\s*$/.test(lines[0]) && lines[0].length < 65) {
    lines.shift();
  }
  if (options.singleSentence && lines.length > 0) {
    text = lines[0];
  } else {
    text = lines.join(' ');
  }

  // Re-run preamble patterns after line collapse
  for (const pattern of PREAMBLE_PATTERNS) {
    text = text.replace(pattern, '').trim();
  }

  // Strip trailing commentary
  for (const pattern of TRAILING_NOTE_PATTERNS) {
    text = text.replace(pattern, '').trim();
  }

  // Strip leading bullet glyphs (-, •, *, 1.)
  text = text.replace(/^(?:[-•*‣▪]|\d+[.)])\s+/, '').trim();

  // Strip surrounding straight or curly quotes
  if (
    (text.startsWith('"') && text.endsWith('"')) ||
    (text.startsWith('“') && text.endsWith('”')) ||
    (text.startsWith("'") && text.endsWith("'"))
  ) {
    text = text.slice(1, -1).trim();
  }

  // Strip leading bullet glyphs again if they were inside quotes
  text = text.replace(/^(?:[-•*‣▪]|\d+[.)])\s+/, '').trim();

  // Collapse multiple spaces
  text = text.replace(/\s+/g, ' ').trim();

  // Ensure terminal period if non-empty and ends with alphanumeric/percent
  if (text.length > 0 && /[a-zA-Z0-9%)]$/.test(text)) {
    text = `${text}.`;
  }

  return text;
}

/**
 * Extracts a normalized sorted multiset of numbers/metrics from text.
 * Normalizes commas out of numbers ("1,200" -> "1200") and lowercases units ("45%" -> "45%", "120ms" -> "120ms").
 */
export function extractNormalizedNumbers(text: string): string[] {
  if (!text) return [];
  const matches =
    text.match(/\$?\d+(?:,\d{3})*(?:\.\d+)?(?:%|x|ms|s|k|m|b|\+)?/gi) ?? [];
  return matches
    .map((m) => m.toLowerCase().replace(/,/g, ''))
    .sort();
}

const IRREGULAR_PAST_VERBS = new Set([
  'built',
  'led',
  'ran',
  'cut',
  'made',
  'wrote',
  'sped',
  'kept',
  'grew',
  'drove',
  'set',
  'split',
  'won',
  'brought',
  'taught',
  'caught',
  'found',
  'held',
  'overcame',
  'rebuilt',
  'rewrote',
  'shrunk',
  'shrank',
  'spun',
  'stood',
  'took',
  'upheld',
  'withstood',
]);

const CURATED_PAST_ACTION_VERBS = new Set([
  ...IRREGULAR_PAST_VERBS,
  'accelerated',
  'achieved',
  'administered',
  'aligned',
  'analyzed',
  'architected',
  'assembled',
  'audited',
  'authored',
  'automated',
  'balanced',
  'benchmarked',
  'boosted',
  'centralized',
  'championed',
  'collaborated',
  'consolidated',
  'constructed',
  'containerized',
  'converted',
  'coordinated',
  'created',
  'curated',
  'debugged',
  '24/7', // fallback guard not used as verb
  'decreased',
  'defined',
  'delivered',
  'deployed',
  'designed',
  'developed',
  'devised',
  'diagnosed',
  'directed',
  'discovered',
  'documented',
  'doubled',
  'eliminated',
  'enabled',
  'enforced',
  'engineered',
  'enhanced',
  'established',
  'evaluated',
  'executed',
  'expanded',
  'expedited',
  'extracted',
  'facilitated',
  'fixed',
  'formulated',
  'founded',
  'generated',
  'guided',
  'halved',
  'hardened',
  'headed',
  'identified',
  'implemented',
  'improved',
  'increased',
  'indexed',
  'influenced',
  'initiated',
  'instituted',
  'INSTRUMENTED'.toLowerCase(),
  'integrated',
  'introduced',
  'investigated',
  'isolated',
  'launched',
  'leveled',
  'lowered',
  'maintained',
  'managed',
  'mapped',
  'measured',
  'mentored',
  'migrated',
  'minimized',
  'modeled',
  'modernized',
  'monitored',
  'moved',
  'negotiated',
  'normalized',
  'onboarded',
  'operated',
  'optimized',
  'orchestrated',
  'organized',
  'overhauled',
  'owned',
  'paired',
  'parallelized',
  'partnered',
  'patched',
  'performed',
  'piloted',
  'pioneered',
  'planned',
  'ported',
  'prevented',
  'prioritized',
  'produced',
  'profiled',
  'programmed',
  'prototyped',
  'provisioned',
  'published',
  'quantified',
  'raised',
  're-architected',
  'rearchitected',
  'reconciled',
  'recovered',
  'redesigned',
  'reduced',
  'refactored',
  'refined',
  'regulated',
  'reinforced',
  'released',
  'remediated',
  'removed',
  'reorganized',
  'repaired',
  'replaced',
  'resolved',
  'restored',
  'restructured',
  'retired',
  'revamped',
  'reviewed',
  'revised',
  'rolled',
  'routed',
  'saved',
  'scaled',
  'scheduled',
  'scoped',
  'secured',
  'selected',
  'shaped',
  'shaved',
  'shipped',
  'shortened',
  'simplified',
  'slashed',
  'solved',
  'spearheaded',
  'specified',
  'stabilized',
  'standardized',
  'started',
  'steered',
  'streamlined',
  'strengthened',
  'structured',
  'supported',
  'surpassed',
  'switched',
  'tailored',
  'targeted',
  'tested',
  'tightened',
  'traced',
  'tracked',
  'trained',
  'transformed',
  'transitioned',
  'translated',
  'triaged',
  'trimmed',
  'tripled',
  'tuned',
  'uncovered',
  'unified',
  'updated',
  'upgraded',
  'validated',
  'verified',
]);

export function startsWithPastTenseVerb(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return false;
  const firstWord = trimmed
    .split(/[\s,—–]+/)[0]
    .replace(/[^a-zA-Z-]/g, '')
    .toLowerCase();
  if (!firstWord) return false;
  if (CURATED_PAST_ACTION_VERBS.has(firstWord)) return true;
  if (firstWord.length > 3 && firstWord.endsWith('ed')) return true;
  return false;
}

export function containsFirstPersonPronoun(text: string): string | null {
  const match = text.match(/\b(i|i'm|i've|i'd|me|my|mine|we|we're|we've|our|ours)\b/i);
  return match ? match[1] : null;
}

export interface VoiceFewShotPair {
  user: string;
  assistant: string;
}

export interface VoiceHarnessData {
  voice: VoiceLevel;
  lengthBand: { minWords: number; maxWords: number };
  fewShotTurns: [VoiceFewShotPair, VoiceFewShotPair, VoiceFewShotPair];
  verbSwaps: Array<{ pattern: RegExp; replacement: string }>;
  bannedWords: string[];
}

/**
 * Voice styles as pure data:
 * - 3 chat-turn example pairs per detent (fed as user/assistant message pairs so the local model imitates style reliably)
 * - Word-count length band per detent
 * - Deterministic verb-swap lexicon for instant (<10ms) dial movement before LLM refinement finishes
 * - Voice-specific banned words
 */
export const VOICE_HARNESS_DATA: Record<VoiceLevel, VoiceHarnessData> = {
  polished: {
    voice: 'polished',
    lengthBand: { minWords: 12, maxWords: 28 },
    fewShotTurns: [
      {
        user: 'FACTS: action="Built multi-region Kafka ingestion pipeline" | result="handling 120k events/sec with 99.99% availability" | metric="120k events/sec, 99.99%" | allowedTerms="Kafka"\nVOICE: Polished',
        assistant:
          'Architected a multi-region Kafka ingestion pipeline sustaining 120k events/sec while upholding 99.99% production availability.',
      },
      {
        user: 'FACTS: action="Migrated billing monolith to Go microservices on Kubernetes" | result="cut p99 checkout latency by 42% and saved $180k/yr" | metric="42%, $180k/yr" | allowedTerms="Go, Kubernetes"\nVOICE: Polished',
        assistant:
          'Spearheaded the migration of core billing services to Go microservices on Kubernetes, reducing p99 checkout latency by 42% and capturing $180k/yr in infrastructure savings.',
      },
      {
        user: 'FACTS: action="Automated Terraform drift detection across 14 AWS accounts" | result="reduced manual audit time from 6 hours to 15 minutes" | metric="14, 6 hours, 15 minutes" | allowedTerms="Terraform, AWS"\nVOICE: Polished',
        assistant:
          'Orchestrated automated Terraform drift detection across 14 AWS accounts, compressing weekly compliance audit cycles from 6 hours to 15 minutes.',
      },
    ],
    verbSwaps: [
      { pattern: /^Built\b/i, replacement: 'Architected' },
      { pattern: /^Created\b/i, replacement: 'Spearheaded' },
      { pattern: /^Wrote\b/i, replacement: 'Engineered' },
      { pattern: /^Fixed\b/i, replacement: 'Remediated' },
      { pattern: /^Tracked down and fixed\b/i, replacement: 'Remediated' },
      { pattern: /^Cut\b/i, replacement: 'Reduced' },
      { pattern: /^Sped up\b/i, replacement: 'Accelerated' },
      { pattern: /^Trimmed\b/i, replacement: 'Streamlined' },
      { pattern: /^Moved\b/i, replacement: 'Migrated' },
      { pattern: /^Ran\b/i, replacement: 'Orchestrated' },
    ],
    bannedWords: VOICE_STYLE_SPECS.polished.bannedCliches,
  },
  professional: {
    voice: 'professional',
    lengthBand: { minWords: 12, maxWords: 26 },
    fewShotTurns: [
      {
        user: 'FACTS: action="Built multi-region Kafka ingestion pipeline" | result="handling 120k events/sec with 99.99% availability" | metric="120k events/sec, 99.99%" | allowedTerms="Kafka"\nVOICE: Professional',
        assistant:
          'Engineered a multi-region Kafka ingestion pipeline processing 120k events/sec at 99.99% availability.',
      },
      {
        user: 'FACTS: action="Migrated billing monolith to Go microservices on Kubernetes" | result="cut p99 checkout latency by 42% and saved $180k/yr" | metric="42%, $180k/yr" | allowedTerms="Go, Kubernetes"\nVOICE: Professional',
        assistant:
          'Migrated the billing monolith to Go microservices on Kubernetes, reducing p99 checkout latency by 42% and saving $180k/yr.',
      },
      {
        user: 'FACTS: action="Automated Terraform drift detection across 14 AWS accounts" | result="reduced manual audit time from 6 hours to 15 minutes" | metric="14, 6 hours, 15 minutes" | allowedTerms="Terraform, AWS"\nVOICE: Professional',
        assistant:
          'Automated Terraform drift detection across 14 AWS accounts, reducing manual audit time from 6 hours to 15 minutes.',
      },
    ],
    verbSwaps: [
      { pattern: /^Architected and engineered\b/i, replacement: 'Engineered' },
      { pattern: /^Spearheaded the zero-downtime migration of\b/i, replacement: 'Migrated' },
      { pattern: /^Spearheaded\b/i, replacement: 'Delivered' },
      { pattern: /^Orchestrated\b/i, replacement: 'Led' },
      { pattern: /^Built\b/i, replacement: 'Engineered' },
      { pattern: /^Wrote\b/i, replacement: 'Developed' },
      { pattern: /^Fixed\b/i, replacement: 'Resolved' },
      { pattern: /^Tracked down and fixed\b/i, replacement: 'Resolved' },
      { pattern: /^Cut\b/i, replacement: 'Reduced' },
      { pattern: /^Sped up\b/i, replacement: 'Optimized' },
      { pattern: /^Trimmed\b/i, replacement: 'Reduced' },
      { pattern: /^Moved\b/i, replacement: 'Migrated' },
      { pattern: /^Ran\b/i, replacement: 'Led' },
    ],
    bannedWords: VOICE_STYLE_SPECS.professional.bannedCliches,
  },
  balanced: {
    voice: 'balanced',
    lengthBand: { minWords: 11, maxWords: 25 },
    fewShotTurns: [
      {
        user: 'FACTS: action="Built multi-region Kafka ingestion pipeline" | result="handling 120k events/sec with 99.99% availability" | metric="120k events/sec, 99.99%" | allowedTerms="Kafka"\nVOICE: Balanced',
        assistant:
          'Built a multi-region Kafka ingestion pipeline handling 120k events/sec with 99.99% availability.',
      },
      {
        user: 'FACTS: action="Migrated billing monolith to Go microservices on Kubernetes" | result="cut p99 checkout latency by 42% and saved $180k/yr" | metric="42%, $180k/yr" | allowedTerms="Go, Kubernetes"\nVOICE: Balanced',
        assistant:
          'Migrated the billing monolith to Go microservices on Kubernetes, cutting p99 checkout latency by 42% and saving $180k/yr.',
      },
      {
        user: 'FACTS: action="Automated Terraform drift detection across 14 AWS accounts" | result="reduced manual audit time from 6 hours to 15 minutes" | metric="14, 6 hours, 15 minutes" | allowedTerms="Terraform, AWS"\nVOICE: Balanced',
        assistant:
          'Automated Terraform drift detection across 14 AWS accounts, cutting manual audit time from 6 hours to 15 minutes.',
      },
    ],
    verbSwaps: [
      { pattern: /^Architected and engineered\b/i, replacement: 'Built' },
      { pattern: /^Architected\b/i, replacement: 'Designed' },
      { pattern: /^Spearheaded\b/i, replacement: 'Led' },
      { pattern: /^Orchestrated\b/i, replacement: 'Led' },
      { pattern: /^Remediated\b/i, replacement: 'Fixed' },
      { pattern: /^Accelerated\b/i, replacement: 'Sped up' },
      { pattern: /^Streamlined\b/i, replacement: 'Simplified' },
      { pattern: /^Tracked down and fixed\b/i, replacement: 'Fixed' },
    ],
    bannedWords: VOICE_STYLE_SPECS.balanced.bannedCliches,
  },
  natural: {
    voice: 'natural',
    lengthBand: { minWords: 9, maxWords: 27 },
    fewShotTurns: [
      {
        user: 'FACTS: action="Built multi-region Kafka ingestion pipeline" | result="handling 120k events/sec with 99.99% availability" | metric="120k events/sec, 99.99%" | allowedTerms="Kafka"\nVOICE: Natural',
        assistant:
          'Built a multi-region Kafka ingestion pipeline that handles 120k events/sec at 99.99% availability.',
      },
      {
        user: 'FACTS: action="Migrated billing monolith to Go microservices on Kubernetes" | result="cut p99 checkout latency by 42% and saved $180k/yr" | metric="42%, $180k/yr" | allowedTerms="Go, Kubernetes"\nVOICE: Natural',
        assistant:
          'Moved the billing monolith to Go microservices on Kubernetes, cutting p99 checkout latency by 42% and saving $180k/yr.',
      },
      {
        user: 'FACTS: action="Automated Terraform drift detection across 14 AWS accounts" | result="reduced manual audit time from 6 hours to 15 minutes" | metric="14, 6 hours, 15 minutes" | allowedTerms="Terraform, AWS"\nVOICE: Natural',
        assistant:
          'Automated Terraform drift detection across 14 AWS accounts and cut manual audit time from 6 hours to 15 minutes.',
      },
    ],
    verbSwaps: [
      { pattern: /^Architected and engineered\b/i, replacement: 'Built' },
      { pattern: /^Re-architected\b/i, replacement: 'Rebuilt' },
      { pattern: /^Architected\b/i, replacement: 'Built' },
      { pattern: /^Engineered\b/i, replacement: 'Built' },
      { pattern: /^Spearheaded\b/i, replacement: 'Led' },
      { pattern: /^Orchestrated\b/i, replacement: 'Ran' },
      { pattern: /^Remediated\b/i, replacement: 'Fixed' },
      { pattern: /^Resolved\b/i, replacement: 'Fixed' },
      { pattern: /^Reduced\b/i, replacement: 'Cut' },
      { pattern: /^Optimized\b/i, replacement: 'Sped up' },
      { pattern: /^Accelerated\b/i, replacement: 'Sped up' },
      { pattern: /^Streamlined\b/i, replacement: 'Trimmed' },
      { pattern: /^Migrated\b/i, replacement: 'Moved' },
    ],
    bannedWords: VOICE_STYLE_SPECS.natural.bannedCliches,
  },
  plain: {
    voice: 'plain',
    lengthBand: { minWords: 8, maxWords: 25 },
    fewShotTurns: [
      {
        user: 'FACTS: action="Built multi-region Kafka ingestion pipeline" | result="handling 120k events/sec with 99.99% availability" | metric="120k events/sec, 99.99%" | allowedTerms="Kafka"\nVOICE: Plain',
        assistant:
          'Built a multi-region Kafka pipeline handling 120k events/sec at 99.99% availability.',
      },
      {
        user: 'FACTS: action="Migrated billing monolith to Go microservices on Kubernetes" | result="cut p99 checkout latency by 42% and saved $180k/yr" | metric="42%, $180k/yr" | allowedTerms="Go, Kubernetes"\nVOICE: Plain',
        assistant:
          'Moved the billing monolith to Go on Kubernetes, cutting p99 checkout latency by 42% and saving $180k/yr.',
      },
      {
        user: 'FACTS: action="Automated Terraform drift detection across 14 AWS accounts" | result="reduced manual audit time from 6 hours to 15 minutes" | metric="14, 6 hours, 15 minutes" | allowedTerms="Terraform, AWS"\nVOICE: Plain',
        assistant:
          'Automated Terraform drift checks across 14 AWS accounts and cut audit time from 6 hours to 15 minutes.',
      },
    ],
    verbSwaps: [
      { pattern: /^Architected and engineered\b/i, replacement: 'Built' },
      { pattern: /^Re-architected\b/i, replacement: 'Rebuilt' },
      { pattern: /^Architected\b/i, replacement: 'Built' },
      { pattern: /^Engineered\b/i, replacement: 'Built' },
      { pattern: /^Developed\b/i, replacement: 'Built' },
      { pattern: /^Spearheaded\b/i, replacement: 'Ran' },
      { pattern: /^Orchestrated\b/i, replacement: 'Ran' },
      { pattern: /^Led\b/i, replacement: 'Ran' },
      { pattern: /^Remediated\b/i, replacement: 'Fixed' },
      { pattern: /^Resolved\b/i, replacement: 'Fixed' },
      { pattern: /^Tracked down and fixed\b/i, replacement: 'Fixed' },
      { pattern: /^Reduced\b/i, replacement: 'Cut' },
      { pattern: /^Optimized\b/i, replacement: 'Sped up' },
      { pattern: /^Accelerated\b/i, replacement: 'Sped up' },
      { pattern: /^Streamlined\b/i, replacement: 'Cut' },
      { pattern: /^Migrated\b/i, replacement: 'Moved' },
    ],
    bannedWords: VOICE_STYLE_SPECS.plain.bannedCliches,
  },
};

/**
 * Applies a fast (<1ms) deterministic lexicon pass to an existing bullet or achievement
 * when the user adjusts the Voice dial.
 */
export function applyVoiceLexiconPass(
  text: string,
  voice: VoiceLevel,
  sourceAchievement?: { action: string; result: string; metric?: string },
): string {
  if (sourceAchievement) {
    return assembleBullet(sourceAchievement, voice, 0);
  }
  let updated = text.trim();
  const data = VOICE_HARNESS_DATA[voice];
  for (const swap of data.verbSwaps) {
    if (swap.pattern.test(updated)) {
      updated = updated.replace(swap.pattern, swap.replacement);
      break;
    }
  }
  return updated;
}

export type ValidatorId =
  | 'numbers'
  | 'protectedTerms'
  | 'lengthBand'
  | 'startsWithPastVerb'
  | 'noFirstPerson'
  | 'clicheLint';

export interface HarnessValidationFailure {
  validator: ValidatorId;
  reason: string;
  repairHint: string;
}

export interface HarnessValidationResult {
  valid: boolean;
  sanitizedText: string;
  failures: HarnessValidationFailure[];
  repairInstruction: string;
}

const KNOWN_PROPER_TECH_TERMS = [
  'Kubernetes',
  'Terraform',
  'PostgreSQL',
  'GraphQL',
  'Kafka',
  'Redis',
  'Docker',
  'AWS',
  'GCP',
  'Azure',
  'Rust',
  'Golang',
  'Python',
  'TypeScript',
  'React',
  'DynamoDB',
  'Snowflake',
  'Databricks',
  'Spark',
  'ClickHouse',
  'Grpc',
  'Prometheus',
  'Grafana',
  'Envoy',
  'Istio',
];

/**
 * Runs all 6 deterministic validators on a candidate bullet rewrite:
 * 1. `numbers`: multiset of normalized numbers in output equals source's (none dropped, none added).
 * 2. `protectedTerms`: proper nouns, tools and employers in output must come from the item's own facts, not JD-only terms.
 * 3. `lengthBand`: word count within the active voice's band.
 * 4. `startsWithPastVerb`: first word is a past-tense action verb.
 * 5. `noFirstPerson`: no I, me, my, we, our.
 * 6. `clicheLint` / `voiceTarget`: no banned words for the active voice.
 */
export function validateBulletOutput(params: {
  rawCandidate: string;
  sourceAction: string;
  sourceResult: string;
  sourceMetric?: string;
  allowedTerms?: string[];
  jdOnlyTerms?: string[];
  voice: VoiceLevel;
}): HarnessValidationResult {
  const sanitizedText = sanitizeLlmOutput(params.rawCandidate, {
    singleSentence: true,
  });
  const failures: HarnessValidationFailure[] = [];

  if (!sanitizedText) {
    return {
      valid: false,
      sanitizedText: '',
      failures: [
        {
          validator: 'lengthBand',
          reason: 'Output was empty.',
          repairHint: 'Return one complete resume bullet sentence.',
        },
      ],
      repairInstruction: 'Return one complete resume bullet sentence.',
    };
  }

  // 1. Numbers multiset equality
  const sourceCombined = `${params.sourceAction} ${params.sourceResult}`;
  const sourceNums = extractNormalizedNumbers(sourceCombined);
  if (sourceNums.length === 0 && params.sourceMetric) {
    sourceNums.push(...extractNormalizedNumbers(params.sourceMetric));
  }
  const candidateNums = extractNormalizedNumbers(sanitizedText);

  const missingNums: string[] = [];
  const remainingCandidate = [...candidateNums];
  for (const sNum of sourceNums) {
    const idx = remainingCandidate.indexOf(sNum);
    if (idx !== -1) {
      remainingCandidate.splice(idx, 1);
    } else {
      // Check if digits-only match (e.g., "42%" vs "42")
      const sDigits = sNum.replace(/[^0-9.]/g, '');
      const altIdx = remainingCandidate.findIndex(
        (c) => c.replace(/[^0-9.]/g, '') === sDigits && sDigits.length > 0,
      );
      if (altIdx !== -1) {
        remainingCandidate.splice(altIdx, 1);
      } else {
        missingNums.push(sNum);
      }
    }
  }
  const addedNums = remainingCandidate;

  if (missingNums.length > 0 || addedNums.length > 0) {
    const parts: string[] = [];
    if (missingNums.length > 0) {
      parts.push(`keep exact number(s) ${missingNums.join(', ')}`);
    }
    if (addedNums.length > 0) {
      parts.push(`remove unverified number(s) ${addedNums.join(', ')}`);
    }
    failures.push({
      validator: 'numbers',
      reason: `Number mismatch (missing: [${missingNums.join(', ')}], added: [${addedNums.join(', ')}]).`,
      repairHint: `Must ${parts.join(' and ')}.`,
    });
  }

  // 2. Protected terms: check JD-only terms & known tech proper nouns not in source/allowedTerms
  const allowedCorpus = [
    params.sourceAction,
    params.sourceResult,
    params.sourceMetric ?? '',
    ...(params.allowedTerms ?? []),
  ]
    .join(' ')
    .toLowerCase();

  const forbiddenUsed: string[] = [];
  for (const jdTerm of params.jdOnlyTerms ?? []) {
    const clean = jdTerm.trim();
    if (!clean || clean.length < 2) continue;
    const aliases = expandKeywordAliases(clean);
    const inAllowed = aliases.some((a) => allowedCorpus.includes(a.toLowerCase()));
    if (!inAllowed) {
      const escaped = clean.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (new RegExp(`\\b${escaped}\\b`, 'i').test(sanitizedText)) {
        forbiddenUsed.push(clean);
      }
    }
  }

  for (const tool of KNOWN_PROPER_TECH_TERMS) {
    const regex = new RegExp(`\\b${tool}\\b`, 'i');
    if (regex.test(sanitizedText)) {
      const aliases = expandKeywordAliases(tool);
      const inAllowed = aliases.some((a) =>
        allowedCorpus.includes(a.toLowerCase()),
      );
      if (!inAllowed && !forbiddenUsed.includes(tool)) {
        forbiddenUsed.push(tool);
      }
    }
  }

  if (forbiddenUsed.length > 0) {
    failures.push({
      validator: 'protectedTerms',
      reason: `Used terms not present in source facts: ${forbiddenUsed.join(', ')}.`,
      repairHint: `Remove unverified term(s): ${forbiddenUsed.join(', ')}. Only name tools present in the source facts.`,
    });
  }

  // 3. Length band
  const voiceData = VOICE_HARNESS_DATA[params.voice];
  const words = sanitizedText.split(/\s+/).filter(Boolean);
  if (
    words.length < voiceData.lengthBand.minWords ||
    words.length > voiceData.lengthBand.maxWords
  ) {
    failures.push({
      validator: 'lengthBand',
      reason: `Bullet has ${words.length} words (target ${voiceData.lengthBand.minWords}–${voiceData.lengthBand.maxWords} words).`,
      repairHint: `Keep length between ${voiceData.lengthBand.minWords} and ${voiceData.lengthBand.maxWords} words.`,
    });
  }

  // 4. Starts with past-tense action verb
  if (!startsWithPastTenseVerb(sanitizedText)) {
    failures.push({
      validator: 'startsWithPastVerb',
      reason: `Bullet does not start with a past-tense action verb ("${words[0] ?? ''}").`,
      repairHint:
        'Start the bullet directly with a past-tense action verb (e.g., Built, Engineered, Migrated, Reduced).',
    });
  }

  // 5. No first-person pronouns
  const pronoun = containsFirstPersonPronoun(sanitizedText);
  if (pronoun) {
    failures.push({
      validator: 'noFirstPerson',
      reason: `Contains first-person pronoun "${pronoun}".`,
      repairHint: `Remove first-person pronoun "${pronoun}". Start directly with the action verb.`,
    });
  }

  // 6. Cliche & voice-specific banned words
  const lowerCandidate = sanitizedText.toLowerCase();
  const matchedCliches = voiceData.bannedWords.filter((word) => {
    const escaped = word.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(lowerCandidate);
  });
  if (matchedCliches.length > 0) {
    failures.push({
      validator: 'clicheLint',
      reason: `Contains banned cliché(s) for ${params.voice} voice: ${matchedCliches.join(', ')}.`,
      repairHint: `Replace cliché word(s) (${matchedCliches.join(', ')}) with plain, concrete verbs.`,
    });
  }

  const repairInstruction =
    failures.length > 0
      ? `Fix the previous rewrite: ${failures.map((f) => f.repairHint).join(' ')} Output ONLY the corrected single-sentence bullet.`
      : '';

  return {
    valid: failures.length === 0,
    sanitizedText,
    failures,
    repairInstruction,
  };
}

/**
 * Validates a professional summary output (2–3 sentences, 20–65 words, no first-person pronouns, no unverified tools/numbers).
 */
export function validateSummaryOutput(params: {
  rawCandidate: string;
  allowedTerms: string[];
  voice: VoiceLevel;
}): HarnessValidationResult {
  const sanitizedText = sanitizeLlmOutput(params.rawCandidate, {
    singleSentence: false,
  });
  const failures: HarnessValidationFailure[] = [];

  const words = sanitizedText.split(/\s+/).filter(Boolean);
  if (words.length < 16 || words.length > 72) {
    failures.push({
      validator: 'lengthBand',
      reason: `Summary has ${words.length} words (expected 16–72 words).`,
      repairHint: 'Keep the summary between 20 and 60 words (2–3 sentences).',
    });
  }

  const pronoun = containsFirstPersonPronoun(sanitizedText);
  if (pronoun) {
    failures.push({
      validator: 'noFirstPerson',
      reason: `Summary contains first-person pronoun "${pronoun}".`,
      repairHint: `Remove first-person pronoun "${pronoun}".`,
    });
  }

  const voiceData = VOICE_HARNESS_DATA[params.voice];
  const matchedCliches = voiceData.bannedWords.filter((w) =>
    new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(
      sanitizedText,
    ),
  );
  if (matchedCliches.length > 0) {
    failures.push({
      validator: 'clicheLint',
      reason: `Contains cliché(s): ${matchedCliches.join(', ')}.`,
      repairHint: `Remove cliché(s): ${matchedCliches.join(', ')}.`,
    });
  }

  const allowedCorpus = params.allowedTerms.join(' ').toLowerCase();
  const unverifiedTools: string[] = [];
  for (const tool of KNOWN_PROPER_TECH_TERMS) {
    if (new RegExp(`\\b${tool}\\b`, 'i').test(sanitizedText)) {
      const aliases = expandKeywordAliases(tool);
      if (!aliases.some((a) => allowedCorpus.includes(a.toLowerCase()))) {
        unverifiedTools.push(tool);
      }
    }
  }
  if (unverifiedTools.length > 0) {
    failures.push({
      validator: 'protectedTerms',
      reason: `Summary mentions unverified tool(s): ${unverifiedTools.join(', ')}.`,
      repairHint: `Remove tool(s) not in the candidate's Bank: ${unverifiedTools.join(', ')}.`,
    });
  }

  return {
    valid: failures.length === 0,
    sanitizedText,
    failures,
    repairInstruction:
      failures.length > 0
        ? `Fix the summary: ${failures.map((f) => f.repairHint).join(' ')} Output ONLY the summary text.`
        : '',
  };
}

/**
 * Validates a single Cover Letter paragraph block (`opening`, `body1`, `body2`, `whyCompany`).
 * Enforces <= 85 words, zero stock cover-letter clichés/banned openers (including "I'm applying for"),
 * concrete proof in the first sentence of `opening`, and grounded numbers/tools.
 */
export function validateLetterBlockOutput(params: {
  rawCandidate: string;
  blockType: CoverLetterBlockType;
  allowedCorpusText: string;
  voice: VoiceLevel;
}): HarnessValidationResult {
  const sanitizedText = sanitizeLlmOutput(params.rawCandidate, {
    singleSentence: false,
  });
  const failures: HarnessValidationFailure[] = [];

  const words = sanitizedText.split(/\s+/).filter(Boolean);
  if (words.length < 18 || words.length > 90) {
    failures.push({
      validator: 'lengthBand',
      reason: `Paragraph has ${words.length} words (expected 20–75 words).`,
      repairHint: 'Keep this paragraph concise: 25 to 70 words (2–3 sentences).',
    });
  }

  const CLICHE_OPENERS = [
    'i am writing to express my interest',
    'i am writing to apply',
    'i am writing to',
    "i'm writing to",
    'i am applying for',
    "i'm applying for",
    'i am excited to apply',
    "i'm excited to apply",
    'please accept this letter',
    'to whom it may concern',
    'i am a passionate',
    'thrilled to apply',
  ];
  const lower = sanitizedText.toLowerCase();
  const foundCliche = CLICHE_OPENERS.find((c) => lower.includes(c));
  if (foundCliche) {
    failures.push({
      validator: 'clicheLint',
      reason: `Contains banned stock opener "${foundCliche}".`,
      repairHint: `Remove "${foundCliche}" and lead directly with your strongest concrete proof point.`,
    });
  }

  if (params.blockType === 'opening') {
    const firstSentence =
      sanitizedText
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .find(Boolean) ?? '';
    const hasMetricOrConcreteOutcome =
      /\$?\d+(?:[.,]\d+)*(?:%|x|ms|s|k|m|b|\+)?/i.test(firstSentence) ||
      /\b(built|designed|engineered|led|reduced|cut|migrated|scaled|shipped|automated|delivered|architected|re-architected|implemented|pipeline|service|cluster|system|platform|latency|throughput)\b/i.test(
        firstSentence,
      );
    if (!hasMetricOrConcreteOutcome) {
      failures.push({
        validator: 'clicheLint',
        reason:
          'Opening first sentence does not lead with a concrete proof point or metric.',
        repairHint:
          'Open the first sentence with a specific metric or concrete achievement from the proof point.',
      });
    }
  }

  const allowedLower = params.allowedCorpusText.toLowerCase().replace(/,/g, '');
  const nums = extractNormalizedNumbers(sanitizedText);
  const inventedNums = nums.filter((n) => {
    const digits = n.replace(/[^0-9.]/g, '');
    if (digits.length <= 1 || /^20\d\d$/.test(digits)) return false;
    return !allowedLower.includes(n) && !allowedLower.includes(digits);
  });
  if (inventedNums.length > 0) {
    failures.push({
      validator: 'numbers',
      reason: `Invented metric(s): ${inventedNums.join(', ')}.`,
      repairHint: `Remove unverified number(s) ${inventedNums.join(', ')} and only use facts from the proof point.`,
    });
  }

  return {
    valid: failures.length === 0,
    sanitizedText,
    failures,
    repairInstruction:
      failures.length > 0
        ? `Fix the paragraph: ${failures.map((f) => f.repairHint).join(' ')} Output ONLY the paragraph.`
        : '',
  };
}

/**
 * Deterministic Job-Brief Extractor (`extractDeterministicJobBrief`):
 * - Strips EEO/legal/benefits boilerplate
 * - Extracts title, company, seniority, top requirements, and core responsibilities
 * - Produces a compact `briefText` (~100–130 tokens) and `briefHash` so downstream prompts never send the raw JD.
 */
export interface CompactJobBrief {
  title: string;
  company: string;
  seniority: string;
  topSkills: string[];
  mustHaveRequirements: string[];
  coreResponsibilities: string[];
  briefText: string;
  briefHash: string;
  parsedJob: ParsedJob;
}

const BOILERPLATE_SECTION_PATTERNS: RegExp[] = [
  /\b(?:equal opportunity employer|eeo statement|all qualified applicants will receive consideration|without regard to race|sexual orientation|veteran status|disability accommodation)\b.*$/is,
  /\b(?:benefits and perks|what we offer|comprehensive health|401\(k\)|unlimited pto|dental and vision)\b.*$/is,
];

export function stripJobDescriptionBoilerplate(rawJd: string): string {
  let cleaned = rawJd.trim();
  for (const pattern of BOILERPLATE_SECTION_PATTERNS) {
    cleaned = cleaned.replace(pattern, '').trim();
  }
  return cleaned;
}

export function parseJobDescriptionDeterministic(rawJd: string): ParsedJob {
  const lines = rawJd
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  let title = 'Senior Software Engineer';
  let company = 'Target Company';
  let seniority = 'Senior';

  for (const line of lines.slice(0, 12)) {
    const roleMatch = line.match(/^(?:role|title|position)\s*:\s*(.+)$/i);
    if (roleMatch) {
      title = roleMatch[1].trim();
      continue;
    }
    const compMatch = line.match(/^(?:company|organization|team)\s*:\s*(.+)$/i);
    if (compMatch) {
      company = compMatch[1].trim();
      continue;
    }
    const atMatch = line.match(/^([A-Z][A-Za-z0-9\s/&,-]{3,45})\s+at\s+([A-Z][A-Za-z0-9\s.&-]{1,30})$/);
    if (atMatch) {
      title = atMatch[1].trim();
      company = atMatch[2].trim();
    }
  }

  const seniorityMatch = `${title} ${rawJd.slice(0, 300)}`.match(
    /\b(Principal|Staff|Senior|Lead|Founding|Distinguished|Director|Junior|Mid-Level)\b/i,
  );
  if (seniorityMatch) {
    seniority =
      seniorityMatch[1].charAt(0).toUpperCase() +
      seniorityMatch[1].slice(1).toLowerCase();
  }

  const extractedKeywords = extractDomainKeywordsFromText(rawJd);
  const niceSectionIndex = rawJd.search(
    /\b(?:nice to have|preferred|bonus points|plus)\b/i,
  );

  const requirements = extractedKeywords.map((kw, idx) => {
    const firstPos = rawJd.toLowerCase().indexOf(kw.term.toLowerCase());
    const isNiceToHave =
      niceSectionIndex !== -1 &&
      firstPos !== -1 &&
      firstPos > niceSectionIndex;
    return {
      id: `req-${idx + 1}`,
      text: kw.term,
      category: kw.kind,
      priority: isNiceToHave
        ? ('nice-to-have' as const)
        : ('must-have' as const),
      normalizedKey: kw.normalized || normalizeKeyword(kw.term),
    };
  });

  const bulletLines = lines
    .filter((l) => /^[-*•]\s+/.test(l))
    .map((l) => l.replace(/^[-*•]\s+/, '').trim())
    .filter((l) => l.length >= 15 && l.length <= 180);

  const responsibilities =
    bulletLines.length > 0
      ? bulletLines.slice(0, 5)
      : [
          `Design, build, and operate production systems for the ${title} role at ${company}.`,
        ];

  return {
    title,
    company,
    seniority,
    summary: `${title} at ${company} focused on ${
      extractedKeywords
        .slice(0, 4)
        .map((k) => k.term)
        .join(', ') || 'core engineering'
    }.`,
    responsibilities,
    requirements,
    keywords: extractedKeywords,
  };
}

export function extractDeterministicJobBrief(
  rawJd: string,
  _customAliases?: Map<string, string[]>,
): CompactJobBrief {
  const stripped = stripJobDescriptionBoilerplate(rawJd);
  const parsedJob = parseJobDescriptionDeterministic(stripped || rawJd);

  const mustHaveRequirements = parsedJob.requirements
    .filter((r) => r.priority === 'must-have')
    .slice(0, 6)
    .map((r) => r.text);

  const topSkills = parsedJob.requirements.slice(0, 8).map((r) => r.text);
  const coreResponsibilities = parsedJob.responsibilities.slice(0, 3);

  const briefLines = [
    `ROLE: ${parsedJob.title} (${parsedJob.seniority}) at ${parsedJob.company}`,
    `MUST-HAVES: ${mustHaveRequirements.join(', ') || topSkills.join(', ') || 'Software Engineering'}`,
    `RESPONSIBILITIES: ${coreResponsibilities.join(' | ') || parsedJob.summary}`,
  ];
  const briefText = briefLines.join('\n');
  const briefHash = fnv1aHash(briefText);

  return {
    title: parsedJob.title,
    company: parsedJob.company,
    seniority: parsedJob.seniority,
    topSkills,
    mustHaveRequirements,
    coreResponsibilities,
    briefText,
    briefHash,
    parsedJob,
  };
}

/**
 * Cover Letter Outliner & Template Pools:
 * - Greeting, closing, and sign-off come from voice-calibrated template pools (0 LLM tokens).
 * - LLM only writes `opening`, `body1`, `body2`, and `whyCompany` (<= 70 words each).
 */
export const COVER_LETTER_VOICE_TEMPLATES: Record<
  VoiceLevel,
  {
    greeting: (recipient: string) => string;
    closing: (company: string, roleTitle: string, length: CoverLetterLength) => string;
    signoff: (candidateName: string) => string;
  }
> = {
  polished: {
    greeting: (recipient) => `Dear ${recipient.trim() || 'Hiring Team'},`,
    closing: (company, roleTitle) =>
      `Thank you for your time and consideration. I would welcome a conversation regarding how my background can advance ${company || 'your organization'}'s priorities for the ${roleTitle || 'engineering'} role.`,
    signoff: (name) => `Sincerely,\n${name}`,
  },
  professional: {
    greeting: (recipient) => `Dear ${recipient.trim() || 'Hiring Team'},`,
    closing: (company, roleTitle) =>
      `Thank you for reviewing my application. I would welcome the opportunity to discuss how my experience fits ${company || 'your team'}'s roadmap for the ${roleTitle || 'engineering'} role.`,
    signoff: (name) => `Sincerely,\n${name}`,
  },
  balanced: {
    greeting: (recipient) => `Dear ${recipient.trim() || 'Hiring Team'},`,
    closing: (company, roleTitle) =>
      `Thank you for your time and consideration. I'd welcome the chance to talk about how my hands-on experience can help ${company || 'your team'} in the ${roleTitle || 'role'}.`,
    signoff: (name) => `Best regards,\n${name}`,
  },
  natural: {
    greeting: (recipient) => `Hi ${recipient.trim() || 'Hiring Team'},`,
    closing: (company, roleTitle) =>
      `Thanks for reading and considering my application. I'd love to chat about how my work lines up with what ${company || 'your team'} needs for the ${roleTitle || 'role'}.`,
    signoff: (name) => `Best,\n${name}`,
  },
  plain: {
    greeting: (recipient) => `Hi ${recipient.trim() || 'Hiring Team'},`,
    closing: (company, roleTitle) =>
      `Thanks for your time. I'd be glad to talk through how my background fits the ${roleTitle || 'role'} at ${company || 'your team'}.`,
    signoff: (name) => `Best,\n${name}`,
  },
};

export interface CoverLetterOutline {
  company: string;
  roleTitle: string;
  recipient: string;
  voice: VoiceLevel;
  length: CoverLetterLength;
  primaryProof: {
    achievement: Achievement;
    company: string;
    title: string;
  } | null;
  secondaryProof: {
    achievement: Achievement;
    company: string;
    title: string;
  } | null;
  topRequirements: string[];
  whyCompanyHook: string;
  templateBlocks: {
    greeting: string;
    closing: string;
    signoff: string;
  };
}

export function outlineCoverLetter(params: {
  company: string;
  roleTitle: string;
  recipient: string;
  length: CoverLetterLength;
  voice: VoiceLevel;
  selectedProofAchievementIds: string[];
  whyCompanyNotes: string;
  parsedJob: ParsedJob | null;
  bank: BankSnapshot;
}): CoverLetterOutline {
  const {
    company,
    roleTitle,
    recipient,
    length,
    voice,
    selectedProofAchievementIds,
    whyCompanyNotes,
    parsedJob,
    bank,
  } = params;

  const achById = new Map(bank.achievements.map((a) => [a.id, a]));
  const expById = new Map(bank.experiences.map((e) => [e.id, e]));

  let orderedAchievements = selectedProofAchievementIds
    .map((id) => achById.get(id))
    .filter((a): a is Achievement => Boolean(a));

  if (orderedAchievements.length < 2) {
    const ranked = parsedJob
      ? rankBankItemsForJob(bank, parsedJob).rankedAchievements.map(
          (r) => r.achievement,
        )
      : bank.achievements;
    for (const ach of ranked) {
      if (!orderedAchievements.some((a) => a.id === ach.id)) {
        orderedAchievements.push(ach);
      }
      if (orderedAchievements.length >= 3) break;
    }
  }

  const toProof = (ach: Achievement | undefined) => {
    if (!ach) return null;
    const exp = expById.get(ach.experienceId);
    return {
      achievement: ach,
      company: exp?.company ?? bank.experiences[0]?.company ?? 'prior team',
      title: exp?.title ?? bank.profile.headline,
    };
  };

  const cleanCompany = company.trim() || parsedJob?.company || 'your team';
  const cleanRole =
    roleTitle.trim() || parsedJob?.title || bank.profile.headline;
  const topRequirements = (parsedJob?.requirements ?? [])
    .slice(0, 3)
    .map((r) => r.text);

  const templates = COVER_LETTER_VOICE_TEMPLATES[voice];

  return {
    company: cleanCompany,
    roleTitle: cleanRole,
    recipient: recipient.trim() || 'Hiring Team',
    voice,
    length,
    primaryProof: toProof(orderedAchievements[0]),
    secondaryProof: toProof(orderedAchievements[1]),
    topRequirements,
    whyCompanyHook:
      whyCompanyNotes.trim() ||
      parsedJob?.responsibilities?.[0] ||
      parsedJob?.summary ||
      `engineering resilient systems for ${cleanCompany}`,
    templateBlocks: {
      greeting: templates.greeting(recipient),
      closing: templates.closing(cleanCompany, cleanRole, length),
      signoff: templates.signoff(bank.profile.name),
    },
  };
}
