// ABOUTME: Tests OpenAPI extraction against a small synthetic fixture, not the real 3.9MB export.
// ABOUTME: Covers marker parsing, error cases, and flattening paths x methods into raw operations.
import { describe, it, expect } from "vitest";
import { extractReDocState, extractOperations } from "./catalogGen";

const FIXTURE_HTML = `
<html><body><script>
      const __redoc_state = {"spec":{"data":{"openapi":"3.0.0","paths":{
        "/tenants": {
          "get": {"operationId":"getTenants","summary":"List All Tenants","tags":["Tenants"]}
        },
        "/tenants/{tenantId}": {
          "patch": {"operationId":"updateTenant","summary":"Update Tenant","tags":["Tenants"]}
        },
        "/tenants/bulk": {
          "post": {"operationId":"bulkCreateTenants","summary":"Bulk Create Tenants","tags":["Tenants"]}
        },
        "/inspections/{InspectionId}": {
          "delete": {"operationId":"deleteInspection","summary":"Delete Inspection","tags":["Inspections"]}
        }
      }}}};
      Redoc.hydrate(__redoc_state, container);
</script></body></html>
`;

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
    const state = extractReDocState(FIXTURE_HTML);
    const ops = extractOperations(state);
    expect(ops).toHaveLength(4);
    expect(ops).toContainEqual({
      method: "GET",
      path: "/tenants",
      operationId: "getTenants",
      summary: "List All Tenants",
      tag: "Tenants",
    });
    expect(ops).toContainEqual({
      method: "DELETE",
      path: "/inspections/{InspectionId}",
      operationId: "deleteInspection",
      summary: "Delete Inspection",
      tag: "Inspections",
    });
  });
});
