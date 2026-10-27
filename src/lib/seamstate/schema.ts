/**
 * Structured interpretation contract (seamstate-interpretation-v1).
 *
 * What the multimodal model must return. It holds words and references to
 * evidence frames only: no numbers, scores, confidence values or drill IDs.
 * Scores and evidence grades are computed by code; drills are chosen by
 * rules (drill-rules.ts). The model's output is untrusted until validate.ts
 * has checked it against the evidence packet.
 */

import { z } from 'zod';

import { FINDING_CATEGORIES } from '@/lib/seamstate/types';

const text = (max: number) => z.string().trim().min(1).max(max);

export const modelFindingSchema = z.object({
  mechanicKey: z.string().min(1).max(60),
  category: z.enum(FINDING_CATEGORIES),
  /** Swings (by index from the packet) this finding is about. */
  swingIndexes: z.array(z.number().int().min(1).max(50)).max(50),
  /** What is visible, in plain words. */
  observation: text(400),
  /** What it may mean for this task and setting. */
  interpretation: text(400).nullable(),
  /** Something the athlete could try. Only for adjustments. */
  suggestedExperiment: text(300).nullable(),
  /** What a later clip would show if it changed. */
  reassessment: text(300).nullable(),
  /** Frame ids from the packet (e.g. "f000123") that show the evidence. */
  evidenceFrameIds: z.array(z.string().regex(/^f\d{6}$/)).max(12),
  limitations: z.array(text(200)).max(5),
  alternativeExplanations: z.array(text(200)).max(3),
  /** One short practice cue, only for adjustments. */
  cue: text(80).nullable(),
});
export type ModelFinding = z.infer<typeof modelFindingSchema>;

/** Whether the bat visibly hits the ball. Only swings with contact count (a practice swing or a miss does not). */
export const SWING_CONTACT = ['bat_hits_ball', 'no_contact', 'unclear'] as const;
export type SwingContact = (typeof SWING_CONTACT)[number];

export const modelSwingContactSchema = z.object({
  swing: z.number().int().min(1).max(50),
  contact: z.enum(SWING_CONTACT),
  /** Frames from this swing that show it, such as the ball on the tee before and gone after. */
  evidenceFrameIds: z.array(z.string().regex(/^f\d{6}$/)).max(4),
  note: text(200),
});

export const modelOutputSchema = z.object({
  /** One entry per reviewed swing, decided before any finding. */
  swingContact: z.array(modelSwingContactSchema).max(50),
  findings: z.array(modelFindingSchema).max(20),
  unableToAssess: z
    .array(z.object({ mechanicKey: z.string().min(1).max(60), reason: text(300) }))
    .max(20),
});
export type ModelOutput = z.infer<typeof modelOutputSchema>;

/** JSON Schema for the provider's structured-output setting, generated from the same definition. */
export function modelOutputJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(modelOutputSchema, { target: 'draft-2020-12' }) as Record<string, unknown>;
}
