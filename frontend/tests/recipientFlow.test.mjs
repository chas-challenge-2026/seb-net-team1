import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as jsxRuntime from "react/jsx-runtime";
import * as icons from "react-icons/fi";
import ts from "typescript";

const recipient = { id: 7, name: "Testmottagare", iban: "SE4550000000054910000099", createdAt: "2026-10-13T10:00:00Z" };

function find(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (Array.isArray(tree)) return tree.map((child) => find(child, predicate)).find(Boolean);
  return predicate(tree) ? tree : find(tree.props?.children, predicate);
}
const byId = (id) => (node) => node.props?.id === id;

async function loadComponent(entry, responses, {
  role = "initiator", props = {}, paymentStatus = "completed", paymentError = null,
  historicalIbans = [], historyIncomplete = false, historyError = null, historyWait = null,
} = {}) {
  const state = [];
  const refs = [];
  const dependencies = [];
  const effects = [];
  const cleanups = [];
  const calls = [];
  const payments = [];
  const historyCalls = [];
  let cursor = 0;
  const hooks = {
    useState: (initial) => {
      const index = cursor++;
      if (!(index in state)) state[index] = typeof initial === "function" ? initial() : initial;
      return [state[index], (value) => { state[index] = typeof value === "function" ? value(state[index]) : value; }];
    },
    useRef: (initial) => {
      const index = cursor++;
      refs[index] ??= { current: initial };
      return refs[index];
    },
    useEffect: (callback, deps) => {
      const index = cursor++;
      if (!dependencies[index] || deps.some((dep, i) => dep !== dependencies[index][i])) {
        dependencies[index] = deps;
        effects.push({ index, callback });
      }
    },
  };
  hooks.useLayoutEffect = hooks.useEffect;
  class FocusTarget {
    isConnected = true;
    focusCount = 0;
    focus() { this.focusCount += 1; }
  }
  const opener = new FocusTarget();
  const dialog = { showCount: 0, closeCount: 0, showModal() { this.showCount += 1; }, close() { this.closeCount += 1; } };
  const heading = new FocusTarget();
  const externals = new Map([
    ["react", hooks], ["react/jsx-runtime", jsxRuntime], ["react-icons/fi", icons],
    ["react-router-dom", { Link: () => null }],
    ["../components/dashboard/Sidebar", { default: () => null }],
    ["../components/dashboard/ApprovalNotifications", { default: () => null }],
    ["../components/payments/PaymentConfirmationDialog", { default: () => null }],
    ["../api/accountsApi", { getAccounts: async () => [{ id: 1, accountName: "Konto", iban: "SE4550000000054910000099", currency: "SEK" }] }],
    ["../api/historicalRecipientsApi", { getHistoricalRecipients: async (signal) => {
      historyCalls.push(signal);
      if (historyWait) await historyWait;
      if (historyError) throw historyError;
      return { ibans: historicalIbans, incomplete: historyIncomplete };
    } }],
    ["../api/paymentsApi", {
      createPayment: async (payment) => {
        payments.push(payment);
        if (paymentError) throw paymentError;
        return { ...payment, id: 99, status: paymentStatus, amount: payment.amount.toFixed(2), currency: "SEK", reference: payment.reference ?? "", createdAt: "2026-10-13T10:00:00Z" };
      },
      PAYMENT_PERMISSION_ERROR: "Du har inte behörighet att skapa betalningar. Logga in som initiator eller admin.",
    }],
  ]);
  const context = createContext({
    Headers, AbortController, Error, HTMLElement: FocusTarget, document: { activeElement: opener },
    localStorage: { getItem: () => JSON.stringify({ role }) },
    fetch: async (url, options) => {
      calls.push({ url, options });
      const next = responses[calls.length - 1];
      assert.ok(next, "Unexpected request or automatic retry");
      if (next.wait) await next.wait;
      if (next.error) throw next.error;
      return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
    },
  });
  const modules = new Map();
  function load(identifier) {
    if (modules.has(identifier)) return modules.get(identifier);
    const pending = createModule(identifier);
    modules.set(identifier, pending);
    return pending;
  }
  async function createModule(identifier) {
    const external = externals.get(identifier) ?? (identifier.endsWith(".css") ? {} : undefined);
    if (external) {
      const names = Object.keys(external);
      const module = new SyntheticModule(names, function () {
        for (const name of names) this.setExport(name, external[name]);
      }, { context, identifier });
      return module;
    }
    const url = new URL(identifier);
    const { outputText } = ts.transpileModule(await readFile(url, "utf8"), {
      fileName: fileURLToPath(url),
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    const module = new SourceTextModule(outputText, {
      context, identifier,
      initializeImportMeta: (meta) => { meta.env = { VITE_API_URL: "http://recipient.test" }; },
    });
    return module;
  }
  const module = await load(new URL(entry, import.meta.url).href);
  await module.link((specifier, parent) => {
    if (externals.has(specifier) || specifier.endsWith(".css")) return load(specifier);
    const tsUrl = new URL(`${specifier}.ts`, parent.identifier);
    return load(existsSync(tsUrl) ? tsUrl.href : new URL(`${specifier}.tsx`, parent.identifier).href);
  });
  await module.evaluate();
  function render() {
    cursor = 0;
    const tree = module.namespace.default(props);
    const dialogNode = find(tree, (node) => node.type === "dialog");
    if (dialogNode) dialogNode.ref.current = dialog;
    const headingNode = find(tree, byId("new-recipient-title"));
    if (headingNode) headingNode.ref.current = heading;
    return tree;
  }
  async function flushEffects() {
    for (const { index, callback } of effects.splice(0)) {
      cleanups[index]?.();
      cleanups[index] = callback();
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
  render();
  await flushEffects();
  return { render, flushEffects, calls, payments, historyCalls, opener, heading, dialog, unmount: () => cleanups.forEach((cleanup) => cleanup?.()) };
}

test("saved recipients load again after reload, fill payment IBAN and remain optional for manual entry", async () => {
  const loaded = await loadComponent("../src/pages/NewPayment.tsx", [{ body: { recipients: [recipient], demoConfirmationEnabled: true } }]);
  const { render, payments } = loaded;
  find(render(), byId("saved-recipient")).props.onChange({ target: { value: String(recipient.id) } });
  const selectedIban = find(render(), byId("recipient-iban"));
  assert.equal(selectedIban.type, "output");
  assert.equal(selectedIban.props.children, recipient.iban);
  assert.equal(selectedIban.props.onChange, undefined);
  assert.ok(find(render(), (node) => node.type === "label" && node.props.htmlFor === "recipient-iban"));
  assert.ok(find(render(), byId("recipient-manual-entry-help")));
  assert.equal(find(render(), byId("saved-recipient")).props.value, String(recipient.id));
  find(render(), byId("from-account")).props.onChange({ target: { value: "1" } });
  find(render(), byId("amount")).props.onChange({ target: { name: "amount", value: "60.00" } });
  await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(payments[0].toIban, recipient.iban, "The selected output must still supply the payment payload");
  find(render(), byId("saved-recipient")).props.onChange({ target: { value: "" } });
  assert.equal(find(render(), byId("recipient-iban")).type, "input");
  assert.equal(find(render(), byId("recipient-iban")).props.value, recipient.iban, "Manual mode retains the selected IBAN for editing");
  find(render(), byId("recipient-iban")).props.onChange({ target: { name: "toIban", value: "SE3550000000054910000004" } });
  assert.equal(find(render(), byId("saved-recipient")).props.value, "");
  assert.equal(find(render(), byId("recipient-iban")).props.value, "SE3550000000054910000004");
  await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(payments[1].toIban, "SE3550000000054910000004", "Manual changes reach the payment payload");

  const reloaded = await loadComponent("../src/pages/NewPayment.tsx", [{ body: { recipients: [recipient], demoConfirmationEnabled: true } }]);
  const option = find(reloaded.render(), (node) => node.type === "option" && node.props.value === recipient.id);
  assert.ok(option);
  assert.equal(reloaded.calls[0].url, "http://recipient.test/api/recipients");
});

test("only initiator/admin and an explicit enabled flag can open add recipient", async () => {
  for (const [role, flag, expected] of [["initiator", true, true], ["admin", true, true], ["attestant", true, false], ["initiator", false, false]]) {
    const { render } = await loadComponent("../src/pages/NewPayment.tsx", [{ body: { recipients: [], demoConfirmationEnabled: flag } }], { role });
    const add = find(render(), (node) => node.props?.className === "new-payment-add-recipient");
    assert.equal(Boolean(add && !add.props.disabled), expected);
    if (expected) {
      add.props.onClick();
      assert.ok(find(render(), (node) => typeof node.props?.onSaved === "function"));
    }
  }
});

test("historical recipients appear alongside saved recipients and submit the selected IBAN", async () => {
  const historicalIban = "SE3550000000054910000003";
  const { render, payments, calls } = await loadComponent("../src/pages/NewPayment.tsx", [
    { body: { recipients: [recipient], demoConfirmationEnabled: true } },
  ], { historicalIbans: [historicalIban] });
  assert.ok(find(render(), (node) => node.type === "option" && node.props.value === recipient.id));
  const option = find(render(), (node) => node.type === "option" && node.props.value === `history:${historicalIban}`);
  assert.match(option.props.children, /Tidigare godkänd betalning/);
  find(render(), byId("saved-recipient")).props.onChange({ target: { value: option.props.value } });
  assert.equal(find(render(), byId("recipient-iban")).type, "output");
  assert.equal(find(render(), byId("recipient-iban")).props.children, historicalIban);
  find(render(), byId("from-account")).props.onChange({ target: { value: "1" } });
  find(render(), byId("amount")).props.onChange({ target: { name: "amount", value: "60.00" } });
  await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(payments[0].toIban, historicalIban);
  assert.equal(calls.length, 1, "Historical selection must not create a saved recipient");
  find(render(), byId("saved-recipient")).props.onChange({ target: { value: "" } });
  assert.equal(find(render(), byId("recipient-iban")).type, "input");
  assert.equal(find(render(), byId("recipient-iban")).props.value, historicalIban);
});

test("normalized duplicate historical IBANs retain the saved recipient and its name", async () => {
  const { render } = await loadComponent("../src/pages/NewPayment.tsx", [
    { body: { recipients: [recipient], demoConfirmationEnabled: true } },
  ], { historicalIbans: [recipient.iban.toLowerCase(), "SE45 5000 0000 0549 1000 0099"] });
  const selected = find(render(), (node) => node.type === "option" && node.props.value === recipient.id);
  assert.match(selected.props.children, /Testmottagare/);
  assert.equal(find(render(), (node) => node.type === "option" && String(node.props.value).startsWith("history:")), undefined);
  find(render(), byId("saved-recipient")).props.onChange({ target: { value: String(recipient.id) } });
  assert.equal(find(render(), byId("recipient-iban")).props.children, recipient.iban);
});

test("adding a saved name for a selected historical recipient replaces rather than duplicates it", async () => {
  const { render } = await loadComponent("../src/pages/NewPayment.tsx", [
    { body: { recipients: [], demoConfirmationEnabled: true } },
  ], { historicalIbans: [recipient.iban] });
  find(render(), byId("saved-recipient")).props.onChange({ target: { value: `history:${recipient.iban}` } });
  find(render(), (node) => node.props?.className === "new-payment-add-recipient").props.onClick();
  find(render(), (node) => typeof node.props?.onSaved === "function").props.onSaved(recipient);
  assert.equal(find(render(), byId("saved-recipient")).props.value, String(recipient.id));
  assert.ok(find(render(), (node) => node.type === "option" && node.props.value === recipient.id));
  assert.equal(find(render(), (node) => node.type === "option" && String(node.props.value).startsWith("history:")), undefined);
  assert.equal(find(render(), byId("recipient-iban")).props.children, recipient.iban);
});

test("history failures and partial results never break saved-recipient selection or adding", async () => {
  for (const history of [{ historyError: new Error("History unavailable") }, { historyIncomplete: true, historicalIbans: ["SE3550000000054910000003"] }]) {
    const { render } = await loadComponent("../src/pages/NewPayment.tsx", [
      { body: { recipients: [recipient], demoConfirmationEnabled: true } },
    ], history);
    assert.equal(find(render(), byId("saved-recipient")).props.disabled, false);
    find(render(), byId("saved-recipient")).props.onChange({ target: { value: String(recipient.id) } });
    assert.equal(find(render(), byId("recipient-iban")).props.children, recipient.iban);
    const status = find(render(), (node) => node.props?.role === "status" && /kunde inte/.test(node.props.children));
    assert.ok(status);
    const add = find(render(), (node) => node.props?.className === "new-payment-add-recipient");
    assert.equal(add.props.disabled, false);
    add.props.onClick();
    assert.ok(find(render(), (node) => typeof node.props?.onSaved === "function"));
  }
});

test("slow history loading does not disable saved recipients and unmount cancels it", async () => {
  let resolve;
  const historyWait = new Promise((done) => { resolve = done; });
  const { render, historyCalls, unmount } = await loadComponent("../src/pages/NewPayment.tsx", [
    { body: { recipients: [recipient], demoConfirmationEnabled: true } },
  ], { historyWait });
  assert.equal(find(render(), byId("saved-recipient")).props.disabled, false);
  assert.equal(historyCalls[0].aborted, false);
  unmount();
  assert.equal(historyCalls[0].aborted, true);
  resolve();
  await new Promise((done) => setImmediate(done));
});

test("recipient load failure disables add while a manual payment still submits normally", async () => {
  const { render, payments } = await loadComponent("../src/pages/NewPayment.tsx", [{ status: 500, body: {} }]);
  assert.equal(find(render(), (node) => node.props?.className === "new-payment-add-recipient").props.disabled, true);
  find(render(), byId("from-account")).props.onChange({ target: { value: "1" } });
  find(render(), byId("recipient-iban")).props.onChange({ target: { name: "toIban", value: recipient.iban } });
  find(render(), byId("amount")).props.onChange({ target: { name: "amount", value: "60.00" } });
  await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(payments.length, 1);
  assert.equal(payments[0].toIban, recipient.iban);
  assert.equal(payments[0].amount, 60);
});

test("a known attestant gets role guidance, cannot submit and can switch user", async () => {
  const { render, payments } = await loadComponent("../src/pages/NewPayment.tsx", [{ body: { recipients: [], demoConfirmationEnabled: true } }], { role: "attestant" });
  const notice = find(render(), (node) => node.props?.className === "new-payment-role-notice");
  assert.ok(notice);
  assert.match(find(notice, (node) => node.type === "p").props.children, /Logga in som initiator eller admin/);
  const switchUser = find(notice, (node) => node.props?.to === "/");
  assert.equal(switchUser.props.children, "Byt användare");
  assert.equal(find(render(), (node) => node.props?.className === "new-payment-submit").props.disabled, true);
  find(render(), byId("from-account")).props.onChange({ target: { value: "1" } });
  find(render(), byId("recipient-iban")).props.onChange({ target: { name: "toIban", value: recipient.iban } });
  find(render(), byId("amount")).props.onChange({ target: { name: "amount", value: "100000" } });
  await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(payments.length, 0, "A direct form submit must also respect the known role");
  assert.match(find(render(), (node) => node.props?.role === "alert").props.children, /Du har inte behörighet att skapa betalningar/);
});

test("an unknown stored role leaves payment creation available for a valid authenticated cookie", async () => {
  const { render, payments } = await loadComponent("../src/pages/NewPayment.tsx", [{ body: { recipients: [], demoConfirmationEnabled: true } }], { role: null });
  assert.equal(find(render(), (node) => node.props?.className === "new-payment-role-notice"), undefined);
  assert.equal(find(render(), (node) => node.props?.className === "new-payment-submit").props.disabled, false);
  find(render(), byId("from-account")).props.onChange({ target: { value: "1" } });
  find(render(), byId("recipient-iban")).props.onChange({ target: { name: "toIban", value: recipient.iban } });
  find(render(), byId("amount")).props.onChange({ target: { name: "amount", value: "100000" } });
  await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(payments.length, 1);
});

const paymentConfirmation = (tree) => find(tree, (node) => node.props?.payment && typeof node.props?.onClose === "function");

for (const status of ["pending_approval", "completed"]) {
  test(`${status} payment success opens the status dialog; closing it never sends another payment`, async () => {
    const { render, payments, calls } = await loadComponent("../src/pages/NewPayment.tsx", [{ body: { recipients: [], demoConfirmationEnabled: true } }], { paymentStatus: status });
    assert.equal(paymentConfirmation(render()), undefined);
    find(render(), byId("from-account")).props.onChange({ target: { value: "1" } });
    find(render(), byId("recipient-iban")).props.onChange({ target: { name: "toIban", value: recipient.iban } });
    find(render(), byId("amount")).props.onChange({ target: { name: "amount", value: "60000" } });
    const pending = find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
    assert.equal(find(render(), (node) => node.props?.className === "new-payment-add-recipient").props.disabled, true, "A pending payment must not open another modal");
    assert.equal(paymentConfirmation(render()), undefined, "A pending request is not a saved payment");
    await pending;
    const confirmation = paymentConfirmation(render());
    assert.ok(confirmation);
    assert.equal(confirmation.props.payment.id, 99);
    assert.equal(confirmation.props.payment.status, status);
    assert.equal(confirmation.props.payment.amount, "60000.00");
    assert.equal(confirmation.props.payment.toIban, recipient.iban);
    assert.equal(paymentConfirmation(find(render(), (node) => node.type === "form")), undefined, "Dialog must be outside the payment form");
    const requestCount = calls.length;
    confirmation.props.onClose();
    assert.equal(paymentConfirmation(render()), undefined);
    assert.equal(payments.length, 1);
    assert.equal(calls.length, requestCount);
    const inlineSuccess = find(render(), (node) => node.type === "small" && node.props.role === "status");
    assert.match(inlineSuccess.props.children, status === "pending_approval" ? /väntar på godkännande/ : /genomförd/);
    assert.equal(find(render(), byId("amount")).props.value, "60000", "Dismissal preserves the existing form context");
  });
}

test("validation failure or a rejected creation request never opens a success dialog", async () => {
  const { render, payments } = await loadComponent("../src/pages/NewPayment.tsx", [{ body: { recipients: [], demoConfirmationEnabled: true } }], { paymentError: new Error("Kontot har inte tillräckligt saldo för denna betalning.") });
  await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(payments.length, 0);
  assert.equal(paymentConfirmation(render()), undefined);
  find(render(), byId("from-account")).props.onChange({ target: { value: "1" } });
  find(render(), byId("recipient-iban")).props.onChange({ target: { name: "toIban", value: recipient.iban } });
  find(render(), byId("amount")).props.onChange({ target: { name: "amount", value: "60000" } });
  await find(render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(payments.length, 1);
  assert.equal(paymentConfirmation(render()), undefined);
  assert.match(find(render(), (node) => node.props?.role === "alert").props.children, /inte tillräckligt saldo/);
});

test("saving from the popup adds/selects the recipient and closes it", async () => {
  const { render } = await loadComponent("../src/pages/NewPayment.tsx", [{ body: { recipients: [], demoConfirmationEnabled: true } }]);
  find(render(), (node) => node.props?.className === "new-payment-add-recipient").props.onClick();
  find(render(), (node) => typeof node.props?.onSaved === "function").props.onSaved(recipient);
  assert.equal(find(render(), byId("saved-recipient")).props.value, String(recipient.id));
  assert.equal(find(render(), byId("recipient-iban")).type, "output");
  assert.equal(find(render(), byId("recipient-iban")).props.children, recipient.iban);
  assert.equal(find(render(), (node) => typeof node.props?.onSaved === "function"), undefined);
  assert.ok(find(render(), (node) => node.props?.role === "status"));
});

test("cancel then refresh can recover a recipient committed by the server after an uncertain response", async () => {
  const harness = await loadComponent("../src/pages/NewPayment.tsx", [
    { body: { recipients: [], demoConfirmationEnabled: true } },
    { body: { recipients: [recipient], demoConfirmationEnabled: true } },
  ]);
  find(harness.render(), (node) => node.props?.className === "new-payment-add-recipient").props.onClick();
  find(harness.render(), (node) => typeof node.props?.onSaved === "function").props.onClose();
  assert.equal(find(harness.render(), (node) => typeof node.props?.onSaved === "function"), undefined);
  const refresh = find(harness.render(), (node) => node.props?.className === "new-payment-recipient-retry");
  assert.equal(refresh.props.children, "Uppdatera mottagare");
  refresh.props.onClick();
  assert.equal(find(harness.render(), (node) => node.props?.className === "new-payment-recipient-retry").props.disabled, true);
  await harness.flushEffects();
  assert.equal(harness.calls.length, 2);
  find(harness.render(), byId("saved-recipient")).props.onChange({ target: { value: String(recipient.id) } });
  assert.equal(find(harness.render(), byId("recipient-iban")).props.children, recipient.iban);
});

async function fillDialog(harness) {
  find(harness.render(), byId("new-recipient-name")).props.onChange({ target: { value: " Testmottagare " } });
  find(harness.render(), byId("new-recipient-iban")).props.onChange({ target: { value: "se45 5000 0000 0549 1000 0099" } });
  find(harness.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  harness.render();
  await harness.flushEffects();
}

test("dialog saves only after explicit BankID-demo confirmation and prevents duplicate submissions", async () => {
  let release;
  const wait = new Promise((resolve) => { release = resolve; });
  const saved = [];
  const harness = await loadComponent("../src/components/payments/NewRecipientDialog.tsx", [
    { body: { requestToken: "test-csrf" }, wait }, { body: recipient, status: 201 },
  ], { props: { onClose() {}, onSaved: (item) => saved.push(item) } });
  assert.equal(harness.dialog.showCount, 1);
  await fillDialog(harness);
  assert.equal(harness.calls.length, 0, "Next must not save or request CSRF");
  assert.equal(find(harness.render(), byId("new-recipient-title")).props.children, "BankID-demo");
  assert.ok(find(harness.render(), (node) => node.type === "strong" && node.props.children === "Ingen riktig BankID-legitimering görs."));
  assert.equal(harness.heading.focusCount, 1);
  const submit = find(harness.render(), (node) => node.type === "form").props.onSubmit;
  submit({ preventDefault() {} });
  find(harness.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(harness.calls.length, 1);
  assert.equal(find(harness.render(), (node) => node.type === "form").props["aria-busy"], true);
  release();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.length, 2);
  assert.deepEqual(JSON.parse(harness.calls[1].options.body), { name: recipient.name, iban: recipient.iban, demoConfirmed: true });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].id, recipient.id);
});

test("invalid fields stay in details; Escape cancels and cleanup restores focus", async () => {
  let closed = 0;
  const harness = await loadComponent("../src/components/payments/NewRecipientDialog.tsx", [], { props: { onClose: () => { closed += 1; }, onSaved: () => assert.fail("Must not save") } });
  find(harness.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  assert.equal(find(harness.render(), byId("new-recipient-title")).props.children, "Lägg till mottagare");
  assert.ok(find(harness.render(), (node) => node.props?.role === "alert"));
  find(harness.render(), (node) => node.type === "dialog").props.onCancel({ preventDefault() {} });
  assert.equal(closed, 1);
  harness.unmount();
  assert.equal(harness.dialog.closeCount, 1);
  assert.equal(harness.opener.focusCount, 1);
});

test("failed confirmation preserves recipient details and allows an explicit retry", async () => {
  const saved = [];
  const harness = await loadComponent("../src/components/payments/NewRecipientDialog.tsx", [
    { body: { requestToken: "csrf-1" } },
    { status: 409, body: { detail: "En mottagare med detta IBAN finns redan. Den befintliga mottagaren har inte ändrats." } },
    { body: { requestToken: "csrf-2" } }, { body: recipient, status: 201 },
  ], { props: { onClose() {}, onSaved: (item) => saved.push(item) } });
  await fillDialog(harness);
  find(harness.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.length, 2);
  assert.equal(saved.length, 0);
  assert.ok(find(harness.render(), (node) => node.props?.role === "alert"));
  assert.equal(find(harness.render(), (node) => node.type === "form").props["aria-busy"], false);
  find(harness.render(), (node) => node.type === "form").props.onSubmit({ preventDefault() {} });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(harness.calls.length, 4);
  assert.equal(saved.length, 1);
  assert.equal(JSON.parse(harness.calls[3].options.body).iban, recipient.iban);
});
