import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import * as icons from "react-icons/fi";
import ts from "typescript";

// Render the production components with the installed React runtime. Only
// TypeScript loading is adapted; JSX, badges and icons use their real modules.
async function loadTimelineComponent() {
  const context = createContext({});
  const modules = new Map();
  const externalModules = new Map([
    ["react/jsx-runtime", jsxRuntime],
    ["react-icons/fi", icons],
  ]);

  async function loadModule(identifier) {
    if (modules.has(identifier)) return modules.get(identifier);
    const namespace = externalModules.get(identifier);
    if (namespace) {
      const names = Object.keys(namespace);
      const module = new SyntheticModule(names, function () {
        for (const name of names) this.setExport(name, namespace[name]);
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
    const module = new SourceTextModule(outputText, { context, identifier });
    modules.set(identifier, module);
    await module.link((specifier, parent) => loadModule(
      externalModules.has(specifier)
        ? specifier
        : new URL(`${specifier}.tsx`, parent.identifier).href
    ));
    return module;
  }

  const module = await loadModule(new URL(
    "../src/components/approvals/ApprovalTimeline.tsx", import.meta.url
  ).href);
  await module.evaluate();
  return module.namespace.default;
}

const ApprovalTimeline = await loadTimelineComponent();

function step(overrides = {}) {
  return {
    approvalStepId: "3f2b7c1e-8a4d-4b6a-9d52-1c0e7f5a9b34",
    stepNumber: 1,
    status: "pending",
    attestantName: "Johan Berg",
    decidedByName: null,
    decidedAt: null,
    comment: null,
    decisionSource: null,
    ...overrides,
  };
}

function render(timeline) {
  return renderToStaticMarkup(createElement(ApprovalTimeline, { timeline }));
}

test("timeline shows who is waiting, including a step without an assigned attestant", () => {
  const markup = render([
    step(),
    step({ approvalStepId: "other-step", stepNumber: 2, attestantName: null }),
  ]);

  assert.match(markup, /Attesttidslinje/);
  assert.match(markup, /<ol[^>]*role="list"/);
  assert.equal((markup.match(/<li\b/g) ?? []).length, 2);
  assert.equal((markup.match(/Väntar på godkännande/g) ?? []).length, 2);
  assert.match(markup, /Tilldelad: <strong>Johan Berg<\/strong>/);
  assert.match(markup, /Tilldelad: <strong>Inte tilldelad<\/strong>/);
  assert.ok(markup.indexOf("Atteststeg 1") < markup.indexOf("Atteststeg 2"));
  assert.doesNotMatch(markup, /Godkänd av|Avvisad av|Tidpunkt saknas/);
});

test("an approval names the actual administrator separately from the assigned attestant", () => {
  const markup = render([step({
    status: "approved",
    decidedByName: "Sara Ek",
    decisionSource: "manual",
    decidedAt: "2026-10-08T12:30:00Z",
  })]);

  assert.match(markup, /Tilldelad: <strong>Johan Berg<\/strong>/);
  assert.match(markup, /Godkänd av <strong>Sara Ek<\/strong>/);
  assert.doesNotMatch(markup, /Godkänd av <strong>Johan Berg<\/strong>/);
});

test("a manual rejection names its actual actor and shows the saved comment", () => {
  const markup = render([step({
    status: "rejected",
    decidedByName: "Johan Berg",
    decisionSource: "manual",
    decidedAt: "2026-10-08T12:30:00Z",
    comment: "Fel mottagare",
  })]);

  assert.match(markup, /Avvisad av <strong>Johan Berg<\/strong>/);
  assert.match(markup, /Kommentar: Fel mottagare/);
});

for (const status of ["approved", "rejected"]) {
  test(`a legacy ${status} step reports its unknown actor without crediting the assignee`, () => {
    const markup = render([step({
      status,
      decidedAt: "2026-10-08T12:30:00Z",
    })]);

    assert.match(markup, /Tilldelad: <strong>Johan Berg<\/strong>/);
    assert.match(markup, /Uppgift om beslutsfattare saknas/);
    assert.doesNotMatch(markup, /Godkänd av|Avvisad av/);
  });
}

test("an automatically stopped step is shown as interrupted without an invented rejection actor", () => {
  const markup = render([step({
    status: "rejected",
    attestantName: "Eva Nord",
    decisionSource: "payment_rejected",
    decidedAt: "2026-10-08T12:30:00Z",
  })]);

  assert.match(markup, />Avbruten</);
  assert.match(markup, /Avbruten eftersom betalningen avvisades/);
  assert.match(markup, /Tilldelad: <strong>Eva Nord<\/strong>/);
  assert.doesNotMatch(markup, /Avvisad av|Uppgift om beslutsfattare saknas/);
});

test("decision time preserves the backend ISO timestamp in a semantic time element", () => {
  const decidedAt = "2026-10-08T12:30:00Z";
  const markup = render([step({ status: "approved", decidedAt })]);

  assert.match(markup, /<time dateTime="2026-10-08T12:30:00Z">[^<]+<\/time>/);
  assert.doesNotMatch(markup, /Tidpunkt saknas/);
});

for (const decidedAt of [null, "invalid-date"]) {
  test(`an unavailable decision time has an explicit fallback (${decidedAt})`, () => {
    const markup = render([step({ status: "approved", decidedAt })]);

    assert.match(markup, /Tidpunkt saknas/);
    assert.doesNotMatch(markup, /<time\b|Invalid Date/);
  });
}

test("comments remain visible text and cannot insert markup into the timeline", () => {
  const markup = render([step({
    status: "approved",
    comment: '<script>alert("test")</script> & granskat',
  })]);

  assert.match(markup, /Kommentar: &lt;script&gt;alert\(&quot;test&quot;\)&lt;\/script&gt; &amp; granskat/);
  assert.doesNotMatch(markup, /<script\b/);
});

for (const timeline of [undefined, []]) {
  test(`missing timeline data renders a useful fallback (${timeline === undefined ? "missing" : "empty"})`, () => {
    const markup = render(timeline);

    assert.match(markup, /Uppgifter om tidslinjen saknas/);
    assert.match(markup, /Uppdatera listan/);
    assert.doesNotMatch(markup, /<ol\b/);
  });
}
