import { z } from 'zod';
import { AppealLensScoresSchema, PositionedTextSchema } from './appeal';
import { JobFactsSchema } from './jobfacts';

export type Result<T, E = AppError> =
  | { ok: true; value: T }
  | { ok: false; error: E };

export type AppErrorCode =
  | 'VALIDATION_ERROR'
  | 'NOT_FOUND'
  | 'IMPORT_UNSUPPORTED'
  | 'IMPORT_SCANNED_PDF'
  | 'IMPORT_PARSE_FAILED'
  | 'EXPORT_FAILED'
  | 'LLM_UNREACHABLE'
  | 'LLM_CORS_BLOCKED'
  | 'LLM_NO_MODELS'
  | 'LLM_MODEL_MISSING'
  | 'LLM_SCHEMA_FAILED'
  | 'STORAGE_ERROR';

export interface AppError {
  code: AppErrorCode;
  message: string;
  hint?: string;
  details?: string;
}

export const VoiceLevelSchema = z.enum([
  'polished',
  'professional',
  'balanced',
  'natural',
  'plain',
]);
export type VoiceLevel = z.infer<typeof VoiceLevelSchema>;

export const TemplateIdSchema = z.enum(['classic', 'modern', 'compact']);
export type TemplateId = z.infer<typeof TemplateIdSchema>;

export const PageSizeSchema = z.enum(['letter', 'a4']);
export type PageSize = z.infer<typeof PageSizeSchema>;

export const DocumentKindSchema = z.enum(['resume', 'coverLetter']);
export type DocumentKind = z.infer<typeof DocumentKindSchema>;

export const StudioStepSchema = z.enum(['job', 'build', 'write', 'review']);
export type StudioStep = z.infer<typeof StudioStepSchema>;

export const CoverLetterLengthSchema = z.enum([
  'short',
  'standard',
  'detailed',
]);
export type CoverLetterLength = z.infer<typeof CoverLetterLengthSchema>;

export const CoverLetterBlockTypeSchema = z.enum([
  'greeting',
  'opening',
  'body1',
  'body2',
  'whyCompany',
  'closing',
  'signoff',
]);
export type CoverLetterBlockType = z.infer<typeof CoverLetterBlockTypeSchema>;

export const APPLICATION_STATUS_ORDER = [
  'Prospect',
  'Draft',
  'Applied',
  'Interviewing',
  'Offer',
  'Rejected',
  'Archived',
] as const;

export const ApplicationStatusSchema = z.preprocess((val) => {
  if (typeof val === 'string' && val.toLowerCase() === 'prospect') {
    return 'Prospect';
  }
  return val;
}, z.enum(APPLICATION_STATUS_ORDER));
export type ApplicationStatus = z.infer<typeof ApplicationStatusSchema>;

export const ProfileSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  headline: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(
    z.object({
      label: z.string(),
      url: z.string(),
    }),
  ),
});
export type Profile = z.infer<typeof ProfileSchema>;

export const ExperienceSchema = z.object({
  id: z.string(),
  company: z.string().min(1),
  title: z.string().min(1),
  location: z.string(),
  start: z.string().min(1),
  end: z.string().min(1),
});
export type Experience = z.infer<typeof ExperienceSchema>;

export const AchievementSchema = z.object({
  id: z.string(),
  experienceId: z.string(),
  action: z.string().min(1),
  result: z.string().min(1),
  metric: z.string().optional(),
  skillIds: z.array(z.string()),
  tags: z.array(z.string()),
});
export type Achievement = z.infer<typeof AchievementSchema>;

export const SkillCategorySchema = z.enum([
  'Languages',
  'Frameworks',
  'Infrastructure',
  'Data & AI',
  'Practices',
  'Tools',
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

export const SkillSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  category: SkillCategorySchema,
  aliases: z.array(z.string()),
});
export type Skill = z.infer<typeof SkillSchema>;

export const EducationSchema = z.object({
  id: z.string(),
  institution: z.string().min(1),
  degree: z.string().min(1),
  field: z.string(),
  location: z.string(),
  start: z.string(),
  end: z.string(),
  highlights: z.string().optional(),
});
export type Education = z.infer<typeof EducationSchema>;

export const ProjectSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  role: z.string(),
  description: z.string().min(1),
  link: z.string().optional(),
  skillIds: z.array(z.string()),
  highlights: z.array(z.string()),
});
export type Project = z.infer<typeof ProjectSchema>;

export const CertificationSchema = z.object({
  id: z.string(),
  name: z.string().min(1),
  issuer: z.string().min(1),
  date: z.string(),
  credentialId: z.string().optional(),
});
export type Certification = z.infer<typeof CertificationSchema>;

export interface BankSnapshot {
  profile: Profile;
  experiences: Experience[];
  achievements: Achievement[];
  skills: Skill[];
  educations: Education[];
  projects: Project[];
  certifications: Certification[];
}

export const RequirementPrioritySchema = z.enum(['must-have', 'nice-to-have']);
export type RequirementPriority = z.infer<typeof RequirementPrioritySchema>;

export const RequirementChipSchema = z.object({
  id: z.string(),
  text: z.string().min(1),
  normalizedKey: z.string(),
  priority: RequirementPrioritySchema,
  category: z.enum(['hard-skill', 'tool', 'domain', 'soft-skill']),
});
export type RequirementChip = z.infer<typeof RequirementChipSchema>;

export const ParsedJobSchema = z.object({
  title: z.string(),
  company: z.string(),
  seniority: z.string(),
  summary: z.string(),
  requirements: z.array(RequirementChipSchema),
  responsibilities: z.array(z.string()),
  keywords: z.array(
    z.object({
      term: z.string(),
      normalized: z.string(),
      kind: z.enum(['hard-skill', 'tool', 'soft-skill']),
    }),
  ),
});
export type ParsedJob = z.infer<typeof ParsedJobSchema>;

export const TailoredBulletSchema = z.object({
  id: z.string(),
  experienceId: z.string(),
  text: z.string(),
  originalText: z.string(),
  sourceIds: z.array(z.string()),
  locked: z.boolean(),
  unverifiedClaims: z.array(z.string()),
  keptOriginalWording: z.boolean().optional(),
  attemptCount: z.number().int().nonnegative().optional(),
  origin: z.enum(['ai', 'user', 'bank']).optional(),
});
export type TailoredBullet = z.infer<typeof TailoredBulletSchema>;

export const ResumeDraftContentSchema = z.object({
  targetHeadline: z.string(),
  summary: z.string(),
  summaryLocked: z.boolean(),
  summarySourceIds: z.array(z.string()),
  selectedAchievementIds: z.array(z.string()),
  selectedSkillIds: z.array(z.string()),
  selectedProjectIds: z.array(z.string()),
  selectedEducationIds: z.array(z.string()),
  selectedCertificationIds: z.array(z.string()),
  bullets: z.array(TailoredBulletSchema),
});
export type ResumeDraftContent = z.infer<typeof ResumeDraftContentSchema>;

export const CoverLetterBlockSchema = z.object({
  id: z.string(),
  type: CoverLetterBlockTypeSchema,
  text: z.string(),
  sourceIds: z.array(z.string()),
  locked: z.boolean(),
  unverifiedClaims: z.array(z.string()),
  origin: z.enum(['ai', 'user', 'bank']).optional(),
});
export type CoverLetterBlock = z.infer<typeof CoverLetterBlockSchema>;

export const CoverLetterDraftSchema = z.object({
  recipient: z.string(),
  length: CoverLetterLengthSchema,
  selectedProofAchievementIds: z.array(z.string()),
  whyCompanyNotes: z.string(),
  voice: VoiceLevelSchema,
  blocks: z.array(CoverLetterBlockSchema),
});
export type CoverLetterDraft = z.infer<typeof CoverLetterDraftSchema>;

export const LetterCheckItemSchema = z.object({
  id: z.string(),
  label: z.string(),
  passed: z.boolean(),
  detail: z.string(),
});
export type LetterCheckItem = z.infer<typeof LetterCheckItemSchema>;

export const LetterCheckReportSchema = z.object({
  passedCount: z.number(),
  totalCount: z.number(),
  wordCount: z.number(),
  targetMinWords: z.number(),
  targetMaxWords: z.number(),
  paragraphCount: z.number(),
  iStarterRatio: z.number(),
  machineMadeFeel: z.enum(['Low', 'Medium', 'High']),
  appeal: z.number().optional(),
  letterAppeal: z.number().default(85),
  checks: z.array(LetterCheckItemSchema),
});
export type LetterCheckReport = z.infer<typeof LetterCheckReportSchema>;

export const RoundTripReportSchema = z.object({
  verifiedAt: z.string(),
  extractedCharacterCount: z.number(),
  contactDetected: z.boolean(),
  headingsDetected: z.array(z.string()),
  readingOrderIntact: z.boolean(),
  passed: z.boolean(),
  notes: z.array(z.string()),
  positionedText: z.array(PositionedTextSchema).optional(),
});
export type RoundTripReport = z.infer<typeof RoundTripReportSchema>;

export const ScoreBreakdownSchema = z.object({
  jobMatch: z.number(),
  atsReadiness: z.number(),
  appeal: z.number().optional(),
  recruiterAppeal: z.number().optional(),
  appealLenses: AppealLensScoresSchema.optional(),
  firstImpressionTakeaway: z.string().optional(),
  machineMadeScore: z.number(),
  subscores: z.object({
    keywordCoverage: z.number(),
    structureAndParseability: z.number(),
    contentQuality: z.number(),
    lengthAndDensity: z.number(),
    titleAlignment: z.number(),
  }),
  coveredKeywords: z.array(z.string()),
  partialKeywords: z.array(z.string()),
  gapKeywords: z.array(z.string()),
  estimatedPages: z.number(),
  roundTrip: RoundTripReportSchema.optional(),
});
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;

export const DocumentVersionSchema = z.object({
  id: z.string(),
  applicationId: z.string(),
  kind: DocumentKindSchema.default('resume'),
  number: z.number().int().positive(),
  label: z.string(),
  content: ResumeDraftContentSchema.optional(),
  coverLetterContent: CoverLetterDraftSchema.optional(),
  voice: VoiceLevelSchema,
  templateId: TemplateIdSchema,
  templateVersion: z.string().optional(),
  pageSize: PageSizeSchema.optional(),
  contentHash: z.string().optional(),
  pdfBytesBase64: z.string().optional(),
  pdfBytes: z.custom<Uint8Array>().optional(),
  regeneratedFromBackup: z.boolean().optional(),
  modelId: z.string(),
  scores: ScoreBreakdownSchema,
  letterChecks: LetterCheckReportSchema.optional(),
  createdAt: z.string(),
});
export type DocumentVersion = z.infer<typeof DocumentVersionSchema>;

export const ResumeVersionSchema = DocumentVersionSchema;
export type ResumeVersion = DocumentVersion;

export const ApplicationSchema = z.object({
  id: z.string(),
  company: z.string(),
  roleTitle: z.string(),
  jobDescription: z.string(),
  parsedJob: ParsedJobSchema.nullable(),
  jobFacts: JobFactsSchema.optional(),
  dismissedRequirements: z.array(z.string()).optional(),
  dismissedRequirementIds: z.array(z.string()).optional(),
  postingUrl: z.string().optional(),
  appliedDate: z.string().optional(),
  notes: z.string().optional(),
  factsExpandedOverride: z.boolean().optional(),
  status: ApplicationStatusSchema,
  voice: VoiceLevelSchema,
  templateId: TemplateIdSchema,
  activeStep: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
  lastActiveDoc: DocumentKindSchema.optional(),
  lastActiveStep: StudioStepSchema.optional(),
  workingDraft: ResumeDraftContentSchema,
  coverLetterDraft: CoverLetterDraftSchema.optional(),
  documents: z
    .object({
      resume: ResumeDraftContentSchema,
      coverLetter: CoverLetterDraftSchema,
    })
    .optional(),
  latestScores: ScoreBreakdownSchema,
  latestLetterChecks: LetterCheckReportSchema.optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Application = z.infer<typeof ApplicationSchema>;

/**
 * Format-agnostic, render-ready view model derived from a ResumeVersion + BankSnapshot.
 * Exporters and preview components consume ONLY ResumeDocument, never database entities.
 */
export interface ResumeDocument {
  kind?: 'resume';
  contentHash: string;
  meta: {
    versionNumber: number;
    templateId: TemplateId;
    templateVersion?: string;
    pageSize?: PageSize;
    contentHash?: string;
    voice: VoiceLevel;
    targetCompany: string;
    targetRole: string;
    generatedAt: string;
  };
  header: {
    name: string;
    headline: string;
    email: string;
    phone: string;
    location: string;
    links: Array<{ label: string; url: string }>;
  };
  summary: string;
  experiences: Array<{
    id: string;
    company: string;
    title: string;
    location: string;
    dateRange: string;
    bullets: Array<{
      id: string;
      text: string;
      sourceIds: string[];
      unverifiedClaims: string[];
    }>;
  }>;
  projects: Array<{
    id: string;
    name: string;
    role: string;
    description: string;
    link?: string;
    highlights: string[];
  }>;
  skillsByCategory: Array<{
    category: string;
    skills: string[];
  }>;
  educations: Array<{
    id: string;
    institution: string;
    degreeLine: string;
    location: string;
    dateRange: string;
    highlights?: string;
  }>;
  certifications: Array<{
    id: string;
    name: string;
    issuer: string;
    date: string;
  }>;
}

/**
 * Format-agnostic, render-ready view model derived from a CoverLetterDraft + BankSnapshot.
 */
export interface CoverLetterDocument {
  kind: 'coverLetter';
  contentHash: string;
  meta: {
    versionNumber: number;
    templateId: TemplateId;
    templateVersion?: string;
    pageSize?: PageSize;
    contentHash?: string;
    voice: VoiceLevel;
    targetCompany: string;
    targetRole: string;
    recipient: string;
    length: CoverLetterLength;
    generatedAt: string;
  };
  header: {
    name: string;
    headline: string;
    email: string;
    phone: string;
    location: string;
    links: Array<{ label: string; url: string }>;
  };
  dateLine: string;
  recipientLine: string;
  blocks: Array<{
    id: string;
    type: CoverLetterBlockType;
    text: string;
    sourceIds: string[];
    sourceTitles: string[];
    unverifiedClaims: string[];
  }>;
  wordCount: number;
}

export type ExportableDocument = ResumeDocument | CoverLetterDocument;

export interface RawDocument {
  fileName: string;
  formatId: string;
  text: string;
  pageCount?: number;
}
