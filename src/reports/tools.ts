// ABOUTME: MCP tool implementations over the Reports API catalog: list/describe (Task 3's
// ABOUTME: generic registry) and run (POST to AppFolio's V2 endpoint), gated on verification.
import type { AppFolioHttpClient } from "../http";
import { search, describe as describeItem } from "../catalog/registry";
import { REPORTS, type ReportDescriptor } from "./operations.data";

export class NotFoundError extends Error {}
export class UnverifiedReportError extends Error {}

export function listReports(query?: string) {
  return search(REPORTS, query).map((r) => ({ id: r.id, title: r.title, summary: r.summary, verified: r.verified }));
}

export function describeReport(reportId: string): ReportDescriptor {
  const report = describeItem(REPORTS, reportId);
  if (!report) throw new NotFoundError(`Unknown report: ${reportId}`);
  return report;
}

export interface RunReportResult {
  rows: Record<string, unknown>[];
  count: number;
  truncated: boolean;
  nextPageUrl?: string;
}

export async function runReport(
  http: Pick<AppFolioHttpClient, "request">,
  reportId: string,
  opts: { filters?: Record<string, unknown>; columns?: string[]; maxRows?: number } = {},
  lookupReport: (id: string) => ReportDescriptor = describeReport
): Promise<RunReportResult> {
  const report = lookupReport(reportId);
  if (!report.verified) {
    throw new UnverifiedReportError(
      `${reportId}'s V2 columns are unverified, confirm against Manage API Settings > Reports API Documentation before running it`
    );
  }

  const maxRows = opts.maxRows ?? 500;
  const body: Record<string, unknown> = { filters: opts.filters ?? {} };
  if (opts.columns) body.columns = opts.columns;

  const response = await http.request("POST", `/reports/${reportId}`, { body });

  // Confirmed live against several real reports (balance_sheet, cash_flow_detail, and other
  // financial reports among them): AppFolio returns a bare JSON array as the whole response body
  // for some V2 reports, and { results: [...] } for others. Nothing in a report's own catalog
  // entry predicts which shape it'll use, so both have to be handled here.
  const allRows = Array.isArray(response)
    ? (response as Record<string, unknown>[])
    : (response as { results: Record<string, unknown>[] }).results;
  const nextPageUrl = Array.isArray(response) ? undefined : (response as { next_page_url?: string }).next_page_url;

  const rows = allRows.slice(0, maxRows);
  return {
    rows,
    count: rows.length,
    truncated: allRows.length > maxRows,
    nextPageUrl,
  };
}
