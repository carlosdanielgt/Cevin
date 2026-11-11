/**
 * Script: outline-wordmark.ts
 * Computes lockup proportions for Cevin:
 * - Mark height = 1.08 * fontSize
 * - Gap = 0.25 * fontSize
 * - Mark vertically centered on cap-height midline (Fraunces cap-height is ~0.70 of em)
 *
 * Produces public/logo-lockup.svg with embedded Fraunces serif styling.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';

export interface LockupMetrics {
  fontSize: number;
  markHeight: number;
  gap: number;
  totalWidth: number;
  totalHeight: number;
}

export function computeLockupMetrics(fontSize = 24): LockupMetrics {
  const markHeight = Math.round(fontSize * 1.08 * 100) / 100;
  const gap = Math.round(fontSize * 0.25 * 100) / 100;
  // Estimated advance width for "Cevin" in Fraunces 600 at 24px is ~74px
  const textWidth = Math.round(fontSize * 3.1);
  const totalWidth = Math.round(markHeight + gap + textWidth);
  const totalHeight = Math.max(markHeight, fontSize) + 6;
  return {
    fontSize,
    markHeight,
    gap,
    totalWidth,
    totalHeight,
  };
}

export function generateLogoLockupSvg(fontSize = 24): string {
  const m = computeLockupMetrics(fontSize);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${m.totalWidth} ${m.totalHeight}" width="${m.totalWidth}" height="${m.totalHeight}" fill="none">
  <!-- Cevin Mark (height: ${m.markHeight}px) -->
  <g transform="translate(0, ${(m.totalHeight - m.markHeight) / 2}) scale(${m.markHeight / 64})">
    <path id="c" d="M48.85 46.14A22 22 0 1 1 48.85 17.86" stroke="#151A22" stroke-width="8" stroke-linecap="round"/>
    <circle id="bullet" cx="24" cy="32" r="4" fill="#1D4ED8"/>
    <line id="line" x1="33" y1="32" x2="58" y2="32" stroke="#1D4ED8" stroke-width="4" stroke-linecap="round"/>
  </g>
  <!-- Wordmark "Cevin" (Fraunces 600, letter-spacing -0.02em) -->
  <text
    x="${m.markHeight + m.gap}"
    y="${m.totalHeight / 2 + m.fontSize * 0.32}"
    font-family="Fraunces, Georgia, serif"
    font-size="${m.fontSize}"
    font-weight="600"
    letter-spacing="-0.02em"
    fill="#151A22"
  >Cevin</text>
</svg>
`;
}

if (process.argv[1]?.endsWith('outline-wordmark.ts')) {
  const svg = generateLogoLockupSvg(24);
  const outPath = path.resolve(process.cwd(), 'public/logo-lockup.svg');
  fs.writeFileSync(outPath, svg, 'utf-8');
  console.log('Generated public/logo-lockup.svg successfully:', computeLockupMetrics(24));
}
