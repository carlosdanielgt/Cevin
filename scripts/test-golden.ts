import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {
  createDemoApplications,
  createDemoBankSnapshot,
} from '../src/core/application';
import {
  TemplateId,
  mapApplicationToCoverLetterDocument,
  mapApplicationToResumeDocument,
} from '../src/core/domain';
import { renderDocumentToPdfArtifact } from '../src/adapters/driven/exporters/pdf';

const GOLDEN_DIR = path.resolve(process.cwd(), 'src/tests/golden');
const UPDATE_GOLDENS =
  process.argv.includes('-u') || process.argv.includes('--update');

const TEMPLATES: TemplateId[] = ['classic', 'modern', 'compact'];
const BASE_URL = process.env.CEVIN_URL || 'http://localhost:3000';

function runCli(cmd: string): string {
  return execSync(cmd, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

async function runGoldenSuite() {
  fs.mkdirSync(GOLDEN_DIR, { recursive: true });

  const bank = createDemoBankSnapshot();
  const { applications: demoApps } = createDemoApplications(bank);
  const app = demoApps[0];

  runCli(`playwright-cli -s=golden open ${BASE_URL}`);
  try {
    let verifiedCount = 0;

    for (const templateId of TEMPLATES) {
      const configuredApp = { ...app, templateId };
      const resumeDoc = mapApplicationToResumeDocument(configuredApp, bank);
      const letterDoc = mapApplicationToCoverLetterDocument(
        configuredApp,
        bank,
      );

      for (const doc of [resumeDoc, letterDoc]) {
        const artifact = renderDocumentToPdfArtifact(doc, {
          templateId,
          pageSize: 'letter',
        });
        const key = `${doc.kind}-${templateId}`;
        const goldenFile = path.join(GOLDEN_DIR, `${key}.png`);
        const pdfBase64 = Buffer.from(artifact.bytes).toString('base64');

        // Render page 1 at 150 DPI (150 / 72) onto a dedicated canvas and return PNG data URL
        const renderFn = `async page => {
          const dataUrl = await page.evaluate(async (b64) => {
            const pdfjs = await import('/node_modules/pdfjs-dist/legacy/build/pdf.mjs');
            pdfjs.GlobalWorkerOptions.workerSrc = new URL('/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs', window.location.origin).toString();
            const bin = atob(b64);
            const bytes = new Uint8Array(bin.length);
            for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
            const pdf = await pdfjs.getDocument({ data: bytes }).promise;
            const pdfPage = await pdf.getPage(1);
            const scale = 150 / 72;
            const viewport = pdfPage.getViewport({ scale });
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(viewport.width);
            canvas.height = Math.round(viewport.height);
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            await pdfPage.render({ canvasContext: ctx, viewport }).promise;
            return '__PNG_START__' + JSON.stringify({
              width: canvas.width,
              height: canvas.height,
              pngBase64: canvas.toDataURL('image/png').replace(/^data:image\\/png;base64,/, '')
            }) + '__PNG_END__';
          }, ${JSON.stringify(pdfBase64)});
          return dataUrl;
        }`;

        const rawOut = runCli(
          `playwright-cli -s=golden run-code ${JSON.stringify(renderFn.replace(/\n+/g, ' '))}`,
        );
        const sIdx = rawOut.indexOf('__PNG_START__');
        const eIdx = rawOut.indexOf('__PNG_END__');
        assert.ok(
          sIdx !== -1 && eIdx !== -1,
          `Failed to extract PNG from browser for ${key}: ${rawOut.slice(0, 250)}`,
        );
        let payloadStr = rawOut.slice(sIdx + '__PNG_START__'.length, eIdx);
        if (payloadStr.includes('\\"')) {
          payloadStr = JSON.parse(`"${payloadStr}"`);
        }
        const rendered = JSON.parse(payloadStr) as {
          width: number;
          height: number;
          pngBase64: string;
        };

        if (UPDATE_GOLDENS || !fs.existsSync(goldenFile)) {
          const buf = Buffer.from(rendered.pngBase64, 'base64');
          fs.writeFileSync(goldenFile, buf);
          console.log(
            `Updated golden raster: ${key}.png (${rendered.width}x${rendered.height}, ${(buf.length / 1024).toFixed(1)} KB)`,
          );
          verifiedCount++;
          continue;
        }

        const expectedPngBase64 = fs
          .readFileSync(goldenFile)
          .toString('base64');

        // Fast exact check first: if PNG bytes match 100%, 0.0000% pixel diff!
        if (rendered.pngBase64 === expectedPngBase64) {
          console.log(`✓ Golden match: ${key}.png (0.0000% diff)`);
          verifiedCount++;
          continue;
        }

        // Otherwise decode both PNGs in browser canvas and compute pixel diff ratio
        const diffFn = `async page => {
          const ratio = await page.evaluate(async ({ actualB64, expectedB64 }) => {
            const loadImg = (b64) => new Promise((resolve, reject) => {
              const img = new Image();
              img.onload = () => resolve(img);
              img.onerror = reject;
              img.src = 'data:image/png;base64,' + b64;
            });
            const [imgA, imgB] = await Promise.all([loadImg(actualB64), loadImg(expectedB64)]);
            if (imgA.width !== imgB.width || imgA.height !== imgB.height) return '__DIFF__1__END__';
            const cA = document.createElement('canvas');
            cA.width = imgA.width;
            cA.height = imgA.height;
            const ctxA = cA.getContext('2d');
            ctxA.drawImage(imgA, 0, 0);
            const dataA = ctxA.getImageData(0, 0, cA.width, cA.height).data;

            const cB = document.createElement('canvas');
            cB.width = imgB.width;
            cB.height = imgB.height;
            const ctxB = cB.getContext('2d');
            ctxB.drawImage(imgB, 0, 0);
            const dataB = ctxB.getImageData(0, 0, cB.width, cB.height).data;

            let diffPixels = 0;
            const totalPixels = cA.width * cA.height;
            for (let i = 0; i < dataA.length; i += 4) {
              if (
                Math.abs(dataA[i] - dataB[i]) > 8 ||
                Math.abs(dataA[i + 1] - dataB[i + 1]) > 8 ||
                Math.abs(dataA[i + 2] - dataB[i + 2]) > 8
              ) {
                diffPixels++;
              }
            }
            return '__DIFF__' + String(diffPixels / totalPixels) + '__END__';
          }, { actualB64: ${JSON.stringify(rendered.pngBase64)}, expectedB64: ${JSON.stringify(expectedPngBase64)} });
          return ratio;
        }`;

        const diffOut = runCli(
          `playwright-cli -s=golden run-code ${JSON.stringify(diffFn.replace(/\n+/g, ' '))}`,
        );
        const ds = diffOut.indexOf('__DIFF__');
        const de = diffOut.indexOf('__END__');
        const diffRatio = Number(diffOut.slice(ds + '__DIFF__'.length, de));
        assert.ok(
          diffRatio < 0.001,
          `Golden raster mismatch for ${key}.png: ${(diffRatio * 100).toFixed(4)}% pixel diff (threshold < 0.1%). Run 'npm run test:golden -- -u' to update.`,
        );
        console.log(
          `✓ Golden match: ${key}.png (${(diffRatio * 100).toFixed(4)}% diff)`,
        );
        verifiedCount++;
      }
    }

    console.log(
      `✓ All ${verifiedCount} golden template PDF rasters verified at 150 DPI.`,
    );
  } finally {
    try {
      runCli(`playwright-cli -s=golden close`);
    } catch {
      // Ignore close error
    }
  }
}

runGoldenSuite().catch((err) => {
  console.error('Golden test suite failed:', err);
  process.exit(1);
});
