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
  opts: { filters?: Record<string, unknown>; columns?: string[]; maxRows?: number } = {}
): Promise<RunReportResult> {
  const report = describeReport(reportId);
  if (!report.verified) {
    throw new UnverifiedReportError(
      `${reportId}'s V2 columns are unverified, confirm against Manage API Settings > Reports API Documentation before running it`
    );
  }

  const maxRows = opts.maxRows ?? 500;
  const body: Record<string, unknown> = { filters: opts.filters ?? {} };
  if (opts.columns) body.columns = opts.columns;

  const response = (await http.request("POST", `/reports/${reportId}`, { body })) as {
    results: Record<string, unknown>[];
    next_page_url?: string;
  };
  const rows = response.results.slice(0, maxRows);
  return {
    rows,
    count: rows.length,
    truncated: response.results.length > maxRows,
    nextPageUrl: response.next_page_url,
  };
}
