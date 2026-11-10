import { DocumentExporter, ExportOptions } from '../../../core/application';
import {
  ExportableDocument,
  readStoredZipEntryText,
  renderDocumentToDocxBytes,
  renderDocumentToGoogleDocsHtml,
} from '../../../core/domain';

export { renderDocumentToDocxBytes, renderDocumentToGoogleDocsHtml };

export async function extractTextFromDocxBlob(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const xml = readStoredZipEntryText(bytes, 'word/document.xml') ?? '';
  if (!xml) return '';
  return xml
    .replace(/<w:tab\/>/g, ' — ')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

export const docxDocumentExporter: DocumentExporter = {
  id: 'docx',
  label: 'Google Docs / Word (.docx)',
  fileExtension: 'docx',
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  supports: ['resume', 'coverLetter'],
  capabilities: {
    templates: true,
    atsRoundTrip: true,
    previewable: false,
  },
  async export(
    doc: ExportableDocument,
    options: ExportOptions,
  ): Promise<Blob> {
    const bytes = renderDocumentToDocxBytes(doc, options);
    return new Blob([new Uint8Array(bytes)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  },
  async extractTextFromBlob(blob: Blob): Promise<string> {
    return extractTextFromDocxBlob(blob);
  },
};
