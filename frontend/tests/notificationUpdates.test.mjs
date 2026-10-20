import assert from "node:assert/strict";
import test from "node:test";
import { createBrowser, createFetch, deferred, loadProductionModule } from "./notificationHarness.mjs";

const stepId = "3f2b7c1e-8a4d-4b6a-9d52-1c0e7f5a9b34";
const token = { requestToken: "test-csrf" };
const paymentRequest = { fromAccountId: 1, toIban: "SE4550000000054910000099", amount: 1250.5, reference: "Faktura" };
const savedPayment = { ...paymentRequest, id: 42, amount: "1250.50", currency: "SEK", status: "pending_approval", createdAt: "2026-10-20T10:00:00Z" };
const decision = (values = {}) => ({ paymentId: 42, approvalStepId: stepId, stepStatus: "approved", paymentStatus: "completed", ...values });

async function loadApi(module, responses) {
  const browser = createBrowser();
  const events = [];
  browser.window.addEventListener("seb:approvals-updated", (event) => events.push(event));
  const api = createFetch(responses);
  return {
    api: await loadProductionModule(`api/${module}.ts`, { globals: { ...browser.globals, fetch: api.fetch } }),
    calls: api.calls, events,
  };
}

test("a saved decision publishes one approval update only after its response has been verified", async () => {
  const delayed = deferred();
  const loaded = await loadApi("approvalsApi", [token, delayed.promise]);
  const result = loaded.api.decideApproval(stepId, { action: "approve" });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loaded.calls.length, 2);
  assert.equal(loaded.events.length, 0);
  delayed.resolve(decision());
  assert.equal((await result).paymentId, 42);
  assert.equal(loaded.events.length, 1);
  assert.equal(loaded.events[0].type, "seb:approvals-updated");
});

test("both intermediate approval and rejection refresh notification consumers", async () => {
  for (const [action, result] of [
    ["approve", decision({ paymentStatus: "pending_approval" })],
    ["reject", decision({ stepStatus: "rejected", paymentStatus: "rejected" })],
  ]) {
    const loaded = await loadApi("approvalsApi", [token, result]);
    await loaded.api.decideApproval(stepId, { action });
    assert.equal(loaded.events.length, 1);
  }
});

test("failed or unverifiable decisions never publish a saved-payment update", async () => {
  for (const response of [
    Response.json({ detail: "already handled" }, { status: 409 }),
    new Response("not-json", { status: 200 }),
    {},
    decision({ approvalStepId: "different-step" }),
    decision({ stepStatus: "pending" }),
    { error: new TypeError("Connection lost") },
  ]) {
    const loaded = await loadApi("approvalsApi", [token, response]);
    await assert.rejects(loaded.api.decideApproval(stepId, { action: "approve" }));
    assert.equal(loaded.events.length, 0);
    assert.equal(loaded.calls.length, 2);
  }
});

test("a created payment publishes an update for both pending approval and immediate completion", async () => {
  for (const status of ["pending_approval", "completed"]) {
    const loaded = await loadApi("paymentsApi", [token, { ...savedPayment, status }]);
    const result = await loaded.api.createPayment(paymentRequest);
    assert.equal(result.status, status);
    assert.equal(loaded.events.length, 1);
    assert.equal(loaded.calls[1].options.method, "POST");
    assert.equal(loaded.calls[1].options.credentials, "include");
    assert.equal(loaded.calls[1].options.headers.get("X-CSRF-TOKEN"), "test-csrf");
  }
});

test("payment creation failures or incomplete responses do not publish an update", async () => {
  for (const response of [
    Response.json({}, { status: 403 }), {}, { id: 42 }, new Response("unreadable"),
    { error: new TypeError("Connection lost") },
  ]) {
    const loaded = await loadApi("paymentsApi", [token, response]);
    await assert.rejects(loaded.api.createPayment(paymentRequest));
    assert.equal(loaded.events.length, 0);
    assert.equal(loaded.calls.length, 2);
  }
});
