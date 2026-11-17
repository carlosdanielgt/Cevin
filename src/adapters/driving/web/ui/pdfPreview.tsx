import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import pdfWorkerUrl from 'pdfjs-dist/legacy/build/pdf.worker.mjs?url';
import {
  locateBlocks,
  measureTextWidthPt,
  PAGE_SIZES,
  renderDocumentToPdfArtifact,
  segmentBulletForSkimAndHighlight,
  type CoverLetterDocument,
  type ExportableDocument,
  type PageDimensions,
  type PageSize,
  type PositionedText,
  type RenderedPdfArtifact,
  type ResumeDocument,
  type TemplateId,
} from '../../../../core/domain';
export type { RenderedPdfArtifact };
import type { PreviewZoom } from '../context';
import { cn } from './primitives';

type PdfJsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');
type RenderTask = ReturnType<
  Awaited<ReturnType<PdfJsModule['getDocument']>['promise']>['getPage'] extends (
    pageNumber: number,
  ) => Promise<infer P>
    ? P extends { render: (...args: never[]) => infer R }
      ? () => R
      : never
    : never
>;

let pdfjsPromise: Promise<PdfJsModule> | null = null;

async function loadPdfJs(): Promise<PdfJsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = import('pdfjs-dist/legacy/build/pdf.mjs').then((mod) => {
      if (typeof window !== 'undefined' && mod.GlobalWorkerOptions) {
        mod.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      }
      return mod;
    });
  }
  return pdfjsPromise;
}

const SAMPLE_THUMBNAIL_RESUME: ResumeDocument = {
  kind: 'resume',
  contentHash: 'sample-thumbnail-resume',
  meta: {
    versionNumber: 1,
    templateId: 'classic',
    voice: 'balanced',
    targetCompany: 'Kestrel Pay',
    targetRole: 'Staff Infrastructure Engineer',
    generatedAt: '2026-11-06T12:00:00.000Z',
  },
  header: {
    name: 'Elena Rostova',
    headline: 'Staff Infrastructure & Reliability Engineer',
    email: 'elena.rostova@example.com',
    phone: '+1 (415) 890-4312',
    location: 'San Francisco, CA',
    links: [{ label: 'github', url: 'github.com/erostova' }],
  },
  summary:
    'Staff Platform Engineer scaling Kubernetes, Go, and PostgreSQL pipelines at 1.4M events/sec with 99.995% availability.',
  experiences: [
    {
      id: 'exp-1',
      company: 'Vanguard Telemetry Systems',
      title: 'Staff Platform Engineer',
      location: 'San Francisco, CA',
      dateRange: '2023-02 – Present',
      bullets: [
        {
          id: 'b-1',
          text: 'Re-architected multi-region Kubernetes ingestion in Go and Kafka, cutting cross-AZ egress spend by 38%.',
          sourceIds: [],
          unverifiedClaims: [],
        },
        {
          id: 'b-2',
          text: 'Designed zero-downtime PostgreSQL partition routing, dropping p99 query latency from 420ms to 68ms.',
          sourceIds: [],
          unverifiedClaims: [],
        },
      ],
    },
  ],
  projects: [],
  skillsByCategory: [
    {
      category: 'Infrastructure',
      skills: ['Kubernetes', 'Terraform', 'AWS', 'PostgreSQL', 'Kafka'],
    },
  ],
  educations: [
    {
      id: 'edu-1',
      institution: 'Pacific Crest Institute of Technology',
      degreeLine: 'B.S., Computer Science',
      location: 'Seattle, WA',
      dateRange: '2014 – 2018',
    },
  ],
  certifications: [],
};

interface OverlayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes SVG overlay rectangles in page-point coordinates (612x792 or 595.28x841.89)
 * for Skim view (veiling non-anchor spans while framing skim anchors), requirement term cross-highlighting,
 * and hovered bullet/block bounding boxes.
 */
function computeOverlayGeometry(params: {
  page: number;
  document: ExportableDocument;
  positionedText: PositionedText[];
  pageSize: PageSize;
  skimMode: boolean;
  skimKeywordTerms: string[];
  highlightedTerm?: string;
  hoveredBlockId?: string;
  highlightedSourceId?: string;
}) {
  const {
    page,
    document: doc,
    positionedText,
    pageSize,
    skimMode,
    skimKeywordTerms,
    highlightedTerm,
    hoveredBlockId,
    highlightedSourceId,
  } = params;

  const pageSpans = positionedText.filter((pt) => pt.page === page);
  const skimVeilRects: OverlayRect[] = [];
  const skimAnchorRects: OverlayRect[] = [];
  const termHighlightRects: OverlayRect[] = [];
  const cleanHighlight = (highlightedTerm ?? '').trim().toLowerCase();

  for (const span of pageSpans) {
    const text = span.text;
    if (!text || text === '•') continue;

    const fontSize = span.fontSize ?? 9.5;
    const spanW =
      span.width ??
      measureTextWidthPt(
        text,
        span.bold ? 'plus-jakarta-bold' : 'plus-jakarta-regular',
        fontSize,
      );
    const spanH = (span.height ?? fontSize) * 1.24;
    const topY = Math.max(0, span.y - fontSize * 0.88);

    if (cleanHighlight && text.toLowerCase().includes(cleanHighlight)) {
      const lowerText = text.toLowerCase();
      let searchFrom = 0;
      while (searchFrom < lowerText.length) {
        const matchIdx = lowerText.indexOf(cleanHighlight, searchFrom);
        if (matchIdx === -1) break;
        const prefix = text.slice(0, matchIdx);
        const matchedSub = text.slice(
          matchIdx,
          matchIdx + cleanHighlight.length,
        );
        const offsetX = measureTextWidthPt(
          prefix,
          span.bold ? 'plus-jakarta-bold' : 'plus-jakarta-regular',
          fontSize,
        );
        const matchW = Math.max(
          10,
          measureTextWidthPt(
            matchedSub,
            span.bold ? 'plus-jakarta-bold' : 'plus-jakarta-regular',
            fontSize,
          ),
        );
        termHighlightRects.push({
          x: Number((span.x + offsetX - 1.5).toFixed(2)),
          y: Number((topY - 1).toFixed(2)),
          width: Number((matchW + 3).toFixed(2)),
          height: Number((spanH + 1.5).toFixed(2)),
        });
        searchFrom = matchIdx + cleanHighlight.length;
      }
    }

    if (skimMode) {
      const isDateSpan = /\b(19|20)\d{2}\b|\bPresent\b/i.test(text);
      if (span.bold || isDateSpan || fontSize >= 10.2) {
        skimAnchorRects.push({
          x: Number((span.x - 1).toFixed(2)),
          y: Number(topY.toFixed(2)),
          width: Number((spanW + 2).toFixed(2)),
          height: Number(spanH.toFixed(2)),
        });
        continue;
      }

      const tokens = segmentBulletForSkimAndHighlight(
        text,
        skimKeywordTerms,
        highlightedTerm,
      );
      let cursorX = span.x;
      for (const tok of tokens) {
        const tokW = measureTextWidthPt(
          tok.text,
          'plus-jakarta-regular',
          fontSize,
        );
        if (tok.text.trim()) {
          if (tok.isSkimAnchor || tok.isHighlighted) {
            skimAnchorRects.push({
              x: Number((cursorX - 1).toFixed(2)),
              y: Number(topY.toFixed(2)),
              width: Number((tokW + 2).toFixed(2)),
              height: Number(spanH.toFixed(2)),
            });
          } else {
            skimVeilRects.push({
              x: Number(cursorX.toFixed(2)),
              y: Number((topY - 0.5).toFixed(2)),
              width: Number((tokW + 0.8).toFixed(2)),
              height: Number((spanH + 1).toFixed(2)),
            });
          }
        }
        cursorX += tokW;
      }
    }
  }

  const targetBlockIds: string[] = [];
  if (hoveredBlockId) targetBlockIds.push(hoveredBlockId);
  if (highlightedSourceId) {
    if (doc.kind === 'coverLetter') {
      for (const b of doc.blocks) {
        if (
          b.sourceIds.includes(highlightedSourceId) ||
          b.id === highlightedSourceId
        ) {
          targetBlockIds.push(b.id);
        }
      }
    } else {
      for (const exp of doc.experiences) {
        for (const b of exp.bullets) {
          if (
            b.sourceIds.includes(highlightedSourceId) ||
            b.id === highlightedSourceId
          ) {
            targetBlockIds.push(b.id);
          }
        }
      }
    }
  }

  return {
    skimVeilRects,
    skimAnchorRects,
    termHighlightRects,
    hoveredBlockRects:
      targetBlockIds.length > 0
        ? locateBlocks(doc, positionedText, pageSize).filter(
            (box) => box.page === page && targetBlockIds.includes(box.blockId),
          )
        : [],
  };
}

/**
 * Pure SVG overlay positioned over each rendered PDF `<canvas>` page.
 * Uses strictly SVG attributes (zero inline styles) to render Skim view veils/anchors,
 * requirement cross-highlights, and bullet/paragraph hover boxes.
 */
function PreviewOverlay({
  page,
  document: doc,
  positionedText,
  pageSize = 'letter',
  skimMode = false,
  skimKeywordTerms = [],
  highlightedTerm,
  hoveredBlockId,
  highlightedSourceId,
}: {
  page: number;
  document: ExportableDocument;
  positionedText: PositionedText[];
  pageSize?: PageSize;
  skimMode?: boolean;
  skimKeywordTerms?: string[];
  highlightedTerm?: string;
  hoveredBlockId?: string;
  highlightedSourceId?: string;
}) {
  const dims = PAGE_SIZES[pageSize];
  const geometry = useMemo(
    () =>
      computeOverlayGeometry({
        page,
        document: doc,
        positionedText,
        pageSize,
        skimMode,
        skimKeywordTerms,
        highlightedTerm,
        hoveredBlockId,
        highlightedSourceId,
      }),
    [
      page,
      doc,
      positionedText,
      pageSize,
      skimMode,
      skimKeywordTerms,
      highlightedTerm,
      hoveredBlockId,
      highlightedSourceId,
    ],
  );

  if (
    !(
      skimMode ||
      geometry.termHighlightRects.length > 0 ||
      geometry.hoveredBlockRects.length > 0
    )
  ) {
    return null;
  }

  return (
    <svg
      viewBox={`0 0 ${dims.widthPt} ${dims.heightPt}`}
      preserveAspectRatio="none"
      aria-label={`Preview overlay page ${page}`}
      className="pointer-events-none absolute inset-0 w-full h-full select-none"
    >
      {skimMode &&
        geometry.skimVeilRects.map((rect, idx) => (
          <rect
            key={`veil-${idx}`}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
            rx="1.5"
            fill="#FFFFFF"
            fillOpacity="0.76"
          />
        ))}
      {skimMode &&
        geometry.skimAnchorRects.map((rect, idx) => (
          <rect
            key={`anchor-${idx}`}
            x={rect.x}
            y={rect.y + rect.height - 1.2}
            width={rect.width}
            height="1.2"
            rx="0.6"
            fill="#2448C8"
            fillOpacity="0.28"
          />
        ))}
      {geometry.hoveredBlockRects.map((box) => (
        <rect
          key={`block-${box.blockId}`}
          x={box.x}
          y={box.y}
          width={box.width}
          height={box.height}
          rx="3"
          fill="#2448C8"
          fillOpacity="0.08"
          stroke="#2448C8"
          strokeWidth="1.2"
          strokeOpacity="0.55"
        />
      ))}
      {geometry.termHighlightRects.map((rect, idx) => (
        <rect
          key={`hl-${idx}`}
          x={rect.x}
          y={rect.y}
          width={rect.width}
          height={rect.height}
          rx="2"
          fill="#FEF08A"
          fillOpacity="0.48"
          stroke="#CA8A04"
          strokeWidth="0.9"
        />
      ))}
    </svg>
  );
}

const ZOOM_CONTAINER_CLASSES: Record<PreviewZoom, string> = {
  sm: 'max-w-[640px]',
  md: 'max-w-[760px]',
  lg: 'max-w-[840px]',
};

const ZOOM_RENDER_SCALES: Record<PreviewZoom, number> = {
  sm: 1.25,
  md: 1.45,
  lg: 1.65,
};

function drawVectorPageToCanvas(params: {
  canvas: HTMLCanvasElement;
  doc: ExportableDocument;
  positionedText: PositionedText[];
  pageNumber: number;
  scale: number;
  spec: PageDimensions;
}) {
  const { canvas, doc, positionedText, pageNumber, scale, spec } = params;
  const targetWidth = Math.round(spec.widthPt * scale);
  const targetHeight = Math.round(spec.heightPt * scale);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }

  const visibleCtx = canvas.getContext('2d');
  if (!visibleCtx) return;

  visibleCtx.fillStyle = '#FFFFFF';
  visibleCtx.fillRect(0, 0, canvas.width, canvas.height);

  const pageTexts = positionedText.filter((pt) => pt.page === pageNumber);
  visibleCtx.strokeStyle = '#E2E8F0';
  visibleCtx.lineWidth = Math.max(0.5, 0.5 * (scale / 1.5));

  const marginPt = 36;
  const leftX = marginPt * scale;
  const rightX = (spec.widthPt - marginPt) * scale;

  const sectionHeaders = pageTexts.filter(
    (pt) =>
      pt.bold &&
      /^(EXPERIENCE|PROJECTS|SKILLS|EDUCATION|CERTIFICATIONS|SUMMARY)$/i.test(
        pt.text.trim(),
      ),
  );
  for (const sh of sectionHeaders) {
    const ruleY = Math.round((sh.y + 3) * scale) + 0.5;
    visibleCtx.beginPath();
    visibleCtx.moveTo(leftX, ruleY);
    visibleCtx.lineTo(rightX, ruleY);
    visibleCtx.stroke();
  }

  if (pageNumber === 1) {
    const summaryHeading = pageTexts.find((pt) =>
      /^(SUMMARY|EXPERIENCE|PROJECTS|SKILLS)$/i.test(pt.text.trim()),
    );
    const cutoffY = summaryHeading ? summaryHeading.y : 120;
    const lastContact = pageTexts
      .filter((pt) => pt.y < cutoffY && (pt.fontSize ?? 10) <= 9.75 && pt.y > 35)
      .reduce<PositionedText | undefined>(
        (max, pt) => (pt.y > (max?.y ?? 0) ? pt : max),
        undefined,
      );
    if (lastContact) {
      const headerRuleY = Math.round((lastContact.y + 6) * scale) + 0.5;
      visibleCtx.strokeStyle =
        doc.meta.templateId === 'modern' ? '#1D4ED8' : '#D1D5DB';
      visibleCtx.lineWidth = Math.max(0.6, 0.6 * (scale / 1.5));
      visibleCtx.beginPath();
      visibleCtx.moveTo(leftX, headerRuleY);
      visibleCtx.lineTo(rightX, headerRuleY);
      visibleCtx.stroke();
    }
  }

  for (const item of pageTexts) {
    const fontFamilies =
      doc.meta.templateId === 'classic' &&
      (item.fontSize ?? 10) >= 10.5 &&
      item.bold
        ? 'Fraunces, Georgia, serif'
        : 'Plus Jakarta Sans, -apple-system, sans-serif';
    visibleCtx.font = `${item.bold ? '600 ' : '400 '}${Math.max(
      2.5,
      (item.fontSize ?? 10) * scale,
    )}px ${fontFamilies}`;
    visibleCtx.fillStyle =
      (item.fontSize ?? 10) <= 9.2 && !item.bold ? '#525B6B' : '#151A22';
    visibleCtx.textBaseline = 'alphabetic';
    visibleCtx.fillText(item.text, item.x * scale, item.y * scale);
  }
}

/**
 * SinglePagePdfCanvas renders a single page of a loaded PDF document onto a `<canvas>`
 * and pairs it with `PreviewOverlay`. Draws the synchronous vector preview immediately
 * so the page is never blank, then upgrades via `pdfjs-dist` when ready.
 */
function SinglePagePdfCanvas({
  pdfBytes,
  pageNumber,
  zoom,
  pageSize,
  document: doc,
  positionedText,
  skimMode,
  skimKeywordTerms,
  highlightedTerm,
  hoveredBlockId,
  highlightedSourceId,
  onRenderDone,
}: {
  pdfBytes: Uint8Array;
  pageNumber: number;
  zoom: PreviewZoom;
  pageSize: PageSize;
  document: ExportableDocument;
  positionedText: PositionedText[];
  skimMode?: boolean;
  skimKeywordTerms?: string[];
  highlightedTerm?: string;
  hoveredBlockId?: string;
  highlightedSourceId?: string;
  onRenderDone?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderTaskRef = useRef<RenderTask | null>(null);
  const onRenderDoneRef = useRef(onRenderDone);
  onRenderDoneRef.current = onRenderDone;

  useEffect(() => {
    let cancelled = false;
    async function drawPage() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const spec = PAGE_SIZES[pageSize] ?? PAGE_SIZES.letter;
      const dpr =
        typeof window !== 'undefined'
          ? Math.min(2, window.devicePixelRatio || 1.5)
          : 1.5;
      const scale = ZOOM_RENDER_SCALES[zoom] * dpr;

      drawVectorPageToCanvas({
        canvas,
        doc,
        positionedText,
        pageNumber,
        scale,
        spec,
      });
      onRenderDoneRef.current?.();

      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        const dataCopy = new Uint8Array(pdfBytes);
        const pdfDoc = await pdfjs.getDocument({
          data: dataCopy,
          useSystemFonts: true,
        }).promise;
        if (cancelled) return;
        const clampedPage = Math.max(1, Math.min(pdfDoc.numPages, pageNumber));
        const pdfPage = await pdfDoc.getPage(clampedPage);
        if (cancelled) return;

        const viewport = pdfPage.getViewport({ scale });
        const offscreen = window.document.createElement('canvas');
        offscreen.width = Math.round(viewport.width);
        offscreen.height = Math.round(viewport.height);
        const offCtx = offscreen.getContext('2d');
        if (!offCtx) return;

        offCtx.fillStyle = '#FFFFFF';
        offCtx.fillRect(0, 0, offscreen.width, offscreen.height);

        if (renderTaskRef.current?.cancel) {
          try {
            renderTaskRef.current.cancel();
          } catch {
            // ignore cancellation errors
          }
        }

        const task = pdfPage.render({
          canvasContext: offCtx,
          viewport,
          canvas: offscreen,
        });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        canvas.width = offscreen.width;
        canvas.height = offscreen.height;
        const visibleCtx = canvas.getContext('2d');
        if (visibleCtx) {
          visibleCtx.drawImage(offscreen, 0, 0);
        }
        onRenderDoneRef.current?.();
      } catch {
        // Vector canvas fallback remains visible
      }
    }

    void drawPage();

    return () => {
      cancelled = true;
      if (renderTaskRef.current?.cancel) {
        try {
          renderTaskRef.current.cancel();
        } catch {
          // ignore
        }
      }
    };
  }, [pdfBytes, pageNumber, zoom, pageSize, doc, positionedText]);

  return (
    <div
      data-testid={`pdf-page-${pageNumber}`}
      className={cn(
        'relative w-full mx-auto bg-paper border border-paper-border rounded-xs shadow-paper overflow-hidden transition-all',
        ZOOM_CONTAINER_CLASSES[zoom],
      )}
    >
      <canvas
        ref={canvasRef}
        aria-label={`${
          doc.kind === 'coverLetter' ? 'Cover letter' : 'Resume'
        } PDF page ${pageNumber}`}
        className="block w-full h-auto bg-paper"
      />
      <PreviewOverlay
        page={pageNumber}
        document={doc}
        positionedText={positionedText}
        pageSize={pageSize}
        skimMode={skimMode}
        skimKeywordTerms={skimKeywordTerms}
        highlightedTerm={highlightedTerm}
        hoveredBlockId={hoveredBlockId}
        highlightedSourceId={highlightedSourceId}
      />
    </div>
  );
}

/**
 * True WYSIWYG `PdfPreview` component:
 * Renders the exact PDF bytes produced by the PDF engine via `pdfjs-dist` onto `<canvas>` per page.
 * Debounces document edits by 250ms, keeps the previous frame visible until the new canvas is ready,
 * and shows a subtle "Updating…" indicator when a render is in flight.
 */
export function PdfPreview({
  document: doc,
  zoom = 'md',
  pageSize = 'letter',
  skimMode = false,
  skimKeywordTerms = [],
  highlightedTerm,
  highlightedSourceId,
  hoveredBlockId,
  onArtifactReady,
}: {
  document: ExportableDocument;
  zoom?: PreviewZoom;
  pageSize?: PageSize;
  skimMode?: boolean;
  skimKeywordTerms?: string[];
  highlightedTerm?: string;
  highlightedSourceId?: string;
  hoveredBlockId?: string;
  onArtifactReady?: (artifact: RenderedPdfArtifact) => void;
}) {
  const templateId: TemplateId = doc.meta.templateId || 'classic';
  const initialArtifact = useMemo(
    () =>
      renderDocumentToPdfArtifact(doc, {
        templateId,
        pageSize,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const [activeArtifact, setActiveArtifact] =
    useState<RenderedPdfArtifact>(initialArtifact);
  const [activeDoc, setActiveDoc] = useState<ExportableDocument>(doc);
  const [isUpdating, setIsUpdating] = useState(false);
  const lastRenderedKeyRef = useRef(
    `${initialArtifact.contentHash}::${templateId}::${pageSize}`,
  );
  const onArtifactReadyRef = useRef(onArtifactReady);
  onArtifactReadyRef.current = onArtifactReady;

  useEffect(() => {
    onArtifactReadyRef.current?.(initialArtifact);
  }, [initialArtifact]);

  useEffect(() => {
    if (
      `${doc.contentHash}::${templateId}::${pageSize}` ===
      lastRenderedKeyRef.current
    ) {
      return;
    }
    setIsUpdating(true);
    const timer = setTimeout(() => {
      const nextArtifact = renderDocumentToPdfArtifact(doc, {
        templateId,
        pageSize,
      });
      lastRenderedKeyRef.current = `${nextArtifact.contentHash}::${templateId}::${pageSize}`;
      setActiveArtifact(nextArtifact);
      setActiveDoc(doc);
      onArtifactReadyRef.current?.(nextArtifact);
    }, 250);
    return () => clearTimeout(timer);
  }, [doc, doc.contentHash, templateId, pageSize]);

  const pages = Array.from(
    { length: Math.max(1, activeArtifact.pageCount) },
    (_, i) => i + 1,
  );

  return (
    <div
      aria-label={
        doc.kind === 'coverLetter'
          ? 'Live Cover Letter PDF Preview'
          : 'Live Resume PDF Preview'
      }
      data-content-hash={activeArtifact.contentHash}
      className="relative w-full space-y-6"
    >
      {isUpdating && (
        <div
          role="status"
          aria-live="polite"
          className="sticky top-14 z-20 flex justify-end pointer-events-none px-4"
        >
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-surface/95 text-ink-muted border border-border shadow-xs">
            <span className="w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
            <span>Updating…</span>
          </span>
        </div>
      )}
      {pages.map((pageNum) => (
        <Fragment key={pageNum}>
          {pageNum > 1 && (
            <div
              aria-label={`Page ${pageNum} break`}
              className="my-4 flex items-center gap-3 select-none max-w-[760px] mx-auto"
            >
              <div className="flex-1 border-t border-dashed border-border-strong" />
              <span className="px-2.5 py-0.5 rounded-full bg-surface text-ink-muted text-[11px] font-sans font-semibold border border-border">
                Page {pageNum} of {activeArtifact.pageCount}
              </span>
              <div className="flex-1 border-t border-dashed border-border-strong" />
            </div>
          )}
          <SinglePagePdfCanvas
            pdfBytes={activeArtifact.bytes}
            pageNumber={pageNum}
            zoom={zoom}
            pageSize={pageSize}
            document={activeDoc}
            positionedText={activeArtifact.positionedText}
            skimMode={skimMode}
            skimKeywordTerms={skimKeywordTerms}
            highlightedTerm={highlightedTerm}
            hoveredBlockId={hoveredBlockId}
            highlightedSourceId={highlightedSourceId}
            onRenderDone={() => setIsUpdating(false)}
          />
        </Fragment>
      ))}
    </div>
  );
}

const THUMBNAIL_FRAME_CLASSES: Record<'xs' | 'sm' | 'md', string> = {
  xs: 'w-11 h-14',
  sm: 'w-20 h-26',
  md: 'w-[112px] h-[145px]',
};

const THUMBNAIL_SCALES: Record<'xs' | 'sm' | 'md', number> = {
  xs: 0.16,
  sm: 0.26,
  md: 0.36,
};

/**
 * `PdfThumbnail` (also aliased as `PageThumbnail`):
 * Renders Page 1 of the actual PDF bytes onto a `<canvas>` for template cards in Settings,
 * the Studio template switcher, and VersionCards.
 */
export function PdfThumbnail({
  pdfBytes,
  pdfBytesBase64,
  resumeDoc,
  coverLetterDoc,
  templateId = 'classic',
  size = 'md',
  className,
}: {
  pdfBytes?: Uint8Array;
  pdfBytesBase64?: string;
  resumeDoc?: ResumeDocument;
  coverLetterDoc?: CoverLetterDocument;
  templateId?: TemplateId;
  size?: 'xs' | 'sm' | 'md';
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const thumbTargetDoc = useMemo<ExportableDocument>(() => {
    if (coverLetterDoc) {
      return {
        ...coverLetterDoc,
        meta: {
          ...coverLetterDoc.meta,
          templateId,
        },
      };
    }
    if (resumeDoc) {
      return {
        ...resumeDoc,
        meta: {
          ...resumeDoc.meta,
          templateId,
        },
      };
    }
    return {
      ...SAMPLE_THUMBNAIL_RESUME,
      meta: {
        ...SAMPLE_THUMBNAIL_RESUME.meta,
        templateId,
      },
    };
  }, [coverLetterDoc, resumeDoc, templateId]);

  const thumbArtifact = useMemo(
    () =>
      renderDocumentToPdfArtifact(thumbTargetDoc, {
        templateId,
        pageSize: 'letter',
      }),
    [thumbTargetDoc, templateId],
  );

  const effectiveBytes = useMemo(() => {
    if (pdfBytes && pdfBytes.byteLength > 0) return pdfBytes;
    if (
      pdfBytesBase64 &&
      pdfBytesBase64.length > 0 &&
      typeof atob === 'function'
    ) {
      try {
        const bin = atob(pdfBytesBase64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        if (arr.byteLength > 0) return arr;
      } catch {
        // fallback to generated artifact
      }
    }
    return thumbArtifact.bytes;
  }, [pdfBytes, pdfBytesBase64, thumbArtifact.bytes]);

  useEffect(() => {
    let cancelled = false;
    async function drawThumb() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      drawVectorPageToCanvas({
        canvas,
        doc: thumbTargetDoc,
        positionedText: thumbArtifact.positionedText,
        pageNumber: 1,
        scale: THUMBNAIL_SCALES[size] * 2,
        spec: PAGE_SIZES.letter,
      });

      try {
        const pdfjs = await loadPdfJs();
        if (cancelled) return;
        const dataCopy = new Uint8Array(effectiveBytes);
        const pdfDoc = await pdfjs.getDocument({
          data: dataCopy,
          useSystemFonts: true,
        }).promise;
        if (cancelled) return;
        const page1 = await pdfDoc.getPage(1);
        if (cancelled) return;
        const viewport = page1.getViewport({
          scale: THUMBNAIL_SCALES[size] * 2,
        });
        canvas.width = Math.round(viewport.width);
        canvas.height = Math.round(viewport.height);
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        await page1.render({
          canvasContext: ctx,
          viewport,
          canvas,
        }).promise;
      } catch {
        // vector fallback stays visible
      }
    }

    void drawThumb();

    return () => {
      cancelled = true;
    };
  }, [effectiveBytes, size, thumbTargetDoc, thumbArtifact.positionedText]);

  return (
    <div
      aria-hidden="true"
      className={cn(
        'relative overflow-hidden bg-paper border border-paper-border rounded-xs shadow-paper shrink-0 select-none pointer-events-none flex items-start justify-center',
        THUMBNAIL_FRAME_CLASSES[size],
        className,
      )}
    >
      <canvas ref={canvasRef} className="block w-full h-full object-cover" />
    </div>
  );
}

export const PageThumbnail = PdfThumbnail;
