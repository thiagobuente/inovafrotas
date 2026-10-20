import { describe, test } from "node:test";
import { deepStrictEqual, strictEqual } from "node:assert";
import { filterManagerRequests } from "./manager-request-visibility";

describe("manager request visibility", () => {
  const requests = [{ id: "old", status: "approved" }, { id: "new", status: "pending" }];
  const hidden = new Set(["old"]);

  test("hidden requests are removed only from the manager list", () => {
    deepStrictEqual(filterManagerRequests(requests, hidden), [{ id: "new", status: "pending" }]);
  });
  test("preserves hidden records and allows them to be restored", () => {
    deepStrictEqual(filterManagerRequests(requests, hidden, true), [{ id: "old", status: "approved" }]);
    strictEqual(requests.length, 2);
    deepStrictEqual(filterManagerRequests(requests, new Set()), requests);
  });
});