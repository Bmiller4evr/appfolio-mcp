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
import { findProperty } from "../../../src/composites/findProperty";
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

// rent_roll, delinquency, and work_order all key their property_id on the Reports API's own
// small internal number, unrelated to the Database API's property UUID (getProperties.Id).
// find_property is the tool that turns an address or name into that number.
const PROPERTY_ID_NOTE =
  "properties (optional): Reports API numeric property ids as strings, e.g. [\"123\"] " +
  "(not street addresses, not Database API UUIDs). Use find_property to resolve an address or " +
  "name to one.";

const handler = createMcpHandler((server) => {
  if (dbHttp && callEndpointDeps) {
    server.registerTool(
      "list_endpoints",
      { title: "List Database API endpoints", description: "List AppFolio Database API operations visible to you. Returns method, path, operationId, summary, and tag only; describe_endpoint carries the parameter detail.", inputSchema: z.object({ search: z.string().optional(), tag: z.string().optional(), method: z.string().optional() }) },
      async ({ search, tag, method }, ctx) => {
        const role = roleFor(ctx);
        return { content: [{ type: "text", text: JSON.stringify(listEndpoints(scopedOps, { role }, { search, tag, method })) }] };
      }
    );

    server.registerTool(
      "describe_endpoint",
      {
        title: "Describe a Database API endpoint",
        description:
          "Everything needed to call one operation: path params, query params under the exact bracketed keys AppFolio expects (e.g. filters[LastUpdatedAtFrom]), request body properties, and notes about constraints AppFolio enforces but does not document. Call this before call_endpoint.",
        inputSchema: z.object({ operationId: z.string() }),
      },
      async ({ operationId }, ctx) => {
        const role = roleFor(ctx);
        return { content: [{ type: "text", text: JSON.stringify(describeEndpoint(scopedOps, { role }, operationId)) }] };
      }
    );

    server.registerTool(
      "call_endpoint",
      {
        title: "Call a Database API endpoint",
        description:
          "Executes one Database API operation by operationId. GET reads run and return data immediately; " +
          "POST/PATCH/DELETE writes return a preview plus a confirm token for confirm_write and never touch " +
          "AppFolio here. Get operationId and the exact pathParams/query key names (e.g. bracketed " +
          "filters[...]) from describe_endpoint first; this tool does not validate that you used the right ones.",
        inputSchema: z.object({ operationId: z.string(), pathParams: z.record(z.string(), z.string()).optional(), query: z.record(z.string(), z.string()).optional(), body: z.unknown().optional() }),
      },
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
      {
        title: "Run a report",
        description:
          "Executes a verified report and returns its rows. Unverified reports are refused. Pass filters " +
          "keyed by the exact names describe_report lists; a dotted name like properties.properties_ids " +
          "nests into the request body automatically, do not send it as a literal dotted key. A report's " +
          "property_id is a small AppFolio-internal number, unrelated to Database API property UUIDs; " +
          "use find_property to resolve an address or name to one.",
        inputSchema: z.object({
          reportId: z.string().describe("Report id from list_reports, e.g. \"rent_roll\""),
          filters: z.record(z.string(), z.unknown()).optional().describe("Filter names and values, exactly as describe_report lists them"),
          columns: z.array(z.string()).optional().describe("Column names to return; omit for every column describe_report lists"),
          maxRows: z.number().optional().describe("Truncate the result to this many rows"),
        }),
      },
      async ({ reportId, filters, columns, maxRows }) => ({ content: [{ type: "text", text: JSON.stringify(await runReport(reportsHttp, reportId, { filters, columns, maxRows })) }] })
    );
    server.registerTool(
      "find_property",
      {
        title: "Find a property",
        description:
          "Resolves an address or property name to the numeric Reports API property id that " +
          "rent_roll_summary, delinquency_aging, and work_order_aging's properties filter needs. " +
          "Case-insensitive substring match against every property's name, full address, and street; " +
          "can return more than one match for an ambiguous query.",
        inputSchema: z.object({ query: z.string().describe("Address, street name, or property name to search for") }),
      },
      async ({ query }) => ({ content: [{ type: "text", text: JSON.stringify(await findProperty(reportsHttp, query)) }] })
    );

    // vendor_compliance joins the vendor_directory report to getWorkOrders, so it needs both
    // the Reports API and the Database API modules, not just the reportsHttp this block gates on.
    if (dbHttp && callEndpointDeps) {
      server.registerTool(
        "vendor_compliance",
        {
          title: "Vendor compliance",
          description:
            "Vendors whose liability insurance expires within withinDays of asOf, grouped by the properties " +
            "their work order history shows them assigned to. Only liability insurance drives the match; " +
            "workers' comp expiration is included on each result for reference but is not filtered on.",
          inputSchema: z.object({
            withinDays: z.number().default(30).describe("Days out from asOf counted as \"expiring soon\""),
            asOf: z.string().describe("Reference date, YYYY-MM-DD"),
          }),
        },
        async ({ withinDays, asOf }, ctx) => {
          const role = roleFor(ctx);
          const result = await vendorCompliance({ reportsHttp, callEndpoint, callEndpointDeps }, { role }, { withinDays, asOf });
          return { content: [{ type: "text", text: JSON.stringify(result) }] };
        }
      );
    }
    server.registerTool(
      "rent_roll_summary",
      {
        title: "Rent roll summary",
        description:
          `Occupancy (units and square feet) and market-vs-actual rent gap by property and portfolio, as of ` +
          `a snapshot date. ${PROPERTY_ID_NOTE}`,
        inputSchema: z.object({
          asOf: z.string().describe("Snapshot date, YYYY-MM-DD"),
          properties: z.array(z.string()).optional().describe(PROPERTY_ID_NOTE),
        }),
      },
      async ({ asOf, properties }) => ({ content: [{ type: "text", text: JSON.stringify(await rentRollSummary(reportsHttp, { asOf, properties })) }] })
    );
    server.registerTool(
      "delinquency_aging",
      {
        title: "Delinquency aging",
        description: `Aging balances plus collections/repeat-lateness flags, by tenant. ${PROPERTY_ID_NOTE}`,
        inputSchema: z.object({
          minBalance: z.number().default(0).describe("Minimum total balance owed to include a tenant, in dollars"),
          properties: z.array(z.string()).optional().describe(PROPERTY_ID_NOTE),
        }),
      },
      async ({ minBalance, properties }) => ({ content: [{ type: "text", text: JSON.stringify(await delinquencyAging(reportsHttp, { minBalance, properties })) }] })
    );
    server.registerTool(
      "work_order_aging",
      {
        title: "Work order aging",
        description:
          "Age and stall signals for currently open work orders; closed, completed, or canceled tickets are " +
          "never returned. asOf is only the date ages and stall flags are computed relative to (usually " +
          `today) and does not change which work orders are fetched. status must exactly match AppFolio's ` +
          "status text on an already-open ticket (e.g. \"New\", \"Scheduled\", \"Assigned\"); values like " +
          `"Completed" will never match anything here. ${PROPERTY_ID_NOTE}`,
        inputSchema: z.object({
          asOf: z.string().describe("Date to compute work order age and stall flags relative to, YYYY-MM-DD; does not filter which work orders are fetched"),
          properties: z.array(z.string()).optional().describe(PROPERTY_ID_NOTE),
          status: z.string().optional().describe("Exact AppFolio status text on an open ticket, e.g. \"New\", \"Scheduled\", \"Assigned\""),
        }),
      },
      async ({ asOf, properties, status }) => ({ content: [{ type: "text", text: JSON.stringify(await workOrderAging(reportsHttp, { asOf, properties, status })) }] })
    );
  }
});

const authHandler = withMcpAuth(handler, (req, bearerToken) => verifyToken(req, bearerToken, config.workos), {
  required: true,
});

export { authHandler as GET, authHandler as POST };
