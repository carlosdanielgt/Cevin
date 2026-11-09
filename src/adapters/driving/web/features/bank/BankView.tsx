import {
  Award,
  Briefcase,
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Edit3,
  FolderGit2,
  GraduationCap,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  User,
  Wrench,
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
  formatCount,
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
];

const EXTERNAL_LLM_PROMPT_TEMPLATE = `Please convert my attached CV / resume into the following JSON structure for the Cevin Experience Bank.
Return ONLY valid raw JSON with no markdown wrapping and no conversational prose.

{
  "profile": {
    "name": "Full Name",
    "headline": "Professional Headline",
    "email": "email@example.com",
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
      "aliases": ["Alias"]
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

Valid categories for skills are ONLY: "Languages", "Frameworks", "Infrastructure", "Data & AI", "Practices", or "Tools".
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

  // Drawers & inline edit states
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [editingAchievementId, setEditingAchievementId] = useState<
    string | null
  >(null);
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

  const loadBank = useCallback(async () => {
    const loaded = await useCases.manageBank.getBank();
    setBank(loaded);
    if (loaded.experiences[0]) {
      setExpandedRoleIds((prev) =>
        Object.keys(prev).length === 0
          ? { [loaded.experiences[0].id]: true }
          : prev,
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

  if (!bank) {
    return (
      <div className="p-8 text-sm text-ink-muted">
        Loading Experience Bank…
      </div>
    );
  }

  const q = searchQuery.trim().toLowerCase();

  const handleAddRole = async () => {
    const newId = `exp-${Date.now()}`;
    const newExp: Experience = {
      id: newId,
      company: 'New Company',
      title: 'Senior Software Engineer',
      location: 'Remote',
      start: '2024',
      end: 'Present',
    };
    const newAch: Achievement = {
      id: `ach-${Date.now()}`,
      experienceId: newId,
      action: 'Designed and shipped core production service',
      result: 'improving reliability across customer workloads',
      metric: 'by 30%',
      skillIds: [],
      tags: ['backend'],
    };
    const next: BankSnapshot = {
      ...bank,
      experiences: [newExp, ...bank.experiences],
      achievements: [newAch, ...bank.achievements],
    };
    await persistBank(next);
    setExpandedRoleIds((prev) => ({ ...prev, [newId]: true }));
    setEditingRoleId(newId);
    addToast('Added new role to your Experience Bank.', 'success');
  };

  const handleDeleteRoleWithUndo = async (exp: Experience) => {
    const previousSnapshot = bank;
    const next: BankSnapshot = {
      ...bank,
      experiences: bank.experiences.filter((e) => e.id !== exp.id),
      achievements: bank.achievements.filter((a) => a.experienceId !== exp.id),
    };
    setEditingRoleId(null);
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
      action: 'Implemented key architectural improvement',
      result: 'reducing operational overhead for the engineering team',
      metric: 'by 25%',
      skillIds: [],
      tags: ['architecture'],
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
    const created: Skill = {
      id: `skill-${Date.now()}`,
      name: newSkillName.trim(),
      category: newSkillCategory,
      aliases: newSkillAliases
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    await persistBank({
      ...bank,
      skills: [...bank.skills, created],
    });
    setNewSkillName('');
    setNewSkillAliases('');
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

  const editingRole =
    bank.experiences.find((e) => e.id === editingRoleId) ?? null;

  const importFormats = useCases.listImportFormats.execute();
  const acceptedExts = [
    ...importFormats.flatMap((f) => f.extensions),
    '.json',
  ];
  const acceptedLabels = [
    ...importFormats.map((f) => f.label),
    'JSON backup or LLM export',
  ];

  return (
    <div className="space-y-6 pb-16">
      <PageHeader
        title="Experience Bank"
        subtitle="Your central library of verified roles, quantified achievements, and skills. Cevin selects and rephrases from this Bank and never invents facts."
        actions={
          <div className="flex items-center gap-2.5">
            <Button
              variant="secondary"
              onClick={() => setImportDrawerOpen(true)}
            >
              <Upload className="w-4 h-4" />
              <span>Import resume</span>
            </Button>
            {activeSection === 'experience' && (
              <Button variant="primary" onClick={() => void handleAddRole()}>
                <Plus className="w-4 h-4" />
                <span>Add role</span>
              </Button>
            )}
          </div>
        }
      />

      {/* Top Section Switcher & Search */}
      <div className="bg-surface border border-border rounded-xl p-3 shadow-xs flex flex-wrap items-center justify-between gap-4">
        <SegmentedControl<BankSection>
          ariaLabel="Experience Bank sections"
          value={activeSection}
          onValueChange={setActiveSection}
          options={[
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
          ]}
        />

        {activeSection === 'experience' && (
          <div className="flex items-center gap-2">
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

          {bank.experiences.length === 0 ? (
            <EmptyState
              illustrationKind="bank"
              title="Your Experience Bank is empty"
              description="Import an existing PDF or Markdown resume, or add your first role to start tailoring."
              actionLabel="Import resume"
              onAction={() => setImportDrawerOpen(true)}
              secondaryActionLabel="Add role manually"
              onSecondaryAction={() => void handleAddRole()}
            />
          ) : (
            <div>
              {bank.experiences.map((exp, idx) => {
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
                const isCurrent = exp.end.toLowerCase().includes('present');
                const isLast = idx === bank.experiences.length - 1;

                return (
                  <TimelineRail
                    key={exp.id}
                    isCurrent={isCurrent}
                    isLast={isLast}
                  >
                    <div className="group/role bg-surface border border-border rounded-xl shadow-xs overflow-hidden">
                      {/* Role Card Header: 36px Avatar, Role · Company, dates, count badge, hover/focus-within Edit role + Add achievement + ⋯ overflow menu, chevron */}
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
                              <span className="text-sm font-medium text-ink-muted">
                                {exp.company}
                              </span>
                            </div>
                            <div className="text-xs text-ink-subtle tabular-nums mt-0.5">
                              {exp.start} – {exp.end} · {exp.location}
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
                              onClick={() => setEditingRoleId(exp.id)}
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
                                onClick={() => setEditingRoleId(exp.id)}
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

                      {/* Accordion Body: Clean Achievement Rows (no inline role metadata inputs) */}
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

                                    {/* Hover Edit button + ⋯ menu (no red trash icon on row) */}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 flex-1">
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
                  Aliases (comma-separated)
                </label>
                <Input
                  value={newSkillAliases}
                  onChange={(e) => setNewSkillAliases(e.target.value)}
                  placeholder="OTel, OpenTelemetry Collector"
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
                              Aliases (comma-separated)
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

      {/* SECTION 3: PROJECTS */}
      {activeSection === 'projects' && (
        <div className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-ink">
              Projects ({bank.projects.length})
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const newProj: Project = {
                  id: `proj-${Date.now()}`,
                  name: 'New Project',
                  role: 'Creator & Maintainer',
                  description: 'High-performance open-source library or tool.',
                  skillIds: [],
                  highlights: [],
                };
                await persistBank({
                  ...bank,
                  projects: [...bank.projects, newProj],
                });
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add project</span>
            </Button>
          </div>
          <div className="space-y-3">
            {bank.projects.map((proj) => (
              <div
                key={proj.id}
                className="p-4 rounded-lg bg-surface-sunken/60 border border-hairline space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    value={proj.name}
                    onChange={(e) => {
                      const next = bank.projects.map((p) =>
                        p.id === proj.id ? { ...p, name: e.target.value } : p,
                      );
                      void persistBank({ ...bank, projects: next });
                    }}
                    placeholder="Project name"
                  />
                  <Input
                    value={proj.role}
                    onChange={(e) => {
                      const next = bank.projects.map((p) =>
                        p.id === proj.id ? { ...p, role: e.target.value } : p,
                      );
                      void persistBank({ ...bank, projects: next });
                    }}
                    placeholder="Role"
                  />
                </div>
                <Input
                  value={proj.link ?? ''}
                  onChange={(e) => {
                    const next = bank.projects.map((p) =>
                      p.id === proj.id
                        ? { ...p, link: e.target.value.trim() || undefined }
                        : p,
                    );
                    void persistBank({ ...bank, projects: next });
                  }}
                  placeholder="Project Link (e.g. https://github.com/user/repo) — rendered in PROJECTS section"
                />
                <Textarea
                  rows={2}
                  value={proj.description}
                  onChange={(e) => {
                    const next = bank.projects.map((p) =>
                      p.id === proj.id
                        ? { ...p, description: e.target.value }
                        : p,
                    );
                    void persistBank({ ...bank, projects: next });
                  }}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 4: EDUCATION */}
      {activeSection === 'education' && (
        <div className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-display font-semibold text-ink">
              Education ({bank.educations.length})
            </h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const newEdu: Education = {
                  id: `edu-${Date.now()}`,
                  institution: 'University Name',
                  degree: 'B.S.',
                  field: 'Computer Science',
                  location: '',
                  start: '2016',
                  end: '2020',
                };
                await persistBank({
                  ...bank,
                  educations: [...bank.educations, newEdu],
                });
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add education</span>
            </Button>
          </div>
          <div className="space-y-3">
            {bank.educations.map((edu) => (
              <div
                key={edu.id}
                className="p-4 rounded-lg bg-surface-sunken/60 border border-hairline space-y-3"
              >
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-medium text-ink-muted mb-1">
                      Institution
                    </label>
                    <Input
                      value={edu.institution}
                      onChange={(e) => {
                        const next = bank.educations.map((item) =>
                          item.id === edu.id
                            ? { ...item, institution: e.target.value }
                            : item,
                        );
                        void persistBank({ ...bank, educations: next });
                      }}
                      placeholder="e.g. Concordia University"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-ink-muted mb-1">
                      Degree
                    </label>
                    <Input
                      value={edu.degree}
                      onChange={(e) => {
                        const next = bank.educations.map((item) =>
                          item.id === edu.id
                            ? { ...item, degree: e.target.value }
                            : item,
                        );
                        void persistBank({ ...bank, educations: next });
                      }}
                      placeholder="e.g. Master"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-ink-muted mb-1">
                      Field of study
                    </label>
                    <Input
                      value={edu.field}
                      onChange={(e) => {
                        const next = bank.educations.map((item) =>
                          item.id === edu.id
                            ? { ...item, field: e.target.value }
                            : item,
                        );
                        void persistBank({ ...bank, educations: next });
                      }}
                      placeholder="e.g. Applied Computer Science"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-end">
                  <div className="sm:col-span-5">
                    <label className="block text-[11px] font-medium text-ink-muted mb-1">
                      Location (optional)
                    </label>
                    <Input
                      value={edu.location}
                      onChange={(e) => {
                        const next = bank.educations.map((item) =>
                          item.id === edu.id
                            ? { ...item, location: e.target.value }
                            : item,
                        );
                        void persistBank({ ...bank, educations: next });
                      }}
                      placeholder="e.g. Montreal, QC (or leave blank)"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-medium text-ink-muted mb-1">
                      Start year
                    </label>
                    <Input
                      value={edu.start}
                      onChange={(e) => {
                        const next = bank.educations.map((item) =>
                          item.id === edu.id
                            ? { ...item, start: e.target.value }
                            : item,
                        );
                        void persistBank({ ...bank, educations: next });
                      }}
                      placeholder="e.g. 2014"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <label className="block text-[11px] font-medium text-ink-muted mb-1">
                      End year / Present
                    </label>
                    <Input
                      value={edu.end}
                      onChange={(e) => {
                        const next = bank.educations.map((item) =>
                          item.id === edu.id
                            ? { ...item, end: e.target.value }
                            : item,
                        );
                        void persistBank({ ...bank, educations: next });
                      }}
                      placeholder="e.g. 2018"
                    />
                  </div>
                  <div className="sm:col-span-1 flex justify-end">
                    <IconButton
                      label="Delete education"
                      size="sm"
                      onClick={() => {
                        const next = bank.educations.filter(
                          (item) => item.id !== edu.id,
                        );
                        void persistBank({ ...bank, educations: next });
                      }}
                    >
                      <Trash2 className="w-4 h-4 text-warning-700" />
                    </IconButton>
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-medium text-ink-muted mb-1">
                    Honors, GPA, or highlights (optional)
                  </label>
                  <Input
                    value={edu.highlights ?? ''}
                    onChange={(e) => {
                      const next = bank.educations.map((item) =>
                        item.id === edu.id
                          ? { ...item, highlights: e.target.value }
                          : item,
                      );
                      void persistBank({ ...bank, educations: next });
                    }}
                    placeholder="e.g. Cum Laude, Teaching Assistant (or leave blank)"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 5: CERTIFICATIONS */}
      {activeSection === 'certifications' && (
        <div className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-display font-semibold text-ink">
                Certifications ({bank.certifications.length})
              </h2>
              <p className="text-xs text-ink-muted mt-0.5">
                Industry credentials and certifications displayed in your resume certifications section.
              </p>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={async () => {
                const newCert: Certification = {
                  id: `cert-${Date.now()}`,
                  name: 'New Certification',
                  issuer: 'Issuing Organization',
                  date: new Date().getFullYear().toString(),
                };
                await persistBank({
                  ...bank,
                  certifications: [...bank.certifications, newCert],
                });
              }}
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add certification</span>
            </Button>
          </div>

          {bank.certifications.length === 0 ? (
            <div className="p-8 text-center border border-dashed border-hairline rounded-lg text-ink-muted text-sm">
              No certifications added yet. Click &quot;Add certification&quot; to include credentials like AWS, CKA, PMP, or Scrum certificates.
            </div>
          ) : (
            <div className="space-y-3">
              {bank.certifications.map((cert) => (
                <div
                  key={cert.id}
                  className="p-4 rounded-lg bg-surface-sunken/60 border border-hairline space-y-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="font-medium text-sm text-ink flex items-center gap-2">
                      <Award className="w-4 h-4 text-accent" />
                      <span>{cert.name || 'Untitled Certification'}</span>
                    </div>
                    <IconButton
                      size="sm"
                      label="Delete certification"
                      onClick={() => {
                        const next = bank.certifications.filter(
                          (c) => c.id !== cert.id,
                        );
                        void persistBank({ ...bank, certifications: next });
                      }}
                    >
                      <Trash2 className="w-3.5 h-3.5 text-warning-700" />
                    </IconButton>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-ink-muted mb-1">
                        Certification Name
                      </label>
                      <Input
                        value={cert.name}
                        onChange={(e) => {
                          const next = bank.certifications.map((c) =>
                            c.id === cert.id
                              ? { ...c, name: e.target.value }
                              : c,
                          );
                          void persistBank({ ...bank, certifications: next });
                        }}
                        placeholder="e.g. Certified Kubernetes Administrator (CKA)"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-muted mb-1">
                        Date / Year
                      </label>
                      <Input
                        value={cert.date}
                        onChange={(e) => {
                          const next = bank.certifications.map((c) =>
                            c.id === cert.id
                              ? { ...c, date: e.target.value }
                              : c,
                          );
                          void persistBank({ ...bank, certifications: next });
                        }}
                        placeholder="e.g. 2024"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-medium text-ink-muted mb-1">
                        Issuing Organization
                      </label>
                      <Input
                        value={cert.issuer}
                        onChange={(e) => {
                          const next = bank.certifications.map((c) =>
                            c.id === cert.id
                              ? { ...c, issuer: e.target.value }
                              : c,
                          );
                          void persistBank({ ...bank, certifications: next });
                        }}
                        placeholder="e.g. Cloud Native Computing Foundation"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-ink-muted mb-1">
                        Credential reference or URL (optional)
                      </label>
                      <Input
                        value={cert.credentialId ?? ''}
                        onChange={(e) => {
                          const next = bank.certifications.map((c) =>
                            c.id === cert.id
                              ? {
                                  ...c,
                                  credentialId:
                                    e.target.value.trim() || undefined,
                                }
                              : c,
                          );
                          void persistBank({ ...bank, certifications: next });
                        }}
                        placeholder="e.g. CNCF-12345"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* SECTION 6: PROFILE & CONTACT */}
      {activeSection === 'profile' && (
        <div className="bg-surface border border-border rounded-xl p-6 shadow-xs space-y-6 max-w-3xl">
          <div>
            <h2 className="text-base font-display font-semibold text-ink">
              Candidate Contact & Default Header
            </h2>
            <p className="text-xs text-ink-muted mt-1">
              Your contact details and social links appear directly in your resume and cover letter headers.
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
                placeholder="e.g. Carlos Garcia"
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
                placeholder="e.g. Senior Software Developer"
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
                placeholder="e.g. carlosdan3@gmail.com"
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
                placeholder="e.g. +1 (438) 30-40025"
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
                placeholder="e.g. Montreal, Quebec, Canada"
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
                These links appear in your resume header. Leave any field empty to exclude it.
              </p>
            </div>

            {(() => {
              // Purge legacy demo links like rostova.systems
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
                      placeholder="e.g. github.com/CarlosDan"
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
                      placeholder="e.g. linkedin.com/in/carlos-garcia"
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
                      placeholder="e.g. carlosgarcia.dev"
                    />
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Role Metadata Editor Drawer */}
      <Drawer
        open={Boolean(editingRole)}
        onOpenChange={(open) => {
          if (!open) setEditingRoleId(null);
        }}
        title={editingRole ? `Edit Role — ${editingRole.company}` : 'Edit Role'}
        description="Update employer, role title, location, and dates."
      >
        {editingRole && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Role title
              </label>
              <Input
                value={editingRole.title}
                onChange={(e) => {
                  const nextExps = bank.experiences.map((item) =>
                    item.id === editingRole.id
                      ? { ...item, title: e.target.value }
                      : item,
                  );
                  void persistBank({ ...bank, experiences: nextExps });
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Company
              </label>
              <Input
                value={editingRole.company}
                onChange={(e) => {
                  const nextExps = bank.experiences.map((item) =>
                    item.id === editingRole.id
                      ? { ...item, company: e.target.value }
                      : item,
                  );
                  void persistBank({ ...bank, experiences: nextExps });
                }}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  Start date
                </label>
                <Input
                  value={editingRole.start}
                  onChange={(e) => {
                    const nextExps = bank.experiences.map((item) =>
                      item.id === editingRole.id
                        ? { ...item, start: e.target.value }
                        : item,
                    );
                    void persistBank({ ...bank, experiences: nextExps });
                  }}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-ink mb-1">
                  End date
                </label>
                <Input
                  value={editingRole.end}
                  onChange={(e) => {
                    const nextExps = bank.experiences.map((item) =>
                      item.id === editingRole.id
                        ? { ...item, end: e.target.value }
                        : item,
                    );
                    void persistBank({ ...bank, experiences: nextExps });
                  }}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-medium text-ink mb-1">
                Location
              </label>
              <Input
                value={editingRole.location}
                onChange={(e) => {
                  const nextExps = bank.experiences.map((item) =>
                    item.id === editingRole.id
                      ? { ...item, location: e.target.value }
                      : item,
                  );
                  void persistBank({ ...bank, experiences: nextExps });
                }}
              />
            </div>

            <div className="pt-4 border-t border-hairline flex items-center justify-between">
              <Button
                variant="outline-danger"
                size="sm"
                onClick={() => void handleDeleteRoleWithUndo(editingRole)}
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete role</span>
              </Button>
              <Button variant="primary" onClick={() => setEditingRoleId(null)}>
                Done
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
        description="Upload a resume file (PDF, Markdown, JSON) or copy our prompt to parse your CV with Claude, ChatGPT, or Gemini."
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
              { value: 'llm-prompt', label: 'External LLM prompt & paste' },
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
                <span>Want to map your CV using Claude, ChatGPT, or Gemini?</span>
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
                    <span>Step 1: Copy prompt for Claude / ChatGPT / Gemini</span>
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
                      addToast('Copied LLM prompt to clipboard.', 'success');
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
                  Paste this prompt along with your CV or markdown file into
                  your preferred LLM. It maps your profile, roles, achievements,
                  and skills directly to Cevin’s structure.
                </p>
                <div className="relative rounded-md bg-canvas border border-border p-2.5 max-h-32 overflow-y-auto font-mono text-[11px] text-ink-muted leading-relaxed">
                  {EXTERNAL_LLM_PROMPT_TEMPLATE}
                </div>
              </div>

              <div className="space-y-2">
                <label className="block font-semibold text-ink">
                  Step 2: Paste the JSON returned by your LLM
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
                          'External LLM',
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
