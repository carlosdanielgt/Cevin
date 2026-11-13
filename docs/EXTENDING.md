# Extending Cevin

Cevin is designed so that adding a new **Importer**, **Document Exporter**, **Template**, or **LLM Provider** requires **one new adapter file plus one registry line**, with zero changes to `core/` or the React UI.

---

## 1. Adding a New Resume Importer

Implement `ResumeImporter` in `src/adapters/driven/importers/` and add one line to `src/adapters/driven/importers/registry.ts`.

---

## 2. Adding a New Document Exporter (`supports: ['resume', 'coverLetter']`)

Exporters implement `DocumentExporter` (`ResumeExporter` alias) and consume the discriminated union `ExportableDocument = ResumeDocument | CoverLetterDocument`.

```ts
// src/adapters/driven/exporters/text.ts
import { DocumentExporter, ExportOptions } from '../../../core/application';
import { ExportableDocument } from '../../../core/domain';

export const plainTextDocumentExporter: DocumentExporter = {
  id: 'txt',
  label: 'Plain text (.txt)',
  fileExtension: 'txt',
  mimeType: 'text/plain;charset=utf-8',
  supports: ['resume', 'coverLetter'],
  capabilities: {
    templates: false,
    atsRoundTrip: false,
  },
  async export(
    document: ExportableDocument,
    _options: ExportOptions,
  ): Promise<Blob> {
    const text =
      document.kind === 'coverLetter'
        ? document.blocks.map((b) => b.text).join('\n\n')
        : document.summary;
    return new Blob([text], { type: 'text/plain;charset=utf-8' });
  },
};
```

Register in `src/adapters/driven/exporters/registry.ts`:

```ts
const REGISTERED_EXPORTERS: DocumentExporter[] = [
  pdfResumeExporter,
  docxDocumentExporter,
  markdownResumeExporter,
  plainTextDocumentExporter,
];
```

---

## 3. Adding a New Template (`TemplateSpec`)

Add the template ID to `TemplateIdSchema` in `src/core/domain/entities.ts` and add a `TemplateSpec` entry to `TEMPLATE_SPECS` in `src/core/domain/templateSpec.ts`. Because `generatePdfArtifact` (`src/core/domain/pdfEngine.ts`), `renderDocumentToDocxBlob` (`src/core/domain/docxEngine.ts`), `PdfPreview`, and `PdfThumbnail` all read from `TEMPLATE_SPECS`, the live preview, exported PDF, and exported Word `.docx` automatically support the new template.

---

## 4. Adding a New LLM Provider

Implement `LlmProviderDescriptor` in `src/adapters/driven/llm/` and add one line to `src/adapters/driven/llm/registry.ts`.

---

## 5. Adding a New Model Profile (`ModelProfile`)

Define a `ModelProfile` object in `src/adapters/driven/llm/profiles.ts` and add it to `REGISTERED_PROFILES`:

```ts
export const customMlxProfile: ModelProfile = {
  id: 'custom_mlx',
  label: 'Custom MLX Model',
  recommendedModelTag: 'custom-3b-4bit',
  maxSeqLength: 1024,
  parallelRecommended: 1,
  isFineTunedCevin3B: true,
  temperatures: {
    rewriteBullet: 0.25,
    writeSummary: 0.25,
    writeLetterBlock: 0.25,
    refineJobBrief: 0.0,
    classifyImportBlocks: 0.0,
    extractJobFact: 0.0,
  },
  maxOutputTokens: {
    rewriteBullet: 180,
    writeSummary: 180,
    writeLetterBlock: 220,
    refineJobBrief: 220,
    classifyImportBlocks: 260,
    extractJobFact: 120,
  },
  stopSequences: {
    rewriteBullet: [],
    writeSummary: [],
    writeLetterBlock: [],
    refineJobBrief: [],
    classifyImportBlocks: [],
    extractJobFact: [],
  },
  fewShotStyle: 'zero-shot-cot',
};
```

---

## 6. Adding a New Narrow LLM Task (`LlmTaskSpec`)

Add an `LlmTaskSpec<TInput, TOutput>` in `src/core/application/tasks/index.ts` and register it on `HARNESS_TASK_CATALOG`:
1. **`buildPrefixMessages(voice, profile)`**: System + schema instructions.
2. **`buildSuffixMessage(input)`**: Compact item payload (`<= 200` tokens).
3. **`parseAndSanitize(rawOutput, input)`**: Pure sanitizer/parser.
4. **`validate(parsedOutput, input, voice)`**: Returns `ValidationReport` from `src/core/domain/harness.ts`.
5. **`buildRepairMessage(violations, input, voice)`**: 1-shot targeted repair prompt when validation fails.
6. **`computeBaseline(input, voice)`**: Deterministic zero-LLM fallback so the feature works offline and never surfaces broken text.

---

## 7. How to Add a Fact Kind (`FACT_KIND_REGISTRY`)

Cevin's Job facts hierarchy is driven by `FACT_KIND_REGISTRY` (`src/core/domain/jobfacts/registry.ts`) so that adding a 6th, 10th, or 15th fact kind requires **zero layout changes** in `ApplicationsView`, `FitStrip`, `AttentionToken`, or `JobFactsTable`:

1. **Register the fact kind in `src/core/domain/jobfacts/registry.ts`:**
   ```ts
   {
     key: 'equity',
     label: 'Equity / stock',
     shortLabel: 'Equity',
     priorityOrder: 11,
     defaultImportance: 'nice-to-know',
     recruiterQuestionTemplate: (company, roleTitle) =>
       `Could you share whether the ${roleTitle} compensation package at ${company} includes equity or RSUs?`,
   }
   ```
2. **Supply extraction or extra fact entries (`JobFacts.extras`):**
   - For core schema fields, add a rule extractor in `src/core/domain/jobfacts/index.ts`.
   - For extended/custom fact kinds, populate `facts.extras[key]` (`ExtraJobFact` with `{ key, label, shortLabel, displayValue, status, confidence, source, evidence }`).
3. **Automatic UI & Salience Scaling:**
   - `evaluateFit(facts, preferences)` automatically looks up `getFactKindDescriptor(key)` and computes `deriveSalience(status, importance)`.
   - **Applications list rows** still show at most 1 `AttentionToken` prioritized by `critical` → `notable` → coverage gap.
   - **Applications detail** still renders the Score row first and summarizes all facts in the 1-line `FitStrip` (up to 3 salient pills + `+n`).
   - **`JobFactsTable`** automatically lists `Needs a look` rows first and collapses all `Fits (n)` items into a single quiet line.
