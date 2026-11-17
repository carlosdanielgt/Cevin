import { DocumentExporter, ExportOptions } from '../../../core/application';
import {
  ExportableDocument,
  extractTextFromDocxBlob,
  renderDocumentToDocxBytes,
} from '../../../core/domain';

export const docxDocumentExporter: DocumentExporter = {
  id: 'docx',
  label: 'Word document (.docx)',
  fileExtension: 'docx',
  mimeType:
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  supports: ['resume', 'coverLetter'],
  capabilities: {
    templates: true,
    atsRoundTrip: true,
  },
  async export(doc: ExportableDocument, options: ExportOptions): Promise<Blob> {
    const bytes = renderDocumentToDocxBytes(doc, {
      templateId: options.templateId,
      pageSize: options.pageSize,
    });
    return new Blob([new Uint8Array(bytes)], {
      type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    });
  },
  async extractTextFromBlob(blob: Blob): Promise<string> {
    return extractTextFromDocxBlob(blob);
  },
};
