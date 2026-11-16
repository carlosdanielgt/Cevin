import assert from 'node:assert/strict';
import test from 'node:test';
import {
  includeBulletInDraft,
  moveBulletWithinRoleInDraft,
  removeBulletFromDraft,
  ResumeDraftContent,
  TailoredBullet,
} from '../core/domain';

function makeBullet(
  overrides: Partial<TailoredBullet> & { id: string; experienceId: string },
): TailoredBullet {
  return {
    text: `Delivered work for ${overrides.id}.`,
    originalText: `Delivered work for ${overrides.id}.`,
    sourceIds: [`ach-${overrides.id}`],
    locked: false,
    unverifiedClaims: [],
    ...overrides,
  };
}

function makeDraft(
  bullets: TailoredBullet[],
  selectedAchievementIds?: string[],
): ResumeDraftContent {
  return {
    targetHeadline: 'Staff Platform Engineer',
    summary: 'Experienced distributed systems engineer.',
    summarySourceIds: [],
    summaryLocked: false,
    selectedAchievementIds:
      selectedAchievementIds ??
      Array.from(new Set(bullets.flatMap((b) => b.sourceIds))),
    selectedSkillIds: ['skill-go'],
    selectedProjectIds: [],
    selectedEducationIds: [],
    selectedCertificationIds: [],
    bullets,
  };
}

test('removeBulletFromDraft removes the bullet and unreferenced selectedAchievementIds', () => {
  const b1 = makeBullet({ id: 'b1', experienceId: 'exp-1', sourceIds: ['a1'] });
  const b2 = makeBullet({ id: 'b2', experienceId: 'exp-1', sourceIds: ['a2'] });
  const b3 = makeBullet({ id: 'b3', experienceId: 'exp-2', sourceIds: ['a3'] });
  const draft = makeDraft([b1, b2, b3]);

  const next = removeBulletFromDraft(draft, 'b2');

  assert.deepEqual(
    next.bullets.map((b) => b.id),
    ['b1', 'b3'],
  );
  assert.deepEqual(next.selectedAchievementIds, ['a1', 'a3']);
});

test('removeBulletFromDraft preserves sourceIds still referenced by another bullet', () => {
  const b1 = makeBullet({
    id: 'b1',
    experienceId: 'exp-1',
    sourceIds: ['shared-ach', 'only-b1'],
  });
  const b2 = makeBullet({
    id: 'b2',
    experienceId: 'exp-1',
    sourceIds: ['shared-ach'],
  });
  const draft = makeDraft([b1, b2], ['shared-ach', 'only-b1']);

  const next = removeBulletFromDraft(draft, 'b1');

  assert.deepEqual(
    next.bullets.map((b) => b.id),
    ['b2'],
  );
  assert.deepEqual(next.selectedAchievementIds, ['shared-ach']);
});

test('removeBulletFromDraft handles removing the last bullet and unknown ids safely', () => {
  const b1 = makeBullet({ id: 'b1', experienceId: 'exp-1', sourceIds: ['a1'] });
  const draft = makeDraft([b1]);

  assert.equal(removeBulletFromDraft(draft, 'missing-id'), draft);

  const empty = removeBulletFromDraft(draft, 'b1');
  assert.deepEqual(empty.bullets, []);
  assert.deepEqual(empty.selectedAchievementIds, []);
});

test('includeBulletInDraft adds new bullets and deduplicates repeated inclusions', () => {
  const b1 = makeBullet({ id: 'b1', experienceId: 'exp-1', sourceIds: ['a1'] });
  const b2 = makeBullet({ id: 'b2', experienceId: 'exp-1', sourceIds: ['a2'] });
  const draft = makeDraft([b1]);

  const added = includeBulletInDraft(draft, b2);
  assert.deepEqual(
    added.bullets.map((b) => b.id),
    ['b1', 'b2'],
  );
  assert.deepEqual(added.selectedAchievementIds, ['a1', 'a2']);

  const deduped = includeBulletInDraft(added, {
    ...b2,
    id: 'bullet-a2-duplicate',
  });
  assert.deepEqual(
    deduped.bullets.map((b) => b.id),
    ['b1', 'b2'],
  );
  assert.deepEqual(deduped.selectedAchievementIds, ['a1', 'a2']);
});

test('moveBulletWithinRoleInDraft reorders adjacent bullets of the same experience across interleaved entries', () => {
  const e1b1 = makeBullet({ id: 'e1-b1', experienceId: 'exp-1' });
  const e2b1 = makeBullet({ id: 'e2-b1', experienceId: 'exp-2' });
  const e1b2 = makeBullet({ id: 'e1-b2', experienceId: 'exp-1' });
  const draft = makeDraft([e1b1, e2b1, e1b2]);

  const movedUp = moveBulletWithinRoleInDraft(draft, 'e1-b2', 'up');
  assert.deepEqual(
    movedUp.bullets.filter((b) => b.experienceId === 'exp-1').map((b) => b.id),
    ['e1-b2', 'e1-b1'],
  );
  assert.deepEqual(
    movedUp.bullets.filter((b) => b.experienceId === 'exp-2').map((b) => b.id),
    ['e2-b1'],
  );

  // Moving top bullet within exp-1 further up is a no-op
  assert.equal(moveBulletWithinRoleInDraft(movedUp, 'e1-b2', 'up'), movedUp);

  const movedDown = moveBulletWithinRoleInDraft(movedUp, 'e1-b2', 'down');
  assert.deepEqual(
    movedDown.bullets
      .filter((b) => b.experienceId === 'exp-1')
      .map((b) => b.id),
    ['e1-b1', 'e1-b2'],
  );
});
