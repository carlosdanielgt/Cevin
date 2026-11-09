import {
  Application,
  BankSnapshot,
  Experience,
  PageSize,
  ResumeDocument,
  ResumeDraftContent,
  Skill,
  TemplateId,
  VoiceLevel,
} from './entities';
import {
  TEMPLATE_SPEC_VERSION,
  computeDocumentContentHash,
} from './templateSpec';

const MONTH_NAME_MAP: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * Parses a date string ("2024-10", "Oct 2024", "04/2018", "2023", "Present") into a comparable YYYYMM integer.
 */
export function parseExperienceDateScore(
  raw: string,
  isEndDate = false,
): number {
  const s = (raw ?? '').trim();
  if (!s) return 0;
  if (/\b(present|current|now|ongoing|actuel|aujourd'hui)\b/i.test(s)) {
    return 999912;
  }

  // YYYY-MM or YYYY/MM
  const ym = s.match(/\b(19\d{2}|20\d{2})[-/.](\d{1,2})\b/);
  if (ym) {
    const year = parseInt(ym[1], 10);
    const month = Math.max(1, Math.min(12, parseInt(ym[2], 10)));
    return year * 100 + month;
  }

  // MM/YYYY or MM-YYYY
  const my = s.match(/\b(\d{1,2})[-/.](19\d{2}|20\d{2})\b/);
  if (my) {
    const month = Math.max(1, Math.min(12, parseInt(my[1], 10)));
    const year = parseInt(my[2], 10);
    return year * 100 + month;
  }

  // Month YYYY or YYYY Month
  const monthMatch = s
    .toLowerCase()
    .match(
      /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/,
    );
  const yearMatch = s.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearMatch) {
    const year = parseInt(yearMatch[1], 10);
    const month = monthMatch
      ? (MONTH_NAME_MAP[monthMatch[1]] ?? (isEndDate ? 12 : 1))
      : isEndDate
        ? 12
        : 1;
    return year * 100 + month;
  }

  return 0;
}

/**
 * Pure reverse-chronological sorter for Experience items (newest end date first, then newest start date first).
 */
export function sortExperiencesChronologically(
  experiences: Experience[],
): Experience[] {
  return [...experiences]
    .sort((a, b) => {
      const endDiff =
        parseExperienceDateScore(b.end, true) -
        parseExperienceDateScore(a.end, true);
      if (endDiff !== 0) return endDiff;
      return (
        parseExperienceDateScore(b.start, false) -
        parseExperienceDateScore(a.start, false)
      );
    })
    .map((exp, idx) => ({ ...exp, sortOrder: idx }));
}

/**
 * Orders experiences according to an explicit draft `experienceOrder` list (if provided),
 * falling back to `sortOrder` on Experience items, then array order.
 */
export function orderExperiencesForDraft(
  experiences: Experience[],
  experienceOrder?: string[],
): Experience[] {
  if (experienceOrder && experienceOrder.length > 0) {
    const rankMap = new Map<string, number>();
    experienceOrder.forEach((id, idx) => rankMap.set(id, idx));
    return [...experiences].sort((a, b) => {
      const rA = rankMap.get(a.id);
      const rB = rankMap.get(b.id);
      if (rA !== undefined && rB !== undefined) return rA - rB;
      if (rA !== undefined) return -1;
      if (rB !== undefined) return 1;
      return (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999);
    });
  }
  const hasExplicitSortOrder = experiences.some(
    (e) => typeof e.sortOrder === 'number',
  );
  if (hasExplicitSortOrder) {
    return [...experiences].sort(
      (a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999),
    );
  }
  return experiences;
}

/**
 * Derives a single consistent headline for both Resume and Cover Letter headers
 * from the application's target role / headline, falling back to the Bank profile headline.
 */
export function deriveDocumentHeadline(params: {
  targetHeadline?: string;
  roleTitle?: string;
  profileHeadline?: string;
}): string {
  const target = (params.targetHeadline ?? '').trim();
  const role = (params.roleTitle ?? '').trim();
  const profile = (params.profileHeadline ?? '').trim();
  return target || role || profile || 'Software Engineer';
}

/**
 * Pure mapper converting an Application working draft (or ResumeVersion) + BankSnapshot
 * into the format-agnostic ResumeDocument consumed by all exporters and the previewer.
 */
export function mapToResumeDocument(params: {
  draft: ResumeDraftContent;
  bank: BankSnapshot;
  versionNumber: number;
  templateId: TemplateId;
  pageSize?: PageSize;
  voice: VoiceLevel;
  targetCompany: string;
  targetRole: string;
  generatedAt?: string;
}): ResumeDocument {
  const {
    draft,
    bank,
    versionNumber,
    templateId,
    pageSize = 'letter',
    voice,
    targetCompany,
    targetRole,
    generatedAt = new Date().toISOString(),
  } = params;

  const headline = deriveDocumentHeadline({
    targetHeadline: draft.targetHeadline,
    roleTitle: targetRole,
    profileHeadline: bank.profile.headline,
  });

  const bulletsByExp = new Map<
    string,
    Array<{
      id: string;
      text: string;
      sourceIds: string[];
      unverifiedClaims: string[];
    }>
  >();

  for (const bullet of draft.bullets) {
    const list = bulletsByExp.get(bullet.experienceId) ?? [];
    list.push({
      id: bullet.id,
      text: bullet.text,
      sourceIds: bullet.sourceIds,
      unverifiedClaims: bullet.unverifiedClaims,
    });
    bulletsByExp.set(bullet.experienceId, list);
  }

  const orderedBankExperiences = orderExperiencesForDraft(
    bank.experiences,
    draft.experienceOrder,
  );

  const experiences = orderedBankExperiences
    .map((exp) => {
      const bullets = bulletsByExp.get(exp.id) ?? [];
      return {
        id: exp.id,
        company: exp.company,
        title: exp.title,
        location: exp.location,
        dateRange: `${exp.start} – ${exp.end}`,
        bullets,
      };
    })
    .filter((exp) => exp.bullets.length > 0);

  const selectedSkillSet = new Set(draft.selectedSkillIds);
  const selectedSkills: Skill[] = bank.skills.filter((s) =>
    selectedSkillSet.has(s.id),
  );

  const categoryMap = new Map<string, string[]>();
  for (const s of selectedSkills) {
    const list = categoryMap.get(s.category) ?? [];
    list.push(s.name);
    categoryMap.set(s.category, list);
  }

  const skillsByCategory = Array.from(categoryMap.entries()).map(
    ([category, skills]) => ({
      category,
      skills,
    }),
  );

  const selectedProjectSet = new Set(draft.selectedProjectIds);
  const projects = bank.projects
    .filter((p) => selectedProjectSet.has(p.id))
    .map((p) => ({
      id: p.id,
      name: p.name,
      role: p.role,
      description: p.description,
      link: p.link,
      highlights: p.highlights,
    }));

  const selectedEduSet = new Set(draft.selectedEducationIds);
  const educations = bank.educations
    .filter((e) => selectedEduSet.has(e.id))
    .map((e) => ({
      id: e.id,
      institution: e.institution,
      degreeLine: e.field ? `${e.degree}, ${e.field}` : e.degree,
      location: e.location,
      dateRange: `${e.start} – ${e.end}`,
      highlights: e.highlights,
    }));

  const selectedCertSet = new Set(draft.selectedCertificationIds);
  const certifications = bank.certifications
    .filter((c) => selectedCertSet.has(c.id))
    .map((c) => ({
      id: c.id,
      name: c.name,
      issuer: c.issuer,
      date: c.date,
    }));

  const baseDoc: ResumeDocument = {
    kind: 'resume',
    contentHash: '',
    meta: {
      versionNumber,
      templateId,
      templateVersion: TEMPLATE_SPEC_VERSION,
      pageSize,
      voice,
      targetCompany,
      targetRole,
      generatedAt,
    },
    header: {
      name: bank.profile.name,
      headline,
      email: bank.profile.email,
      phone: bank.profile.phone,
      location: bank.profile.location,
      links: bank.profile.links,
    },
    summary: draft.summary,
    experiences,
    projects,
    skillsByCategory,
    educations,
    certifications,
  };

  const contentHash = computeDocumentContentHash(baseDoc);
  baseDoc.contentHash = contentHash;
  baseDoc.meta.contentHash = contentHash;
  return baseDoc;
}

export function mapApplicationToResumeDocument(
  application: Application,
  bank: BankSnapshot,
  versionNumber = 1,
  pageSize: PageSize = 'letter',
): ResumeDocument {
  return mapToResumeDocument({
    draft: application.workingDraft,
    bank,
    versionNumber,
    templateId: application.templateId,
    pageSize,
    voice: application.voice,
    targetCompany: application.company,
    targetRole: application.roleTitle,
  });
}
