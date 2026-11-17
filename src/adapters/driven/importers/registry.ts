import { ImporterCatalog, ResumeImporter } from '../../../core/application';
import { RawDocument } from '../../../core/domain';
import { markdownResumeImporter } from './markdown';
import { extractPdfTextFromBuffer } from './pdf';

export const pdfResumeImporter: ResumeImporter = {
  id: 'pdf',
  label: 'PDF Document',
  accepts: {
    extensions: ['.pdf'],
    mimeTypes: ['application/pdf'],
  },
  async parse(file: File): Promise<RawDocument> {
    const { text, pageCount } = await extractPdfTextFromBuffer(
      await file.arrayBuffer(),
    );
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
    list(): ResumeImporter[] {
      return [...REGISTERED_IMPORTERS];
    },
    getById(id: string): ResumeImporter | undefined {
      return REGISTERED_IMPORTERS.find((i) => i.id === id);
    },
    findByFile(fileName: string, mimeType: string): ResumeImporter | undefined {
      const lowerName = fileName.toLowerCase();
      return REGISTERED_IMPORTERS.find(
        (imp) =>
          imp.accepts.extensions.some((ext) => lowerName.endsWith(ext)) ||
          (mimeType && imp.accepts.mimeTypes.includes(mimeType)),
      );
    },
  };
}
