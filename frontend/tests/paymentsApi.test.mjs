import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import ts from "typescript";

const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));

async function loadModule(relativePath, fetchHandler = () => {
  throw new Error("Unexpected request in isolated test");
}) {
  const context = vm.createContext({ fetch: fetchHandler, Headers });
  const modules = new Map();

  async function load(filename) {
    if (modules.has(filename)) return modules.get(filename);

    const source = await readFile(filename, "utf8");
    const { outputText } = ts.transpileModule(source, {
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    });
    const module = new vm.SourceTextModule(outputText, {
      context,
      identifier: filename,
      initializeImportMeta(meta) {
        meta.env = { VITE_API_URL: "http://payment.test" };
      },
    });
    modules.set(filename, module);
    await module.link((specifier, parent) =>
      load(path.resolve(path.dirname(parent.identifier), `${specifier}.ts`))
    );
    return module;
  }

  const module = await load(path.resolve(sourceRoot, relativePath));
  await module.evaluate();
  return module.namespace;
}

const amounts = await loadModule("utils/paymentAmount.ts");

for (const [input, expected] of [
  ["1250.50", 1250.5], ["0.01", 0.01], ["0.29", 0.29],
  [".50", 0.5], ["1", 1], ["1.2300", 1.23], [" 00125.50 ", 125.5],
  ["50000.00", 50000], ["200000.01", 200000.01],
  ["9999999999999.99", 9999999999999.99],
]) {
  test(`amount ${JSON.stringify(input)} preserves its value as JSON number`, () => {
    const parsed = amounts.parsePaymentAmount(input);
    assert.equal(parsed, expected);
    assert.equal(typeof JSON.parse(JSON.stringify({ amount: parsed })).amount, "number");
  });
}

for (const input of [
  "", " ", ".", "0", "0.00", "-1", "-0.01", "NaN", "Infinity",
  "-Infinity", "abc", "1,25", "0x10", "1.23x", "0.001", "1.234",
  "1.2301", "1e309", "90071992547409.91", "9007199254740993.01",
]) {
  test(`invalid or lossy amount ${JSON.stringify(input)} is rejected`, () => {
    assert.equal(amounts.parsePaymentAmount(input), null);
  });
}

const request = {
  fromAccountId: 1,
  toIban: "SE4550000000054910000099",
  amount: 1250.5,
  reference: "Payment test",
};
const paymentResponse = {
  ...request,
  id: 42,
  status: "completed",
  amount: "1250.50",
  currency: "SEK",
  createdAt: "2026-10-08T09:00:00Z",
};

for (const status of ["completed", "pending_approval"]) {
  test(`creation sends numeric amount with shared cookie/CSRF auth (${status})`, async () => {
    const calls = [];
    const api = await loadModule("api/paymentsApi.ts", async (url, options) => {
      calls.push({ url, options });
      return calls.length === 1
        ? Response.json({ requestToken: "isolated-csrf" })
        : Response.json({ ...paymentResponse, status }, { status: 201 });
    });

    const result = await api.createPayment(request);

    assert.equal(calls.length, 2);
    assert.equal(calls[0].url, "http://payment.test/api/auth/csrf");
    assert.equal(calls[0].options.credentials, "include");
    const post = calls[1];
    assert.equal(post.url, "http://payment.test/api/payments");
    assert.equal(post.options.method, "POST");
    assert.equal(post.options.credentials, "include");
    assert.equal(post.options.headers.get("X-CSRF-TOKEN"), "isolated-csrf");
    assert.equal(post.options.headers.get("Authorization"), null);
    assert.deepEqual(JSON.parse(post.options.body), request);
    assert.equal(typeof JSON.parse(post.options.body).amount, "number");
    assert.equal(result.amount, "1250.50");
    assert.equal(result.status, status);
  });
}

for (const amount of ["1250.50", NaN, Infinity, -Infinity, 0, -1, 0.001, 0.1 + 0.2]) {
  test(`API rejects invalid numeric request ${String(amount)} before any fetch`, async () => {
    const api = await loadModule("api/paymentsApi.ts");
    await assert.rejects(api.createPayment({ ...request, amount }), /giltigt belopp/);
  });
}

for (const [status, body, message] of [
  [400, { detail: "Beloppet måste vara större än 0." }, /Beloppet måste/],
  [400, { message: "Mottagarkonto måste anges." }, /Mottagarkonto/],
  [401, null, /Kunde inte skapa betalningen/],
  [403, null, /Kunde inte skapa betalningen/],
  [409, { detail: "Kontot ändrades av en annan betalning." }, /Kontot ändrades/],
  [500, null, /Kunde inte skapa betalningen/],
]) {
  test(`HTTP ${status} rejects creation without retry or false success`, async () => {
    let calls = 0;
    const api = await loadModule("api/paymentsApi.ts", async () => {
      calls += 1;
      return calls === 1
        ? Response.json({ requestToken: "isolated-csrf" })
        : body ? Response.json(body, { status }) : new Response(null, { status });
    });
    await assert.rejects(api.createPayment(request), message);
    assert.equal(calls, 2);
  });
}

test("failed CSRF preparation never sends a payment", async () => {
  let calls = 0;
  const api = await loadModule("api/paymentsApi.ts", async () => {
    calls += 1;
    return new Response(null, { status: 400 });
  });
  await assert.rejects(api.createPayment(request), /förbereda anropet/);
  assert.equal(calls, 1);
});

test("recent payments still read real dashboard string amounts without CSRF", async () => {
  let calls = 0;
  const api = await loadModule("api/paymentsApi.ts", async (url, options) => {
    calls += 1;
    assert.equal(url, "http://payment.test/api/dashboard");
    assert.equal(options.credentials, "include");
    return Response.json({
      recentPayments: [paymentResponse], user: null, tenantName: null,
      pendingApprovals: [],
    });
  });
  const result = await api.getRecentPayments();
  assert.equal(calls, 1);
  assert.equal(result.recentPayments[0].amount, "1250.50");
});
