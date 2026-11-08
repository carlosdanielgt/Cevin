import { DocumentExporter, ExportOptions } from '../../../core/application';
import {
  CoverLetterDocument,
  ExportableDocument,
  ResumeDocument,
  documentToPlainText,
} from '../../../core/domain';

export function renderCoverLetterToText(doc: CoverLetterDocument): string {
  return documentToPlainText(doc);
}

export function renderResumeToText(doc: ResumeDocument): string {
  return documentToPlainText(doc);
}

export function renderDocumentToText(doc: ExportableDocument): string {
  return documentToPlainText(doc);
}

/**
 * Plain-text (.txt) exporter built directly on `documentToPlainText(doc)`
 * so plain text, Markdown, and PDF extraction share a single canonical text stream.
 */
export const plainTextResumeExporter: DocumentExporter = {
  id: 'text',
  label: 'Plain Text (.txt)',
  fileExtension: 'txt',
  mimeType: 'text/plain;charset=utf-8',
  supports: ['resume', 'coverLetter'],
  capabilities: {
    templates: false,
    atsRoundTrip: false,
  },
  async export(
    doc: ExportableDocument,
    _options: ExportOptions,
  ): Promise<Blob> {
    const text = renderDocumentToText(doc);
    return new Blob([text], { type: 'text/plain;charset=utf-8' });
  },
};

export const plainTextDocumentExporter: DocumentExporter =
  plainTextResumeExporter;

