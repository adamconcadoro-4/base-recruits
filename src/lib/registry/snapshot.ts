import 'server-only';

import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import { canonicalJson } from './canonical-json';

export const SNAPSHOT_FORMAT = 'base-recruits.registry-snapshot/1';
const SNAPSHOT_NAME = /^registry-[0-9]{4}-[0-9]{2}\.json$/;

/** Snapshots ship with the app (data/snapshots), produced and reviewed through the data-refresh workflow. */
export function snapshotDirectory(): string {
  return path.join(process.cwd(), 'data', 'snapshots');
}

const sha256Hex = z.string().regex(/^[0-9a-f]{64}$/);
const timestamp = z.iso.datetime({ offset: true });

const sourceSchema = z.looseObject({
  id: z.enum(['eada', 'college_scorecard']),
  dataset: z.string().min(1).max(200),
  url: z.string().max(500).startsWith('https://'),
  retrieved_at: timestamp,
});

const issueSchema = z.looseObject({
  unitid: z.number().int().positive().nullable(),
  source: z.string().max(40),
  code: z.string().max(60),
  detail: z.string().max(500),
});

const recordSchema = z.looseObject({
  unitid: z.number().int().positive(),
  institution_source: z.enum(['college_scorecard', 'eada']),
  facts: z.looseObject({ name: z.string().min(2).max(200) }),
  baseball: z.looseObject({ season: z.string().regex(/^[0-9]{4}-[0-9]{2}$/) }),
});

const snapshotSchema = z.object({
  format: z.literal(SNAPSHOT_FORMAT),
  generated_at: timestamp,
  content_sha256: sha256Hex,
  sources: z
    .array(sourceSchema)
    .min(2)
    .max(5)
    .refine((sources) => sources.some((s) => s.id === 'eada') && sources.some((s) => s.id === 'college_scorecard'), {
      message: 'needs both the EADA and College Scorecard sources',
    }),
  summary: z.record(z.string(), z.unknown()),
  issues: z.array(issueSchema).max(20000),
  records: z.array(recordSchema).min(1).max(20000),
});

export type Snapshot = z.infer<typeof snapshotSchema>;

export interface SnapshotFile {
  readonly name: string;
  readonly fileSha256: string;
  readonly snapshot: Snapshot;
  readonly season: string;
}

export interface SnapshotListing {
  readonly name: string;
  readonly ok: boolean;
  readonly problem?: string;
  readonly season?: string;
  readonly generatedAt?: string;
  readonly records?: number;
  readonly fileSha256?: string;
}

export class SnapshotError extends Error {}

export async function snapshotNames(): Promise<string[]> {
  try {
    return (await readdir(snapshotDirectory())).filter((n) => SNAPSHOT_NAME.test(n)).sort().reverse();
  } catch {
    return [];
  }
}

/** Reads, validates and integrity-checks one bundled snapshot. */
export async function loadSnapshot(name: string): Promise<SnapshotFile> {
  const names = await snapshotNames();
  if (!SNAPSHOT_NAME.test(name) || !names.includes(name)) throw new SnapshotError('That snapshot is not available.');
  const bytes = await readFile(path.join(snapshotDirectory(), name));
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new SnapshotError('The snapshot file is not valid JSON.');
  }
  const result = snapshotSchema.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    throw new SnapshotError(`The snapshot does not match the expected format (${issue?.path.join('.') || 'file'}: ${issue?.message}).`);
  }
  const snapshot = result.data;
  const recordsHash = createHash('sha256').update(canonicalJson(snapshot.records)).digest('hex');
  if (recordsHash !== snapshot.content_sha256) {
    throw new SnapshotError('The snapshot records do not match their recorded checksum; it may have been edited by hand.');
  }
  const unitids = new Set<number>();
  for (const record of snapshot.records) {
    if (unitids.has(record.unitid)) throw new SnapshotError(`The snapshot lists institution ${record.unitid} twice.`);
    unitids.add(record.unitid);
  }
  const eada = snapshot.sources.find((s) => s.id === 'eada');
  const season = typeof eada?.season === 'string' ? eada.season : '';
  if (!/^[0-9]{4}-[0-9]{2}$/.test(season)) throw new SnapshotError('The snapshot does not name its EADA season.');
  return { name, fileSha256: createHash('sha256').update(bytes).digest('hex'), snapshot, season };
}

export async function listSnapshots(): Promise<SnapshotListing[]> {
  const listings: SnapshotListing[] = [];
  for (const name of await snapshotNames()) {
    try {
      const file = await loadSnapshot(name);
      listings.push({
        name,
        ok: true,
        season: file.season,
        generatedAt: file.snapshot.generated_at,
        records: file.snapshot.records.length,
        fileSha256: file.fileSha256,
      });
    } catch (error) {
      listings.push({ name, ok: false, problem: error instanceof SnapshotError ? error.message : 'Could not read the file.' });
    }
  }
  return listings;
}

/** Rows for admin_stage_import_rows, with the pipeline's issues attached to their institution. */
export function stagingRows(snapshot: Snapshot) {
  const issuesByUnit = new Map<number, unknown[]>();
  for (const issue of snapshot.issues) {
    if (issue.unitid === null) continue;
    const list = issuesByUnit.get(issue.unitid) ?? [];
    list.push(issue);
    issuesByUnit.set(issue.unitid, list);
  }
  return snapshot.records.map((record) => ({ unitid: record.unitid, record, issues: issuesByUnit.get(record.unitid) ?? [] }));
}
