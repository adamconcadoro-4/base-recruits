/** Result returned by a server action to the form that called it. */
export interface ActionState {
  readonly status: 'idle' | 'success' | 'error';
  readonly message?: string;
  readonly fieldErrors?: Readonly<Record<string, string>>;
}

export const IDLE: ActionState = { status: 'idle' };

export function failure(message: string, fieldErrors?: Record<string, string>): ActionState {
  return fieldErrors ? { status: 'error', message, fieldErrors } : { status: 'error', message };
}

export function success(message: string): ActionState {
  return { status: 'success', message };
}

/** Reads a string field from FormData; missing or non-string values become ''. */
export function field(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === 'string' ? value.trim() : '';
}
