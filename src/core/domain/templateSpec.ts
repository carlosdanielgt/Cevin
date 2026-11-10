import { PositionedText } from './appeal';
import { formatContactBlock } from './bulletAssembler';
import {
  CoverLetterDocument,
  ExportableDocument,
  PageSize,
  ResumeDocument,
  TemplateId,
} from './entities';
import { fnv1aHash } from './harness';

export const TEMPLATE_SPEC_VERSION = '2.0.0';

export interface PageDimensions {
  widthPt: number;
  heightPt: number;
}

export const PAGE_SIZES: Record<PageSize, PageDimensions> = {
  letter: {
    widthPt: 612,
    heightPt: 792,
  },
  a4: {
    widthPt: 595.28,
    heightPt: 841.89,
  },
};

export type TemplateFontFamily = 'Fraunces' | 'PlusJakartaSans';

export interface TemplateSpec {
  id: TemplateId;
  version: string;
  label: string;
  description: string;
  fonts: {
    nameFont: TemplateFontFamily;
    nameWeight: 600 | 700;
    headingFont: TemplateFontFamily;
    headingWeight: 600 | 700;
    bodyFont: 'PlusJakartaSans';
    bodyWeight: 400;
    boldFont: 'PlusJakartaSans';
    boldWeight: 600 | 700;
  };
  sizes: {
    namePt: number;
    headlinePt: number;
    contactPt: number;
    sectionHeadingPt: number;
    roleTitlePt: number;
    bodyPt: number;
    metaPt: number;
  };
  lineHeights: {
    name: number;
    heading: number;
    body: number;
    bullet: number;
  };
  margins: {
    topPt: number; // >= 43.2pt (0.6 in)
    bottomPt: number;
    leftPt: number;
    rightPt: number;
  };
  sectionSpacingPt: {
    afterHeader: number;
    beforeSection: number;
    afterSectionHeading: number;
    betweenRoles: number;
    afterRoleHeader: number;
    betweenBullets: number;
    afterParagraph: number;
  };
  ruleStyle: {
    kind: 'hairline' | 'accent-bar' | 'subtle';
    thicknessPt: number;
    gapBelowHeadingPt: number;
    colorRgb: [number, number, number];
  };
  bullet: {
    glyph: '•';
    bulletOffsetPt: number;
    hangingIndentPt: number;
  };
  dateAlignment: 'right';
  headlinePlacement: 'below-name' | 'inline-with-name';
  rhythmScaling: {
    sparseThresholdRatio: number; // 0.75
    maxExpandFactor: number; // 1.20 (+20%)
    overflowTightenThresholdRatio: number; // 0.08 (8%)
    minTightenFactor: number; // 0.88
  };
  pageSize: PageSize;
  pageDimensions: PageDimensions;
}

const BASE_TEMPLATE_SPECS: Record<
  TemplateId,
  Omit<TemplateSpec, 'pageSize' | 'pageDimensions'>
> = {
  classic: {
    id: 'classic',
    version: TEMPLATE_SPEC_VERSION,
    label: 'Classic Editorial',
    description:
      'Fraunces serif display headings with hairline section rules and Plus Jakarta Sans body text.',
    fonts: {
      nameFont: 'Fraunces',
      nameWeight: 700,
      headingFont: 'Fraunces',
      headingWeight: 600,
      bodyFont: 'PlusJakartaSans',
      bodyWeight: 400,
      boldFont: 'PlusJakartaSans',
      boldWeight: 600,
    },
    sizes: {
      namePt: 20,
      headlinePt: 11,
      contactPt: 9.25,
      sectionHeadingPt: 9.5,
      roleTitlePt: 10.25,
      bodyPt: 9.75,
      metaPt: 9.25,
    },
    lineHeights: {
      name: 1.2,
      heading: 1.25,
      body: 1.38,
      bullet: 1.36,
    },
    margins: {
      topPt: 48, // 0.67 in (>= 0.6 in)
      bottomPt: 46,
      leftPt: 48,
      rightPt: 48,
    },
    sectionSpacingPt: {
      afterHeader: 12,
      beforeSection: 12,
      afterSectionHeading: 7,
      betweenRoles: 9,
      afterRoleHeader: 4,
      betweenBullets: 3.5,
      afterParagraph: 8,
    },
    ruleStyle: {
      kind: 'hairline',
      thicknessPt: 0.6,
      gapBelowHeadingPt: 3.5,
      colorRgb: [0.78, 0.75, 0.7],
    },
    bullet: {
      glyph: '•',
      bulletOffsetPt: 2,
      hangingIndentPt: 12,
    },
    dateAlignment: 'right',
    headlinePlacement: 'inline-with-name',
    rhythmScaling: {
      sparseThresholdRatio: 0.75,
      maxExpandFactor: 1.2,
      overflowTightenThresholdRatio: 0.08,
      minTightenFactor: 0.88,
    },
  },
  modern: {
    id: 'modern',
    version: TEMPLATE_SPEC_VERSION,
    label: 'Modern Technical',
    description:
      'Clean Plus Jakarta Sans geometry throughout with crisp rules and balanced engineering spacing.',
    fonts: {
      nameFont: 'PlusJakartaSans',
      nameWeight: 700,
      headingFont: 'PlusJakartaSans',
      headingWeight: 700,
      bodyFont: 'PlusJakartaSans',
      bodyWeight: 400,
      boldFont: 'PlusJakartaSans',
      boldWeight: 600,
    },
    sizes: {
      namePt: 19.5,
      headlinePt: 10.75,
      contactPt: 9,
      sectionHeadingPt: 9.25,
      roleTitlePt: 10,
      bodyPt: 9.5,
      metaPt: 9,
    },
    lineHeights: {
      name: 1.18,
      heading: 1.22,
      body: 1.36,
      bullet: 1.34,
    },
    margins: {
      topPt: 46, // 0.64 in (>= 0.6 in)
      bottomPt: 45,
      leftPt: 46,
      rightPt: 46,
    },
    sectionSpacingPt: {
      afterHeader: 11,
      beforeSection: 11,
      afterSectionHeading: 6.5,
      betweenRoles: 8.5,
      afterRoleHeader: 3.5,
      betweenBullets: 3.25,
      afterParagraph: 7.5,
    },
    ruleStyle: {
      kind: 'accent-bar',
      thicknessPt: 0.75,
      gapBelowHeadingPt: 3.5,
      colorRgb: [0.68, 0.72, 0.78],
    },
    bullet: {
      glyph: '•',
      bulletOffsetPt: 2,
      hangingIndentPt: 11.5,
    },
    dateAlignment: 'right',
    headlinePlacement: 'inline-with-name',
    rhythmScaling: {
      sparseThresholdRatio: 0.75,
      maxExpandFactor: 1.2,
      overflowTightenThresholdRatio: 0.08,
      minTightenFactor: 0.88,
    },
  },
  compact: {
    id: 'compact',
    version: TEMPLATE_SPEC_VERSION,
    label: 'Compact High-Density',
    description:
      'Tighter vertical rhythm and inline headline placement to fit extensive experience cleanly on one page.',
    fonts: {
      nameFont: 'PlusJakartaSans',
      nameWeight: 700,
      headingFont: 'PlusJakartaSans',
      headingWeight: 700,
      bodyFont: 'PlusJakartaSans',
      bodyWeight: 400,
      boldFont: 'PlusJakartaSans',
      boldWeight: 600,
    },
    sizes: {
      namePt: 17.5,
      headlinePt: 10,
      contactPt: 8.75,
      sectionHeadingPt: 8.75,
      roleTitlePt: 9.5,
      bodyPt: 9,
      metaPt: 8.75,
    },
    lineHeights: {
      name: 1.15,
      heading: 1.2,
      body: 1.3,
      bullet: 1.28,
    },
    margins: {
      topPt: 43.2, // 0.60 in exact minimum
      bottomPt: 43.2,
      leftPt: 43.2,
      rightPt: 43.2,
    },
    sectionSpacingPt: {
      afterHeader: 9,
      beforeSection: 9,
      afterSectionHeading: 5.5,
      betweenRoles: 6.5,
      afterRoleHeader: 3,
      betweenBullets: 2.5,
      afterParagraph: 6.5,
    },
    ruleStyle: {
      kind: 'subtle',
      thicknessPt: 0.65,
      gapBelowHeadingPt: 3,
      colorRgb: [0.72, 0.72, 0.75],
    },
    bullet: {
      glyph: '•',
      bulletOffsetPt: 1.5,
      hangingIndentPt: 10.5,
    },
    dateAlignment: 'right',
    headlinePlacement: 'inline-with-name',
    rhythmScaling: {
      sparseThresholdRatio: 0.75,
      maxExpandFactor: 1.18,
      overflowTightenThresholdRatio: 0.08,
      minTightenFactor: 0.86,
    },
  },
};

export function getTemplateSpec(
  templateId: TemplateId = 'classic',
  pageSize: PageSize = 'letter',
): TemplateSpec {
  const base = BASE_TEMPLATE_SPECS[templateId] ?? BASE_TEMPLATE_SPECS.classic;
  const pageDimensions = PAGE_SIZES[pageSize] ?? PAGE_SIZES.letter;
  return {
    ...base,
    pageSize,
    pageDimensions,
  };
}

export function listTemplateSpecs(pageSize: PageSize = 'letter'): TemplateSpec[] {
  return (['classic', 'modern', 'compact'] as const).map((id) =>
    getTemplateSpec(id, pageSize),
  );
}

/**
 * Canonical plain-text representation of a ResumeDocument or CoverLetterDocument.
 * Used as the single ground truth for parity checks across PDF, Markdown, and Text exporters.
 */
export function documentToPlainText(doc: ExportableDocument): string {
  const lines: string[] = [];
  const contact = formatContactBlock(doc.header);

  if (doc.kind === 'coverLetter') {
    lines.push(doc.header.name);
    if (doc.header.headline.trim()) {
      lines.push(doc.header.headline.trim());
    }
    if (contact.line1.length > 0) {
      lines.push(contact.line1.join(' · '));
    }
    if (contact.line2.length > 0) {
      lines.push(contact.line2.map((l) => l.display).join(' · '));
    }
    lines.push('');
    lines.push(doc.dateLine);
    lines.push(doc.recipientLine);
    lines.push('');

    for (const block of doc.blocks) {
      if (block.text.trim()) {
        lines.push(block.text.trim());
        lines.push('');
      }
    }

    return lines.join('\n').trim() + '\n';
  }

  // ResumeDocument
  lines.push(doc.header.name);
  if (doc.header.headline.trim()) {
    lines.push(doc.header.headline.trim());
  }

  if (contact.line1.length > 0) {
    lines.push(contact.line1.join(' · '));
  }
  if (contact.line2.length > 0) {
    lines.push(contact.line2.map((l) => l.display).join(' · '));
  }
  lines.push('');

  if (doc.summary.trim()) {
    lines.push('SUMMARY');
    lines.push(doc.summary.trim());
    lines.push('');
  }

  if (doc.experiences.length > 0) {
    lines.push('EXPERIENCE');
    for (const exp of doc.experiences) {
      const roleLeft = `${exp.title}, ${exp.company}${exp.location ? ` · ${exp.location}` : ''}`;
      lines.push(`${roleLeft} ${exp.dateRange}`);
      for (const bullet of exp.bullets) {
        lines.push(`• ${bullet.text.trim()}`);
      }
      lines.push('');
    }
  }

  if (doc.projects.length > 0) {
    lines.push('PROJECTS');
    for (const proj of doc.projects) {
      const headerParts = [proj.name];
      if (proj.role.trim()) headerParts.push(`— ${proj.role.trim()}`);
      if (proj.link?.trim()) headerParts.push(`· ${proj.link.trim()}`);
      lines.push(headerParts.join(' '));
      if (proj.description.trim()) {
        lines.push(proj.description.trim());
      }
      for (const h of proj.highlights) {
        if (h.trim()) {
          lines.push(`• ${h.trim()}`);
        }
      }
      lines.push('');
    }
  }

  if (doc.skillsByCategory.length > 0) {
    lines.push('SKILLS');
    for (const group of doc.skillsByCategory) {
      lines.push(`${group.category}: ${group.skills.join(', ')}`);
    }
    lines.push('');
  }

  if (doc.educations.length > 0) {
    lines.push('EDUCATION');
    for (const edu of doc.educations) {
      const eduLeft = `${edu.institution} — ${edu.degreeLine}${edu.location ? ` · ${edu.location}` : ''}`;
      lines.push(`${eduLeft} ${edu.dateRange}`);
      if (edu.highlights?.trim()) {
        lines.push(edu.highlights.trim());
      }
    }
    lines.push('');
  }

  if (doc.certifications.length > 0) {
    lines.push('CERTIFICATIONS');
    for (const cert of doc.certifications) {
      lines.push(`${cert.name} — ${cert.issuer} ${cert.date}`);
    }
    lines.push('');
  }

  return lines.join('\n').trim() + '\n';
}

/**
 * Strips Markdown syntax (`#`, `**`, `_`, `[label](url)`, `- `) so Markdown exporter output
 * can be compared directly against `documentToPlainText(doc)`.
 */
export function stripMarkdownFormatting(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/^-\s+/gm, '• ')
    .trim();
}


/**
 * Normalizes whitespace for cross-exporter text parity comparisons while preserving all glyphs,
 * punctuation, bullets ("•"), middots ("·"), en/em dashes ("–", "—"), and diacritics.
 */
export function normalizeWhitespaceForParity(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t\u00A0]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Computes a deterministic content hash over a ResumeDocument or CoverLetterDocument.
 * Ignores volatile timestamps (`generatedAt`) so identical content + template produces the exact same hash.
 */
export function computeDocumentContentHash(doc: ExportableDocument): string {
  if (doc.kind === 'coverLetter') {
    const payload = JSON.stringify({
      kind: 'coverLetter',
      templateId: doc.meta.templateId,
      textAlign: doc.meta.textAlign ?? 'left',
      voice: doc.meta.voice,
      targetCompany: doc.meta.targetCompany,
      targetRole: doc.meta.targetRole,
      recipient: doc.meta.recipient,
      length: doc.meta.length,
      header: doc.header,
      dateLine: doc.dateLine,
      recipientLine: doc.recipientLine,
      blocks: doc.blocks.map((b) => ({
        id: b.id,
        type: b.type,
        text: b.text,
      })),
    });
    return `cl-${fnv1aHash(payload)}-${fnv1aHash(documentToPlainText(doc))}`;
  }

  const resumeDoc: ResumeDocument = doc;
  const payload = JSON.stringify({
    kind: 'resume',
    templateId: resumeDoc.meta.templateId,
    textAlign: resumeDoc.meta.textAlign ?? 'left',
    voice: resumeDoc.meta.voice,
    targetCompany: resumeDoc.meta.targetCompany,
    targetRole: resumeDoc.meta.targetRole,
    header: resumeDoc.header,
    summary: resumeDoc.summary,
    experiences: resumeDoc.experiences.map((e) => ({
      id: e.id,
      company: e.company,
      title: e.title,
      location: e.location,
      dateRange: e.dateRange,
      bullets: e.bullets.map((b) => ({ id: b.id, text: b.text })),
    })),
    projects: resumeDoc.projects,
    skillsByCategory: resumeDoc.skillsByCategory,
    educations: resumeDoc.educations,
    certifications: resumeDoc.certifications,
  });
  return `res-${fnv1aHash(payload)}-${fnv1aHash(documentToPlainText(resumeDoc))}`;
}

export interface LocatedBlockRect {
  blockId: string;
  kind: 'header' | 'summary' | 'experience-header' | 'bullet' | 'letter-block' | 'skills' | 'project' | 'education';
  page: number;
  /** PDF coordinate space: x from left (pt), yBottom from bottom of page (pt), width (pt), height (pt) */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Top-down coordinate space for SVG/Canvas overlays (origin top-left of page in pt) */
  topPt: number;
  leftPt: number;
  sourceIds?: string[];
  text: string;
}

export type BlockBoundingBox = LocatedBlockRect;


function normalizeMatchToken(s: string): string {
  return s
    .replace(/^[•*‣▪\-–—\s]+/, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/**
 * Pure domain helper mapping document block IDs (summary, experience headers, bullet IDs,
 * cover letter block IDs, skills) to bounding rectangles on the page by ordered text matching
 * against `positionedText` extracted from the rendered PDF.
 */
export function locateBlocks(
  document: ExportableDocument,
  positionedText: PositionedText[],
  pageSize: PageSize = 'letter',
): LocatedBlockRect[] {
  if (!positionedText || positionedText.length === 0) {
    return [];
  }

  const pageDim = PAGE_SIZES[pageSize] ?? PAGE_SIZES.letter;
  const spec = getTemplateSpec(document.meta.templateId || 'classic', pageSize);
  const defaultLineWidth =
    pageDim.widthPt - spec.margins.leftPt - spec.margins.rightPt;

  const targetBlocks: Array<{
    blockId: string;
    kind: LocatedBlockRect['kind'];
    text: string;
    sourceIds?: string[];
  }> = [];

  if (document.kind === 'coverLetter') {
    targetBlocks.push({
      blockId: 'header',
      kind: 'header',
      text: `${document.header.name} ${document.header.headline}`,
    });
    for (const block of document.blocks) {
      if (block.text.trim()) {
        targetBlocks.push({
          blockId: block.id,
          kind: 'letter-block',
          text: block.text.trim(),
          sourceIds: block.sourceIds,
        });
      }
    }
  } else {
    targetBlocks.push({
      blockId: 'header',
      kind: 'header',
      text: `${document.header.name} ${document.header.headline}`,
    });
    if (document.summary.trim()) {
      targetBlocks.push({
        blockId: 'summary',
        kind: 'summary',
        text: document.summary.trim(),
      });
    }
    for (const exp of document.experiences) {
      targetBlocks.push({
        blockId: `exp-${exp.id}`,
        kind: 'experience-header',
        text: `${exp.title} ${exp.company}`,
        sourceIds: [exp.id],
      });
      for (const bullet of exp.bullets) {
        targetBlocks.push({
          blockId: bullet.id,
          kind: 'bullet',
          text: bullet.text.trim(),
          sourceIds: [exp.id, ...bullet.sourceIds],
        });
      }
    }
    for (const proj of document.projects) {
      targetBlocks.push({
        blockId: `proj-${proj.id}`,
        kind: 'project',
        text: `${proj.name} ${proj.description}`,
        sourceIds: [proj.id],
      });
    }
    if (document.skillsByCategory.length > 0) {
      targetBlocks.push({
        blockId: 'skills',
        kind: 'skills',
        text: document.skillsByCategory
          .map((g) => `${g.category}: ${g.skills.join(', ')}`)
          .join(' '),
      });
    }
  }

  const results: LocatedBlockRect[] = [];
  let cursor = 0;

  for (const target of targetBlocks) {
    const normTarget = normalizeMatchToken(target.text);
    if (!normTarget) continue;

    // Match the first line of the target block starting from `cursor`
    const targetWords = normTarget.split(' ').filter(Boolean);
    const prefixProbe = targetWords.slice(0, Math.min(4, targetWords.length)).join(' ');
    const fallbackProbe = targetWords[0] ?? normTarget.slice(0, 12);

    let startIdx = -1;
    for (let i = cursor; i < positionedText.length; i++) {
      const lineNorm = normalizeMatchToken(positionedText[i].text);
      if (!lineNorm) continue;
      if (
        (prefixProbe.length >= 3 && lineNorm.includes(prefixProbe)) ||
        (lineNorm.length >= 4 && normTarget.startsWith(lineNorm.slice(0, Math.min(18, lineNorm.length)))) ||
        (fallbackProbe.length >= 3 && lineNorm.startsWith(fallbackProbe))
      ) {
        startIdx = i;
        break;
      }
    }

    if (startIdx === -1) {
      // Second pass from 0 if out-of-order
      for (let i = 0; i < positionedText.length; i++) {
        const lineNorm = normalizeMatchToken(positionedText[i].text);
        if (prefixProbe.length >= 3 && lineNorm.includes(prefixProbe)) {
          startIdx = i;
          break;
        }
      }
    }

    if (startIdx === -1) continue;

    const matchedItems: PositionedText[] = [positionedText[startIdx]];
    let accumulatedChars = normalizeMatchToken(positionedText[startIdx].text).length;
    const startPage = positionedText[startIdx].page;

    let j = startIdx + 1;
    while (
      j < positionedText.length &&
      accumulatedChars < normTarget.length * 0.88 &&
      positionedText[j].page === startPage
    ) {
      const nextNorm = normalizeMatchToken(positionedText[j].text);
      if (!nextNorm) {
        j++;
        continue;
      }
      const probeSlice = nextNorm.slice(0, Math.min(14, nextNorm.length));
      if (probeSlice.length >= 2 && normTarget.includes(probeSlice)) {
        matchedItems.push(positionedText[j]);
        accumulatedChars += nextNorm.length + 1;
        j++;
      } else {
        break;
      }
    }

    cursor = Math.max(cursor, startIdx + matchedItems.length);

    let minX = Infinity;
    let maxRight = -Infinity;
    let minY = Infinity;
    let maxBottomY = -Infinity;

    for (const item of matchedItems) {
      const fs = item.fontSize ?? spec.sizes.bodyPt;
      const itemW =
        item.width ??
        Math.min(defaultLineWidth, Math.max(40, item.text.length * fs * 0.48));
      minX = Math.min(minX, item.x);
      maxRight = Math.max(maxRight, item.x + itemW);
      // item.y is the baseline from top of page
      // Top of glyphs (cap height / ascenders) is baseline - fs * 0.78
      // Bottom of glyphs (descenders) is baseline + fs * 0.22
      minY = Math.min(minY, item.y - fs * 0.78);
      maxBottomY = Math.max(maxBottomY, item.y + fs * 0.22);
    }

    // Include the bullet dot if kind is bullet so the highlight frames both dot and text
    const bulletDotX =
      target.kind === 'bullet'
        ? spec.margins.leftPt + spec.bullet.bulletOffsetPt
        : minX;
    const effectiveMinX = Math.min(minX, bulletDotX);

    const padX = 2.5;
    const padY = 1.75;
    const rectX = Math.max(
      spec.margins.leftPt - 2,
      effectiveMinX - padX,
    );
    const rectWidth = Math.min(
      defaultLineWidth + 6,
      Math.max(60, maxRight - rectX + padX),
    );
    const rectY = Math.max(0, minY - padY);
    const rectHeight = Math.max(10, maxBottomY - rectY + padY);
    const topPt = rectY;

    results.push({
      blockId: target.blockId,
      kind: target.kind,
      page: startPage,
      x: Number(rectX.toFixed(2)),
      y: Number(rectY.toFixed(2)),
      width: Number(rectWidth.toFixed(2)),
      height: Number(rectHeight.toFixed(2)),
      topPt: Number(topPt.toFixed(2)),
      leftPt: Number(rectX.toFixed(2)),
      sourceIds: target.sourceIds,
      text: target.text,
    });
  }

  return results;
}
