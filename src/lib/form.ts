/**
 * React resets a form after its action runs. Actions return the submitted text
 * values on error so inputs can use them as defaultValue and nothing is lost.
 */
export function formValues(formData: FormData): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && !key.startsWith("$ACTION")) values[key] = value;
  }
  return values;
}
