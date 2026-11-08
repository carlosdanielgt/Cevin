import { ResumeTemplate, TemplateCatalog } from '../../../core/application';
import { TemplateId } from '../../../core/domain';

/**
 * Registry of ATS-safe single-column resume templates.
 * Extension point: add a new template entry here to make it available across Studio & Exporters.
 */
export const REGISTERED_TEMPLATES: ResumeTemplate[] = [
  {
    id: 'classic',
    label: 'Classic Editorial',
    description:
      'Traditional serif headings with crisp horizontal rules and generous margins.',
    fontFamily: 'serif',
    density: 'comfortable',
  },
  {
    id: 'modern',
    label: 'Modern Technical',
    description:
      'Clean geometric sans-serif throughout with balanced line spacing for engineering roles.',
    fontFamily: 'sans',
    density: 'balanced',
  },
  {
    id: 'compact',
    label: 'Compact High-Density',
    description:
      'Tighter vertical rhythm and tabular dates to fit extensive experience onto a single page.',
    fontFamily: 'mono-accent',
    density: 'compact',
  },
];

export function createTemplateCatalog(): TemplateCatalog {
  return {
    list() {
      return [...REGISTERED_TEMPLATES];
    },
    getById(id: TemplateId) {
      return (
        REGISTERED_TEMPLATES.find((t) => t.id === id) ?? REGISTERED_TEMPLATES[0]
      );
    },
  };
}
