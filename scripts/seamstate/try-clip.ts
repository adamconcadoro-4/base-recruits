/**
 * The app's half of a local SeamState run: reads what worker/scripts/try_clip.py
 * wrote, sends the selected stills for the AI review exactly as the app would,
 * validates the answer and writes the record the app would save (record.json).
 * No database or website is involved. Needs ANTHROPIC_API_KEY for the AI step;
 * without it the record is saved as "not_configured", as the app does.
 *
 *   JITI_ALIAS='{"@/":"<repo>/src/","server-only":"<repo>/node_modules/server-only/empty.js"}' \
 *     node_modules/.bin/jiti scripts/seamstate/try-clip.ts OUT
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseEvidencePacket } from '@/lib/seamstate/packet';
import { selectModelFrames } from '@/lib/seamstate/prompt';
import { analysisRecord } from '@/lib/seamstate/record';
import { interpretClip } from '@/lib/seamstate/server/interpret';
import type { ClipVerdict } from '@/lib/seamstate/types';

async function main(): Promise<void> {
  const out = process.argv[2];
  if (!out) throw new Error('usage: try-clip.ts OUT (the folder try_clip.py wrote)');
  const packet = parseEvidencePacket(JSON.parse(readFileSync(join(out, 'packet.json'), 'utf8')) as unknown);
  const result = JSON.parse(readFileSync(join(out, 'result.json'), 'utf8')) as {
    verdict: ClipVerdict;
    reasons: string[];
    versions: Record<string, string>;
  };
  const stills = new Map<string, string>();
  const frames = (result.verdict === 'suitable' || result.verdict === 'limited' ? selectModelFrames(packet) : []).filter((frame) => {
    const file = join(out, 'stills', `${frame.frameId}.jpg`);
    if (!existsSync(file)) return false;
    stills.set(frame.frameId, readFileSync(file).toString('base64'));
    return true;
  });
  const interpretation =
    frames.length > 0 ? await interpretClip(packet, frames, stills) : { status: 'not_needed' as const, modelId: null, validation: null, usage: null };
  const record = analysisRecord({
    packet,
    verdict: result.verdict,
    reasons: result.reasons,
    versions: result.versions,
    status: interpretation.status,
    modelId: interpretation.modelId,
    validation: interpretation.validation,
    framesShown: frames.map((frame) => frame.frameId),
  });
  writeFileSync(join(out, 'record.json'), JSON.stringify({ ...record, usage: interpretation.usage }, null, 2));
  const rejected = interpretation.validation?.ok ? interpretation.validation.rejected.length : 0;
  console.log(
    `${record.state}: ${interpretation.status}, ${record.findings.length} findings kept, ${rejected} dropped by the checks, ` +
      `${frames.length} stills shown, tokens ${interpretation.usage?.inputTokens ?? 0} in / ${interpretation.usage?.outputTokens ?? 0} out`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
