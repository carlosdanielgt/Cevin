import { Profile, VoiceLevel } from './entities';

export interface InlineClicheMatch {
  term: string;
  index: number;
  length: number;
  replacement: string;
  reason: string;
}

export interface FormattedContactBlock {
  line1: string[];
  line2: Array<{
    display: string;
    url: string;
  }>;
}

const CLICHE_REPLACEMENTS: Array<{
  pattern: RegExp;
  replacement: string;
  reason: string;
}> = [
  {
    pattern: /\barchitected and spearheaded\b/gi,
    replacement: 'Built',
    reason: 'Direct verb reads more naturally than corporate double-verbs.',
  },
  {
    pattern: /\barchitected\b/gi,
    replacement: 'built',
    reason: 'Prefer plain "built" or "designed" over "architected".',
  },
  {
    pattern: /\bspearheaded\b/gi,
    replacement: 'led',
    reason: 'Prefer direct "led" over "spearheaded".',
  },
  {
    pattern: /\borchestrated\b/gi,
    replacement: 'ran',
    reason: 'Prefer direct "ran" or "coordinated" over "orchestrated".',
  },
  {
    pattern: /\bleveraged\b/gi,
    replacement: 'used',
    reason: 'Prefer simple "used" over "leveraged".',
  },
  {
    pattern: /\butilized\b/gi,
    replacement: 'used',
    reason: 'Prefer simple "used" over "utilized".',
  },
  {
    pattern: /\bseamlessly\b/gi,
    replacement: 'cleanly',
    reason: '"Seamlessly" is a common filler adverb.',
  },
  {
    pattern: /\bmission-critical\b/gi,
    replacement: 'core',
    reason: '"Core" is cleaner and less inflated than "mission-critical".',
  },
  {
    pattern: /\bcutting-edge\b/gi,
    replacement: 'modern',
    reason: 'Avoid generic hype adjectives.',
  },
  {
    pattern: /\bstreamlined\b/gi,
    replacement: 'simplified',
    reason: 'Prefer concrete "simplified" or "cut" over "streamlined".',
  },
  {
    pattern: /\bchampioned\b/gi,
    replacement: 'led',
    reason: 'Prefer direct "led" over "championed".',
  },
  {
    pattern: /\bsynergized\b/gi,
    replacement: 'combined',
    reason: 'Avoid corporate buzzwords.',
  },
  {
    pattern: /\brevolutionized\b/gi,
    replacement: 'redesigned',
    reason: 'Avoid exaggerated claims.',
  },
];

/**
 * Checks whether the numeric tokens or text of `metric` are already present
 * in `combinedText` (action + result), preventing duplicated numbers like
 * "...by 38%: 38% egress reduction".
 */
export function isMetricAlreadyInText(
  combinedText: string,
  metric?: string,
): boolean {
  if (!metric || !metric.trim()) return true;
  const cleanMetric = metric.trim().toLowerCase();
  const cleanText = combinedText.toLowerCase();

  if (cleanText.includes(cleanMetric)) {
    return true;
  }

  const metricNumbers =
    cleanMetric.match(/\$?\d+(?:[.,]\d+)*(?:%|x|ms|s|k|m|b|\+)?/gi) ?? [];
  if (metricNumbers.length > 0) {
    const normalizedText = cleanText.replace(/,/g, '');
    const anyNumberPresent = metricNumbers.some((num) => {
      const normNum = num.toLowerCase().replace(/,/g, '');
      return normalizedText.includes(normNum);
    });
    if (anyNumberPresent) {
      return true;
    }
  }

  return false;
}

/**
 * Joins `action`, `result`, and optional `metric` into a single grammatical bullet
 * in the requested VoiceLevel.
 *
 * Guarantees:
 * - Joins action and result with a comma or em-dash (never produces `. lowercase`).
 * - Appends `metric` ONLY when its numbers are not already present in action/result.
 * - Always ends with a single period `.`.
 */
export function assembleBullet(
  input: { action: string; result: string; metric?: string },
  voice: VoiceLevel,
  variationSeed = 0,
): string {
  const cleanAction = input.action
    .trim()
    .replace(/[.!?;:,—–-]+$/, '')
    .trim();
  const cleanResult = input.result
    .trim()
    .replace(/[.!?;:,—–-]+$/, '')
    .trim();
  const cleanMetric = input.metric?.trim().replace(/[.!?;:,]+$/, '').trim();

  if (!cleanAction && !cleanResult) {
    return '';
  }
  if (!cleanResult) {
    return `${cleanAction}.`;
  }

  const lowerResult =
    cleanResult.charAt(0).toLowerCase() + cleanResult.slice(1);

  const verbSwaps: Record<VoiceLevel, Array<[RegExp, string]>> = {
    polished: [
      [/^Built\b/i, 'Architected and engineered'],
      [/^Rebuilt\b/i, 'Orchestrated the modernization of'],
      [/^Migrated\b/i, 'Spearheaded the migration of'],
      [/^Designed\b/i, 'Architected'],
      [/^Implemented\b/i, 'Engineered and deployed'],
      [/^Reduced\b/i, 'Streamlined and reduced'],
      [/^Created\b/i, 'Championed the delivery of'],
      [/^Led\b/i, 'Orchestrated cross-functional execution for'],
    ],
    professional: [
      [/^Spearheaded\b/i, 'Led'],
      [/^Orchestrated\b/i, 'Coordinated'],
      [/^Built\b/i, 'Engineered'],
      [/^Made\b/i, 'Developed'],
      [/^Fixed\b/i, 'Resolved'],
    ],
    balanced: [
      [/^Spearheaded\b/i, 'Led'],
      [/^Orchestrated\b/i, 'Guided'],
      [/^Architected\b/i, 'Designed'],
      [/^Leveraged\b/i, 'Used'],
      [/^Utilized\b/i, 'Used'],
    ],
    natural: [
      [/^Spearheaded\b/i, 'Led'],
      [/^Orchestrated\b/i, 'Ran'],
      [/^Re-architected\b/i, 'Rebuilt'],
      [/^Architected\b/i, 'Built'],
      [/^Engineered\b/i, 'Built'],
      [/^Implemented\b/i, 'Built'],
      [/^Migrated\b/i, 'Moved'],
      [/^Leveraged\b/i, 'Used'],
      [/^Utilized\b/i, 'Used'],
    ],
    plain: [
      [/^Spearheaded\b/i, 'Ran'],
      [/^Orchestrated\b/i, 'Ran'],
      [/^Re-architected\b/i, 'Rebuilt'],
      [/^Architected\b/i, 'Built'],
      [/^Engineered\b/i, 'Built'],
      [/^Implemented\b/i, 'Built'],
      [/^Designed and built\b/i, 'Built'],
      [/^Migrated\b/i, 'Moved'],
      [/^Optimized\b/i, 'Sped up'],
      [/^Streamlined\b/i, 'Simplified'],
    ],
  };

  let transformedAction = cleanAction;
  for (const [pattern, replacement] of verbSwaps[voice]) {
    if (pattern.test(transformedAction)) {
      transformedAction = transformedAction.replace(pattern, replacement);
      break;
    }
  }

  const combinedBase = `${transformedAction} ${cleanResult}`;
  const includeMetric =
    Boolean(cleanMetric) && !isMetricAlreadyInText(combinedBase, cleanMetric);

  let sentence = '';
  switch (voice) {
    case 'polished': {
      const connector = variationSeed % 2 === 0 ? ' — ' : ', ';
      const metricSuffix = includeMetric ? ` (${cleanMetric})` : '';
      sentence = `${transformedAction}${connector}${lowerResult}${metricSuffix}`;
      break;
    }
    case 'professional': {
      const metricSuffix = includeMetric ? `, achieving ${cleanMetric}` : '';
      sentence = `${transformedAction}, ${lowerResult}${metricSuffix}`;
      break;
    }
    case 'balanced': {
      const metricSuffix = includeMetric ? ` (${cleanMetric})` : '';
      sentence = `${transformedAction}, ${lowerResult}${metricSuffix}`;
      break;
    }
    case 'natural': {
      const connector = variationSeed % 2 === 0 ? ', ' : ' — ';
      const metricSuffix = includeMetric ? ` (${cleanMetric})` : '';
      sentence = `${transformedAction}${connector}${lowerResult}${metricSuffix}`;
      break;
    }
    case 'plain': {
      const metricSuffix = includeMetric ? ` (${cleanMetric})` : '';
      sentence = `${transformedAction}, ${lowerResult}${metricSuffix}`;
      break;
    }
  }

  // Ensure we never have ". lowercase" anywhere in the assembled bullet
  sentence = sentence.replace(/\.\s+([a-z])/g, ', $1');
  sentence = sentence.replace(/[.!?;:,—–-]+$/, '').trim();
  return `${sentence}.`;
}

/**
 * Formats a Profile into two clean contact lines:
 * Line 1: email, phone, location (non-empty items only)
 * Line 2: links with https:// and www. stripped, no "GitHub:" prefix, no empty entries.
 */
export function formatContactBlock(
  profile: Pick<Profile, 'email' | 'phone' | 'location' | 'links'>,
): FormattedContactBlock {
  const line1 = [profile.email, profile.phone, profile.location]
    .map((item) => item?.trim() ?? '')
    .filter((item) => item.length > 0);

  const line2 = (profile.links ?? [])
    .map((link) => {
      const rawUrl = (link.url ?? '').trim();
      if (!rawUrl) return null;
      const display = rawUrl
        .replace(/^[a-z]+:\s*/i, (prefix) =>
          /^https?:/i.test(prefix) ? prefix : '',
        )
        .replace(/^https?:\/\/(www\.)?/i, '')
        .replace(/\/+$/, '')
        .trim();
      if (!display) return null;
      const href = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${display}`;
      return { display, url: href };
    })
    .filter((item): item is { display: string; url: string } => item !== null);

  return { line1, line2 };
}

/**
 * Finds inline cliché words/phrases in a bullet or paragraph and returns
 * 1-click plain replacement suggestions.
 */
export function findInlineCliches(text: string): InlineClicheMatch[] {
  const matches: InlineClicheMatch[] = [];
  if (!text) return matches;

  for (const item of CLICHE_REPLACEMENTS) {
    const regex = new RegExp(item.pattern.source, 'gi');
    let match: RegExpExecArray | null = regex.exec(text);
    while (match !== null) {
      const term = match[0];
      const startsUpper =
        term.charAt(0) === term.charAt(0).toUpperCase() &&
        term.charAt(0) !== term.charAt(0).toLowerCase();
      const replacement = startsUpper
        ? item.replacement.charAt(0).toUpperCase() + item.replacement.slice(1)
        : item.replacement.toLowerCase();

      const overlaps = matches.some(
        (m) =>
          (match!.index >= m.index && match!.index < m.index + m.length) ||
          (m.index >= match!.index && m.index < match!.index + term.length),
      );
      if (!overlaps) {
        matches.push({
          term,
          index: match.index,
          length: term.length,
          replacement,
          reason: item.reason,
        });
      }
      match = regex.exec(text);
    }
  }

  return matches.sort((a, b) => a.index - b.index);
}

export function assembleBulletText(
  input: {
    action: string;
    result: string;
    metric?: string;
  },
  voice: VoiceLevel = 'balanced',
): string {
  return assembleBullet(input, voice);
}

export const RECOMMENDED_OLLAMA_ENV = {
  OLLAMA_FLASH_ATTENTION: '1',
  OLLAMA_KV_CACHE_TYPE: 'q8_0',
  OLLAMA_NUM_PARALLEL: '2',
  OLLAMA_MAX_LOADED_MODELS: '1',
  OLLAMA_KEEP_ALIVE: '30m',
} as const;

