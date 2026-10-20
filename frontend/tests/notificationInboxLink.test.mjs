import assert from "node:assert/strict";
import test from "node:test";
import {
  createBrowser, createFetch, createHookHarness, deferred, find, findAll,
  inbox, loadProductionModule, pending,
} from "./notificationHarness.mjs";

async function loadInbox(responses, paymentId = "11") {
  const browser = createBrowser();
  const harness = createHookHarness(browser);
  const api = createFetch(responses);
  let query = paymentId;
  let locationKey = "inbox-location-1";
  const Details = () => null;
  const History = () => null;
  const { default: Inbox } = await loadProductionModule("pages/ApprovalInbox.tsx", {
    hooks: harness.hooks, globals: { ...browser.globals, fetch: api.fetch },
    externals: new Map([
      ["react-router-dom", {
        Link: () => null,
        useSearchParams: () => [new URLSearchParams({ paymentId: query })],
        useLocation: () => ({ key: locationKey, pathname: "/approval-inbox", search: `?paymentId=${query}` }),
      }],
      ["../components/dashboard/Sidebar", { default: () => null }],
      ["../components/dashboard/DashboardHeader", { default: () => null }],
      ["../components/approvals/ApprovalDetails", { default: Details }],
      ["../components/approvals/ApprovalHistoryDetails", { default: History }],
    ]),
  });
  harness.setComponent(Inbox);
  await harness.settle();
  return {
    ...harness, calls: api.calls,
    details: () => findAll(harness.render(), (node) => node.type === Details),
    history: () => findAll(harness.render(), (node) => node.type === History),
    setPaymentId(value) { query = value; return harness.render(); },
    setLocationKey(value) { locationKey = value; return harness.render(); },
  };
}

test("notification payment links select the matching inbox payment and hide old details while switching", async () => {
  const delayed = deferred();
  const items = inbox([pending(11), pending(22)]);
  const loaded = await loadInbox([items, delayed.promise]);
  assert.equal(loaded.details().length, 1);
  assert.equal(loaded.details()[0].props.approval.paymentId, 11);
  loaded.setPaymentId("22");
  assert.equal(loaded.details().length, 0, "A changed notification target must immediately hide the former payment");
  await loaded.settle();
  assert.equal(loaded.calls[0].options.signal.aborted, true);
  delayed.resolve(items);
  await loaded.settle();
  assert.equal(loaded.details().length, 1);
  assert.equal(loaded.details()[0].props.approval.paymentId, 22);
  loaded.unmount();
});

test("clicking the same payment notification again reopens its closed dialog on a new navigation key", async () => {
  const items = inbox([pending(11)]);
  const reloaded = deferred();
  const loaded = await loadInbox([items, reloaded.promise]);
  assert.equal(loaded.details()[0].props.approval.paymentId, 11);
  loaded.details()[0].props.onClose();
  await loaded.settle();
  assert.equal(loaded.details().length, 0);

  loaded.setLocationKey("inbox-location-2");
  await loaded.settle();
  assert.equal(loaded.calls.length, 2, "A fresh navigation to the unchanged paymentId must reload its actionable state");
  assert.equal(loaded.details().length, 0);
  reloaded.resolve(items);
  await loaded.settle();
  assert.equal(loaded.details().length, 1);
  assert.equal(loaded.details()[0].props.approval.paymentId, 11);
  loaded.unmount();
});

test("a notification for an already handled or missing payment cannot leave another payment dialog open", async () => {
  const items = {
    ...inbox([pending(11)]),
    recentlyHandled: [{ paymentId: 5, amount: "100.00", status: "approved", decidedAt: "2026-10-20T10:00:00Z", comment: "", decisionSource: "manual", timeline: [] }],
  };
  const loaded = await loadInbox([items, items, items]);
  loaded.setPaymentId("999");
  assert.equal(loaded.details().length, 0);
  await loaded.settle();
  assert.equal(loaded.details().length, 0);
  assert.equal(loaded.history().length, 0);

  find(loaded.render(), (node) => node.props?.["aria-label"] === "Visa attesthistorik för betalning #5").props.onClick();
  await loaded.settle();
  assert.equal(loaded.history().length, 1);
  loaded.setPaymentId("11");
  assert.equal(loaded.history().length, 0, "A new notification target immediately hides an old history dialog");
  await loaded.settle();
  assert.equal(loaded.details()[0].props.approval.paymentId, 11);
  assert.equal(loaded.history().length, 0);
  loaded.unmount();
});
