import { z } from 'zod';
import { formatCount } from '../format';
import {
  FACT_KIND_REGISTRY,
  FactIconName,
  FactImportance,
  FactImportanceSchema,
  FactSalience,
  FitStripSummary,
  RowAttentionToken,
  buildFitStripSummary,
  deriveRowAttentionToken,
  deriveSalience,
  formatFactSourceTooltip,
  getFactImportance,
} from './registry';

export * from './registry';


// ============================================================================
// 1. REFERENCE TABLES (METROS, LANGUAGES, WORK PERMIT PROGRAMS)
// ============================================================================

export interface MetroAreaEntry {
  id: string;
  label: string;
  country: string;
  region?: string;
  aliases: string[];
}

export const METRO_AREAS: MetroAreaEntry[] = [
  {
    id: 'sf-bay-area',
    label: 'San Francisco Bay Area',
    country: 'United States',
    region: 'CA',
    aliases: [
      'san francisco',
      'sf',
      'bay area',
      'san francisco bay area',
      'palo alto',
      'mountain view',
      'sunnyvale',
      'menlo park',
      'oakland',
      'san jose',
      'redwood city',
      'san mateo',
      'berkeley',
    ],
  },
  {
    id: 'nyc-metro',
    label: 'New York Metro',
    country: 'United States',
    region: 'NY',
    aliases: [
      'new york',
      'new york city',
      'nyc',
      'manhattan',
      'brooklyn',
      'jersey city',
      'hoboken',
    ],
  },
  {
    id: 'seattle-metro',
    label: 'Seattle Metro',
    country: 'United States',
    region: 'WA',
    aliases: ['seattle', 'bellevue', 'redmond', 'kirkland'],
  },
  {
    id: 'austin-metro',
    label: 'Austin',
    country: 'United States',
    region: 'TX',
    aliases: ['austin'],
  },
  {
    id: 'boston-metro',
    label: 'Greater Boston',
    country: 'United States',
    region: 'MA',
    aliases: ['boston', 'cambridge', 'somerville'],
  },
  {
    id: 'toronto-metro',
    label: 'Greater Toronto Area',
    country: 'Canada',
    region: 'ON',
    aliases: ['toronto', 'gta', 'mississauga', 'waterloo', 'kitchener'],
  },
  {
    id: 'montreal-metro',
    label: 'Greater Montreal',
    country: 'Canada',
    region: 'QC',
    aliases: ['montreal', 'montréal', 'laval', 'longueuil'],
  },
  {
    id: 'vancouver-metro',
    label: 'Metro Vancouver',
    country: 'Canada',
    region: 'BC',
    aliases: ['vancouver', 'burnaby', 'richmond'],
  },
  {
    id: 'london-metro',
    label: 'Greater London',
    country: 'United Kingdom',
    aliases: ['london', 'greater london'],
  },
  {
    id: 'paris',
    label: 'Paris / Île-de-France',
    country: 'France',
    aliases: [
      'paris',
      'ile-de-france',
      'île-de-france',
      'la defense',
      'la défense',
      'boulogne-billancourt',
      'neuilly-sur-seine',
    ],
  },
  {
    id: 'lyon-metro',
    label: 'Lyon',
    country: 'France',
    aliases: ['lyon', 'villeurbanne'],
  },
  {
    id: 'berlin-metro',
    label: 'Berlin',
    country: 'Germany',
    aliases: ['berlin'],
  },
  {
    id: 'munich-metro',
    label: 'Munich',
    country: 'Germany',
    aliases: ['munich', 'münchen', 'munchen'],
  },
  {
    id: 'amsterdam-metro',
    label: 'Amsterdam',
    country: 'Netherlands',
    aliases: ['amsterdam'],
  },
  {
    id: 'dublin-metro',
    label: 'Dublin',
    country: 'Ireland',
    aliases: ['dublin'],
  },
  {
    id: 'zurich-metro',
    label: 'Zurich',
    country: 'Switzerland',
    aliases: ['zurich', 'zürich'],
  },
  {
    id: 'los-angeles-metro',
    label: 'Greater Los Angeles',
    country: 'United States',
    region: 'CA',
    aliases: ['los angeles', 'la', 'santa monica', 'irvine', 'pasadena', 'culver city'],
  },
  {
    id: 'san-diego-metro',
    label: 'San Diego',
    country: 'United States',
    region: 'CA',
    aliases: ['san diego', 'la jolla'],
  },
  {
    id: 'chicago-metro',
    label: 'Chicagoland',
    country: 'United States',
    region: 'IL',
    aliases: ['chicago', 'evanston'],
  },
  {
    id: 'dc-metro',
    label: 'Washington DC Metro',
    country: 'United States',
    region: 'DC',
    aliases: ['washington dc', 'washington, d.c.', 'arlington', 'reston', 'mclean', 'bethesda'],
  },
  {
    id: 'denver-metro',
    label: 'Denver / Boulder',
    country: 'United States',
    region: 'CO',
    aliases: ['denver', 'boulder'],
  },
  {
    id: 'atlanta-metro',
    label: 'Metro Atlanta',
    country: 'United States',
    region: 'GA',
    aliases: ['atlanta', 'alpharetta'],
  },
  {
    id: 'dallas-metro',
    label: 'Dallas-Fort Worth',
    country: 'United States',
    region: 'TX',
    aliases: ['dallas', 'fort worth', 'plano', 'irving'],
  },
  {
    id: 'houston-metro',
    label: 'Greater Houston',
    country: 'United States',
    region: 'TX',
    aliases: ['houston'],
  },
  {
    id: 'miami-metro',
    label: 'South Florida / Miami',
    country: 'United States',
    region: 'FL',
    aliases: ['miami', 'fort lauderdale', 'boca raton'],
  },
  {
    id: 'philadelphia-metro',
    label: 'Greater Philadelphia',
    country: 'United States',
    region: 'PA',
    aliases: ['philadelphia', 'philly'],
  },
  {
    id: 'portland-metro',
    label: 'Portland Metro',
    country: 'United States',
    region: 'OR',
    aliases: ['portland', 'beaverton'],
  },
  {
    id: 'raleigh-durham-metro',
    label: 'Research Triangle',
    country: 'United States',
    region: 'NC',
    aliases: ['raleigh', 'durham', 'chapel hill'],
  },
  {
    id: 'ottawa-metro',
    label: 'Ottawa-Gatineau',
    country: 'Canada',
    region: 'ON',
    aliases: ['ottawa', 'gatineau', 'kanata'],
  },
  {
    id: 'calgary-metro',
    label: 'Calgary',
    country: 'Canada',
    region: 'AB',
    aliases: ['calgary'],
  },
  {
    id: 'toulouse-metro',
    label: 'Toulouse',
    country: 'France',
    aliases: ['toulouse', 'blagnac'],
  },
  {
    id: 'nantes-metro',
    label: 'Nantes',
    country: 'France',
    aliases: ['nantes'],
  },
  {
    id: 'bordeaux-metro',
    label: 'Bordeaux',
    country: 'France',
    aliases: ['bordeaux'],
  },
  {
    id: 'lille-metro',
    label: 'Lille',
    country: 'France',
    aliases: ['lille', 'roubaix'],
  },
  {
    id: 'madrid-metro',
    label: 'Madrid',
    country: 'Spain',
    aliases: ['madrid'],
  },
  {
    id: 'barcelona-metro',
    label: 'Barcelona',
    country: 'Spain',
    aliases: ['barcelona'],
  },
  {
    id: 'stockholm-metro',
    label: 'Stockholm',
    country: 'Sweden',
    aliases: ['stockholm'],
  },
  {
    id: 'warsaw-metro',
    label: 'Warsaw',
    country: 'Poland',
    aliases: ['warsaw', 'warszawa'],
  },
];

export const COUNTRY_ALIASES: Record<string, string> = {
  us: 'United States',
  usa: 'United States',
  'u.s.': 'United States',
  'u.s.a.': 'United States',
  'united states': 'United States',
  'united states of america': 'United States',
  'états-unis': 'United States',
  'etats-unis': 'United States',
  canada: 'Canada',
  ca: 'Canada',
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  'united kingdom': 'United Kingdom',
  'royaume-uni': 'United Kingdom',
  england: 'United Kingdom',
  france: 'France',
  fr: 'France',
  germany: 'Germany',
  allemagne: 'Germany',
  de: 'Germany',
  ireland: 'Ireland',
  irlande: 'Ireland',
  netherlands: 'Netherlands',
  'pays-bas': 'Netherlands',
  switzerland: 'Switzerland',
  suisse: 'Switzerland',
};

export function normalizeCountryName(raw: string): string {
  const clean = raw.trim().toLowerCase().replace(/[.]/g, '');
  if (COUNTRY_ALIASES[clean]) return COUNTRY_ALIASES[clean];
  if (COUNTRY_ALIASES[raw.trim().toLowerCase()]) {
    return COUNTRY_ALIASES[raw.trim().toLowerCase()];
  }
  return raw.trim();
}

export function findMetroAreaEntry(cityOrText: string): MetroAreaEntry | null {
  const norm = cityOrText.trim().toLowerCase();
  if (!norm) return null;
  for (const metro of METRO_AREAS) {
    for (const alias of metro.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu');
      if (rx.test(norm)) {
        return metro;
      }
    }
  }
  return null;
}

export function resolveMetroArea(cityOrText: string): string | null {
  return findMetroAreaEntry(cityOrText)?.id ?? null;
}

export interface LanguageEntry {
  code: string;
  label: string;
  aliases: string[];
}

export const KNOWN_LANGUAGES: LanguageEntry[] = [
  {
    code: 'en',
    label: 'English',
    aliases: ['english', 'anglais', 'anglophone'],
  },
  {
    code: 'fr',
    label: 'French',
    aliases: ['french', 'français', 'francais', 'francophone'],
  },
  {
    code: 'es',
    label: 'Spanish',
    aliases: ['spanish', 'español', 'espanol', 'espagnol'],
  },
  {
    code: 'de',
    label: 'German',
    aliases: ['german', 'deutsch', 'allemand'],
  },
  {
    code: 'pt',
    label: 'Portuguese',
    aliases: ['portuguese', 'português', 'portugais'],
  },
  {
    code: 'it',
    label: 'Italian',
    aliases: ['italian', 'italiano', 'italien'],
  },
  {
    code: 'nl',
    label: 'Dutch',
    aliases: ['dutch', 'nederlands', 'néerlandais'],
  },
  {
    code: 'zh',
    label: 'Mandarin',
    aliases: ['mandarin', 'chinese', 'chinois'],
  },
  {
    code: 'ja',
    label: 'Japanese',
    aliases: ['japanese', 'japonais'],
  },
  {
    code: 'pl',
    label: 'Polish',
    aliases: ['polish', 'polonais'],
  },
];

export const WORK_PERMIT_PROGRAMS: Array<{
  name: string;
  patterns: RegExp[];
}> = [
  { name: 'H-1B', patterns: [/\bh-?1b\b/i] },
  { name: 'O-1', patterns: [/\bo-?1\s+visa\b/i, /\bo-1\b/i] },
  { name: 'TN', patterns: [/\btn\s+(?:visa|status)\b/i] },
  { name: 'E-3', patterns: [/\be-?3\s+visa\b/i] },
  { name: 'F-1 OPT/CPT', patterns: [/\b(?:f-?1\s+)?(?:opt|cpt|stem\s+opt)\b/i] },
  { name: 'Green Card', patterns: [/\bgreen\s+card\b/i, /\bpermanent\s+residen(?:ce|cy)\b/i] },
  { name: 'LMIA', patterns: [/\blmia\b/i, /\beimt\b/i] },
  { name: 'Global Talent Stream', patterns: [/\bglobal\s+talent\s+stream\b/i, /\bvolet\s+des\s+talents\s+mondiaux\b/i] },
  { name: 'CUSMA', patterns: [/\bcusma\b/i, /\bacum\b/i] },
  { name: 'Skilled Worker Visa', patterns: [/\bskilled\s+worker\s+visa\b/i, /\btier\s*2\s+sponsorship\b/i] },
  { name: 'EU Blue Card', patterns: [/\b(?:eu\s+)?blue\s+card\b/i, /\bcarte\s+bleue\s+europ[ée]enne\b/i] },
  { name: 'Passeport Talent', patterns: [/\bpasseport\s+talent\b/i] },
];

// ============================================================================
// 2. SCHEMAS & TYPES (JOB FACTS & PREFERENCES)
// ============================================================================

export const FactEvidenceSchema = z.object({
  quote: z.string(),
  startOffset: z.number().int().nonnegative(),
  endOffset: z.number().int().nonnegative(),
});
export type FactEvidence = z.infer<typeof FactEvidenceSchema>;

export const FactConfidenceSchema = z.enum(['high', 'review']);
export type FactConfidence = z.infer<typeof FactConfidenceSchema>;

export const FactSourceSchema = z.enum(['rules', 'llm', 'user']);
export type FactSource = z.infer<typeof FactSourceSchema>;

export const WorkModeValueSchema = z.enum([
  'on-site',
  'hybrid',
  'remote',
  'unspecified',
]);
export type WorkModeValue = z.infer<typeof WorkModeValueSchema>;

export const SponsorshipValueSchema = z.enum([
  'yes',
  'no',
  'conditional',
  'not-stated',
]);
export type SponsorshipValue = z.infer<typeof SponsorshipValueSchema>;

export const EmploymentTypeValueSchema = z.enum([
  'full-time',
  'part-time',
  'contract',
  'fixed-term',
  'internship',
  'apprenticeship',
  'temporary',
  'unspecified',
  'not-stated',
]);
export type EmploymentTypeValue = z.infer<typeof EmploymentTypeValueSchema>;

export const LocationFactValueSchema = z.object({
  locations: z.array(
    z.object({
      city: z.string(),
      region: z.string().optional(),
      country: z.string(),
      metroId: z.string().optional(),
    }),
  ),
  workMode: WorkModeValueSchema,
  mode: z.enum(['remote', 'hybrid', 'onsite', 'not-stated']).optional(),
  cities: z.array(z.string()).default([]),
  officeDays: z.number().int().min(1).max(5).optional(),
  daysInOffice: z.number().int().min(1).max(5).optional(),
  remoteRegions: z.array(z.string()).default([]),
  remoteEligibility: z
    .object({
      countries: z.array(z.string()),
      regions: z.array(z.string()),
      timeZones: z.array(z.string()),
    })
    .optional(),
});
export type LocationFactValue = z.infer<typeof LocationFactValueSchema>;

export const WorkPermitsFactValueSchema = z.object({
  sponsorship: SponsorshipValueSchema,
  policy: z
    .enum([
      'sponsors',
      'no-sponsorship',
      'conditional',
      'citizenship-or-clearance-required',
      'not-stated',
    ])
    .optional(),
  authorizationRequired: z.boolean(),
  programs: z.array(z.string()),
  citizenshipRequired: z.boolean().optional(),
  clearanceRequired: z.boolean().optional(),
  clearance: z.boolean().optional(),
});
export type WorkPermitsFactValue = z.infer<typeof WorkPermitsFactValueSchema>;

export const LanguagesFactValueSchema = z.object({
  required: z.array(
    z.object({
      language: z.string(),
      level: z.string().optional(),
    }),
  ),
  niceToHave: z.array(
    z.object({
      language: z.string(),
      level: z.string().optional(),
    }),
  ),
});
export type LanguagesFactValue = z.infer<typeof LanguagesFactValueSchema>;

export const SalaryFactValueSchema = z.object({
  min: z.number().optional(),
  max: z.number().optional(),
  currency: z.string().optional(),
  period: z.enum(['year', 'month', 'day', 'hour', 'unspecified']).optional(),
  stated: z.boolean(),
});
export type SalaryFactValue = z.infer<typeof SalaryFactValueSchema>;

export const EmploymentTypeFactValueSchema = z.object({
  type: EmploymentTypeValueSchema,
});
export type EmploymentTypeFactValue = z.infer<
  typeof EmploymentTypeFactValueSchema
>;

function createFactEnvelopeSchema<T extends z.ZodTypeAny>(valueSchema: T) {
  return z.object({
    value: valueSchema,
    confidence: FactConfidenceSchema,
    evidence: z.array(FactEvidenceSchema),
    source: FactSourceSchema,
    triggerSnippet: z.string().optional(),
  });
}

export const ScaleFactExtraSchema = z.object({
  key: z.string(),
  label: z.string(),
  shortLabel: z.string(),
  icon: z.enum([
    'map-pin',
    'shield',
    'globe',
    'dollar-sign',
    'briefcase',
    'clock',
    'plane',
    'lock',
    'award',
    'users',
    'calendar',
    'laptop',
    'heart',
    'building',
    'graduation-cap',
  ]),
  valueSummary: z.string(),
  status: z.enum(['fits', 'conflict', 'not-stated']),
  importance: FactImportanceSchema,
  reason: z.string(),
  source: FactSourceSchema.optional(),
  confidence: FactConfidenceSchema.optional(),
  evidence: z.array(FactEvidenceSchema).optional(),
});

export const JobFactsSchema = z.object({
  location: createFactEnvelopeSchema(LocationFactValueSchema),
  workPermits: createFactEnvelopeSchema(WorkPermitsFactValueSchema),
  languages: createFactEnvelopeSchema(LanguagesFactValueSchema),
  salary: createFactEnvelopeSchema(SalaryFactValueSchema),
  employmentType: createFactEnvelopeSchema(EmploymentTypeFactValueSchema),
  extraFacts: z.array(ScaleFactExtraSchema).optional(),
});
export type JobFacts = z.infer<typeof JobFactsSchema>;

export type JobFactKey =
  | 'location'
  | 'workPermits'
  | 'languages'
  | 'salary'
  | 'employmentType';

export const LanguageProficiencySchema = z.enum([
  'basic',
  'conversational',
  'professional',
  'fluent',
  'native',
]);
export type LanguageProficiency = z.infer<typeof LanguageProficiencySchema>;

export const UserPreferencesSchema = z.object({
  homeLocation: z.object({
    city: z.string(),
    region: z.string(),
    country: z.string(),
    metroId: z.string().optional(),
    countryCode: z.string().optional(),
  }),
  acceptedWorkModes: z.array(z.enum(['remote', 'hybrid', 'on-site'])),
  sameMetroOnly: z.boolean(),
  openToRelocation: z.boolean(),
  authorizedCountries: z.array(z.string()),
  citizenships: z.array(z.string()),
  holdsClearance: z.boolean().optional(),
  needsSponsorship: z.enum(['yes', 'no', 'unspecified']),
  spokenLanguages: z.array(
    z.object({
      language: z.string(),
      level: LanguageProficiencySchema,
    }),
  ),
  salaryFloor: z
    .object({
      amount: z.number().nonnegative().optional(),
      minAmount: z.number().nonnegative().optional(),
      currency: z.string(),
      period: z.enum(['year', 'month', 'hour']),
    })
    .optional(),
  acceptedEmploymentTypes: z.array(
    z.enum(['full-time', 'part-time', 'contract', 'internship', 'temporary']),
  ),
  importance: z.record(z.string(), FactImportanceSchema).optional(),
});
export type UserPreferences = z.infer<typeof UserPreferencesSchema>;

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  homeLocation: {
    city: 'San Francisco',
    region: 'CA',
    country: 'United States',
    metroId: 'sf-bay-area',
    countryCode: 'US',
  },
  acceptedWorkModes: ['remote', 'hybrid', 'on-site'],
  sameMetroOnly: true,
  openToRelocation: false,
  authorizedCountries: ['United States'],
  citizenships: ['United States'],
  holdsClearance: false,
  needsSponsorship: 'no',
  spokenLanguages: [{ language: 'English', level: 'native' }],
  salaryFloor: {
    amount: 185000,
    currency: 'USD',
    period: 'year',
  },
  acceptedEmploymentTypes: ['full-time'],
  importance: {
    location: 'important',
    workPermits: 'dealbreaker',
    languages: 'important',
    salary: 'important',
    employmentType: 'nice-to-know',
  },
};


// ============================================================================
// 3. SENTENCE SEGMENTATION & BILINGUAL RULE ENGINE (EN + FR)
// ============================================================================

export interface SentenceSpan {
  text: string;
  startOffset: number;
  endOffset: number;
}

/**
 * Splits a job posting into individual sentences/lines with exact character offsets.
 */
export function splitSentencesWithOffsets(rawPosting: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  if (!rawPosting) return spans;

  const lineRegex = /[^\r\n]+/g;
  let lineMatch: RegExpExecArray | null = lineRegex.exec(rawPosting);

  while (lineMatch !== null) {
    const lineText = lineMatch[0];
    const lineStart = lineMatch.index;

    // Split line into sentences on punctuation followed by space + capital, while avoiding common abbreviations
    const sentenceParts = lineText.match(/[^.!?;]+[.!?;]?/g) ?? [lineText];
    let localPos = 0;

    for (const part of sentenceParts) {
      const idxInLine = lineText.indexOf(part, localPos);
      const start = lineStart + (idxInLine >= 0 ? idxInLine : localPos);
      const trimmed = part.trim();
      if (trimmed.length > 0) {
        const leadingWs = part.indexOf(trimmed);
        const exactStart = start + (leadingWs >= 0 ? leadingWs : 0);
        spans.push({
          text: trimmed,
          startOffset: exactStart,
          endOffset: exactStart + trimmed.length,
        });
      }
      localPos = (idxInLine >= 0 ? idxInLine : localPos) + part.length;
    }

    lineMatch = lineRegex.exec(rawPosting);
  }

  return spans;
}

function buildSnippetWindow(
  sentences: SentenceSpan[],
  hitIndices: number[],
  maxChars = 750,
): string {
  if (hitIndices.length === 0) return '';
  const selectedIndices = new Set<number>();
  for (const idx of hitIndices) {
    if (idx > 0) selectedIndices.add(idx - 1);
    selectedIndices.add(idx);
    if (idx + 1 < sentences.length) selectedIndices.add(idx + 1);
  }
  const ordered = Array.from(selectedIndices)
    .sort((a, b) => a - b)
    .map((i) => sentences[i].text);
  return ordered.join(' ').slice(0, maxChars);
}

const US_STATE_CODES = new Set([
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY', 'DC',
]);

const CA_PROVINCE_CODES = new Set([
  'ON', 'QC', 'BC', 'AB', 'MB', 'SK', 'NS', 'NB', 'NL', 'PE',
]);

function extractLocationsFromSentence(sentence: string): Array<{
  city: string;
  region?: string;
  country: string;
  metroId?: string;
}> {
  const results: Array<{
    city: string;
    region?: string;
    country: string;
    metroId?: string;
  }> = [];
  const seen = new Set<string>();

  // 1. Check known metro areas first
  for (const metro of METRO_AREAS) {
    for (const alias of metro.aliases) {
      const escaped = alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const rx = new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, 'iu');
      if (rx.test(sentence)) {
        const key = metro.id;
        if (!seen.has(key)) {
          seen.add(key);
          const cityName =
            alias.length <= 3
              ? metro.label.replace(/\s+(?:Bay Area|Metro|Area)$/i, '').replace(/^Greater\s+/i, '')
              : alias
                  .split(/\s+/)
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ');
          results.push({
            city: cityName,
            region: metro.region,
            country: metro.country,
            metroId: metro.id,
          });
        }
      }
    }
  }

  // 2. Check City, ST patterns (e.g., "Denver, CO" or "Calgary, AB")
  const cityStateRegex = /\b([A-Z][a-zA-Zéèêà.-]+(?:\s+[A-Z][a-zA-Zéèêà.-]+)?),\s*([A-Z]{2})\b/g;
  let m: RegExpExecArray | null = cityStateRegex.exec(sentence);
  while (m !== null) {
    const city = m[1].trim();
    const state = m[2].trim();
    const metro = findMetroAreaEntry(`${city}, ${state}`);
    const key = metro?.id ?? `${city.toLowerCase()}-${state.toLowerCase()}`;
    if (!seen.has(key)) {
      if (US_STATE_CODES.has(state)) {
        seen.add(key);
        results.push({
          city,
          region: state,
          country: 'United States',
          metroId: metro?.id,
        });
      } else if (CA_PROVINCE_CODES.has(state)) {
        seen.add(key);
        results.push({
          city,
          region: state,
          country: 'Canada',
          metroId: metro?.id,
        });
      }
    }
    m = cityStateRegex.exec(sentence);
  }

  return results;
}

export type JobFactsWithSelf = JobFacts & { facts: JobFacts };

/**
 * Extracts all 5 Job facts deterministically using bilingual (EN + FR) rules,
 * negation windows, hedge rules, and exact verbatim evidence offsets.
 */
export function extractJobFactsByRules(rawPosting: string): JobFactsWithSelf {
  const sentences = splitSentencesWithOffsets(rawPosting);

  // --------------------------------------------------------------------------
  // FACT 1: LOCATION & WORK MODE
  // --------------------------------------------------------------------------
  const locationEvidences: FactEvidence[] = [];
  const locationHitIndices: number[] = [];
  const extractedLocations: Array<{
    city: string;
    region?: string;
    country: string;
    metroId?: string;
  }> = [];
  const seenLocKeys = new Set<string>();

  const detectedModes = new Set<'remote' | 'hybrid' | 'on-site'>();
  let officeDays: number | undefined;
  const eligibleCountries = new Set<string>();
  const eligibleRegions = new Set<string>();
  const eligibleTimeZones = new Set<string>();
  let excludedRemoteCountry: string | undefined;

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const txt = s.text;
    const lower = txt.toLowerCase();
    let hit = false;

    // Header line location parser: "Location: ..." / "Lieu : ..." / "Based in ..."
    const isHeaderLoc =
      /^(?:location|lieu|localisation|office|workplace|based in|bas[ée]\s+[àa])\s*[:\-–]?/i.test(
        txt,
      );

    // Work mode detection with negation handling
    const hasNotRemote =
      /\b(?:not\s+(?:a\s+)?remote|no\s+remote|non[\s-]remote|cannot\s+be\s+performed\s+remotely|pas\s+de\s+t[ée]l[ée]travail|aucun\s+t[ée]l[ée]travail|t[ée]l[ée]travail\s+non\s+possible)\b/i.test(
        lower,
      );

    if (hasNotRemote) {
      detectedModes.add('on-site');
      hit = true;
    } else {
      // Hybrid patterns (EN + FR)
      const isHybrid =
        /\b(?:hybrid|hybride|t[ée]l[ée]travail\s+partiel|\d\s*(?:days?|jours?)\s*(?:per\s+week|a\s+week|par\s+semaine|\/semaine)?\s*(?:in[\s-]office|on[\s-]site|au\s+bureau|sur\s+site|de\s+t[ée]l[ée]travail))\b/i.test(
          lower,
        );
      if (isHybrid) {
        detectedModes.add('hybrid');
        hit = true;
      }

      // Office days count
      const daysInOfficeMatch = lower.match(
        /\b([1-5])\s*(?:days?|jours?)\s*(?:per\s+week|a\s+week|par\s+semaine|\/semaine|\/wk)?\s*(?:in\s+(?:the\s+)?office|in-office|on-site|onsite|au\s+bureau|sur\s+site|en\s+pr[ée]sentiel)\b/i,
      );
      if (daysInOfficeMatch) {
        officeDays = Number(daysInOfficeMatch[1]);
        detectedModes.add('hybrid');
        hit = true;
      }

      // Remote patterns (EN + FR)
      const isRemote =
        /\b(?:100%\s*remote|fully\s+remote|remote[\s-]first|work\s+from\s+anywhere|remote\s+(?:in|within|across|eligible|position|role|opportunity)|location\s*:\s*remote|t[ée]l[ée]travail\s+(?:complet|100%|int[ée]gral)|100%\s*t[ée]l[ée]travail|full\s+remote)\b/i.test(
          lower,
        ) ||
        (isHeaderLoc && /\b(?:remote|t[ée]l[ée]travail)\b/i.test(lower) && !isHybrid);
      if (isRemote) {
        detectedModes.add('remote');
        hit = true;
      }

      // On-site patterns (EN + FR)
      const isOnsite =
        /\b(?:on-site\s+only|onsite\s+only|100%\s*on-?site|on-?site\s+(?:role|position|at\s+our|in\s+our)|in-office\s+role|in-person\s+role|5\s+days\s+(?:in\s+office|on-site)|sur\s+site\s+uniquement|100%\s*pr[ée]sentiel|poste\s+(?:100%\s*)?(?:en\s+)?pr[ée]sentiel)\b/i.test(
          lower,
        ) ||
        (isHeaderLoc && /\b(?:on-site|onsite|sur\s+site|pr[ée]sentiel)\b/i.test(lower) && !isHybrid);
      if (isOnsite) {
        detectedModes.add('on-site');
        hit = true;
      }
    }

    // Remote eligibility countries / timezones
    if (
      /\b(?:remote|t[ée]l[ée]travail|based\s+in|located\s+in|residing\s+in|eligible\s+to\s+work\s+remotely\s+from)\b/i.test(
        lower,
      )
    ) {
      if (/\b(?:us\s+only|usa\s+only|united\s+states\s+only|within\s+the\s+(?:us|usa|united\s+states)|anywhere\s+in\s+the\s+(?:us|usa|united\s+states)|remote\s*\(\s*(?:us|usa|united\s+states)\s*\)|aux\s+[ée]tats-unis\s+uniquement)\b/i.test(lower)) {
        eligibleCountries.add('United States');
        eligibleRegions.add('US');
        hit = true;
      }
      if (/\b(?:canada\s+only|within\s+canada|in\s+canada|remote\s*\(\s*canada\s*\)|au\s+canada\s+uniquement)\b/i.test(lower)) {
        eligibleCountries.add('Canada');
        eligibleRegions.add('Canada');
        hit = true;
      }
      if (/\b(?:us\s+(?:or|and|&|\/)\s+canada|north\s+america|united\s+states\s+and\s+canada)\b/i.test(lower)) {
        eligibleCountries.add('United States');
        eligibleCountries.add('Canada');
        eligibleRegions.add('US');
        eligibleRegions.add('Canada');
        hit = true;
      }
      if (/\b(?:uk\s+only|united\s+kingdom\s+only|within\s+the\s+uk|remote\s*\(\s*uk\s*\))\b/i.test(lower)) {
        eligibleCountries.add('United Kingdom');
        eligibleRegions.add('UK');
        hit = true;
      }
      if (/\b(?:france\s+only|en\s+france|remote\s*\(\s*france\s*\)|t[ée]l[ée]travail\s+en\s+france)\b/i.test(lower)) {
        eligibleCountries.add('France');
        eligibleRegions.add('France');
        hit = true;
      }
      if (/\b(?:eu\s+only|eu\s+time\s*zones?|within\s+eu|european\s+union|within\s+europe|emea)\b/i.test(lower)) {
        eligibleRegions.add('EU / EMEA');
        eligibleRegions.add('EU');
        hit = true;
      }
      const tzMatch = txt.match(/\b(UTC[+-]\d+|GMT[+-]\d+|EST|PST|CST|MST|CET|BST|PT|ET)\b/g);
      if (tzMatch) {
        tzMatch.forEach((tz) => eligibleTimeZones.add(tz));
      }
      if (/\b(?:outside\s+the\s+us|not\s+eligible\s+in\s+canada)\b/i.test(lower)) {
        excludedRemoteCountry = 'excluded';
      }
    }

    // Extract city/metro locations when on a location header or workplace sentence
    if (
      isHeaderLoc ||
      hit ||
      /\b(?:office\s+in|based\s+in|located\s+in|headquartered\s+in|work\s+from\s+our|nos\s+bureaux\s+[àa]|bas[ée]\s+[àa]|situ[ée]\s+[àa])\b/i.test(
        lower,
      )
    ) {
      const locs = extractLocationsFromSentence(txt);
      for (const l of locs) {
        const key = l.metroId ?? `${l.city.toLowerCase()}-${l.country.toLowerCase()}`;
        if (!seenLocKeys.has(key)) {
          seenLocKeys.add(key);
          extractedLocations.push(l);
          hit = true;
        }
      }
    }

    if (hit) {
      locationEvidences.push({
        quote: s.text,
        startOffset: s.startOffset,
        endOffset: s.endOffset,
      });
      locationHitIndices.push(i);
    }
  }

  let resolvedWorkMode: WorkModeValue = 'unspecified';
  let locationConfidence: FactConfidence = 'high';
  if (detectedModes.size > 1) {
    // e.g. both hybrid and remote mentioned or conflicting modes
    resolvedWorkMode = detectedModes.has('hybrid')
      ? 'hybrid'
      : detectedModes.has('remote')
        ? 'remote'
        : 'on-site';
    if (detectedModes.has('remote') && detectedModes.has('on-site')) {
      locationConfidence = 'review';
    }
  } else if (detectedModes.size === 1) {
    resolvedWorkMode = Array.from(detectedModes)[0];
  } else if (extractedLocations.length > 0) {
    resolvedWorkMode = 'unspecified';
  }

  // Trigger snippet for LLM when location/remote/relocation trigger words appear without clear workMode
  let locationTriggerSnippet: string | undefined;
  if (
    resolvedWorkMode === 'unspecified' ||
    locationConfidence === 'review' ||
    Boolean(excludedRemoteCountry)
  ) {
    const triggerIndices: number[] = [];
    for (let i = 0; i < sentences.length; i++) {
      if (
        /\b(?:remote|hybrid|on-?site|in-office|relocat|t[ée]l[ée]travail|hybride|pr[ée]sentiel|d[ée]m[ée]nage)\b/i.test(
          sentences[i].text,
        )
      ) {
        triggerIndices.push(i);
      }
    }
    if (triggerIndices.length > 0) {
      locationConfidence = 'review';
      locationTriggerSnippet = buildSnippetWindow(sentences, triggerIndices);
    }
  }

  // --------------------------------------------------------------------------
  // FACT 2: WORK PERMITS & SPONSORSHIP
  // --------------------------------------------------------------------------
  const permitEvidences: FactEvidence[] = [];
  const permitHitIndices: number[] = [];
  const detectedPrograms = new Set<string>();
  let authorizationRequired = false;
  let citizenshipRequired = false;
  let clearanceRequired = false;
  const sponsorshipVotes = new Set<'yes' | 'no' | 'conditional'>();

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const txt = s.text;
    const lower = txt.toLowerCase();
    let hit = false;

    for (const prog of WORK_PERMIT_PROGRAMS) {
      if (prog.patterns.some((p) => p.test(txt))) {
        detectedPrograms.add(prog.name);
        hit = true;
      }
    }

    // Citizenship / Security clearance (EN + FR)
    if (
      /\b(?:u\.?s\.?\s+citizenship\s+(?:is\s+)?required|must\s+be\s+a\s+(?:u\.?s\.?|canadian|french|uk)\s+citizen|citizenship\s+required|nationalit[ée]\s+fran[çc]aise\s+(?:requise|exig[ée]e)|citoyennet[ée]\s+(?:requise|exig[ée]e))\b/i.test(
        lower,
      )
    ) {
      citizenshipRequired = true;
      authorizationRequired = true;
      sponsorshipVotes.add('no');
      hit = true;
    }

    if (
      /\b(?:security\s+clearance|secret\s+clearance|ts\/sci|top\s+secret|habilitation\s+(?:secret\s+)?d[ée]fense|cote\s+de\s+s[ée]curit[ée])\b/i.test(
        lower,
      )
    ) {
      clearanceRequired = true;
      hit = true;
    }

    // Work authorization required (EN + FR)
    if (
      /\b(?:legally\s+authorized\s+to\s+work|authorized\s+to\s+work\s+in|right\s+to\s+work\s+in|eligible\s+to\s+work\s+in|valid\s+work\s+permit|autoris[ée]\s+[àa]\s+travailler|autorisation\s+de\s+travail|permis\s+de\s+travail\s+valide|droit\s+de\s+travailler)\b/i.test(
        lower,
      )
    ) {
      authorizationRequired = true;
      hit = true;
    }

    // Sponsorship rules: check Negative, Conditional/Hedge, and Affirmative (EN + FR)
    const mentionsSponsorOrVisa =
      /\b(?:sponsor(?:ship|ing)?|visa|h-?1b|lmia|eimt|parrain(?:age|er)|permis\s+de\s+travail)\b/i.test(
        lower,
      );

    if (mentionsSponsorOrVisa) {
      const isNegative =
        /\b(?:no\s+(?:visa\s+)?sponsorship|not\s+(?:able\s+to\s+|currently\s+)?sponsor|cannot\s+(?:provide\s+|offer\s+)?(?:visa\s+)?sponsor|unable\s+to\s+(?:provide\s+|offer\s+)?(?:visa\s+|h-?1b\s+)?sponsor|do\s+not\s+(?:provide\s+|offer\s+)?(?:visa\s+)?sponsor|does\s+not\s+sponsor|without\s+(?:company\s+|visa\s+)?sponsorship|sponsorship\s+is\s+not\s+available|not\s+eligible\s+for\s+(?:visa\s+)?sponsorship|ne\s+parrain(?:ons|e)\s+pas|aucun\s+parrainage|pas\s+de\s+parrainage|sans\s+parrainage|incapable\s+de\s+parrainer)\b/i.test(
          lower,
        );

      const isConditional =
        /\b(?:may\s+(?:provide\s+|offer\s+|consider\s+|be\s+considered)|case[\s-]by[\s-]case|for\s+(?:select|senior|staff|principal)\s+(?:roles|positions)|sponsorship\s+available\s+for\s+(?:senior|select|staff)|H-?1B\s+transfer\s+only|transfer\s+of\s+existing\s+visa|au\s+cas\s+par\s+cas|selon\s+le\s+profil|pour\s+certains\s+postes|parrainage\s+possible\s+sous\s+conditions)\b/i.test(
          lower,
        );

      const isAffirmative =
        !isNegative &&
        !isConditional &&
        /\b(?:visa\s+sponsorship\s+(?:is\s+)?(?:available|provided|offered|supported)|we\s+(?:provide|offer|support|will)\s+(?:visa\s+|work\s+permit\s+|h-?1b\s+)?sponsor|sponsorship\s+available|open\s+to\s+sponsoring|willing\s+to\s+sponsor|parrainage\s+(?:de\s+visa\s+|visa\s+)?(?:\([^)]*\)\s*)?(?:disponible|offert|pris\s+en\s+charge)|nous\s+parrainons|prise\s+en\s+charge\s+du\s+visa)\b/i.test(
          lower,
        );

      if (isConditional) {
        sponsorshipVotes.add('conditional');
        hit = true;
      } else if (isNegative) {
        sponsorshipVotes.add('no');
        hit = true;
      } else if (isAffirmative) {
        sponsorshipVotes.add('yes');
        hit = true;
      }
    }

    if (hit) {
      permitEvidences.push({
        quote: s.text,
        startOffset: s.startOffset,
        endOffset: s.endOffset,
      });
      permitHitIndices.push(i);
    }
  }

  let resolvedSponsorship: SponsorshipValue = 'not-stated';
  let permitConfidence: FactConfidence = 'high';

  if (sponsorshipVotes.size > 1) {
    // Conflicting evidence (e.g., "yes" and "no") -> conditional + review
    resolvedSponsorship = 'conditional';
    permitConfidence = 'review';
  } else if (sponsorshipVotes.size === 1) {
    resolvedSponsorship = Array.from(sponsorshipVotes)[0];
    if (resolvedSponsorship === 'conditional') {
      permitConfidence = 'review';
    }
  }

  let permitTriggerSnippet: string | undefined;
  if (resolvedSponsorship === 'not-stated' || permitConfidence === 'review') {
    const triggerIndices: number[] = [];
    for (let i = 0; i < sentences.length; i++) {
      if (
        /\b(?:visa|sponsor|authorized|authorisation|permit|right\s+to\s+work|citizenship|clearance|parrainage|permis\s+de\s+travail|autoris[ée])\b/i.test(
          sentences[i].text,
        )
      ) {
        triggerIndices.push(i);
      }
    }
    if (triggerIndices.length > 0) {
      permitConfidence = 'review';
      permitTriggerSnippet = buildSnippetWindow(sentences, triggerIndices);
    }
  }

  // --------------------------------------------------------------------------
  // FACT 3: LANGUAGES (EN + FR)
  // --------------------------------------------------------------------------
  const langEvidences: FactEvidence[] = [];
  const requiredLangs: Array<{ language: string; level?: string }> = [];
  const niceToHaveLangs: Array<{ language: string; level?: string }> = [];
  const seenReqLangs = new Set<string>();
  const seenNiceLangs = new Set<string>();

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const txt = s.text;
    const lower = txt.toLowerCase();
    let hit = false;

    // Explicit bilingual EN/FR requirement
    if (
      /\b(?:bilingual\s+(?:in\s+)?(?:english\s+and\s+french|french\s+and\s+english|en\/fr|fr\/en)|bilingue\s+(?:fran[çc]ais\s+et\s+anglais|anglais\s+et\s+fran[çc]ais|fr\/en|en\/fr))\b/i.test(
        lower,
      )
    ) {
      const isNice =
        /\b(?:nice\s+to\s+have|bonus|plus|preferred|asset|atout|souhait[ée]|un\s+plus)\b/i.test(
          lower,
        );
      for (const lName of ['English', 'French']) {
        if (isNice) {
          if (!seenNiceLangs.has(lName) && !seenReqLangs.has(lName)) {
            seenNiceLangs.add(lName);
            niceToHaveLangs.push({ language: lName, level: 'fluent' });
          }
        } else if (!seenReqLangs.has(lName)) {
          seenReqLangs.add(lName);
          requiredLangs.push({ language: lName, level: 'fluent' });
        }
      }
      hit = true;
    }

    for (const lang of KNOWN_LANGUAGES) {
      const aliasGroup = lang.aliases.join('|');
      // Only match when paired with proficiency / requirement context so we don't mistake "French fries" or random words
      const contextRegex = new RegExp(
        `(?:\\b(?:fluent|fluency|proficiency|proficient|native|bilingual|written\\s+and\\s+spoken|spoken\\s+and\\s+written|strong\\s+command|working\\s+knowledge|courant|bilingue|ma[îi]trise|parl[ée]\\s+et\\s+[ée]crit|langue|language|c1|c2|b2)[^.]{0,45}\\b(?:${aliasGroup})\\b|\\b(?:${aliasGroup})\\b[^.]{0,45}\\b(?:fluent|fluency|proficiency|proficient|native|required|mandatory|must\\s+speak|written\\s+and\\s+spoken|spoken\\s+and\\s+written|nice\\s+to\\s+have|preferred|asset|plus|courant|requis|obligatoire|exig[ée]|parl[ée]\\s+et\\s+[ée]crit|atout|souhait[ée]|c1|c2|b2)\\b)`,
        'i',
      );

      if (contextRegex.test(txt)) {
        const isNice =
          /\b(?:nice\s+to\s+have|bonus|plus|preferred|asset|atout|un\s+plus|idéalement)\b/i.test(
            lower,
          );
        const localWin =
          txt
            .match(
              new RegExp(`(.{0,32}\\b(?:${aliasGroup})\\b.{0,32})`, 'i'),
            )?.[1]
            ?.toLowerCase() ?? lower;
        let level: string | undefined;
        if (/\b(?:native|maternelle|c2)\b/i.test(localWin)) level = 'native';
        else if (/\b(?:fluent|fluency|courant|bilingue|c1)\b/i.test(localWin))
          level = 'fluent';
        else if (
          /\b(?:professional|working|working\s+proficiency|professionnel|b2)\b/i.test(
            localWin,
          )
        )
          level = 'working';
        else if (/\b(?:conversational|interm[ée]diaire|b1)\b/i.test(localWin))
          level = 'conversational';
        else if (/\b(?:native|maternelle|c2)\b/i.test(lower)) level = 'native';
        else if (/\b(?:fluent|fluency|courant|bilingue|c1)\b/i.test(lower))
          level = 'fluent';
        else if (
          /\b(?:professional|working|working\s+proficiency|professionnel|b2)\b/i.test(
            lower,
          )
        )
          level = 'working';

        if (isNice) {
          if (!seenNiceLangs.has(lang.label) && !seenReqLangs.has(lang.label)) {
            seenNiceLangs.add(lang.label);
            niceToHaveLangs.push({ language: lang.label, level });
          }
        } else {
          if (!seenReqLangs.has(lang.label)) {
            seenReqLangs.add(lang.label);
            requiredLangs.push({ language: lang.label, level });
          }
        }
        hit = true;
      }
    }

    if (hit) {
      langEvidences.push({
        quote: s.text,
        startOffset: s.startOffset,
        endOffset: s.endOffset,
      });
    }
  }

  // --------------------------------------------------------------------------
  // FACT 4: SALARY (RULES ONLY, NO LLM)
  // --------------------------------------------------------------------------
  const salaryEvidences: FactEvidence[] = [];
  let salaryMin: number | undefined;
  let salaryMax: number | undefined;
  let salaryCurrency: string | undefined;
  let salaryPeriod: 'year' | 'month' | 'day' | 'hour' | 'unspecified' = 'unspecified';

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const txt = s.text;
    const lower = txt.toLowerCase();

    // Avoid matching revenue/scale metrics like "$2.8B in annual volume" or "$50M Series B"
    if (
      /\b(?:series\s+[a-f]|funding|valuation|revenue|arr|volume|raised|budget|egress\s+spend|chiffre\s+d'affaires)\b/i.test(
        lower,
      ) &&
      !/\b(?:salary|compensation|pay\s+range|base\s+pay|salaire|r[ée]mun[ée]ration)\b/i.test(
        lower,
      )
    ) {
      continue;
    }

    // Match range patterns like "$180,000 - $220,000", "CAD $150k–$180k", "85 000 € à 105 000 €", "€90k - €110k", "$85/hr - $105/hr", "650€ - 750€ / jour"
    const rangeRegex =
      /(?:(USD|CAD|EUR|GBP|CHF)\s*)?([$€£])?\s*(\d{2,3}(?:[,\s]\d{3})+|\d{2,3}(?:\.\d+)?\s*[kK]?)\s*(?:([$€£]|EUR|USD|CAD|GBP|CHF))?\s*(?:-|–|—|to|[àa])\s*(?:(USD|CAD|EUR|GBP|CHF)\s*)?([$€£])?\s*(\d{2,3}(?:[,\s]\d{3})+|\d{2,3}(?:\.\d+)?\s*[kK]?)\s*(EUR|USD|CAD|GBP|CHF|[€$£])?/i;

    const match = txt.match(rangeRegex);
    if (match) {
      const hasSalaryCue =
        Boolean(match[1] || match[2] || match[4] || match[5] || match[6] || match[8]) &&
        (/\b(?:salary|compensation|base|pay|range|package|rate|tarif|per\s+year|annually|\/yr|\/hr|per\s+hour|hourly|per\s+day|daily|\/day|par\s+jour|\/\s*jour|tjm|salaire|r[ée]mun[ée]ration|annuel|brut|an)\b/i.test(
          lower,
        ) ||
          /[kK]\b/.test(match[3]) ||
          /[kK]\b/.test(match[7]) ||
          /\d{2,3}[,\s]\d{3}/.test(match[3]));

      if (hasSalaryCue) {
        const parseAmount = (rawNum: string, fallbackHasK: boolean): number => {
          const clean = rawNum.trim();
          const hasK = /[kK]$/i.test(clean) || fallbackHasK;
          const numeric = parseFloat(clean.replace(/[kK,\s]/g, ''));
          if (Number.isNaN(numeric)) return 0;
          return hasK && numeric < 1000 ? Math.round(numeric * 1000) : Math.round(numeric);
        };

        const secondHasK = /[kK]$/i.test(match[7].trim());
        const n1 = parseAmount(match[3], secondHasK);
        const n2 = parseAmount(match[7], false);

        if (n1 > 15 && n2 >= n1) {
          salaryMin = n1;
          salaryMax = n2;
          const rawCurr =
            match[1] || match[5] || match[8] || match[4] || match[2] || match[6] || '$';
          const upCurr = rawCurr.toUpperCase();
          if (upCurr === 'CAD' || /\bcad\b/i.test(txt)) salaryCurrency = 'CAD';
          else if (upCurr === 'EUR' || upCurr === '€') salaryCurrency = 'EUR';
          else if (upCurr === 'GBP' || upCurr === '£') salaryCurrency = 'GBP';
          else if (upCurr === 'CHF') salaryCurrency = 'CHF';
          else salaryCurrency = 'USD';

          if (
            /\b(?:per\s+day|daily|\/day|par\s+jour|\/\s*jour|tjm|journalier)\b/i.test(
              lower,
            )
          ) {
            salaryPeriod = 'day';
          } else if (
            /\b(?:per\s+hour|hourly|\/hr|\/h|de\s+l'heure|horaire)\b/i.test(
              lower,
            ) ||
            n2 <= 400
          ) {
            salaryPeriod = 'hour';
          } else if (
            /\b(?:per\s+month|monthly|\/mo|par\s+mois|mensuel)\b/i.test(lower)
          ) {
            salaryPeriod = 'month';
          } else {
            salaryPeriod = 'year';
          }

          salaryEvidences.push({
            quote: s.text,
            startOffset: s.startOffset,
            endOffset: s.endOffset,
          });
          break;
        }
      }
    }
  }

  // --------------------------------------------------------------------------
  // FACT 5: EMPLOYMENT TYPE (EN + FR)
  // --------------------------------------------------------------------------
  const empEvidences: FactEvidence[] = [];
  const empHitIndices: number[] = [];
  const empVotes = new Set<EmploymentTypeValue>();

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const txt = s.text;
    const lower = txt.toLowerCase();
    let hit = false;

    if (
      /\b(?:apprenticeship|alternance|contrat\s+d['’]apprentissage|apprentissage)\b/i.test(
        lower,
      )
    ) {
      empVotes.add('apprenticeship');
      hit = true;
    } else if (
      /\b(?:internship|intern\s+role|summer\s+intern|co-op|stage\s+de\s+fin\s+d['’][ée]tudes|stagiaire)\b/i.test(
        lower,
      )
    ) {
      empVotes.add('internship');
      hit = true;
    }
    if (
      /\b(?:fixed-term\s+contract|fixed-term|cdd|contrat\s+[àa]\s+dur[ée]e\s+d[ée]termin[ée]e)\b/i.test(
        lower,
      )
    ) {
      empVotes.add('fixed-term');
      hit = true;
    } else if (
      /\b(?:independent\s+contractor|contractor|freelance|b2b\s+contractor|1099\s+contractor|1099\s+contract|6-month\s+contract|12-month\s+contract|contract\s+role|contract\s+position|prestataire|pigiste|ind[ée]pendant|contrat\s+de\s+\d+\s+mois)\b/i.test(
        lower,
      )
    ) {
      empVotes.add('contract');
      hit = true;
    }
    if (
      /\b(?:temporary\s+(?:role|position|employment)|maternity\s+cover|remplacement\s+temporaire|int[ée]rim)\b/i.test(
        lower,
      )
    ) {
      empVotes.add('temporary');
      hit = true;
    }
    if (/\b(?:part-time|part\s+time|temps\s+partiel|mi-temps)\b/i.test(lower)) {
      empVotes.add('part-time');
      hit = true;
    }
    if (
      /\b(?:full-time|full\s+time|permanent\s+full-time|cdi|temps\s+plein|poste\s+permanent)\b/i.test(
        lower,
      )
    ) {
      empVotes.add('full-time');
      hit = true;
    }

    if (hit) {
      empEvidences.push({
        quote: s.text,
        startOffset: s.startOffset,
        endOffset: s.endOffset,
      });
      empHitIndices.push(i);
    }
  }

  let resolvedEmpType: EmploymentTypeValue = 'not-stated';
  let empConfidence: FactConfidence = 'high';
  if (empVotes.size === 1) {
    resolvedEmpType = Array.from(empVotes)[0];
  } else if (empVotes.size > 1) {
    resolvedEmpType = Array.from(empVotes)[0];
    empConfidence = 'review';
  }

  const resolvedModeAlias: 'remote' | 'hybrid' | 'onsite' | 'not-stated' =
    resolvedWorkMode === 'on-site'
      ? 'onsite'
      : resolvedWorkMode === 'unspecified'
        ? 'not-stated'
        : resolvedWorkMode;

  const resolvedPolicyAlias:
    | 'sponsors'
    | 'no-sponsorship'
    | 'conditional'
    | 'citizenship-or-clearance-required'
    | 'not-stated' =
    citizenshipRequired || clearanceRequired
      ? 'citizenship-or-clearance-required'
      : resolvedSponsorship === 'yes'
        ? 'sponsors'
        : resolvedSponsorship === 'no'
          ? 'no-sponsorship'
          : resolvedSponsorship === 'conditional'
            ? 'conditional'
            : 'not-stated';

  const result: JobFacts = {
    location: {
      value: {
        locations: extractedLocations,
        cities: extractedLocations.map((l) => l.city),
        workMode: resolvedWorkMode,
        mode: resolvedModeAlias,
        officeDays,
        daysInOffice: officeDays,
        remoteRegions: Array.from(eligibleRegions),
        remoteEligibility:
          eligibleCountries.size > 0 ||
          eligibleRegions.size > 0 ||
          eligibleTimeZones.size > 0
            ? {
                countries: Array.from(eligibleCountries),
                regions: Array.from(eligibleRegions),
                timeZones: Array.from(eligibleTimeZones),
              }
            : undefined,
      },
      confidence: locationConfidence,
      evidence: locationEvidences,
      source: 'rules',
      triggerSnippet: locationTriggerSnippet,
    },
    workPermits: {
      value: {
        sponsorship: resolvedSponsorship,
        policy: resolvedPolicyAlias,
        authorizationRequired,
        programs: Array.from(detectedPrograms),
        citizenshipRequired: citizenshipRequired || undefined,
        clearanceRequired: clearanceRequired || undefined,
        clearance: clearanceRequired || undefined,
      },
      confidence: permitConfidence,
      evidence: permitEvidences,
      source: 'rules',
      triggerSnippet: permitTriggerSnippet,
    },
    languages: {
      value: {
        required: requiredLangs,
        niceToHave: niceToHaveLangs,
      },
      confidence: 'high',
      evidence: langEvidences,
      source: 'rules',
    },
    salary: {
      value: {
        min: salaryMin,
        max: salaryMax,
        currency: salaryCurrency,
        period: salaryMin !== undefined ? salaryPeriod : undefined,
        stated: salaryMin !== undefined && salaryMax !== undefined,
      },
      confidence: 'high',
      evidence: salaryEvidences,
      source: 'rules',
    },
    employmentType: {
      value: {
        type: resolvedEmpType,
      },
      confidence: empConfidence,
      evidence: empEvidences,
      source: 'rules',
    },
  };

  Object.defineProperty(result, 'facts', {
    value: result,
    enumerable: false,
    configurable: true,
  });

  return result as JobFactsWithSelf;
}

// ============================================================================
// 4. PRACTICAL FIT EVALUATION (`evaluateFit`, PURE)
// ============================================================================

export type PracticalFitStatus = 'fits' | 'conflict' | 'not-stated';

export interface EvaluatedFactItem {
  key: string;
  label: string;
  shortLabel: string;
  icon: FactIconName;
  valueSummary: string;
  valueLabel: string;
  shortChipLabel: string;
  salientPillLabel: string;
  status: PracticalFitStatus;
  fit: PracticalFitStatus;
  statusCopy: 'Fits' | 'Conflict' | 'Not stated';
  importance: FactImportance;
  salience: FactSalience;
  reason: string;
  confidence: FactConfidence;
  source: FactSource;
  sourceTooltip: string;
  evidence: FactEvidence[];
  evidenceQuotes: string[];
  canCopyRecruiterQuestion: boolean;
  canAskRecruiter: boolean;
}

export interface PracticalFitEvaluation {
  hasPreferences: boolean;
  items: EvaluatedFactItem[] & Record<JobFactKey, EvaluatedFactItem>;
  byFact: Record<JobFactKey, EvaluatedFactItem>;
  orderedItems: EvaluatedFactItem[];
  needsALookItems: EvaluatedFactItem[];
  fittingItems: EvaluatedFactItem[];
  salientItems: EvaluatedFactItem[];
  fitsCount: number;
  conflictCount: number;
  notStatedCount: number;
  dealbreakerConflictCount: number;
  dealbreakerCount: number;
  criticalCount: number;
  flagCount: number;
  notableCount: number;
  isQuiet: boolean;
  fitStrip: FitStripSummary;
  attentionToken: RowAttentionToken | null;
  summaryLine: string;
  summaryLabel: string;
}

function formatMoneyCompact(amount: number, currency = 'USD'): string {
  const sym =
    currency === 'EUR'
      ? '€'
      : currency === 'GBP'
        ? '£'
        : currency === 'CAD'
          ? 'CA$'
          : '$';
  if (amount >= 1000) {
    const k = Math.round(amount / 1000);
    return `${sym}${k}k`;
  }
  return `${sym}${amount}`;
}

export type FlexibleUserPreferencesInput = Omit<
  UserPreferences,
  'homeLocation' | 'needsSponsorship' | 'salaryFloor'
> & {
  homeLocation:
    | string
    | {
        city: string;
        region?: string;
        country: string;
        metroId?: string;
        countryCode?: string;
      };
  needsSponsorship: boolean | 'yes' | 'no' | 'unspecified';
  salaryFloor?: {
    amount?: number;
    minAmount?: number;
    currency: string;
    period: 'year' | 'month' | 'hour';
  } | null;
};

/**
 * Pure evaluation of JobFacts against the user's local Preferences.
 * Preferences never touch any LLM prompt.
 */
export function evaluateFit(
  facts: JobFacts,
  rawPreferences: FlexibleUserPreferencesInput | UserPreferences | null,
): PracticalFitEvaluation {
  const normalizedHome =
    typeof rawPreferences?.homeLocation === 'string'
      ? (() => {
          const parts = rawPreferences.homeLocation
            .split(',')
            .map((p) => p.trim())
            .filter(Boolean);
          return {
            city: parts[0] ?? 'San Francisco',
            region: parts[1] ?? 'CA',
            country: parts[2] ?? 'United States',
          };
        })()
      : rawPreferences?.homeLocation
        ? {
            city: rawPreferences.homeLocation.city,
            region: rawPreferences.homeLocation.region ?? '',
            country: rawPreferences.homeLocation.country,
            metroId: rawPreferences.homeLocation.metroId,
            countryCode: rawPreferences.homeLocation.countryCode,
          }
        : null;

  const normalizedNeedsSponsorship: 'yes' | 'no' | 'unspecified' =
    typeof rawPreferences?.needsSponsorship === 'boolean'
      ? rawPreferences.needsSponsorship
        ? 'yes'
        : 'no'
      : (rawPreferences?.needsSponsorship ?? 'unspecified');

  const normalizedSalaryFloor = rawPreferences?.salaryFloor
    ? {
        amount:
          rawPreferences.salaryFloor.amount ??
          rawPreferences.salaryFloor.minAmount,
        currency: rawPreferences.salaryFloor.currency,
        period: rawPreferences.salaryFloor.period,
      }
    : undefined;

  const preferences: UserPreferences | null =
    rawPreferences && normalizedHome
      ? {
          ...rawPreferences,
          homeLocation: normalizedHome,
          needsSponsorship: normalizedNeedsSponsorship,
          salaryFloor: normalizedSalaryFloor,
        }
      : null;

  const hasPreferences = Boolean(
    preferences &&
      (preferences.homeLocation.country.trim() ||
        preferences.authorizedCountries.length > 0),
  );

  // 1. Location & work mode
  const locVal = facts.location.value;
  const modeLabel =
    locVal.workMode === 'remote'
      ? 'Remote'
      : locVal.workMode === 'hybrid'
        ? locVal.officeDays
          ? `Hybrid (${formatCount(locVal.officeDays, 'day')}/wk)`
          : 'Hybrid'
        : locVal.workMode === 'on-site'
          ? 'On-site'
          : 'Work mode not stated';
  const cityNames = locVal.locations.map((l) => l.city).join(', ');
  const eligCountries = locVal.remoteEligibility?.countries ?? [];
  const locSummary = cityNames
    ? `${modeLabel} · ${cityNames}`
    : eligCountries.length > 0
      ? `${modeLabel} (${eligCountries.join(', ')})`
      : modeLabel;

  let locStatus: PracticalFitStatus = 'not-stated';
  let locReason = 'Location or remote eligibility is not stated in the posting.';

  if (hasPreferences && preferences) {
    const userCountry = normalizeCountryName(preferences.homeLocation.country);
    const userMetro = findMetroAreaEntry(
      `${preferences.homeLocation.city} ${preferences.homeLocation.region}`,
    );

    if (
      locVal.workMode !== 'unspecified' &&
      !preferences.acceptedWorkModes.includes(locVal.workMode)
    ) {
      locStatus = 'conflict';
      locReason = `Posting is ${modeLabel.toLowerCase()}, which is not in your accepted work modes.`;
    } else if (locVal.workMode === 'remote') {
      if (eligCountries.length > 0) {
        const normalizedElig = eligCountries.map(normalizeCountryName);
        if (normalizedElig.includes(userCountry)) {
          locStatus = 'fits';
          locReason = `Remote role eligible in ${userCountry}.`;
        } else {
          locStatus = 'conflict';
          locReason = `Remote eligibility is restricted to ${eligCountries.join(', ')}.`;
        }
      } else if (locVal.locations.length > 0) {
        const matchesCountry = locVal.locations.some(
          (l) => normalizeCountryName(l.country) === userCountry,
        );
        if (matchesCountry) {
          locStatus = 'fits';
          locReason = `Remote role in ${userCountry}.`;
        } else {
          locStatus = 'not-stated';
          locReason = 'Remote country eligibility is not explicitly stated.';
        }
      } else {
        locStatus = 'not-stated';
        locReason = 'Remote country eligibility is not stated.';
      }
    } else if (locVal.workMode === 'hybrid' || locVal.workMode === 'on-site') {
      if (locVal.locations.length === 0) {
        locStatus = 'not-stated';
        locReason = 'Office city is not stated.';
      } else {
        const sameMetro = locVal.locations.some((l) => {
          if (userMetro && l.metroId) return l.metroId === userMetro.id;
          return (
            l.city.toLowerCase() ===
            preferences.homeLocation.city.trim().toLowerCase()
          );
        });
        if (sameMetro) {
          locStatus = 'fits';
          locReason = `In your home metro (${cityNames}).`;
        } else if (preferences.openToRelocation) {
          locStatus = 'not-stated';
          locReason = `Located in ${cityNames} (you marked open to relocation).`;
        } else {
          locStatus = 'conflict';
          locReason = `Located in ${cityNames}, outside your home metro.`;
        }
      }
    } else if (locVal.locations.length > 0) {
      const sameMetro = locVal.locations.some((l) => {
        if (userMetro && l.metroId) return l.metroId === userMetro.id;
        return (
          l.city.toLowerCase() ===
          preferences.homeLocation.city.trim().toLowerCase()
        );
      });
      if (sameMetro) {
        locStatus = 'fits';
        locReason = `Located in ${cityNames}.`;
      } else if (!preferences.openToRelocation && preferences.sameMetroOnly) {
        locStatus = 'conflict';
        locReason = `Located in ${cityNames}, outside your home metro.`;
      }
    }
  }

  // 2. Work permits
  const permVal = facts.workPermits.value;
  const sponsorshipLabel =
    permVal.sponsorship === 'yes'
      ? 'Sponsors work permits: Yes'
      : permVal.sponsorship === 'no'
        ? 'Sponsors work permits: No'
        : permVal.sponsorship === 'conditional'
          ? 'Sponsors work permits: Conditional'
          : 'Sponsors work permits: Not stated';
  const progSuffix =
    permVal.programs.length > 0 ? ` (${permVal.programs.join(', ')})` : '';
  const permSummary = `${sponsorshipLabel}${progSuffix}`;

  let permStatus: PracticalFitStatus = 'not-stated';
  let permReason = 'Work-permit sponsorship is not stated in the posting.';

  if (hasPreferences && preferences) {
    if (permVal.clearanceRequired && !preferences.holdsClearance) {
      permStatus = 'conflict';
      permReason = 'Requires a government security clearance not listed in your preferences.';
    } else if (
      permVal.citizenshipRequired &&
      preferences.citizenships.length === 0
    ) {
      permStatus = 'conflict';
      permReason = 'Requires citizenship not listed in your preferences.';
    } else if (preferences.needsSponsorship === 'yes') {
      if (permVal.sponsorship === 'no') {
        permStatus = 'conflict';
        permReason = 'You need work-permit sponsorship, and the posting states no sponsorship.';
      } else if (permVal.sponsorship === 'yes') {
        permStatus = 'fits';
        permReason = 'Posting states work-permit sponsorship is available.';
      } else if (permVal.sponsorship === 'conditional') {
        permStatus = 'not-stated';
        permReason = 'Sponsorship is conditional or case-by-case.';
      } else {
        permStatus = 'not-stated';
        permReason = 'Sponsorship policy is not stated.';
      }
    } else if (preferences.needsSponsorship === 'no') {
      // User is already authorized without sponsorship
      permStatus = 'fits';
      permReason = 'You do not require visa sponsorship.';
    }
  }

  // 3. Languages
  const langVal = facts.languages.value;
  const reqLangNames = langVal.required.map((l) =>
    l.level ? `${l.language} (${l.level})` : l.language,
  );
  const niceLangNames = langVal.niceToHave.map((l) => l.language);
  const langSummary =
    reqLangNames.length > 0
      ? `Required: ${reqLangNames.join(', ')}${niceLangNames.length > 0 ? ` · Plus: ${niceLangNames.join(', ')}` : ''}`
      : niceLangNames.length > 0
        ? `Nice to have: ${niceLangNames.join(', ')}`
        : 'Not stated';

  let langStatus: PracticalFitStatus = 'not-stated';
  let langReason = 'No specific language requirement is stated.';

  if (hasPreferences && preferences) {
    const spokenSet = new Set(
      preferences.spokenLanguages.map((l) => l.language.toLowerCase()),
    );
    const missingRequired = langVal.required.filter(
      (r) => !spokenSet.has(r.language.toLowerCase()),
    );
    const missingNice = langVal.niceToHave.filter(
      (r) => !spokenSet.has(r.language.toLowerCase()),
    );

    if (missingRequired.length > 0) {
      langStatus = 'conflict';
      langReason = `Requires ${missingRequired.map((m) => m.language).join(', ')}, which is not in your spoken languages.`;
    } else if (langVal.required.length > 0) {
      langStatus = 'fits';
      langReason = `You speak all required languages (${langVal.required.map((r) => r.language).join(', ')}).`;
    } else if (missingNice.length > 0) {
      langStatus = 'not-stated';
      langReason = `${missingNice.map((m) => m.language).join(', ')} is listed as nice to have.`;
    } else if (langVal.niceToHave.length > 0) {
      langStatus = 'fits';
      langReason = `You speak ${langVal.niceToHave.map((m) => m.language).join(', ')}.`;
    }
  }

  // 4. Salary
  const salVal = facts.salary.value;
  const salPeriodSuffix =
    salVal.period === 'hour'
      ? '/hr'
      : salVal.period === 'day'
        ? '/day'
        : salVal.period === 'month'
          ? '/mo'
          : '/yr';
  const salSummary =
    salVal.stated && salVal.min !== undefined && salVal.max !== undefined
      ? `${formatMoneyCompact(salVal.min, salVal.currency)}–${formatMoneyCompact(salVal.max, salVal.currency)}${salPeriodSuffix}`
      : 'Not stated';

  let salStatus: PracticalFitStatus = 'not-stated';
  let salReason = 'Salary range is not stated in the posting.';

  if (
    hasPreferences &&
    preferences?.salaryFloor?.amount &&
    salVal.stated &&
    salVal.max !== undefined
  ) {
    const floor = preferences.salaryFloor;
    const sameCurrency =
      (salVal.currency ?? 'USD').toUpperCase() === floor.currency.toUpperCase();
    const samePeriod = (salVal.period ?? 'year') === floor.period;

    if (sameCurrency && samePeriod) {
      const floorAmount = floor.amount ?? 0;
      if (salVal.max < floorAmount) {
        salStatus = 'conflict';
        salReason = `Posted maximum (${formatMoneyCompact(salVal.max, salVal.currency)}) is below your ${formatMoneyCompact(floorAmount, floor.currency)} floor.`;
      } else {
        salStatus = 'fits';
        salReason = `Posted range reaches ${formatMoneyCompact(salVal.max, salVal.currency)}, meeting your ${formatMoneyCompact(floorAmount, floor.currency)} floor.`;
      }
    } else {
      salStatus = 'not-stated';
      salReason = 'Posted salary uses a different currency or pay period than your floor.';
    }
  }

  // 5. Employment type
  const empVal = facts.employmentType.value;
  const empLabelMap: Record<EmploymentTypeValue, string> = {
    'full-time': 'Full-time',
    'part-time': 'Part-time',
    contract: 'Contract',
    'fixed-term': 'Fixed-term',
    internship: 'Internship',
    apprenticeship: 'Apprenticeship',
    temporary: 'Temporary',
    unspecified: 'Not stated',
    'not-stated': 'Not stated',
  };
  const empSummary = empLabelMap[empVal.type];
  let empStatus: PracticalFitStatus = 'not-stated';
  let empReason = 'Employment type is not stated.';

  if (
    hasPreferences &&
    preferences &&
    empVal.type !== 'unspecified' &&
    empVal.type !== 'not-stated'
  ) {
    const normalizedCheckType =
      empVal.type === 'fixed-term'
        ? 'contract'
        : empVal.type === 'apprenticeship'
          ? 'internship'
          : empVal.type;
    if (preferences.acceptedEmploymentTypes.includes(normalizedCheckType)) {
      empStatus = 'fits';
      empReason = `${empSummary} matches your accepted employment types.`;
    } else {
      empStatus = 'conflict';
      empReason = `Posting is ${empSummary.toLowerCase()}, which is not in your accepted employment types.`;
    }
  }

  const locChipLabel =
    locVal.workMode === 'on-site'
      ? cityNames
        ? `On-site (${cityNames})`
        : 'On-site'
      : locVal.workMode === 'hybrid'
        ? cityNames
          ? `Hybrid (${cityNames})`
          : 'Hybrid'
        : locVal.workMode === 'remote'
          ? 'Remote'
          : 'Location ?';

  const permChipLabel =
    permVal.sponsorship === 'no'
      ? 'No sponsorship'
      : permVal.sponsorship === 'yes'
        ? 'Sponsors visa'
        : permVal.sponsorship === 'conditional'
          ? 'Conditional visa'
          : 'Visa ?';

  const langChipLabel =
    langVal.required.length > 0
      ? langVal.required.map((l) => l.language).join('/')
      : 'Language ?';

  const salChipLabel = salVal.stated ? salSummary : 'Salary ?';
  const empChipLabel =
    empVal.type !== 'unspecified' && empVal.type !== 'not-stated'
      ? empSummary
      : 'Type ?';

  const toStatusCopy = (st: PracticalFitStatus): 'Fits' | 'Conflict' | 'Not stated' =>
    st === 'fits' ? 'Fits' : st === 'conflict' ? 'Conflict' : 'Not stated';

  const makeEvaluatedItem = (params: {
    key: JobFactKey;
    valueSummary: string;
    shortChipLabel: string;
    status: PracticalFitStatus;
    reason: string;
    confidence: FactConfidence;
    source: FactSource;
    evidence: FactEvidence[];
    canCopyRecruiterQuestion: boolean;
  }): EvaluatedFactItem => {
    const reg = FACT_KIND_REGISTRY.find((r) => r.id === params.key);
    const importance = getFactImportance(params.key, preferences?.importance);
    const salience = deriveSalience(params.status, importance);
    const shortLabel = reg?.shortLabel ?? params.key;
    const salientPillLabel =
      params.status === 'conflict'
        ? `✕ ${shortLabel}`
        : params.status === 'not-stated'
          ? `? ${shortLabel}`
          : `✓ ${shortLabel}`;

    return {
      key: params.key,
      label: reg?.label ?? params.key,
      shortLabel,
      icon: reg?.icon ?? 'briefcase',
      valueSummary: params.valueSummary,
      valueLabel: params.valueSummary,
      shortChipLabel: params.shortChipLabel,
      salientPillLabel,
      status: params.status,
      fit: params.status,
      statusCopy: toStatusCopy(params.status),
      importance,
      salience,
      reason: params.reason,
      confidence: params.confidence,
      source: params.source,
      sourceTooltip: formatFactSourceTooltip(params.source),
      evidence: params.evidence,
      evidenceQuotes: params.evidence.map((e) => e.quote),
      canCopyRecruiterQuestion: params.canCopyRecruiterQuestion,
      canAskRecruiter: params.canCopyRecruiterQuestion,
    };
  };

  const byFact: Record<JobFactKey, EvaluatedFactItem> = {
    location: makeEvaluatedItem({
      key: 'location',
      valueSummary: locSummary,
      shortChipLabel: locChipLabel,
      status: locStatus,
      reason: locReason,
      confidence: facts.location.confidence,
      source: facts.location.source,
      evidence: facts.location.evidence,
      canCopyRecruiterQuestion: false,
    }),
    workPermits: makeEvaluatedItem({
      key: 'workPermits',
      valueSummary: permSummary,
      shortChipLabel: permChipLabel,
      status: permStatus,
      reason: permReason,
      confidence: facts.workPermits.confidence,
      source: facts.workPermits.source,
      evidence: facts.workPermits.evidence,
      canCopyRecruiterQuestion:
        permVal.sponsorship === 'not-stated' ||
        permVal.sponsorship === 'conditional',
    }),
    languages: makeEvaluatedItem({
      key: 'languages',
      valueSummary: langSummary,
      shortChipLabel: langChipLabel,
      status: langStatus,
      reason: langReason,
      confidence: facts.languages.confidence,
      source: facts.languages.source,
      evidence: facts.languages.evidence,
      canCopyRecruiterQuestion: false,
    }),
    salary: makeEvaluatedItem({
      key: 'salary',
      valueSummary: salSummary,
      shortChipLabel: salChipLabel,
      status: salStatus,
      reason: salReason,
      confidence: facts.salary.confidence,
      source: facts.salary.source,
      evidence: facts.salary.evidence,
      canCopyRecruiterQuestion: !salVal.stated,
    }),
    employmentType: makeEvaluatedItem({
      key: 'employmentType',
      valueSummary: empSummary,
      shortChipLabel: empChipLabel,
      status: empStatus,
      reason: empReason,
      confidence: facts.employmentType.confidence,
      source: facts.employmentType.source,
      evidence: facts.employmentType.evidence,
      canCopyRecruiterQuestion: false,
    }),
  };

  const orderedItems: EvaluatedFactItem[] = FACT_KIND_REGISTRY.map(
    (entry) => byFact[entry.id],
  );

  const extraList: z.infer<typeof ScaleFactExtraSchema>[] =
    facts.extraFacts ??
    ((
      facts as JobFacts & {
        extras?: z.infer<typeof ScaleFactExtraSchema>[];
      }
    ).extras ?? []);

  if (extraList.length > 0) {
    for (const extra of extraList) {
      const imp = preferences?.importance?.[extra.key] ?? extra.importance;
      const sal = deriveSalience(extra.status, imp);
      const source = extra.source ?? 'rules';
      const ev = extra.evidence ?? [];
      orderedItems.push({
        key: extra.key,
        label: extra.label,
        shortLabel: extra.shortLabel,
        icon: extra.icon,
        valueSummary: extra.valueSummary,
        valueLabel: extra.valueSummary,
        shortChipLabel: extra.shortLabel,
        salientPillLabel:
          extra.status === 'conflict'
            ? `✕ ${extra.shortLabel}`
            : extra.status === 'not-stated'
              ? `? ${extra.shortLabel}`
              : `✓ ${extra.shortLabel}`,
        status: extra.status,
        fit: extra.status,
        statusCopy: toStatusCopy(extra.status),
        importance: imp,
        salience: sal,
        reason: extra.reason,
        confidence: extra.confidence ?? 'high',
        source,
        sourceTooltip: formatFactSourceTooltip(source),
        evidence: ev,
        evidenceQuotes: ev.map((e: FactEvidence) => e.quote),
        canCopyRecruiterQuestion: false,
        canAskRecruiter: false,
      });
    }
  }

  const combinedItems = Object.assign(
    [...orderedItems],
    byFact,
  ) as EvaluatedFactItem[] & Record<JobFactKey, EvaluatedFactItem>;

  let fitsCount = 0;
  let conflictCount = 0;
  let notStatedCount = 0;
  let dealbreakerConflictCount = 0;
  let flagCount = 0;

  for (const item of orderedItems) {
    if (item.status === 'fits') fitsCount += 1;
    else if (item.status === 'conflict') conflictCount += 1;
    else notStatedCount += 1;

    if (item.salience === 'critical') dealbreakerConflictCount += 1;
    else if (item.salience === 'notable') flagCount += 1;
  }

  const salienceOrder: Record<FactSalience, number> = {
    critical: 0,
    notable: 1,
    quiet: 2,
  };
  const statusOrder: Record<PracticalFitStatus, number> = {
    conflict: 0,
    'not-stated': 1,
    fits: 2,
  };

  const needsALookItems = orderedItems
    .filter((i) => i.status !== 'fits')
    .sort((a, b) => {
      if (salienceOrder[a.salience] !== salienceOrder[b.salience]) {
        return salienceOrder[a.salience] - salienceOrder[b.salience];
      }
      return statusOrder[a.status] - statusOrder[b.status];
    });

  const fittingItems = orderedItems.filter((i) => i.status === 'fits');
  const salientItems = orderedItems.sort(
    (a, b) => salienceOrder[a.salience] - salienceOrder[b.salience],
  ).filter((i) => i.salience !== 'quiet');

  // Also keep `orderedItems` sorted with critical -> notable -> quiet for tests/surfaces
  orderedItems.sort((a, b) => {
    if (salienceOrder[a.salience] !== salienceOrder[b.salience]) {
      return salienceOrder[a.salience] - salienceOrder[b.salience];
    }
    return statusOrder[a.status] - statusOrder[b.status];
  });
  const sortedCombinedItems = Object.assign(
    [...orderedItems],
    byFact,
  ) as EvaluatedFactItem[] & Record<JobFactKey, EvaluatedFactItem>;

  const fitStrip = buildFitStripSummary(orderedItems);

  const summaryLine = `Practical fit: ${fitsCount} fit · ${formatCount(conflictCount, 'conflict')} · ${notStatedCount} not stated`;

  const partialEval: PracticalFitEvaluation = {
    hasPreferences,
    items: sortedCombinedItems,
    byFact,
    orderedItems,
    needsALookItems,
    fittingItems,
    salientItems,
    fitsCount,
    conflictCount,
    notStatedCount,
    dealbreakerConflictCount,
    dealbreakerCount: dealbreakerConflictCount,
    criticalCount: dealbreakerConflictCount,
    flagCount,
    notableCount: flagCount,
    isQuiet: fitStrip.isQuiet,
    fitStrip,
    attentionToken: null,
    summaryLine,
    summaryLabel: fitStrip.summaryText,
  };

  partialEval.attentionToken = deriveRowAttentionToken({
    fit: partialEval,
  });

  return partialEval;
}



/**
 * Polite plain-language recruiter question template (zero LLM calls).
 * Supports both (factKey, roleTitle?, company?) and (factKey, lang: 'en' | 'fr', roleTitle?, company?).
 */
export function getRecruiterQuestionTemplate(
  factKey: 'workPermits' | 'salary',
  arg2?: string,
  arg3?: string,
  arg4?: string,
): string {
  const isLangArg = arg2 === 'en' || arg2 === 'fr';
  const lang: 'en' | 'fr' = isLangArg ? arg2 : 'en';
  const roleTitle = isLangArg ? arg3 : arg2;
  const company = isLangArg ? arg4 : arg3;

  if (lang === 'fr') {
    const roleFr = roleTitle ? `le poste de ${roleTitle}` : 'ce poste';
    const compFr = company ? ` chez ${company}` : '';
    if (factKey === 'workPermits') {
      return `Bonjour — merci pour les informations concernant ${roleFr}${compFr}. Pourriez-vous me préciser si le parrainage de permis de travail ou de visa est envisageable pour ce poste ?`;
    }
    return `Bonjour — ${roleFr}${compFr} m'intéresse vivement. Pourriez-vous partager la fourchette de rémunération prévue pour ce poste afin de vérifier notre alignement ?`;
  }

  const rolePhrase = roleTitle ? `the ${roleTitle} role` : 'this role';
  const companyPhrase = company ? ` at ${company}` : '';

  if (factKey === 'workPermits') {
    return `Hi — thank you for sharing details on ${rolePhrase}${companyPhrase}. Before we move forward, could you share whether work-permit or visa sponsorship is supported for this position?`;
  }
  return `Hi — I'm very interested in ${rolePhrase}${companyPhrase}. Could you share the budgeted compensation range and base salary for this level so we can make sure we're aligned early on?`;
}
