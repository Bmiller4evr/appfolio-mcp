// ABOUTME: Tests findProperty's substring match against property_directory, the only path from
// ABOUTME: an address or name to the numeric Reports API property id the other composites need.
import { describe, it, expect, vi } from "vitest";
import { findProperty } from "./findProperty";

const STALLION = {
  property_id: 244,
  property_name: "242 Stallion Drive",
  property_address: "242 Stallion Drive, Fort Worth, TX 76052",
  property_street: "242 Stallion Drive",
};
const CALDERWOOD = {
  property_id: 93,
  property_name: null,
  property_address: "10826 Calderwood Ln Fort Worth, TX 76052",
  property_street: "10826 Calderwood Ln",
};
const SOUTHMOOR = {
  property_id: 301,
  property_name: "1044 Southmoor Drive",
  property_address: "1044 Southmoor Drive - 1, Fort Worth, TX 76052",
  property_street: "1044 Southmoor Drive - 1",
};

function makeHttp(rows: Record<string, unknown>[] = [STALLION, CALDERWOOD, SOUTHMOOR]) {
  return { request: vi.fn().mockResolvedValue({ results: rows }) };
}

describe("findProperty", () => {
  it("matches a property by its street name", async () => {
    const result = await findProperty(makeHttp(), "Stallion");
    expect(result.matches).toEqual([{ id: "244", name: "242 Stallion Drive", address: "242 Stallion Drive, Fort Worth, TX 76052" }]);
  });

  it("matches case-insensitively", async () => {
    const result = await findProperty(makeHttp(), "calderwood");
    expect(result.matches.map((m) => m.id)).toEqual(["93"]);
  });

  it("falls back to the address as the name when property_name is blank", async () => {
    const result = await findProperty(makeHttp(), "Calderwood");
    expect(result.matches[0].name).toBe("10826 Calderwood Ln Fort Worth, TX 76052");
  });

  it("matches more than one property when the text is ambiguous", async () => {
    const result = await findProperty(makeHttp(), "Drive");
    expect(result.matches.map((m) => m.id).sort()).toEqual(["244", "301"]);
  });

  it("returns no matches rather than throwing when nothing matches", async () => {
    const result = await findProperty(makeHttp(), "Nonexistent Ave");
    expect(result.matches).toEqual([]);
  });

  it("refuses a blank query rather than matching every property", async () => {
    await expect(findProperty(makeHttp(), "   ")).rejects.toThrow(/blank/);
  });

  it("reports truncated: true when property_directory hit its row cap", async () => {
    const rows = Array.from({ length: 5001 }, (_, i) => ({ ...STALLION, property_id: i }));
    const result = await findProperty(makeHttp(rows), "Stallion");
    expect(result.truncated).toBe(true);
  });

  it("queries property_directory with no filters, since it exposes no name/address filter", async () => {
    const http = makeHttp();
    await findProperty(http, "Stallion");
    expect(http.request).toHaveBeenCalledWith("POST", "/reports/property_directory", { body: {} });
  });
});
