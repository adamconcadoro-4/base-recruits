import 'server-only';

import { deleteSeamstateArtifacts } from '@/lib/seamstate/server/artifacts';
import { createAdminClient } from '@/lib/supabase/admin';

export const ASSESSMENT_BUCKET = 'assessment-media';

/** athlete id / assessment id / clip id . extension — the only paths the database creates. */
const CLIP_PATH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(mp4|mov|webm)$/;

/**
 * Deletes clip files after the database has checked the person may remove
 * them, marked them removed and returned their paths (remove_assessment_media,
 * begin_assessment_deletion). It uses the server's storage key because the
 * storage read policy hides removed clips from the person, and a user-scoped
 * delete cannot see them. The clip's SeamState stills are deleted with it.
 * Returns false if storage reported an error.
 */
export async function deleteClipFiles(paths: readonly (string | null | undefined)[]): Promise<boolean> {
  const unique = [...new Set(paths.filter((path): path is string => typeof path === 'string' && CLIP_PATH.test(path)))];
  if (unique.length === 0) return true;
  const { error } = await createAdminClient().storage.from(ASSESSMENT_BUCKET).remove(unique);
  const artifactsDeleted = await deleteSeamstateArtifacts(unique);
  return !error && artifactsDeleted;
}
