import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import * as icons from "react-icons/fi";
import * as router from "react-router-dom";
import ts from "typescript";

const baseUrl = "http://localhost:8081";

// Run the production modules with the installed React/router runtime and the
// real shared API client. Adapt TypeScript, Vite assets and browser globals only.
async function loadProductionModule(relativePath, globals = {}) {
  const context = createContext({
    Headers,
    URLSearchParams,
    localStorage: { getItem: () => null },
    ...globals,
  });
  const modules = new Map();
  const externalModules = new Map([
    ["react", React],
    ["react/jsx-runtime", jsxRuntime],
    ["react-icons/fi", icons],
    ["react-router-dom", router],
  ]);

  async function loadModule(identifier) {
    if (modules.has(identifier)) return modules.get(identifier);
    const namespace = externalModules.get(identifier);
    if (namespace || /\.(css|png)$/.test(identifier)) {
      const exports = namespace ?? (identifier.endsWith(".png")
        ? { default: identifier }
        : {});
      const names = Object.keys(exports);
      const module = new SyntheticModule(names, function () {
        for (const name of names) this.setExport(name, exports[name]);
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
      initializeImportMeta: (meta) => {
        meta.env = { VITE_API_URL: baseUrl };
      },
    });
    modules.set(identifier, module);
    await module.link((specifier, parent) => loadModule(
      externalModules.has(specifier)
        ? specifier
        : new URL(
          /\.(css|png)$/.test(specifier) ? specifier : `${specifier}.ts`,
          parent.identifier
        ).href
    ));
    return module;
  }

  const module = await loadModule(new URL(relativePath, import.meta.url).href);
  await module.evaluate();
  return module.namespace;
}

const { default: Sidebar } = await loadProductionModule(
  "../src/components/dashboard/Sidebar.tsx"
);

function renderSidebar(user) {
  // This test deliberately renders the client router on the server. Preserve
  // other React diagnostics without repeating its expected effect warning.
  const originalError = console.error;
  console.error = (message, ...args) => {
    if (typeof message === "string" && message.startsWith(
      "Warning: useLayoutEffect does nothing on the server"
    )) return;
    originalError(message, ...args);
  };
  try {
    return renderToStaticMarkup(React.createElement(
      router.MemoryRouter,
      { initialEntries: ["/audit-log"] },
      React.createElement(Sidebar, { user })
    ));
  } finally {
    console.error = originalError;
  }
}

function user(role) {
  return { id: 1, name: "Test Användare", role };
}

for (const role of ["admin", "attestant"]) {
  test(`the ${role} Sidebar includes the audit log navigation`, () => {
    const markup = renderSidebar(user(role));

    assert.match(markup, /href="\/audit-log"/);
    assert.match(markup, /Audit-logg/);
    assert.match(markup, /dashboard-sidebar-link active/);
  });
}

for (const role of ["initiator", "unknown-role"]) {
  test(`the ${role} Sidebar omits the audit log navigation`, () => {
    const markup = renderSidebar(user(role));

    assert.doesNotMatch(markup, /href="\/audit-log"|Audit-logg/);
    assert.match(markup, /href="\/payments"/);
  });
}

test("a missing user or role cannot expose the audit log navigation", () => {
  for (const currentUser of [undefined, user(undefined)]) {
    const markup = renderSidebar(currentUser);

    assert.doesNotMatch(markup, /href="\/audit-log"|Audit-logg/);
    assert.match(markup, /href="\/payments"/);
  }
});

async function loadApi(response) {
  const calls = [];
  const api = await loadProductionModule("../src/api/auditLogApi.ts", {
    fetch: async (url, options = {}) => {
      calls.push({ url, options });
      assert.equal(calls.length, 1, "Audit GET must not request CSRF or retry automatically");
      return new Response(JSON.stringify(response.body), {
        status: response.status ?? 200,
      });
    },
  });
  return { api, calls };
}

function assertAuditGet(calls) {
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, "GET");
  assert.equal(calls[0].options.credentials, "include");
  assert.equal(calls[0].options.headers.has("X-CSRF-TOKEN"), false);
  assert.equal(calls[0].options.body, undefined);
  assert.equal(new URL(calls[0].url).pathname, "/api/audit-log");
}

test("audit GET sends cookies, cursor and abort signal without requesting CSRF", async () => {
  const expected = { entries: [], nextCursor: null };
  const { api, calls } = await loadApi({ body: expected });
  const controller = new AbortController();
  const cursor = "opaque/+token=&role=admin";

  assert.deepEqual(await api.getAuditLog({
    limit: 25,
    cursor,
    signal: controller.signal,
  }), expected);
  assertAuditGet(calls);
  assert.equal(calls[0].options.signal, controller.signal);
  const requestedUrl = new URL(calls[0].url);
  assert.equal(requestedUrl.origin, baseUrl);
  assert.equal(requestedUrl.searchParams.get("limit"), "25");
  assert.equal(requestedUrl.searchParams.get("cursor"), cursor);
  assert.equal(requestedUrl.searchParams.has("role"), false);
});

for (const [status, message] of [
  [403, "Du saknar behörighet"],
  [401, "Åtkomst nekad. Logga in igen."],
  [500, "Kunde inte hämta granskningsloggen. Försök igen."],
]) {
  test(`audit HTTP ${status} retains its typed status and safe Swedish message`, async () => {
    const { api, calls } = await loadApi({
      status,
      body: { detail: "Connection secret: database-password" },
    });

    await assert.rejects(api.getAuditLog(), (error) => {
      assert.ok(error instanceof api.AuditLogApiError);
      assert.equal(error.status, status);
      assert.equal(error.message, message);
      assert.doesNotMatch(error.message, /Connection|secret|database-password/);
      return true;
    });
    assertAuditGet(calls);
    assert.equal(calls[0].url, `${baseUrl}/api/audit-log?limit=50`);
  });
}
