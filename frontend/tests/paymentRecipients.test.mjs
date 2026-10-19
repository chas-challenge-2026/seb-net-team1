import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import ts from "typescript";

const iban = "SE4550000000054910000099";
const approvedStep = {
  approvalStepId: "e3784548-fdeb-4ac5-aafd-73cf30c02e50", stepNumber: 1,
  status: "approved", attestantName: "Assigned Attestant", decidedByName: "Actual Attestant",
  decidedAt: "2026-10-13T10:05:00Z", decisionSource: "manual", comment: null,
};
const details = (id, changes = {}) => ({
  id, fromAccountId: 1, fromAccountName: "Konto", createdByName: "Initiator", toIban: iban,
  amount: "125000.00", currency: "SEK", reference: "Test", status: "completed",
  createdAt: "2026-10-13T10:00:00Z", executedAt: "2026-10-13T10:05:00Z",
  approvalTimeline: [approvedStep], activity: [], ...changes,
});
const summary = (id, status = "completed") => ({
  id, status, toIban: iban, amount: "125000.00", currency: "SEK", reference: "Test",
  createdAt: "2026-10-13T10:00:00Z",
});

async function load({ payments = [], getDetails = async (id) => details(id), overviewError } = {}) {
  const calls = [];
  let active = 0;
  let maxActive = 0;
  const api = {
    getRecentPayments: async (signal) => {
      calls.push({ kind: "overview", signal });
      if (overviewError) throw overviewError;
      return { recentPayments: payments, user: null, tenantName: null };
    },
    getPaymentDetails: async (id, signal) => {
      calls.push({ kind: "details", id, signal });
      active++;
      maxActive = Math.max(maxActive, active);
      try { return await getDetails(id, signal); } finally { active--; }
    },
  };
  const context = createContext({ Headers, fetch: () => { throw new Error("Unexpected network request"); } });
  const modules = new Map();
  async function moduleAt(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    if (url.href === new URL("../src/api/paymentsApi.ts", import.meta.url).href) {
      const module = new SyntheticModule(Object.keys(api), function () {
        for (const [name, value] of Object.entries(api)) this.setExport(name, value);
      }, { context, identifier: url.href });
      modules.set(url.href, module);
      return module;
    }
    const { outputText } = ts.transpileModule(await readFile(url, "utf8"), {
      fileName: fileURLToPath(url),
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    });
    const module = new SourceTextModule(outputText, {
      context, identifier: url.href, initializeImportMeta: (meta) => { meta.env = {}; },
    });
    modules.set(url.href, module);
    await module.link((specifier, parent) => moduleAt(new URL(`${specifier}.ts`, parent.identifier)));
    return module;
  }
  const entry = await moduleAt(new URL("../src/api/historicalRecipientsApi.ts", import.meta.url));
  await entry.evaluate();
  const helper = modules.get(new URL("../src/utils/paymentRecipients.ts", import.meta.url).href);
  return { api: entry.namespace, helper: helper.namespace, calls, maxActive: () => maxActive };
}

test("a completed payment with recorded manual approval supplies a normalized historical IBAN", async () => {
  const { helper } = await load();
  assert.equal(helper.getApprovedRecipientIban(details(1, { toIban: "se45 5000 0000 0549 1000 0099" })), iban);
});

test("recorded manual approval remains eligible when the decision maker's name is unavailable", async () => {
  const { helper } = await load();
  for (const decidedByName of [null, " "]) {
    assert.equal(helper.getApprovedRecipientIban(details(1, {
      approvalTimeline: [{ ...approvedStep, decidedByName }],
    })), iban);
  }
});

for (const status of ["pending_approval", "rejected", "failed", "cancelled", "processing", "approved"]) {
  test(`${status} payment is not a completed approved recipient even with an approved step`, async () => {
    const { helper } = await load();
    assert.equal(helper.getApprovedRecipientIban(details(1, { status })), null);
  });
}

test("completion without reliable approval evidence never qualifies", async () => {
  const { helper } = await load();
  for (const approvalTimeline of [
    [], undefined, null, [null], ["approved"],
    [{ ...approvedStep, status: "pending" }],
    [{ ...approvedStep, status: "rejected" }],
    [{ ...approvedStep, decisionSource: null }],
    [{ ...approvedStep, decisionSource: "payment_rejected" }],
    [{ ...approvedStep, decidedByName: null, decisionSource: null }],
    [{ ...approvedStep, decidedByName: null, decidedAt: null }],
    [{ ...approvedStep, decidedAt: null }],
    [{ ...approvedStep, decidedAt: "not-a-date" }],
    [approvedStep, { ...approvedStep, stepNumber: 2, status: "pending" }],
    [approvedStep, { ...approvedStep, stepNumber: 2, status: "rejected" }],
  ]) {
    assert.equal(helper.getApprovedRecipientIban(details(1, { approvalTimeline })), null);
  }
  assert.equal(helper.getApprovedRecipientIban(details(1, { toIban: " " })), null);
});

test("saved recipient names win normalized duplicates without inventing persistent IDs", async () => {
  const { helper } = await load();
  const saved = { id: 7, name: "Existing Supplier", iban: "se45 5000 0000 0549 1000 0099", createdAt: "2026-10-13T10:00:00Z" };
  const extra = "SE3550000000054910000003";
  const result = helper.getPaymentRecipientOptions([saved, { ...saved, id: 8, name: "Duplicate" }], [iban, extra, extra.toLowerCase()]);
  assert.deepEqual(JSON.parse(JSON.stringify(result)), [
    { value: 7, iban, label: `Existing Supplier – ${iban}` },
    { value: `history:${extra}`, iban: extra, label: `Tidigare godkänd betalning – ${extra}` },
  ]);
  assert.equal(saved.iban, "se45 5000 0000 0549 1000 0099", "Merging must not mutate saved data");
});

test("history checking is capped at the latest 20 payments and three concurrent details", async () => {
  const { api, calls, maxActive } = await load({
    payments: Array.from({ length: 35 }, (_, i) => summary(i + 1)),
    getDetails: async (id) => { await new Promise((done) => setImmediate(done)); return details(id); },
  });
  const controller = new AbortController();
  const result = await api.getHistoricalRecipients(controller.signal);
  assert.equal(calls.filter((call) => call.kind === "overview").length, 1);
  const requests = calls.filter((call) => call.kind === "details");
  assert.equal(requests.length, 20);
  assert.deepEqual(requests.map((call) => call.id), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.ok(calls.every((call) => call.signal === controller.signal));
  assert.equal(maxActive(), 3);
  assert.deepEqual([...result.ibans], [iban]);
  assert.equal(result.incomplete, false);
});

test("pending and rejected summaries do not cause detail requests and duplicate payment IDs are checked once", async () => {
  const { api, calls } = await load({ payments: [summary(1, "pending_approval"), summary(2, "rejected"), summary(3), summary(3)] });
  await api.getHistoricalRecipients(new AbortController().signal);
  assert.deepEqual(calls.filter((call) => call.kind === "details").map((call) => call.id), [3]);
});

test("partial detail failures retain verified results, preserve order, and do not retry", async () => {
  const extra = "SE3550000000054910000003";
  const { api, calls } = await load({
    payments: [summary(1), summary(2), summary(3), summary(4)],
    getDetails: async (id) => {
      if (id === 2) throw new Error("Unavailable detail");
      if (id === 3) return details(id, { status: "rejected" });
      return details(id, { toIban: id === 4 ? extra : iban });
    },
  });
  const result = await api.getHistoricalRecipients(new AbortController().signal);
  assert.deepEqual([...result.ibans], [iban, extra]);
  assert.equal(result.incomplete, true);
  assert.equal(calls.filter((call) => call.id === 2).length, 1);
});

test("an unavailable dashboard never starts approval checks", async () => {
  const { api, calls } = await load({ overviewError: new Error("Unavailable dashboard") });
  await assert.rejects(api.getHistoricalRecipients(new AbortController().signal), /Unavailable dashboard/);
  assert.equal(calls.length, 1);
});

test("an aborted load starts no further detail requests", async () => {
  let resolve;
  const gate = new Promise((done) => { resolve = done; });
  const { api, calls } = await load({
    payments: Array.from({ length: 20 }, (_, i) => summary(i + 1)),
    getDetails: async (id) => { await gate; return details(id); },
  });
  const controller = new AbortController();
  const result = api.getHistoricalRecipients(controller.signal);
  await new Promise((done) => setImmediate(done));
  assert.equal(calls.filter((call) => call.kind === "details").length, 3);
  controller.abort();resolve();
  await assert.rejects(result, (error) => error.name === "AbortError");
  assert.equal(calls.filter((call) => call.kind === "details").length, 3);
});

test("an already aborted load never requests dashboard data", async () => {
  const { api, calls } = await load();
  const controller = new AbortController();controller.abort();
  await assert.rejects(api.getHistoricalRecipients(controller.signal), (error) => error.name === "AbortError");
  assert.equal(calls.length, 0);
});
