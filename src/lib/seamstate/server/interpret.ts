import 'server-only';

import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';

import type { EvidenceFrame, EvidencePacket } from '@/lib/seamstate/packet';
import { interpretationContent, packetForModel, SYSTEM_PROMPT } from '@/lib/seamstate/prompt';
import type { InterpretationStatus } from '@/lib/seamstate/record';
import { modelOutputSchema } from '@/lib/seamstate/schema';
import { anthropicConfigured, seamstateModel } from '@/lib/seamstate/server/config';
import { validateInterpretation, type ValidationResult } from '@/lib/seamstate/validate';

export interface Interpretation {
  readonly status: InterpretationStatus;
  readonly modelId: string | null;
  readonly validation: ValidationResult | null;
  readonly usage: { readonly inputTokens: number; readonly outputTokens: number } | null;
}

/**
 * Sends the selected stills and the clip brief to the AI provider and checks
 * the answer against the evidence the model was shown. Never throws for a
 * provider problem: the analysis is saved as partial with the reason, and the
 * person is told the review step was not available.
 */
export async function interpretClip(
  packet: EvidencePacket,
  frames: readonly EvidenceFrame[],
  stills: ReadonlyMap<string, string>,
): Promise<Interpretation> {
  if (!anthropicConfigured()) return { status: 'not_configured', modelId: null, validation: null, usage: null };
  const model = seamstateModel();
  const client = new Anthropic({ maxRetries: 2, timeout: 120_000 });
  let response: Anthropic.Message;
  try {
    response = await client.messages.create({
      model,
      max_tokens: 16000,
      system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
      messages: [{ role: 'user', content: interpretationContent(packet, frames, stills) as Anthropic.ContentBlockParam[] }],
      output_config: { format: zodOutputFormat(modelOutputSchema) },
    });
  } catch (error) {
    if (error instanceof Anthropic.APIError) {
      console.error('SeamState interpretation request failed', { status: error.status });
    } else {
      console.error('SeamState interpretation request failed');
    }
    return { status: 'provider_error', modelId: model, validation: null, usage: null };
  }
  const usage = { inputTokens: response.usage.input_tokens, outputTokens: response.usage.output_tokens };
  if (response.stop_reason === 'refusal') return { status: 'declined', modelId: response.model, validation: null, usage };
  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('');
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 'malformed', modelId: response.model, validation: { ok: false, error: 'malformed_output', issues: ['not JSON'] }, usage };
  }
  // Checked against only the stills the model saw, so it cannot cite others.
  const validation = validateInterpretation(raw, packetForModel(packet, frames));
  return { status: validation.ok ? 'interpreted' : 'malformed', modelId: response.model, validation, usage };
}
