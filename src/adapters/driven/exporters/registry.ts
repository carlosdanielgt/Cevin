import {
  DocumentExporter,
  ExportOptions,
  ExporterCatalog,
} from '../../../core/application';
import { ExportableDocument } from '../../../core/domain';
import { docxDocumentExporter } from './docx';
import { markdownResumeExporter } from './markdown';
import { pdfResumeExporter } from './pdf';
import { renderDocumentToText } from './text';

export const plainTextDocumentExporter: DocumentExporter = {
  id: 'text',
  label: 'Plain Text (.txt)',
  fileExtension: 'txt',
  mimeType: 'text/plain;charset=utf-8',
  supports: ['resume', 'coverLetter'],
  capabilities: {
    templates: false,
    atsRoundTrip: false,
  },
  async export(doc: ExportableDocument, _options: ExportOptions): Promise<Blob> {
    const text = renderDocumentToText(doc);
    return new Blob([text], { type: 'text/plain;charset=utf-8' });
  },
};

/**
 * Registry of DocumentExporters.
 * Extension point: add a new exporter by creating its adapter and adding 1 line below.
 */
const REGISTERED_EXPORTERS: DocumentExporter[] = [
  pdfResumeExporter,
  docxDocumentExporter,
  markdownResumeExporter,
  plainTextDocumentExporter,
];

export function createExporterCatalog(): ExporterCatalog {
  return {
    list(): DocumentExporter[] {
      return [...REGISTERED_EXPORTERS];
    },
    getById(id: string): DocumentExporter | undefined {
      return REGISTERED_EXPORTERS.find((e) => e.id === id);
    },
  };
}
