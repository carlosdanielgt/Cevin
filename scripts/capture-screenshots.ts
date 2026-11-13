import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.CEVIN_URL || 'http://localhost:3000';
const DOCS_SCREENSHOTS_DIR = path.resolve(process.cwd(), 'docs/screenshots');
const PUBLIC_SCREENSHOTS_DIR = path.resolve(process.cwd(), 'public/screenshots');
const PUBLIC_AISTUDIO_DIR = path.resolve(
  process.cwd(),
  'public/assets/aistudio',
);
const ARTIFACTS_SCREENSHOTS_DIR = path.resolve(
  process.cwd(),
  '.aistudio/artifacts/computer_use',
);
const BRAIN_ARTIFACTS_DIR =
  '/.aistudio/artifacts/brain/de69a711-da81-4138-8a38-f52f4eaf6658';

function runCli(args: string[]) {
  execFileSync('playwright-cli', args, { stdio: 'inherit' });
}

function cleanDirPngs(dir: string) {
  if (!fs.existsSync(dir)) return;
  for (const entry of fs.readdirSync(dir)) {
    if (entry.endsWith('.png') || entry.endsWith('.jpg')) {
      fs.unlinkSync(path.join(dir, entry));
    }
  }
}

function main() {
  fs.mkdirSync(DOCS_SCREENSHOTS_DIR, { recursive: true });
  cleanDirPngs(DOCS_SCREENSHOTS_DIR);
  cleanDirPngs(PUBLIC_SCREENSHOTS_DIR);
  if (fs.existsSync(PUBLIC_SCREENSHOTS_DIR)) {
    fs.rmSync(PUBLIC_SCREENSHOTS_DIR, { recursive: true, force: true });
  }
  cleanDirPngs(PUBLIC_AISTUDIO_DIR);
  if (fs.existsSync(PUBLIC_AISTUDIO_DIR)) {
    fs.rmSync(PUBLIC_AISTUDIO_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(ARTIFACTS_SCREENSHOTS_DIR, { recursive: true });
  cleanDirPngs(ARTIFACTS_SCREENSHOTS_DIR);
  if (fs.existsSync(BRAIN_ARTIFACTS_DIR)) {
    cleanDirPngs(BRAIN_ARTIFACTS_DIR);
  }

  runCli(['-s=shots', 'open', BASE_URL]);

  const scriptPayload = `async page => {
    const baseUrl = ${JSON.stringify(BASE_URL)};
    const outDir = ${JSON.stringify(DOCS_SCREENSHOTS_DIR)};

    await page.emulateMedia({ reducedMotion: 'reduce' });

    const setTheme = async (theme) => {
      await page.evaluate((t) => {
        if (t === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }, theme);
      await page.waitForTimeout(120);
    };

    const waitReady = async (ms = 650) => {
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(ms);
    };

    const snap = async (filename) => {
      const fullPath = outDir + '/' + filename;
      await page.screenshot({ path: fullPath });
      console.log('✓ Captured ' + filename);
    };

    await page.setViewportSize({ width: 1440, height: 900 });
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
    await page.reload();
    await waitReady(900);

    const scoreRow = page.locator('[data-testid="detail-score-row"]');
    const box = await scoreRow.boundingBox();
    if (!box || box.y + box.height > 900) {
      throw new Error('Detail score row is below the 900px fold: ' + JSON.stringify(box));
    }

    await setTheme('light');
    await snap('01-applications-list-light-1440x900.png');
    await setTheme('dark');
    await snap('02-applications-list-dark-1440x900.png');
    await page.setViewportSize({ width: 2560, height: 1440 });
    await setTheme('light');
    await waitReady(350);
    await snap('03-applications-list-light-2560x1440.png');

    await page.setViewportSize({ width: 1440, height: 900 });
    await waitReady(250);
    const newAppBtn = page.getByRole('button', { name: /New application/i }).first();
    if (await newAppBtn.isVisible()) {
      await newAppBtn.click();
      await waitReady(400);
      await snap('28-quick-check-dialog-light-1440x900.png');
      await page.keyboard.press('Escape');
      await waitReady(200);
    }

    await page.goto(baseUrl + '/bank');
    await waitReady(600);
    await setTheme('light');
    await snap('06-bank-experience-light-1440x900.png');
    await setTheme('dark');
    await snap('07-bank-experience-dark-1440x900.png');
    await setTheme('light');

    const clickBankTab = async (label, filename) => {
      const tab = page.getByRole('tab', { name: new RegExp('^' + label, 'i') }).first();
      if (await tab.isVisible()) {
        await tab.click();
        await waitReady(350);
      }
      await snap(filename);
    };
    await clickBankTab('Skills', '08-bank-skills-light-1440x900.png');
    await clickBankTab('Projects', '09-bank-projects-light-1440x900.png');
    await clickBankTab('Education', '10-bank-education-light-1440x900.png');
    await clickBankTab('Certifications', '11-bank-certifications-light-1440x900.png');
    await clickBankTab('Contact', '12-bank-contact-light-1440x900.png');

    await page.goto(baseUrl + '/settings');
    await waitReady(600);
    await setTheme('light');
    await snap('13-settings-preferences-light-1440x900.png');

    const clickSettingsTab = async (label) => {
      const btn = page.getByRole('button', { name: new RegExp(label, 'i') }).first();
      if (await btn.isVisible()) {
        await btn.click();
        await waitReady(350);
      }
    };

    await clickSettingsTab('AI connection');
    const demoCard = page.getByText('Demo mode').first();
    if (await demoCard.isVisible()) {
      await demoCard.click();
      await waitReady(450);
    }
    await snap('14-settings-ai-connected-light-1440x900.png');

    const cevinCard = page.getByText('Cevin model (on this Mac)').first();
    if (await cevinCard.isVisible()) {
      await cevinCard.click();
      await waitReady(550);
      await snap('15-settings-ai-unreachable-light-1440x900.png');
      if (await demoCard.isVisible()) {
        await demoCard.click();
        await waitReady(350);
      }
    }

    await clickSettingsTab('Performance');
    await snap('16-settings-performance-light-1440x900.png');

    await clickSettingsTab('Appearance');
    await setTheme('dark');
    await snap('17-settings-appearance-dark-1440x900.png');
    await setTheme('light');

    await page.goto(baseUrl + '/applications/app-kestrel-infra/studio/resume/job');
    await waitReady(750);
    await snap('18-studio-job-light-1440x900.png');

    await page.goto(baseUrl + '/applications/app-kestrel-infra/studio/resume/build');
    await waitReady(800);
    await snap('19-studio-resume-build-light-1440x900.png');
    await setTheme('dark');
    await snap('20-studio-resume-build-dark-1440x900.png');
    await setTheme('light');
    await page.setViewportSize({ width: 2560, height: 1440 });
    await waitReady(450);
    await snap('21-studio-resume-build-light-2560x1440.png');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(baseUrl + '/applications/app-kestrel-infra/studio/cover-letter/write');
    await waitReady(800);
    await snap('22-studio-letter-write-light-1440x900.png');
    await setTheme('dark');
    await snap('23-studio-letter-write-dark-1440x900.png');
    await setTheme('light');

    await page.goto(baseUrl + '/applications/app-kestrel-infra/studio/resume/review');
    await waitReady(800);
    await snap('24-studio-resume-review-light-1440x900.png');
    await setTheme('dark');
    await snap('25-studio-resume-review-dark-1440x900.png');
    await setTheme('light');
    await page.setViewportSize({ width: 2560, height: 1440 });
    await waitReady(450);
    await snap('26-studio-resume-review-light-2560x1440.png');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(baseUrl + '/applications/app-kestrel-infra/studio/cover-letter/review');
    await waitReady(800);
    await snap('27-studio-letter-review-light-1440x900.png');

    await page.goto(baseUrl + '/design-system');
    await waitReady(600);
    await setTheme('light');
    await snap('29-design-system-light-1440x900.png');
    await setTheme('dark');
    await snap('30-design-system-dark-1440x900.png');
    await setTheme('light');
    await page.setViewportSize({ width: 2560, height: 1440 });
    await waitReady(350);
    await snap('31-design-system-light-2560x1440.png');

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(async () => {
      const dbs = await indexedDB.databases();
      for (const dbInfo of dbs) {
        if (!dbInfo.name) continue;
        await new Promise((resolve) => {
          const req = indexedDB.open(dbInfo.name);
          req.onsuccess = () => {
            const db = req.result;
            if (db.objectStoreNames.contains('applications')) {
              const tx = db.transaction(['applications'], 'readwrite');
              tx.objectStore('applications').clear();
              tx.oncomplete = () => { db.close(); resolve(true); };
              tx.onerror = () => { db.close(); resolve(false); };
            } else {
              db.close();
              resolve(true);
            }
          };
          req.onerror = () => resolve(false);
        });
      }
    });
    await page.goto(baseUrl + '/applications');
    await waitReady(600);
    await setTheme('light');
    await snap('04-applications-empty-light-1440x900.png');
    await setTheme('dark');
    await snap('05-applications-empty-dark-1440x900.png');
    await setTheme('light');
  }`;

  runCli(['-s=shots', 'run-code', scriptPayload]);
  runCli(['-s=shots', 'close']);
}

main();
