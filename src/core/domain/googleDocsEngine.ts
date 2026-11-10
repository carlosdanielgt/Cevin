import {
  CoverLetterDocument,
  ExportableDocument,
  PageSize,
  ResumeDocument,
  TemplateId,
  TextAlign,
} from './entities';
import { PAGE_SIZES, getTemplateSpec } from './templateSpec';

export interface DocxRenderOptions {
  templateId?: TemplateId;
  pageSize?: PageSize;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rgbToHex(rgb: [number, number, number]): string {
  return rgb
    .map((c) =>
      Math.max(0, Math.min(255, Math.round(c * 255)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')
    .toUpperCase();
}

function alignToOoxmlJc(align?: TextAlign): 'left' | 'both' | 'right' {
  if (align === 'justify') return 'both';
  if (align === 'right') return 'right';
  return 'left';
}

function alignToCss(align?: TextAlign): 'left' | 'justify' | 'right' {
  if (align === 'justify') return 'justify';
  if (align === 'right') return 'right';
  return 'left';
}

// ============================================================================
// Pure-TypeScript ZIP Container Builder & Reader (Method 0 STORE + CRC-32)
// ============================================================================

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

interface ZipEntryInput {
  name: string;
  data: Uint8Array;
}

function createZipArchive(entries: ZipEntryInput[]): Uint8Array {
  const encoder = new TextEncoder();
  const localChunks: Uint8Array[] = [];
  const centralChunks: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const dataBytes = entry.data;
    const crc = crc32(dataBytes);
    const size = dataBytes.length;

    const localHeader = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, 0x0800, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, 0, true);
    lv.setUint16(12, 0x5421, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, nameBytes.length, true);
    lv.setUint16(28, 0, true);
    localHeader.set(nameBytes, 30);

    localChunks.push(localHeader, dataBytes);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, 0, true);
    cv.setUint16(14, 0x5421, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint16(30, 0, true);
    cv.setUint16(32, 0, true);
    cv.setUint16(34, 0, true);
    cv.setUint16(36, 0, true);
    cv.setUint32(38, 0, true);
    cv.setUint32(42, offset, true);
    centralHeader.set(nameBytes, 46);

    centralChunks.push(centralHeader);
    offset += localHeader.length + dataBytes.length;
  }

  const centralDirOffset = offset;
  let centralDirSize = 0;
  for (const chunk of centralChunks) {
    centralDirSize += chunk.length;
  }

  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(4, 0, true);
  ev.setUint16(6, 0, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralDirSize, true);
  ev.setUint32(16, centralDirOffset, true);
  ev.setUint16(20, 0, true);

  const totalSize = centralDirOffset + centralDirSize + eocd.length;
  const out = new Uint8Array(totalSize);
  let pos = 0;
  for (const chunk of localChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  for (const chunk of centralChunks) {
    out.set(chunk, pos);
    pos += chunk.length;
  }
  out.set(eocd, pos);
  return out;
}

export function readStoredZipEntryText(
  zipBytes: Uint8Array,
  targetName: string,
): string | null {
  const decoder = new TextDecoder();
  const view = new DataView(
    zipBytes.buffer,
    zipBytes.byteOffset,
    zipBytes.byteLength,
  );
  let pos = 0;
  while (pos + 30 <= zipBytes.length) {
    const sig = view.getUint32(pos, true);
    if (sig !== 0x04034b50) break;
    const compSize = view.getUint32(pos + 18, true);
    const nameLen = view.getUint16(pos + 26, true);
    const extraLen = view.getUint16(pos + 28, true);
    const nameStart = pos + 30;
    const name = decoder.decode(
      zipBytes.subarray(nameStart, nameStart + nameLen),
    );
    const dataStart = nameStart + nameLen + extraLen;
    if (name === targetName) {
      return decoder.decode(zipBytes.subarray(dataStart, dataStart + compSize));
    }
    pos = dataStart + compSize;
  }
  return null;
}

// ============================================================================
// OOXML (.docx) Builders for Resume & Cover Letter (WYSIWYG with PDF)
// ============================================================================

function buildRunXml(params: {
  text: string;
  fontFamily: string;
  sizePt: number;
  bold?: boolean;
  italic?: boolean;
  colorHex: string;
}): string {
  const halfPts = Math.round(params.sizePt * 2);
  const f = escapeXml(params.fontFamily);
  return `<w:r><w:rPr><w:rFonts w:ascii="${f}" w:hAnsi="${f}" w:cs="${f}"/><w:sz w:val="${halfPts}"/><w:szCs w:val="${halfPts}"/><w:color w:val="${params.colorHex}"/>${params.bold ? '<w:b/><w:bCs/>' : ''}${params.italic ? '<w:i/><w:iCs/>' : ''}</w:rPr><w:t xml:space="preserve">${escapeXml(params.text)}</w:t></w:r>`;
}

function buildSectionHeadingParagraphXml(params: {
  title: string;
  fontFamily: string;
  sizePt: number;
  colorHex: string;
  ruleHex: string;
  hasBottomRule: boolean;
  beforePt: number;
  afterPt: number;
}): string {
  const beforeTwips = Math.round(params.beforePt * 20);
  const afterTwips = Math.round(params.afterPt * 20);
  const bdr = params.hasBottomRule
    ? `<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="2" w:color="${params.ruleHex}"/></w:pBdr>`
    : '';
  return `<w:p><w:pPr><w:keepNext/><w:spacing w:before="${beforeTwips}" w:after="${afterTwips}"/>${bdr}</w:pPr>${buildRunXml(
    {
      text: params.title.toUpperCase(),
      fontFamily: params.fontFamily,
      sizePt: params.sizePt,
      bold: true,
      colorHex: params.colorHex,
    },
  )}</w:p>`;
}

const DOC_INK_HEX = '151A22';
const DOC_MUTED_HEX = '525B6C';
const DOC_ACCENT_HEX = '1D4ED8';

function buildResumeDocxBodyXml(
  doc: ResumeDocument,
  options?: DocxRenderOptions,
): string {
  const templateId = options?.templateId ?? doc.meta.templateId ?? 'classic';
  const pageSize: PageSize = options?.pageSize ?? doc.meta.pageSize ?? 'letter';
  const spec = getTemplateSpec(templateId, pageSize);
  const dims = PAGE_SIZES[pageSize];

  const pageWTwips = Math.round(dims.widthPt * 20);
  const pageHTwips = Math.round(dims.heightPt * 20);
  const topTwips = Math.round(spec.margins.topPt * 20);
  const bottomTwips = Math.round(spec.margins.bottomPt * 20);
  const leftTwips = Math.round(spec.margins.leftPt * 20);
  const rightTwips = Math.round(spec.margins.rightPt * 20);
  const contentWidthTwips = pageWTwips - leftTwips - rightTwips;

  const displayFont =
    spec.fonts.nameFont === 'Fraunces' ? 'Fraunces' : 'Plus Jakarta Sans';
  const bodyFont = 'Plus Jakarta Sans';

  const inkHex = DOC_INK_HEX;
  const mutedHex = DOC_MUTED_HEX;
  const accentHex = DOC_ACCENT_HEX;
  const ruleHex = rgbToHex(spec.ruleStyle.colorRgb);
  const sectionColorHex = spec.id === 'modern' ? accentHex : inkHex;

  const bodyJc = alignToOoxmlJc(doc.meta.textAlign);
  const paragraphs: string[] = [];

  // 1. Header: Single-line Name + Headline
  const nameRuns: string[] = [
    buildRunXml({
      text: doc.header.name,
      fontFamily: displayFont,
      sizePt: spec.sizes.namePt,
      bold: true,
      colorHex: inkHex,
    }),
  ];
  if (doc.header.headline.trim()) {
    nameRuns.push(
      buildRunXml({
        text: `   ${doc.header.headline.trim()}`,
        fontFamily: bodyFont,
        sizePt: spec.sizes.headlinePt,
        bold: spec.id === 'modern',
        colorHex: spec.id === 'modern' ? accentHex : mutedHex,
      }),
    );
  }
  paragraphs.push(
    `<w:p><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr>${nameRuns.join('')}</w:p>`,
  );

  // 2. Contact line with bottom hairline rule
  const contactSegments = [
    doc.header.email,
    doc.header.phone,
    doc.header.location,
    ...doc.header.links.map((l) => l.label),
  ].filter(Boolean);
  if (contactSegments.length > 0) {
    const contactBdr = `<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="${ruleHex}"/></w:pBdr>`;
    paragraphs.push(
      `<w:p><w:pPr><w:spacing w:before="0" w:after="120"/>${contactBdr}</w:pPr>${buildRunXml(
        {
          text: contactSegments.join('  ·  '),
          fontFamily: bodyFont,
          sizePt: spec.sizes.contactPt,
          colorHex: mutedHex,
        },
      )}</w:p>`,
    );
  }

  // 3. Summary
  if (doc.summary.trim()) {
    paragraphs.push(
      buildSectionHeadingParagraphXml({
        title: 'Summary',
        fontFamily: bodyFont,
        sizePt: spec.sizes.sectionHeadingPt,
        colorHex: sectionColorHex,
        ruleHex,
        hasBottomRule: true,
        beforePt: spec.sectionSpacingPt.beforeSection,
        afterPt: spec.sectionSpacingPt.afterSectionHeading,
      }),
    );
    paragraphs.push(
      `<w:p><w:pPr><w:jc w:val="${bodyJc}"/><w:spacing w:before="0" w:after="80" w:line="276" w:lineRule="auto"/></w:pPr>${buildRunXml(
        {
          text: doc.summary.trim(),
          fontFamily: bodyFont,
          sizePt: spec.sizes.bodyPt,
          colorHex: inkHex,
        },
      )}</w:p>`,
    );
  }

  // 4. Experience
  if (doc.experiences.length > 0) {
    paragraphs.push(
      buildSectionHeadingParagraphXml({
        title: 'Experience',
        fontFamily: bodyFont,
        sizePt: spec.sizes.sectionHeadingPt,
        colorHex: sectionColorHex,
        ruleHex,
        hasBottomRule: true,
        beforePt: spec.sectionSpacingPt.beforeSection,
        afterPt: spec.sectionSpacingPt.afterSectionHeading,
      }),
    );

    doc.experiences.forEach((exp, idx) => {
      const roleLeft = `${exp.title}, ${exp.company}${exp.location ? ` · ${exp.location}` : ''}`;
      const beforeRoleTwips =
        idx === 0 ? 0 : Math.round(spec.sectionSpacingPt.betweenRoles * 20);
      paragraphs.push(
        `<w:p><w:pPr><w:keepNext/><w:tabs><w:tab w:val="right" w:pos="${contentWidthTwips}"/></w:tabs><w:spacing w:before="${beforeRoleTwips}" w:after="40"/></w:pPr>${buildRunXml(
          {
            text: roleLeft,
            fontFamily: bodyFont,
            sizePt: spec.sizes.roleTitlePt,
            bold: true,
            colorHex: inkHex,
          },
        )}<w:r><w:tab/></w:r>${buildRunXml({
          text: exp.dateRange,
          fontFamily: bodyFont,
          sizePt: spec.sizes.metaPt,
          colorHex: mutedHex,
        })}</w:p>`,
      );

      for (const bullet of exp.bullets) {
        paragraphs.push(
          `<w:p><w:pPr><w:jc w:val="${bodyJc}"/><w:ind w:left="240" w:hanging="160"/><w:spacing w:before="0" w:after="${Math.round(spec.sectionSpacingPt.betweenBullets * 20)}" w:line="268" w:lineRule="auto"/></w:pPr>${buildRunXml(
            {
              text: `•  ${bullet.text}`,
              fontFamily: bodyFont,
              sizePt: spec.sizes.bodyPt,
              colorHex: inkHex,
            },
          )}</w:p>`,
        );
      }
    });
  }

  // 5. Projects
  if (doc.projects.length > 0) {
    paragraphs.push(
      buildSectionHeadingParagraphXml({
        title: 'Projects',
        fontFamily: bodyFont,
        sizePt: spec.sizes.sectionHeadingPt,
        colorHex: sectionColorHex,
        ruleHex,
        hasBottomRule: true,
        beforePt: spec.sectionSpacingPt.beforeSection,
        afterPt: spec.sectionSpacingPt.afterSectionHeading,
      }),
    );

    doc.projects.forEach((proj, idx) => {
      const projHeader = `${proj.name}${proj.role ? ` — ${proj.role}` : ''}${proj.link ? ` (${proj.link})` : ''}`;
      const beforeTwips =
        idx === 0 ? 0 : Math.round(spec.sectionSpacingPt.betweenRoles * 15);
      paragraphs.push(
        `<w:p><w:pPr><w:keepNext/><w:spacing w:before="${beforeTwips}" w:after="30"/></w:pPr>${buildRunXml(
          {
            text: projHeader,
            fontFamily: bodyFont,
            sizePt: spec.sizes.roleTitlePt,
            bold: true,
            colorHex: inkHex,
          },
        )}</w:p>`,
      );
      if (proj.description.trim()) {
        paragraphs.push(
          `<w:p><w:pPr><w:jc w:val="${bodyJc}"/><w:spacing w:before="0" w:after="40" w:line="268" w:lineRule="auto"/></w:pPr>${buildRunXml(
            {
              text: proj.description.trim(),
              fontFamily: bodyFont,
              sizePt: spec.sizes.bodyPt,
              colorHex: inkHex,
            },
          )}</w:p>`,
        );
      }
      for (const hl of proj.highlights) {
        paragraphs.push(
          `<w:p><w:pPr><w:jc w:val="${bodyJc}"/><w:ind w:left="240" w:hanging="160"/><w:spacing w:before="0" w:after="${Math.round(spec.sectionSpacingPt.betweenBullets * 20)}" w:line="268" w:lineRule="auto"/></w:pPr>${buildRunXml(
            {
              text: `•  ${hl}`,
              fontFamily: bodyFont,
              sizePt: spec.sizes.bodyPt,
              colorHex: inkHex,
            },
          )}</w:p>`,
        );
      }
    });
  }

  // 6. Skills
  if (doc.skillsByCategory.length > 0) {
    paragraphs.push(
      buildSectionHeadingParagraphXml({
        title: 'Skills',
        fontFamily: bodyFont,
        sizePt: spec.sizes.sectionHeadingPt,
        colorHex: sectionColorHex,
        ruleHex,
        hasBottomRule: true,
        beforePt: spec.sectionSpacingPt.beforeSection,
        afterPt: spec.sectionSpacingPt.afterSectionHeading,
      }),
    );

    for (const group of doc.skillsByCategory) {
      paragraphs.push(
        `<w:p><w:pPr><w:jc w:val="${bodyJc}"/><w:spacing w:before="0" w:after="45" w:line="268" w:lineRule="auto"/></w:pPr>${buildRunXml(
          {
            text: `${group.category}: `,
            fontFamily: bodyFont,
            sizePt: spec.sizes.bodyPt,
            bold: true,
            colorHex: inkHex,
          },
        )}${buildRunXml({
          text: group.skills.join(', '),
          fontFamily: bodyFont,
          sizePt: spec.sizes.bodyPt,
          colorHex: inkHex,
        })}</w:p>`,
      );
    }
  }

  // 7. Education
  if (doc.educations.length > 0) {
    paragraphs.push(
      buildSectionHeadingParagraphXml({
        title: 'Education',
        fontFamily: bodyFont,
        sizePt: spec.sizes.sectionHeadingPt,
        colorHex: sectionColorHex,
        ruleHex,
        hasBottomRule: true,
        beforePt: spec.sectionSpacingPt.beforeSection,
        afterPt: spec.sectionSpacingPt.afterSectionHeading,
      }),
    );

    for (const edu of doc.educations) {
      const eduLeft = `${edu.degreeLine} — ${edu.institution}`;
      paragraphs.push(
        `<w:p><w:pPr><w:tabs><w:tab w:val="right" w:pos="${contentWidthTwips}"/></w:tabs><w:spacing w:before="0" w:after="45"/></w:pPr>${buildRunXml(
          {
            text: eduLeft,
            fontFamily: bodyFont,
            sizePt: spec.sizes.bodyPt,
            bold: true,
            colorHex: inkHex,
          },
        )}<w:r><w:tab/></w:r>${buildRunXml({
          text: edu.dateRange,
          fontFamily: bodyFont,
          sizePt: spec.sizes.metaPt,
          colorHex: mutedHex,
        })}</w:p>`,
      );
    }
  }

  // 8. Certifications
  if (doc.certifications.length > 0) {
    paragraphs.push(
      buildSectionHeadingParagraphXml({
        title: 'Certifications',
        fontFamily: bodyFont,
        sizePt: spec.sizes.sectionHeadingPt,
        colorHex: sectionColorHex,
        ruleHex,
        hasBottomRule: true,
        beforePt: spec.sectionSpacingPt.beforeSection,
        afterPt: spec.sectionSpacingPt.afterSectionHeading,
      }),
    );

    for (const cert of doc.certifications) {
      const certLine = `${cert.name} (${cert.issuer}${cert.date ? `, ${cert.date}` : ''})`;
      paragraphs.push(
        `<w:p><w:pPr><w:spacing w:before="0" w:after="40"/></w:pPr>${buildRunXml(
          {
            text: certLine,
            fontFamily: bodyFont,
            sizePt: spec.sizes.bodyPt,
            colorHex: inkHex,
          },
        )}</w:p>`,
      );
    }
  }

  const sectPr = `<w:sectPr><w:pgSz w:w="${pageWTwips}" w:h="${pageHTwips}"/><w:pgMar w:top="${topTwips}" w:right="${rightTwips}" w:bottom="${bottomTwips}" w:left="${leftTwips}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  return `${paragraphs.join('')}${sectPr}`;
}

function buildCoverLetterDocxBodyXml(
  doc: CoverLetterDocument,
  options?: DocxRenderOptions,
): string {
  const templateId = options?.templateId ?? doc.meta.templateId ?? 'classic';
  const pageSize: PageSize = options?.pageSize ?? doc.meta.pageSize ?? 'letter';
  const spec = getTemplateSpec(templateId, pageSize);
  const dims = PAGE_SIZES[pageSize];

  const pageWTwips = Math.round(dims.widthPt * 20);
  const pageHTwips = Math.round(dims.heightPt * 20);
  const topTwips = Math.round(spec.margins.topPt * 20);
  const bottomTwips = Math.round(spec.margins.bottomPt * 20);
  const leftTwips = Math.round(spec.margins.leftPt * 20);
  const rightTwips = Math.round(spec.margins.rightPt * 20);

  const displayFont =
    spec.fonts.nameFont === 'Fraunces' ? 'Fraunces' : 'Plus Jakarta Sans';
  const bodyFont = 'Plus Jakarta Sans';
  const inkHex = DOC_INK_HEX;
  const mutedHex = DOC_MUTED_HEX;
  const accentHex = DOC_ACCENT_HEX;
  const ruleHex = rgbToHex(spec.ruleStyle.colorRgb);
  const bodyJc = alignToOoxmlJc(doc.meta.textAlign);

  const paragraphs: string[] = [];

  const nameRuns: string[] = [
    buildRunXml({
      text: doc.header.name,
      fontFamily: displayFont,
      sizePt: spec.sizes.namePt,
      bold: true,
      colorHex: inkHex,
    }),
  ];
  if (doc.header.headline.trim()) {
    nameRuns.push(
      buildRunXml({
        text: `   ${doc.header.headline.trim()}`,
        fontFamily: bodyFont,
        sizePt: spec.sizes.headlinePt,
        bold: spec.id === 'modern',
        colorHex: spec.id === 'modern' ? accentHex : mutedHex,
      }),
    );
  }
  paragraphs.push(
    `<w:p><w:pPr><w:spacing w:before="0" w:after="60"/></w:pPr>${nameRuns.join('')}</w:p>`,
  );

  const contactSegments = [
    doc.header.email,
    doc.header.phone,
    doc.header.location,
    ...doc.header.links.map((l) => l.label),
  ].filter(Boolean);
  if (contactSegments.length > 0) {
    const contactBdr = `<w:pBdr><w:bottom w:val="single" w:sz="4" w:space="4" w:color="${ruleHex}"/></w:pBdr>`;
    paragraphs.push(
      `<w:p><w:pPr><w:spacing w:before="0" w:after="180"/>${contactBdr}</w:pPr>${buildRunXml(
        {
          text: contactSegments.join('  ·  '),
          fontFamily: bodyFont,
          sizePt: spec.sizes.contactPt,
          colorHex: mutedHex,
        },
      )}</w:p>`,
    );
  }

  paragraphs.push(
    `<w:p><w:pPr><w:spacing w:before="60" w:after="60"/></w:pPr>${buildRunXml({
      text: doc.dateLine,
      fontFamily: bodyFont,
      sizePt: spec.sizes.metaPt,
      colorHex: mutedHex,
    })}</w:p>`,
  );
  paragraphs.push(
    `<w:p><w:pPr><w:spacing w:before="0" w:after="160"/></w:pPr>${buildRunXml({
      text: `${doc.recipientLine}${doc.meta.targetCompany ? ` — ${doc.meta.targetCompany}` : ''}`,
      fontFamily: bodyFont,
      sizePt: spec.sizes.bodyPt,
      bold: true,
      colorHex: inkHex,
    })}</w:p>`,
  );

  for (const block of doc.blocks) {
    if (!block.text.trim()) continue;
    const isProseBlock =
      block.type === 'opening' ||
      block.type === 'body1' ||
      block.type === 'body2' ||
      block.type === 'whyCompany' ||
      block.type === 'closing';
    const jc = isProseBlock ? bodyJc : 'left';
    paragraphs.push(
      `<w:p><w:pPr><w:jc w:val="${jc}"/><w:spacing w:before="0" w:after="160" w:line="280" w:lineRule="auto"/></w:pPr>${buildRunXml(
        {
          text: block.text.trim(),
          fontFamily: bodyFont,
          sizePt: spec.sizes.bodyPt,
          colorHex: inkHex,
        },
      )}</w:p>`,
    );
  }

  const sectPr = `<w:sectPr><w:pgSz w:w="${pageWTwips}" w:h="${pageHTwips}"/><w:pgMar w:top="${topTwips}" w:right="${rightTwips}" w:bottom="${bottomTwips}" w:left="${leftTwips}" w:header="720" w:footer="720" w:gutter="0"/></w:sectPr>`;
  return `${paragraphs.join('')}${sectPr}`;
}

export function renderDocumentToDocxBytes(
  doc: ExportableDocument,
  options?: DocxRenderOptions,
): Uint8Array {
  const encoder = new TextEncoder();
  const bodyXml =
    doc.kind === 'coverLetter'
      ? buildCoverLetterDocxBodyXml(doc, options)
      : buildResumeDocxBodyXml(doc, options);

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
</Types>`;

  const rootRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRelsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault>
      <w:rPr>
        <w:rFonts w:ascii="Plus Jakarta Sans" w:hAnsi="Plus Jakarta Sans" w:cs="Plus Jakarta Sans"/>
        <w:sz w:val="20"/>
        <w:szCs w:val="20"/>
        <w:lang w:val="en-US"/>
      </w:rPr>
    </w:rPrDefault>
    <w:pPrDefault>
      <w:pPr>
        <w:spacing w:after="60" w:line="260" w:lineRule="auto"/>
      </w:pPr>
    </w:pPrDefault>
  </w:docDefaults>
</w:styles>`;

  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${bodyXml}</w:body>
</w:document>`;

  return createZipArchive([
    { name: '[Content_Types].xml', data: encoder.encode(contentTypesXml) },
    { name: '_rels/.rels', data: encoder.encode(rootRelsXml) },
    { name: 'word/_rels/document.xml.rels', data: encoder.encode(docRelsXml) },
    { name: 'word/styles.xml', data: encoder.encode(stylesXml) },
    { name: 'word/document.xml', data: encoder.encode(documentXml) },
  ]);
}

// ============================================================================
// Rich WYSIWYG HTML Generator for Direct Paste into Google Docs
// ============================================================================

export function renderDocumentToGoogleDocsHtml(
  doc: ExportableDocument,
  options?: DocxRenderOptions,
): string {
  const templateId = options?.templateId ?? doc.meta.templateId ?? 'classic';
  const spec = getTemplateSpec(templateId);
  const displayFont =
    spec.fonts.nameFont === 'Fraunces'
      ? "'Fraunces', Georgia, serif"
      : "'Plus Jakarta Sans', Arial, sans-serif";
  const bodyFont = "'Plus Jakarta Sans', Arial, sans-serif";

  const inkHex = `#${DOC_INK_HEX}`;
  const mutedHex = `#${DOC_MUTED_HEX}`;
  const accentHex = `#${DOC_ACCENT_HEX}`;
  const ruleHex = `#${rgbToHex(spec.ruleStyle.colorRgb)}`;
  const sectionColor = spec.id === 'modern' ? accentHex : inkHex;
  const textAlign = alignToCss(doc.meta.textAlign);

  const contactSegments = [
    doc.header.email,
    doc.header.phone,
    doc.header.location,
    ...doc.header.links.map((l) => l.label),
  ].filter(Boolean);

  const headerHtml = `
    <p style="margin:0 0 3pt 0; line-height:1.2;">
      <span style="font-family:${displayFont}; font-size:${spec.sizes.namePt}pt; font-weight:700; color:${inkHex};">${escapeHtml(doc.header.name)}</span>
      ${
        doc.header.headline.trim()
          ? `<span style="font-family:${bodyFont}; font-size:${spec.sizes.headlinePt}pt; font-weight:${spec.id === 'modern' ? '700' : '400'}; color:${spec.id === 'modern' ? accentHex : mutedHex};">&nbsp;&nbsp;&nbsp;${escapeHtml(doc.header.headline.trim())}</span>`
          : ''
      }
    </p>
    ${
      contactSegments.length > 0
        ? `<p style="margin:0 0 8pt 0; padding-bottom:4pt; font-family:${bodyFont}; font-size:${spec.sizes.contactPt}pt; color:${mutedHex}; border-bottom:1px solid ${ruleHex};">${escapeHtml(contactSegments.join('  ·  '))}</p>`
        : ''
    }
  `;

  if (doc.kind === 'coverLetter') {
    const blocksHtml = doc.blocks
      .filter((b) => b.text.trim())
      .map((b) => {
        const isProse =
          b.type === 'opening' ||
          b.type === 'body1' ||
          b.type === 'body2' ||
          b.type === 'whyCompany' ||
          b.type === 'closing';
        return `<p style="margin:0 0 8pt 0; font-family:${bodyFont}; font-size:${spec.sizes.bodyPt}pt; line-height:1.45; color:${inkHex}; text-align:${isProse ? textAlign : 'left'};">${escapeHtml(b.text.trim())}</p>`;
      })
      .join('');

    return `<div style="font-family:${bodyFont}; color:${inkHex}; max-width:680px;">
      ${headerHtml}
      <p style="margin:6pt 0 3pt 0; font-family:${bodyFont}; font-size:${spec.sizes.metaPt}pt; color:${mutedHex};">${escapeHtml(doc.dateLine)}</p>
      <p style="margin:0 0 10pt 0; font-family:${bodyFont}; font-size:${spec.sizes.bodyPt}pt; font-weight:700; color:${inkHex};">${escapeHtml(doc.recipientLine)}${doc.meta.targetCompany ? ` — ${escapeHtml(doc.meta.targetCompany)}` : ''}</p>
      ${blocksHtml}
    </div>`;
  }

  const sectionHeader = (title: string) =>
    `<p style="margin:${spec.sectionSpacingPt.beforeSection}pt 0 ${spec.sectionSpacingPt.afterSectionHeading}pt 0; padding-bottom:2pt; font-family:${bodyFont}; font-size:${spec.sizes.sectionHeadingPt}pt; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${sectionColor}; border-bottom:1px solid ${ruleHex};">${escapeHtml(title.toUpperCase())}</p>`;

  const summaryHtml = doc.summary.trim()
    ? `${sectionHeader('Summary')}<p style="margin:0 0 4pt 0; font-family:${bodyFont}; font-size:${spec.sizes.bodyPt}pt; line-height:1.38; color:${inkHex}; text-align:${textAlign};">${escapeHtml(doc.summary.trim())}</p>`
    : '';

  const experienceHtml =
    doc.experiences.length > 0
      ? `${sectionHeader('Experience')}${doc.experiences
          .map(
            (exp, idx) => `
          <table style="width:100%; border-collapse:collapse; margin:${idx === 0 ? '0' : `${spec.sectionSpacingPt.betweenRoles}pt`} 0 2pt 0; border:none;">
            <tr>
              <td style="padding:0; border:none; font-family:${bodyFont}; font-size:${spec.sizes.roleTitlePt}pt; font-weight:700; color:${inkHex}; text-align:left;">
                ${escapeHtml(`${exp.title}, ${exp.company}${exp.location ? ` · ${exp.location}` : ''}`)}
              </td>
              <td style="padding:0; border:none; font-family:${bodyFont}; font-size:${spec.sizes.metaPt}pt; color:${mutedHex}; text-align:right; white-space:nowrap;">
                ${escapeHtml(exp.dateRange)}
              </td>
            </tr>
          </table>
          <ul style="margin:0 0 2pt 14pt; padding:0;">
            ${exp.bullets
              .map(
                (b) =>
                  `<li style="margin:0 0 ${spec.sectionSpacingPt.betweenBullets}pt 0; font-family:${bodyFont}; font-size:${spec.sizes.bodyPt}pt; line-height:1.36; color:${inkHex}; text-align:${textAlign};">${escapeHtml(b.text)}</li>`,
              )
              .join('')}
          </ul>
        `,
          )
          .join('')}`
      : '';

  const projectsHtml =
    doc.projects.length > 0
      ? `${sectionHeader('Projects')}${doc.projects
          .map(
            (proj, idx) => `
          <p style="margin:${idx === 0 ? '0' : '4pt'} 0 1.5pt 0; font-family:${bodyFont}; font-size:${spec.sizes.roleTitlePt}pt; font-weight:700; color:${inkHex};">
            ${escapeHtml(`${proj.name}${proj.role ? ` — ${proj.role}` : ''}${proj.link ? ` (${proj.link})` : ''}`)}
          </p>
          ${
            proj.description.trim()
              ? `<p style="margin:0 0 2pt 0; font-family:${bodyFont}; font-size:${spec.sizes.bodyPt}pt; line-height:1.36; color:${inkHex}; text-align:${textAlign};">${escapeHtml(proj.description.trim())}</p>`
              : ''
          }
          ${
            proj.highlights.length > 0
              ? `<ul style="margin:0 0 2pt 14pt; padding:0;">${proj.highlights
                  .map(
                    (hl) =>
                      `<li style="margin:0 0 ${spec.sectionSpacingPt.betweenBullets}pt 0; font-family:${bodyFont}; font-size:${spec.sizes.bodyPt}pt; line-height:1.36; color:${inkHex}; text-align:${textAlign};">${escapeHtml(hl)}</li>`,
                  )
                  .join('')}</ul>`
              : ''
          }
        `,
          )
          .join('')}`
      : '';

  const skillsHtml =
    doc.skillsByCategory.length > 0
      ? `${sectionHeader('Skills')}${doc.skillsByCategory
          .map(
            (g) =>
              `<p style="margin:0 0 2.5pt 0; font-family:${bodyFont}; font-size:${spec.sizes.bodyPt}pt; line-height:1.35; color:${inkHex}; text-align:${textAlign};"><strong>${escapeHtml(g.category)}:</strong> ${escapeHtml(g.skills.join(', '))}</p>`,
          )
          .join('')}`
      : '';

  const educationHtml =
    doc.educations.length > 0
      ? `${sectionHeader('Education')}${doc.educations
          .map(
            (edu) => `
          <table style="width:100%; border-collapse:collapse; margin:0 0 2pt 0; border:none;">
            <tr>
              <td style="padding:0; border:none; font-family:${bodyFont}; font-size:${spec.sizes.bodyPt}pt; font-weight:700; color:${inkHex}; text-align:left;">
                ${escapeHtml(`${edu.degreeLine} — ${edu.institution}`)}
              </td>
              <td style="padding:0; border:none; font-family:${bodyFont}; font-size:${spec.sizes.metaPt}pt; color:${mutedHex}; text-align:right; white-space:nowrap;">
                ${escapeHtml(edu.dateRange)}
              </td>
            </tr>
          </table>
        `,
          )
          .join('')}`
      : '';

  const certificationsHtml =
    doc.certifications.length > 0
      ? `${sectionHeader('Certifications')}${doc.certifications
          .map(
            (c) =>
              `<p style="margin:0 0 2pt 0; font-family:${bodyFont}; font-size:${spec.sizes.bodyPt}pt; color:${inkHex};">${escapeHtml(`${c.name} (${c.issuer}${c.date ? `, ${c.date}` : ''})`)}</p>`,
          )
          .join('')}`
      : '';

  return `<div style="font-family:${bodyFont}; color:${inkHex}; max-width:680px;">
    ${headerHtml}
    ${summaryHtml}
    ${experienceHtml}
    ${projectsHtml}
    ${skillsHtml}
    ${educationHtml}
    ${certificationsHtml}
  </div>`;
}
