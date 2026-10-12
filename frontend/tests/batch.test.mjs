import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const root = fileURLToPath(new URL("../src/", import.meta.url));
async function loadModule(relativePath, development = true) {
  const context = vm.createContext({ setTimeout, clearTimeout, DOMException, TextEncoder });
  const modules = new Map();
  async function load(filename) {
    if (modules.has(filename)) return modules.get(filename);
    const source = await readFile(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    });
    const module = new vm.SourceTextModule(outputText, {
      context, identifier: filename,
      initializeImportMeta(meta) { meta.env = { DEV: development }; },
      async importModuleDynamically(specifier, parent) {
        const dependency = await load(path.resolve(path.dirname(parent.identifier), `${specifier}.ts`));
        if (dependency.status !== "evaluated") await dependency.evaluate();
        return dependency;
      },
    });
    modules.set(filename, module);
    await module.link((specifier, parent) => load(path.resolve(path.dirname(parent.identifier), `${specifier}.ts`)));
    return module;
  }
  const module = await load(path.resolve(root, relativePath));
  await module.evaluate();
  return module.namespace;
}

const csv = await loadModule("utils/batchCsv.ts");
const pagination = await loadModule("utils/batchPagination.ts");
const filtering = await loadModule("utils/batchHistory.ts");
const header = "from_account_id,to_iban,amount,reference";
const row = "1,SE8550000000054910000003,125.50,Example";
const file = (count = 10, value = row, lineEnding = "\n") => [header, ...Array(count).fill(value)].join(lineEnding);
const plain = (value) => JSON.parse(JSON.stringify(value));

for (const ending of ["\n", "\r\n", "\r"]) {
  test(`valid CSV and original line numbering (${JSON.stringify(ending)})`, () => {
    const result = csv.validateBatchCsv(file(10, row, ending));
    assert.equal(result.isValid, true);
    assert.deepEqual(plain(result.summary), { totalRows: 10, validRows: 10, invalidRows: 0, totalAmount: "1255.00" });
    assert.equal(result.rows[9].rowNumber, 11);
    assert.equal(result.rows[9].recordNumber, 10);
  });
}
test("100 rows with exactly 48 invalid", () => {
  const result = csv.validateBatchCsv([header, ...Array.from({ length: 100 }, (_, index) => index < 48 ? row.replace(/^1,/, "0,") : row)].join("\n"));
  assert.deepEqual(plain(result.summary), { totalRows: 100, validRows: 52, invalidRows: 48, totalAmount: "6526.00" });
  assert.equal(result.rows.filter((item) => item.status === "invalid").length, 48);
});
for (const count of [0, 9, 10, 500, 501]) {
  test(`row-count boundary ${count} preserves current rule`, () => {
    const result = csv.validateBatchCsv(file(count));
    assert.equal(result.isValid, count >= 10 && count <= 500);
    assert.equal(result.summary.totalRows, count);
    assert.equal(result.canValidateRows, true);
  });
}
for (const invalidHeader of ["account,iban,amount,reference", "from_account_id,to_iban,amount", `${header},extra`]) {
  test(`structural header error blocks row approval: ${invalidHeader}`, () => {
    const result = csv.validateBatchCsv(file().replace(header, invalidHeader));
    assert.equal(result.canValidateRows, false);
    assert.equal(result.rows.length, 0);
    assert.deepEqual(plain(result.summary), { totalRows: 10, validRows: null, invalidRows: null, totalAmount: null });
  });
}
for (const bad of ["1,ABC,10,unquoted\"", '1,ABC,10,"unclosed', '1,ABC,10,"closed"x']) {
  test(`malformed CSV blocks all approval (${bad})`, () => {
    const result = csv.validateBatchCsv(`${file()}\n${bad}`);
    assert.equal(result.canValidateRows, false);
    assert.equal(result.rows.length, 0);
    assert.equal(result.summary.totalRows, null);
  });
}
test("quoted commas and escaped quotes", () => {
  const result = csv.validateBatchCsv(file(10, '1,SE8550000000054910000003,10,"Company, ""AB"""'));
  assert.equal(result.isValid, true);
  assert.equal(result.rows[0].reference, 'Company, "AB"');
});
test("source lines survive blank lines and multiline quoted fields", () => {
  const result = csv.validateBatchCsv([header, "", '1,SE8550000000054910000003,10,"line one\r\nline two"', "", ...Array(9).fill(row)].join("\r\n"));
  assert.equal(result.isValid, true);
  assert.equal(result.rows[0].rowNumber, 3);
  assert.equal(result.rows[1].rowNumber, 6);
  assert.equal(result.rows[1].recordNumber, 2);
});
test("BOM and surrounding header whitespace preserve existing behavior", () => {
  assert.equal(csv.validateBatchCsv(file().replace(header, `\uFEFF ${header} `)).isValid, true);
});
for (const badRow of ["1,ABC,10", "1,ABC,10,Ref,extra", "0,ABC,10,Ref", "-1,ABC,10,Ref",
  "1000000000,ABC,10,Ref", "1,,10,Ref", "1,A!B,10,Ref", `1,${"A".repeat(35)},10,Ref`,
  "1,ABC,,Ref", "1,ABC,0,Ref", "1,ABC,-1,Ref", "1,ABC,Infinity,Ref", "1,ABC,NaN,Ref",
  `1,ABC,10,${"x".repeat(101)}`]) {
  test(`row-level error does not invalidate trustworthy rows (${badRow.slice(0, 40)})`, () => {
    const result = csv.validateBatchCsv(`${file(9)}\n${badRow}`);
    assert.equal(result.canValidateRows, true);
    assert.equal(result.summary.validRows, 9);
    assert.equal(result.summary.invalidRows, 1);
    assert.ok(result.rows[9].errors.length > 0);
  });
}
test("existing IBAN/amount/reference behavior is not silently tightened", () => {
  const result = csv.validateBatchCsv(file(10, "1, ab c ,0x10,"));
  assert.equal(result.isValid, true);
  assert.equal(result.rows[0].normalizedToIban, "ABC");
  assert.equal(csv.BATCH_MAX_FILE_SIZE_BYTES, 1048576);
});
for (const [total, page, size, expected] of [[0, 1, 5, [0, 0, 0]], [23, 1, 5, [1, 0, 5]],
  [23, 99, 5, [5, 20, 23]], [48, 5, 10, [5, 40, 48]]]) {
  test(`client pagination ${total}/${page}/${size}`, () => {
    const result = pagination.getBatchPagination(total, page, size);
    assert.deepEqual([result.page, result.start, result.end], expected);
  });
}
test("page slots are dynamic with bounded ellipses", () => {
  assert.deepEqual(plain(pagination.getBatchPageSlots(50, 25)), [1, "leading", 24, 25, 26, "trailing", 50]);
});
for (const args of [[-1, 1, 10], [10, 0, 10], [10, 1, 0], [1.5, 1, 10]]) {
  test(`invalid pagination input ${args}`, () => assert.throws(() => pagination.getBatchPagination(...args)));
}
test("cursor history revisits reached pages and truncates changed forward history", () => {
  let history = { cursors: [undefined], index: 0 };
  history = pagination.commitBatchCursor(history, 1, "cursor-B", "cursor-C");
  history = pagination.commitBatchCursor(history, 2, "cursor-C", null);
  history = pagination.commitBatchCursor(history, 0, undefined, "cursor-B");
  assert.equal(history.cursors.length, 3);
  history = pagination.commitBatchCursor(history, 0, undefined, "changed-B");
  assert.equal(history.cursors.length, 1);
  assert.throws(() => pagination.commitBatchCursor(history, 5, "fake", null));
});
test("row search includes actual error messages and respects status", () => {
  const result = csv.validateBatchCsv(`${file(9)}\n0,ABC,10,Ref`);
  assert.equal(filtering.filterBatchRows(result.rows, "invalid", "större än 0").length, 1);
  assert.equal(filtering.filterBatchRows(result.rows, "valid", "större än 0").length, 0);
});

const fixtures = await loadModule("dev/batchFixtures.ts");
test("history filtering and stable sorting use actual fixture fields", () => {
  const all = fixtures.batchFixtures;
  const query = { ...filtering.DEFAULT_BATCH_QUERY, search: "SUPPLIER", fileType: "Supplier", status: "completed", sort: "name" };
  const result = filtering.filterBatchHistory(all, query);
  assert.ok(result.length > 0);
  assert.ok(result.every((item) => `${item.name} ${item.fileType}`.toUpperCase().includes("SUPPLIER") && item.status === "completed"));
  assert.deepEqual(plain(result.map((item) => item.name)), plain(result.map((item) => item.name).sort((a, b) => a.localeCompare(b, "sv-SE"))));
});
test("cursor fixture source exposes no invented total and reaches end", async () => {
  const controller = new AbortController();
  let cursor;
  const ids = [];
  do {
    const page = await fixtures.readFixturePage(filtering.DEFAULT_BATCH_QUERY, cursor, controller.signal, "cursor", null);
    assert.equal(page.total, null);
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor !== null);
  assert.equal(ids.length, 23);
  assert.equal(new Set(ids).size, 23);
});
test("aborted fixture reads reject", async () => {
  const controller = new AbortController();
  const pending = fixtures.readFixturePage(filtering.DEFAULT_BATCH_QUERY, undefined, controller.signal, "cursor", "slow");
  controller.abort();
  await assert.rejects(pending, { name: "AbortError" });
});
test("development error, empty and missing detail states", async () => {
  const signal = new AbortController().signal;
  await assert.rejects(fixtures.readFixturePage(filtering.DEFAULT_BATCH_QUERY, undefined, signal, "client", "error"));
  const empty = await fixtures.readFixturePage(filtering.DEFAULT_BATCH_QUERY, undefined, signal, "client", "empty");
  assert.equal(empty.items.length, 0);
  assert.equal(await fixtures.readFixtureDetail("missing", signal, null), null);
  assert.equal((await fixtures.readFixtureDetail("fixture-4", signal, null)).validation.summary.invalidRows, 48);
});
test("production cannot enable fixtures even with preview query", async () => {
  const source = await loadModule("data/batchHistorySource.ts", false);
  const adapter = source.createBatchHistorySource("fixtures", "cursor", null);
  assert.equal(adapter.kind, "unavailable");
  await assert.rejects(adapter.list(filtering.DEFAULT_BATCH_QUERY, undefined, new AbortController().signal), { name: "BatchHistoryUnavailable" });
});
