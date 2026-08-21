// ABOUTME: Generic search/describe over any list of catalog descriptors.
// ABOUTME: Reports and Database API each bring their own execution logic on top of this.
import type { Descriptor } from "./types";

export function search<T extends Descriptor>(items: T[], query?: string): T[] {
  if (!query) return items;
  const needle = query.toLowerCase();
  return items.filter((item) => {
    const haystack = [item.id, item.title, item.summary, ...(item.tags ?? [])].join(" ").toLowerCase();
    return haystack.includes(needle);
  });
}

export function describe<T extends Descriptor>(items: T[], id: string): T | undefined {
  return items.find((item) => item.id === id);
}
