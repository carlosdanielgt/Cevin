import {
  Application,
  BankSnapshot,
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

  const experiences = bank.experiences
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
