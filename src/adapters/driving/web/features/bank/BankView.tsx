import {
  Award,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  FolderGit2,
  GraduationCap,
  Link2,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ParsedResumeCandidate } from '../../../../../core/application';
import {
  Achievement,
  BankSnapshot,
  Certification,
  Education,
  Experience,
  Project,
  Skill,
  SkillCategory,
  assembleBulletText,
  classifySkillCategory,
  formatCount,
  formatDocumentDateRange,
  isPlaceholderExperience,
  normalizeBankSkill,
  sortExperiencesChronologically,
} from '../../../../../core/domain';
import { useCevinUseCases, useUiStore } from '../../context';
import {
  Avatar,
  Badge,
  Button,
  CevinStatusIndicator,
  Drawer,
  EmptyState,
  FileDropzone,
  IconButton,
  Input,
  MetricChip,
  Popover,
  PopoverContent,
  PopoverTrigger,
  SegmentedControl,
  Select,
  TagChip,
  Textarea,
} from '../../ui/primitives';
import { PageHeader, TimelineRail } from '../../ui/signatures';

type BankSection =
  | 'experience'
  | 'skills'
  | 'projects'
  | 'education'
  | 'certifications'
  | 'profile';

const SKILL_CATEGORIES: SkillCategory[] = [
  'Languages',
  'Frameworks',
  'Infrastructure',
  'Data & AI',
  'Practices',
  'Tools',
  'Other',
];

const EXTERNAL_LLM_PROMPT_TEMPLATE = `Please convert my attached CV / resume into the following JSON structure for the Cevin Experience Bank.
Return ONLY valid raw JSON with no markdown wrapping and no conversational prose.

{
  "profile": {
    "name": "Full Name",
    "headline": "Professional Headline",
    "email": "name@example.com",
    "phone": "+1 (555) 000-0000",
    "location": "City, State",
    "links": [
      { "label": "GitHub", "url": "https://github.com/..." },
      { "label": "LinkedIn", "url": "https://linkedin.com/in/..." }
    ]
  },
  "experiences": [
    {
      "company": "Company Name",
      "title": "Role Title",
      "location": "City, State / Remote",
      "start": "2022-01",
      "end": "Present",
      "achievements": [
        {
          "action": "Action you spearheaded or engineered (past tense verb)",
          "result": "quantifiable business or technical outcome achieved",
          "metric": "e.g. 35% latency reduction or $2M volume (optional)",
          "tags": ["infrastructure", "go"]
        }
      ]
    }
  ],
  "skills": [
    {
      "name": "Skill Name",
      "category": "Languages",
      "aliases": ["Strict Synonym"],
      "related": ["Adjacent Tool"]
    }
  ],
  "educations": [
    {
      "institution": "University / Institution",
      "degree": "Degree Title",
      "field": "Field of Study",
      "location": "City, State",
      "start": "2016",
      "end": "2020",
      "highlights": "Honors / coursework"
    }
  ],
  "projects": [
    {
      "name": "Project Name",
      "role": "Creator & Maintainer",
      "description": "Short project description",
      "link": "https://...",
      "highlights": ["Adoption or key result"]
    }
  ],
  "certifications": [
    {
      "name": "Certification Name",
      "issuer": "Issuing Body",
      "date": "2024"
    }
  ]
}

Valid categories for skills are ONLY: "Languages", "Frameworks", "Infrastructure", "Data & AI", "Practices", "Tools", or "Other".
Make sure achievements describe quantifiable outcomes with past tense verbs.`;

export function BankView() {
  const useCases = useCevinUseCases();
  const addToast = useUiStore((s) => s.addToast);

  const [bank, setBank] = useState<BankSnapshot | null>(null);
  const [activeSection, setActiveSection] = useState<BankSection>('experience');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);
  const [expandedRoleIds, setExpandedRoleIds] = useState<
    Record<string, boolean>
  >({});

  // Role Drawer state (supports both editing existing role and creating new role on confirm)
  const [roleDraft, setRoleDraft] = useState<{
    isNew: boolean;
    experience: Experience;
    initialAchievementAction?: string;
    initialAchievementMetric?: string;
    initialAchievementResult?: string;
  } | null>(null);

  const [editingAchievementId, setEditingAchievementId] = useState<
    string | null
  >(null);

  // Project, Education, Certification Drawer states (read-first cards, edit/create in drawer)
  const [projectDraft, setProjectDraft] = useState<{
    isNew: boolean;
    project: Project;
    highlightsText: string;
  } | null>(null);

  const [educationDraft, setEducationDraft] = useState<{
    isNew: boolean;
    education: Education;
  } | null>(null);

  const [certificationDraft, setCertificationDraft] = useState<{
    isNew: boolean;
    certification: Certification;
  } | null>(null);

  // Import Resume Drawer
  const [importDrawerOpen, setImportDrawerOpen] = useState(false);
  const [importMethod, setImportMethod] = useState<'upload' | 'llm-prompt'>(
    'upload',
  );
  const [pastedJson, setPastedJson] = useState('');
  const [copiedPrompt, setCopiedPrompt] = useState(false);
  const [isParsingFile, setIsParsingFile] = useState(false);
  const [proposedImport, setProposedImport] =
    useState<ParsedResumeCandidate | null>(null);
  const [duplicateStrategy, setDuplicateStrategy] = useState<'merge' | 'skip'>(
    'merge',
  );

  // New skill state
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillCategory, setNewSkillCategory] =
    useState<SkillCategory>('Languages');
  const [newSkillAliases, setNewSkillAliases] = useState('');
  const [newSkillRelated, setNewSkillRelated] = useState('');

  const loadBank = useCallback(async () => {
    const loaded = await useCases.manageBank.getBank();
    setBank(loaded);
    const sorted = sortExperiencesChronologically(loaded.experiences);
    if (sorted[0]) {
      setExpandedRoleIds((prev) =>
        Object.keys(prev).length === 0 ? { [sorted[0].id]: true } : prev,
      );
    }
  }, [useCases]);

  useEffect(() => {
    void loadBank();
  }, [loadBank]);

  const persistBank = async (next: BankSnapshot) => {
    setBank(next);
    await useCases.manageBank.saveBank(next);
  };

  const allTags = useMemo(() => {
    if (!bank) return [];
    const counts = new Map<string, number>();
    for (const ach of bank.achievements) {
      for (const tag of ach.tags) {
        counts.set(tag, (counts.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(counts.entries())
      .filter(([, count]) => count >= 2)
      .sort((a, b) => b[1] - a[1]);
  }, [bank]);

  const sortedExperiences = useMemo(() => {
    if (!bank) return [];
    return sortExperiencesChronologically(bank.experiences);
  }, [bank]);

  // Only the most recent current role gets the filled timeline dot
  const mostRecentCurrentRoleId = useMemo(() => {
    const firstPresent = sortedExperiences.find((e) =>
      e.end.toLowerCase().includes('present') ||
      e.end.toLowerCase().includes('current'),
    );
    return firstPresent?.id ?? null;
  }, [sortedExperiences]);

  if (!bank) {
    return (
      <div className="p-8 text-sm text-ink-muted">
        Loading Experience Bank…
      </div>
    );
  }

  const q = searchQuery.trim().toLowerCase();

  // Open new role draft in drawer (saves only on confirm)
  const handleOpenAddRoleDrawer = () => {
    setRoleDraft({
      isNew: true,
      experience: {
        id: `exp-${Date.now()}`,
        company: '',
        title: '',
        location: '',
        start: '2024-01',
        end: 'Present',
      },
      initialAchievementAction: '',
      initialAchievementMetric: '',
      initialAchievementResult: '',
    });
  };

  const handleOpenEditRoleDrawer = (exp: Experience) => {
    setRoleDraft({
      isNew: false,
      experience: { ...exp },
    });
  };

  const handleConfirmRoleDraft = async () => {
    if (!roleDraft) return;
    const { experience, isNew } = roleDraft;
    const trimmedCompany = experience.company.trim();
    const trimmedTitle = experience.title.trim();
    if (!trimmedCompany || !trimmedTitle) {
      addToast('Enter both a role title and a company name.', 'warning');
      return;
    }

    const cleanExp: Experience = {
      ...experience,
      company: trimmedCompany,
      title: trimmedTitle,
      location: experience.location.trim() || 'Remote',
      start: experience.start.trim() || '2024-01',
      end: experience.end.trim() || 'Present',
    };

    if (isNew) {
      const nextAchievements = [...bank.achievements];
      if (
        roleDraft.initialAchievementAction?.trim() &&
        roleDraft.initialAchievementResult?.trim()
      ) {
        nextAchievements.push({
          id: `ach-${Date.now()}`,
          experienceId: cleanExp.id,
          action: roleDraft.initialAchievementAction.trim(),
          result: roleDraft.initialAchievementResult.trim(),
          metric: roleDraft.initialAchievementMetric?.trim() || undefined,
          skillIds: [],
          tags: [],
        });
      }
      const next: BankSnapshot = {
        ...bank,
        experiences: sortExperiencesChronologically([
          cleanExp,
          ...bank.experiences,
        ]),
        achievements: nextAchievements,
      };
      await persistBank(next);
      setExpandedRoleIds((prev) => ({ ...prev, [cleanExp.id]: true }));
      setRoleDraft(null);
      addToast(`Added role at ${cleanExp.company}.`, 'success');
    } else {
      const nextExps = sortExperiencesChronologically(
        bank.experiences.map((item) =>
          item.id === cleanExp.id ? cleanExp : item,
        ),
      );
      await persistBank({ ...bank, experiences: nextExps });
      setRoleDraft(null);
      addToast(`Updated role at ${cleanExp.company}.`, 'success');
    }
  };

  const handleDeleteRoleWithUndo = async (exp: Experience) => {
    const previousSnapshot = bank;
    const next: BankSnapshot = {
      ...bank,
      experiences: bank.experiences.filter((e) => e.id !== exp.id),
      achievements: bank.achievements.filter((a) => a.experienceId !== exp.id),
    };
    setRoleDraft(null);
    await persistBank(next);
    addToast(`Deleted role at ${exp.company}`, {
      variant: 'info',
      actionLabel: 'Undo',
      onAction: () => {
        void persistBank(previousSnapshot);
      },
    });
  };

  const handleAddAchievement = async (experienceId: string) => {
    const newAch: Achievement = {
      id: `ach-${Date.now()}`,
      experienceId,
      action: 'Implemented core system improvement',
      result: 'reducing operational overhead across production services',
      metric: 'by 25%',
      skillIds: [],
      tags: ['engineering'],
    };
    await persistBank({
      ...bank,
      achievements: [...bank.achievements, newAch],
    });
    setExpandedRoleIds((prev) => ({ ...prev, [experienceId]: true }));
    setEditingAchievementId(newAch.id);
  };

  const handleDeleteAchievementWithUndo = async (ach: Achievement) => {
    const previousSnapshot = bank;
    await persistBank({
      ...bank,
      achievements: bank.achievements.filter((a) => a.id !== ach.id),
    });
    addToast('Deleted achievement from Bank.', {
      variant: 'info',
      actionLabel: 'Undo',
      onAction: () => {
        void persistBank(previousSnapshot);
      },
    });
  };

  const handleAddSkill = async () => {
    if (!newSkillName.trim()) return;
    const created: Skill = normalizeBankSkill({
      id: `skill-${Date.now()}`,
      name: newSkillName.trim(),
      category: classifySkillCategory(newSkillName.trim(), newSkillCategory),
      aliases: newSkillAliases
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
      related: newSkillRelated
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    });
    await persistBank({
      ...bank,
      skills: [...bank.skills, created],
    });
    setNewSkillName('');
    setNewSkillAliases('');
    setNewSkillRelated('');
    addToast(`Added skill "${created.name}".`, 'success');
  };

  const handleDeleteSkillWithUndo = async (skill: Skill) => {
    const previousSnapshot = bank;
    await persistBank({
      ...bank,
      skills: bank.skills.filter((s) => s.id !== skill.id),
    });
    addToast(`Removed skill "${skill.name}".`, {
      variant: 'info',
      actionLabel: 'Undo',
      onAction: () => {
        void persistBank(previousSnapshot);
      },
    });
  };

  // Project Drawer handlers
  const handleOpenAddProject = () => {
    setProjectDraft({
      isNew: true,
      project: {
        id: `proj-${Date.now()}`,
        name: '',
        role: '',
        description: '',
        link: undefined,
        skillIds: [],
        highlights: [],
      },
      highlightsText: '',
    });
  };

  const handleOpenEditProject = (proj: Project) => {
    setProjectDraft({
      isNew: false,
      project: { ...proj },
      highlightsText: (proj.highlights ?? []).join('\n'),
    });
  };

  const handleConfirmProjectDraft = async () => {
    if (!projectDraft) return;
    const name = projectDraft.project.name.trim();
    if (!name) {
      addToast('Enter a project name.', 'warning');
      return;
    }
    const highlights = projectDraft.highlightsText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const saved: Project = {
      ...projectDraft.project,
      name,
      role: projectDraft.project.role.trim() || 'Maintainer',
      description: projectDraft.project.description.trim(),
      link: projectDraft.project.link?.trim() || undefined,
      highlights,
    };
    const nextProjects = projectDraft.isNew
      ? [...bank.projects, saved]
      : bank.projects.map((p) => (p.id === saved.id ? saved : p));
    await persistBank({ ...bank, projects: nextProjects });
    setProjectDraft(null);
    addToast(
      projectDraft.isNew
        ? `Added project "${saved.name}".`
        : `Updated project "${saved.name}".`,
      'success',
    );
  };

  const handleDeleteProjectWithUndo = async (proj: Project) => {
    const previousSnapshot = bank;
    setProjectDraft(null);
    await persistBank({
      ...bank,
      projects: bank.projects.filter((p) => p.id !== proj.id),
    });
    addToast(`Deleted project "${proj.name}"`, {
      variant: 'info',
      actionLabel: 'Undo',
      onAction: () => {
        void persistBank(previousSnapshot);
      },
    });
  };

  // Education Drawer handlers
  const handleOpenAddEducation = () => {
    setEducationDraft({
      isNew: true,
      education: {
        id: `edu-${Date.now()}`,
        institution: '',
        degree: '',
        field: '',
        location: '',
        start: '',
        end: '',
        highlights: '',
      },
    });
  };

  const handleOpenEditEducation = (edu: Education) => {
    setEducationDraft({
      isNew: false,
      education: { ...edu },
    });
  };

  const handleConfirmEducationDraft = async () => {
    if (!educationDraft) return;
    const institution = educationDraft.education.institution.trim();
    const degree = educationDraft.education.degree.trim();
    if (!institution || !degree) {
      addToast('Enter both institution and degree.', 'warning');
      return;
    }
    const saved: Education = {
      ...educationDraft.education,
      institution,
      degree,
      field: educationDraft.education.field.trim(),
      location: educationDraft.education.location.trim(),
      start: educationDraft.education.start.trim(),
      end: educationDraft.education.end.trim(),
      highlights: educationDraft.education.highlights?.trim() || undefined,
    };
    const nextEducations = educationDraft.isNew
      ? [...bank.educations, saved]
      : bank.educations.map((e) => (e.id === saved.id ? saved : e));
    await persistBank({ ...bank, educations: nextEducations });
    setEducationDraft(null);
    addToast(
      educationDraft.isNew
        ? `Added education at ${saved.institution}.`
        : `Updated education at ${saved.institution}.`,
      'success',
    );
  };

  const handleDeleteEducationWithUndo = async (edu: Education) => {
    const previousSnapshot = bank;
    setEducationDraft(null);
    await persistBank({
      ...bank,
      educations: bank.educations.filter((e) => e.id !== edu.id),
    });
    addToast(`Deleted education at ${edu.institution}`, {
      variant: 'info',
      actionLabel: 'Undo',
      onAction: () => {
        void persistBank(previousSnapshot);
      },
    });
  };

  // Certification Drawer handlers
  const handleOpenAddCertification = () => {
    setCertificationDraft({
      isNew: true,
      certification: {
        id: `cert-${Date.now()}`,
        name: '',
        issuer: '',
        date: new Date().getFullYear().toString(),
        credentialId: undefined,
      },
    });
  };

  const handleOpenEditCertification = (cert: Certification) => {
    setCertificationDraft({
      isNew: false,
      certification: { ...cert },
    });
  };

  const handleConfirmCertificationDraft = async () => {
    if (!certificationDraft) return;
    const name = certificationDraft.certification.name.trim();
    if (!name) {
      addToast('Enter a certification name.', 'warning');
      return;
    }
    const saved: Certification = {
      ...certificationDraft.certification,
      name,
      issuer: certificationDraft.certification.issuer.trim(),
      date: certificationDraft.certification.date.trim(),
      credentialId:
        certificationDraft.certification.credentialId?.trim() || undefined,
    };
    const nextCerts = certificationDraft.isNew
      ? [...bank.certifications, saved]
      : bank.certifications.map((c) => (c.id === saved.id ? saved : c));
    await persistBank({ ...bank, certifications: nextCerts });
    setCertificationDraft(null);
    addToast(
      certificationDraft.isNew
        ? `Added certification "${saved.name}".`
        : `Updated certification "${saved.name}".`,
      'success',
    );
  };

  const handleDeleteCertificationWithUndo = async (cert: Certification) => {
    const previousSnapshot = bank;
    setCertificationDraft(null);
    await persistBank({
      ...bank,
      certifications: bank.certifications.filter((c) => c.id !== cert.id),
    });
    addToast(`Deleted certification "${cert.name}"`, {
      variant: 'info',
      actionLabel: 'Undo',
      onAction: () => {
        void persistBank(previousSnapshot);
      },
    });
  };

  const handleFileUpload = async (file: File) => {
    setIsParsingFile(true);
    let res;
    if (file.name.toLowerCase().endsWith('.json')) {
      const text = await file.text();
      res = await useCases.importResumeFile.parseJsonAndPropose(
        text,
        file.name,
      );
    } else {
      res = await useCases.importResumeFile.parseAndPropose(file);
    }
    setIsParsingFile(false);
    if (!res.ok) {
      addToast(res.error.message, 'danger');
      return;
    }
    setProposedImport(res.value);
  };

  const handleCommitImport = async () => {
    if (!proposedImport) return;
    const res = await useCases.importResumeFile.commitImport(
      proposedImport,
      duplicateStrategy,
    );
    if (res.ok) {
      setBank(res.value);
      setProposedImport(null);
      setImportDrawerOpen(false);
      addToast('Imported resume into your Experience Bank.', 'success');
    }
  };

  const importFormats = useCases.listImportFormats.execute();
  const acceptedExts = [
    ...importFormats.flatMap((f) => f.extensions),
    '.json',
  ];
  const acceptedLabels = [
    ...importFormats.map((f) => f.label),
    'JSON backup or LLM export',
  ];

  const tabItems: Array<{
    value: BankSection;
    label: string;
    count?: number;
  }> = [
    {
      value: 'experience',
      label: 'Experience',
      count: bank.experiences.length,
    },
    {
      value: 'skills',
      label: 'Skills',
      count: bank.skills.length,
    },
    {
      value: 'projects',
      label: 'Projects',
      count: bank.projects.length,
    },
    {
      value: 'education',
      label: 'Education',
      count: bank.educations.length,
    },
    {
      value: 'certifications',
      label: 'Certifications',
      count: bank.certifications.length,
    },
    {
      value: 'profile',
      label: 'Contact & Header',
    },
  ];

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Experience Bank"
        subtitle="Everything Cevin can use in your resumes and letters."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={() => setImportDrawerOpen(true)}
            >
              <Upload className="w-4 h-4" />
              <span>Import resume</span>
            </Button>
            {activeSection === 'experience' && (
              <>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    const res =
                      await useCases.manageBank.mergeDuplicateExperiences();
                    setBank(res.snapshot);
                    addToast(
                      res.mergedCount > 0
                        ? `Merged ${formatCount(res.mergedCount, 'duplicate role')}.`
                        : 'No duplicate roles found.',
                      'info',
                    );
                  }}
                >
                  <span>Merge duplicates</span>
                </Button>
                <Button variant="primary" onClick={handleOpenAddRoleDrawer}>
                  <Plus className="w-4 h-4" />
                  <span>Add role</span>
                </Button>
              </>
            )}
          </div>
        }
      />

      {/* Underline Section Tabs with Right-Aligned Search & Tags (no outer card) */}
      <div className="border-b border-hairline flex flex-wrap items-center justify-between gap-4 pb-0">
        <div
          role="tablist"
          aria-label="Experience Bank sections"
          className="flex flex-wrap items-center gap-1 -mb-px"
        >
          {tabItems.map((tab) => {
            const active = activeSection === tab.value;
            return (
              <button
                key={tab.value}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveSection(tab.value)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 border-b-2 text-xs font-medium transition-colors cursor-pointer ${
                  active
                    ? 'border-accent text-ink font-semibold'
                    : 'border-transparent text-ink-muted hover:text-ink hover:border-border-strong'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[11px] tabular-nums ${
                      active
                        ? 'bg-accent-50 text-accent-700 font-semibold'
                        : 'bg-surface-sunken text-ink-muted'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {activeSection === 'experience' && (
          <div className="flex items-center gap-2 pb-2">
            {allTags.length > 0 && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant={selectedTag ? 'tonal' : 'secondary'}
                    size="sm"
                  >
                    <span>
                      {selectedTag ? `Tag: ${selectedTag}` : 'Tags'}
                    </span>
                    <ChevronDown className="w-3.5 h-3.5" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-64 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-ink">
                      Filter by tag
                    </span>
                    {selectedTag && (
                      <button
                        type="button"
                        onClick={() => setSelectedTag(null)}
                        className="text-accent hover:underline cursor-pointer"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {allTags.map(([tag, count]) => (
                      <button
                        key={tag}
                        type="button"
                        onClick={() =>
                          setSelectedTag(selectedTag === tag ? null : tag)
                        }
                        className={`px-2.5 py-1 rounded-sm text-xs font-medium transition-colors cursor-pointer ${
                          selectedTag === tag
                            ? 'bg-accent text-white font-semibold'
                            : 'bg-surface-sunken border border-hairline text-ink-muted hover:text-ink'
                        }`}
                      >
                        {tag}{' '}
                        <span className="opacity-75 tabular-nums">{count}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}

            <div className="relative w-72">
              <Search className="w-4 h-4 text-ink-subtle absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search achievements or metrics…"
                aria-label="Search achievements"
                className="pl-9"
              />
            </div>
          </div>
        )}
      </div>

      {/* SECTION 1: EXPERIENCE TIMELINE */}
      {activeSection === 'experience' && (
        <div className="space-y-4">
          {sortedExperiences.length === 0 ? (
            <EmptyState
              illustrationKind="bank"
              title="Your Experience Bank is empty"
              description="Import an existing PDF or Markdown resume, or add your first role to start tailoring."
              actionLabel="Import resume"
              onAction={() => setImportDrawerOpen(true)}
              secondaryActionLabel="Add role manually"
              onSecondaryAction={handleOpenAddRoleDrawer}
            />
          ) : (
            <div>
              {sortedExperiences.map((exp, idx) => {
                const roleAchievements = bank.achievements.filter((a) => {
                  if (a.experienceId !== exp.id) return false;
                  const matchesTag =
                    !selectedTag || a.tags.includes(selectedTag);
                  const matchesSearch =
                    !q ||
                    exp.company.toLowerCase().includes(q) ||
                    exp.title.toLowerCase().includes(q) ||
                    a.action.toLowerCase().includes(q) ||
                    a.result.toLowerCase().includes(q) ||
                    (a.metric ?? '').toLowerCase().includes(q) ||
                    a.tags.some((t) => t.toLowerCase().includes(q));
                  return matchesTag && matchesSearch;
                });

                const isExpanded = Boolean(expandedRoleIds[exp.id]);
                const isMostRecentCurrent = exp.id === mostRecentCurrentRoleId;
                const isLast = idx === sortedExperiences.length - 1;
                const needsDetails = isPlaceholderExperience(exp);

                return (
                  <TimelineRail
                    key={exp.id}
                    isCurrent={isMostRecentCurrent}
                    isLast={isLast}
                  >
                    <div className="group/role bg-surface border border-border rounded-xl shadow-xs overflow-hidden">
                      {/* Role Card Header */}
                      <div className="p-4 flex flex-wrap items-center justify-between gap-4 hover:bg-surface-sunken/40 transition-colors">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedRoleIds((prev) => ({
                              ...prev,
                              [exp.id]: !prev[exp.id],
                            }))
                          }
                          className="flex items-center gap-3 text-left flex-1 min-w-0 cursor-pointer"
                        >
                          <Avatar name={exp.company} size="sm" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-ink">
                                {exp.title}
                              </span>
                              <span className="text-ink-subtle">·</span>
                              <span className="text-sm font-medium text-ink">
                                {exp.company}
                              </span>
                              {needsDetails && (
                                <Badge tone="warning">Needs details</Badge>
                              )}
                            </div>
                            <div className="text-xs text-ink-muted tabular-nums mt-0.5">
                              {formatDocumentDateRange(exp.start, exp.end)}
                              {exp.location ? ` · ${exp.location}` : ''}
                            </div>
                          </div>
                        </button>

                        <div className="flex items-center gap-2">
                          <Badge tone="neutral">
                            {formatCount(roleAchievements.length, 'achievement')}
                          </Badge>
                          <div className="flex items-center gap-1.5 opacity-0 group-hover/role:opacity-100 group-focus-within/role:opacity-100 transition-opacity">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleOpenEditRoleDrawer(exp)}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              <span>Edit role</span>
                            </Button>
                            <Button
                              variant="secondary"
                              size="sm"
                              onClick={() => void handleAddAchievement(exp.id)}
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>Add achievement</span>
                            </Button>
                          </div>

                          <Popover>
                            <PopoverTrigger asChild>
                              <IconButton
                                label={`Role actions for ${exp.company}`}
                                size="sm"
                              >
                                <MoreHorizontal className="w-4 h-4" />
                              </IconButton>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-48 p-1">
                              <button
                                type="button"
                                onClick={() => handleOpenEditRoleDrawer(exp)}
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                                <span>Edit role</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleAddAchievement(exp.id)
                                }
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                              >
                                <Plus className="w-3.5 h-3.5" />
                                <span>Add achievement</span>
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  void handleDeleteRoleWithUndo(exp)
                                }
                                className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger-700 rounded-sm hover:bg-danger-50 text-left cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                                <span>Delete role</span>
                              </button>
                            </PopoverContent>
                          </Popover>

                          <IconButton
                            label={
                              isExpanded ? 'Collapse role' : 'Expand role'
                            }
                            size="sm"
                            onClick={() =>
                              setExpandedRoleIds((prev) => ({
                                ...prev,
                                [exp.id]: !prev[exp.id],
                              }))
                            }
                          >
                            {isExpanded ? (
                              <ChevronDown className="w-4 h-4" />
                            ) : (
                              <ChevronRight className="w-4 h-4" />
                            )}
                          </IconButton>
                        </div>
                      </div>

                      {/* Accordion Body: Clean Achievement Rows */}
                      {isExpanded && (
                        <div className="p-4 pt-3 border-t border-hairline space-y-2.5">
                          {roleAchievements.map((ach) => {
                            const isEditing = editingAchievementId === ach.id;
                            return (
                              <div
                                key={ach.id}
                                className="group p-3.5 rounded-lg border border-hairline bg-surface hover:border-border-strong transition-colors"
                              >
                                {!isEditing ? (
                                  <div className="flex items-start justify-between gap-4">
                                    <div
                                      onClick={() =>
                                        setEditingAchievementId(ach.id)
                                      }
                                      className="space-y-2 flex-1 cursor-pointer"
                                    >
                                      <p className="text-sm text-ink leading-relaxed">
                                        {assembleBulletText(ach)}
                                      </p>
                                      <div className="flex flex-wrap items-center gap-1.5">
                                        {ach.metric && (
                                          <MetricChip>{ach.metric}</MetricChip>
                                        )}
                                        {ach.tags.map((tag) => (
                                          <TagChip key={tag}>{tag}</TagChip>
                                        ))}
                                      </div>
                                    </div>

                                    {/* Edit button + ⋯ menu (no trash icon on row) */}
                                    <div className="flex items-center gap-1 shrink-0">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() =>
                                          setEditingAchievementId(ach.id)
                                        }
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                        <span>Edit</span>
                                      </Button>
                                      <Popover>
                                        <PopoverTrigger asChild>
                                          <IconButton
                                            label="Achievement options"
                                            size="sm"
                                          >
                                            <MoreHorizontal className="w-4 h-4" />
                                          </IconButton>
                                        </PopoverTrigger>
                                        <PopoverContent
                                          align="end"
                                          className="w-48 p-1"
                                        >
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setEditingAchievementId(ach.id)
                                            }
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                                          >
                                            <Edit3 className="w-3.5 h-3.5" />
                                            <span>Edit achievement</span>
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() =>
                                              void handleDeleteAchievementWithUndo(
                                                ach,
                                              )
                                            }
                                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger-700 rounded-sm hover:bg-danger-50 text-left cursor-pointer"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                            <span>Delete achievement</span>
                                          </button>
                                        </PopoverContent>
                                      </Popover>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="space-y-3">
                                    <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
                                      <div className="md:col-span-5">
                                        <label className="block text-xs font-medium text-ink-muted mb-1">
                                          Action (what you built or led)
                                        </label>
                                        <Input
                                          value={ach.action}
                                          onChange={(e) => {
                                            const nextAchs =
                                              bank.achievements.map((a) =>
                                                a.id === ach.id
                                                  ? {
                                                      ...a,
                                                      action: e.target.value,
                                                    }
                                                  : a,
                                              );
                                            void persistBank({
                                              ...bank,
                                              achievements: nextAchs,
                                            });
                                          }}
                                        />
                                      </div>
                                      <div className="md:col-span-3">
                                        <label className="block text-xs font-medium text-ink-muted mb-1">
                                          Metric / number
                                        </label>
                                        <Input
                                          value={ach.metric ?? ''}
                                          onChange={(e) => {
                                            const nextAchs =
                                              bank.achievements.map((a) =>
                                                a.id === ach.id
                                                  ? {
                                                      ...a,
                                                      metric: e.target.value,
                                                    }
                                                  : a,
                                              );
                                            void persistBank({
                                              ...bank,
                                              achievements: nextAchs,
                                            });
                                          }}
                                          placeholder="e.g. by 38%"
                                        />
                                      </div>
                                      <div className="md:col-span-4">
                                        <label className="block text-xs font-medium text-ink-muted mb-1">
                                          Result / impact
                                        </label>
                                        <Input
                                          value={ach.result}
                                          onChange={(e) => {
                                            const nextAchs =
                                              bank.achievements.map((a) =>
                                                a.id === ach.id
                                                  ? {
                                                      ...a,
                                                      result: e.target.value,
                                                    }
                                                  : a,
                                              );
                                            void persistBank({
                                              ...bank,
                                              achievements: nextAchs,
                                            });
                                          }}
                                        />
                                      </div>
                                    </div>

                                    <div className="flex flex-wrap items-center justify-between gap-3">
                                      <div className="flex items-center gap-2 flex-1 min-w-[240px]">
                                        <span className="text-xs text-ink-muted shrink-0">
                                          Tags:
                                        </span>
                                        <Input
                                          value={ach.tags.join(', ')}
                                          onChange={(e) => {
                                            const nextTags = e.target.value
                                              .split(',')
                                              .map((s) => s.trim())
                                              .filter(Boolean);
                                            const nextAchs =
                                              bank.achievements.map((a) =>
                                                a.id === ach.id
                                                  ? { ...a, tags: nextTags }
                                                  : a,
                                              );
                                            void persistBank({
                                              ...bank,
                                              achievements: nextAchs,
                                            });
                                          }}
                                          className="h-8 text-xs"
                                        />
                                      </div>
                                      <Button
                                        variant="primary"
                                        size="sm"
                                        onClick={() =>
                                          setEditingAchievementId(null)
                                        }
                                      >
                                        Done
                                      </Button>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </TimelineRail>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* SECTION 2: SKILLS GROUPED BY CATEGORY WITH POPOVER EDITOR */}
      {activeSection === 'skills' && (
        <div className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-6">
          <div className="flex flex-wrap items-end justify-between gap-4 p-4 rounded-lg bg-surface-sunken border border-hairline">
            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 flex-1">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Skill name
                </label>
                <Input
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  placeholder="e.g. OpenTelemetry"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Category
                </label>
                <Select<SkillCategory>
                  ariaLabel="Skill category"
                  value={newSkillCategory}
                  onValueChange={setNewSkillCategory}
                  options={SKILL_CATEGORIES.map((c) => ({
                    value: c,
                    label: c,
                  }))}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Synonyms / aliases
                </label>
                <Input
                  value={newSkillAliases}
                  onChange={(e) => setNewSkillAliases(e.target.value)}
                  placeholder="OTel"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Related skills (partial match)
                </label>
                <Input
                  value={newSkillRelated}
                  onChange={(e) => setNewSkillRelated(e.target.value)}
                  placeholder="Prometheus, Grafana"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="primary" onClick={() => void handleAddSkill()}>
                <Plus className="w-4 h-4" />
                <span>Add skill</span>
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  const res = await useCases.manageBank.mergeDuplicateSkills();
                  setBank(res.snapshot);
                  addToast(
                    res.mergedCount > 0
                      ? `Merged ${formatCount(res.mergedCount, 'duplicate skill')}.`
                      : 'No duplicate skills found.',
                    'info',
                  );
                }}
              >
                Merge duplicates
              </Button>
            </div>
          </div>

          <div className="space-y-5">
            {SKILL_CATEGORIES.map((category) => {
              const catSkills = bank.skills.filter(
                (s) => s.category === category,
              );
              if (catSkills.length === 0) return null;

              return (
                <div key={category} className="space-y-2.5">
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-semibold text-ink">
                      {category}
                    </h3>
                    <Badge tone="neutral">{catSkills.length}</Badge>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {catSkills.map((skill) => (
                      <Popover key={skill.id}>
                        <PopoverTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-surface-sunken hover:bg-accent-50 border border-hairline hover:border-accent/30 text-xs font-medium text-ink transition-colors cursor-pointer"
                          >
                            <span>{skill.name}</span>
                            {skill.aliases.length > 0 && (
                              <span className="text-ink-subtle">
                                ({skill.aliases.join(', ')})
                              </span>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-72 space-y-3">
                          <div className="text-xs font-semibold text-ink">
                            Edit skill
                          </div>
                          <div>
                            <label className="block text-xs text-ink-muted mb-1">
                              Name
                            </label>
                            <Input
                              value={skill.name}
                              onChange={(e) => {
                                const nextSkills = bank.skills.map((s) =>
                                  s.id === skill.id
                                    ? { ...s, name: e.target.value }
                                    : s,
                                );
                                void persistBank({
                                  ...bank,
                                  skills: nextSkills,
                                });
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-ink-muted mb-1">
                              Category
                            </label>
                            <Select<SkillCategory>
                              ariaLabel="Edit skill category"
                              value={skill.category}
                              onValueChange={(nextCat) => {
                                const nextSkills = bank.skills.map((s) =>
                                  s.id === skill.id
                                    ? { ...s, category: nextCat }
                                    : s,
                                );
                                void persistBank({
                                  ...bank,
                                  skills: nextSkills,
                                });
                              }}
                              options={SKILL_CATEGORIES.map((c) => ({
                                value: c,
                                label: c,
                              }))}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-ink-muted mb-1">
                              Synonyms / aliases (comma-separated)
                            </label>
                            <Input
                              value={skill.aliases.join(', ')}
                              onChange={(e) => {
                                const aliases = e.target.value
                                  .split(',')
                                  .map((a) => a.trim())
                                  .filter(Boolean);
                                const nextSkills = bank.skills.map((s) =>
                                  s.id === skill.id ? { ...s, aliases } : s,
                                );
                                void persistBank({
                                  ...bank,
                                  skills: nextSkills,
                                });
                              }}
                            />
                          </div>
                          <div>
                            <label className="block text-xs text-ink-muted mb-1">
                              Related skills (partial coverage)
                            </label>
                            <Input
                              value={(skill.related ?? []).join(', ')}
                              onChange={(e) => {
                                const related = e.target.value
                                  .split(',')
                                  .map((a) => a.trim())
                                  .filter(Boolean);
                                const nextSkills = bank.skills.map((s) =>
                                  s.id === skill.id ? { ...s, related } : s,
                                );
                                void persistBank({
                                  ...bank,
                                  skills: nextSkills,
                                });
                              }}
                            />
                          </div>
                          <div className="pt-2 border-t border-hairline flex justify-between items-center">
                            <button
                              type="button"
                              onClick={() =>
                                void handleDeleteSkillWithUndo(skill)
                              }
                              className="inline-flex items-center gap-1 text-xs text-danger-700 hover:underline cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete skill</span>
                            </button>
                          </div>
                        </PopoverContent>
                      </Popover>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* SECTION 3: PROJECTS (Read-First Cards + Edit Drawer + ⋯ Delete) */}
      {activeSection === 'projects' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-ink">
              Projects ({bank.projects.length})
            </h2>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenAddProject}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add project</span>
            </Button>
          </div>
          {bank.projects.length === 0 ? (
            <div className="p-8 text-center bg-surface border border-dashed border-hairline rounded-xl text-ink-muted text-sm">
              No projects added yet. Click &quot;Add project&quot; to add open-source libraries, tools, or portfolio projects.
            </div>
          ) : (
            <div className="space-y-3">
              {bank.projects.map((proj) => (
                <div
                  key={proj.id}
                  className="p-4 rounded-xl bg-surface border border-border shadow-xs flex items-start justify-between gap-4"
                >
                  <div className="space-y-1.5 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <FolderGit2 className="w-4 h-4 text-accent shrink-0" />
                      <span className="text-sm font-semibold text-ink">
                        {proj.name}
                      </span>
                      {proj.role && (
                        <>
                          <span className="text-ink-subtle">·</span>
                          <span className="text-xs font-medium text-ink-muted">
                            {proj.role}
                          </span>
                        </>
                      )}
                      {proj.link && (
                        <a
                          href={
                            proj.link.startsWith('http')
                              ? proj.link
                              : `https://${proj.link}`
                          }
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-accent hover:underline"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>{proj.link}</span>
                        </a>
                      )}
                    </div>
                    {proj.description && (
                      <p className="text-xs text-ink leading-relaxed">
                        {proj.description}
                      </p>
                    )}
                    {(proj.highlights ?? []).length > 0 && (
                      <ul className="list-disc list-inside text-xs text-ink-muted space-y-0.5 pt-0.5">
                        {(proj.highlights ?? []).map((h, i) => (
                          <li key={i}>{h}</li>
                        ))}
                      </ul>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditProject(proj)}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <IconButton
                          label={`Project options for ${proj.name}`}
                          size="sm"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </IconButton>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-44 p-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditProject(proj)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit project</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => void handleDeleteProjectWithUndo(proj)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger-700 rounded-sm hover:bg-danger-50 text-left cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete project</span>
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 4: EDUCATION (Read-First Cards + Edit Drawer + ⋯ Delete) */}
      {activeSection === 'education' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-ink">
              Education ({bank.educations.length})
            </h2>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenAddEducation}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add education</span>
            </Button>
          </div>
          {bank.educations.length === 0 ? (
            <div className="p-8 text-center bg-surface border border-dashed border-hairline rounded-xl text-ink-muted text-sm">
              No education entries added yet. Click &quot;Add education&quot; to add degrees or academic credentials.
            </div>
          ) : (
            <div className="space-y-3">
              {bank.educations.map((edu) => (
                <div
                  key={edu.id}
                  className="p-4 rounded-xl bg-surface border border-border shadow-xs flex items-start justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <GraduationCap className="w-4 h-4 text-accent shrink-0" />
                      <span className="text-sm font-semibold text-ink">
                        {edu.degree}
                        {edu.field ? ` in ${edu.field}` : ''}
                      </span>
                      <span className="text-ink-subtle">·</span>
                      <span className="text-sm font-medium text-ink">
                        {edu.institution}
                      </span>
                    </div>
                    <div className="text-xs text-ink-muted tabular-nums">
                      {formatDocumentDateRange(edu.start, edu.end)}
                      {edu.location ? ` · ${edu.location}` : ''}
                    </div>
                    {edu.highlights && (
                      <p className="text-xs text-ink-muted pt-0.5">
                        {edu.highlights}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditEducation(edu)}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <IconButton
                          label={`Education options for ${edu.institution}`}
                          size="sm"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </IconButton>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-44 p-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditEducation(edu)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit education</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteEducationWithUndo(edu)
                          }
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger-700 rounded-sm hover:bg-danger-50 text-left cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete education</span>
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 5: CERTIFICATIONS (Read-First Cards + Edit Drawer + ⋯ Delete) */}
      {activeSection === 'certifications' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-ink">
              Certifications ({bank.certifications.length})
            </h2>
            <Button
              variant="primary"
              size="sm"
              onClick={handleOpenAddCertification}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add certification</span>
            </Button>
          </div>

          {bank.certifications.length === 0 ? (
            <div className="p-8 text-center bg-surface border border-dashed border-hairline rounded-xl text-ink-muted text-sm">
              No certifications added yet. Click &quot;Add certification&quot; to include credentials like CKA, AWS, or PMP.
            </div>
          ) : (
            <div className="space-y-3">
              {bank.certifications.map((cert) => (
                <div
                  key={cert.id}
                  className="p-4 rounded-xl bg-surface border border-border shadow-xs flex items-start justify-between gap-4"
                >
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Award className="w-4 h-4 text-accent shrink-0" />
                      <span className="text-sm font-semibold text-ink">
                        {cert.name}
                      </span>
                      {cert.issuer && (
                        <>
                          <span className="text-ink-subtle">·</span>
                          <span className="text-xs font-medium text-ink-muted">
                            {cert.issuer}
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-xs text-ink-muted tabular-nums">
                      {cert.date}
                      {cert.credentialId ? ` · Code: ${cert.credentialId}` : ''}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEditCertification(cert)}
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Edit</span>
                    </Button>
                    <Popover>
                      <PopoverTrigger asChild>
                        <IconButton
                          label={`Certification options for ${cert.name}`}
                          size="sm"
                        >
                          <MoreHorizontal className="w-4 h-4" />
                        </IconButton>
                      </PopoverTrigger>
                      <PopoverContent align="end" className="w-48 p-1">
                        <button
                          type="button"
                          onClick={() => handleOpenEditCertification(cert)}
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Edit certification</span>
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            void handleDeleteCertificationWithUndo(cert)
                          }
                          className="w-full flex items-center gap-2 px-3 py-2 text-xs text-danger-700 rounded-sm hover:bg-danger-50 text-left cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Delete certification</span>
                        </button>
                      </PopoverContent>
                    </Popover>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 6: PROFILE & CONTACT (Neutral placeholders) */}
      {activeSection === 'profile' && (
        <div className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-6 max-w-3xl">
          <div>
            <h2 className="text-base font-display font-semibold text-ink">
              Contact & Header
            </h2>
            <p className="text-xs text-ink-muted mt-1">
              Your contact details and links appear in your resume and cover letter headers.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">
                Full name
              </label>
              <Input
                value={bank.profile.name}
                onChange={(e) =>
                  void persistBank({
                    ...bank,
                    profile: { ...bank.profile, name: e.target.value },
                  })
                }
                placeholder="Full name"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">
                Default headline
              </label>
              <Input
                value={bank.profile.headline}
                onChange={(e) =>
                  void persistBank({
                    ...bank,
                    profile: { ...bank.profile, headline: e.target.value },
                  })
                }
                placeholder="e.g. Staff Platform Engineer"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">
                Email
              </label>
              <Input
                value={bank.profile.email}
                onChange={(e) =>
                  void persistBank({
                    ...bank,
                    profile: { ...bank.profile, email: e.target.value },
                  })
                }
                placeholder="name@example.com"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink-muted mb-1">
                Phone
              </label>
              <Input
                value={bank.profile.phone}
                onChange={(e) =>
                  void persistBank({
                    ...bank,
                    profile: { ...bank.profile, phone: e.target.value },
                  })
                }
                placeholder="+1 (555) 000-0000"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-ink-muted mb-1">
                Location
              </label>
              <Input
                value={bank.profile.location}
                onChange={(e) =>
                  void persistBank({
                    ...bank,
                    profile: { ...bank.profile, location: e.target.value },
                  })
                }
                placeholder="City, Region, Country"
              />
            </div>
          </div>

          {/* Online Links: GitHub, LinkedIn, Portfolio */}
          <div className="pt-4 border-t border-hairline space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-ink">
                Online Links & Profiles
              </h3>
              <p className="text-xs text-ink-muted mt-0.5">
                Leave any field empty to exclude it from your header.
              </p>
            </div>

            {(() => {
              const cleanLinks = bank.profile.links.filter(
                (l) =>
                  !l.url.includes('rostova.systems') &&
                  !l.url.includes('elena-rostova') &&
                  !l.url.includes('erostova'),
              );
              const ghVal =
                cleanLinks.find((l) => l.label.toLowerCase() === 'github')
                  ?.url ?? '';
              const liVal =
                cleanLinks.find((l) => l.label.toLowerCase() === 'linkedin')
                  ?.url ?? '';
              const portVal =
                cleanLinks.find((l) =>
                  [
                    'portfolio',
                    'website',
                    'site',
                    'personal website',
                  ].includes(l.label.toLowerCase()),
                )?.url ?? '';

              const handleUpdateOnlineLinks = (
                newGh: string,
                newLi: string,
                newPort: string,
              ) => {
                const next: Array<{ label: string; url: string }> = [];
                if (newGh.trim())
                  next.push({ label: 'GitHub', url: newGh.trim() });
                if (newLi.trim())
                  next.push({ label: 'LinkedIn', url: newLi.trim() });
                if (newPort.trim())
                  next.push({ label: 'Portfolio', url: newPort.trim() });
                void persistBank({
                  ...bank,
                  profile: {
                    ...bank.profile,
                    links: next,
                  },
                });
              };

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-ink-muted mb-1">
                      GitHub Profile URL
                    </label>
                    <Input
                      value={ghVal}
                      onChange={(e) =>
                        handleUpdateOnlineLinks(e.target.value, liVal, portVal)
                      }
                      placeholder="github.com/username"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-ink-muted mb-1">
                      LinkedIn Profile URL
                    </label>
                    <Input
                      value={liVal}
                      onChange={(e) =>
                        handleUpdateOnlineLinks(ghVal, e.target.value, portVal)
                      }
                      placeholder="linkedin.com/in/username"
                    />
                  </div>

                  <div className="sm:col-span-2">
                    <label className="block text-xs font-medium text-ink-muted mb-1">
                      Personal Website / Portfolio URL
                    </label>
                    <Input
                      value={portVal}
                      onChange={(e) =>
                        handleUpdateOnlineLinks(ghVal, liVal, e.target.value)
                      }
                      placeholder="example.dev"
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Role Add / Edit Drawer (saves only on confirm) */}
      <Drawer
        open={Boolean(roleDraft)}
        onOpenChange={(open) => {
          if (!open) setRoleDraft(null);
        }}
        title={
          roleDraft?.isNew
            ? 'Add Role'
            : `Edit Role — ${roleDraft?.experience.company || 'Role'}`
        }
        description="Enter employer, role title, location, and dates. Changes are saved when you confirm."
      >
        {roleDraft && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Role title
              </label>
              <Input
                value={roleDraft.experience.title}
                onChange={(e) =>
                  setRoleDraft({
                    ...roleDraft,
                    experience: {
                      ...roleDraft.experience,
                      title: e.target.value,
                    },
                  })
                }
                placeholder="e.g. Staff Platform Engineer"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Company
              </label>
              <Input
                value={roleDraft.experience.company}
                onChange={(e) =>
                  setRoleDraft({
                    ...roleDraft,
                    experience: {
                      ...roleDraft.experience,
                      company: e.target.value,
                    },
                  })
                }
                placeholder="e.g. Vanguard Telemetry"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Start date (YYYY-MM)
                </label>
                <Input
                  value={roleDraft.experience.start}
                  onChange={(e) =>
                    setRoleDraft({
                      ...roleDraft,
                      experience: {
                        ...roleDraft.experience,
                        start: e.target.value,
                      },
                    })
                  }
                  placeholder="2023-02"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  End date (YYYY-MM or Present)
                </label>
                <Input
                  value={roleDraft.experience.end}
                  onChange={(e) =>
                    setRoleDraft({
                      ...roleDraft,
                      experience: {
                        ...roleDraft.experience,
                        end: e.target.value,
                      },
                    })
                  }
                  placeholder="Present"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Location
              </label>
              <Input
                value={roleDraft.experience.location}
                onChange={(e) =>
                  setRoleDraft({
                    ...roleDraft,
                    experience: {
                      ...roleDraft.experience,
                      location: e.target.value,
                    },
                  })
                }
                placeholder="San Francisco, CA / Remote"
              />
            </div>

            {roleDraft.isNew && (
              <div className="pt-3 border-t border-hairline space-y-3">
                <div className="text-xs font-semibold text-ink">
                  First achievement (optional)
                </div>
                <div>
                  <label className="block text-xs text-ink-muted mb-1">
                    Action (what you built or led)
                  </label>
                  <Input
                    value={roleDraft.initialAchievementAction ?? ''}
                    onChange={(e) =>
                      setRoleDraft({
                        ...roleDraft,
                        initialAchievementAction: e.target.value,
                      })
                    }
                    placeholder="e.g. Engineered multi-region ingestion pipeline"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">
                      Metric / number
                    </label>
                    <Input
                      value={roleDraft.initialAchievementMetric ?? ''}
                      onChange={(e) =>
                        setRoleDraft({
                          ...roleDraft,
                          initialAchievementMetric: e.target.value,
                        })
                      }
                      placeholder="e.g. by 38%"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-ink-muted mb-1">
                      Result / impact
                    </label>
                    <Input
                      value={roleDraft.initialAchievementResult ?? ''}
                      onChange={(e) =>
                        setRoleDraft({
                          ...roleDraft,
                          initialAchievementResult: e.target.value,
                        })
                      }
                      placeholder="e.g. cutting cross-AZ spend"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="pt-4 border-t border-hairline flex items-center justify-between">
              {!roleDraft.isNew ? (
                <Button
                  variant="outline-danger"
                  size="sm"
                  onClick={() =>
                    void handleDeleteRoleWithUndo(roleDraft.experience)
                  }
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete role</span>
                </Button>
              ) : (
                <div />
              )}
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setRoleDraft(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => void handleConfirmRoleDraft()}
                >
                  {roleDraft.isNew ? 'Add role' : 'Save role'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </Drawer>

      {/* Project Add / Edit Drawer */}
      <Drawer
        open={Boolean(projectDraft)}
        onOpenChange={(open) => {
          if (!open) setProjectDraft(null);
        }}
        title={
          projectDraft?.isNew
            ? 'Add Project'
            : `Edit Project — ${projectDraft?.project.name || 'Project'}`
        }
        description="Update project name, role, link, description, and key highlights."
      >
        {projectDraft && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Project name
              </label>
              <Input
                value={projectDraft.project.name}
                onChange={(e) =>
                  setProjectDraft({
                    ...projectDraft,
                    project: { ...projectDraft.project, name: e.target.value },
                  })
                }
                placeholder="e.g. kube-cost-lens"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Role
              </label>
              <Input
                value={projectDraft.project.role}
                onChange={(e) =>
                  setProjectDraft({
                    ...projectDraft,
                    project: { ...projectDraft.project, role: e.target.value },
                  })
                }
                placeholder="e.g. Creator & Maintainer"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Project link (optional)
              </label>
              <Input
                value={projectDraft.project.link ?? ''}
                onChange={(e) =>
                  setProjectDraft({
                    ...projectDraft,
                    project: {
                      ...projectDraft.project,
                      link: e.target.value,
                    },
                  })
                }
                placeholder="https://github.com/username/project"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Description
              </label>
              <Textarea
                rows={3}
                value={projectDraft.project.description}
                onChange={(e) =>
                  setProjectDraft({
                    ...projectDraft,
                    project: {
                      ...projectDraft.project,
                      description: e.target.value,
                    },
                  })
                }
                placeholder="Short summary of what the project does"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Highlights (one per line, optional)
              </label>
              <Textarea
                rows={3}
                value={projectDraft.highlightsText}
                onChange={(e) =>
                  setProjectDraft({
                    ...projectDraft,
                    highlightsText: e.target.value,
                  })
                }
                placeholder="Measurable outcomes or technical highlights"
              />
            </div>
            <div className="pt-4 border-t border-hairline flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setProjectDraft(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleConfirmProjectDraft()}
              >
                {projectDraft.isNew ? 'Add project' : 'Save project'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Education Add / Edit Drawer */}
      <Drawer
        open={Boolean(educationDraft)}
        onOpenChange={(open) => {
          if (!open) setEducationDraft(null);
        }}
        title={
          educationDraft?.isNew
            ? 'Add Education'
            : `Edit Education — ${educationDraft?.education.institution || 'Education'}`
        }
        description="Update institution, degree, field of study, and dates."
      >
        {educationDraft && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Institution
              </label>
              <Input
                value={educationDraft.education.institution}
                onChange={(e) =>
                  setEducationDraft({
                    ...educationDraft,
                    education: {
                      ...educationDraft.education,
                      institution: e.target.value,
                    },
                  })
                }
                placeholder="e.g. University of Waterloo"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Degree
                </label>
                <Input
                  value={educationDraft.education.degree}
                  onChange={(e) =>
                    setEducationDraft({
                      ...educationDraft,
                      education: {
                        ...educationDraft.education,
                        degree: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g. B.S."
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Field of study
                </label>
                <Input
                  value={educationDraft.education.field}
                  onChange={(e) =>
                    setEducationDraft({
                      ...educationDraft,
                      education: {
                        ...educationDraft.education,
                        field: e.target.value,
                      },
                    })
                  }
                  placeholder="e.g. Computer Science"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Start date
                </label>
                <Input
                  value={educationDraft.education.start}
                  onChange={(e) =>
                    setEducationDraft({
                      ...educationDraft,
                      education: {
                        ...educationDraft.education,
                        start: e.target.value,
                      },
                    })
                  }
                  placeholder="2014"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  End date
                </label>
                <Input
                  value={educationDraft.education.end}
                  onChange={(e) =>
                    setEducationDraft({
                      ...educationDraft,
                      education: {
                        ...educationDraft.education,
                        end: e.target.value,
                      },
                    })
                  }
                  placeholder="2018"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Location (optional)
              </label>
              <Input
                value={educationDraft.education.location}
                onChange={(e) =>
                  setEducationDraft({
                    ...educationDraft,
                    education: {
                      ...educationDraft.education,
                      location: e.target.value,
                    },
                  })
                }
                placeholder="City, Region"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Honors or coursework (optional)
              </label>
              <Input
                value={educationDraft.education.highlights ?? ''}
                onChange={(e) =>
                  setEducationDraft({
                    ...educationDraft,
                    education: {
                      ...educationDraft.education,
                      highlights: e.target.value,
                    },
                  })
                }
                placeholder="e.g. Honors, Distributed Systems Lab"
              />
            </div>
            <div className="pt-4 border-t border-hairline flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setEducationDraft(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleConfirmEducationDraft()}
              >
                {educationDraft.isNew ? 'Add education' : 'Save education'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Certification Add / Edit Drawer */}
      <Drawer
        open={Boolean(certificationDraft)}
        onOpenChange={(open) => {
          if (!open) setCertificationDraft(null);
        }}
        title={
          certificationDraft?.isNew
            ? 'Add Certification'
            : `Edit Certification — ${certificationDraft?.certification.name || 'Certification'}`
        }
        description="Update certification name, issuing organization, and year."
      >
        {certificationDraft && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Certification name
              </label>
              <Input
                value={certificationDraft.certification.name}
                onChange={(e) =>
                  setCertificationDraft({
                    ...certificationDraft,
                    certification: {
                      ...certificationDraft.certification,
                      name: e.target.value,
                    },
                  })
                }
                placeholder="e.g. Certified Kubernetes Administrator (CKA)"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Issuing organization
              </label>
              <Input
                value={certificationDraft.certification.issuer}
                onChange={(e) =>
                  setCertificationDraft({
                    ...certificationDraft,
                    certification: {
                      ...certificationDraft.certification,
                      issuer: e.target.value,
                    },
                  })
                }
                placeholder="e.g. Cloud Native Computing Foundation"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Date / year
                </label>
                <Input
                  value={certificationDraft.certification.date}
                  onChange={(e) =>
                    setCertificationDraft({
                      ...certificationDraft,
                      certification: {
                        ...certificationDraft.certification,
                        date: e.target.value,
                      },
                    })
                  }
                  placeholder="2024"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Credential code (optional)
                </label>
                <Input
                  value={certificationDraft.certification.credentialId ?? ''}
                  onChange={(e) =>
                    setCertificationDraft({
                      ...certificationDraft,
                      certification: {
                        ...certificationDraft.certification,
                        credentialId: e.target.value,
                      },
                    })
                  }
                  placeholder="CNCF-12345"
                />
              </div>
            </div>
            <div className="pt-4 border-t border-hairline flex items-center justify-end gap-2">
              <Button
                variant="secondary"
                onClick={() => setCertificationDraft(null)}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                onClick={() => void handleConfirmCertificationDraft()}
              >
                {certificationDraft.isNew
                  ? 'Add certification'
                  : 'Save certification'}
              </Button>
            </div>
          </div>
        )}
      </Drawer>

      {/* Import Resume Drawer */}
      <Drawer
        open={importDrawerOpen}
        onOpenChange={(open) => {
          setImportDrawerOpen(open);
          if (!open) {
            setProposedImport(null);
            setPastedJson('');
          }
        }}
        title="Import Resume into Experience Bank"
        description="Upload a resume file (PDF, Markdown, JSON) or copy a prompt to structure your CV as JSON."
      >
        <div className="space-y-4">
          <SegmentedControl<'upload' | 'llm-prompt'>
            ariaLabel="Import method"
            value={importMethod}
            onValueChange={(val) => {
              setImportMethod(val);
              setProposedImport(null);
            }}
            options={[
              { value: 'upload', label: 'Upload file (PDF, MD, JSON)' },
              { value: 'llm-prompt', label: 'JSON prompt & paste' },
            ]}
          />

          {importMethod === 'upload' ? (
            <div className="space-y-3">
              <FileDropzone
                acceptedExtensions={acceptedExts}
                acceptedLabels={acceptedLabels}
                isBusy={isParsingFile}
                onFileSelected={(file) => void handleFileUpload(file)}
              />
              <div className="flex items-center justify-between text-xs text-ink-muted px-1">
                <span>Prefer to structure your resume using a JSON prompt?</span>
                <button
                  type="button"
                  onClick={() => setImportMethod('llm-prompt')}
                  className="text-accent font-semibold hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Copy prompt</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 text-xs">
              <div className="p-3.5 rounded-lg bg-surface-sunken border border-hairline space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold text-ink inline-flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-accent" />
                    <span>Step 1: Copy JSON format prompt</span>
                  </span>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(
                        EXTERNAL_LLM_PROMPT_TEMPLATE,
                      );
                      setCopiedPrompt(true);
                      setTimeout(() => setCopiedPrompt(false), 2000);
                      addToast('Copied prompt to clipboard.', 'success');
                    }}
                  >
                    {copiedPrompt ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-success" />
                        <span>Copied!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy prompt</span>
                      </>
                    )}
                  </Button>
                </div>
                <p className="text-ink-muted text-[11px] leading-relaxed">
                  Paste this prompt along with your resume text into an LLM to format your profile, roles, achievements, and skills as JSON.
                </p>
                <div className="relative rounded-md bg-canvas border border-border p-2.5 max-h-32 overflow-y-auto font-mono text-[11px] text-ink-muted leading-relaxed">
                  {EXTERNAL_LLM_PROMPT_TEMPLATE}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-ink">
                  Step 2: Paste the JSON output
                </label>
                <textarea
                  value={pastedJson}
                  onChange={(e) => setPastedJson(e.target.value)}
                  placeholder={`{\n  "profile": { "name": "..." },\n  "experiences": [ ... ],\n  "skills": [ ... ]\n}`}
                  rows={6}
                  className="w-full rounded-md border border-border bg-surface p-2.5 font-mono text-xs text-ink placeholder:text-ink-muted focus:border-accent focus:outline-hidden focus:ring-1 focus:ring-accent"
                />
                <div className="flex justify-end">
                  <Button
                    variant="primary"
                    size="sm"
                    disabled={!pastedJson.trim() || isParsingFile}
                    onClick={async () => {
                      setIsParsingFile(true);
                      const res =
                        await useCases.importResumeFile.parseJsonAndPropose(
                          pastedJson,
                          'JSON Import',
                        );
                      setIsParsingFile(false);
                      if (res.ok) {
                        setProposedImport(res.value);
                      } else {
                        addToast(res.error.message, 'danger');
                      }
                    }}
                  >
                    {isParsingFile ? (
                      <CevinStatusIndicator
                        state="thinking"
                        size={16}
                        variant="glyph"
                        label="Cevin is reading your resume"
                        className="text-white"
                      />
                    ) : (
                      <span>Parse & review JSON</span>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {proposedImport && (
            <div className="space-y-4 p-4 rounded-lg bg-surface-sunken border border-hairline text-xs">
              <div className="font-semibold text-ink">
                Proposed import from {proposedImport.rawDocument.fileName}
              </div>
              <div className="text-ink-muted">
                Found{' '}
                {formatCount(proposedImport.proposedExperiences.length, 'role')}{' '}
                and{' '}
                {formatCount(proposedImport.proposedSkills.length, 'skill')}.
              </div>
              <div className="flex items-center justify-between">
                <span>Duplicate handling:</span>
                <SegmentedControl<'merge' | 'skip'>
                  ariaLabel="Duplicate strategy"
                  size="sm"
                  value={duplicateStrategy}
                  onValueChange={setDuplicateStrategy}
                  options={[
                    { value: 'merge', label: 'Merge' },
                    { value: 'skip', label: 'Skip' },
                  ]}
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setProposedImport(null)}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => void handleCommitImport()}
                >
                  Commit to Bank
                </Button>
              </div>
            </div>
          )}
        </div>
      </Drawer>
    </div>
  );
}
