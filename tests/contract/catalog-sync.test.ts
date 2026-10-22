/**
 * Contract tests: the TypeScript catalogs must match the database exactly.
 * Runs when DATABASE_URL points at a migrated database (`npm run test:contract`
 * starts the local test database and sets it); skipped otherwise.
 */
import { execFileSync } from 'node:child_process';

import { describe, expect, it } from 'vitest';

import { PLANS } from '@/config/plans';
import { COACH_STATUS_TRANSITIONS, COACH_VERIFICATION_STATUSES } from '@/lib/auth/coach-verification';
import { APP_ROLES } from '@/lib/auth/roles';
import { CONSENT_SCOPES, CONSENT_SCOPE_KEYS } from '@/lib/consent/scopes';
import { CAPABILITIES, CAPABILITY_KEYS } from '@/lib/entitlements/capabilities';
import {
  CONTROLS,
  DIVISION_CODES,
  LEVELS,
  PROGRAM_STATUSES,
  SETTINGS,
  TEST_POLICIES,
  VERIFICATIONS,
} from '@/lib/registry/types';

const DATABASE_URL = process.env.DATABASE_URL;
const PSQL = process.env.PSQL ?? 'psql';

function rows<T>(sql: string): T[] {
  const output = execFileSync(
    PSQL,
    [DATABASE_URL ?? '', '-X', '-q', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `select coalesce(json_agg(t), '[]'::json) from (${sql}) t`],
    { encoding: 'utf8' },
  );
  return JSON.parse(output) as T[];
}

/** Order-independent comparison with identical key order on both sides. */
const canonical = (items: readonly object[]) => items.map((item) => JSON.stringify(item)).sort();

const enumValues = (type: string) =>
  rows<{ v: string }>(`select unnest(enum_range(null::public.${type}))::text as v`).map((r) => r.v);

describe.skipIf(!DATABASE_URL)('database and TypeScript catalogs agree', () => {
  it('capabilities', () => {
    const db = rows<{ key: string; tier: string; audience: string; invariant_ref: number | null }>(
      'select key, tier, audience, invariant_ref from public.capabilities',
    );
    const ts = CAPABILITY_KEYS.map((key) => ({
      key,
      tier: CAPABILITIES[key].tier,
      audience: CAPABILITIES[key].audience,
      invariant_ref: CAPABILITIES[key].invariant,
    }));
    expect(canonical(db)).toEqual(canonical(ts));
  });

  it('paid plan contents', () => {
    const db = rows<{ plan_key: string; capability_key: string }>(
      'select plan_key, capability_key from public.plan_capabilities',
    );
    const ts = PLANS.flatMap((plan) =>
      plan.premiumCapabilities.map((capability) => ({ plan_key: plan.key, capability_key: capability })),
    );
    expect(canonical(db)).toEqual(canonical(ts));
  });

  it('coach verification statuses and transitions', () => {
    expect(enumValues('coach_verification_status')).toEqual([...COACH_VERIFICATION_STATUSES]);
    const db = rows<{ from: string; to: string; actor: string }>(
      'select from_status::text as "from", to_status::text as "to", actor_kind as actor from public.coach_status_transitions',
    );
    const ts = COACH_STATUS_TRANSITIONS.map((t) => ({ from: t.from, to: t.to, actor: t.actor }));
    expect(canonical(db)).toEqual(canonical(ts));
  });

  it('roles', () => {
    expect(enumValues('app_role')).toEqual([...APP_ROLES]);
  });

  it('consent scope rules', () => {
    expect(enumValues('consent_scope')).toEqual([...CONSENT_SCOPE_KEYS]);
    const db = rows<{
      scope: string;
      audience: string;
      grantee_kind: string | null;
      requires_guardian: boolean;
      max_days: number | null;
    }>(
      `select scope::text, audience::text, grantee_kind,
              requires_guardian_approval_for_minor as requires_guardian,
              extract(day from max_duration)::int as max_days
         from public.consent_scope_rules`,
    );
    const ts = CONSENT_SCOPE_KEYS.map((scope) => ({
      scope,
      audience: CONSENT_SCOPES[scope].audience,
      grantee_kind: CONSENT_SCOPES[scope].granteeKind,
      requires_guardian: CONSENT_SCOPES[scope].requiresGuardianApprovalForMinor,
      max_days: CONSENT_SCOPES[scope].maxDurationDays,
    }));
    expect(canonical(db)).toEqual(canonical(ts));
  });

  it('registry divisions and value lists', () => {
    const divisions = rows<{ code: string }>('select code from public.athletic_divisions order by sort_order').map((r) => r.code);
    expect(divisions).toEqual([...DIVISION_CODES]);
    expect(enumValues('institution_control')).toEqual([...CONTROLS]);
    expect(enumValues('institution_level')).toEqual([...LEVELS]);
    expect(enumValues('campus_setting')).toEqual([...SETTINGS]);
    expect(enumValues('test_policy')).toEqual([...TEST_POLICIES]);
    expect(enumValues('program_status')).toEqual([...PROGRAM_STATUSES]);
    expect(enumValues('program_verification')).toEqual([...VERIFICATIONS]);
  });
});
