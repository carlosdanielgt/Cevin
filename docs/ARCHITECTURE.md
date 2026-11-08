# Cevin Architecture: Hexagonal (Ports & Adapters)

Cevin is structured around a strict **Hexagonal Architecture (Ports and Adapters)**. All business rules live inside `src/core/`, completely isolated from React, IndexedDB, Ollama, PDF binary generation, and file parsing.

## 1. The Hexagon Diagram

```text
                    +---------------------------------------+
                    |         Driving Adapter (Web)         |
                    |  src/adapters/driving/web/            |
                    |  (SidebarNav, Applications, Studio,   |
                    |   Experience Bank, Settings, UI)      |
                    +-------------------+-------------------+
                                        |
                                        v  calls Inbound Ports
            +-------------------------------------------------------+
            |                CORE APPLICATION LAYER                 |
            |  src/core/application/                                |
            |  - ports/inbound/   (Use-case contracts & DTOs)       |
            |  - gateway.ts       (LlmGateway: queue, cache, repair)|
            |  - tasks/           (6 narrow KV-cached LLM tasks)    |
            |  - usecases/        (Resume, Letter, Fit, QuickCheck) |
            |  - ports/outbound/  (LlmProvider, Profiles, Cache)    |
            |                           |                           |
            |                           v                           |
            |                  CORE DOMAIN LAYER                    |
            |  src/core/domain/                                     |
            |  - Entities & Zod schemas (Resume, Letter, JobFacts)  |
            |  - appeal/          (4 Lenses, Skim Anchors, Takeaway)|
            |  - coverage/        (Needs Attention, Bank Evidence)  |
            |  - jobfacts/        (EN/FR Rules, Fit Matrix, Metros) |
            |  - quickcheck/      (Instant Triage & Prospect Flow)  |
            |  - Harness: Sanitizer, 6 Validators, TokenEstimator   |
            |  - Deterministic ATS Engine & 6-Point Letter Checks   |
            +-------+-------------------+-------------------+-------+
                    |                   |                   |
                    v                   v                   v
        +---------------+       +---------------+   +---------------+
        | Driven: LLM   |       | Driven: I/O   |   | Driven: Store |
        | Ollama, Mock, |       | PDF, MD, TXT  |   | Dexie v4: App,|
        | ModelProfiles |       | Importers/Exp |   | Prefs, Cache  |
        +---------------+       +---------------+   +---------------+
```

## 2. Dependency Rules

Enforced automatically by `scripts/lint-architecture.ts` via `npm run lint` and `npm run check`:

1. **`core/domain` imports nothing from the project.** Pure TypeScript + Zod schemas only. No I/O, no DOM/browser globals.
2. **`core/application` imports `core/domain` only.** Implements use cases against outbound port interfaces.
3. **Driven adapters (`adapters/driven/*`) import core ports and domain only**, and never import each other.
4. **The driving web adapter (`adapters/driving/web/`) imports inbound ports, domain types, and its own `ui/` only.** It never imports a driven adapter directly.
5. **UI primitives (`adapters/driving/web/ui/primitives.tsx`) contain no business logic and import nothing project-specific.**
6. **`main/` is the composition root.** `src/main/container.ts` is the only module that imports driven adapters and wires them into `createCevinUseCases()`.

## 3. Single-Pipeline True WYSIWYG ("The Preview Is the PDF")

Cevin eliminates preview/export drift by running a single document-to-PDF pipeline:
1. **Single Domain Mapper (`src/core/domain/documentMapper.ts`):** `mapToResumeDocument` and `mapToCoverLetterDocument` produce `ResumeDocument` and `CoverLetterDocument` with a deterministic `contentHash`.
2. **TemplateSpec & Static Subsetted TrueType Fonts (`src/core/domain/templateSpec.ts`, `src/core/domain/embeddedFonts.ts`, `src/core/domain/pdfEngine.ts`):** `generatePdfArtifact(document, templateId)` lays out every heading, role, bullet, skill group, and letter paragraph using `TEMPLATE_SPECS` (`classic`, `modern`, `compact`) and embeds static TrueType subsets (`Plus Jakarta Sans` 400/600/700 and `Fraunces` 600/700), returning `{ bytes: Uint8Array, pageCount: number, positionedText: PositionedText[] }`.
3. **Inbound `RenderPreviewUseCase` & `ExportDocumentUseCase`:** Studio calls `renderPreview.execute(...)` (debounced 250ms, cached by `contentHash:templateId`). When the user clicks **Export PDF**, `exportDocument.execute(...)` downloads those exact preview `Uint8Array` bytes (or stored `pdfBytes` when exporting a saved version).
4. **Web Adapter PDF.js Viewer (`src/adapters/driving/web/ui/pdfPreview.tsx`):**
   - `PdfPreview` renders the `Uint8Array` PDF bytes directly onto `<canvas>` per page via `pdfjs-dist`, keeping the previous frame visible until the new frame finishes rendering.
   - `PreviewOverlay` renders an aligned SVG overlay (zero inline styles, pure SVG attributes) for **Skim view** veils/anchors, **matched requirement highlights**, and **hovered bullet/paragraph bounding boxes** computed by `locateBlocks(document, positionedText)`.
   - `PdfThumbnail` (`PageThumbnail`) renders scaled `<canvas>` thumbnails from the real PDF bytes in Settings, Studio template cards, and saved version cards.

## 4. Driving Web Adapter ("Desk, Paper & Ink" Design System)

The web adapter (`src/adapters/driving/web/`) is structured into three strictly layered UI modules plus feature views:
- **`ui/primitives.tsx` (Domain-Agnostic Primitives):** `Button`, `IconButton`, `Badge`, `Pill`, `MetricChip`, `TagChip`, `DeltaChip` (non-zero delta guard), `StatTile`, `AutoGrowTextarea` (`[field-sizing:content]` + `ResizeObserver` + `document.fonts.ready` measurement), `TypeaheadField`, `MultiSelectChips`, `Panel`, `PanelSection`, `StickyFooterBar`, `Banner`, `Avatar`, `SpotIllustration`, `Disclosure`, `ConfirmDialog`, `SplitButton`, `Drawer`, `Modal`, `Popover`, and `CommandPalette`.
- **`ui/pdfPreview.tsx` (PDF.js Canvas Viewer & SVG Overlay):** `PdfPreview`, `PreviewOverlay`, and `PdfThumbnail` (`PageThumbnail`).
- **`ui/signatures.tsx` (Cevin Signature Components):** Sticky dark-ink `SidebarNav`, `MiniKnobBar` + expandable rotary `VoiceControl`, `ScoreChip`, `ScoreRing` (`36px`), `EstimateRing` (dashed `5-point` band for prospects), `HeroScoreBand` (with per-gauge `DeltaChip` vs. previous saved version), `LensBars`, `TakeawayCard`, `CoverageSummary` + `RequirementGroup`, `FitStrip` (1-line collapsible summary) + `JobFactsTable` + `AttentionToken` + `ImportanceControl` + `ViewMenu`, `ApplicationDetailsForm`, `PreferencesForm`, `QuickCheckDialog`, `DeskPreview`, `BulletRow` (full-width text with hover/focus header action strip), `LetterBlock`, `TimelineRail`, and `VersionCard`.
- **Single Entry CSS (`src/index.css`):** Tailwind v4 `@theme` tokens define the 4-level surface ladder (`canvas`, `surface`, `surface-sunken`, `paper`), warm two-layer shadows (`shadow-xs` .. `shadow-paper`), and full Light/Dark token parity with zero inline styles.


