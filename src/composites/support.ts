// ABOUTME: Small helpers shared across composites for turning report rows into human-readable
// ABOUTME: output, rather than each composite growing its own copy of the same fallback logic.

// An absent column has to stay absent all the way out to the caller. Stringifying it turns a
// missing property or vendor into the four-character name "null", which reads like real data.
export function firstPopulated(...values: unknown[]): string | null {
  for (const value of values) {
    if (value !== null && value !== undefined && value !== "") return String(value);
  }
  return null;
}
