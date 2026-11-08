import { ImporterCatalog, ResumeImporter } from '../../../core/application';
import { markdownResumeImporter } from './markdown';
import { pdfResumeImporter } from './pdf';

/**
 * Registry of ResumeImporters.
 * Extension point: add a new importer by creating its adapter and adding 1 line below.
 */
const REGISTERED_IMPORTERS: ResumeImporter[] = [
  markdownResumeImporter,
  pdfResumeImporter,
];

export function createImporterCatalog(): ImporterCatalog {
  return {
    list() {
      return [...REGISTERED_IMPORTERS];
    },
    getById(id: string) {
      return REGISTERED_IMPORTERS.find((i) => i.id === id);
    },
    findByFile(fileName: string, mimeType: string) {
      const lowerName = fileName.toLowerCase();
      return REGISTERED_IMPORTERS.find(
        (imp) =>
          imp.accepts.extensions.some((ext) => lowerName.endsWith(ext)) ||
          (mimeType && imp.accepts.mimeTypes.includes(mimeType)),
      );
    },
  };
}
