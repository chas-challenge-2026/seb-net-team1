import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule } from "node:vm";
import ts from "typescript";

const moduleUrl = new URL("../src/utils/auditFilters.ts", import.meta.url);
const source = await readFile(moduleUrl, "utf8");
const { outputText } = ts.transpileModule(source, {
  fileName: fileURLToPath(moduleUrl),
  compilerOptions: {
    target: ts.ScriptTarget.ES2023,
    module: ts.ModuleKind.ESNext,
  },
});
const module = new SourceTextModule(outputText, {
  context: createContext({}),
  identifier: moduleUrl.href,
});
await module.link(() => { throw new Error("Unexpected import in audit filters"); });
await module.evaluate();
const { buildAuditLogFilters, DEFAULT_AUDIT_FILTERS } = module.namespace;

function filters(values, now) {
  // Convert the isolated module's plain object to this test's realm.
  return JSON.parse(JSON.stringify(buildAuditLogFilters({
    ...DEFAULT_AUDIT_FILTERS,
    ...values,
  }, now)));
}

test("default and whitespace-only filters omit unused query values", () => {
  assert.deepEqual(filters({}), {});
  assert.deepEqual(filters({ search: " \n ", action: " ", userId: " " }), {});
});

test("search is trimmed and action/user filters remain separate", () => {
  assert.deepEqual(filters({
    search: "  Sara & betalning #36  ",
    action: "CREATE_PAYMENT",
    userId: "42",
  }), {
    search: "Sara & betalning #36",
    action: "CREATE_PAYMENT",
    userId: 42,
  });
});

test("the Systemet filter preserves user ID zero", () => {
  assert.deepEqual(filters({ userId: "0" }), { userId: 0 });
});

test("today follows the Stockholm calendar even before UTC midnight", () => {
  assert.deepEqual(filters({ dateRange: "today" }, new Date("2026-10-18T22:30:00Z")), {
    from: "2026-10-18T22:00:00.000Z",
    to: "2026-10-19T22:00:00.000Z",
  });
});

test("seven and thirty days include today across month and year boundaries", () => {
  const now = new Date("2026-01-03T12:00:00Z");
  assert.deepEqual(filters({ dateRange: "7days" }, now), {
    from: "2025-12-27T23:00:00.000Z",
    to: "2026-01-03T23:00:00.000Z",
  });
  assert.deepEqual(filters({ dateRange: "30days" }, now), {
    from: "2025-12-04T23:00:00.000Z",
    to: "2026-01-03T23:00:00.000Z",
  });
});

test("spring daylight saving day includes its full 23 hours", () => {
  const result = filters({ dateRange: "today" }, new Date("2026-03-29T12:00:00Z"));
  assert.deepEqual(result, {
    from: "2026-03-28T23:00:00.000Z",
    to: "2026-03-29T22:00:00.000Z",
  });
  assert.equal((Date.parse(result.to) - Date.parse(result.from)) / 3600000, 23);
});

test("autumn daylight saving day includes its full 25 hours", () => {
  const result = filters({ dateRange: "custom", fromDate: "2026-10-25", toDate: "2026-10-25" });
  assert.deepEqual(result, {
    from: "2026-10-24T22:00:00.000Z",
    to: "2026-10-25T23:00:00.000Z",
  });
  assert.equal((Date.parse(result.to) - Date.parse(result.from)) / 3600000, 25);
});

test("custom end dates include the entire selected final day", () => {
  assert.deepEqual(filters({ dateRange: "custom", fromDate: "2026-10-01", toDate: "2026-10-19" }), {
    from: "2026-09-30T22:00:00.000Z",
    to: "2026-10-19T22:00:00.000Z",
  });
});

test("custom dates allow either or both bounds to be empty", () => {
  assert.deepEqual(filters({ dateRange: "custom", fromDate: "2026-01-01" }), {
    from: "2025-12-31T23:00:00.000Z",
  });
  assert.deepEqual(filters({ dateRange: "custom", toDate: "2026-01-01" }), {
    to: "2026-01-01T23:00:00.000Z",
  });
  assert.deepEqual(filters({ dateRange: "custom" }), {});
});

test("the all preset ignores previously selected custom dates", () => {
  assert.deepEqual(filters({ fromDate: "2026-10-19", toDate: "2026-10-01" }), {});
});

test("reversed or impossible custom dates are rejected before a request", () => {
  assert.throws(() => filters({
    dateRange: "custom", fromDate: "2026-10-19", toDate: "2026-10-01",
  }), { message: "Fråndatum får inte vara efter tilldatum." });
  for (const fromDate of ["2026-02-29", "2026-13-01", "2026-01-32", "19/10/2026"]) {
    assert.throws(() => filters({ dateRange: "custom", fromDate }), {
      message: "Ange ett giltigt datum.",
    });
  }
  assert.deepEqual(filters({ dateRange: "custom", fromDate: "2024-02-29", toDate: "2024-02-29" }), {
    from: "2024-02-28T23:00:00.000Z",
    to: "2024-02-29T23:00:00.000Z",
  });
});
