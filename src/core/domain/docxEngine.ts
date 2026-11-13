import {
  CoverLetterDocument,
  ExportableDocument,
  PageSize,
  ResumeDocument,
  TemplateId,
  TextAlign,
} from './entities';
import { formatContactBlock } from './bulletAssembler';
import {
  TemplateSpec,
  getTemplateSpec,
} from './templateSpec';

/**
 * Pure OpenXML (.docx) generator for Word document export.
 * Produces a valid single-column `.docx` zip archive with real Word styles
 * (`Normal`, `Heading1`, `Heading2`, `ListBullet`), font fallback declarations,
 * matching page dimensions and margins, right-aligned tab stops for dates,
 * and 100% text parity with `documentToPlainText`.
 */

function escapeXml(raw: string): string {
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export interface FontMappingSpec {
  primaryFont: string;
  fallbackFont: string;
}

export function resolveDocxFontMapping(spec: TemplateSpec): {
  body: FontMappingSpec;
  heading: FontMappingSpec;
  name: FontMappingSpec;
} {
  const mapFamily = (family: string): FontMappingSpec => {
    if (family === 'Fraunces') {
      return { primaryFont: 'Fraunces', fallbackFont: 'Georgia' };
    }
    if (family === 'JetBrains Mono') {
      return { primaryFont: 'JetBrains Mono', fallbackFont: 'Consolas' };
    }
    return { primaryFont: 'Plus Jakarta Sans', fallbackFont: 'Calibri' };
  };
  return {
    body: mapFamily(spec.fonts.bodyFont),
    heading: mapFamily(spec.fonts.headingFont),
    name: mapFamily(spec.fonts.nameFont),
  };
}

function mapDocxJc(align: TextAlign | undefined): 'left' | 'both' {
  if (align === 'justify') return 'both';
  return 'left';
}

function ptToHalfPt(pt: number): number {
  return Math.round(pt * 2);
}

function ptToTwips(pt: number): number {
  return Math.round(pt * 20);
}

// Minimal CRC-32 + uncompressed ZIP writer for valid .docx archives
const CRC32_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[i] = c >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC32_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function createZipArchive(
  files: Array<{ name: string; content: string }>,
): Uint8Array {
  const encoder = new TextEncoder();
  const entries = files.map((f) => {
    const nameBytes = encoder.encode(f.name);
    const dataBytes = encoder.encode(f.content);
    const crc = crc32(dataBytes);
    return { nameBytes, dataBytes, crc, offset: 0 };
  });

  let localTotalSize = 0;
  for (const e of entries) {
    e.offset = localTotalSize;
    localTotalSize += 30 + e.nameBytes.length + e.dataBytes.length;
  }

  let centralTotalSize = 0;
  for (const e of entries) {
    centralTotalSize += 46 + e.nameBytes.length;
  }

  const totalSize = localTotalSize + centralTotalSize + 22;
  const out = new Uint8Array(totalSize);
  const view = new DataView(out.buffer);
  let pos = 0;

  for (const e of entries) {
    view.setUint32(pos, 0x04034b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 0x0800, true); // UTF-8 filename flag
    view.setUint16(pos + 8, 0, true); // Store (0 = uncompressed)
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint32(pos + 14, e.crc, true);
    view.setUint32(pos + 18, e.dataBytes.length, true);
    view.setUint32(pos + 22, e.dataBytes.length, true);
    view.setUint16(pos + 26, e.nameBytes.length, true);
    view.setUint16(pos + 28, 0, true);
    pos += 30;
    out.set(e.nameBytes, pos);
    pos += e.nameBytes.length;
    out.set(e.dataBytes, pos);
    pos += e.dataBytes.length;
  }

  const centralDirOffset = pos;
  for (const e of entries) {
    view.setUint32(pos, 0x02014b50, true);
    view.setUint16(pos + 4, 20, true);
    view.setUint16(pos + 6, 20, true);
    view.setUint16(pos + 8, 0x0800, true);
    view.setUint16(pos + 10, 0, true);
    view.setUint16(pos + 12, 0, true);
    view.setUint16(pos + 14, 0, true);
    view.setUint32(pos + 16, e.crc, true);
    view.setUint32(pos + 20, e.dataBytes.length, true);
    view.setUint32(pos + 24, e.dataBytes.length, true);
    view.setUint16(pos + 28, e.nameBytes.length, true);
    view.setUint16(pos + 30, 0, true);
    view.setUint16(pos + 32, 0, true);
    view.setUint16(pos + 34, 0, true);
    view.setUint16(pos + 36, 0, true);
    view.setUint32(pos + 38, 0, true);
    view.setUint32(pos + 42, e.offset, true);
    pos += 46;
    out.set(e.nameBytes, pos);
    pos += e.nameBytes.length;
  }

  const centralDirSize = pos - centralDirOffset;
  view.setUint32(pos, 0x06054b50, true);
  view.setUint16(pos + 4, 0, true);
  view.setUint16(pos + 6, 0, true);
  view.setUint16(pos + 8, entries.length, true);
  view.setUint16(pos + 10, entries.length, true);
  view.setUint32(pos + 12, centralDirSize, true);
  view.setUint32(pos + 16, centralDirOffset, true);
  view.setUint16(pos + 20, 0, true);

  return out;
}

function buildDocxRun(params: {
  text: string;
  fontName: string;
  fallbackFont?: string;
  sizePt: number;
  bold?: boolean;
  colorHex?: string;
}): string {
  const halfPt = ptToHalfPt(params.sizePt);
  const color = params.colorHex ?? '17191E';
  const escFont = escapeXml(params.fontName);
  const escFallback = escapeXml(params.fallbackFont ?? params.fontName);
  return `<w:r><w:rPr><w:rFonts w:ascii="${escFont}" w:hAnsi="${escFont}" w:cs="${escFallback}"/><w:sz w:val="${halfPt}"/><w:szCs w:val="${halfPt}"/><w:color w:val="${color}"/>${params.bold ? '<w:b/>' : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(params.text)}</w:t></w:r>`;
}

function buildDocxParagraph(params: {
  runsXml: string;
  styleId?: 'Normal' | 'Heading1' | 'Heading2' | 'ListBullet';
  jc?: 'left' | 'both';
  spaceBeforePt?: number;
  spaceAfterPt?: number;
  bottomRule?: boolean;
  rightTabTwips?: number;
  hangingTwips?: number;
  leftIndentTwips?: number;
}): string {
  const styleXml = params.styleId
    ? `<w:pStyle w:val="${params.styleId}"/>`
    : '';
  const before = ptToTwips(params.spaceBeforePt ?? 0);
  const after = ptToTwips(params.spaceAfterPt ?? 2);
  const jcXml = params.jc ? `<w:jc w:val="${params.jc}"/>` : '';
  const borderXml = params.bottomRule
    ? `<w:pBdr><w:bottom w:val="single" w:sz="6" w:space="3" w:color="CBD0D8"/></w:pBdr>`
    : '';
  const tabXml = params.rightTabTwips
    ? `<w:tabs><w:tab w:val="right" w:pos="${params.rightTabTwips}"/></w:tabs>`
    : '';
  const indXml =
    params.leftIndentTwips !== undefined || params.hangingTwips !== undefined
      ? `<w:ind w:left="${params.leftIndentTwips ?? 0}" w:hanging="${params.hangingTwips ?? 0}"/>`
      : '';
  return `<w:p><w:pPr>${styleXml}${tabXml}${indXml}<w:spacing w:before="${before}" w:after="${after}"/>${jcXml}${borderXml}</w:pPr>${params.runsXml}</w:p>`;
}

function buildWordStylesXml(spec: TemplateSpec): string {
  const fonts = resolveDocxFontMapping(spec);
  const bodyHalfPt = ptToHalfPt(spec.sizes.bodyPt);
  const nameHalfPt = ptToHalfPt(spec.sizes.namePt);
  const headingHalfPt = ptToHalfPt(spec.sizes.sectionHeadingPt);
  const bulletIndentTwips = ptToTwips(spec.bullet.hangingIndentPt);

  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:docDefaults>',
    `<w:rPrDefault><w:rPr><w:rFonts w:ascii="${escapeXml(fonts.body.primaryFont)}" w:hAnsi="${escapeXml(fonts.body.primaryFont)}" w:cs="${escapeXml(fonts.body.fallbackFont)}"/><w:sz w:val="${bodyHalfPt}"/><w:szCs w:val="${bodyHalfPt}"/><w:color w:val="17191E"/></w:rPr></w:rPrDefault>`,
    '<w:pPrDefault><w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr></w:pPrDefault>',
    '</w:docDefaults>',
    '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">',
    '<w:name w:val="Normal"/>',
    '<w:qFormat/>',
    `<w:rPr><w:rFonts w:ascii="${escapeXml(fonts.body.primaryFont)}" w:hAnsi="${escapeXml(fonts.body.primaryFont)}" w:cs="${escapeXml(fonts.body.fallbackFont)}"/><w:sz w:val="${bodyHalfPt}"/><w:szCs w:val="${bodyHalfPt}"/><w:color w:val="17191E"/></w:rPr>`,
    '</w:style>',
    '<w:style w:type="paragraph" w:styleId="Heading1">',
    '<w:name w:val="heading 1"/>',
    '<w:basedOn w:val="Normal"/>',
    '<w:next w:val="Normal"/>',
    '<w:qFormat/>',
    '<w:pPr><w:keepNext/><w:spacing w:before="0" w:after="40"/></w:pPr>',
    `<w:rPr><w:rFonts w:ascii="${escapeXml(fonts.name.primaryFont)}" w:hAnsi="${escapeXml(fonts.name.primaryFont)}" w:cs="${escapeXml(fonts.name.fallbackFont)}"/><w:b/><w:sz w:val="${nameHalfPt}"/><w:szCs w:val="${nameHalfPt}"/><w:color w:val="17191E"/></w:rPr>`,
    '</w:style>',
    '<w:style w:type="paragraph" w:styleId="Heading2">',
    '<w:name w:val="heading 2"/>',
    '<w:basedOn w:val="Normal"/>',
    '<w:next w:val="Normal"/>',
    '<w:qFormat/>',
    `<w:pPr><w:keepNext/><w:spacing w:before="${ptToTwips(spec.sectionSpacingPt.beforeSection)}" w:after="${ptToTwips(spec.sectionSpacingPt.afterSectionHeading)}"/><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="2" w:color="CBD0D8"/></w:pBdr></w:pPr>`,
    `<w:rPr><w:rFonts w:ascii="${escapeXml(fonts.heading.primaryFont)}" w:hAnsi="${escapeXml(fonts.heading.primaryFont)}" w:cs="${escapeXml(fonts.heading.fallbackFont)}"/><w:b/><w:sz w:val="${headingHalfPt}"/><w:szCs w:val="${headingHalfPt}"/><w:color w:val="17191E"/></w:rPr>`,
    '</w:style>',
    '<w:style w:type="paragraph" w:styleId="ListBullet">',
    '<w:name w:val="List Bullet"/>',
    '<w:basedOn w:val="Normal"/>',
    '<w:qFormat/>',
    `<w:pPr><w:ind w:left="${bulletIndentTwips}" w:hanging="${bulletIndentTwips}"/><w:spacing w:before="0" w:after="${ptToTwips(spec.sectionSpacingPt.betweenBullets)}"/></w:pPr>`,
    `<w:rPr><w:rFonts w:ascii="${escapeXml(fonts.body.primaryFont)}" w:hAnsi="${escapeXml(fonts.body.primaryFont)}" w:cs="${escapeXml(fonts.body.fallbackFont)}"/><w:sz w:val="${bodyHalfPt}"/><w:szCs w:val="${bodyHalfPt}"/><w:color w:val="17191E"/></w:rPr>`,
    '</w:style>',
    '</w:styles>',
  ].join('');
}

function buildFontTableXml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:fonts xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:font w:name="Plus Jakarta Sans"><w:altName w:val="Calibri"/><w:family w:val="swiss"/></w:font>',
    '<w:font w:name="Fraunces"><w:altName w:val="Georgia"/><w:family w:val="roman"/></w:font>',
    '<w:font w:name="JetBrains Mono"><w:altName w:val="Consolas"/><w:family w:val="modern"/></w:font>',
    '<w:font w:name="Calibri"><w:family w:val="swiss"/></w:font>',
    '<w:font w:name="Georgia"><w:family w:val="roman"/></w:font>',
    '<w:font w:name="Consolas"><w:family w:val="modern"/></w:font>',
    '</w:fonts>',
  ].join('');
}

function buildHeaderDocxParagraphs(
  doc: ExportableDocument,
  spec: TemplateSpec,
  contentWidthTwips: number,
): string[] {
  const fonts = resolveDocxFontMapping(spec);
  const contact = formatContactBlock(doc.header);
  const paragraphs: string[] = [];

  const nameRuns = [
    buildDocxRun({
      text: doc.header.name.trim(),
      fontName: fonts.name.primaryFont,
      fallbackFont: fonts.name.fallbackFont,
      sizePt: spec.sizes.namePt,
      bold: true,
      colorHex: '17191E',
    }),
    ...(doc.header.headline.trim()
      ? [
          buildDocxRun({
            text: `   ${doc.header.headline.trim()}`,
            fontName: fonts.body.primaryFont,
            fallbackFont: fonts.body.fallbackFont,
            sizePt: spec.sizes.headlinePt,
            bold: true,
            colorHex: '3D434F',
          }),
        ]
      : []),
  ].join('');

  paragraphs.push(
    buildDocxParagraph({
      styleId: 'Heading1',
      runsXml: nameRuns,
      spaceBeforePt: 0,
      spaceAfterPt: 2,
      rightTabTwips: contentWidthTwips,
    }),
  );

  // Contact line 1: email · phone · location
  if (contact.line1.length > 0) {
    const contactRuns = contact.line1
      .map((item, idx) => {
        const prefix = idx > 0 ? ' · ' : '';
        return buildDocxRun({
          text: `${prefix}${item}`,
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.contactPt,
          colorHex: '525B6B',
        });
      })
      .join('');

    paragraphs.push(
      buildDocxParagraph({
        styleId: 'Normal',
        runsXml: contactRuns,
        spaceBeforePt: 0,
        spaceAfterPt:
          contact.line2.length > 0 ? 1 : spec.sectionSpacingPt.afterHeader,
        bottomRule: contact.line2.length === 0,
      }),
    );
  }

  // Contact line 2: GitHub · LinkedIn · Website (preserving full display text)
  if (contact.line2.length > 0) {
    const linkRuns = contact.line2
      .map((item, idx) => {
        const prefix = idx > 0 ? ' · ' : '';
        return buildDocxRun({
          text: `${prefix}${item.display}`,
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.contactPt,
          colorHex: '1D4ED8',
        });
      })
      .join('');

    paragraphs.push(
      buildDocxParagraph({
        styleId: 'Normal',
        runsXml: linkRuns,
        spaceBeforePt: 0,
        spaceAfterPt: spec.sectionSpacingPt.afterHeader,
        bottomRule: true,
      }),
    );
  }

  return paragraphs;
}

function buildResumeDocxBodyXml(
  doc: ResumeDocument,
  spec: TemplateSpec,
  contentWidthTwips: number,
): string {
  const fonts = resolveDocxFontMapping(spec);
  const jc = mapDocxJc(doc.meta.textAlign);
  const paragraphs = buildHeaderDocxParagraphs(doc, spec, contentWidthTwips);

  const addSectionHeading = (title: string) => {
    paragraphs.push(
      buildDocxParagraph({
        styleId: 'Heading2',
        runsXml: buildDocxRun({
          text: title.toUpperCase(),
          fontName: fonts.heading.primaryFont,
          fallbackFont: fonts.heading.fallbackFont,
          sizePt: spec.sizes.sectionHeadingPt,
          bold: true,
          colorHex: '17191E',
        }),
        spaceBeforePt: spec.sectionSpacingPt.beforeSection,
        spaceAfterPt: spec.sectionSpacingPt.afterSectionHeading,
        bottomRule: true,
      }),
    );
  };

  if (doc.summary.trim()) {
    addSectionHeading('SUMMARY');
    paragraphs.push(
      buildDocxParagraph({
        styleId: 'Normal',
        runsXml: buildDocxRun({
          text: doc.summary.trim(),
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.bodyPt,
        }),
        jc,
        spaceBeforePt: 0,
        spaceAfterPt: 4,
      }),
    );
  }

  if (doc.experiences.length > 0) {
    addSectionHeading('EXPERIENCE');
    doc.experiences.forEach((exp, idx) => {
      // Role title bold, company regular, location & dates muted
      const roleRuns = [
        buildDocxRun({
          text: exp.title,
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.roleTitlePt,
          bold: true,
          colorHex: '17191E',
        }),
        buildDocxRun({
          text: `, ${exp.company}`,
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.roleTitlePt,
          bold: false,
          colorHex: '17191E',
        }),
        ...(exp.location
          ? [
              buildDocxRun({
                text: ` · ${exp.location}`,
                fontName: fonts.body.primaryFont,
                fallbackFont: fonts.body.fallbackFont,
                sizePt: spec.sizes.roleTitlePt,
                bold: false,
                colorHex: '525B6B',
              }),
            ]
          : []),
        `<w:r><w:tab/></w:r>`,
        buildDocxRun({
          text: exp.dateRange,
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.metaPt,
          bold: false,
          colorHex: '525B6B',
        }),
      ].join('');

      paragraphs.push(
        buildDocxParagraph({
          styleId: 'Normal',
          runsXml: roleRuns,
          spaceBeforePt: idx > 0 ? spec.sectionSpacingPt.betweenRoles : 0,
          spaceAfterPt: spec.sectionSpacingPt.afterRoleHeader,
          rightTabTwips: contentWidthTwips,
        }),
      );

      const indentTwips = ptToTwips(spec.bullet.hangingIndentPt);
      for (const b of exp.bullets) {
        if (!b.text.trim()) continue;
        paragraphs.push(
          buildDocxParagraph({
            styleId: 'ListBullet',
            runsXml: buildDocxRun({
              text: `${spec.bullet.glyph}  ${b.text.trim()}`,
              fontName: fonts.body.primaryFont,
              fallbackFont: fonts.body.fallbackFont,
              sizePt: spec.sizes.bodyPt,
            }),
            jc,
            spaceBeforePt: 0,
            spaceAfterPt: spec.sectionSpacingPt.betweenBullets,
            leftIndentTwips: indentTwips,
            hangingTwips: indentTwips,
          }),
        );
      }
    });
  }

  if (doc.projects.length > 0) {
    addSectionHeading('PROJECTS');
    for (const proj of doc.projects) {
      const headerStr = `${proj.name}${proj.role ? ` — ${proj.role}` : ''}${proj.link ? ` · ${proj.link}` : ''}`;
      paragraphs.push(
        buildDocxParagraph({
          styleId: 'Normal',
          runsXml: buildDocxRun({
            text: headerStr,
            fontName: fonts.body.primaryFont,
            fallbackFont: fonts.body.fallbackFont,
            sizePt: spec.sizes.roleTitlePt,
            bold: true,
          }),
          spaceBeforePt: 2,
          spaceAfterPt: 1,
        }),
      );
      if (proj.description.trim()) {
        paragraphs.push(
          buildDocxParagraph({
            styleId: 'Normal',
            runsXml: buildDocxRun({
              text: proj.description.trim(),
              fontName: fonts.body.primaryFont,
              fallbackFont: fonts.body.fallbackFont,
              sizePt: spec.sizes.bodyPt,
            }),
            jc,
            spaceBeforePt: 0,
            spaceAfterPt: 2,
          }),
        );
      }
      for (const hl of proj.highlights) {
        if (!hl.trim()) continue;
        paragraphs.push(
          buildDocxParagraph({
            styleId: 'ListBullet',
            runsXml: buildDocxRun({
              text: `${spec.bullet.glyph}  ${hl.trim()}`,
              fontName: fonts.body.primaryFont,
              fallbackFont: fonts.body.fallbackFont,
              sizePt: spec.sizes.bodyPt,
            }),
            jc,
            spaceBeforePt: 0,
            spaceAfterPt: 1.5,
          }),
        );
      }
    }
  }

  if (doc.skillsByCategory.length > 0) {
    addSectionHeading('SKILLS');
    for (const group of doc.skillsByCategory) {
      if (group.skills.length === 0) continue;
      const runs = [
        buildDocxRun({
          text: `${group.category}: `,
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.bodyPt,
          bold: true,
        }),
        buildDocxRun({
          text: group.skills.join(', '),
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.bodyPt,
        }),
      ].join('');
      paragraphs.push(
        buildDocxParagraph({
          styleId: 'Normal',
          runsXml: runs,
          jc,
          spaceBeforePt: 0,
          spaceAfterPt: 2,
        }),
      );
    }
  }

  if (doc.educations.length > 0) {
    addSectionHeading('EDUCATION');
    for (const edu of doc.educations) {
      const eduLeft = `${edu.institution} — ${edu.degreeLine}${edu.location ? ` · ${edu.location}` : ''}`;
      const runs = [
        buildDocxRun({
          text: eduLeft,
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.bodyPt,
          bold: true,
        }),
        `<w:r><w:tab/></w:r>`,
        buildDocxRun({
          text: edu.dateRange,
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.metaPt,
          colorHex: '525B6B',
        }),
      ].join('');
      paragraphs.push(
        buildDocxParagraph({
          styleId: 'Normal',
          runsXml: runs,
          spaceBeforePt: 1,
          spaceAfterPt: edu.highlights ? 1 : 2,
          rightTabTwips: contentWidthTwips,
        }),
      );
      if (edu.highlights?.trim()) {
        paragraphs.push(
          buildDocxParagraph({
            styleId: 'Normal',
            runsXml: buildDocxRun({
              text: edu.highlights.trim(),
              fontName: fonts.body.primaryFont,
              fallbackFont: fonts.body.fallbackFont,
              sizePt: spec.sizes.metaPt,
              colorHex: '525B6B',
            }),
            spaceBeforePt: 0,
            spaceAfterPt: 2,
          }),
        );
      }
    }
  }

  if (doc.certifications.length > 0) {
    addSectionHeading('CERTIFICATIONS');
    for (const cert of doc.certifications) {
      const certLeft = `${cert.name} — ${cert.issuer}`;
      const runs = [
        buildDocxRun({
          text: certLeft,
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.bodyPt,
        }),
        `<w:r><w:tab/></w:r>`,
        buildDocxRun({
          text: cert.date,
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.metaPt,
          colorHex: '525B6B',
        }),
      ].join('');
      paragraphs.push(
        buildDocxParagraph({
          styleId: 'Normal',
          runsXml: runs,
          spaceBeforePt: 0,
          spaceAfterPt: 2,
          rightTabTwips: contentWidthTwips,
        }),
      );
    }
  }

  return paragraphs.join('');
}

function buildCoverLetterDocxBodyXml(
  doc: CoverLetterDocument,
  spec: TemplateSpec,
  contentWidthTwips: number,
): string {
  const fonts = resolveDocxFontMapping(spec);
  const jc = mapDocxJc(doc.meta.textAlign);
  const paragraphs = buildHeaderDocxParagraphs(doc, spec, contentWidthTwips);

  if (doc.dateLine.trim()) {
    paragraphs.push(
      buildDocxParagraph({
        styleId: 'Normal',
        runsXml: buildDocxRun({
          text: doc.dateLine.trim(),
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.metaPt,
          colorHex: '525B6B',
        }),
        spaceBeforePt: 4,
        spaceAfterPt: 2,
      }),
    );
  }

  if (doc.recipientLine.trim()) {
    paragraphs.push(
      buildDocxParagraph({
        styleId: 'Normal',
        runsXml: buildDocxRun({
          text: doc.recipientLine.trim(),
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.roleTitlePt,
          bold: true,
        }),
        spaceBeforePt: 0,
        spaceAfterPt: 6,
      }),
    );
  }

  for (const block of doc.blocks) {
    if (!block.text.trim()) continue;
    paragraphs.push(
      buildDocxParagraph({
        styleId: 'Normal',
        runsXml: buildDocxRun({
          text: block.text.trim(),
          fontName: fonts.body.primaryFont,
          fallbackFont: fonts.body.fallbackFont,
          sizePt: spec.sizes.bodyPt,
        }),
        jc,
        spaceBeforePt: 0,
        spaceAfterPt: spec.sectionSpacingPt.afterParagraph,
      }),
    );
  }

  return paragraphs.join('');
}

/**
 * Generates a `.docx` binary (`Uint8Array`) for Word document export.
 */
export function renderDocumentToDocxBytes(
  doc: ExportableDocument,
  options?: { templateId?: TemplateId; pageSize?: PageSize },
): Uint8Array {
  const templateId = options?.templateId ?? doc.meta.templateId ?? 'classic';
  const pageSize = options?.pageSize ?? doc.meta.pageSize ?? 'letter';
  const spec = getTemplateSpec(templateId, pageSize);

  const wTwips = ptToTwips(spec.pageDimensions.widthPt);
  const hTwips = ptToTwips(spec.pageDimensions.heightPt);
  const topTwips = ptToTwips(spec.margins.topPt);
  const rightTwips = ptToTwips(spec.margins.rightPt);
  const bottomTwips = ptToTwips(spec.margins.bottomPt);
  const leftTwips = ptToTwips(spec.margins.leftPt);
  const contentWidthTwips = wTwips - leftTwips - rightTwips;

  const bodyInnerXml =
    doc.kind === 'coverLetter'
      ? buildCoverLetterDocxBodyXml(doc, spec, contentWidthTwips)
      : buildResumeDocxBodyXml(doc, spec, contentWidthTwips);

  const documentXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">',
    '<w:body>',
    bodyInnerXml,
    `<w:sectPr><w:pgSz w:w="${wTwips}" w:h="${hTwips}"/><w:pgMar w:top="${topTwips}" w:right="${rightTwips}" w:bottom="${bottomTwips}" w:left="${leftTwips}" w:header="720" w:footer="720" w:gutter="0"/><w:cols w:num="1" w:space="720"/></w:sectPr>`,
    '</w:body>',
    '</w:document>',
  ].join('');

  const stylesXml = buildWordStylesXml(spec);
  const fontTableXml = buildFontTableXml();

  const contentTypesXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>',
    '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>',
    '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>',
    '<Override PartName="/word/fontTable.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.fontTable+xml"/>',
    '</Types>',
  ].join('');

  const relsXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>',
    '</Relationships>',
  ].join('');

  const wordRelsXml = [
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
    '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
    '<Relationship Id="rIdFonts" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/fontTable" Target="fontTable.xml"/>',
    '</Relationships>',
  ].join('');

  return createZipArchive([
    { name: '[Content_Types].xml', content: contentTypesXml },
    { name: '_rels/.rels', content: relsXml },
    { name: 'word/_rels/document.xml.rels', content: wordRelsXml },
    { name: 'word/styles.xml', content: stylesXml },
    { name: 'word/fontTable.xml', content: fontTableXml },
    { name: 'word/document.xml', content: documentXml },
  ]);
}

function unescapeXml(escaped: string): string {
  return escaped
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>')
    .replace(/&lt;/g, '<')
    .replace(/&amp;/g, '&');
}

/**
 * Extracts XML file contents from an uncompressed `.docx` archive (`Uint8Array` or `Blob`)
 * for unit testing and text-parity verification.
 */
export async function extractFilesFromDocxBlob(
  blobOrBytes: Blob | Uint8Array,
): Promise<Record<string, string>> {
  const bytes =
    blobOrBytes instanceof Uint8Array
      ? blobOrBytes
      : new Uint8Array(await blobOrBytes.arrayBuffer());
  const decoder = new TextDecoder();
  const files: Record<string, string> = {};
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let pos = 0;

  while (pos + 30 <= bytes.length) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x04034b50) break;
    const compSize = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const nameStart = pos + 30;
    const name = decoder.decode(bytes.subarray(nameStart, nameStart + nameLen));
    const dataStart = nameStart + nameLen + extraLen;
    const dataEnd = dataStart + compSize;
    files[name] = decoder.decode(bytes.subarray(dataStart, dataEnd));
    pos = dataEnd;
  }

  return files;
}

/**
 * Extracts plain text from a generated `.docx` Blob or `Uint8Array` for parity testing.
 */
export async function extractTextFromDocxBlob(
  blob: Blob | Uint8Array,
): Promise<string> {
  const files = await extractFilesFromDocxBlob(blob);
  const docXml = files['word/document.xml'] ?? '';
  if (!docXml) {
    const raw =
      blob instanceof Uint8Array
        ? new TextDecoder().decode(blob)
        : await blob.text();
    const matches = Array.from(
      raw.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g),
    );
    return matches.map((m) => unescapeXml(m[1])).join(' ');
  }

  const paragraphs = Array.from(docXml.matchAll(/<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g));
  const lines: string[] = [];
  for (const p of paragraphs) {
    const pInner = p[1].replace(/<w:tab\s*\/>/g, '<w:t> </w:t>');
    const tMatches = Array.from(
      pInner.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g),
    );
    const lineText = tMatches.map((m) => unescapeXml(m[1])).join('').trim();
    if (lineText) {
      lines.push(lineText);
    }
  }
  return lines.join('\n');
}
