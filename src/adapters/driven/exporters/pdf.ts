import {
  DocumentExporter,
  ExportOptions,
  RenderedPreviewArtifact,
} from '../../../core/application';
import {
  CoverLetterDocument,
  ExportableDocument,
  InternalFontKey,
  PositionedText,
  ResumeDocument,
  measureTextWidthPt,
  renderCoverLetterToPdfBytes,
  renderDocumentToPdfArtifact,
  renderDocumentToPdfBytes,
  renderResumeToPdfBytes,
  wrapTextByPoints,
} from '../../../core/domain';

export {
  measureTextWidthPt,
  renderCoverLetterToPdfBytes,
  renderDocumentToPdfArtifact,
  renderDocumentToPdfBytes,
  renderResumeToPdfBytes,
  wrapTextByPoints,
};
export type { InternalFontKey };

async function getPdfJsModule() {
  return import('pdfjs-dist/legacy/build/pdf.mjs');
}

/**
 * Extracts text from a PDF Blob using `pdfjs-dist` to verify true ATS round-trip parseability
 * and parity with `documentToPlainText(doc)`.
 */
export async function extractTextFromPdfBlob(blob: Blob): Promise<string> {
  const arrayBuffer = await blob.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const pdfjs = await getPdfJsModule();
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const linesByY = new Map<number, Array<{ x: number; str: string }>>();

    for (const rawItem of content.items) {
      if (!('str' in rawItem) || !rawItem.str) continue;
      const tx = rawItem.transform as number[];
      const x = Number(tx[4] ?? 0);
      const yKey = Math.round(Number(tx[5] ?? 0) * 2) / 2;
      const list = linesByY.get(yKey) ?? [];
      list.push({ x, str: rawItem.str });
      linesByY.set(yKey, list);
    }

    const sortedY = Array.from(linesByY.keys()).sort((a, b) => b - a);
    const pageLines = sortedY.map((y) => {
      const row = (linesByY.get(y) ?? []).sort((a, b) => a.x - b.x);
      return row
        .map((r) => r.str.trim())
        .filter(Boolean)
        .join(' ');
    });
    pageTexts.push(pageLines.join('\n'));
  }

  return pageTexts.join('\n\n').trim();
}

/**
 * Extracts positioned text spans (`{ text, page, x, y, width, height, fontSize, bold }[]`)
 * from a PDF Blob via `pdfjs-dist`.
 */
export async function extractPositionedTextFromPdfBlob(
  blob: Blob,
): Promise<PositionedText[]> {
  const arrayBuffer = await blob.arrayBuffer();
  const data = new Uint8Array(arrayBuffer);
  const pdfjs = await getPdfJsModule();
  const loadingTask = pdfjs.getDocument({
    data,
    useSystemFonts: true,
    disableFontFace: true,
  });
  const pdf = await loadingTask.promise;
  const results: PositionedText[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const viewport = page.getViewport({ scale: 1 });
    const pageHeight = viewport.height || 792;
    const content = await page.getTextContent();

    for (const rawItem of content.items) {
      if (!('str' in rawItem) || !rawItem.str.trim()) continue;
      const tx = rawItem.transform as number[];
      const x = Number(tx[4] ?? 0);
      const pdfY = Number(tx[5] ?? 0);
      const fontSize = Math.abs(Number(tx[0] || tx[3] || 10));
      const topDownY = Math.max(0, pageHeight - pdfY);
      const fontName = String(rawItem.fontName || '');
      const bold =
        fontName.toLowerCase().includes('bold') ||
        fontName.includes('g_d0_f2') ||
        fontName.includes('g_d0_f3') ||
        fontName.includes('g_d0_f4') ||
        fontName.includes('g_d0_f5') ||
        fontSize >= 10.2;

      results.push({
        text: rawItem.str.trim(),
        page: p,
        x: Number(x.toFixed(2)),
        y: Number(topDownY.toFixed(2)),
        width: Number(
          (rawItem.width || rawItem.str.length * fontSize * 0.5).toFixed(2),
        ),
        height: Number((rawItem.height || fontSize).toFixed(2)),
        fontSize: Number(fontSize.toFixed(2)),
        bold,
      });
    }
  }

  return results;
}

export const pdfResumeExporter: DocumentExporter = {
  id: 'pdf',
  label: 'PDF Document (.pdf)',
  fileExtension: 'pdf',
  mimeType: 'application/pdf',
  supports: ['resume', 'coverLetter'],
  capabilities: {
    templates: true,
    atsRoundTrip: true,
    previewable: true,
  },
  async export(
    doc: ExportableDocument,
    options: ExportOptions,
  ): Promise<Blob> {
    const artifact = renderDocumentToPdfArtifact(doc, options);
    return new Blob([new Uint8Array(artifact.bytes)], {
      type: 'application/pdf',
    });
  },
  async renderPreview(
    doc: ExportableDocument,
    options: ExportOptions,
  ): Promise<RenderedPreviewArtifact> {
    return renderDocumentToPdfArtifact(doc, options);
  },
  async extractTextFromBlob(blob: Blob): Promise<string> {
    return extractTextFromPdfBlob(blob);
  },
  async extractPositionedTextFromBlob(blob: Blob): Promise<PositionedText[]> {
    return extractPositionedTextFromPdfBlob(blob);
  },
};
