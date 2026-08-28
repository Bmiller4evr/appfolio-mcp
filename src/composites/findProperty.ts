// ABOUTME: Resolves a property by name/address text to the numeric Reports API property_id that
// ABOUTME: rent_roll_summary, delinquency_aging, and work_order_aging need, since property_directory
// ABOUTME: (the only report that carries every property) exposes no name or address filter itself.
import type { AppFolioHttpClient } from "../http";
import { runReport } from "../reports/tools";
import { firstPopulated } from "./support";

export interface PropertyMatch {
  id: string;
  name: string | null;
  address: string | null;
}

// property_directory's own row cap is generous enough that no real portfolio should ever hit it,
// but the flag still has to be honest: a truncated fetch could hide the very property being
// searched for, which would otherwise look identical to a genuine no-match.
const MAX_ROWS = 5000;

export async function findProperty(
  reportsHttp: Pick<AppFolioHttpClient, "request">,
  query: string
): Promise<{ matches: PropertyMatch[]; truncated: boolean }> {
  const needle = query.trim().toLowerCase();
  if (!needle) throw new Error("findProperty: query must not be blank");

  const report = await runReport(reportsHttp, "property_directory", { maxRows: MAX_ROWS });
  const matches: PropertyMatch[] = [];

  for (const row of report.rows as Record<string, unknown>[]) {
    const haystack = [row.property_name, row.property_address, row.property, row.property_street]
      .map((v) => String(v ?? "").toLowerCase());
    if (!haystack.some((h) => h.includes(needle))) continue;

    matches.push({
      id: String(row.property_id),
      name: firstPopulated(row.property_name, row.property_address, row.property),
      address: (row.property_address as string | null) ?? null,
    });
  }

  return { matches, truncated: report.truncated };
}
