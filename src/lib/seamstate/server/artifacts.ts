import 'server-only';

import { ARTIFACT_BUCKET } from '@/lib/seamstate/server/worker';
import { createAdminClient } from '@/lib/supabase/admin';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** athlete id / assessment id / clip id . extension (lib/assessment/server/storage.ts). */
const CLIP_PATH = new RegExp(`^(${UUID})/${UUID}/(${UUID})\\.(mp4|mov|webm)$`);
const FOLDER = new RegExp(`^${UUID}$`);

type Storage = ReturnType<ReturnType<typeof createAdminClient>['storage']['from']>;

async function names(storage: Storage, prefix: string): Promise<string[] | null> {
  const { data, error } = await storage.list(prefix, { limit: 1000 });
  return error ? null : (data ?? []).map((entry) => entry.name);
}

/**
 * Deletes a removed clip's SeamState stills and packet
 * (athlete id / clip id / job id / attempt id / file). Called only after the
 * database has removed the clip and returned its path, which also removed its
 * SeamState records. Returns false if storage reported an error.
 */
export async function deleteSeamstateArtifacts(clipPaths: readonly (string | null | undefined)[]): Promise<boolean> {
  const storage = createAdminClient().storage.from(ARTIFACT_BUCKET);
  let ok = true;
  for (const path of new Set(clipPaths)) {
    const match = typeof path === 'string' ? CLIP_PATH.exec(path) : null;
    if (!match) continue;
    const base = `${match[1]}/${match[2]}`;
    const jobs = await names(storage, base);
    if (!jobs) {
      ok = false;
      continue;
    }
    const files: string[] = [];
    for (const job of jobs.filter((name) => FOLDER.test(name))) {
      const attempts = await names(storage, `${base}/${job}`);
      if (!attempts) {
        ok = false;
        continue;
      }
      for (const attempt of attempts.filter((name) => FOLDER.test(name))) {
        const inside = await names(storage, `${base}/${job}/${attempt}`);
        if (!inside) {
          ok = false;
          continue;
        }
        files.push(...inside.map((name) => `${base}/${job}/${attempt}/${name}`));
      }
    }
    for (let start = 0; start < files.length; start += 500) {
      const { error } = await storage.remove(files.slice(start, start + 500));
      if (error) ok = false;
    }
  }
  return ok;
}
