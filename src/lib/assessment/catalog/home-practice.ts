/**
 * The parents' home-practice guide from the Hitting Development Workbook
 * (decision F39): how to start, a home safety checklist, a menu of drills
 * that suit a small space, sample short sessions, and what to say.
 *
 * The workbook points families at its own sheets (the Coach-Parent Plan and
 * the Practice Log); on the site those are the coach-approved training plan
 * and its log, so those references are rewritten. Everything else is shown as
 * written, with workbook ids spelled out as names.
 */

import { drill, type DrillDefinition } from '@/lib/assessment/catalog/drills';
import { workbookDrillKey } from '@/lib/assessment/catalog/workbook-drills';
import { HITTING_WORKBOOK, siteText, withWorkbookNames } from '@/lib/assessment/hitting-workbook/content';

const guide = HITTING_WORKBOOK.parentsGuide;

const SITE_REWRITES: ReadonlyArray<readonly [RegExp, string]> = [
  [/ \(use the Coach-Parent Plan sheet\)/, ' (a training plan the development coach has approved shows the goal, and each drill shows its cue)'],
  [/Log the session in the Practice Log with Context = Home\./, 'Log the drills on the Training Plan page and note that it was home practice.'],
];

function forSite(text: string): string {
  return withWorkbookNames(SITE_REWRITES.reduce((value, [pattern, replacement]) => value.replace(pattern, replacement), siteText(text)));
}

export const HOME_STEPS = guide.steps.map((item) => ({ step: item.step, action: forSite(item.action) }));

export const HOME_SAFETY = guide.safety.map((item) => ({ check: item.check, why: item.why }));

export interface HomeMenuItem {
  readonly drill: DrillDefinition;
  readonly setup: string;
  readonly swings: string;
  readonly cue: string;
  readonly space: string;
}

export const HOME_MENU: readonly HomeMenuItem[] = guide.menu.map((item) => {
  const found = drill(workbookDrillKey(item.drillId));
  if (!found) throw new Error(`Home practice drill ${item.drillId} is not in the drill library`);
  return { drill: found, setup: forSite(item.setup), swings: item.swings, cue: item.cue, space: item.space };
});

export const HOME_SESSIONS = guide.sessions.map((item) => ({ session: item.session, sequence: forSite(item.sequence) }));

export const PARENT_LANGUAGE = guide.language.map((item) => ({ situation: item.situation, say: item.say, avoid: item.avoid }));

/** Plan drills that are also on the home menu. */
export function homeDrillKeys(): ReadonlySet<string> {
  return new Set(HOME_MENU.map((item) => item.drill.key));
}
