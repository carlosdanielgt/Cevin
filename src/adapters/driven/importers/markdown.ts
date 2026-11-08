import { remark } from 'remark';
import { ResumeImporter } from '../../../core/application';
import { RawDocument } from '../../../core/domain';

/**
 * Markdown (.md, .txt) resume importer using remark AST verification + clean text extraction.
 */
export const markdownResumeImporter: ResumeImporter = {
  id: 'markdown',
  label: 'Markdown / Plain Text',
  accepts: {
    extensions: ['.md', '.markdown', '.txt'],
    mimeTypes: ['text/markdown', 'text/plain'],
  },
  async parse(file: File): Promise<RawDocument> {
    const rawText = await file.text();
    const processor = remark();
    const tree = processor.parse(rawText);
    const cleaned = processor.stringify(tree).trim() || rawText.trim();

    return {
      fileName: file.name,
      formatId: 'markdown',
      text: cleaned,
      pageCount: Math.max(1, Math.ceil(cleaned.length / 2600)),
    };
  },
};
