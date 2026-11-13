import {
  CoverLetterDocument,
  ExportableDocument,
  PageSize,
  ResumeDocument,
  TemplateId,
  TextAlign,
} from './entities';
import { PositionedText } from './appeal';
import { formatContactBlock } from './bulletAssembler';
import {
  TemplateSpec,
  computeDocumentContentHash,
  getTemplateSpec,
} from './templateSpec';
import {
  EMBEDDED_FONTS,
  EmbeddedFontAsset,
  EmbeddedFontKey,
} from './embeddedFonts';

export type InternalFontKey = EmbeddedFontKey;

export interface PdfRenderOptions {
  templateId?: TemplateId;
  pageSize?: PageSize;
}

export interface RenderedPdfArtifact {
  bytes: Uint8Array;
  pageCount: number;
  positionedText: PositionedText[];
  contentHash: string;
}

const FONT_PDF_ALIAS: Record<InternalFontKey, string> = {
  'plus-jakarta-regular': 'F1',
  'plus-jakarta-semibold': 'F2',
  'plus-jakarta-bold': 'F3',
  'fraunces-semibold': 'F4',
  'fraunces-bold': 'F5',
};

function resolveInternalFontKey(
  family: 'Fraunces' | 'PlusJakartaSans',
  weight: 400 | 600 | 700,
): InternalFontKey {
  if (family === 'Fraunces') {
    return weight >= 700 ? 'fraunces-bold' : 'fraunces-semibold';
  }
  if (weight >= 700) return 'plus-jakarta-bold';
  if (weight >= 600) return 'plus-jakarta-semibold';
  return 'plus-jakarta-regular';
}

const UNICODE_TO_CUSTOM_BYTE: Record<number, number> = {
  0x2022: 0x80, // •
  0x2013: 0x81, // –
  0x2014: 0x82, // —
  0x2192: 0x83, // →
  0x2019: 0x84, // ’
  0x2018: 0x85, // ‘
  0x201c: 0x86, // “
  0x201d: 0x87, // ”
  0x00a0: 0x20,
};

function charToCustomByte(ch: string): number {
  const cp = ch.codePointAt(0) ?? 0x20;
  if (UNICODE_TO_CUSTOM_BYTE[cp] !== undefined) {
    return UNICODE_TO_CUSTOM_BYTE[cp];
  }
  if (cp >= 0x20 && cp <= 0x7e) return cp;
  if (cp >= 0xa0 && cp <= 0xff) return cp;
  const decomposed = ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const dCp = decomposed.codePointAt(0) ?? 0x20;
  if (dCp >= 0x20 && dCp <= 0x7e) return dCp;
  return 0x20;
}

function encodePdfLiteral(input: string): string {
  let out = '';
  for (const ch of input) {
    const b = charToCustomByte(ch);
    if (b === 0x28) {
      out += '\\(';
    } else if (b === 0x29) {
      out += '\\)';
    } else if (b === 0x5c) {
      out += '\\\\';
    } else if (b >= 0x20 && b <= 0x7e) {
      out += String.fromCharCode(b);
    } else {
      out += `\\${b.toString(8).padStart(3, '0')}`;
    }
  }
  return out;
}

function encodePdfUtf16Hex(input: string): string {
  let hex = 'FEFF';
  for (let i = 0; i < input.length; i++) {
    const code = input.charCodeAt(i);
    hex += code.toString(16).toUpperCase().padStart(4, '0');
  }
  return `<${hex}>`;
}

/**
 * Measures the exact point width of `text` using the embedded TrueType `hmtx` advance widths.
 */
export function measureTextWidthPt(
  text: string,
  fontKey: InternalFontKey,
  fontSizePt: number,
): number {
  if (!text) return 0;
  const asset: EmbeddedFontAsset =
    EMBEDDED_FONTS[fontKey] ?? EMBEDDED_FONTS['plus-jakarta-regular'];
  let totalThousandths = 0;
  for (const ch of text) {
    const b = charToCustomByte(ch);
    const idx = Math.max(0, Math.min(asset.widths.length - 1, b - 32));
    totalThousandths += asset.widths[idx] ?? 500;
  }
  return (totalThousandths * fontSizePt) / 1000;
}

/**
 * Wraps a paragraph into lines that fit within `maxWidthPt` using exact TrueType glyph metrics.
 */
export function wrapTextByPoints(
  text: string,
  fontKey: InternalFontKey,
  fontSizePt: number,
  maxWidthPt: number,
): string[] {
  const cleaned = text.replace(/\s+/g, ' ').trim();
  if (!cleaned) return [];

  const words = cleaned.split(' ');
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      if (measureTextWidthPt(word, fontKey, fontSizePt) <= maxWidthPt) {
        current = word;
      } else {
        let chunk = '';
        for (const ch of word) {
          const candidate = chunk + ch;
          if (
            chunk &&
            measureTextWidthPt(candidate, fontKey, fontSizePt) > maxWidthPt
          ) {
            lines.push(chunk);
            chunk = ch;
          } else {
            chunk = candidate;
          }
        }
        current = chunk;
      }
      continue;
    }

    const candidate = `${current} ${word}`;
    if (measureTextWidthPt(candidate, fontKey, fontSizePt) <= maxWidthPt) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }

  if (current) {
    lines.push(current);
  }
  return lines;
}

interface TextRun {
  text: string;
  xPt: number;
  widthPt: number;
  fontKey: InternalFontKey;
  fontSizePt: number;
  bold: boolean;
  colorRgb: [number, number, number];
  linkUri?: string;
  wordSpacingPt?: number;
}

function computeAlignedRunMetrics(params: {
  text: string;
  baseLeftX: number;
  maxWidthPt: number;
  rawWidthPt: number;
  align: TextAlign;
  isLastLine: boolean;
}): { xPt: number; widthPt: number; wordSpacingPt?: number } {
  const { text, baseLeftX, maxWidthPt, rawWidthPt, align, isLastLine } = params;
  if (align === 'justify' && !isLastLine) {
    const spaceCount = (text.match(/ /g) ?? []).length;
    if (spaceCount > 0 && rawWidthPt < maxWidthPt) {
      const fillRatio = rawWidthPt / Math.max(1, maxWidthPt);
      if (fillRatio >= 0.7) {
        const ws = (maxWidthPt - rawWidthPt) / spaceCount;
        // Cap word spacing at 4.2pt; fall back to left-aligned normal spacing when gaps would be wide
        if (ws <= 4.2) {
          return {
            xPt: baseLeftX,
            widthPt: maxWidthPt,
            wordSpacingPt: Number(ws.toFixed(3)),
          };
        }
      }
    }
  }
  return {
    xPt: baseLeftX,
    widthPt: rawWidthPt,
  };
}

interface LayoutLine {
  runs: TextRun[];
  heightPt: number;
  spaceBeforePt: number;
  spaceAfterPt: number;
  ruleBelow?: {
    thicknessPt: number;
    gapBelowTextPt: number;
    colorRgb: [number, number, number];
  };
  keepWithNext?: boolean;
  groupId?: string;
}

interface PlacedLine {
  page: number;
  baselineYPt: number;
  topYPt: number;
  line: LayoutLine;
}

interface LinkAnnotationSpec {
  page: number;
  rect: [number, number, number, number];
  uri: string;
}

const INK_PRIMARY: [number, number, number] = [0.09, 0.1, 0.12];
const INK_SECONDARY: [number, number, number] = [0.26, 0.28, 0.32];
const INK_MUTED: [number, number, number] = [0.38, 0.4, 0.45];

function buildLayoutLines(
  doc: ExportableDocument,
  spec: TemplateSpec,
  rhythmScale: number,
): LayoutLine[] {
  const lines: LayoutLine[] = [];
  const contentWidthPt =
    spec.pageDimensions.widthPt - spec.margins.leftPt - spec.margins.rightPt;
  const leftX = spec.margins.leftPt;
  const rightX = spec.pageDimensions.widthPt - spec.margins.rightPt;

  const nameFontKey = resolveInternalFontKey(
    spec.fonts.nameFont,
    spec.fonts.nameWeight,
  );
  const headingFontKey = resolveInternalFontKey(
    spec.fonts.headingFont,
    spec.fonts.headingWeight,
  );
  const bodyFontKey = resolveInternalFontKey(
    spec.fonts.bodyFont,
    spec.fonts.bodyWeight,
  );
  const boldFontKey = resolveInternalFontKey(
    spec.fonts.boldFont,
    spec.fonts.boldWeight,
  );

  const scaleSpace = (pt: number) => Number((pt * rhythmScale).toFixed(2));
  const scaleLead = (baseLineHeight: number) =>
    baseLineHeight * (1 + (rhythmScale - 1) * 0.32);

  // 1. Header block — always place Name and Job Title inline on the same line when headline is present
  const contact = formatContactBlock(doc.header);
  const nameText = doc.header.name.trim();
  const headlineText = doc.header.headline.trim();
  const textAlign: TextAlign = doc.meta.textAlign ?? 'left';

  if (headlineText) {
    let nameSizePt = spec.sizes.namePt;
    let headSizePt = spec.sizes.headlinePt;
    const gapPt = 10;
    let nameW = measureTextWidthPt(nameText, nameFontKey, nameSizePt);
    let headW = measureTextWidthPt(headlineText, boldFontKey, headSizePt);

    // Smoothly scale down headline and name font sizes if needed so both always fit on the same line
    while (
      nameW + gapPt + headW > contentWidthPt &&
      (headSizePt > 8.25 || nameSizePt > 14.5)
    ) {
      if (headSizePt > 8.25) {
        headSizePt = Number(Math.max(8.25, headSizePt - 0.5).toFixed(2));
      } else {
        nameSizePt = Number(Math.max(14.5, nameSizePt - 0.5).toFixed(2));
      }
      nameW = measureTextWidthPt(nameText, nameFontKey, nameSizePt);
      headW = measureTextWidthPt(headlineText, boldFontKey, headSizePt);
    }

    let fittedHeadline = headlineText;
    if (nameW + gapPt + headW > contentWidthPt) {
      const availHeadW = Math.max(80, contentWidthPt - nameW - gapPt);
      const wrappedHead = wrapTextByPoints(
        headlineText,
        boldFontKey,
        headSizePt,
        availHeadW,
      );
      fittedHeadline = wrappedHead[0] ?? headlineText;
      headW = measureTextWidthPt(fittedHeadline, boldFontKey, headSizePt);
    }

    lines.push({
      runs: [
        {
          text: nameText,
          xPt: leftX,
          widthPt: nameW,
          fontKey: nameFontKey,
          fontSizePt: nameSizePt,
          bold: true,
          colorRgb: INK_PRIMARY,
        },
        {
          text: fittedHeadline,
          xPt: leftX + nameW + gapPt,
          widthPt: headW,
          fontKey: boldFontKey,
          fontSizePt: headSizePt,
          bold: true,
          colorRgb: INK_SECONDARY,
        },
      ],
      heightPt: nameSizePt * spec.lineHeights.name,
      spaceBeforePt: 0,
      spaceAfterPt: 4.5,
      keepWithNext: true,
    });
  } else {
    const nameW = measureTextWidthPt(nameText, nameFontKey, spec.sizes.namePt);
    lines.push({
      runs: [
        {
          text: nameText,
          xPt: leftX,
          widthPt: nameW,
          fontKey: nameFontKey,
          fontSizePt: spec.sizes.namePt,
          bold: true,
          colorRgb: INK_PRIMARY,
        },
      ],
      heightPt: spec.sizes.namePt * spec.lineHeights.name,
      spaceBeforePt: 0,
      spaceAfterPt: 2,
      keepWithNext: true,
    });
  }

  // Contact line 1 (`email · phone · location`)
  if (contact.line1.length > 0) {
    const contactLine1Str = contact.line1.join(' · ');
    const line1W = measureTextWidthPt(
      contactLine1Str,
      bodyFontKey,
      spec.sizes.contactPt,
    );
    const emailPart = doc.header.email.trim();
    lines.push({
      runs: [
        {
          text: contactLine1Str,
          xPt: leftX,
          widthPt: line1W,
          fontKey: bodyFontKey,
          fontSizePt: spec.sizes.contactPt,
          bold: false,
          colorRgb: INK_MUTED,
          linkUri: emailPart ? `mailto:${emailPart}` : undefined,
        },
      ],
      heightPt: spec.sizes.contactPt * 1.28,
      spaceBeforePt: 1,
      spaceAfterPt:
        contact.line2.length > 0
          ? 1
          : scaleSpace(spec.sectionSpacingPt.afterHeader),
      ruleBelow:
        contact.line2.length === 0
          ? {
              thicknessPt: spec.ruleStyle.thicknessPt,
              gapBelowTextPt: spec.ruleStyle.gapBelowHeadingPt + 2,
              colorRgb: spec.ruleStyle.colorRgb,
            }
          : undefined,
      keepWithNext: true,
    });
  }

  // Contact line 2 (links)
  if (contact.line2.length > 0) {
    const linkDisplayStr = contact.line2.map((l) => l.display).join(' · ');
    const linkW = measureTextWidthPt(
      linkDisplayStr,
      bodyFontKey,
      spec.sizes.contactPt,
    );
    const firstUrl = contact.line2[0]?.url;
    const normalizedUri =
      firstUrl && !/^https?:\/\//i.test(firstUrl)
        ? `https://${firstUrl}`
        : firstUrl;
    lines.push({
      runs: [
        {
          text: linkDisplayStr,
          xPt: leftX,
          widthPt: linkW,
          fontKey: bodyFontKey,
          fontSizePt: spec.sizes.contactPt,
          bold: false,
          colorRgb: INK_MUTED,
          linkUri: normalizedUri,
        },
      ],
      heightPt: spec.sizes.contactPt * 1.28,
      spaceBeforePt: 0,
      spaceAfterPt: scaleSpace(spec.sectionSpacingPt.afterHeader),
      ruleBelow: {
        thicknessPt: spec.ruleStyle.thicknessPt,
        gapBelowTextPt: spec.ruleStyle.gapBelowHeadingPt + 2,
        colorRgb: spec.ruleStyle.colorRgb,
      },
      keepWithNext: true,
    });
  }

  // 2. Cover Letter body
  if (doc.kind === 'coverLetter') {
    if (doc.dateLine.trim()) {
      const dateStr = doc.dateLine.trim();
      lines.push({
        runs: [
          {
            text: dateStr,
            xPt: leftX,
            widthPt: measureTextWidthPt(dateStr, bodyFontKey, spec.sizes.metaPt),
            fontKey: bodyFontKey,
            fontSizePt: spec.sizes.metaPt,
            bold: false,
            colorRgb: INK_MUTED,
          },
        ],
        heightPt: spec.sizes.metaPt * 1.35,
        spaceBeforePt: scaleSpace(4),
        spaceAfterPt: scaleSpace(2),
        keepWithNext: true,
      });
    }

    if (doc.recipientLine.trim()) {
      const recStr = doc.recipientLine.trim();
      lines.push({
        runs: [
          {
            text: recStr,
            xPt: leftX,
            widthPt: measureTextWidthPt(
              recStr,
              boldFontKey,
              spec.sizes.roleTitlePt,
            ),
            fontKey: boldFontKey,
            fontSizePt: spec.sizes.roleTitlePt,
            bold: true,
            colorRgb: INK_PRIMARY,
          },
        ],
        heightPt: spec.sizes.roleTitlePt * 1.35,
        spaceBeforePt: 0,
        spaceAfterPt: scaleSpace(spec.sectionSpacingPt.afterParagraph),
        keepWithNext: true,
      });
    }

    const bodyLineHeight =
      spec.sizes.bodyPt * scaleLead(spec.lineHeights.body);

    for (const block of doc.blocks) {
      const trimmed = block.text.trim();
      if (!trimmed) continue;
      const wrapped = wrapTextByPoints(
        trimmed,
        bodyFontKey,
        spec.sizes.bodyPt,
        contentWidthPt,
      );
      wrapped.forEach((wLine, idx) => {
        const isLast = idx === wrapped.length - 1;
        const rawW = measureTextWidthPt(wLine, bodyFontKey, spec.sizes.bodyPt);
        const aligned = computeAlignedRunMetrics({
          text: wLine,
          baseLeftX: leftX,
          maxWidthPt: contentWidthPt,
          rawWidthPt: rawW,
          align: textAlign,
          isLastLine: isLast,
        });
        lines.push({
          runs: [
            {
              text: wLine,
              xPt: aligned.xPt,
              widthPt: aligned.widthPt,
              wordSpacingPt: aligned.wordSpacingPt,
              fontKey: bodyFontKey,
              fontSizePt: spec.sizes.bodyPt,
              bold: false,
              colorRgb: INK_PRIMARY,
            },
          ],
          heightPt: bodyLineHeight,
          spaceBeforePt: 0,
          spaceAfterPt: isLast
            ? scaleSpace(spec.sectionSpacingPt.afterParagraph)
            : 0,
          groupId: block.id,
        });
      });
    }

    return lines;
  }

  // 3. Resume sections
  const addSectionHeading = (title: string) => {
    const upper = title.toUpperCase();
    const w = measureTextWidthPt(
      upper,
      headingFontKey,
      spec.sizes.sectionHeadingPt,
    );
    lines.push({
      runs: [
        {
          text: upper,
          xPt: leftX,
          widthPt: w,
          fontKey: headingFontKey,
          fontSizePt: spec.sizes.sectionHeadingPt,
          bold: true,
          colorRgb: INK_PRIMARY,
        },
      ],
      heightPt: spec.sizes.sectionHeadingPt * spec.lineHeights.heading,
      spaceBeforePt: scaleSpace(spec.sectionSpacingPt.beforeSection),
      spaceAfterPt: scaleSpace(spec.sectionSpacingPt.afterSectionHeading),
      ruleBelow: {
        thicknessPt: spec.ruleStyle.thicknessPt,
        gapBelowTextPt: spec.ruleStyle.gapBelowHeadingPt,
        colorRgb: spec.ruleStyle.colorRgb,
      },
      keepWithNext: true,
    });
  };

  const bodyLineHeight = spec.sizes.bodyPt * scaleLead(spec.lineHeights.body);
  const bulletLineHeight =
    spec.sizes.bodyPt * scaleLead(spec.lineHeights.bullet);

  // SUMMARY
  if (doc.summary.trim()) {
    addSectionHeading('SUMMARY');
    const summaryLines = wrapTextByPoints(
      doc.summary.trim(),
      bodyFontKey,
      spec.sizes.bodyPt,
      contentWidthPt,
    );
    summaryLines.forEach((sLine, idx) => {
      const isLast = idx === summaryLines.length - 1;
      const rawW = measureTextWidthPt(sLine, bodyFontKey, spec.sizes.bodyPt);
      const aligned = computeAlignedRunMetrics({
        text: sLine,
        baseLeftX: leftX,
        maxWidthPt: contentWidthPt,
        rawWidthPt: rawW,
        align: textAlign,
        isLastLine: isLast,
      });
      lines.push({
        runs: [
          {
            text: sLine,
            xPt: aligned.xPt,
            widthPt: aligned.widthPt,
            wordSpacingPt: aligned.wordSpacingPt,
            fontKey: bodyFontKey,
            fontSizePt: spec.sizes.bodyPt,
            bold: false,
            colorRgb: INK_PRIMARY,
          },
        ],
        heightPt: bodyLineHeight,
        spaceBeforePt: 0,
        spaceAfterPt: isLast ? scaleSpace(2) : 0,
        groupId: 'summary',
      });
    });
  }

  // EXPERIENCE
  if (doc.experiences.length > 0) {
    addSectionHeading('EXPERIENCE');
    doc.experiences.forEach((exp, expIdx) => {
      const titlePart = `${exp.title.trim()},`;
      const companyPart = ` ${exp.company.trim()}`;
      const locPart = exp.location.trim() ? ` · ${exp.location.trim()}` : '';
      const dateStr = exp.dateRange.trim();

      const titleW = measureTextWidthPt(
        titlePart,
        boldFontKey,
        spec.sizes.roleTitlePt,
      );
      const companyW = measureTextWidthPt(
        companyPart,
        bodyFontKey,
        spec.sizes.roleTitlePt,
      );
      const locW = locPart
        ? measureTextWidthPt(locPart, bodyFontKey, spec.sizes.roleTitlePt)
        : 0;
      const leftW = titleW + companyW + locW;
      const dateW = measureTextWidthPt(dateStr, bodyFontKey, spec.sizes.metaPt);

      if (leftW + 12 + dateW <= contentWidthPt) {
        const headerRuns: TextRun[] = [
          {
            text: titlePart,
            xPt: leftX,
            widthPt: titleW,
            fontKey: boldFontKey,
            fontSizePt: spec.sizes.roleTitlePt,
            bold: true,
            colorRgb: INK_PRIMARY,
          },
          {
            text: companyPart,
            xPt: leftX + titleW,
            widthPt: companyW,
            fontKey: bodyFontKey,
            fontSizePt: spec.sizes.roleTitlePt,
            bold: false,
            colorRgb: INK_PRIMARY,
          },
        ];
        if (locPart) {
          headerRuns.push({
            text: locPart,
            xPt: leftX + titleW + companyW,
            widthPt: locW,
            fontKey: bodyFontKey,
            fontSizePt: spec.sizes.roleTitlePt,
            bold: false,
            colorRgb: INK_MUTED,
          });
        }
        headerRuns.push({
          text: dateStr,
          xPt: Math.max(leftX + leftW + 12, rightX - dateW),
          widthPt: dateW,
          fontKey: bodyFontKey,
          fontSizePt: spec.sizes.metaPt,
          bold: false,
          colorRgb: INK_MUTED,
        });

        lines.push({
          runs: headerRuns,
          heightPt: spec.sizes.roleTitlePt * spec.lineHeights.heading,
          spaceBeforePt:
            expIdx > 0 ? scaleSpace(spec.sectionSpacingPt.betweenRoles) : 0,
          spaceAfterPt: scaleSpace(spec.sectionSpacingPt.afterRoleHeader),
          keepWithNext: true,
        });
      } else {
        const roleLeft = `${titlePart}${companyPart}${locPart}`;
        const wrappedLeft = wrapTextByPoints(
          roleLeft,
          bodyFontKey,
          spec.sizes.roleTitlePt,
          contentWidthPt - dateW - 14,
        );
        wrappedLeft.forEach((wl, wIdx) => {
          const runs: TextRun[] = [];
          if (wIdx === 0 && wl.startsWith(titlePart)) {
            const rem = wl.slice(titlePart.length);
            runs.push({
              text: titlePart,
              xPt: leftX,
              widthPt: titleW,
              fontKey: boldFontKey,
              fontSizePt: spec.sizes.roleTitlePt,
              bold: true,
              colorRgb: INK_PRIMARY,
            });
            if (rem) {
              const remW = measureTextWidthPt(
                rem,
                bodyFontKey,
                spec.sizes.roleTitlePt,
              );
              runs.push({
                text: rem,
                xPt: leftX + titleW,
                widthPt: remW,
                fontKey: bodyFontKey,
                fontSizePt: spec.sizes.roleTitlePt,
                bold: false,
                colorRgb: INK_PRIMARY,
              });
            }
          } else {
            const wlW = measureTextWidthPt(
              wl,
              bodyFontKey,
              spec.sizes.roleTitlePt,
            );
            runs.push({
              text: wl,
              xPt: leftX,
              widthPt: wlW,
              fontKey: bodyFontKey,
              fontSizePt: spec.sizes.roleTitlePt,
              bold: false,
              colorRgb: INK_MUTED,
            });
          }
          if (wIdx === wrappedLeft.length - 1) {
            runs.push({
              text: dateStr,
              xPt: rightX - dateW,
              widthPt: dateW,
              fontKey: bodyFontKey,
              fontSizePt: spec.sizes.metaPt,
              bold: false,
              colorRgb: INK_MUTED,
            });
          }
          lines.push({
            runs,
            heightPt: spec.sizes.roleTitlePt * spec.lineHeights.heading,
            spaceBeforePt:
              expIdx > 0 && wIdx === 0
                ? scaleSpace(spec.sectionSpacingPt.betweenRoles)
                : 0,
            spaceAfterPt:
              wIdx === wrappedLeft.length - 1
                ? scaleSpace(spec.sectionSpacingPt.afterRoleHeader)
                : 0,
            keepWithNext: true,
          });
        });
      }

      const bulletTextX = leftX + spec.bullet.hangingIndentPt;
      const bulletMaxWidth = contentWidthPt - spec.bullet.hangingIndentPt;
      const glyphX = leftX + spec.bullet.bulletOffsetPt;
      const glyphStr = `${spec.bullet.glyph} `;
      const glyphW = measureTextWidthPt(
        glyphStr,
        boldFontKey,
        spec.sizes.bodyPt,
      );

      exp.bullets.forEach((bullet, bIdx) => {
        const cleanBullet = bullet.text.trim();
        if (!cleanBullet) return;
        const wrappedBullet = wrapTextByPoints(
          cleanBullet,
          bodyFontKey,
          spec.sizes.bodyPt,
          bulletMaxWidth,
        );
        wrappedBullet.forEach((bLine, lineIdx) => {
          const isLastLine = lineIdx === wrappedBullet.length - 1;
          const bLineW = measureTextWidthPt(
            bLine,
            bodyFontKey,
            spec.sizes.bodyPt,
          );
          const aligned = computeAlignedRunMetrics({
            text: bLine,
            baseLeftX: bulletTextX,
            maxWidthPt: bulletMaxWidth,
            rawWidthPt: bLineW,
            align: textAlign,
            isLastLine,
          });
          const runs: TextRun[] = [];
          if (lineIdx === 0) {
            const dotX = glyphX;
            runs.push({
              text: glyphStr,
              xPt: dotX,
              widthPt: glyphW,
              fontKey: boldFontKey,
              fontSizePt: spec.sizes.bodyPt,
              bold: true,
              colorRgb: INK_SECONDARY,
            });
          }
          runs.push({
            text: bLine,
            xPt: aligned.xPt,
            widthPt: aligned.widthPt,
            wordSpacingPt: aligned.wordSpacingPt,
            fontKey: bodyFontKey,
            fontSizePt: spec.sizes.bodyPt,
            bold: false,
            colorRgb: INK_PRIMARY,
          });
          lines.push({
            runs,
            heightPt: bulletLineHeight,
            spaceBeforePt: 0,
            spaceAfterPt:
              isLastLine && bIdx < exp.bullets.length - 1
                ? scaleSpace(spec.sectionSpacingPt.betweenBullets)
                : 0,
            keepWithNext: lineIdx < wrappedBullet.length - 1,
            groupId: bullet.id,
          });
        });
      });
    });
  }

  // PROJECTS
  if (doc.projects.length > 0) {
    addSectionHeading('PROJECTS');
    doc.projects.forEach((proj, pIdx) => {
      const headerParts = [proj.name];
      if (proj.role.trim()) headerParts.push(`— ${proj.role.trim()}`);
      if (proj.link?.trim()) headerParts.push(`· ${proj.link.trim()}`);
      const projHeader = headerParts.join(' ');
      const projHeaderW = measureTextWidthPt(
        projHeader,
        boldFontKey,
        spec.sizes.roleTitlePt,
      );
      const linkUri =
        proj.link?.trim() && !/^https?:\/\//i.test(proj.link.trim())
          ? `https://${proj.link.trim()}`
          : proj.link?.trim();

      lines.push({
        runs: [
          {
            text: projHeader,
            xPt: leftX,
            widthPt: projHeaderW,
            fontKey: boldFontKey,
            fontSizePt: spec.sizes.roleTitlePt,
            bold: true,
            colorRgb: INK_PRIMARY,
            linkUri: linkUri || undefined,
          },
        ],
        heightPt: spec.sizes.roleTitlePt * spec.lineHeights.heading,
        spaceBeforePt:
          pIdx > 0 ? scaleSpace(spec.sectionSpacingPt.betweenRoles * 0.75) : 0,
        spaceAfterPt: 2,
        keepWithNext: true,
      });

      if (proj.description.trim()) {
        const descLines = wrapTextByPoints(
          proj.description.trim(),
          bodyFontKey,
          spec.sizes.bodyPt,
          contentWidthPt,
        );
        descLines.forEach((dLine, dIdx) => {
          const isLastDesc = dIdx === descLines.length - 1;
          const rawW = measureTextWidthPt(
            dLine,
            bodyFontKey,
            spec.sizes.bodyPt,
          );
          const aligned = computeAlignedRunMetrics({
            text: dLine,
            baseLeftX: leftX,
            maxWidthPt: contentWidthPt,
            rawWidthPt: rawW,
            align: textAlign,
            isLastLine: isLastDesc,
          });
          lines.push({
            runs: [
              {
                text: dLine,
                xPt: aligned.xPt,
                widthPt: aligned.widthPt,
                wordSpacingPt: aligned.wordSpacingPt,
                fontKey: bodyFontKey,
                fontSizePt: spec.sizes.bodyPt,
                bold: false,
                colorRgb: INK_PRIMARY,
              },
            ],
            heightPt: bodyLineHeight,
            spaceBeforePt: 0,
            spaceAfterPt: 1,
          });
        });
      }

      const bulletTextX = leftX + spec.bullet.hangingIndentPt;
      const bulletMaxWidth = contentWidthPt - spec.bullet.hangingIndentPt;
      const glyphX = leftX + spec.bullet.bulletOffsetPt;
      const glyphStr = `${spec.bullet.glyph} `;
      const glyphW = measureTextWidthPt(
        glyphStr,
        boldFontKey,
        spec.sizes.bodyPt,
      );

      proj.highlights.forEach((h) => {
        const cleanH = h.trim();
        if (!cleanH) return;
        const wrappedH = wrapTextByPoints(
          cleanH,
          bodyFontKey,
          spec.sizes.bodyPt,
          bulletMaxWidth,
        );
        wrappedH.forEach((hLine, lIdx) => {
          const isLastH = lIdx === wrappedH.length - 1;
          const rawHW = measureTextWidthPt(
            hLine,
            bodyFontKey,
            spec.sizes.bodyPt,
          );
          const aligned = computeAlignedRunMetrics({
            text: hLine,
            baseLeftX: bulletTextX,
            maxWidthPt: bulletMaxWidth,
            rawWidthPt: rawHW,
            align: textAlign,
            isLastLine: isLastH,
          });
          const runs: TextRun[] = [];
          if (lIdx === 0) {
            const dotX = glyphX;
            runs.push({
              text: glyphStr,
              xPt: dotX,
              widthPt: glyphW,
              fontKey: boldFontKey,
              fontSizePt: spec.sizes.bodyPt,
              bold: true,
              colorRgb: INK_SECONDARY,
            });
          }
          runs.push({
            text: hLine,
            xPt: aligned.xPt,
            widthPt: aligned.widthPt,
            wordSpacingPt: aligned.wordSpacingPt,
            fontKey: bodyFontKey,
            fontSizePt: spec.sizes.bodyPt,
            bold: false,
            colorRgb: INK_PRIMARY,
          });
          lines.push({
            runs,
            heightPt: bulletLineHeight,
            spaceBeforePt: 0,
            spaceAfterPt: isLastH
              ? scaleSpace(spec.sectionSpacingPt.betweenBullets * 0.8)
              : 0,
          });
        });
      });
    });
  }

  // SKILLS
  if (doc.skillsByCategory.length > 0) {
    addSectionHeading('SKILLS');
    doc.skillsByCategory.forEach((group, gIdx) => {
      const catLabel = `${group.category}: `;
      const catW = measureTextWidthPt(catLabel, boldFontKey, spec.sizes.bodyPt);
      const skillsText = group.skills.join(', ');
      const fullLine = `${catLabel}${skillsText}`;
      const wrapped = wrapTextByPoints(
        fullLine,
        bodyFontKey,
        spec.sizes.bodyPt,
        contentWidthPt,
      );
      wrapped.forEach((wLine, wIdx) => {
        const isLastSkillLine = wIdx === wrapped.length - 1;
        if (wIdx === 0 && wLine.startsWith(catLabel.trim())) {
          const remainder = wLine.slice(catLabel.length);
          const remW = measureTextWidthPt(
            remainder,
            bodyFontKey,
            spec.sizes.bodyPt,
          );
          const remAligned = computeAlignedRunMetrics({
            text: remainder,
            baseLeftX: leftX + catW,
            maxWidthPt: Math.max(10, contentWidthPt - catW),
            rawWidthPt: remW,
            align: textAlign,
            isLastLine: isLastSkillLine,
          });
          lines.push({
            runs: [
              {
                text: catLabel,
                xPt: Number(leftX.toFixed(2)),
                widthPt: catW,
                fontKey: boldFontKey,
                fontSizePt: spec.sizes.bodyPt,
                bold: true,
                colorRgb: INK_PRIMARY,
              },
              {
                text: remainder,
                xPt: remAligned.xPt,
                widthPt: remAligned.widthPt,
                wordSpacingPt: remAligned.wordSpacingPt,
                fontKey: bodyFontKey,
                fontSizePt: spec.sizes.bodyPt,
                bold: false,
                colorRgb: INK_PRIMARY,
              },
            ],
            heightPt: bodyLineHeight,
            spaceBeforePt: 0,
            spaceAfterPt:
              isLastSkillLine && gIdx < doc.skillsByCategory.length - 1
                ? scaleSpace(2)
                : 0,
          });
        } else {
          const rawW = measureTextWidthPt(
            wLine,
            bodyFontKey,
            spec.sizes.bodyPt,
          );
          const aligned = computeAlignedRunMetrics({
            text: wLine,
            baseLeftX: leftX,
            maxWidthPt: contentWidthPt,
            rawWidthPt: rawW,
            align: textAlign,
            isLastLine: isLastSkillLine,
          });
          lines.push({
            runs: [
              {
                text: wLine,
                xPt: aligned.xPt,
                widthPt: aligned.widthPt,
                wordSpacingPt: aligned.wordSpacingPt,
                fontKey: bodyFontKey,
                fontSizePt: spec.sizes.bodyPt,
                bold: false,
                colorRgb: INK_PRIMARY,
              },
            ],
            heightPt: bodyLineHeight,
            spaceBeforePt: 0,
            spaceAfterPt:
              isLastSkillLine && gIdx < doc.skillsByCategory.length - 1
                ? scaleSpace(2)
                : 0,
          });
        }
      });
    });
  }

  // EDUCATION
  if (doc.educations.length > 0) {
    addSectionHeading('EDUCATION');
    doc.educations.forEach((edu, eIdx) => {
      const eduLeft = `${edu.institution} — ${edu.degreeLine}${edu.location ? ` · ${edu.location}` : ''}`;
      const dateStr = edu.dateRange.trim();
      const leftW = measureTextWidthPt(eduLeft, boldFontKey, spec.sizes.bodyPt);
      const dateW = measureTextWidthPt(dateStr, bodyFontKey, spec.sizes.metaPt);

      if (leftW + 12 + dateW <= contentWidthPt) {
        lines.push({
          runs: [
            {
              text: eduLeft,
              xPt: leftX,
              widthPt: leftW,
              fontKey: boldFontKey,
              fontSizePt: spec.sizes.bodyPt,
              bold: true,
              colorRgb: INK_PRIMARY,
            },
            {
              text: dateStr,
              xPt: Math.max(leftX + leftW + 12, rightX - dateW),
              widthPt: dateW,
              fontKey: bodyFontKey,
              fontSizePt: spec.sizes.metaPt,
              bold: false,
              colorRgb: INK_MUTED,
            },
          ],
          heightPt: bodyLineHeight,
          spaceBeforePt: eIdx > 0 ? scaleSpace(4) : 0,
          spaceAfterPt: edu.highlights?.trim() ? 1 : scaleSpace(2),
          keepWithNext: Boolean(edu.highlights?.trim()),
        });
      } else {
        const combined = `${eduLeft} ${dateStr}`;
        const wrappedEdu = wrapTextByPoints(
          combined,
          bodyFontKey,
          spec.sizes.bodyPt,
          contentWidthPt,
        );
        wrappedEdu.forEach((eLine, lIdx) => {
          lines.push({
            runs: [
              {
                text: eLine,
                xPt: leftX,
                widthPt: measureTextWidthPt(
                  eLine,
                  boldFontKey,
                  spec.sizes.bodyPt,
                ),
                fontKey: lIdx === 0 ? boldFontKey : bodyFontKey,
                fontSizePt: spec.sizes.bodyPt,
                bold: lIdx === 0,
                colorRgb: INK_PRIMARY,
              },
            ],
            heightPt: bodyLineHeight,
            spaceBeforePt: eIdx > 0 && lIdx === 0 ? scaleSpace(4) : 0,
            spaceAfterPt: 1,
          });
        });
      }

      if (edu.highlights?.trim()) {
        const hLines = wrapTextByPoints(
          edu.highlights.trim(),
          bodyFontKey,
          spec.sizes.metaPt,
          contentWidthPt,
        );
        hLines.forEach((hl) => {
          lines.push({
            runs: [
              {
                text: hl,
                xPt: leftX,
                widthPt: measureTextWidthPt(hl, bodyFontKey, spec.sizes.metaPt),
                fontKey: bodyFontKey,
                fontSizePt: spec.sizes.metaPt,
                bold: false,
                colorRgb: INK_SECONDARY,
              },
            ],
            heightPt: spec.sizes.metaPt * 1.3,
            spaceBeforePt: 0,
            spaceAfterPt: scaleSpace(2),
          });
        });
      }
    });
  }

  // CERTIFICATIONS
  if (doc.certifications.length > 0) {
    addSectionHeading('CERTIFICATIONS');
    doc.certifications.forEach((cert, cIdx) => {
      const certLeft = `${cert.name} — ${cert.issuer}`;
      const dateStr = cert.date.trim();
      const leftW = measureTextWidthPt(
        certLeft,
        boldFontKey,
        spec.sizes.bodyPt,
      );
      const dateW = measureTextWidthPt(dateStr, bodyFontKey, spec.sizes.metaPt);
      if (leftW + 12 + dateW <= contentWidthPt) {
        lines.push({
          runs: [
            {
              text: certLeft,
              xPt: leftX,
              widthPt: leftW,
              fontKey: boldFontKey,
              fontSizePt: spec.sizes.bodyPt,
              bold: true,
              colorRgb: INK_PRIMARY,
            },
            {
              text: dateStr,
              xPt: Math.max(leftX + leftW + 12, rightX - dateW),
              widthPt: dateW,
              fontKey: bodyFontKey,
              fontSizePt: spec.sizes.metaPt,
              bold: false,
              colorRgb: INK_MUTED,
            },
          ],
          heightPt: bodyLineHeight,
          spaceBeforePt: cIdx > 0 ? scaleSpace(2) : 0,
          spaceAfterPt: scaleSpace(2),
        });
      } else {
        const full = `${certLeft} ${dateStr}`;
        lines.push({
          runs: [
            {
              text: full,
              xPt: leftX,
              widthPt: measureTextWidthPt(full, bodyFontKey, spec.sizes.bodyPt),
              fontKey: bodyFontKey,
              fontSizePt: spec.sizes.bodyPt,
              bold: false,
              colorRgb: INK_PRIMARY,
            },
          ],
          heightPt: bodyLineHeight,
          spaceBeforePt: cIdx > 0 ? scaleSpace(2) : 0,
          spaceAfterPt: scaleSpace(2),
        });
      }
    });
  }

  return lines;
}

function measureTotalHeightPt(lines: LayoutLine[]): number {
  let total = 0;
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (i > 0) total += l.spaceBeforePt;
    total += l.heightPt + l.spaceAfterPt;
  }
  return total;
}

function paginateLayoutLines(
  lines: LayoutLine[],
  spec: TemplateSpec,
): { placed: PlacedLine[]; pageCount: number } {
  const pageHeight = spec.pageDimensions.heightPt;
  const topMargin = spec.margins.topPt;
  const bottomLimitY = spec.margins.bottomPt;

  const placed: PlacedLine[] = [];
  let page = 1;
  let cursorY = pageHeight - topMargin;

  let i = 0;
  while (i < lines.length) {
    let groupEnd = i;
    while (groupEnd < lines.length - 1 && lines[groupEnd].keepWithNext) {
      groupEnd++;
    }

    let groupHeight = 0;
    for (let k = i; k <= groupEnd; k++) {
      const spaceBefore =
        k === i && cursorY === pageHeight - topMargin
          ? 0
          : lines[k].spaceBeforePt;
      groupHeight += spaceBefore + lines[k].heightPt + lines[k].spaceAfterPt;
    }

    if (
      cursorY - groupHeight < bottomLimitY &&
      cursorY < pageHeight - topMargin
    ) {
      page += 1;
      cursorY = pageHeight - topMargin;
    }

    for (let k = i; k <= groupEnd; k++) {
      const line = lines[k];
      const spaceBefore =
        cursorY === pageHeight - topMargin ? 0 : line.spaceBeforePt;
      cursorY -= spaceBefore;

      if (
        cursorY - line.heightPt < bottomLimitY &&
        cursorY < pageHeight - topMargin
      ) {
        page += 1;
        cursorY = pageHeight - topMargin;
      }

      const baselineYPt = Number((cursorY - line.heightPt * 0.78).toFixed(2));
      const topYPt = Number((pageHeight - baselineYPt).toFixed(2));
      placed.push({
        page,
        baselineYPt,
        topYPt,
        line,
      });
      cursorY -= line.heightPt + line.spaceAfterPt;
    }

    i = groupEnd + 1;
  }

  return {
    placed,
    pageCount: Math.max(1, page),
  };
}

function base64ToUint8(b64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(b64, 'base64'));
  }
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) {
    out[i] = bin.charCodeAt(i);
  }
  return out;
}

const TO_UNICODE_CMAP_STREAM = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /CevinUTF16 def
/CMapType 2 def
1 begincodespacerange
<00> <FF>
endcodespacerange
8 beginbfchar
<80> <2022>
<81> <2013>
<82> <2014>
<83> <2192>
<84> <2019>
<85> <2018>
<86> <201C>
<87> <201D>
endbfchar
2 beginbfrange
<20> <7E> <0020>
<A0> <FF> <00A0>
endbfrange
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;

/**
 * Pure deterministic PDF 1.4 renderer driven by `TemplateSpec` and subsetted TrueType fonts.
 */
export function renderDocumentToPdfArtifact(
  doc: ExportableDocument,
  options: PdfRenderOptions = {},
): RenderedPdfArtifact {
  const templateId: TemplateId =
    options?.templateId || doc.meta.templateId || 'classic';
  const pageSize: PageSize = options?.pageSize || doc.meta.pageSize || 'letter';
  const spec = getTemplateSpec(templateId, pageSize);

  const usableHeight =
    spec.pageDimensions.heightPt - spec.margins.topPt - spec.margins.bottomPt;

  let lines = buildLayoutLines(doc, spec, 1.0);
  const baseTotalHeight = measureTotalHeightPt(lines);

  let chosenScale = 1.0;
  if (baseTotalHeight < usableHeight * spec.rhythmScaling.sparseThresholdRatio) {
    const targetFill = usableHeight * 0.82;
    const rawRatio = targetFill / Math.max(100, baseTotalHeight);
    chosenScale = Math.min(
      spec.rhythmScaling.maxExpandFactor,
      Math.max(1.0, 1 + (rawRatio - 1) * 0.55),
    );
  } else if (
    baseTotalHeight > usableHeight &&
    baseTotalHeight <=
      usableHeight * (1 + spec.rhythmScaling.overflowTightenThresholdRatio)
  ) {
    chosenScale = spec.rhythmScaling.minTightenFactor;
  }

  if (chosenScale !== 1.0) {
    lines = buildLayoutLines(doc, spec, chosenScale);
  }

  const { placed, pageCount } = paginateLayoutLines(lines, spec);

  const positionedText: PositionedText[] = [];
  const usedFonts = new Set<InternalFontKey>();
  const annotationsByPage = new Map<number, LinkAnnotationSpec[]>();
  const streamsByPage = new Map<number, string[]>();

  for (let p = 1; p <= pageCount; p++) {
    streamsByPage.set(p, []);
    annotationsByPage.set(p, []);
  }

  const contentLeftX = spec.margins.leftPt;
  const contentRightX = spec.pageDimensions.widthPt - spec.margins.rightPt;

  for (const item of placed) {
    const pageCommands = streamsByPage.get(item.page)!;
    const pageAnnots = annotationsByPage.get(item.page)!;

    for (const run of item.line.runs) {
      usedFonts.add(run.fontKey);
      const alias = FONT_PDF_ALIAS[run.fontKey];
      const [r, g, b] = run.colorRgb;
      const escaped = encodePdfLiteral(run.text);
      const twOp =
        run.wordSpacingPt && run.wordSpacingPt > 0
          ? ` ${run.wordSpacingPt.toFixed(3)} Tw`
          : '';
      const twReset =
        run.wordSpacingPt && run.wordSpacingPt > 0 ? ' 0 Tw' : '';
      pageCommands.push(
        `BT /${alias} ${run.fontSizePt.toFixed(2)} Tf${twOp} ${r.toFixed(3)} ${g.toFixed(3)} ${b.toFixed(3)} rg 1 0 0 1 ${run.xPt.toFixed(2)} ${item.baselineYPt.toFixed(2)} Tm (${escaped}) Tj${twReset} ET`,
      );

      positionedText.push({
        text: run.text.trim(),
        page: item.page,
        x: Number(run.xPt.toFixed(2)),
        y: Number(item.topYPt.toFixed(2)),
        width: Number(run.widthPt.toFixed(2)),
        height: Number(run.fontSizePt.toFixed(2)),
        fontSize: run.fontSizePt,
        bold: run.bold,
      });

      if (run.linkUri) {
        pageAnnots.push({
          page: item.page,
          rect: [
            Number(run.xPt.toFixed(2)),
            Number((item.baselineYPt - 2).toFixed(2)),
            Number((run.xPt + run.widthPt).toFixed(2)),
            Number((item.baselineYPt + run.fontSizePt).toFixed(2)),
          ],
          uri: run.linkUri,
        });
      }
    }

    if (item.line.ruleBelow) {
      const rule = item.line.ruleBelow;
      const ruleY = item.baselineYPt - rule.gapBelowTextPt;
      const [rr, rg, rb] = rule.colorRgb;
      pageCommands.push(
        `q ${rule.thicknessPt.toFixed(2)} w ${rr.toFixed(3)} ${rg.toFixed(3)} ${rb.toFixed(3)} RG ${contentLeftX.toFixed(2)} ${ruleY.toFixed(2)} m ${contentRightX.toFixed(2)} ${ruleY.toFixed(2)} l S Q`,
      );
    }
  }

  if (usedFonts.size === 0) {
    usedFonts.add('plus-jakarta-regular');
  }

  const chunks: Uint8Array[] = [];
  const offsets: number[] = [0];
  let bytePos = 0;

  const pushAscii = (str: string) => {
    const arr = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      arr[i] = str.charCodeAt(i) & 0xff;
    }
    chunks.push(arr);
    bytePos += arr.length;
  };

  const pushBytes = (arr: Uint8Array) => {
    chunks.push(arr);
    bytePos += arr.length;
  };

  let nextObjId = 1;
  const allocObjId = () => nextObjId++;

  const catalogObjId = allocObjId();
  const pagesObjId = allocObjId();
  const infoObjId = allocObjId();
  const encodingObjId = allocObjId();
  const toUnicodeObjId = allocObjId();

  const fontObjIds = new Map<
    InternalFontKey,
    { fontId: number; descId: number; fileId: number }
  >();
  for (const fk of usedFonts) {
    fontObjIds.set(fk, {
      fontId: allocObjId(),
      descId: allocObjId(),
      fileId: allocObjId(),
    });
  }

  const pageEntries: Array<{
    pageNum: number;
    pageId: number;
    contentId: number;
    annotIds: Array<{ id: number; spec: LinkAnnotationSpec }>;
  }> = [];

  for (let p = 1; p <= pageCount; p++) {
    const pageId = allocObjId();
    const contentId = allocObjId();
    const annots = (annotationsByPage.get(p) ?? []).map((a) => ({
      id: allocObjId(),
      spec: a,
    }));
    pageEntries.push({ pageNum: p, pageId, contentId, annotIds: annots });
  }

  pushAscii('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');

  offsets[catalogObjId] = bytePos;
  pushAscii(
    `${catalogObjId} 0 obj\n<< /Type /Catalog /Pages ${pagesObjId} 0 R /Lang (en-US) >>\nendobj\n`,
  );

  offsets[pagesObjId] = bytePos;
  const kidsRef = pageEntries.map((pe) => `${pe.pageId} 0 R`).join(' ');
  pushAscii(
    `${pagesObjId} 0 obj\n<< /Type /Pages /Kids [${kidsRef}] /Count ${pageCount} >>\nendobj\n`,
  );

  const docLabel = doc.kind === 'coverLetter' ? 'Cover Letter' : 'Resume';
  const companyLabel = doc.meta.targetCompany?.trim() || 'Application';
  const pdfTitle = `${doc.header.name.trim()} – ${docLabel} – ${companyLabel}`;
  const pdfAuthor = doc.header.name.trim();
  offsets[infoObjId] = bytePos;
  pushAscii(
    `${infoObjId} 0 obj\n<< /Title ${encodePdfUtf16Hex(pdfTitle)} /Author ${encodePdfUtf16Hex(pdfAuthor)} /Subject ${encodePdfUtf16Hex(`${docLabel} for ${companyLabel}`)} /Creator (Cevin Local Studio) /Producer (Cevin PDF Engine ${spec.version}) >>\nendobj\n`,
  );

  offsets[encodingObjId] = bytePos;
  pushAscii(
    `${encodingObjId} 0 obj\n<< /Type /Encoding /BaseEncoding /WinAnsiEncoding /Differences [ 128 /bullet /endash /emdash /arrowright /quoteright /quoteleft /quotedblleft /quotedblright ] >>\nendobj\n`,
  );

  offsets[toUnicodeObjId] = bytePos;
  pushAscii(
    `${toUnicodeObjId} 0 obj\n<< /Length ${TO_UNICODE_CMAP_STREAM.length} >>\nstream\n${TO_UNICODE_CMAP_STREAM}\nendstream\nendobj\n`,
  );

  for (const [fk, ids] of fontObjIds.entries()) {
    const asset: EmbeddedFontAsset = EMBEDDED_FONTS[fk];
    const widthsStr = asset.widths.join(' ');
    offsets[ids.fontId] = bytePos;
    pushAscii(
      `${ids.fontId} 0 obj\n<< /Type /Font /Subtype /TrueType /BaseFont /${asset.postScriptName} /FirstChar 32 /LastChar 255 /Widths [${widthsStr}] /Encoding ${encodingObjId} 0 R /ToUnicode ${toUnicodeObjId} 0 R /FontDescriptor ${ids.descId} 0 R >>\nendobj\n`,
    );

    offsets[ids.descId] = bytePos;
    const [bx0, by0, bx1, by1] = asset.bbox;
    pushAscii(
      `${ids.descId} 0 obj\n<< /Type /FontDescriptor /FontName /${asset.postScriptName} /Flags 32 /FontBBox [${bx0} ${by0} ${bx1} ${by1}] /ItalicAngle 0 /Ascent ${asset.ascent} /Descent ${asset.descent} /CapHeight 700 /StemV ${asset.stemV} /FontFile2 ${ids.fileId} 0 R >>\nendobj\n`,
    );

    const compressedFontBytes = base64ToUint8(asset.deflatedBase64);
    offsets[ids.fileId] = bytePos;
    pushAscii(
      `${ids.fileId} 0 obj\n<< /Filter /FlateDecode /Length ${compressedFontBytes.length} /Length1 ${asset.length1} >>\nstream\n`,
    );
    pushBytes(compressedFontBytes);
    pushAscii('\nendstream\nendobj\n');
  }

  const fontResEntries = Array.from(fontObjIds.entries())
    .map(([fk, ids]) => `/${FONT_PDF_ALIAS[fk]} ${ids.fontId} 0 R`)
    .join(' ');

  const mediaBox = `[0 0 ${spec.pageDimensions.widthPt.toFixed(2)} ${spec.pageDimensions.heightPt.toFixed(2)}]`;

  for (const pe of pageEntries) {
    const annotsClause =
      pe.annotIds.length > 0
        ? ` /Annots [${pe.annotIds.map((a) => `${a.id} 0 R`).join(' ')}]`
        : '';
    offsets[pe.pageId] = bytePos;
    pushAscii(
      `${pe.pageId} 0 obj\n<< /Type /Page /Parent ${pagesObjId} 0 R /MediaBox ${mediaBox} /Resources << /Font << ${fontResEntries} >> >> /Contents ${pe.contentId} 0 R${annotsClause} >>\nendobj\n`,
    );

    const streamStr = (streamsByPage.get(pe.pageNum) ?? []).join('\n');
    offsets[pe.contentId] = bytePos;
    pushAscii(
      `${pe.contentId} 0 obj\n<< /Length ${streamStr.length} >>\nstream\n${streamStr}\nendstream\nendobj\n`,
    );

    for (const annot of pe.annotIds) {
      const [rx1, ry1, rx2, ry2] = annot.spec.rect;
      const safeUri = encodePdfLiteral(annot.spec.uri);
      offsets[annot.id] = bytePos;
      pushAscii(
        `${annot.id} 0 obj\n<< /Type /Annot /Subtype /Link /Rect [${rx1} ${ry1} ${rx2} ${ry2}] /Border [0 0 0] /A << /Type /Action /S /URI /URI (${safeUri}) >> >>\nendobj\n`,
      );
    }
  }

  const totalObjCount = nextObjId;
  const xrefPos = bytePos;
  pushAscii(`xref\n0 ${totalObjCount}\n0000000000 65535 f \n`);
  for (let id = 1; id < totalObjCount; id++) {
    const offStr = String(offsets[id] ?? 0).padStart(10, '0');
    pushAscii(`${offStr} 00000 n \n`);
  }
  pushAscii(
    `trailer\n<< /Size ${totalObjCount} /Root ${catalogObjId} 0 R /Info ${infoObjId} 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`,
  );

  const out = new Uint8Array(bytePos);
  let cursor = 0;
  for (const c of chunks) {
    out.set(c, cursor);
    cursor += c.length;
  }

  const contentHash = doc.contentHash || computeDocumentContentHash(doc);

  return {
    bytes: out,
    pageCount,
    positionedText,
    contentHash,
  };
}

export function renderDocumentToPdfBytes(
  doc: ExportableDocument,
  templateId: TemplateId,
  pageSize: PageSize = 'letter',
): Uint8Array {
  return renderDocumentToPdfArtifact(doc, { templateId, pageSize }).bytes;
}

export function renderResumeToPdfBytes(
  doc: ResumeDocument,
  templateId: TemplateId,
  pageSize: PageSize = 'letter',
): Uint8Array {
  return renderDocumentToPdfArtifact(doc, { templateId, pageSize }).bytes;
}

export function renderCoverLetterToPdfBytes(
  doc: CoverLetterDocument,
  templateId: TemplateId,
  pageSize: PageSize = 'letter',
): Uint8Array {
  return renderDocumentToPdfArtifact(doc, { templateId, pageSize }).bytes;
}

export function generatePdfArtifact(
  doc: ExportableDocument,
  optionsOrTemplateId: PdfRenderOptions | TemplateId = 'classic',
  pageSize: PageSize = 'letter',
): RenderedPdfArtifact {
  const opts: PdfRenderOptions =
    typeof optionsOrTemplateId === 'string'
      ? { templateId: optionsOrTemplateId, pageSize }
      : optionsOrTemplateId;
  return renderDocumentToPdfArtifact(doc, opts);
}

