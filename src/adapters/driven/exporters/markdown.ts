import { DocumentExporter, ExportOptions } from '../../../core/application';
import {
  CoverLetterDocument,
  ExportableDocument,
  ResumeDocument,
  formatContactBlock,
} from '../../../core/domain';

export function renderCoverLetterToMarkdown(doc: CoverLetterDocument): string {
  const lines: string[] = [];
  const contact = formatContactBlock(doc.header);

  lines.push(`# ${doc.header.name}`);
  if (doc.header.headline.trim()) {
    lines.push(`**${doc.header.headline.trim()}**`);
  }
  if (contact.line1.length > 0) lines.push(contact.line1.join(' · '));
  if (contact.line2.length > 0) {
    lines.push(contact.line2.map((l) => l.display).join(' · '));
  }
  lines.push('');

  lines.push(doc.dateLine);
  lines.push(`**${doc.recipientLine}**`);
  lines.push('');

  for (const block of doc.blocks) {
    if (block.text.trim()) {
      lines.push(block.text.trim());
      lines.push('');
    }
  }

  return `${lines.join('\n').trim()}\n`;
}

export function renderResumeToMarkdown(doc: ResumeDocument): string {
  const lines: string[] = [];
  const contact = formatContactBlock(doc.header);

  lines.push(`# ${doc.header.name}`);
  if (doc.header.headline.trim()) {
    lines.push(`**${doc.header.headline.trim()}**`);
  }
  if (contact.line1.length > 0) lines.push(contact.line1.join(' · '));
  if (contact.line2.length > 0) {
    lines.push(contact.line2.map((l) => l.display).join(' · '));
  }
  lines.push('');

  if (doc.summary.trim()) {
    lines.push('## SUMMARY');
    lines.push(doc.summary.trim());
    lines.push('');
  }

  if (doc.experiences.length > 0) {
    lines.push('## EXPERIENCE');
    for (const exp of doc.experiences) {
      const roleLeft = `${exp.title}, ${exp.company}${exp.location ? ` · ${exp.location}` : ''}`;
      lines.push(`### **${roleLeft}** ${exp.dateRange}`);
      for (const bullet of exp.bullets) {
        lines.push(`- ${bullet.text.trim()}`);
      }
      lines.push('');
    }
  }

  if (doc.projects.length > 0) {
    lines.push('## PROJECTS');
    for (const proj of doc.projects) {
      const headerParts = [proj.name];
      if (proj.role.trim()) headerParts.push(`— ${proj.role.trim()}`);
      if (proj.link?.trim()) headerParts.push(`· ${proj.link.trim()}`);
      lines.push(`### ${headerParts.join(' ')}`);
      if (proj.description.trim()) lines.push(proj.description.trim());
      for (const h of proj.highlights) {
        if (h.trim()) lines.push(`- ${h.trim()}`);
      }
      lines.push('');
    }
  }

  if (doc.skillsByCategory.length > 0) {
    lines.push('## SKILLS');
    for (const group of doc.skillsByCategory) {
      lines.push(`**${group.category}:** ${group.skills.join(', ')}`);
    }
    lines.push('');
  }

  if (doc.educations.length > 0) {
    lines.push('## EDUCATION');
    for (const edu of doc.educations) {
      const eduLeft = `${edu.institution} — ${edu.degreeLine}${edu.location ? ` · ${edu.location}` : ''}`;
      lines.push(`**${eduLeft}** ${edu.dateRange}`);
      if (edu.highlights?.trim()) lines.push(edu.highlights.trim());
    }
    lines.push('');
  }

  if (doc.certifications.length > 0) {
    lines.push('## CERTIFICATIONS');
    for (const cert of doc.certifications) {
      lines.push(`**${cert.name}** — ${cert.issuer} ${cert.date}`);
    }
    lines.push('');
  }

  return `${lines.join('\n').trim()}\n`;
}

export function renderDocumentToMarkdown(doc: ExportableDocument): string {
  if (doc.kind === 'coverLetter') {
    return renderCoverLetterToMarkdown(doc);
  }
  return renderResumeToMarkdown(doc);
}

/**
 * Clean, ATS-safe Markdown exporter supporting both Resumes and Cover Letters.
 * Output matches `documentToPlainText(doc)` modulo Markdown formatting.
 */
export const markdownResumeExporter: DocumentExporter = {
  id: 'markdown',
  label: 'Markdown (.md)',
  fileExtension: 'md',
  mimeType: 'text/markdown;charset=utf-8',
  supports: ['resume', 'coverLetter'],
  capabilities: {
    templates: false,
    atsRoundTrip: false,
  },
  async export(doc: ExportableDocument, _options: ExportOptions): Promise<Blob> {
    const markdown = renderDocumentToMarkdown(doc);
    return new Blob([markdown], { type: 'text/markdown;charset=utf-8' });
  },
};
