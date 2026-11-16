import type { ResumeDraftContent, TailoredBullet } from './entities';

/**
 * Removes a bullet from a working resume draft and prunes any
 * `selectedAchievementIds` no longer referenced by any remaining bullet.
 */
export function removeBulletFromDraft(
  draft: ResumeDraftContent,
  bulletId: string,
): ResumeDraftContent {
  const target = draft.bullets.find((b) => b.id === bulletId);
  if (!target) {
    return draft;
  }

  const nextBullets = draft.bullets.filter((b) => b.id !== bulletId);
  const stillReferencedSourceIds = new Set(
    nextBullets.flatMap((b) => b.sourceIds),
  );
  const removedSourceIds = new Set(target.sourceIds);

  const nextSelectedAchievementIds = draft.selectedAchievementIds.filter(
    (id) => !removedSourceIds.has(id) || stillReferencedSourceIds.has(id),
  );

  return {
    ...draft,
    bullets: nextBullets,
    selectedAchievementIds: nextSelectedAchievementIds,
  };
}

/**
 * Adds a tailored bullet to the working resume draft and keeps
 * `selectedAchievementIds` synchronized without duplicating entries.
 */
export function includeBulletInDraft(
  draft: ResumeDraftContent,
  bullet: TailoredBullet,
): ResumeDraftContent {
  const alreadyPresent = draft.bullets.some(
    (b) =>
      b.id === bullet.id ||
      (bullet.sourceIds.length > 0 &&
        bullet.sourceIds.every((id) => b.sourceIds.includes(id))),
  );

  const nextBullets = alreadyPresent
    ? draft.bullets
    : [...draft.bullets, bullet];

  const nextSelectedAchievementIds = Array.from(
    new Set([...draft.selectedAchievementIds, ...bullet.sourceIds]),
  );

  return {
    ...draft,
    bullets: nextBullets,
    selectedAchievementIds: nextSelectedAchievementIds,
  };
}

/**
 * Reorders a bullet up or down relative to the adjacent bullet belonging
 * to the same experience (`experienceId`), even if bullets across different
 * experiences are interleaved in `draft.bullets`.
 */
export function moveBulletWithinRoleInDraft(
  draft: ResumeDraftContent,
  bulletId: string,
  direction: 'up' | 'down',
): ResumeDraftContent {
  const idx = draft.bullets.findIndex((b) => b.id === bulletId);
  if (idx === -1) {
    return draft;
  }

  const target = draft.bullets[idx];
  const step = direction === 'up' ? -1 : 1;
  let neighborIdx = -1;

  for (let i = idx + step; i >= 0 && i < draft.bullets.length; i += step) {
    if (draft.bullets[i].experienceId === target.experienceId) {
      neighborIdx = i;
      break;
    }
  }

  if (neighborIdx === -1) {
    return draft;
  }

  const nextBullets = [...draft.bullets];
  const temp = nextBullets[neighborIdx];
  nextBullets[neighborIdx] = nextBullets[idx];
  nextBullets[idx] = temp;

  return {
    ...draft,
    bullets: nextBullets,
  };
}
