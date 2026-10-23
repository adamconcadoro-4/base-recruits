import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { SnapshotError, listSnapshots, loadSnapshot, stagingRows } from '@/lib/registry/snapshot';

const BUNDLED = path.join(process.cwd(), 'data', 'snapshots');

async function copyWith(change: (text: string) => string): Promise<string> {
  const names = (await listSnapshots()).map((s) => s.name);
  const name = names[0]!;
  const directory = await mkdtemp(path.join(tmpdir(), 'br-snapshot-'));
  await writeFile(path.join(directory, name), change(await readFile(path.join(BUNDLED, name), 'utf8')));
  return directory;
}

describe('bundled registry snapshot', () => {
  it('validates and its records match their checksum', async () => {
    const listings = await listSnapshots();
    expect(listings.length).toBeGreaterThan(0);
    for (const listing of listings) expect(listing).toMatchObject({ ok: true });
    const file = await loadSnapshot(listings[0]!.name);
    expect(file.season).toMatch(/^\d{4}-\d{2}$/);
    expect(file.snapshot.records.length).toBeGreaterThan(1000);
    expect(file.fileSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it('attaches pipeline issues to their institution', async () => {
    const file = await loadSnapshot((await listSnapshots())[0]!.name);
    const rows = stagingRows(file.snapshot);
    expect(rows).toHaveLength(file.snapshot.records.length);
    const withIssues = rows.filter((r) => r.issues.length > 0);
    expect(withIssues.length).toBe(new Set(file.snapshot.issues.map((i) => i.unitid)).size);
  });

  it('refuses a snapshot whose records were edited by hand', async () => {
    const directory = await copyWith((text) => text.replace('"cost_of_attendance":92892', '"cost_of_attendance":1'));
    const name = (await listSnapshots())[0]!.name;
    await expect(loadSnapshot(name, directory)).rejects.toThrow(/checksum/);
  });

  it('refuses malformed files and names outside the snapshot folder', async () => {
    const directory = await copyWith(() => '{ not json');
    const name = (await listSnapshots())[0]!.name;
    await expect(loadSnapshot(name, directory)).rejects.toBeInstanceOf(SnapshotError);
    await expect(loadSnapshot('../package.json')).rejects.toThrow(/not available/);
    await expect(loadSnapshot('registry-2099-00.json')).rejects.toThrow(/not available/);
  });
});
