import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule } from "node:vm";
import ts from "typescript";

const baseUrl = "http://dashboard.test";

async function loadApi(responses) {
  const calls = [];
  const context = createContext({
    Headers,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const next = responses[calls.length - 1];
      assert.ok(next, "Unexpected request or automatic retry");
      if (next.error) throw next.error;
      return new Response(next.rawBody ?? JSON.stringify(next.body), {
        status: next.status ?? 200,
      });
    },
    // Authorization must follow the authenticated dashboard response.
    localStorage: { getItem: () => JSON.stringify({ role: "admin" }) },
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
        meta.env = { VITE_API_URL: baseUrl };
      },
    });
    modules.set(url.href, module);
    await module.link((specifier, parent) =>
      loadModule(new URL(`${specifier}.ts`, parent.identifier))
    );
    return module;
  }

  const module = await loadModule(new URL("../src/api/dashboardApi.ts", import.meta.url));
  await module.evaluate();
  return { api: module.namespace, calls };
}

function dashboard(role) {
  return {
    user: { id: 1, tenantId: 1, name: "Dashboard user", email: "user@example.test", role },
    tenantName: "Dashboard tenant",
    accounts: [{ id: 1, accountName: "Företagskonto", iban: null, balance: "250.50", currency: "SEK" }],
    recentPayments: [{
      id: 42, toIban: null, amount: "125.50", currency: "SEK", reference: "Oktober",
      status: "pending_approval", createdAt: "2026-10-08T09:00:00Z",
    }],
    pendingApprovals: [],
  };
}

function assertRequests(calls, includeAudit) {
  assert.deepEqual(calls.map(({ url }) => url), [
    `${baseUrl}/api/dashboard`,
    ...(includeAudit ? [`${baseUrl}/api/audit-log?limit=3`] : []),
  ]);
  for (const { options } of calls) {
    assert.equal(options.method, "GET");
    assert.equal(options.credentials, "include");
    assert.equal(options.headers.has("X-CSRF-TOKEN"), false);
  }
}

test("unauthorized dashboard roles load without requesting protected activity", async () => {
  for (const role of ["initiator", "unknown", undefined]) {
    const { api, calls } = await loadApi([{ body: dashboard(role) }]);

    const result = await api.getDashboardData();

    assert.equal(result.user.role, role);
    assert.equal(result.accounts[0].balance, 250.5);
    assert.equal(result.payments[0].amount, 125.5);
    assert.equal(result.summary.totalBalance, 250.5);
    assert.equal(result.recentActivity.length, 0);
    assertRequests(calls, false);
  }
});

test("attestant and admin dashboards retain protected recent activity", async () => {
  for (const role of ["attestant", "admin"]) {
    const entries = [{ id: 5, action: "CREATE_PAYMENT", description: "Betalning skapad", createdAt: "2026-10-08T09:00:00Z" }];
    const { api, calls } = await loadApi([
      { body: dashboard(role) },
      { body: { entries } },
    ]);

    const result = await api.getDashboardData();

    assert.deepEqual([...result.recentActivity], entries);
    assert.equal(result.summary.totalBalance, 250.5);
    assertRequests(calls, true);
  }
});

test("an audit 403 preserves dashboard data without parsing its body or retrying", async () => {
  const { api, calls } = await loadApi([
    { body: dashboard("attestant") },
    { status: 403, rawBody: "unreadable forbidden response" },
  ]);

  const result = await api.getDashboardData();

  assert.equal(result.user.role, "attestant");
  assert.equal(result.accounts[0].balance, 250.5);
  assert.equal(result.payments.length, 1);
  assert.equal(result.recentActivity.length, 0);
  assertRequests(calls, true);
});

test("other audit HTTP failures still report the existing failure without retrying", async () => {
  for (const [status, expectedMessage] of [
    [401, /Logga in igen/],
    [500, /senaste aktiviteten/],
  ]) {
    const { api, calls } = await loadApi([
      { body: dashboard("admin") },
      { status, rawBody: "unreadable error response" },
    ]);

    await assert.rejects(api.getDashboardData(), expectedMessage);
    assertRequests(calls, true);
  }
});

test("dashboard HTTP failures still fail before requesting audit activity", async () => {
  for (const status of [401, 403, 500]) {
    const { api, calls } = await loadApi([{ status, body: {} }]);

    await assert.rejects(api.getDashboardData(), status === 401 ? /Logga in igen/ : /dashboarddata/);
    assertRequests(calls, false);
  }
});

test("an audit transport failure is not hidden as permission denial", async () => {
  const failure = new TypeError("Connection lost");
  const { api, calls } = await loadApi([
    { body: dashboard("admin") },
    { error: failure },
  ]);

  await assert.rejects(api.getDashboardData(), (error) => error === failure);
  assertRequests(calls, true);
});
