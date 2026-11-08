import { assembleBullet } from './bulletAssembler';
import { VoiceLevel } from './entities';

export interface VoiceStyleSpec {
  level: VoiceLevel;
  index: number; // 0 to 4
  label: string;
  tagline: string;
  sentenceVariance: string;
  verbGuidance: string;
  concreteness: string;
  bannedCliches: string[];
  temperature: number;
  topP: number;
  preferredVerbs: Record<string, string>;
}

export const VOICE_LEVEL_ORDER: VoiceLevel[] = [
  'polished',
  'professional',
  'balanced',
  'natural',
  'plain',
];

const BASE_CLICHES = [
  'synergized',
  'revolutionized',
  'paradigm-shifting',
  'world-class',
  'best-in-class',
];

export const VOICE_STYLE_SPECS: Record<VoiceLevel, VoiceStyleSpec> = {
  polished: {
    level: 'polished',
    index: 0,
    label: 'Polished',
    tagline: 'Executive cadence with formal action verbs and structured clauses.',
    sentenceVariance: 'Structured parallel clauses (18–26 words per bullet).',
    verbGuidance: 'Use formal leadership verbs: Architected, Spearheaded, Orchestrated, Championed.',
    concreteness: 'Formal impact framing with explicit business outcomes.',
    bannedCliches: BASE_CLICHES,
    temperature: 0.45,
    topP: 0.9,
    preferredVerbs: {
      built: 'Architected and engineered',
      made: 'Spearheaded the creation of',
      fixed: 'Remediated critical bottlenecks in',
      sped: 'Accelerated end-to-end throughput for',
      cut: 'Streamlined operational overhead across',
      led: 'Orchestrated cross-functional execution for',
      migrated: 'Spearheaded the zero-downtime migration of',
    },
  },
  professional: {
    level: 'professional',
    index: 1,
    label: 'Professional',
    tagline: 'Crisp industry-standard resume prose without purple flourishes.',
    sentenceVariance: 'Moderate variance (15–22 words), lead with strong action or metric.',
    verbGuidance: 'Use precise engineering verbs: Engineered, Designed, Delivered, Scaled, Optimized.',
    concreteness: 'Pair technical mechanism directly with measurable metric.',
    bannedCliches: [...BASE_CLICHES, 'spearheaded', 'orchestrated', 'catalyzed', 'visionary'],
    temperature: 0.4,
    topP: 0.88,
    preferredVerbs: {
      built: 'Engineered',
      made: 'Developed',
      fixed: 'Resolved',
      sped: 'Optimized',
      cut: 'Reduced',
      led: 'Led',
      migrated: 'Migrated',
    },
  },
  balanced: {
    level: 'balanced',
    index: 2,
    label: 'Balanced',
    tagline: 'Direct, grounded, and easy to scan—like a senior engineer talking to a peer.',
    sentenceVariance: 'Natural mix of compact (12-word) and detailed (20-word) sentences.',
    verbGuidance: 'Use clear verbs: Built, Shipped, Designed, Reduced, Automated, Migrated.',
    concreteness: 'Name the exact tool, constraint, and before/after number.',
    bannedCliches: [
      ...BASE_CLICHES,
      'spearheaded',
      'orchestrated',
      'catalyzed',
      'leveraged',
      'seamlessly',
      'cutting-edge',
      'mission-critical',
    ],
    temperature: 0.35,
    topP: 0.85,
    preferredVerbs: {
      built: 'Built',
      made: 'Created',
      fixed: 'Fixed',
      sped: 'Sped up',
      cut: 'Cut',
      led: 'Led',
      migrated: 'Moved',
    },
  },
  natural: {
    level: 'natural',
    index: 3,
    label: 'Natural',
    tagline: 'Conversational clarity with varied rhythm and zero corporate buzzwords.',
    sentenceVariance: 'Varied sentence lengths; direct active clauses.',
    verbGuidance: 'Everyday direct verbs: Built, Ran, Fixed, Cut, Replaced, Wrote, Taught.',
    concreteness: 'Concrete nouns over abstract nouns ("cut deploy time" vs "optimized deployment velocity").',
    bannedCliches: [
      ...BASE_CLICHES,
      'spearheaded',
      'orchestrated',
      'catalyzed',
      'leveraged',
      'utilized',
      'seamlessly',
      'cutting-edge',
      'mission-critical',
      'robust',
      'transformative',
      'streamlined',
    ],
    temperature: 0.32,
    topP: 0.82,
    preferredVerbs: {
      built: 'Built',
      made: 'Wrote',
      fixed: 'Tracked down and fixed',
      sped: 'Trimmed',
      cut: 'Cut',
      led: 'Ran',
      migrated: 'Moved',
    },
  },
  plain: {
    level: 'plain',
    index: 4,
    label: 'Plain-spoken',
    tagline: 'Blunt, matter-of-fact statement of what you built, what broke, and what changed.',
    sentenceVariance: 'Short, punchy clauses with high rhythm variation. Zero fluff.',
    verbGuidance: 'Strictly plain verbs: Built, Ran, Fixed, Cut, Moved, Kept, Dropped.',
    concreteness: 'Strictly facts, numbers, and tool names. No adjectives without numbers.',
    bannedCliches: [
      ...BASE_CLICHES,
      'spearheaded',
      'orchestrated',
      'catalyzed',
      'leveraged',
      'utilized',
      'seamlessly',
      'cutting-edge',
      'mission-critical',
      'robust',
      'transformative',
      'streamlined',
      'architected',
      'championed',
      'empowered',
      'facilitated',
    ],
    temperature: 0.25,
    topP: 0.8,
    preferredVerbs: {
      built: 'Built',
      made: 'Built',
      fixed: 'Fixed',
      sped: 'Sped up',
      cut: 'Cut',
      led: 'Ran',
      migrated: 'Moved',
    },
  },
};

export function getVoiceStyleSpec(level: VoiceLevel): VoiceStyleSpec {
  return VOICE_STYLE_SPECS[level];
}

export function getOneStepMoreHumanVoice(voice: VoiceLevel): VoiceLevel {
  const idx = VOICE_LEVEL_ORDER.indexOf(voice);
  if (idx === -1) return 'natural';
  return VOICE_LEVEL_ORDER[Math.min(VOICE_LEVEL_ORDER.length - 1, idx + 1)];
}

export function getMachineMadeFeelLevel(
  score: number,
): 'Low' | 'Medium' | 'High' {
  if (score < 32) return 'Low';
  if (score < 62) return 'Medium';
  return 'High';
}

/**
 * Deterministic voice transformer that rewrites an Achievement
 * (`action`, `result`, `metric`) in the requested VoiceLevel while preserving
 * 100% of facts, numbers, and tool names from the source item.
 */
export function formatAchievementInVoice(
  input: { action: string; result: string; metric?: string },
  voice: VoiceLevel,
  variationSeed = 0,
): string {
  return assembleBullet(input, voice, variationSeed);
}
