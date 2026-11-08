import fs from 'node:fs';
import path from 'node:path';

const SRC_DIR = path.resolve(process.cwd(), 'src');

function walkFiles(dir: string): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(fullPath));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

function extractImports(content: string): string[] {
  const imports: string[] = [];
  const regex =
    /(?:import|export)\s+(?:type\s+)?(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(content)) !== null) {
    const spec = match[1] || match[2];
    if (spec) imports.push(spec);
  }
  return imports;
}

const allFiles = walkFiles(SRC_DIR);
const violations: string[] = [];

// 1. Enforce single CSS file rule
const cssFiles = allFiles.filter((f) => f.endsWith('.css'));
if (
  cssFiles.length !== 1 ||
  path.relative(SRC_DIR, cssFiles[0]) !== 'index.css'
) {
  violations.push(
    `[CSS Rule] Expected only src/index.css, found: ${cssFiles.map((f) => path.relative(SRC_DIR, f)).join(', ')}`,
  );
}

for (const filePath of allFiles) {
  if (!filePath.endsWith('.ts') && !filePath.endsWith('.tsx')) continue;

  const relFile = path.relative(SRC_DIR, filePath).replace(/\\/g, '/');
  const content = fs.readFileSync(filePath, 'utf-8');

  // 2. Enforce zero inline `style=` prop in JSX
  if (filePath.endsWith('.tsx') && /\bstyle\s*=\s*\{/.test(content)) {
    violations.push(
      `[No-Inline-Style Rule] Forbidden inline style={...} prop in src/${relFile}`,
    );
  }

  // 3. Enforce no explicit `any` type
  if (
    !relFile.startsWith('tests/') &&
    (/:\s*any\b/.test(content) || /<\s*any\s*>/.test(content) || /\bas\s+any\b/.test(content))
  ) {
    violations.push(
      `[No-Any Rule] Forbidden explicit 'any' type found in src/${relFile}`,
    );
  }

  // Skip test files for hexagonal production layer boundaries
  if (relFile.startsWith('tests/')) continue;

  const imports = extractImports(content);
  for (const imp of imports) {
    if (!imp.startsWith('.')) continue;
    const resolved = path
      .relative(SRC_DIR, path.resolve(path.dirname(filePath), imp))
      .replace(/\\/g, '/');

    // Rule A: core/domain imports nothing outside core/domain
    if (relFile.startsWith('core/domain/')) {
      if (!resolved.startsWith('core/domain')) {
        violations.push(
          `[Hexagonal Boundary] src/${relFile} (core/domain) cannot import src/${resolved}`,
        );
      }
    }

    // Rule B: core/application imports core/domain or core/application only
    if (relFile.startsWith('core/application/')) {
      if (
        !resolved.startsWith('core/domain') &&
        !resolved.startsWith('core/application')
      ) {
        violations.push(
          `[Hexagonal Boundary] src/${relFile} (core/application) cannot import src/${resolved}`,
        );
      }
    }

    // Rule C: adapters/driven/* import core/* and their own adapter subfolder only
    if (relFile.startsWith('adapters/driven/')) {
      const adapterGroup = relFile.split('/').slice(0, 3).join('/');
      const isCore =
        resolved.startsWith('core/domain') ||
        resolved.startsWith('core/application');
      const isSameDrivenAdapter = resolved.startsWith(adapterGroup);
      if (!isCore && !isSameDrivenAdapter) {
        violations.push(
          `[Hexagonal Boundary] src/${relFile} (${adapterGroup}) cannot import across adapters: src/${resolved}`,
        );
      }
    }

    // Rule D: adapters/driving/web never imports adapters/driven or main
    if (relFile.startsWith('adapters/driving/web/')) {
      if (
        resolved.startsWith('adapters/driven') ||
        resolved.startsWith('main')
      ) {
        violations.push(
          `[Hexagonal Boundary] src/${relFile} (driving web) cannot import driven adapter or main: src/${resolved}`,
        );
      }
    }

    // Rule E: ui/primitives.tsx imports nothing project-specific
    if (relFile === 'adapters/driving/web/ui/primitives.tsx') {
      violations.push(
        `[Design System Boundary] src/${relFile} must not import project-specific module src/${resolved}`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('Architectural & Style Lint Violations Found:');
  for (const v of violations) {
    console.error(`  - ${v}`);
  }
  process.exit(1);
} else {
  console.log(
    `✓ Hexagonal boundaries, single-entry CSS, no-any, and zero-inline-style rules verified across ${allFiles.length} files.`,
  );
}
