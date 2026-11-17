import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function collectFiles(
  dir: string,
  predicate: (rel: string, name: string) => boolean,
): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (
      entry.name === 'node_modules' ||
      entry.name === 'dist' ||
      entry.name === '.git' ||
      entry.name === '.venv' ||
      entry.name === '.aistudio' ||
      entry.name === '.playwright-cli'
    ) {
      continue;
    }
    const full = path.join(dir, entry.name);
    const rel = path.relative(ROOT, full).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      out.push(...collectFiles(full, predicate));
    } else if (predicate(rel, entry.name)) {
      out.push(rel);
    }
  }
  return out;
}

function githubSlug(heading: string): string {
  return heading
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, '')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function collectAnchors(mdText: string): Set<string> {
  const anchors = new Set<string>();
  const counts = new Map<string, number>();
  let inCode = false;
  for (const line of mdText.split(/\r?\n/)) {
    if (/^```/.test(line.trim())) {
      inCode = !inCode;
      continue;
    }
    if (inCode) continue;
    const m = /^#{1,6}\s+(.+?)\s*$/.exec(line);
    if (m) {
      const base = githubSlug(m[1]);
      const n = counts.get(base) ?? 0;
      counts.set(base, n + 1);
      anchors.add(n === 0 ? base : `${base}-${n}`);
    }
    const idMatches = line.matchAll(/\sid=["']([^"']+)["']/g);
    for (const idm of idMatches) anchors.add(idm[1]);
  }
  return anchors;
}

function auditMarkdownLinks(mdFiles: string[]) {
  const anchorCache = new Map<string, Set<string>>();
  const getAnchors = (relPath: string) => {
    if (!anchorCache.has(relPath)) {
      const txt = fs.readFileSync(path.join(ROOT, relPath), 'utf8');
      anchorCache.set(relPath, collectAnchors(txt));
    }
    return anchorCache.get(relPath)!;
  };

  for (const rel of mdFiles) {
    const abs = path.join(ROOT, rel);
    const dir = path.dirname(abs);
    const txt = fs.readFileSync(abs, 'utf8');

    // Strip fenced code blocks
    const cleanLines: string[] = [];
    let inCode = false;
    for (const line of txt.split(/\r?\n/)) {
      if (/^```/.test(line.trim())) {
        inCode = !inCode;
        continue;
      }
      if (!inCode) cleanLines.push(line);
    }
    const clean = cleanLines.join('\n');

    // 1. Markdown links & images: [label](target)
    for (const m of clean.matchAll(/!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
      const target = m[1];
      if (
        target.startsWith('http://') ||
        target.startsWith('https://') ||
        target.startsWith('mailto:')
      ) {
        continue;
      }
      if (target.startsWith('#')) {
        const anchor = target.slice(1);
        const anchors = getAnchors(rel);
        assert.ok(
          anchors.has(anchor),
          `${rel}: broken self anchor "#${anchor}"`,
        );
        continue;
      }
      const [filePart, anchorPart] = target.split('#');
      const targetAbs = path.resolve(dir, filePart);
      assert.ok(
        fs.existsSync(targetAbs),
        `${rel}: broken relative link/image "${target}"`,
      );
      if (anchorPart && filePart.endsWith('.md')) {
        const targetRel = path.relative(ROOT, targetAbs).replace(/\\/g, '/');
        const anchors = getAnchors(targetRel);
        assert.ok(
          anchors.has(anchorPart),
          `${rel}: broken anchor "#${anchorPart}" in "${filePart}"`,
        );
      }
    }

    // 2. HTML <img src="..."> or <source srcset="...">
    for (const m of clean.matchAll(/(?:src|srcset)=["']([^"']+)["']/g)) {
      const target = m[1];
      if (target.startsWith('http://') || target.startsWith('https://')) {
        continue;
      }
      const targetAbs = path.resolve(dir, target);
      assert.ok(
        fs.existsSync(targetAbs),
        `${rel}: broken HTML asset reference "${target}"`,
      );
    }
  }
}

function auditReadme() {
  const readmePath = path.join(ROOT, 'README.md');
  assert.ok(fs.existsSync(readmePath), 'README.md must exist');
  const raw = fs.readFileSync(readmePath, 'utf8');
  const lines = raw.split(/\r?\n/);
  assert.ok(
    lines.length <= 220,
    `README.md has ${lines.length} lines (must be <= 220 lines)`,
  );

  // Check zero banned implementation/codename/hype terms in README.md
  const bannedReadmeTerms = [
    /\bDesk,\s*Paper\s*&?\s*Ink\b/i,
    /\bScalable\s+Job\s+Facts\b/i,
    /\bAttentionToken\b/,
    /\bFitStrip\b/,
    /\bLoRA\b/i,
    /\bChain-of-Thought\b/i,
    /\bmask_prompt\b/,
    /\bDexie\b/i,
    /\bhexagonal\b/i,
    /\b10x\b/i,
    /\bbeat\s+ATS\b/i,
    /\bguarantee(?:s|d)?\s+interviews\b/i,
  ];
  for (const rx of bannedReadmeTerms) {
    assert.equal(
      rx.test(raw),
      false,
      `README.md contains forbidden jargon/hype matching ${rx}`,
    );
  }

  // Sentence length check (prose paragraphs & list bullets <= 20 words/sentence)
  let inCode = false;
  const longSentences: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/^```/.test(line)) {
      inCode = !inCode;
      continue;
    }
    if (
      inCode ||
      !line ||
      line.startsWith('#') ||
      line.startsWith('|') ||
      line.startsWith('<') ||
      line.startsWith('![') ||
      line.startsWith('---') ||
      line.startsWith('<!--')
    ) {
      continue;
    }
    // Strip markdown links/bold/code formatting before counting words
    const plain = line
      .replace(/^[-*]\s+/, '')
      .replace(/^\d+\.\s+/, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/`[^`]+`/g, 'command')
      .replace(/[*_~]/g, '');
    const sentences = plain
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const s of sentences) {
      const words = s.split(/\s+/).filter(Boolean);
      if (words.length > 20) {
        longSentences.push(`L${i + 1} (${words.length}w): ${s}`);
      }
    }
  }
  assert.equal(
    longSentences.length,
    0,
    `README.md has sentences exceeding 20 words:\n${longSentences.join('\n')}`,
  );

  // Asset size checks for images referenced in README.md (Markdown and HTML img tags)
  const imageTargets = [
    ...Array.from(raw.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)).map((m) => m[1]),
    ...Array.from(raw.matchAll(/<img[^>]+src=["']([^"']+)["']/g)).map((m) => m[1]),
  ];
  for (const target of imageTargets) {
    if (target.startsWith('http')) continue;
    const abs = path.resolve(ROOT, target);
    const bytes = fs.statSync(abs).size;
    if (target.endsWith('.gif')) {
      assert.ok(
        bytes <= 5 * 1024 * 1024,
        `${target} is ${(bytes / 1024 / 1024).toFixed(2)} MB (limit 5 MB)`,
      );
    } else if (target.endsWith('.png')) {
      assert.ok(
        bytes <= 300 * 1024,
        `${target} is ${(bytes / 1024).toFixed(1)} KB (README PNG limit 300 KB)`,
      );
    }
  }

  for (const requiredAsset of [
    'docs/assets/logo-light.svg',
    'docs/assets/logo-dark.svg',
    'docs/assets/demo.gif',
    'docs/assets/social-preview.png',
  ]) {
    assert.ok(
      fs.existsSync(path.join(ROOT, requiredAsset)),
      `Missing required visual asset: ${requiredAsset}`,
    );
  }
}

function auditRepoSafety() {
  // Forbidden words & PII across documentation, fixtures, and sample data
  const textTargets = collectFiles(
    ROOT,
    (rel) =>
      rel === 'README.md' ||
      rel === 'CONTRIBUTING.md' ||
      rel.startsWith('docs/') ||
      rel.startsWith('data/sample/') ||
      rel.startsWith('src/tests/fixtures/'),
  );
  const forbidden = new RegExp(
    [
      'oll' + 'ama',
      'Google\\s+Docs',
      'CV\\s*\\+\\s*Kevin',
      '\\bKevin\\b',
      'Carlos\\s+Garcia',
      '438-304',
      '304-0025',
      'AlayaCare',
      'Genpact',
      'Concordia\\s+University',
      '@gmail\\.com',
    ].join('|'),
    'i',
  );
  for (const rel of textTargets) {
    if (!/\.(md|json|jsonl)$/i.test(rel)) continue;
    const content = fs.readFileSync(path.join(ROOT, rel), 'utf8');
    const match = forbidden.exec(content);
    assert.equal(
      match,
      null,
      `Forbidden or PII string "${match?.[0]}" found in ${rel}`,
    );
  }

  // Ensure no model weight files or private datasets exist in workspace root
  const dangerous = collectFiles(ROOT, (rel, name) => {
    if (
      /\.(safetensors|gguf|npz|pth)$/i.test(name) ||
      rel.startsWith('cevin-1.5b-4bit-fused/') ||
      rel.startsWith('cevin-3b-4bit-fused/') ||
      rel.startsWith('data/private/') ||
      rel.startsWith('training_data/')
    ) {
      return true;
    }
    if (name.endsWith('.jsonl') && !rel.startsWith('data/sample/')) {
      return true;
    }
    return false;
  });
  assert.deepEqual(
    dangerous,
    [],
    `Model weight or private data artifacts found in repo: ${dangerous.join(', ')}`,
  );
}

function main() {
  const mdFiles = collectFiles(
    ROOT,
    (rel) =>
      rel === 'README.md' ||
      rel === 'CONTRIBUTING.md' ||
      (rel.startsWith('docs/') && rel.endsWith('.md')),
  );
  auditMarkdownLinks(mdFiles);
  auditReadme();
  auditRepoSafety();
  console.log(
    `✓ Verified ${mdFiles.length} Markdown files (links, anchors, asset sizes, README line/sentence budgets, PII, and weight exclusions).`,
  );
}

main();
