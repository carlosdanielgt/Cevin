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
      const pdfDoc = await pdfjs.getDocument({
        data: new Uint8Array(buffer),
        useSystemFonts: true,
      }).promise;
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
      // Fallback to deterministic literal stream scan below
    }
  }

  const rawLatin = new TextDecoder('latin1').decode(new Uint8Array(buffer));
  const literalStrings: string[] = [];
  const tjMatches = rawLatin.matchAll(
    /\(([^()\\]*(?:\\.[^()\\]*)*)\)\s*Tj/g,
  );
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
