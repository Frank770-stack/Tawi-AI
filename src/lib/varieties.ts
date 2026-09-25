// The only variety names in the pilot. Farms add from this list and orders pick
// from it, so matching orders to farms is an exact name match. No grades or
// stem lengths (out of scope). Add a name here to offer it everywhere.
export const VARIETY_NAMES = ["Roses", "Mums", "Lilies"] as const;

export type VarietyName = (typeof VARIETY_NAMES)[number];

export function isVarietyName(name: string): name is VarietyName {
  return (VARIETY_NAMES as readonly string[]).includes(name);
}
