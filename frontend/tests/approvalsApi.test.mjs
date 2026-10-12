import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule } from "node:vm";
import ts from "typescript";

const baseUrl = "http://localhost:8081";
const stepId = "3f2b7c1e-8a4d-4b6a-9d52-1c0e7f5a9b34";
const decisionPath = `/api/approvals/${stepId}/decision`;

// Run the production TypeScript modules with Vite's import.meta.env and only
// fetch replaced. This exercises URL construction, cookies and CSRF together.
async function loadApi(responses, configuredApiUrl = baseUrl) {
  const calls = [];
  const context = createContext({
    Headers,
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      const next = responses[calls.length - 1];
      assert.ok(next, "Unexpected request or automatic retry");
      if (next.error) throw next.error;
      return new Response(
        next.rawBody ?? JSON.stringify(next.body),
        { status: next.status ?? 200 }
      );
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

  const module = await loadModule(new URL("../src/api/approvalsApi.ts", import.meta.url));
  await module.evaluate();
  return { api: module.namespace, calls };
}

function assertDecisionRequests(calls, expectedBody) {
  assert.equal(calls.length, 2, "One CSRF request and one decision, without retries");
  assert.equal(calls[0].url, `${baseUrl}/api/auth/csrf`);
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[1].url, `${baseUrl}${decisionPath}`);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.credentials, "include");
  assert.equal(calls[1].options.headers.get("Content-Type"), "application/json");
  assert.equal(calls[1].options.headers.get("X-CSRF-TOKEN"), "fresh-token");
  assert.deepEqual(JSON.parse(calls[1].options.body), expectedBody);
}

test("inbox GET sends cookies and the abort signal without requesting CSRF", async () => {
  const inbox = { pending: [], recentlyHandled: [] };
  const { api, calls } = await loadApi([{ body: inbox }]);
  const controller = new AbortController();

  assert.deepEqual(await api.getApprovalInbox({ signal: controller.signal }), inbox);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, `${baseUrl}/api/approvals`);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.signal, controller.signal);
  assert.equal(calls[0].options.headers.has("X-CSRF-TOKEN"), false);
});

test("an empty configured API URL uses same-origin requests in Docker", async () => {
  const { api, calls } = await loadApi([
    { body: { requestToken: "fresh-token" } },
    { body: { paymentId: 42, approvalStepId: stepId, stepStatus: "rejected", paymentStatus: "rejected" } },
  ], "");

  await api.decideApproval(stepId, { action: "reject" });
  assert.deepEqual(calls.map((call) => call.url), ["/api/auth/csrf", decisionPath]);
});

for (const [action, stepStatus, paymentStatus] of [
  ["approve", "approved", "completed"],
  ["approve", "approved", "pending_approval"],
  ["reject", "rejected", "rejected"],
]) {
  test(`${action} returns the backend's ${paymentStatus} status and sends a secured POST`, async () => {
    const decision = { paymentId: 42, approvalStepId: stepId, stepStatus, paymentStatus };
    const { api, calls } = await loadApi([
      { body: { requestToken: "fresh-token" } },
      { body: decision },
    ]);
    const request = { action, comment: "Granskat ärende" };

    assert.deepEqual(await api.decideApproval(stepId, request), decision);
    assertDecisionRequests(calls, request);
  });
}

for (const status of [400, 401, 403, 404, 409, 500]) {
  test(`HTTP ${status} rejects the decision and never retries the POST`, async () => {
    const { api, calls } = await loadApi([
      { body: { requestToken: "fresh-token" } },
      { status, body: { status, title: "Error", detail: "Database connection contains a secret" } },
    ]);
    const request = { action: "approve" };

    await assert.rejects(api.decideApproval(stepId, request), (error) => {
      assert.ok(error instanceof api.ApprovalDecisionApiError);
      assert.equal(error.status, status);
      assert.ok(error.message.length > 0);
      assert.equal(error.message.includes("secret"), false);
      return true;
    });
    assertDecisionRequests(calls, request);
  });
}

for (const [status, detail] of [
  [400, "Kontot har inte tillräckligt saldo för denna betalning."],
  [409, "Det här atteststeget är redan hanterat."],
  [409, "Du har redan godkänt den här betalningen. En annan attestant måste godkänna nästa steg."],
]) {
  test(`HTTP ${status} displays the known business error: ${detail}`, async () => {
    const { api, calls } = await loadApi([
      { body: { requestToken: "fresh-token" } },
      { status, body: { status, detail } },
    ]);

    await assert.rejects(api.decideApproval(stepId, { action: "approve" }), (error) => {
      assert.equal(error.status, status);
      assert.equal(error.message, detail);
      return true;
    });
    assert.equal(calls.length, 2);
  });
}

test("an empty non-JSON error still rejects the decision with its HTTP status", async () => {
  const { api, calls } = await loadApi([
    { body: { requestToken: "fresh-token" } },
    { status: 503, rawBody: "" },
  ]);

  await assert.rejects(api.decideApproval(stepId, { action: "approve" }), (error) => {
    assert.ok(error instanceof api.ApprovalDecisionApiError);
    assert.equal(error.status, 503);
    return true;
  });
  assert.equal(calls.length, 2);
});

for (const csrfResponse of [
  { status: 401, body: {} },
  { body: { requestToken: "" } },
  { body: {} },
]) {
  test(`a failed or missing CSRF token prevents the decision POST (${JSON.stringify(csrfResponse)})`, async () => {
    const { api, calls } = await loadApi([csrfResponse]);

    await assert.rejects(api.decideApproval(stepId, { action: "approve" }), (error) => {
      assert.ok(error instanceof api.ApprovalDecisionApiError);
      assert.equal(error.status, 0);
      return true;
    });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, `${baseUrl}/api/auth/csrf`);
  });
}

test("a network failure after the decision POST requires refresh and never retries", async () => {
  const { api, calls } = await loadApi([
    { body: { requestToken: "fresh-token" } },
    { error: new TypeError("Connection lost after sending the decision") },
  ]);

  await assert.rejects(api.decideApproval(stepId, { action: "approve" }), (error) => {
    assert.ok(error instanceof api.ApprovalDecisionApiError);
    assert.equal(error.status, 0);
    assert.match(error.message, /Uppdatera listan/);
    return true;
  });
  assertDecisionRequests(calls, { action: "approve" });
});

test("an unreadable success response requires checking the inbox before another decision", async () => {
  const { api, calls } = await loadApi([
    { body: { requestToken: "fresh-token" } },
    { rawBody: "not-json" },
  ]);

  await assert.rejects(api.decideApproval(stepId, { action: "approve" }), (error) => {
    assert.ok(error instanceof api.ApprovalDecisionApiError);
    assert.equal(error.status, 200);
    assert.match(error.message, /Uppdatera listan/);
    return true;
  });
  assertDecisionRequests(calls, { action: "approve" });
});

for (const [description, action, response] of [
  ["null", "approve", null],
  ["an array", "approve", []],
  ["missing decision fields", "approve", {}],
  ["a different approval step", "approve", {
    paymentId: 42, approvalStepId: "a2a6f3ca-d03f-4b28-acab-3e2fd8802356",
    stepStatus: "approved", paymentStatus: "completed",
  }],
  ["an invalid payment id", "approve", {
    paymentId: 0, approvalStepId: stepId, stepStatus: "approved", paymentStatus: "completed",
  }],
  ["rejection when approval was requested", "approve", {
    paymentId: 42, approvalStepId: stepId, stepStatus: "rejected", paymentStatus: "rejected",
  }],
  ["approval when rejection was requested", "reject", {
    paymentId: 42, approvalStepId: stepId, stepStatus: "approved", paymentStatus: "completed",
  }],
  ["an unknown payment status", "approve", {
    paymentId: 42, approvalStepId: stepId, stepStatus: "approved", paymentStatus: "failed",
  }],
]) {
  test(`HTTP 200 with ${description} cannot be shown as a saved decision`, async () => {
    const { api, calls } = await loadApi([
      { body: { requestToken: "fresh-token" } },
      { body: response },
    ]);

    await assert.rejects(api.decideApproval(stepId, { action }), (error) => {
      assert.ok(error instanceof api.ApprovalDecisionApiError);
      assert.equal(error.status, 200);
      assert.match(error.message, /Uppdatera listan/);
      return true;
    });
    assertDecisionRequests(calls, { action });
  });
}
