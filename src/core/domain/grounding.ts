import { BankSnapshot } from './entities';
import { expandKeywordAliases } from './keywords';

export interface GroundingValidationResult {
  isGrounded: boolean;
  unverifiedClaims: string[];
  verifiedSourceIds: string[];
}

/**
 * Post-validates generated bullet text against its cited Bank items (`sourceIds`).
 * Principle 1: Cevin must never invent employers, dates, metrics, tools or skills.
 * Any number/metric, company, or tool in the bullet that doesn't appear in its
 * cited sources (or linked skills/experiences) is flagged as "unverified".
 */
export function validateBulletGrounding(
  bulletText: string,
  sourceIds: string[],
  bank: BankSnapshot,
): GroundingValidationResult {
  if (!sourceIds || sourceIds.length === 0) {
    return {
      isGrounded: false,
      unverifiedClaims: ['Missing source link to Bank item'],
      verifiedSourceIds: [],
    };
  }

  const achById = new Map(bank.achievements.map((a) => [a.id, a]));
  const expById = new Map(bank.experiences.map((e) => [e.id, e]));
  const projById = new Map(bank.projects.map((p) => [p.id, p]));
  const skillById = new Map(bank.skills.map((s) => [s.id, s]));

  const verifiedSourceIds: string[] = [];
  const sourceFragments: string[] = [];

  for (const id of sourceIds) {
    const ach = achById.get(id);
    if (ach) {
      verifiedSourceIds.push(id);
      sourceFragments.push(ach.action, ach.result, ach.metric ?? '', ...ach.tags);
      const exp = expById.get(ach.experienceId);
      if (exp) {
        sourceFragments.push(exp.company, exp.title, exp.start, exp.end);
      }
      for (const sId of ach.skillIds) {
        const s = skillById.get(sId);
        if (s) {
          sourceFragments.push(
            s.name,
            ...s.aliases,
            ...expandKeywordAliases(s.name),
          );
        }
      }
    }
    const exp = expById.get(id);
    if (exp) {
      verifiedSourceIds.push(id);
      sourceFragments.push(exp.company, exp.title, exp.start, exp.end);
    }
    const proj = projById.get(id);
    if (proj) {
      verifiedSourceIds.push(id);
      sourceFragments.push(proj.name, proj.description, ...proj.highlights);
    }
  }

  // Also include all Bank skills and aliases that appear in those experiences
  for (const skill of bank.skills) {
    const skillLower = skill.name.toLowerCase();
    if (sourceFragments.some((f) => f.toLowerCase().includes(skillLower))) {
      sourceFragments.push(
        skill.name,
        ...skill.aliases,
        ...expandKeywordAliases(skill.name),
      );
    }
  }

  if (verifiedSourceIds.length === 0) {
    return {
      isGrounded: false,
      unverifiedClaims: ['Referenced Bank item no longer exists'],
      verifiedSourceIds: [],
    };
  }

  const sourceCorpus = sourceFragments.join(' \n ').toLowerCase();
  const unverifiedClaims: string[] = [];

  // 1. Validate all numbers / percentages / multipliers / dollar amounts
  const numberMatches =
    bulletText.match(/\$?\d+(?:[.,]\d+)*(?:%|x|ms|s|k|m|b|\+)?/gi) ?? [];
  for (const rawNum of numberMatches) {
    const normalizedNum = rawNum.toLowerCase().replace(/,/g, '');
    const digitsOnly = normalizedNum.replace(/[^0-9.]/g, '');
    const normalizedSource = sourceCorpus.replace(/,/g, '');
    if (
      !normalizedSource.includes(normalizedNum) &&
      (!digitsOnly || !normalizedSource.includes(digitsOnly))
    ) {
      unverifiedClaims.push(`Unverified metric: "${rawNum}"`);
    }
  }

  // 2. Check known tech/tool terms mentioned in the bullet that are not in the source corpus
  const KNOWN_TECH_PROPER_NOUNS = [
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
  ];

  for (const tool of KNOWN_TECH_PROPER_NOUNS) {
    const regex = new RegExp(`\\b${tool}\\b`, 'i');
    if (regex.test(bulletText)) {
      const variants = expandKeywordAliases(tool);
      const presentInSource = variants.some((v) => sourceCorpus.includes(v));
      if (!presentInSource) {
        unverifiedClaims.push(`Unverified tool/skill: "${tool}"`);
      }
    }
  }

  return {
    isGrounded: unverifiedClaims.length === 0,
    unverifiedClaims,
    verifiedSourceIds,
  };
}
