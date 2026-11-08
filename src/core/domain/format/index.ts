import { DocumentKind } from '../entities';
export { formatContactBlock } from '../bulletAssembler';

const IRREGULAR_PLURALS: Record<string, string> = {
  entry: 'entries',
  company: 'companies',
  category: 'categories',
  country: 'countries',
  city: 'cities',
  status: 'statuses',
  match: 'matches',
  fix: 'fixes',
  pass: 'passes',
  person: 'people',
};

/**
 * Formats a count with a properly pluralized noun (`1 achievement`, `2 achievements`, `0 gaps`).
 * Eliminates hardcoded plural "s" in UI copy.
 */
export function formatCount(
  n: number,
  singularNoun: string,
  pluralOverride?: string,
): string {
  const count = Number.isFinite(n) ? Math.abs(Math.trunc(n)) : 0;
  if (count === 1) {
    return `${n} ${singularNoun}`;
  }
  if (pluralOverride) {
    return `${n} ${pluralOverride}`;
  }
  const lower = singularNoun.toLowerCase();
  if (IRREGULAR_PLURALS[lower]) {
    const mapped = IRREGULAR_PLURALS[lower];
    const preserveCase =
      singularNoun[0] === singularNoun[0]?.toUpperCase() &&
      singularNoun[0] !== singularNoun[0]?.toLowerCase()
        ? mapped[0].toUpperCase() + mapped.slice(1)
        : mapped;
    return `${n} ${preserveCase}`;
  }
  if (/(?:s|x|z|ch|sh)$/i.test(singularNoun)) {
    return `${n} ${singularNoun}es`;
  }
  if (/[^aeiou]y$/i.test(singularNoun)) {
    return `${n} ${singularNoun.slice(0, -1)}ies`;
  }
  return `${n} ${singularNoun}s`;
}

/**
 * Sanitizes a token (person name or company name) into Unicode-safe underscore words.
 */
function sanitizeTokenSegment(raw: string, fallback: string): string {
  const cleaned = raw
    .trim()
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  return cleaned || fallback;
}

/**
 * Builds the canonical export filename:
 * - `First_Last_Company_Resume.pdf`
 * - `First_Last_Company_Cover_Letter.pdf`
 * Supports custom extensions (`pdf`, `md`, `txt`).
 */
export function exportFilename(params: {
  fullName: string;
  company: string;
  kind?: DocumentKind;
  extension?: string;
}): string {
  const nameSegment = sanitizeTokenSegment(params.fullName, 'Candidate');
  const companySegment = sanitizeTokenSegment(params.company, 'Application');
  const docSuffix =
    params.kind === 'coverLetter' ? 'Cover_Letter' : 'Resume';
  const ext = (params.extension ?? 'pdf').replace(/^\.+/, '').toLowerCase() || 'pdf';
  return `${nameSegment}_${companySegment}_${docSuffix}.${ext}`;
}

/**
 * Sanitizes a user-edited filename from the Export popover while preserving the target extension.
 */
export function sanitizeExportFilenameInput(
  rawInput: string,
  expectedExtension = 'pdf',
): string {
  const ext = expectedExtension.replace(/^\.+/, '').toLowerCase() || 'pdf';
  const trimmed = rawInput.trim();
  const withoutExt = trimmed.replace(new RegExp(`\\.${ext}$`, 'i'), '');
  const base = withoutExt
    .replace(/['’`]/g, '')
    .replace(/[^\p{L}\p{N}._-]+/gu, '_')
    .replace(/^[_.-]+|[_.-]+$/g, '')
    .replace(/_+/g, '_');
  return `${base || 'Document'}.${ext}`;
}
