import assert from "node:assert/strict";
import test from "node:test";
import {
  admin, createBrowser, createFetch, createHookHarness, deferred, find, findAll,
  inbox, loadProductionModule, pending, textContent,
} from "./notificationHarness.mjs";

const bell = (tree) => find(tree, (node) => node.type === "button" && /^Notiser/.test(node.props["aria-label"] ?? ""));
const panel = (tree) => find(tree, (node) => node.props?.role === "dialog" && node.props["aria-label"] === "Notiser");
const panels = (tree) => findAll(tree, (node) => node.props?.role === "dialog");
const byLabel = (label) => (node) => node.props?.["aria-label"] === label;

async function loadNotifications(responses, options = {}) {
  const { storedUser = null } = options;
  const user = Object.hasOwn(options, "user") ? options.user : admin;
  const browser = createBrowser(storedUser);
  const harness = createHookHarness(browser);
  const api = createFetch(responses);
  let location = { key: "payment-page", pathname: "/payments", search: "" };
  const { default: Notifications } = await loadProductionModule("components/dashboard/ApprovalNotifications.tsx", {
    hooks: harness.hooks, globals: { ...browser.globals, fetch: api.fetch },
    externals: new Map([["react-router-dom", { Link: () => null, useLocation: () => location }]]),
  });
  harness.setComponent(() => Notifications({ user }));
  await harness.settle();
  return {
    ...harness, browser, calls: api.calls,
    async open() { bell(harness.render()).props.onClick(); return harness.settle(); },
    async navigate(key) { location = { ...location, key }; return harness.settle(); },
  };
}

test("notification bell counts payments once and opens a nonmodal list with payment links", async () => {
  const entries = [pending(11), pending(11, { currentStep: 2 }), pending(22)];
  const loaded = await loadNotifications([inbox(entries), inbox(entries)]);
  assert.match(bell(loaded.render()).props["aria-label"], /2 betalningar väntar/);
  assert.equal(textContent(find(loaded.render(), (node) => node.props?.className === "approval-notifications-badge")), "2");
  assert.equal(bell(loaded.render()).props["aria-expanded"], false);
  assert.equal(panels(loaded.render()).length, 0);

  await loaded.open();
  assert.equal(loaded.calls.length, 2, "Opening the list refreshes the inbox");
  const dialog = panel(loaded.render());
  assert.equal(dialog.props["aria-modal"], "false");
  assert.equal(dialog.props.id, bell(loaded.render()).props["aria-controls"]);
  assert.equal(bell(loaded.render()).props["aria-expanded"], true);
  assert.equal(loaded.browser.document.activeElement, loaded.browser.elementFor(dialog));
  const links = findAll(dialog, (node) => node.props?.to?.startsWith("/approval-inbox?paymentId="));
  assert.deepEqual(links.map((link) => link.props.to).sort(), ["/approval-inbox?paymentId=11", "/approval-inbox?paymentId=22"]);
  assert.match(textContent(dialog), /Faktura 11/);
  assert.match(textContent(dialog), /Skapad av Sara Ek/);
  assert.match(textContent(dialog), /175/);
  assert.ok(find(dialog, (node) => node.props?.to === "/approval-inbox"));
  links[0].props.onClick();
  await loaded.settle();
  assert.equal(panels(loaded.render()).length, 0);
  loaded.unmount();
});

test("notification panel shows loading and an empty result after its request resolves", async () => {
  const initial = deferred();
  const opened = deferred();
  const loaded = await loadNotifications([initial.promise, opened.promise]);
  await loaded.open();
  assert.equal(loaded.calls[0].options.signal.aborted, true);
  assert.match(textContent(panel(loaded.render())), /Hämtar notiser/);
  assert.equal(find(loaded.render(), byLabel("Uppdatera notiser")).props.disabled, true);
  opened.resolve(inbox());
  await loaded.settle();
  assert.match(textContent(panel(loaded.render())), /Inga betalningar väntar/);
  assert.equal(find(loaded.render(), byLabel("Uppdatera notiser")).props.disabled, false);
  initial.resolve(inbox([pending(999)]));
  await loaded.settle();
  assert.match(textContent(panel(loaded.render())), /Inga betalningar väntar/);
  assert.equal(findAll(loaded.render(), (node) => node.props?.className === "approval-notifications-badge").length, 0);
  loaded.unmount();
});

test("notification error states distinguish expired login, denied access and a retryable failure", async () => {
  for (const status of [401, 403, 503]) {
    const failure = () => Response.json({ detail: "Database password" }, { status });
    const loaded = await loadNotifications([failure(), failure(), inbox()]);
    await loaded.open();
    const dialog = panel(loaded.render());
    assert.doesNotMatch(textContent(dialog), /Database password/);
    assert.equal(findAll(loaded.render(), (node) => node.props?.className === "approval-notifications-badge").length, 0);
    if (status === 401) {
      assert.match(textContent(dialog), /Logga in/);
      assert.ok(find(dialog, (node) => node.props?.to === "/"));
    } else {
      assert.ok(find(dialog, (node) => node.props?.role === "alert"));
    }
    if (status === 503) {
      find(dialog, (node) => node.type === "button" && textContent(node) === "Försök igen").props.onClick();
      await loaded.settle();
      assert.equal(loaded.calls.length, 3);
      assert.match(textContent(panel(loaded.render())), /Inga betalningar väntar/);
    } else {
      assert.equal(findAll(dialog, (node) => node.props?.to === "/approval-inbox").length, 0);
      assert.equal(findAll(dialog, byLabel("Uppdatera notiser")).length, 0);
    }
    loaded.unmount();
  }
});

test("notification identity uses safe stored fallback, explicit logout and role information", async () => {
  const stored = await loadNotifications([inbox(), inbox()], { user: undefined, storedUser: admin });
  await stored.open();
  assert.equal(stored.calls.length, 2);
  stored.unmount();

  const loggedOut = await loadNotifications([], { user: null, storedUser: admin });
  await loggedOut.open();
  assert.equal(loggedOut.calls.length, 0);
  assert.match(textContent(panel(loggedOut.render())), /Logga in/);
  loggedOut.unmount();

  const initiator = await loadNotifications([], { user: { ...admin, role: "initiator" } });
  await initiator.open();
  assert.equal(initiator.calls.length, 0);
  assert.match(textContent(panel(initiator.render())), /Din roll har inga betalningar att godkänna/);
  initiator.unmount();

  const invalidStored = await loadNotifications([], { user: undefined, storedUser: { ...admin, id: "1" } });
  await invalidStored.open();
  assert.equal(invalidStored.calls.length, 0);
  assert.match(textContent(panel(invalidStored.render())), /Logga in/);
  invalidStored.unmount();
});

test("notification panel closes on Escape, outside pointer, close button and navigation", async () => {
  const loaded = await loadNotifications(Array.from({ length: 6 }, () => inbox([pending(11)])));
  await loaded.open();
  let prevented = false;
  loaded.browser.document.dispatchEvent({ type: "keydown", key: "Escape", preventDefault() { prevented = true; } });
  await loaded.settle();
  assert.equal(prevented, true);
  assert.equal(panels(loaded.render()).length, 0);
  assert.equal(loaded.browser.document.activeElement, loaded.browser.elementFor(bell(loaded.render())));

  await loaded.open();
  const inside = loaded.browser.elementFor(find(panel(loaded.render()), (node) => node.props?.to === "/approval-inbox"));
  loaded.browser.document.dispatchEvent({ type: "pointerdown", target: inside });
  await loaded.settle();
  assert.equal(panels(loaded.render()).length, 1);
  const outside = new loaded.browser.globals.HTMLElement({ type: "div", props: {} }, null);
  loaded.browser.document.dispatchEvent({ type: "pointerdown", target: outside });
  await loaded.settle();
  assert.equal(panels(loaded.render()).length, 0);

  await loaded.open();
  find(loaded.render(), byLabel("Stäng notiser")).props.onClick();
  await loaded.settle();
  assert.equal(panels(loaded.render()).length, 0);
  assert.equal(loaded.browser.document.activeElement, loaded.browser.elementFor(bell(loaded.render())));

  await loaded.open();
  await loaded.navigate("approval-inbox-page");
  assert.equal(panels(loaded.render()).length, 0);
  await loaded.navigate("payment-page");
  assert.equal(panels(loaded.render()).length, 0, "Browser Back must not reopen a previously open list");
  assert.equal(loaded.browser.document.listenerCount("pointerdown"), 0);
  assert.equal(loaded.browser.document.listenerCount("keydown"), 0);
  loaded.unmount();
});

test("cross-tab account changes override a stale dashboard user prop and immediately hide the former user's payments", async () => {
  const oldRefresh = deferred();
  const otherUser = { ...admin, id: 2, tenantId: 20, name: "Ny administratör" };
  const loaded = await loadNotifications([
    inbox([pending(11)]), oldRefresh.promise, inbox([pending(22)]),
  ], { user: admin, storedUser: admin });
  await loaded.open();
  assert.match(bell(loaded.render()).props["aria-label"], /1 betalning väntar/);
  const previousRequest = loaded.calls[1];
  loaded.browser.localStorage.setItem("user", JSON.stringify(otherUser));
  loaded.browser.window.dispatchEvent({ type: "storage", key: "user", newValue: JSON.stringify(otherUser) });
  assert.equal(findAll(loaded.render(), (node) => node.props?.to === "/approval-inbox?paymentId=11").length, 0);
  assert.equal(findAll(loaded.render(), (node) => node.props?.className === "approval-notifications-badge").length, 0,
    "A new storage identity must hide the old count before its request completes");
  await loaded.settle();
  assert.equal(previousRequest.options.signal.aborted, true);
  assert.equal(loaded.calls.length, 3);
  if (panels(loaded.render()).length === 0) await loaded.open();
  assert.ok(find(panel(loaded.render()), (node) => node.props?.to === "/approval-inbox?paymentId=22"));
  assert.equal(findAll(loaded.render(), (node) => node.props?.to === "/approval-inbox?paymentId=11").length, 0);

  oldRefresh.resolve(inbox([pending(99)]));
  await loaded.settle();
  assert.equal(findAll(loaded.render(), (node) => node.props?.to === "/approval-inbox?paymentId=99").length, 0);
  loaded.browser.localStorage.removeItem("user");
  loaded.browser.window.dispatchEvent({ type: "storage", key: "user", newValue: null });
  assert.equal(findAll(loaded.render(), (node) => node.props?.className === "approval-notifications-badge").length, 0);
  assert.equal(findAll(loaded.render(), (node) => node.props?.to?.startsWith("/approval-inbox?paymentId=")).length, 0);
  await loaded.settle();
  if (panels(loaded.render()).length === 0) await loaded.open();
  assert.match(textContent(panel(loaded.render())), /Logga in/);
  assert.equal(loaded.calls.length, 3, "Logout must not use the still-mounted dashboard's former user prop to fetch again");
  loaded.unmount();
});

test("large notification badge caps visually at 99+ while its accessible count remains accurate", async () => {
  const entries = Array.from({ length: 100 }, (_, index) => pending(index + 1));
  const loaded = await loadNotifications([inbox(entries)]);
  assert.equal(textContent(find(loaded.render(), (node) => node.props?.className === "approval-notifications-badge")), "99+");
  assert.match(bell(loaded.render()).props["aria-label"], /100 betalningar/);
  loaded.unmount();
});
