# Architectural Decisions Record (`docs/DECISIONS.md`)

## ADR-001: Single-Pipeline PDF.js Canvas Preview vs. Dual DOM/PDF Renderers
- **Context:** Maintaining a React/DOM paper replica (`ResumePage`, `CoverLetterPage`) alongside a separate PDF binary generator caused subtle line-wrap, margin, and pagination drift between what the user saw in Studio and the downloaded `.pdf` file.
- **Decision:** Delete the DOM page replica components (`ResumePage`, `CoverLetterPage`, `PaperSheet`, `PageBreak`, `DocumentContactHeader`) and render the real `Uint8Array` PDF bytes produced by `generatePdfArtifact(document, templateId)` directly onto HTML `<canvas>` elements via `pdfjs-dist` (`PdfPreview` and `PdfThumbnail`).
- **Consequences:**
  - **100% WYSIWYG parity:** The preview is literally the exported PDF file (`"PDF · 1 page · 48 KB"`). Clicking **Export PDF** downloads the exact `Uint8Array` bytes currently displayed in the preview.
  - **Interactive overlays preserved:** `PreviewOverlay` mounts an aligned SVG layer over each page canvas using `PositionedText[]` and `locateBlocks(document, positionedText)` to render Skim view veils/anchors, cross-highlighted requirement terms, and hovered bullet/paragraph outlines without mutating the PDF binary.
  - **Automated verification:** `npm run test:parity` verifies 100% text, contact, bullet, and bounding-box parity across all templates; `npm run test:golden` rasterizes each template to PNG and enforces `< 0.1%` pixel diff against `src/tests/golden/*.png`.

## ADR-002: Static Subsetted TrueType Font Embedding in Pure Domain Engine
- **Context:** Standard PDF Type1 fonts (`Helvetica`, `Times-Roman`) differ in character widths and glyph coverage from Cevin's UI typography (`Plus Jakarta Sans` and `Fraunces`), and lack reliable glyph coverage for `"·"`, `"–"`, `"—"`, `"•"`, `"|"`, `"→"`, and accented Latin characters (`é, è, ç, ñ`).
- **Decision:** Embed static subsetted TrueType font tables (`Plus Jakarta Sans` Regular 400, SemiBold 600, Bold 700; `Fraunces` SemiBold 600, Bold 700) in `src/core/domain/embeddedFonts.ts` and drive all layout measurements through `TemplateSpec` (`src/core/domain/templateSpec.ts`).
- **Consequences:**
  - Zero network fetches or filesystem reads during PDF generation; `core/domain` remains 100% pure and synchronous.
  - Identical glyph metrics in Node.js CLI tests (`test:parity`, `test:golden`) and the browser.

## ADR-003: Fixed Attention Budgets & Salience Hierarchy for Job Facts
- **Context:** As Cevin extracts more structured facts from job postings (5 core facts today, scaling to 10–15+ facts), rendering every fact as a card or chip in Applications list rows and detail headers pushed the primary scores below the fold and created visual noise (`? 2`, `Quote (rules)`).
- **Decision:** Introduce `FACT_KIND_REGISTRY` (`src/core/domain/jobfacts/registry.ts`), user-configurable `FactImportance` (`dealbreaker | important | nice-to-know`), pure `deriveSalience(status, importance)` (`critical | notable | quiet`), and strict per-surface attention budgets:
  - **Applications list row:** Maximum **1 `AttentionToken`** (`critical` fit → `notable` fit → coverage gap). Unknown (`Not stated`) facts never render on list rows.
  - **Applications detail:** **Score row always first** above the fold, followed by a single-line **`FitStrip`** (showing `"Fits your preferences ✓"` or up to 3 salient pills + `+n`) with stage-aware default expansion (`Prospect` expanded; `Draft`/`Applied` collapsed).
  - **Job step, Quick check & expanded detail:** Dense **`JobFactsTable`** with `Needs a look` rows first and `Fits (n)` collapsed into one summary line.
- **Consequences:**
  - Adding 10 or 15 facts has zero impact on list row height or above-the-fold score visibility on `1440×900` viewports.

## ADR-004: Stretch Calibration Curves & 5-Point Quick Estimate Band
- **Context:** Heuristic scores that saturate at `100` on ordinary drafts leave no headroom to reward improvements and make untailored `Prospect` estimates look misleadingly precise.
- **Decision:**
  - Reserve the top ~10% of each Recruiter appeal and Letter appeal lens for stretch criteria, verified against 4 reference fixtures (`poor < 55`, `average 55–75`, `good 75–90`, `gold 88–96`).
  - Cap untailored Quick check estimates at `95` and display them as a **5-point band** (`"85–90"`) inside a dashed `EstimateRing` labeled `Est.`
  - Compare Review gauge deltas (`DeltaChip`) against the **previous saved version** (`vs v2`) rather than an arbitrary baseline.
