import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { createElement } from "react";
import * as react from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import * as icons from "react-icons/fi";
import ts from "typescript";

const apiUrl = "http://localhost:5010";
const email = "person@example.test";
const password = "test-only-password";
const user = { id: 1, tenantId: 1, name: "Test User", email, role: "initiator" };

async function loadModuleGraph(entry, { globals = {}, externals = new Map(), baseUrl = apiUrl } = {}) {
  const context = createContext(globals);
  const modules = new Map();

  async function load(identifier) {
    if (modules.has(identifier)) return modules.get(identifier);
    const external = externals.get(identifier);
    if (external) {
      const names = Object.keys(external);
      const module = new SyntheticModule(names, function () {
        for (const name of names) this.setExport(name, external[name]);
      }, { context, identifier });
      modules.set(identifier, module);
      return module;
    }

    const url = new URL(identifier);
    const source = await readFile(url, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: {
        target: ts.ScriptTarget.ES2023,
        module: ts.ModuleKind.ESNext,
        jsx: ts.JsxEmit.ReactJSX,
      },
    });
    const module = new SourceTextModule(outputText, {
      context,
      identifier,
      initializeImportMeta: (meta) => { meta.env = { VITE_API_URL: baseUrl }; },
    });
    modules.set(identifier, module);
    await module.link((specifier, parent) => {
      if (externals.has(specifier)) return load(specifier);
      const tsUrl = new URL(`${specifier}.ts`, parent.identifier);
      return load(existsSync(tsUrl) ? tsUrl.href : new URL(`${specifier}.tsx`, parent.identifier).href);
    });
    return module;
  }

  const module = await load(new URL(entry, import.meta.url).href);
  await module.evaluate();
  return module.namespace;
}

async function loadLoginApi(responses, baseUrl, {
  entry = "../src/api/usersApi.ts", externals = new Map(), globals = {},
} = {}) {
  const calls = [];
  const api = await loadModuleGraph(entry, {
    baseUrl,
    externals,
    globals: {
      ...globals,
      Headers,
      TypeError,
      fetch: async (url, options) => {
        calls.push({ url, options });
        const response = responses[calls.length - 1];
        assert.ok(response, "Unexpected authentication request or retry");
        if (response.wait) await response.wait;
        if (response.error) throw response.error;
        return new Response(response.rawBody ?? JSON.stringify(response.body), {
          status: response.status ?? 200,
        });
      },
    },
  });
  return { api, calls };
}

test("login preserves email/password payload, cookie authentication and fresh CSRF", async () => {
  const { api, calls } = await loadLoginApi([
    { body: { requestToken: "test-csrf" } },
    { body: { user } },
  ]);

  assert.deepEqual(await api.login(email, password), { user });
  assert.equal(calls.length, 2);
  assert.equal(calls[0].url, `${apiUrl}/api/auth/csrf`);
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.cache, "no-store");
  assert.equal(calls[1].url, `${apiUrl}/api/auth/login`);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.credentials, "include");
  assert.equal(calls[1].options.headers.get("Content-Type"), "application/json");
  assert.equal(calls[1].options.headers.get("X-CSRF-TOKEN"), "test-csrf");
  assert.equal(calls[1].options.headers.has("Authorization"), false);
  assert.deepEqual(JSON.parse(calls[1].options.body), { email, password });
});

test("login still supports same-origin API configuration", async () => {
  const { api, calls } = await loadLoginApi([
    { body: { requestToken: "test-csrf" } },
    { body: { user } },
  ], "");

  await api.login(email, password);
  assert.deepEqual(calls.map((call) => call.url), ["/api/auth/csrf", "/api/auth/login"]);
});

for (const [status, kind, message] of [
  [400, "unexpected", "Det gick inte att logga in. Försök igen."],
  [401, "invalid-credentials", "Fel e-post eller lösenord."],
  [403, "unexpected", "Det gick inte att logga in. Försök igen."],
  [429, "rate-limited", "För många inloggningsförsök. Vänta en stund och försök igen."],
  [500, "unexpected", "Det gick inte att logga in. Försök igen."],
]) {
  test(`login rejects HTTP ${status} without retrying or exposing backend details`, async () => {
    const { api, calls } = await loadLoginApi([
      { body: { requestToken: "test-csrf" } },
      { status, body: { detail: `${password} test-csrf Private backend details` } },
    ]);

    await assert.rejects(api.login(email, password), (error) => {
      assert.ok(error instanceof api.LoginError);
      assert.equal(error.kind, kind);
      assert.equal(error.message, message);
      assert.doesNotMatch(error.stack, /test-only-password|test-csrf|Private backend details/);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls.length, 2);
  });
}

for (const response of [
  { status: 403, body: {} },
  { status: 500, body: {} },
  { body: { requestToken: "" } },
  { body: {} },
  { body: null },
  { rawBody: "invalid JSON containing private details" },
]) {
  test(`login does not submit when CSRF preparation fails (${JSON.stringify(response)})`, async () => {
    const { api, calls } = await loadLoginApi([response]);
    await assert.rejects(api.login(email, password), (error) => {
      assert.ok(error instanceof api.LoginError);
      assert.equal(error.kind, "preparation");
      assert.equal(error.message, "Kunde inte förbereda inloggningen. Försök igen.");
      return true;
    });
    assert.equal(calls.length, 1);
  });
}

for (const stage of ["csrf", "login"]) {
  test(`login classifies ${stage} connection failure without leaking details or retrying`, async () => {
    const responses = [{ error: new TypeError(`${password} test-csrf Private connection details`) }];
    if (stage === "login") responses.unshift({ body: { requestToken: "test-csrf" } });
    const { api, calls } = await loadLoginApi(responses);
    await assert.rejects(api.login(email, password), (error) => {
      assert.ok(error instanceof api.LoginError);
      assert.equal(error.kind, "network");
      assert.equal(error.message, "Kunde inte nå servern. Kontrollera anslutningen och försök igen.");
      assert.doesNotMatch(error.stack, /test-only-password|test-csrf|Private connection details/);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls.length, stage === "csrf" ? 1 : 2);
  });
}

test("login classifies a malformed success response without leaking its body", async () => {
  const { api } = await loadLoginApi([
    { body: { requestToken: "test-csrf" } },
    { rawBody: `${password} Private response details` },
  ]);
  await assert.rejects(api.login(email, password), (error) => {
    assert.equal(error.kind, "unexpected");
    assert.equal(error.message, "Det gick inte att logga in. Försök igen.");
    assert.doesNotMatch(error.stack, /test-only-password|Private response details/);
    return true;
  });
});

test("logout still uses the existing credentialed CSRF flow and 204 response", async () => {
  const { api, calls } = await loadLoginApi([
    { body: { requestToken: "logout-csrf" } },
    { status: 204 },
  ]);
  await api.logout();
  assert.equal(calls.length, 2);
  assert.equal(calls[1].url, `${apiUrl}/api/auth/logout`);
  assert.equal(calls[1].options.method, "POST");
  assert.equal(calls[1].options.credentials, "include");
  assert.equal(calls[1].options.headers.get("X-CSRF-TOKEN"), "logout-csrf");
});

function findElement(tree, predicate) {
  if (!tree || typeof tree !== "object") return undefined;
  if (Array.isArray(tree)) {
    return tree.map((child) => findElement(child, predicate)).find(Boolean);
  }
  return predicate(tree) ? tree : findElement(tree.props?.children, predicate);
}

async function loadLoginForm(responses) {
  const state = [];
  let cursor = 0;
  const navigation = [];
  const storage = new Map();
  const logs = [];
  // Exercise the real component handlers and API graph; only the hook host is isolated.
  const { api, calls } = await loadLoginApi(responses, undefined, {
    entry: "../src/pages/Login.tsx",
    globals: {
      localStorage: { setItem: (key, value) => storage.set(key, value) },
      console: Object.fromEntries(["log", "warn", "error"].map((name) => [name, (...args) => logs.push(args)])),
    },
    externals: new Map([
      ["react", {
        useState: (initial) => {
          const index = cursor++;
          if (!(index in state)) state[index] = initial;
          return [state[index], (value) => { state[index] = value; }];
        },
        useRef: () => ({ current: null }),
        useEffect: () => {},
      }],
      ["react/jsx-runtime", jsxRuntime],
      ["react-icons/fi", icons],
      ["react-router-dom", { useNavigate: () => (path) => navigation.push(path), Link: () => null }],
      ["../../assets/seb_background_img.png", { default: "/assets/building.png" }],
      ["../../assets/seb_logo_white.png", { default: "/assets/logo.png" }],
      ["../../styles/login.css", {}],
    ]),
  });
  function render() {
    cursor = 0;
    return api.default();
  }
  findElement(render(), (node) => node.props?.id === "email").props.onChange({ target: { value: email } });
  findElement(render(), (node) => node.props?.id === "password").props.onChange({ target: { value: password } });
  return { render, calls, navigation, storage, logs };
}

for (const [name, responses, message, expectedCalls] of [
  ["HTTP 200", [{ body: { requestToken: "test-csrf" } }, { body: { user } }], null, 2],
  ["HTTP 401", [{ body: { requestToken: "test-csrf" } }, { status: 401, body: { detail: password } }], "Fel e-post eller lösenord.", 2],
  ["HTTP 429", [{ body: { requestToken: "test-csrf" } }, { status: 429, body: { detail: password } }], "För många inloggningsförsök. Vänta en stund och försök igen.", 2],
  ["login network failure", [{ body: { requestToken: "test-csrf" } }, { error: new TypeError(password) }], "Kunde inte nå servern. Kontrollera anslutningen och försök igen.", 2],
  ["CSRF network failure", [{ error: new TypeError(password) }], "Kunde inte nå servern. Kontrollera anslutningen och försök igen.", 1],
  ["CSRF HTTP failure", [{ status: 500, body: { detail: password } }], "Kunde inte förbereda inloggningen. Försök igen.", 1],
  ["CSRF invalid token", [{ body: { requestToken: "" } }], "Kunde inte förbereda inloggningen. Försök igen.", 1],
  ["CSRF null response", [{ body: null }], "Kunde inte förbereda inloggningen. Försök igen.", 1],
  ["HTTP 400", [{ body: { requestToken: "test-csrf" } }, { status: 400, body: { message: password } }], "Det gick inte att logga in. Försök igen.", 2],
  ["HTTP 500", [{ body: { requestToken: "test-csrf" } }, { status: 500, body: { detail: password } }], "Det gick inte att logga in. Försök igen.", 2],
]) {
  test(`Login handles ${name} through the API layer, prevents duplicates and cleans up loading`, async () => {
    let release;
    const wait = new Promise((resolve) => { release = resolve; });
    const { render, calls, navigation, storage, logs } = await loadLoginForm([
      { ...responses[0], wait }, ...responses.slice(1),
    ]);
    const form = () => findElement(render(), (node) => node.type === "form");
    const submit = () => findElement(render(), (node) => node.props?.className === "login-submit");
    const pending = form().props.onSubmit({ preventDefault() {} });
    assert.equal(form().props["aria-busy"], true);
    assert.equal(submit().props.disabled, true);
    await form().props.onSubmit({ preventDefault() {} });
    assert.equal(calls.length, 1, "Duplicate submission must not start another CSRF request");
    release();
    await pending;
    assert.equal(form().props["aria-busy"], false);
    assert.equal(submit().props.disabled, false);
    assert.equal(calls.length, expectedCalls);
    assert.deepEqual(logs, [], "Authentication must not log secrets or errors");
    const feedback = findElement(render(), (node) => node.props?.kind === "error");
    if (message) {
      assert.equal(feedback.props.message, message);
      assert.doesNotMatch(feedback.props.message, /test-only-password|test-csrf|TypeError|stack/);
      assert.deepEqual(navigation, []);
      assert.equal(storage.size, 0);
      assert.equal(findElement(render(), (node) => node.props?.id === "password").props.value, password);
    } else {
      assert.equal(feedback, undefined);
      assert.deepEqual(navigation, ["/dashboard"]);
      assert.deepEqual([...storage.keys()], ["user"]);
      assert.deepEqual(JSON.parse(storage.get("user")), user);
      assert.doesNotMatch(storage.get("user"), /test-only-password|test-csrf/);
    }
  });
}

async function loadAuthComponent(entry) {
  const module = await loadModuleGraph(entry, {
    externals: new Map([
      ["react", react],
      ["react/jsx-runtime", jsxRuntime],
      ["react-icons/fi", icons],
      ["react-router-dom", {
        useNavigate: () => () => assert.fail("Render must not navigate"),
        Link: ({ to, children, ...props }) => createElement("a", { href: to, ...props }, children),
      }],
      ["../api/usersApi", {
        login: () => assert.fail("Render must not authenticate"),
        LoginError: class extends Error {},
      }],
      ["../../assets/seb_background_img.png", { default: "/assets/building.png" }],
      ["../../assets/seb_logo_white.png", { default: "/assets/logo.png" }],
      ["../../styles/login.css", {}],
    ]),
  });
  return module.default;
}

test("Login renders email-compatible empty fields and interactive backend-ready controls", async () => {
  const Login = await loadAuthComponent("../src/pages/Login.tsx");
  const markup = renderToStaticMarkup(createElement(Login));
  const inputs = markup.match(/<input\b[^>]*>/g);

  assert.match(markup, /Välkommen tillbaka/);
  assert.match(markup, /Efficient payments for a/);
  assert.match(markup, /alt="SEB"/);
  assert.match(inputs[0], /type="email"/);
  assert.match(inputs[0], /autoComplete="username"/);
  assert.match(inputs[0], /required=""/);
  assert.match(inputs[0], /value=""/);
  assert.match(inputs[1], /type="password"/);
  assert.match(inputs[1], /autoComplete="current-password"/);
  assert.match(inputs[1], /required=""/);
  assert.match(inputs[1], /value=""/);
  assert.match(inputs[2], /type="checkbox"/);
  assert.doesNotMatch(inputs[2], /disabled=/);
  assert.doesNotMatch(inputs[2], /checked=/);
  assert.match(markup, /aria-label="Visa lösenord"/);
  assert.match(markup, /<a href="\/forgot-password" class="login-forgot"/);
  assert.match(markup, /<button type="button" class="login-seb-id">SEB ID/);
  assert.match(markup, /id="login-remember-info"[^>]*>[^<]*ändrar inte inloggningstiden ännu/);
  assert.match(markup, /href="tel:0771365365">077-136 53 65/);
  assert.doesNotMatch(markup, /0771-62|login-unavailable/);
  assert.doesNotMatch(markup, /lisa@|login-card|accessToken/);
});

test("recovery renders a real frontend route with native email validation and explicit backend limitation", async () => {
  const ForgotPassword = await loadAuthComponent("../src/pages/ForgotPassword.tsx");
  const markup = renderToStaticMarkup(createElement(ForgotPassword));

  assert.match(markup, /id="recovery-title"[^>]*tabindex="-1"/);
  assert.match(markup, /type="email"[^>]*id="recovery-email"/);
  assert.match(markup, /autoComplete="email"/);
  assert.match(markup, /required="" value=""/);
  assert.match(markup, /ingen återställningsbegäran kan skickas ännu/);
  assert.match(markup, /<a href="\/" class="login-back-link"/);
  assert.match(markup, /Tillbaka till inloggning/);
  assert.doesNotMatch(markup, /role="alert"|type="password"/);
});

for (const [kind, role] of [["info", "status"], ["loading", "status"], ["error", "alert"]]) {
  test(`${kind} feedback has accessible ${role} semantics and escapes messages`, async () => {
    const AuthFeedback = await loadAuthComponent("../src/components/auth/AuthFeedback.tsx");
    const markup = renderToStaticMarkup(createElement(AuthFeedback, {
      kind, id: "feedback", message: "<script>test</script>",
    }));

    assert.match(markup, new RegExp(`login-feedback--${kind}`));
    assert.match(markup, new RegExp(`role="${role}"`));
    assert.match(markup, /id="feedback"/);
    assert.match(markup, /aria-atomic="true"/);
    assert.match(markup, /&lt;script&gt;test&lt;\/script&gt;/);
    assert.doesNotMatch(markup, /<script>/);
  });
}
