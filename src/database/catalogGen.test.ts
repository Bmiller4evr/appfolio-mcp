// ABOUTME: Tests OpenAPI extraction against a small synthetic fixture, not the real 3.9MB export.
// ABOUTME: Covers marker parsing, error cases, and the path/query/body detail carried per operation.
import { describe, it, expect } from "vitest";
import { extractReDocState, extractOperations } from "./catalogGen";

const FIXTURE_HTML = `
<html><body><script>
      const __redoc_state = {"spec":{"data":{"openapi":"3.0.0","paths":{
        "/tenants": {
          "get": {
            "operationId":"getTenants","summary":"List All Tenants","tags":["Tenants"],
            "parameters":[
              {"name":"page","in":"query","description":"Optional pagination parameters.","style":"deepObject","schema":{"type":"object","default":{"number":1,"size":1000}},"required":false},
              {"name":"filters","in":"query","description":"Filters for tenants.","style":"deepObject","required":false,"schema":{"type":"object","required":["Id"],"properties":{
                "Id":{"type":"string","format":"uuid","description":"Example: filters[Id]=abc"},
                "LastUpdatedAtFrom":{"type":"string","format":"date-time","description":"Updated since the date provided."},
                "Status":{"$ref":"#/components/schemas/Tenant.Status"}
              }}}
            ]
          }
        },
        "/tenants/{tenantId}": {
          "patch": {
            "operationId":"updateTenant","summary":"Update Tenant","tags":["Tenants"],
            "parameters":[{"name":"tenantId","in":"path","description":"The tenant to update","required":true,"schema":{"type":"string","format":"uuid"}}],
            "requestBody":{"description":"Tenant object","required":true,"content":{"application/json":{"schema":{"$ref":"#/components/schemas/Tenant.Update"}}}}
          }
        },
        "/tenants/bulk": {
          "post": {"operationId":"bulkCreateTenants","summary":"Bulk Create Tenants","tags":["Tenants"]}
        },
        "/inspections/{InspectionId}": {
          "delete": {
            "operationId":"deleteInspection","summary":"Delete Inspection","tags":["Inspections"],
            "parameters":[{"name":"InspectionId","in":"path","description":"The inspection to delete","required":true,"schema":{"type":"string","format":"uuid"}}]
          }
        }
      },"components":{"schemas":{
        "Tenant.Status":{"title":"Status","type":"string","enum":["Current","Past"],"description":"The status of the tenant."},
        "Tenant.Update":{"title":"Tenant","required":["Name"],"allOf":[{"$ref":"#/components/schemas/Tenant"}]},
        "Tenant":{"type":"object","properties":{
          "Name":{"type":"string","description":"The tenant's name"},
          "Emails":{"$ref":"#/components/schemas/Tenant.Emails"}
        }},
        "Tenant.Emails":{"title":"Emails","type":"array","description":"Array of email addresses","items":{"type":"object","properties":{
          "Address":{"type":"string","description":"The email address"},
          "Primary":{"type":"boolean","description":"Whether this is the primary address"}
        },"required":["Address"]}}
      }}}}};
      Redoc.hydrate(__redoc_state, container);
</script></body></html>
`;

const OPS = extractOperations(extractReDocState(FIXTURE_HTML));
const byId = (operationId: string) => OPS.find((op) => op.operationId === operationId)!;

describe("extractReDocState", () => {
  it("parses the balanced JSON object out of the script tag", () => {
    const state = extractReDocState(FIXTURE_HTML);
    expect(state.spec.data.openapi).toBe("3.0.0");
    expect(Object.keys(state.spec.data.paths)).toHaveLength(4);
  });

  it("throws when the marker is not found", () => {
    expect(() => extractReDocState("<html></html>")).toThrow();
  });
});

describe("extractOperations", () => {
  it("flattens paths x methods into one operation per row", () => {
    expect(OPS).toHaveLength(4);
    expect(byId("getTenants")).toMatchObject({ method: "GET", path: "/tenants", summary: "List All Tenants", tag: "Tenants" });
    expect(byId("deleteInspection")).toMatchObject({ method: "DELETE", path: "/inspections/{InspectionId}", tag: "Inspections" });
  });

  it("flattens a deepObject query param into the bracketed keys a caller actually sends", () => {
    const names = byId("getTenants").queryParams.map((p) => p.name);
    expect(names).toContain("filters[Id]");
    expect(names).toContain("filters[LastUpdatedAtFrom]");
    expect(names).not.toContain("filters");
  });

  it("carries type, format, and required for each flattened filter key", () => {
    const params = byId("getTenants").queryParams;
    expect(params.find((p) => p.name === "filters[Id]")).toMatchObject({
      in: "query",
      required: true,
      type: "string",
      format: "uuid",
    });
    expect(params.find((p) => p.name === "filters[LastUpdatedAtFrom]")).toMatchObject({
      required: false,
      type: "string",
      format: "date-time",
    });
  });

  it("resolves a $ref filter property down to its type and enum", () => {
    const status = byId("getTenants").queryParams.find((p) => p.name === "filters[Status]");
    expect(status).toMatchObject({ type: "string", enum: ["Current", "Past"] });
    expect(status?.description).toContain("status of the tenant");
  });

  it("keeps a deepObject param with no properties of its own under its bare name", () => {
    const page = byId("getTenants").queryParams.find((p) => p.name === "page");
    expect(page).toMatchObject({ in: "query", required: false, type: "object" });
  });

  it("captures every path template placeholder with its description", () => {
    expect(byId("updateTenant").pathParams).toEqual([
      { name: "tenantId", required: true, description: "The tenant to update" },
    ]);
  });

  it("resolves a request body through $ref and allOf into flat properties", () => {
    const body = byId("updateTenant").requestBody!;
    expect(body.contentType).toBe("application/json");
    expect(body.required).toBe(true);
    expect(body.properties.find((p) => p.name === "Name")).toMatchObject({
      type: "string",
      required: true,
      description: "The tenant's name",
    });
  });

  it("expands an array-of-object body property one level down", () => {
    const emails = byId("updateTenant").requestBody!.properties.find((p) => p.name === "Emails")!;
    expect(emails.type).toBe("array");
    expect(emails.properties).toEqual([
      { name: "Address", type: "string", required: true, description: "The email address" },
      { name: "Primary", type: "boolean", required: false, description: "Whether this is the primary address" },
    ]);
  });

  it("gives an operation with no params and no body empty lists and no request body", () => {
    const op = byId("bulkCreateTenants");
    expect(op.pathParams).toEqual([]);
    expect(op.queryParams).toEqual([]);
    expect(op.requestBody).toBeUndefined();
  });
});
