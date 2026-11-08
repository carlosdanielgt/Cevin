import { DocumentExporter, ExporterCatalog } from '../../../core/application';
import { markdownResumeExporter } from './markdown';
import { pdfResumeExporter } from './pdf';
import { plainTextDocumentExporter } from './text';

/**
 * Registry of DocumentExporters.
 * Extension point: add a new exporter by creating its adapter and adding 1 line below.
 */
const REGISTERED_EXPORTERS: DocumentExporter[] = [
  pdfResumeExporter,
  markdownResumeExporter,
  plainTextDocumentExporter,
];

export function createExporterCatalog(): ExporterCatalog {
  return {
    list() {
      return [...REGISTERED_EXPORTERS];
    },
    getById(id: string) {
      return REGISTERED_EXPORTERS.find((e) => e.id === id);
    },
  };
}
