import type { z } from 'zod';

/** Same rule as the backend: passwords need at least 8 characters. */
export const MIN_PASSWORD_LENGTH = 8;

export type FieldErrors<TValues> = Partial<Record<keyof TValues & string, string>>;

/** The first message per top-level field of a failed zod parse. */
export function fieldErrors<TValues>(error: z.ZodError): FieldErrors<TValues> {
  const errors: Record<string, string> = {};
  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === 'string' && !(field in errors)) errors[field] = issue.message;
  }
  return errors as FieldErrors<TValues>;
}

type ValidationResult<TOutput, TValues> =
  | { success: true; data: TOutput; errors: FieldErrors<TValues> }
  | { success: false; data: undefined; errors: FieldErrors<TValues> };

/** Runs a zod schema against form values and returns field errors keyed like the form. */
export function validateForm<TSchema extends z.ZodType, TValues>(
  schema: TSchema,
  values: TValues,
): ValidationResult<z.output<TSchema>, TValues> {
  const result = schema.safeParse(values);
  if (result.success) return { success: true, data: result.data, errors: {} };
  return { success: false, data: undefined, errors: fieldErrors<TValues>(result.error) };
}

/** Moves focus to the first field with an error, using the field names as element ids. */
export function focusFirstError(errors: Record<string, string | undefined>, idPrefix = '') {
  const first = Object.keys(errors).find((key) => errors[key]);
  if (!first) return;
  const element = document.getElementById(`${idPrefix}${first}`);
  element?.focus();
}
