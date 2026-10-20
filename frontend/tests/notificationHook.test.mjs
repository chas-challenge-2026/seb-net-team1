import assert from "node:assert/strict";
import test from "node:test";
import {
  admin, createBrowser, createFetch, createHookHarness, deferred, inbox,
  loadProductionModule, pending,
} from "./notificationHarness.mjs";

async function loadHook(responses, user = admin) {
  const browser = createBrowser();
  const harness = createHookHarness(browser);
  const api = createFetch(responses);
  const { useApprovalNotifications } = await loadProductionModule("hooks/useApprovalNotifications.ts", {
    hooks: harness.hooks, globals: { ...browser.globals, fetch: api.fetch },
  });
  let currentUser = user;
  harness.setComponent(() => useApprovalNotifications(currentUser));
  await harness.settle();
  return {
    ...harness, browser, calls: api.calls,
    setUser(nextUser) { currentUser = nextUser; return harness.render(); },
    advance: (milliseconds) => browser.advance(milliseconds, harness.settle),
    async dispatch(target, type, values = {}) { target.dispatchEvent({ type, ...values }); return harness.settle(); },
  };
}

test("notification GET uses authenticated approval inbox and counts each payment once", async () => {
  const loaded = await loadHook([inbox([
    pending(11, { currentStep: 2, createdAt: "2026-10-19T10:00:00Z" }),
    pending(12),
    pending(11, { currentStep: 1, approvalStepId: "first-actionable-step", createdAt: "2026-10-19T10:00:00Z" }),
  ])]);
  const state = loaded.render();
  assert.equal(state.canApprove, true);
  assert.equal(state.isLoading, false);
  assert.equal(state.error, null);
  assert.deepEqual(Array.from(state.pending, (entry) => entry.paymentId), [12, 11]);
  assert.equal(state.pending[1].approvalStepId, "first-actionable-step");
  assert.equal(loaded.calls.length, 1);
  const request = loaded.calls[0];
  assert.equal(request.url, "http://notification.test/api/approvals");
  assert.equal(request.options.method, "GET");
  assert.equal(request.options.credentials, "include");
  assert.equal(request.options.headers.has("X-CSRF-TOKEN"), false);
  assert.equal(request.options.body, undefined);
  assert.equal(request.options.signal.aborted, false);
  loaded.unmount();
  assert.equal(request.options.signal.aborted, true);
});

test("only a valid admin or attestant identity can fetch notifications", async () => {
  for (const user of [
    null, { ...admin, role: "initiator" }, { ...admin, role: "unknown" },
    { ...admin, id: 0 }, { ...admin, id: "1" }, { ...admin, id: NaN },
    { ...admin, tenantId: 0 }, { ...admin, tenantId: undefined }, { ...admin, tenantId: "10" },
  ]) {
    const loaded = await loadHook([], user);
    assert.equal(loaded.render().canApprove, false);
    assert.equal(loaded.render().isLoading, false);
    assert.equal(loaded.render().pending.length, 0);
    loaded.render().refresh();
    await loaded.settle();
    await loaded.dispatch(loaded.browser.window, "focus");
    await loaded.advance(60_000);
    assert.equal(loaded.calls.length, 0, `Unexpected GET for ${JSON.stringify(user)}`);
    loaded.unmount();
  }
  const attestant = await loadHook([inbox()], { ...admin, role: "attestant" });
  assert.equal(attestant.render().canApprove, true);
  assert.equal(attestant.calls.length, 1);
  attestant.unmount();
});

test("notifications poll every 30 seconds only while visible and refresh on browser/app events", async () => {
  const loaded = await loadHook(Array.from({ length: 8 }, () => inbox()));
  await loaded.advance(29_999);
  assert.equal(loaded.calls.length, 1);
  await loaded.advance(1);
  assert.equal(loaded.calls.length, 2);
  loaded.browser.document.visibilityState = "hidden";
  await loaded.advance(60_000);
  await loaded.dispatch(loaded.browser.window, "focus");
  await loaded.dispatch(loaded.browser.window, "seb:approvals-updated");
  assert.equal(loaded.calls.length, 2);

  loaded.browser.document.visibilityState = "visible";
  await loaded.dispatch(loaded.browser.document, "visibilitychange");
  assert.equal(loaded.calls.length, 3);
  await loaded.dispatch(loaded.browser.window, "focus");
  assert.equal(loaded.calls.length, 4);
  await loaded.dispatch(loaded.browser.window, "seb:approvals-updated");
  assert.equal(loaded.calls.length, 5);
  loaded.render().refresh();
  await loaded.settle();
  assert.equal(loaded.calls.length, 6);
  await loaded.dispatch(loaded.browser.window, "storage", { key: "unrelated-setting" });
  assert.equal(loaded.calls.length, 6);
  await loaded.dispatch(loaded.browser.window, "storage", { key: "user" });
  assert.equal(loaded.calls.length, 7);

  loaded.unmount();
  assert.equal(loaded.browser.timerCount(), 0);
  for (const event of ["focus", "storage", "seb:approvals-updated"]) assert.equal(loaded.browser.window.listenerCount(event), 0);
  assert.equal(loaded.browser.document.listenerCount("visibilitychange"), 0);
  await loaded.advance(60_000);
  assert.equal(loaded.calls.length, 7);
});

test("identity changes hide old notifications immediately and ignore delayed previous-user responses", async () => {
  for (const nextUser of [{ ...admin, id: 2 }, { ...admin, tenantId: 20 }, { ...admin, role: "attestant" }]) {
    const stale = deferred();
    const loaded = await loadHook([inbox([pending(1)]), stale.promise, inbox([pending(22)])]);
    loaded.render().refresh();
    await loaded.settle();
    assert.equal(loaded.render().isLoading, true);
    assert.equal(loaded.render().pending[0].paymentId, 1, "Refreshing the same user retains their existing items");
    const oldRequest = loaded.calls[1];

    const beforeEffects = loaded.setUser(nextUser);
    assert.equal(beforeEffects.pending.length, 0, "Previous identity must never flash during a user/tenant/role switch");
    await loaded.settle();
    assert.equal(oldRequest.options.signal.aborted, true);
    assert.deepEqual(Array.from(loaded.render().pending, (entry) => entry.paymentId), [22]);
    stale.resolve(inbox([pending(99)]));
    await loaded.settle();
    assert.deepEqual(Array.from(loaded.render().pending, (entry) => entry.paymentId), [22]);
    loaded.setUser({ ...admin, role: "initiator" });
    await loaded.settle();
    assert.equal(loaded.render().pending.length, 0);
    assert.equal(loaded.render().canApprove, false);
    assert.equal(loaded.calls.length, 3);
    loaded.unmount();
  }
});

test("failed notification refresh clears stale items and exposes safe recoverable error state", async () => {
  const delayed = deferred();
  const loaded = await loadHook([
    inbox([pending(1)]), delayed.promise, inbox([pending(2)]),
  ]);
  loaded.render().refresh();
  await loaded.settle();
  assert.equal(loaded.render().isLoading, true);
  delayed.resolve(Response.json({ detail: "Internal database password" }, { status: 503 }));
  await loaded.settle();
  assert.equal(loaded.render().isLoading, false);
  assert.equal(loaded.render().pending.length, 0);
  assert.equal(loaded.render().error.status, 503);
  assert.doesNotMatch(loaded.render().error.message, /password|database/);
  loaded.render().refresh();
  await loaded.settle();
  assert.equal(loaded.render().error, null);
  assert.equal(loaded.render().pending[0].paymentId, 2);
  loaded.unmount();
});

test("authorization failures stop automatic polling without exposing server details", async () => {
  for (const status of [401, 403]) {
    const loaded = await loadHook([Response.json({ detail: "Connection secret" }, { status })]);
    assert.equal(loaded.render().error.status, status);
    assert.equal(loaded.render().pending.length, 0);
    assert.doesNotMatch(loaded.render().error.message, /Connection secret/);
    await loaded.advance(90_000);
    assert.equal(loaded.calls.length, 1);
    loaded.unmount();
  }
});

test("unmount aborts a pending notification GET and a late response remains ignored", async () => {
  const delayed = deferred();
  const loaded = await loadHook([delayed.promise]);
  assert.equal(loaded.render().isLoading, true);
  loaded.unmount();
  assert.equal(loaded.calls[0].options.signal.aborted, true);
  delayed.resolve(inbox([pending(88)]));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(loaded.render().pending.length, 0);
  assert.equal(loaded.browser.timerCount(), 0);
});
