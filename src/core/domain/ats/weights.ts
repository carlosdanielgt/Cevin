/**
 * Explicit deterministic weights for ATS readiness (estimate) and Job Match.
 * Kept in a dedicated module so no magic numbers exist in scoring code.
 */
export const ATS_CATEGORY_WEIGHTS = {
  keywordCoverage: 0.45,
  structureAndParseability: 0.25,
  contentQuality: 0.15,
  lengthAndDensity: 0.1,
  titleAlignment: 0.05,
} as const;

export const JOB_MATCH_WEIGHTS = {
  mustHaveRequirement: 2.0,
  niceToHaveRequirement: 1.0,
  detectedKeyword: 0.75,
} as const;

export const CONTENT_QUALITY_THRESHOLDS = {
  minQuantifiedBulletRatio: 0.5,
  minBulletWords: 8,
  maxBulletWords: 34,
  stuffingMaxFrequencyPerKeyword: 6,
  idealCharactersPerPage: 2600,
  maxRecommendedPages: 2,
} as const;
