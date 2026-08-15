// ABOUTME: Tests for the generic search/describe registry shared by both catalog implementations.
// ABOUTME: Verifies search and descriptor query behavior for any descriptor collection.
import { describe, it, expect } from "vitest";
import { search, describe as describeItem } from "./registry";
import type { Descriptor } from "./types";

const ITEMS: Descriptor[] = [
  { id: "rent_roll", title: "Rent Roll", summary: "Occupancy and rent by unit", tags: ["occupancy"] },
  { id: "delinquency", title: "Delinquency", summary: "Aging balances by tenant", tags: ["financial"] },
  { id: "work_orders", title: "Work Orders", summary: "Open and closed maintenance tickets", tags: ["maintenance"] },
];

describe("search", () => {
  it("returns all items when query is omitted", () => {
    expect(search(ITEMS)).toHaveLength(3);
  });

  it("matches case-insensitively against title, summary, and tags", () => {
    expect(search(ITEMS, "OCCUPANCY").map((i) => i.id)).toEqual(["rent_roll"]);
    expect(search(ITEMS, "aging").map((i) => i.id)).toEqual(["delinquency"]);
    expect(search(ITEMS, "maintenance").map((i) => i.id)).toEqual(["work_orders"]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(search(ITEMS, "nonexistent")).toEqual([]);
  });
});

describe("describe", () => {
  it("returns the item with a matching id", () => {
    expect(describeItem(ITEMS, "delinquency")?.title).toBe("Delinquency");
  });

  it("returns undefined for an unknown id", () => {
    expect(describeItem(ITEMS, "nope")).toBeUndefined();
  });
});
