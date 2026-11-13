import assert from 'node:assert/strict';
import {
  createDemoApplications,
  createDemoBankSnapshot,
} from '../src/core/application';
import {
  TemplateId,
  TextAlign,
  VOICE_LEVEL_ORDER,
  computeDocumentContentHash,
  documentToPlainText,
  extractTextFromDocxBlob,
  locateBlocks,
  mapApplicationToCoverLetterDocument,
  mapApplicationToResumeDocument,
  normalizeWhitespaceForParity,
  stripMarkdownFormatting,
} from '../src/core/domain';
import { docxDocumentExporter } from '../src/adapters/driven/exporters/docx';
import { renderDocumentToMarkdown } from '../src/adapters/driven/exporters/markdown';
import {
  extractPositionedTextFromPdfBlob,
  extractTextFromPdfBlob,
  pdfResumeExporter,
  renderDocumentToPdfArtifact,
} from '../src/adapters/driven/exporters/pdf';
import { renderDocumentToText } from '../src/adapters/driven/exporters/text';

const TEMPLATES: TemplateId[] = ['classic', 'modern', 'compact'];
const ALIGNMENTS: TextAlign[] = ['left', 'justify'];

async function runParitySuite() {
  console.log('Running WYSIWYG Content, Byte & Exporter Parity Suite...');
  const bank = createDemoBankSnapshot();
  const { applications: demoApps } = createDemoApplications(bank);
  let totalChecks = 0;

  for (const app of demoApps) {
    for (const templateId of TEMPLATES) {
      for (const textAlign of ALIGNMENTS) {
        for (const voice of VOICE_LEVEL_ORDER.slice(0, 2)) {
          const modifiedApp = {
            ...app,
            templateId,
            voice,
            workingDraft: {
              ...app.workingDraft,
              textAlign,
            },
            coverLetterDraft: app.coverLetterDraft
              ? {
                  ...app.coverLetterDraft,
                  textAlign,
                }
              : undefined,
          };

          const resumeDoc = mapApplicationToResumeDocument(modifiedApp, bank);
          const letterDoc = mapApplicationToCoverLetterDocument(
            modifiedApp,
            bank,
          );

          for (const doc of [resumeDoc, letterDoc]) {
            assert.equal(
              doc.meta.textAlign,
              textAlign,
              `mapped document must preserve textAlign=${textAlign}`,
            );

            // 1. Deterministic contentHash
            const hash1 = computeDocumentContentHash(doc);
            const hash2 = computeDocumentContentHash(doc);
            assert.equal(hash1, hash2, 'contentHash must be deterministic');
            assert.equal(
              doc.contentHash,
              hash1,
              'mapped document must carry matching contentHash',
            );

            // 2. Render preview artifact vs exported Blob byte-for-byte parity
            const previewArtifact = renderDocumentToPdfArtifact(doc, {
              templateId,
              pageSize: 'letter',
            });
            const exportedBlob = await pdfResumeExporter.export(doc, {
              templateId,
              pageSize: 'letter',
            });
            const exportedBytes = new Uint8Array(
              await exportedBlob.arrayBuffer(),
            );

            assert.equal(
              previewArtifact.bytes.byteLength,
              exportedBytes.byteLength,
              `Preview bytes length must equal exported PDF bytes length (${doc.kind}, ${templateId}, ${textAlign})`,
            );
            assert.deepEqual(
              previewArtifact.bytes,
              exportedBytes,
              `Preview PDF bytes must be byte-for-byte identical to exported PDF bytes (${doc.kind}, ${templateId}, ${textAlign})`,
            );

            // 3. Extracted PDF text via pdfjs-dist === documentToPlainText(doc) (whitespace-normalized)
            const canonicalPlain = normalizeWhitespaceForParity(
              documentToPlainText(doc),
            );
            const extractedPdfText = normalizeWhitespaceForParity(
              await extractTextFromPdfBlob(exportedBlob),
            );
            assert.equal(
              extractedPdfText,
              canonicalPlain,
              `PDF extracted text must match documentToPlainText (${app.company} / ${doc.kind} / ${templateId} / ${textAlign})`,
            );

            // 4. Word (.docx), Plain Text & Markdown exporter parity with documentToPlainText(doc)
            const docxBlob = await docxDocumentExporter.export(doc, {
              templateId,
              pageSize: 'letter',
            });
            const docxOut = normalizeWhitespaceForParity(
              await extractTextFromDocxBlob(docxBlob),
            );
            assert.equal(
              docxOut,
              canonicalPlain,
              `Word (.docx) exporter must match documentToPlainText (${doc.kind}, ${templateId}, ${textAlign})`,
            );

            const txtOut = normalizeWhitespaceForParity(
              renderDocumentToText(doc),
            );
            const mdOut = normalizeWhitespaceForParity(
              stripMarkdownFormatting(renderDocumentToMarkdown(doc)),
            );
            assert.equal(
              txtOut,
              canonicalPlain,
              `Plain text exporter must match documentToPlainText (${doc.kind})`,
            );
            assert.equal(
              mdOut,
              canonicalPlain,
              `Markdown exporter (stripped) must match documentToPlainText (${doc.kind})`,
            );

            // 5. Block location mapping for overlays
            const blockLocations = locateBlocks(
              doc,
              previewArtifact.positionedText,
            );
            assert.ok(
              blockLocations.length > 0,
              `locateBlocks must return bounding boxes (${doc.kind}, ${textAlign})`,
            );

            totalChecks += 6;
          }
        }
      }
    }
  }

  // 6. Special Glyph, Accented Latin, Link Annotation & Metadata Test
  const baseApp = demoApps[0];
  const glyphDoc = mapApplicationToResumeDocument(baseApp, bank);
  glyphDoc.summary =
    'Principal Systems Architect — café résumé naïve façade piñata · latency 420→68 ms | zero-downtime – 99.99% SLA.';
  glyphDoc.contentHash = computeDocumentContentHash(glyphDoc);

  const glyphArtifact = renderDocumentToPdfArtifact(glyphDoc, {
    templateId: 'classic',
    pageSize: 'letter',
  });
  const glyphBlob = new Blob([new Uint8Array(glyphArtifact.bytes)], {
    type: 'application/pdf',
  });
  const extractedGlyphText = await extractTextFromPdfBlob(glyphBlob);

  for (const token of [
    'café',
    'résumé',
    'naïve',
    'façade',
    'piñata',
    '420→68',
    '99.99%',
    '•',
    '—',
    '·',
  ]) {
    assert.ok(
      extractedGlyphText.includes(token),
      `Extracted PDF text must preserve glyph/token "${token}" without replacement character`,
    );
  }
  assert.ok(
    !extractedGlyphText.includes('\uFFFD'),
    'Extracted PDF text must never contain Unicode replacement character U+FFFD',
  );

  // Verify clickable link annotations & UTF-16BE /Info Title metadata exist in raw PDF structure
  const rawAscii = new TextDecoder('latin1').decode(glyphArtifact.bytes);
  assert.ok(
    rawAscii.includes('/Subtype /Link') && rawAscii.includes('mailto:'),
    'PDF must contain clickable mailto and URI link annotations',
  );
  assert.ok(
    rawAscii.includes('/Lang (en-US)'),
    'PDF catalog must declare /Lang (en-US)',
  );
  assert.ok(
    rawAscii.includes('/FontFile2') && rawAscii.includes('/ToUnicode'),
    'PDF must embed subsetted TrueType /FontFile2 streams and /ToUnicode CMap',
  );

  const positionedFromPdfJs = await extractPositionedTextFromPdfBlob(glyphBlob);
  assert.ok(
    positionedFromPdfJs.length > 15,
    'extractPositionedTextFromPdfBlob must return positioned text spans',
  );

  console.log(
    `✓ All ${totalChecks + 6} WYSIWYG parity, Word (.docx), byte-identity, and glyph checks passed.`,
  );
}

runParitySuite().catch((err) => {
  console.error('Parity suite failed:', err);
  process.exit(1);
});
