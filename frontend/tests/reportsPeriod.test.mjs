import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule } from "node:vm";
import ts from "typescript";

// Execute the production date helper in its own realm, as with the API tests.
async function loadPeriodModule() {
  const context = createContext({});
  const modules = new Map();

  async function loadModule(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const source = await readFile(url, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ESNext,
      },
    });
    const module = new SourceTextModule(outputText, { context, identifier: url.href });
    modules.set(url.href, module);
    await module.link((specifier, parent) =>
      loadModule(new URL(`${specifier}.ts`, parent.identifier))
    );
    return module;
  }

  const module = await loadModule(new URL("../src/utils/reportPeriod.ts", import.meta.url));
  await module.evaluate();
  return module.namespace;
}

const { getDefaultReportPeriod, getReportPeriodError } = await loadPeriodModule();

for (const [description, now, from, to] of [
  ["the current month", "2026-10-08T12:30:00Z", "2026-10-01", "2026-10-08"],
  ["Stockholm's month boundary", "2026-09-30T22:30:00Z", "2026-10-01", "2026-10-01"],
  ["Stockholm's midnight boundary", "2026-10-08T22:30:00Z", "2026-10-01", "2026-10-09"],
  ["the winter offset", "2026-01-31T23:30:00Z", "2026-02-01", "2026-02-01"],
  ["a leap month", "2024-02-29T12:00:00Z", "2024-02-01", "2024-02-29"],
]) {
  test(`the default report period uses ${description} in Europe/Stockholm`, () => {
    const result = getDefaultReportPeriod(new Date(now));

    assert.equal(result.from, from);
    assert.equal(result.to, to);
    assert.equal(getReportPeriodError(result.from, result.to), null);
  });
}

for (const [description, from, to] of [
  ["a same-day report", "2026-10-08", "2026-10-08"],
  ["an inclusive month", "2026-10-01", "2026-10-31"],
  ["a valid leap day", "2024-02-29", "2024-02-29"],
  ["the lower supported year", "0001-01-01", "0001-01-01"],
  ["the last date that permits an exclusive upper boundary", "9999-12-30", "9999-12-30"],
]) {
  test(`period validation accepts ${description}`, () => {
    assert.equal(getReportPeriodError(from, to), null);
  });
}

for (const [description, from, to] of [
  ["a missing start", "", "2026-10-08"],
  ["a missing end", "2026-10-01", ""],
  ["both dates missing", "", ""],
  ["reversed dates", "2026-10-09", "2026-10-08"],
  ["an invalid start", "not-a-date", "2026-10-08"],
  ["an invalid end", "2026-10-01", "not-a-date"],
  ["a non-leap February 29", "2026-02-29", "2026-03-01"],
  ["a February 30", "2024-02-30", "2024-03-01"],
  ["April 31", "2026-04-01", "2026-04-31"],
  ["a zero month", "2026-00-01", "2026-10-08"],
  ["month 13", "2026-10-01", "2026-13-01"],
  ["a zero day", "2026-10-00", "2026-10-08"],
  ["an unpadded month", "2026-1-01", "2026-10-08"],
  ["an unpadded day", "2026-10-1", "2026-10-08"],
  ["leading whitespace", " 2026-10-01", "2026-10-08"],
  ["an ISO timestamp instead of a date", "2026-10-01T00:00:00Z", "2026-10-08"],
  ["year zero", "0000-01-01", "2026-10-08"],
  ["an end without a representable following day", "9999-12-30", "9999-12-31"],
  ["an out-of-range year", "10000-01-01", "10000-01-02"],
]) {
  test(`period validation rejects ${description}`, () => {
    const error = getReportPeriodError(from, to);

    assert.equal(typeof error, "string");
    assert.ok(error.length > 0);
  });
}
