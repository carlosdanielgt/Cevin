import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  BulletEvaluationDtoSchema,
  CEVIN_MLX_SYSTEM_PROMPT,
  ExecutiveSummaryDtoSchema,
  ExtractedExperienceDtoSchema,
  HallucinationAuditDtoSchema,
  MLX_BULLET_REWRITE_HEADER_COMPLETE,
  MLX_BULLET_REWRITE_HEADER_PARTIAL,
  RequirementMatchDtoSchema,
} from '../src/core/application';

const SAMPLE_PATH = path.resolve(
  process.cwd(),
  'data/sample/cevin_sample.jsonl',
);

const TASK_SCHEMAS = {
  experience_extraction: ExtractedExperienceDtoSchema,
  experience_matching: RequirementMatchDtoSchema,
  hallucination_audit: HallucinationAuditDtoSchema,
  bullet_evaluation_and_rewrite: BulletEvaluationDtoSchema,
  executive_summary_synthesis: ExecutiveSummaryDtoSchema,
} as const;

type TaskName = keyof typeof TASK_SCHEMAS;

function main() {
  assert.ok(
    fs.existsSync(SAMPLE_PATH),
    `Missing sample dataset file: ${SAMPLE_PATH}`,
  );
  const rawLines = fs
    .readFileSync(SAMPLE_PATH, 'utf8')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  assert.ok(
    rawLines.length >= 50,
    `Expected at least 50 examples in cevin_sample.jsonl, found ${rawLines.length}`,
  );

  const counts: Record<TaskName, number> = {
    experience_extraction: 0,
    experience_matching: 0,
    hallucination_audit: 0,
    bullet_evaluation_and_rewrite: 0,
    executive_summary_synthesis: 0,
  };
  let headerACount = 0;
  let headerBCount = 0;

  const forbiddenRegex = new RegExp(
    ['oll' + 'ama', 'Google ' + 'Docs', 'Carlos Garcia', '@gmail\\.com'].join('|'),
    'i',
  );

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    assert.equal(
      forbiddenRegex.test(line),
      false,
      `Line ${i + 1} contains forbidden or PII pattern`,
    );

    const record = JSON.parse(line) as {
      messages?: Array<{ role: string; content: string }>;
    };
    assert.ok(
      Array.isArray(record.messages) && record.messages.length === 3,
      `Line ${i + 1}: expected 3 chat messages (system, user, assistant)`,
    );
    const [sys, usr, asst] = record.messages;
    assert.equal(sys.role, 'system');
    assert.equal(usr.role, 'user');
    assert.equal(asst.role, 'assistant');
    assert.equal(
      sys.content,
      CEVIN_MLX_SYSTEM_PROMPT,
      `Line ${i + 1}: system prompt must match CEVIN_MLX_SYSTEM_PROMPT`,
    );
    assert.ok(
      usr.content.startsWith('TASK:'),
      `Line ${i + 1}: user prompt must start with "TASK:"`,
    );

    const parsedAssistant = JSON.parse(asst.content) as { task?: string };
    const taskName = parsedAssistant.task as TaskName;
    assert.ok(
      taskName in TASK_SCHEMAS,
      `Line ${i + 1}: unknown task "${parsedAssistant.task}"`,
    );

    TASK_SCHEMAS[taskName].parse(parsedAssistant);
    counts[taskName] += 1;

    if (taskName === 'bullet_evaluation_and_rewrite') {
      if (usr.content.startsWith(MLX_BULLET_REWRITE_HEADER_COMPLETE)) {
        headerACount += 1;
      } else if (usr.content.startsWith(MLX_BULLET_REWRITE_HEADER_PARTIAL)) {
        headerBCount += 1;
      } else {
        throw new Error(
          `Line ${i + 1}: bullet_evaluation_and_rewrite prompt did not match Header A or Header B`,
        );
      }
    }
  }

  for (const [task, count] of Object.entries(counts)) {
    assert.ok(count >= 5, `Expected at least 5 examples for ${task}, got ${count}`);
  }
  assert.ok(headerACount >= 3, 'Expected Header A complete-evidence examples');
  assert.ok(headerBCount >= 3, 'Expected Header B partial-evidence examples');

  console.log(
    `✓ Validated ${rawLines.length} synthetic training examples across all 5 tasks:`,
    counts,
    `(Header A: ${headerACount}, Header B: ${headerBCount})`,
  );
}

main();
