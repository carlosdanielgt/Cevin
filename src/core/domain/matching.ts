import {
  Achievement,
  BankSnapshot,
  ParsedJob,
  RequirementChip,
  Skill,
} from './entities';
import {
  evaluateKeywordPresence,
  normalizeKeyword,
} from './keywords';

export interface RankedAchievementItem {
  achievement: Achievement;
  experienceTitle: string;
  experienceCompany: string;
  score: number; // 0 to 100
  matchedTerms: string[];
  reason: string;
  usedEmbeddings: boolean;
}

export interface JobGapItem {
  requirement: RequirementChip;
  status: 'covered' | 'partial' | 'gap';
  evidenceAchievementIds: string[];
  suggestion: string;
}

export interface BankRankingResult {
  rankedAchievements: RankedAchievementItem[];
  recommendedSkillIds: string[];
  gaps: JobGapItem[];
  matchingMode: 'lexical+embeddings' | 'lexical-only';
}

export function buildCustomAliasMap(skills: Skill[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const skill of skills) {
    const norm = normalizeKeyword(skill.name);
    const existing = map.get(norm) ?? [];
    map.set(norm, [
      ...existing,
      skill.name.toLowerCase(),
      ...skill.aliases.map((a) => a.toLowerCase()),
    ]);
  }
  return map;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

/**
 * Ranks Bank achievements and skills against a ParsedJob using lexical + alias matching
 * and optional vector embeddings when supplied by the active LLM provider.
 */
export function rankBankItemsForJob(
  bank: BankSnapshot,
  parsedJob: ParsedJob,
  embeddings?: {
    jobVector: number[];
    achievementVectors: Record<string, number[]>;
  },
): BankRankingResult {
  const customAliases = buildCustomAliasMap(bank.skills);
  const skillById = new Map(bank.skills.map((s) => [s.id, s]));
  const expById = new Map(bank.experiences.map((e) => [e.id, e]));

  const allTargets = [
    ...parsedJob.requirements.map((r) => ({
      label: r.text,
      norm: r.normalizedKey || normalizeKeyword(r.text),
      weight: r.priority === 'must-have' ? 2.0 : 1.0,
    })),
    ...parsedJob.keywords.map((k) => ({
      label: k.term,
      norm: k.normalized || normalizeKeyword(k.term),
      weight: 1.25,
    })),
  ];

  // Deduplicate targets by normalized key
  const targetMap = new Map<string, { label: string; norm: string; weight: number }>();
  for (const t of allTargets) {
    if (!t.norm) continue;
    const prev = targetMap.get(t.norm);
    if (!prev || t.weight > prev.weight) {
      targetMap.set(t.norm, t);
    }
  }
  const targets = Array.from(targetMap.values());
  const totalPossibleWeight = targets.reduce((acc, t) => acc + t.weight, 0) || 1;

  const rankedAchievements: RankedAchievementItem[] = bank.achievements.map(
    (ach) => {
      const exp = expById.get(ach.experienceId);
      const linkedSkills = ach.skillIds
        .map((id) => skillById.get(id))
        .filter((s): s is Skill => Boolean(s));

      const skillCorpus = linkedSkills
        .map((s) => `${s.name} ${s.aliases.join(' ')}`)
        .join(' ');
      const fullText = `${ach.action} ${ach.result} ${ach.metric ?? ''} ${ach.tags.join(' ')} ${skillCorpus} ${exp?.title ?? ''}`;

      const matchedTerms: string[] = [];
      let earnedWeight = 0;

      for (const target of targets) {
        const presence = evaluateKeywordPresence(
          target.label,
          fullText,
          customAliases,
        );
        if (presence === 'covered') {
          matchedTerms.push(target.label);
          earnedWeight += target.weight;
        } else if (presence === 'partial') {
          earnedWeight += target.weight * 0.45;
        }
      }

      const metricBonus = ach.metric ? 12 : 0;
      const lexicalRatio = Math.min(1, earnedWeight / (totalPossibleWeight * 0.35));
      let rawScore = Math.round(lexicalRatio * 88 + metricBonus);

      const hasEmbedding =
        Boolean(embeddings?.jobVector?.length) &&
        Boolean(embeddings?.achievementVectors[ach.id]?.length);

      if (hasEmbedding && embeddings) {
        const sim = cosineSimilarity(
          embeddings.jobVector,
          embeddings.achievementVectors[ach.id],
        );
        const semanticScore = Math.round(Math.max(0, sim) * 100);
        rawScore = Math.round(rawScore * 0.7 + semanticScore * 0.3);
      }

      const finalScore = Math.max(12, Math.min(99, rawScore));

      let reason = '';
      if (matchedTerms.length > 0) {
        const topTerms = matchedTerms.slice(0, 3).join(', ');
        reason = `Matches ${topTerms}${ach.metric ? ` · quantified (${ach.metric})` : ''}`;
      } else if (ach.metric) {
        reason = `Strong quantified impact (${ach.metric}) relevant to ${exp?.title ?? 'role'}`;
      } else {
        reason = `Transferable engineering delivery from ${exp?.company ?? 'Experience'}`;
      }

      return {
        achievement: ach,
        experienceTitle: exp?.title ?? 'Role',
        experienceCompany: exp?.company ?? 'Company',
        score: finalScore,
        matchedTerms,
        reason,
        usedEmbeddings: hasEmbedding,
      };
    },
  );

  rankedAchievements.sort((a, b) => b.score - a.score);

  // Recommend skills that match JD or are linked to top achievements
  const recommendedSkillIds: string[] = [];
  const jdCorpus = `${parsedJob.title} ${parsedJob.requirements.map((r) => r.text).join(' ')} ${parsedJob.keywords.map((k) => k.term).join(' ')} ${parsedJob.responsibilities.join(' ')}`;

  for (const skill of bank.skills) {
    const presence = evaluateKeywordPresence(
      skill.name,
      jdCorpus,
      customAliases,
    );
    if (presence !== 'gap') {
      recommendedSkillIds.push(skill.id);
    }
  }
  if (recommendedSkillIds.length < 6) {
    for (const skill of bank.skills) {
      if (!recommendedSkillIds.includes(skill.id)) {
        recommendedSkillIds.push(skill.id);
      }
      if (recommendedSkillIds.length >= 10) break;
    }
  }

  // Compute requirement coverage & gaps across the entire Bank
  const fullBankCorpus = [
    ...bank.achievements.map(
      (a) => `${a.action} ${a.result} ${a.metric ?? ''} ${a.tags.join(' ')}`,
    ),
    ...bank.skills.map((s) => `${s.name} ${s.aliases.join(' ')}`),
    ...bank.projects.map(
      (p) => `${p.name} ${p.description} ${p.highlights.join(' ')}`,
    ),
  ].join(' \n ');

  const gaps: JobGapItem[] = parsedJob.requirements.map((req) => {
    const evidenceIds: string[] = [];
    for (const item of rankedAchievements) {
      const achText = `${item.achievement.action} ${item.achievement.result} ${item.achievement.metric ?? ''} ${item.achievement.tags.join(' ')}`;
      if (
        evaluateKeywordPresence(req.text, achText, customAliases) !== 'gap'
      ) {
        evidenceIds.push(item.achievement.id);
      }
    }

    const status = evaluateKeywordPresence(
      req.text,
      fullBankCorpus,
      customAliases,
    );

    return {
      requirement: req,
      status,
      evidenceAchievementIds: evidenceIds,
      suggestion:
        status === 'gap'
          ? `No evidence for "${req.text}" in your Bank. Only add it if you have real experience with it.`
          : `Backed by ${evidenceIds.length || 1} Bank item(s).`,
    };
  });

  return {
    rankedAchievements,
    recommendedSkillIds,
    gaps,
    matchingMode: embeddings?.jobVector?.length
      ? 'lexical+embeddings'
      : 'lexical-only',
  };
}
