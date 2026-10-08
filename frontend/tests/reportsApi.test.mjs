import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule } from "node:vm";
import ts from "typescript";

const baseUrl = "http://localhost:8081";
const period = { from: "2026-10-01", to: "2026-10-08" };
const reportPath = "/api/reports/payments?from=2026-10-01&to=2026-10-08";

// Load the real API and its shared request client. Only the transport and
// Vite environment are replaced, so cookies, URL building and CSRF are tested.
async function loadApi(responses, configuredApiUrl = baseUrl) {
  const calls = [];
  const context = createContext({
    Headers,
    URLSearchParams,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const next = responses[calls.length - 1];
      assert.ok(next, "Unexpected request or automatic retry");
      if (next.error) throw next.error;
      return new Response(next.rawBody ?? JSON.stringify(next.body), {
        status: next.status ?? 200,
      });
    },
  });
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
    const module = new SourceTextModule(outputText, {
      context,
      identifier: url.href,
      initializeImportMeta: (meta) => {
        meta.env = { VITE_API_URL: configuredApiUrl };
      },
    });
    modules.set(url.href, module);
    await module.link((specifier, parent) =>
      loadModule(new URL(`${specifier}.ts`, parent.identifier))
    );
    return module;
  }

  const module = await loadModule(new URL("../src/api/reportsApi.ts", import.meta.url));
  await module.evaluate();
  return { api: module.namespace, calls };
}

function payment(overrides = {}) {
  return {
    id: 42,
    reference: "Faktura oktober",
    toIban: "SE4550000000058398257466",
    fromAccountName: "Företagskonto",
    amount: "1250.00",
    currency: "SEK",
    status: "completed",
    createdAt: "2026-10-05T12:30:00Z",
    ...overrides,
  };
}

function report(overrides = {}) {
  return {
    ...period,
    timeZone: "Europe/Stockholm",
    payments: [payment()],
    ...overrides,
  };
}

function assertReportRequest(calls, expectedUrl = `${baseUrl}${reportPath}`) {
  assert.equal(calls.length, 1, "A report uses one GET without CSRF or retries");
  assert.equal(calls[0].url, expectedUrl);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[0].options.headers.has("X-CSRF-TOKEN"), false);
  assert.equal(calls[0].options.body, undefined);
}

test("report GET sends dates, cookies and the abort signal without CSRF", async () => {
  const expected = report();
  const { api, calls } = await loadApi([{ body: expected }]);
  const controller = new AbortController();

  assert.deepEqual(await api.getPaymentReport({ ...period, signal: controller.signal }), expected);
  assertReportRequest(calls);
  assert.equal(calls[0].options.signal, controller.signal);
});

test("an empty configured API URL fetches the report from the same origin", async () => {
  const { api, calls } = await loadApi([{ body: report() }], "");

  await api.getPaymentReport(period);
  assertReportRequest(calls, reportPath);
});

test("date query values cannot inject additional URL parameters", async () => {
  const requested = { from: "2026-10-01&extra=value", to: "2026-10-08#fragment" };
  const { api, calls } = await loadApi([{ status: 400, body: {} }]);

  await assert.rejects(api.getPaymentReport(requested));
  assert.equal(calls.length, 1);
  const url = new URL(calls[0].url);
  assert.equal(url.pathname, "/api/reports/payments");
  assert.equal(url.searchParams.get("from"), requested.from);
  assert.equal(url.searchParams.get("to"), requested.to);
  assert.equal(url.searchParams.has("extra"), false);
  assert.equal(url.hash, "");
});

test("an empty report is valid and preserves the backend's selected period", async () => {
  const expected = report({ payments: [] });
  const { api, calls } = await loadApi([{ body: expected }]);

  assert.deepEqual(await api.getPaymentReport(period), expected);
  assertReportRequest(calls);
});

test("reports include all backend statuses and nullable source account names", async () => {
  const expected = report({ payments: [
    payment({ id: 1, status: "completed" }),
    payment({ id: 2, status: "pending_approval" }),
    payment({ id: 3, status: "rejected", fromAccountName: null }),
    payment({ id: 4, status: "processing" }),
  ] });
  const { api } = await loadApi([{ body: expected }]);

  assert.deepEqual(await api.getPaymentReport(period), expected);
});

test("decimal strings retain precision and UTC timestamps retain fractional seconds", async () => {
  const expected = report({ payments: [payment({
    amount: "9007199254740993.01",
    createdAt: "2026-10-05T12:30:00.1234567Z",
  })] });
  const { api } = await loadApi([{ body: expected }]);

  assert.deepEqual(await api.getPaymentReport(period), expected);
});

test("a saved payment without a reference remains a valid report entry", async () => {
  const expected = report({ payments: [payment({ reference: "" })] });
  const { api } = await loadApi([{ body: expected }]);

  assert.deepEqual(await api.getPaymentReport(period), expected);
});

for (const [status, expectedMessage] of [
  [400, /datum|period/i],
  [401, /logga in|inloggning/i],
  [403, /behörighet/i],
  [500, /rapport|försök igen/i],
]) {
  test(`HTTP ${status} returns a safe Swedish error with its status`, async () => {
    const { api, calls } = await loadApi([{
      status,
      body: { status, title: "Error", detail: "Connection secret: database-password" },
    }]);

    await assert.rejects(api.getPaymentReport(period), (error) => {
      assert.ok(error instanceof api.ReportApiError);
      assert.equal(error.status, status);
      assert.match(error.message, expectedMessage);
      assert.doesNotMatch(error.message, /Connection|secret|database-password/);
      return true;
    });
    assertReportRequest(calls);
  });
}

test("an empty non-JSON server error preserves the HTTP status", async () => {
  const { api, calls } = await loadApi([{ status: 503, rawBody: "" }]);

  await assert.rejects(api.getPaymentReport(period), (error) => {
    assert.ok(error instanceof api.ReportApiError);
    assert.equal(error.status, 503);
    assert.ok(error.message.length > 0);
    return true;
  });
  assertReportRequest(calls);
});

test("a network failure reaches the page without an automatic retry", async () => {
  const failure = new TypeError("Connection lost");
  const { api, calls } = await loadApi([{ error: failure }]);

  await assert.rejects(api.getPaymentReport(period), (error) => {
    assert.equal(error, failure, "The page handles the original transport error");
    return true;
  });
  assertReportRequest(calls);
});

test("malformed JSON cannot be returned as a report", async () => {
  const { api, calls } = await loadApi([{ rawBody: "not-json" }]);

  await assert.rejects(api.getPaymentReport(period), (error) => {
    assert.ok(error instanceof api.ReportApiError);
    assert.equal(error.status, 0, "Unreadable responses are client errors rather than HTTP errors");
    return true;
  });
  assertReportRequest(calls);
});

for (const [description, response] of [
  ["null", null],
  ["an array", []],
  ["missing report fields", {}],
  ["a different start date", report({ from: "2026-09-01" })],
  ["a different end date", report({ to: "2026-10-09" })],
  ["a different reporting time zone", report({ timeZone: "UTC" })],
  ["missing payments", report({ payments: undefined })],
  ["payments that are not an array", report({ payments: {} })],
  ["a null payment", report({ payments: [null] })],
  ["a nonpositive payment id", report({ payments: [payment({ id: 0 })] })],
  ["a noninteger payment id", report({ payments: [payment({ id: 1.5 })] })],
  ["a nonstring reference", report({ payments: [payment({ reference: null })] })],
  ["a nonstring destination IBAN", report({ payments: [payment({ toIban: 42 })] })],
  ["a nonstring account name", report({ payments: [payment({ fromAccountName: 42 })] })],
  ["a nonstring currency", report({ payments: [payment({ currency: null })] })],
  ["a nonstring status", report({ payments: [payment({ status: null })] })],
  ["an invalid timestamp", report({ payments: [payment({ createdAt: "invalid-date" })] })],
  ["a timestamp without UTC", report({ payments: [payment({ createdAt: "2026-10-05T12:30:00" })] })],
  ["a timestamp with a non-UTC offset", report({ payments: [payment({ createdAt: "2026-10-05T12:30:00+02:00" })] })],
  ["an impossible timestamp date", report({ payments: [payment({ createdAt: "2026-02-30T12:30:00Z" })] })],
  ["a numeric amount", report({ payments: [payment({ amount: 1250 })] })],
  ["an empty amount", report({ payments: [payment({ amount: "" })] })],
  ["a nonnumeric amount", report({ payments: [payment({ amount: "not-a-number" })] })],
  ["a nonfinite amount", report({ payments: [payment({ amount: "Infinity" })] })],
  ["a localized amount", report({ payments: [payment({ amount: "12,50" })] })],
  ["an exponential amount", report({ payments: [payment({ amount: "1e3" })] })],
]) {
  test(`HTTP 200 with ${description} cannot be shown as a valid report`, async () => {
    const { api, calls } = await loadApi([{ body: response }]);

    await assert.rejects(api.getPaymentReport(period), (error) => {
      assert.ok(error instanceof api.ReportApiError);
      assert.equal(error.status, 0, "Invalid report data is a client error rather than an HTTP error");
      assert.ok(error.message.length > 0);
      return true;
    });
    assertReportRequest(calls);
  });
}
