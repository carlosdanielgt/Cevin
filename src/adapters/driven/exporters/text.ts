import { ExportableDocument, documentToPlainText } from '../../../core/domain';

export function renderDocumentToText(doc: ExportableDocument): string {
  return documentToPlainText(doc);
}
