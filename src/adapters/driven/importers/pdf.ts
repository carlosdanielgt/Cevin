import { ResumeImporter } from '../../../core/application';
import { RawDocument } from '../../../core/domain';

/**
 * Extracts text from a PDF buffer using either pdfjs-dist or a deterministic
 * PDF content-stream parser fallback (for hermetic or worker-less environments).
 */
export async function extractPdfTextFromBuffer(
  buffer: ArrayBuffer,
): Promise<{ text: string; pageCount: number }> {
  if (typeof window !== 'undefined') {
    try {
      const pdfjs = await import('pdfjs-dist');
      const loadingTask = pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      });
      const pdfDoc = await loadingTask.promise;
      const pages: string[] = [];

      for (let i = 1; i <= pdfDoc.numPages; i++) {
        const page = await pdfDoc.getPage(i);
        const content = await page.getTextContent();
        const strings = content.items.map((item) =>
          'str' in item ? item.str : '',
        );
        pages.push(strings.join(' '));
      }

      const joined = pages.join('\n\n').trim();
      if (joined.length > 0) {
        return { text: joined, pageCount: pdfDoc.numPages };
      }
    } catch {
      // Fall back to direct PDF text object stream extraction when worker is unavailable
    }
  }

  const rawLatin = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const literalStrings: string[] = [];

  // Extract parenthesized PDF text literals (...) inside BT ... ET blocks or Tj/TJ operators
  const tjMatches = rawLatin.matchAll(/\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g);
  for (const match of tjMatches) {
    const unescaped = match[1]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\\(/g, '(')
      .replace(/\\\)/g, ')')
      .replace(/\\\\/g, '\\');
    literalStrings.push(unescaped);
  }

  const joinedFallback = literalStrings.join('\n').trim();
  const pageMatches = rawLatin.match(/\/Type\s*\/Page\b/g);
  const pageCount = pageMatches ? pageMatches.length : 1;

  return {
    text: joinedFallback,
    pageCount: Math.max(1, pageCount),
  };
}

/**
 * PDF resume importer (.pdf).
 * Detects scanned PDFs with no selectable text layer and surfaces a clear error.
 */
export const pdfResumeImporter: ResumeImporter = {
  id: 'pdf',
  label: 'PDF Document',
  accepts: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
  },
  async parse(file: File): Promise<RawDocument> {
    const buffer = await file.arrayBuffer();
    const { text, pageCount } = await extractPdfTextFromBuffer(buffer);

    if (!text || text.trim().length < 20) {
      throw new Error(
        'SCANNED_PDF: No selectable text layer found in PDF. OCR is not supported.',
      );
    }

    return {
      fileName: file.name,
      formatId: 'pdf',
      text,
      pageCount,
    };
  },
};
