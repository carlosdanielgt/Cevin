import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.CEVIN_URL || 'http://localhost:3000';
const OUT_GIF = path.resolve(process.cwd(), 'docs/assets/demo.gif');
const FRAMES_DIR = path.resolve(process.cwd(), '.tmp-demo-frames');

function runCli(args: string[]) {
  execFileSync('playwright-cli', args, { stdio: 'inherit' });
}

function main() {
  fs.mkdirSync(path.dirname(OUT_GIF), { recursive: true });
  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  fs.mkdirSync(FRAMES_DIR, { recursive: true });

  runCli(['-s=demogif', 'open', BASE_URL]);

  const scriptPayload = `async page => {
    const baseUrl = ${JSON.stringify(BASE_URL)};
    const framesDir = ${JSON.stringify(FRAMES_DIR)};
    let frameIndex = 1;

    const snapFrame = async (durationSec) => {
      const name = 'frame-' + String(frameIndex++).padStart(2, '0') + '.png';
      await page.evaluate(() => document.fonts.ready);
      await page.screenshot({
        path: framesDir + '/' + name,
        timeout: 25000,
      });
      console.log('Captured ' + name);
      return { name, durationSec };
    };

    const timeline = [];
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.emulateMedia({ reducedMotion: 'reduce' });

    // 1. Reset to clean demo workspace & enable Demo mode in Settings
    await page.goto(baseUrl + '/applications');
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const dbInfo of dbs) {
        if (!dbInfo.name) continue;
        await new Promise((resolve) => {
          const req = indexedDB.open(dbInfo.name);
          req.onsuccess = () => {
            const db = req.result;
            const names = Array.from(db.objectStoreNames);
            if (names.length === 0) { db.close(); resolve(true); return; }
            const tx = db.transaction(names, 'readwrite');
            for (const n of names) tx.objectStore(n).clear();
            tx.oncomplete = () => { db.close(); resolve(true); };
            tx.onerror = () => { db.close(); resolve(false); };
          };
          req.onerror = () => resolve(false);
        });
      }
    });
    await page.goto(baseUrl + '/settings');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(500);
    const aiBtn = page.getByRole('button', { name: /AI connection/i }).first();
    if (await aiBtn.isVisible()) {
      await aiBtn.click();
      await page.waitForTimeout(250);
    }
    const demoCard = page.getByText('Demo mode').first();
    if (await demoCard.isVisible()) {
      await demoCard.click();
      await page.waitForTimeout(300);
    }

    // Step 1: Applications workspace -> open Quick check
    await page.goto(baseUrl + '/applications');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(700);
    timeline.push(await snapFrame(1.1));

    const newAppBtn = page.getByRole('button', { name: /New application/i }).first();
    await newAppBtn.click();
    await page.waitForTimeout(350);
    timeline.push(await snapFrame(0.8));

    // Step 2: Paste posting into Quick check & inspect Practical fit + Coverage
    const textarea = page.locator('#quickcheck-posting-textarea');
    await textarea.fill([
      'Staff Platform Engineer — Cobalt Grid',
      'Location: Remote (US or Canada)',
      'Compensation: $185,000 - $215,000 USD',
      'Requirements: Kubernetes, Go, Kafka, PostgreSQL, Terraform.',
      'Fluent English required. Visa sponsorship available.',
    ].join('\\n'));
    await page.waitForTimeout(600);
    timeline.push(await snapFrame(2.2));

    // Close Quick check and jump into Kestrel Pay Studio Build
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);

    // Step 3: Studio 2 Build + Voice knob
    await page.goto(baseUrl + '/applications/app-kestrel-infra/studio/resume/build');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(800);
    timeline.push(await snapFrame(1.5));

    const polishedBtn = page.getByRole('button', { name: /Polished/i }).first();
    if (await polishedBtn.isVisible()) {
      await polishedBtn.click();
      await page.waitForTimeout(550);
      timeline.push(await snapFrame(1.3));
    }
    const balancedBtn = page.getByRole('button', { name: /Balanced/i }).first();
    if (await balancedBtn.isVisible()) {
      await balancedBtn.click();
      await page.waitForTimeout(400);
    }

    // Step 4: Studio 3 Review (three scores + paper preview + Skim view)
    await page.goto(baseUrl + '/applications/app-kestrel-infra/studio/resume/review');
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(850);
    timeline.push(await snapFrame(2.0));

    const skimBtn = page.getByRole('button', { name: /Skim view/i }).first();
    if (await skimBtn.isVisible()) {
      await skimBtn.click();
      await page.waitForTimeout(450);
      timeline.push(await snapFrame(2.0));
      await skimBtn.click();
      await page.waitForTimeout(300);
    }

    // Step 5: Export Resume PDF
    const exportBtn = page.getByRole('button', { name: /Export Resume PDF/i }).first();
    if (await exportBtn.isVisible()) {
      await exportBtn.click();
      await page.waitForTimeout(500);
      timeline.push(await snapFrame(1.5));
    }

    return JSON.stringify(timeline);
  }`;

  let timeline: Array<{ name: string; durationSec: number }> = [];
  try {
    const raw = execFileSync(
      'playwright-cli',
      ['-s=demogif', 'run-code', scriptPayload],
      { encoding: 'utf8' },
    );
    const match = raw.match(/\[\{.*"durationSec":[^\]]+\}\]/);
    if (match) {
      timeline = JSON.parse(match[0]);
    }
  } finally {
    try {
      runCli(['-s=demogif', 'close']);
    } catch {
      // ignore close errors
    }
  }

  const capturedPngs = fs
    .readdirSync(FRAMES_DIR)
    .filter((f) => /^frame-\d+\.png$/.test(f))
    .sort();
  if (timeline.length === 0) {
    timeline = capturedPngs.map((name) => ({ name, durationSec: 1.5 }));
  }

  const concatPath = path.join(FRAMES_DIR, 'frames.ffconcat');
  const concatLines = ['ffconcat version 1.0'];
  for (const item of timeline) {
    concatLines.push(`file '${item.name}'`);
    concatLines.push(`duration ${item.durationSec}`);
  }
  concatLines.push(`file '${timeline[timeline.length - 1].name}'`);
  fs.writeFileSync(concatPath, `${concatLines.join('\n')}\n`, 'utf8');

  const palettePath = path.join(FRAMES_DIR, 'palette.png');
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-safe',
      '0',
      '-f',
      'concat',
      '-i',
      concatPath,
      '-vf',
      'scale=1200:750:flags=lanczos,palettegen=max_colors=128:stats_mode=diff',
      palettePath,
    ],
    { stdio: 'inherit' },
  );
  execFileSync(
    'ffmpeg',
    [
      '-y',
      '-safe',
      '0',
      '-f',
      'concat',
      '-i',
      concatPath,
      '-i',
      palettePath,
      '-lavfi',
      'scale=1200:750:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3',
      '-loop',
      '0',
      OUT_GIF,
    ],
    { stdio: 'inherit' },
  );

  fs.rmSync(FRAMES_DIR, { recursive: true, force: true });
  const stats = fs.statSync(OUT_GIF);
  const mb = stats.size / (1024 * 1024);
  console.log(`✓ Generated ${OUT_GIF} (${mb.toFixed(2)} MB)`);
  if (mb > 5) {
    throw new Error(`demo.gif exceeded 5 MB limit (${mb.toFixed(2)} MB)`);
  }
}

main();
