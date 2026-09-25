/**
 * Normalise a Kenyan mobile number to +254XXXXXXXXX.
 * Accepts 0712345678, 712345678, 254712345678, +254712345678, 0112345678,
 * with optional spaces, dashes or brackets. Returns null if it isn't a valid
 * Kenyan mobile number (must start with 7 or 1 after the country code).
 */
export function normalizeKenyanPhone(input: string): string | null {
  let digits = input.trim().replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;

  if (digits.startsWith("254")) digits = digits.slice(3);
  else if (digits.startsWith("0")) digits = digits.slice(1);

  if (!/^[17]\d{8}$/.test(digits)) return null;
  return `+254${digits}`;
}

/** +254712345678 -> 0712 345 678, for display. */
export function formatPhone(phone: string): string {
  const local = phone.startsWith("+254") ? "0" + phone.slice(4) : phone;
  return local.replace(/^(\d{4})(\d{3})(\d{3})$/, "$1 $2 $3");
}
