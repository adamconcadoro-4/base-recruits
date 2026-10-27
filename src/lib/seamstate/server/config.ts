import 'server-only';

/**
 * SeamState server settings. Every secret stays on the server; none is ever
 * sent to the browser or the worker (the worker has its own copy of the
 * signing secret only).
 *
 *   ANTHROPIC_API_KEY        the AI provider key (Anthropic organization with a monthly spend limit)
 *   SEAMSTATE_MODEL          model id, default claude-opus-5-5 (decision F31)
 *   SEAMSTATE_WORKER_URL     the worker's https origin (Cloud Run)
 *   SEAMSTATE_WORKER_SECRET  shared signing secret, 32+ characters
 *   CRON_SECRET              Vercel cron bearer secret for the stall sweep
 */

export const DEFAULT_SEAMSTATE_MODEL = 'claude-opus-5-5';

export type MissingSetting = 'ai_provider' | 'worker';

export interface SeamstateReadiness {
  readonly ready: boolean;
  readonly missing: readonly MissingSetting[];
}

export function seamstateModel(): string {
  return process.env.SEAMSTATE_MODEL || DEFAULT_SEAMSTATE_MODEL;
}

export function anthropicConfigured(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function workerSecret(): string | null {
  const secret = process.env.SEAMSTATE_WORKER_SECRET ?? '';
  return secret.length >= 32 ? secret : null;
}

export function workerUrl(): string | null {
  const url = (process.env.SEAMSTATE_WORKER_URL ?? '').replace(/\/+$/, '');
  return url.startsWith('https://') || url.startsWith('http://localhost') ? url : null;
}

/** What is still missing before swing analysis can run end to end. */
export function seamstateReadiness(): SeamstateReadiness {
  const missing: MissingSetting[] = [];
  if (!anthropicConfigured()) missing.push('ai_provider');
  if (!workerUrl() || !workerSecret()) missing.push('worker');
  return { ready: missing.length === 0, missing };
}
