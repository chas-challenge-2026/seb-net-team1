import assert from "node:assert/strict";
import { existsSync } from "node:fs";
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

// Load the real presentation helper and event dialog. Server rendering avoids
// browser effects; any attempt to fetch a visitor IP fails the test.
const context = createContext({
  Headers,
  fetch: () => { throw new Error("Displaying an audit event must not look up the current visitor IP"); },
});
const modules = new Map();
const externals = new Map([
  ["react", React],
  ["react/jsx-runtime", jsxRuntime],
  ["react-icons/fi", icons],
  ["react-router-dom", router],
]);

async function loadModule(identifier) {
  if (modules.has(identifier)) return modules.get(identifier);
  const external = externals.get(identifier) ?? (identifier.endsWith(".css") ? {} : null);
  if (external) {
    const names = Object.keys(external);
    const module = new SyntheticModule(names, function () {
      for (const name of names) this.setExport(name, external[name]);
    }, { context, identifier });
    modules.set(identifier, module);
    return module;
  }

  const url = new URL(identifier);
  const { outputText } = ts.transpileModule(await readFile(url, "utf8"), {
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
    initializeImportMeta: (meta) => { meta.env = {}; },
  });
  modules.set(identifier, module);
  await module.link((specifier, parent) => {
    if (externals.has(specifier)) return loadModule(specifier);
    const url = new URL(specifier, parent.identifier);
    if (specifier.endsWith(".css")) return loadModule(url.href);
    const tsUrl = new URL(`${specifier}.ts`, parent.identifier);
    return loadModule(existsSync(tsUrl) ? tsUrl.href : `${url.href}.tsx`);
  });
  return module;
}

const dialogModule = await loadModule(new URL(
  "../src/components/audit/AuditEntryDetails.tsx", import.meta.url
).href);
await dialogModule.evaluate();
const AuditEntryDetails = dialogModule.namespace.default;
const presentation = await loadModule(new URL(
  "../src/utils/auditPresentation.ts", import.meta.url
).href);
const { formatAuditIpAddress } = presentation.namespace;

function renderEvent(ipAddress) {
  const originalError = console.error;
  console.error = (message, ...args) => {
    if (typeof message === "string" && message.startsWith(
      "Warning: useLayoutEffect does nothing on the server"
    )) return;
    originalError(message, ...args);
  };
  try {
    return renderToStaticMarkup(React.createElement(AuditEntryDetails, {
      entry: {
        id: 35,
        action: "CREATE_RECIPIENT",
        entityType: "recipient",
        entityId: 1,
        description: "Mottagare tillagd",
        createdAt: "2026-10-14T11:22:24Z",
        userName: "Test User",
        ...(ipAddress === undefined ? {} : { ipAddress }),
      },
      onClose: () => {},
    }));
  } finally {
    console.error = originalError;
  }
}

for (const [name, input, expected] of [
  ["IPv4", " 198.51.100.42 ", "198.51.100.42"],
  ["IPv6", "2001:db8:85a3:0000:0000:8a2e:0370:7334", "2001:db8:85a3:0000:0000:8a2e:0370:7334"],
]) {
  test(`the selected event displays its stored ${name} address`, () => {
    assert.equal(formatAuditIpAddress(input), expected);
    assert.ok(renderEvent(input).includes(`<dt>IP-adress</dt><dd>${expected}</dd>`));
  });
}

for (const ipAddress of [undefined, null, "", "   "]) {
  test(`legacy or missing event IP has an explicit fallback (${String(ipAddress)})`, () => {
    assert.equal(formatAuditIpAddress(ipAddress), null);
    assert.match(renderEvent(ipAddress), /<dt>IP-adress<\/dt><dd>Uppgift saknas<\/dd>/);
  });
}

test("stored address text cannot insert markup into the selected event", () => {
  const markup = renderEvent("<script>injected()</script>");
  assert.match(markup, /<dt>IP-adress<\/dt><dd>&lt;script&gt;injected\(\)&lt;\/script&gt;<\/dd>/);
  assert.doesNotMatch(markup, /<script\b/);
});
