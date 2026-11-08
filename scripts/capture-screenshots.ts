import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.CEVIN_URL || 'http://localhost:3000';
const DOCS_SCREENSHOTS_DIR = path.resolve(process.cwd(), 'docs/screenshots');
const PUBLIC_SCREENSHOTS_DIR = path.resolve(process.cwd(), 'public/screenshots');
const ARTIFACTS_SCREENSHOTS_DIR = path.resolve(
  process.cwd(),
  '.aistudio/artifacts/computer_use',
);
const BRAIN_ARTIFACTS_DIR =
  '/.aistudio/artifacts/brain/de69a711-da81-4138-8a38-f52f4eaf6658';

const SCREENS = [
  {
    name: '01_applications_screen.png',
    route: '/applications',
    checkAboveFoldScoreRow: true,
    checkAutoGrow: false,
  },
  {
    name: '02_studio_job_step.png',
    route: '/applications/app-kestrel-infra/studio/resume/job',
    checkAboveFoldScoreRow: false,
    checkAutoGrow: true,
  },
  {
    name: '03_studio_resume_build.png',
    route: '/applications/app-kestrel-infra/studio/resume/build',
    checkAboveFoldScoreRow: false,
    checkAutoGrow: true,
  },
  {
    name: '04_studio_cover_letter_write.png',
    route: '/applications/app-kestrel-infra/studio/cover-letter/write',
    checkAboveFoldScoreRow: false,
    checkAutoGrow: true,
  },
  {
    name: '05_studio_review_export.png',
    route: '/applications/app-kestrel-infra/studio/resume/review',
    checkAboveFoldScoreRow: false,
    checkAutoGrow: false,
  },
  {
    name: '06_experience_bank_screen.png',
    route: '/bank',
    checkAboveFoldScoreRow: false,
    checkAutoGrow: false,
  },
  {
    name: '07_settings_screen.png',
    route: '/settings',
    checkAboveFoldScoreRow: false,
    checkAutoGrow: false,
  },
  {
    name: '08_design_system_screen.png',
    route: '/design-system',
    checkAboveFoldScoreRow: false,
    checkAutoGrow: false,
  },
];

function run(cmd: string) {
  execSync(cmd, { stdio: 'inherit' });
}

function main() {
  const dirs = [
    DOCS_SCREENSHOTS_DIR,
    PUBLIC_SCREENSHOTS_DIR,
    ARTIFACTS_SCREENSHOTS_DIR,
  ];
  if (fs.existsSync(BRAIN_ARTIFACTS_DIR)) {
    dirs.push(BRAIN_ARTIFACTS_DIR);
  }

  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
    for (const entry of fs.readdirSync(dir)) {
      if (entry.endsWith('.png')) {
        fs.unlinkSync(path.join(dir, entry));
      }
    }
  }

  run(`playwright-cli -s=shots open ${BASE_URL}`);
  run(`playwright-cli -s=shots resize 1440 900`);
  run(
    `playwright-cli -s=shots run-code "async page => { await page.emulateMedia({ reducedMotion: 'reduce' }); await page.evaluate(async () => { const dbs = await indexedDB.databases(); for (const dbInfo of dbs) { if (!dbInfo.name) continue; await new Promise((resolve) => { const req = indexedDB.open(dbInfo.name); req.onsuccess = () => { const db = req.result; const names = Array.from(db.objectStoreNames); if (names.length === 0) { db.close(); resolve(true); return; } const tx = db.transaction(names, 'readwrite'); for (const n of names) tx.objectStore(n).clear(); tx.oncomplete = () => { db.close(); resolve(true); }; tx.onerror = () => { db.close(); resolve(false); }; }; req.onerror = () => resolve(false); }); } }); await page.reload(); await page.waitForTimeout(1000); }"`,
  );

  for (const screen of SCREENS) {
    const url = `${BASE_URL}${screen.route}`;
    const artifactOut = path.join(ARTIFACTS_SCREENSHOTS_DIR, screen.name);
    const docsOut = path.join(DOCS_SCREENSHOTS_DIR, screen.name);
    const publicOut = path.join(PUBLIC_SCREENSHOTS_DIR, screen.name);

    run(`playwright-cli -s=shots goto ${url}`);
    run(
      `playwright-cli -s=shots run-code "async page => { await page.evaluate(() => document.fonts.ready); await page.waitForTimeout(900); }"`,
    );

    if (screen.checkAboveFoldScoreRow) {
      run(
        `playwright-cli -s=shots run-code "async page => { const el = page.locator('[data-testid=\\"detail-score-row\\"]'); const box = await el.boundingBox(); if (!box || box.y + box.height > 900) { throw new Error('Detail score row is below the 900px fold: ' + JSON.stringify(box)); } }"`,
      );
    }

    if (screen.checkAutoGrow) {
      run(
        `playwright-cli -s=shots run-code "async page => { const cropped = await page.evaluate(() => { const areas = Array.from(document.querySelectorAll('textarea[data-autogrow=\\"true\\"]')); return areas.filter(a => a.scrollHeight > a.clientHeight + 2).map(a => ({ value: a.value.slice(0, 40), scrollHeight: a.scrollHeight, clientHeight: a.clientHeight })); }); if (cropped.length > 0) { throw new Error('Cropped AutoGrowTextarea found: ' + JSON.stringify(cropped)); } }"`,
      );
    }

    run(`playwright-cli -s=shots screenshot --filename=${artifactOut}`);
    fs.copyFileSync(artifactOut, docsOut);
    fs.copyFileSync(artifactOut, publicOut);
    if (fs.existsSync(BRAIN_ARTIFACTS_DIR)) {
      fs.copyFileSync(artifactOut, path.join(BRAIN_ARTIFACTS_DIR, screen.name));
    }
    console.log(`✓ Captured ${screen.name}`);
  }

  // Also capture dark-theme Studio Build and 2560x1440 Studio Review
  const darkBuildOut = path.join(
    ARTIFACTS_SCREENSHOTS_DIR,
    '09_studio_resume_build_dark.png',
  );
  run(
    `playwright-cli -s=shots goto ${BASE_URL}/applications/app-kestrel-infra/studio/resume/build`,
  );
  run(
    `playwright-cli -s=shots run-code "async page => { await page.evaluate(() => { document.documentElement.classList.add('dark'); return document.fonts.ready; }); await page.waitForTimeout(900); }"`,
  );
  run(`playwright-cli -s=shots screenshot --filename=${darkBuildOut}`);
  fs.copyFileSync(
    darkBuildOut,
    path.join(DOCS_SCREENSHOTS_DIR, '09_studio_resume_build_dark.png'),
  );

  run(`playwright-cli -s=shots resize 2560 1440`);
  const wideReviewOut = path.join(
    ARTIFACTS_SCREENSHOTS_DIR,
    '10_studio_review_2560.png',
  );
  run(
    `playwright-cli -s=shots goto ${BASE_URL}/applications/app-kestrel-infra/studio/resume/review`,
  );
  run(
    `playwright-cli -s=shots run-code "async page => { await page.evaluate(() => { document.documentElement.classList.remove('dark'); return document.fonts.ready; }); await page.waitForTimeout(900); }"`,
  );
  run(`playwright-cli -s=shots screenshot --filename=${wideReviewOut}`);
  fs.copyFileSync(
    wideReviewOut,
    path.join(DOCS_SCREENSHOTS_DIR, '10_studio_review_2560.png'),
  );

  run(`playwright-cli -s=shots close`);
}

main();
