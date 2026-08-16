// ABOUTME: The single Next.js route serving the MCP endpoint: wires config, auth, the
// ABOUTME: database/reports/composite tool modules, and audit logging into one handler.
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { z } from "zod";
import { loadConfig, type Role } from "../../../src/config";
import { AppFolioHttpClient } from "../../../src/http";
import { createAuditNotifier } from "../../../src/audit";
import { scopeOperations } from "../../../src/database/roleScope";
import { DATABASE_OPERATIONS } from "../../../src/database/operations.generated";
import { listEndpoints, describeEndpoint, callEndpoint, confirmWrite, type CallEndpointDeps } from "../../../src/database/tools";
import { listReports, describeReport, runReport } from "../../../src/reports/tools";
import { vendorCompliance } from "../../../src/composites/vendorCompliance";
import { rentRollSummary } from "../../../src/composites/rentRollSummary";
import { delinquencyAging } from "../../../src/composites/delinquencyAging";
import { workOrderAging } from "../../../src/composites/workOrderAging";
import { verifyToken } from "../../../src/auth/workos";

const config = loadConfig();
const scopedOps = scopeOperations(DATABASE_OPERATIONS);
const notifyAudit = createAuditNotifier(config.auditSlackWebhookUrl);

const dbHttp = config.database
  ? new AppFolioHttpClient({
      baseUrl: "https://api.appfolio.com/api/v0",
      username: config.database.clientId,
      password: config.database.clientSecret,
      developerId: config.database.developerId,
    })
  : undefined;

const reportsHttp = config.reports
  ? new AppFolioHttpClient({
      baseUrl: `https://${config.reports.database}.appfolio.com/api/v2`,
      username: config.reports.clientId,
      password: config.reports.clientSecret,
    })
  : undefined;

const callEndpointDeps: CallEndpointDeps | undefined = dbHttp
  ? {
      ops: scopedOps,
      http: dbHttp,
      tokenSecret: config.tokenSecret,
      writesEnabled: config.writesEnabled,
      destructiveEnabled: config.destructiveEnabled,
      notifyAudit,
    }
  : undefined;

// ctx.http.authInfo.extra is typed as Record<string, unknown> | undefined by the SDK (our own
// AuthInfo shape from src/auth/workos.ts isn't visible to it), so a plain `?? "owner"` on the
// unknown-typed role widens to `{} | "owner"`, not Role. Narrow it explicitly instead.
function roleFor(ctx: { http?: { authInfo?: { extra?: Record<string, unknown> } } }): Role {
  return ctx.http?.authInfo?.extra?.role === "admin" ? "admin" : "owner";
}

const handler = createMcpHandler((server) => {
  if (dbHttp && callEndpointDeps) {
    server.registerTool(
      "list_endpoints",
      { title: "List Database API endpoints", description: "List AppFolio Database API operations visible to you.", inputSchema: z.object({ search: z.string().optional(), tag: z.string().optional(), method: z.string().optional() }) },
      async ({ search, tag, method }, ctx) => {
        const role = roleFor(ctx);
        return { content: [{ type: "text", text: JSON.stringify(listEndpoints(scopedOps, { role }, { search, tag, method })) }] };
      }
    );

    server.registerTool(
      "describe_endpoint",
      { title: "Describe a Database API endpoint", description: "Full detail for one operation.", inputSchema: z.object({ operationId: z.string() }) },
      async ({ operationId }, ctx) => {
        const role = roleFor(ctx);
        return { content: [{ type: "text", text: JSON.stringify(describeEndpoint(scopedOps, { role }, operationId)) }] };
      }
    );

    server.registerTool(
      "call_endpoint",
      { title: "Call a Database API endpoint", description: "Reads execute immediately; writes return a preview and confirm token.", inputSchema: z.object({ operationId: z.string(), pathParams: z.record(z.string(), z.string()).optional(), query: z.record(z.string(), z.string()).optional(), body: z.unknown().optional() }) },
      async ({ operationId, pathParams, query, body }, ctx) => {
        const role = roleFor(ctx);
        const result = await callEndpoint(callEndpointDeps, { role }, operationId, { pathParams, query, body });
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );

    server.registerTool(
      "confirm_write",
      { title: "Confirm a previewed write", description: "Executes the exact request encoded in a confirm token from call_endpoint.", inputSchema: z.object({ token: z.string() }) },
      async ({ token }, ctx) => {
        const role = roleFor(ctx);
        const result = await confirmWrite(callEndpointDeps, { role }, token);
        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    );
  }

  if (reportsHttp) {
    server.registerTool(
      "list_reports",
      { title: "List reports", description: "List AppFolio Reports API V2 reports.", inputSchema: z.object({ search: z.string().optional() }) },
      async ({ search }) => ({ content: [{ type: "text", text: JSON.stringify(listReports(search)) }] })
    );
    server.registerTool(
      "describe_report",
      { title: "Describe a report", description: "Columns, filters, and verification status for one report.", inputSchema: z.object({ reportId: z.string() }) },
      async ({ reportId }) => ({ content: [{ type: "text", text: JSON.stringify(describeReport(reportId)) }] })
    );
    server.registerTool(
      "run_report",
      { title: "Run a report", description: "Executes a verified report. Unverified reports are refused.", inputSchema: z.object({ reportId: z.string(), filters: z.record(z.string(), z.unknown()).optional(), columns: z.array(z.string()).optional(), maxRows: z.number().optional() }) },
      async ({ reportId, filters, columns, maxRows }) => ({ content: [{ type: "text", text: JSON.stringify(await runReport(reportsHttp, reportId, { filters, columns, maxRows })) }] })
    );

    // vendor_compliance joins the vendor_directory report to getWorkOrders, so it needs both
    // the Reports API and the Database API modules, not just the reportsHttp this block gates on.
    if (dbHttp && callEndpointDeps) {
      server.registerTool(
        "vendor_compliance",
        { title: "Vendor compliance", description: "Vendors with insurance/licenses expiring soon, grouped by property.", inputSchema: z.object({ withinDays: z.number().default(30), asOf: z.string() }) },
        async ({ withinDays, asOf }, ctx) => {
          const role = roleFor(ctx);
          const result = await vendorCompliance({ reportsHttp, callEndpoint, callEndpointDeps }, { role }, { withinDays, asOf });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
      );
    }
    server.registerTool(
      "rent_roll_summary",
      { title: "Rent roll summary", description: "Occupancy and rent gap by property and portfolio.", inputSchema: z.object({ asOf: z.string(), properties: z.array(z.string()).optional() }) },
      async ({ asOf, properties }) => ({ content: [{ type: "text", text: JSON.stringify(await rentRollSummary(reportsHttp, { asOf, properties })) }] })
    );
    server.registerTool(
      "delinquency_aging",
      { title: "Delinquency aging", description: "Aging balances plus collections/repeat-lateness flags.", inputSchema: z.object({ minBalance: z.number().default(0), properties: z.array(z.string()).optional() }) },
      async ({ minBalance, properties }) => ({ content: [{ type: "text", text: JSON.stringify(await delinquencyAging(reportsHttp, { minBalance, properties })) }] })
    );
    server.registerTool(
      "work_order_aging",
      { title: "Work order aging", description: "Age and stall signals for open work orders.", inputSchema: z.object({ asOf: z.string(), properties: z.array(z.string()).optional(), status: z.string().optional() }) },
      async ({ asOf, properties, status }) => ({ content: [{ type: "text", text: JSON.stringify(await workOrderAging(reportsHttp, { asOf, properties, status })) }] })
    );
  }
});

const authHandler = withMcpAuth(handler, (req, bearerToken) => verifyToken(req, bearerToken, config.workos), {
  required: true,
});

export { authHandler as GET, authHandler as POST };
