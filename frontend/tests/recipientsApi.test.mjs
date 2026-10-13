import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule } from "node:vm";
import ts from "typescript";

const recipient = { id: 7, name: "Testmottagare", iban: "SE4550000000054910000099", createdAt: "2026-10-13T10:00:00Z" };

async function loadApi(responses = []) {
  const calls = [];
  const context = createContext({
    Headers,
    fetch: async (url, options) => {
      calls.push({ url, options });
      const next = responses[calls.length - 1];
      assert.ok(next, "Unexpected recipient request or automatic retry");
      if (next.error) throw next.error;
      return new Response(next.rawBody ?? JSON.stringify(next.body), { status: next.status ?? 200 });
    },
  });
  const modules = new Map();
  async function load(url) {
    if (modules.has(url.href)) return modules.get(url.href);
    const { outputText } = ts.transpileModule(await readFile(url, "utf8"), {
      fileName: fileURLToPath(url),
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext },
    });
    const module = new SourceTextModule(outputText, {
      context, identifier: url.href,
      initializeImportMeta: (meta) => { meta.env = { VITE_API_URL: "http://recipient.test" }; },
    });
    modules.set(url.href, module);
    await module.link((specifier, parent) => load(new URL(`${specifier}.ts`, parent.identifier)));
    return module;
  }
  const module = await load(new URL("../src/api/recipientsApi.ts", import.meta.url));
  await module.evaluate();
  return { api: module.namespace, calls };
}

test("recipient list loads persisted data using cookies without a CSRF request", async () => {
  const { api, calls } = await loadApi([{ body: { recipients: [recipient], demoConfirmationEnabled: true } }]);
  const result = await api.getRecipients();
  assert.deepEqual(JSON.parse(JSON.stringify(result)), { recipients: [recipient], demoConfirmationEnabled: true });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, "http://recipient.test/api/recipients");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.headers.has("X-CSRF-TOKEN"), false);
});

test("demo confirmation stays disabled unless the backend explicitly returns true", async () => {
  for (const flag of [undefined, false, null, "true", 1]) {
    const { api } = await loadApi([{ body: { recipients: [], demoConfirmationEnabled: flag } }]);
    assert.equal((await api.getRecipients()).demoConfirmationEnabled, false);
  }
});

test("malformed list responses are rejected instead of enabling the demo", async () => {
  for (const body of [null, {}, { recipients: [{}], demoConfirmationEnabled: true }]) {
    const { api } = await loadApi([{ body }]);
    await assert.rejects(api.getRecipients(), /ofullständigt/);
  }
});

test("recipient creation normalizes input and posts only a demo confirmation with cookie and CSRF auth", async () => {
  const { api, calls } = await loadApi([
    { body: { requestToken: "test-csrf" } }, { body: recipient, status: 201 },
  ]);
  const result = await api.createRecipient({ name: " Testmottagare ", iban: "se45 5000 0000 0549 1000 0099", demoConfirmed: true });
  assert.equal(result.id, recipient.id);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, "http://recipient.test/api/auth/csrf");
  assert.equal(calls[0].options.credentials, "include");
  const post = calls[1];
  assert.equal(post.url, "http://recipient.test/api/recipients");
  assert.equal(post.options.method, "POST");
  assert.equal(post.options.credentials, "include");
  assert.equal(post.options.headers.get("X-CSRF-TOKEN"), "test-csrf");
  assert.equal(post.options.headers.has("Authorization"), false);
  assert.deepEqual(JSON.parse(post.options.body), { name: recipient.name, iban: recipient.iban, demoConfirmed: true });
});

test("invalid recipient details or missing demo confirmation never start a request", async () => {
  for (const change of [{ name: " " }, { name: "x".repeat(101) }, { iban: "SE12" }, { iban: "SEAB50000000054910000099" }, { demoConfirmed: false }, { demoConfirmed: undefined }]) {
    const { api, calls } = await loadApi();
    await assert.rejects(api.createRecipient({ name: recipient.name, iban: recipient.iban, demoConfirmed: true, ...change }));
    assert.equal(calls.length, 0);
  }
});

for (const [status, body, expected] of [
  [400, { detail: "Ogiltigt IBAN-format. Kontrollera mottagarkontot." }, /Ogiltigt IBAN/],
  [403, { detail: "Simulerad bekräftelse av mottagare är inte aktiverad i den här miljön." }, /inte aktiverad/],
  [409, { detail: "En mottagare med detta IBAN finns redan. Den befintliga mottagaren har inte ändrats." }, /finns redan/],
  [400, { message: "Mottagarens namn måste vara mellan 1 och 100 tecken." }, /Mottagarens namn/],
  [401, {}, /Logga in igen/],
  [500, { detail: "Private backend exception" }, /Kunde inte spara/],
]) {
  test(`recipient HTTP ${status} displays a safe error without retrying or returning success`, async () => {
    const { api, calls } = await loadApi([{ body: { requestToken: "test-csrf" } }, { status, body }]);
    await assert.rejects(api.createRecipient({ name: recipient.name, iban: recipient.iban, demoConfirmed: true }), (error) => {
      assert.equal(error.status, status);
      assert.match(error.message, expected);
      assert.doesNotMatch(error.message, /Private backend/);
      return true;
    });
    assert.equal(calls.length, 2);
  });
}

test("CSRF failure prevents saving; an invalid creation response cannot report success", async () => {
  const csrfFailure = await loadApi([{ status: 403, body: {} }]);
  await assert.rejects(csrfFailure.api.createRecipient({ name: recipient.name, iban: recipient.iban, demoConfirmed: true }));
  assert.equal(csrfFailure.calls.length, 1);
  const malformed = await loadApi([{ body: { requestToken: "test-csrf" } }, { status: 201, body: { name: recipient.name } }]);
  await assert.rejects(malformed.api.createRecipient({ name: recipient.name, iban: recipient.iban, demoConfirmed: true }), /ofullständigt/);
  assert.equal(malformed.calls.length, 2);
});
