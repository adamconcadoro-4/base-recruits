import 'server-only';

import { redirect } from 'next/navigation';

import { getAccount, type Account } from '@/lib/auth/account';
import { evaluateRouteAccess } from '@/lib/auth/route-access';

/**
 * Layout/page gate: applies the route policy for `pathname` to the signed-in
 * account and redirects when access is denied. Returns the account otherwise.
 */
export async function requireAccess(pathname: string): Promise<Account> {
  const account = await getAccount();
  const decision = evaluateRouteAccess(pathname, account.viewer);
  if (!decision.allowed) redirect(decision.redirectTo);
  return account;
}
