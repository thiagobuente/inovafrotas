import { describe, expect, test } from "bun:test";
import { filterManagerRequests } from "./manager-request-visibility";

describe("manager request visibility", () => {
  const requests = [{ id: "old", status: "approved" }, { id: "new", status: "pending" }];
  const hidden = new Set(["old"]);

  test("hidden requests are removed only from the manager list", () => {
    expect(filterManagerRequests(requests, hidden)).toEqual([{ id: "new", status: "pending" }]);
  });
  test("preserves hidden records and allows them to be restored", () => {
    expect(filterManagerRequests(requests, hidden, true)).toEqual([{ id: "old", status: "approved" }]);
    expect(requests).toHaveLength(2);
    expect(filterManagerRequests(requests, new Set())).toEqual(requests);
  });
});