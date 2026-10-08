import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import * as react from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as jsxRuntime from "react/jsx-runtime";
import * as icons from "react-icons/fi";
import ts from "typescript";

const src = new URL("../src/", import.meta.url);
const paymentSubtitle = "Skapa, granska och spåra alla företagets utgående betalningar.";
const auditSubtitle = "Registrerade händelser för ditt företag.";
const overview = { recentPayments: [], user: null, tenantName: null };

// Render the production pages and shared header. Only navigation, API reads
// and Sidebar are isolated; effects do not run during server rendering.
async function loadComponent(path, reactRuntime = react) {
  const context = createContext({});
  const modules = new Map();
  const externals = new Map([
    ["react", reactRuntime],
    ["react/jsx-runtime", jsxRuntime],
    ["react-icons/fi", icons],
    ["react-router-dom", {
      Link: ({ to, children, ...props }) => react.createElement("a", { href: to, ...props }, children),
    }],
    [new URL("components/dashboard/Sidebar.tsx", src).href, { default: () => null }],
    [new URL("hooks/usePaymentOverview.ts", src).href, {
      usePaymentOverview: () => ({ data: overview, isLoading: false, error: null, needsLogin: false, retry: () => {} }),
    }],
    [new URL("api/auditLogApi.ts", src).href, { AuditLogApiError: class extends Error {}, getAuditLog: () => {} }],
    [new URL("api/accountsApi.ts", src).href, { getAccounts: () => {} }],
    [new URL("api/paymentsApi.ts", src).href, { createPayment: () => {} }],
  ]);

  async function load(identifier) {
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
    const source = await readFile(url, "utf8");
    const { outputText } = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: { target: ts.ScriptTarget.ES2023, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.ReactJSX },
    });
    const module = new SourceTextModule(outputText, { context, identifier });
    modules.set(identifier, module);
    await module.link((specifier, parent) => {
      if (externals.has(specifier)) return load(specifier);
      const resolved = new URL(specifier, parent.identifier);
      if (specifier.endsWith(".css")) return load(resolved.href);
      const tsUrl = new URL(`${specifier}.ts`, parent.identifier);
      return load(existsSync(tsUrl) ? tsUrl.href : `${resolved.href}.tsx`);
    });
    return module;
  }

  const module = await load(new URL(path, src).href);
  await module.evaluate();
  return module.namespace.default;
}

const Payments = await loadComponent("pages/Payments.tsx");
const AuditLog = await loadComponent("pages/AuditLog.tsx");
const NewPayment = await loadComponent("pages/NewPayment.tsx");
const PaymentsLayout = await loadComponent("components/payments/PaymentsLayout.tsx");
const DashboardHeader = await loadComponent("components/dashboard/DashboardHeader.tsx");
const render = (component, props) => renderToStaticMarkup(react.createElement(component, props));

test("Payments has one main heading with its subtitle directly beneath it in the header", () => {
  const markup = render(Payments);
  assert.equal((markup.match(/<h1\b/g) ?? []).length, 1);
  assert.match(markup, new RegExp(`<header[^>]*class="dashboard-header"[^>]*><div[^>]*><h1>Betalningar</h1><p>${paymentSubtitle}</p>`));
  assert.doesNotMatch(markup, /Hantering av betalningar|payments-intro|payments-title/);
  assert.equal((markup.match(new RegExp(paymentSubtitle, "g")) ?? []).length, 1);
});

test("Payments retains upload, creation, filters, table and pagination controls", () => {
  const markup = render(Payments);
  assert.match(markup, /href="\/batch-upload"[^>]*>.*Ladda upp betalfil<\/a>/);
  assert.match(markup, /href="\/new-payment"[^>]*>.*Ny betalning<\/a>/);
  assert.match(markup, /Status för inlästa betalningar/);
  assert.match(markup, /Rensa filter/);
  assert.match(markup, /<table class="payments-table"/);
  assert.match(markup, /aria-label="Sidor för inlästa senaste betalningar"/);
});

test("Audit Log has one heading with its subtitle directly beneath it in the header", () => {
  const markup = render(AuditLog);
  assert.equal((markup.match(/<h1\b/g) ?? []).length, 1);
  assert.match(markup, new RegExp(`<header[^>]*class="dashboard-header"[^>]*><div[^>]*><h1>Audit-logg</h1><p>${auditSubtitle}</p>`));
  assert.doesNotMatch(markup, /<h2[^>]*>Audit-logg|audit-log-intro|aria-labelledby="audit-log-heading"/);
  assert.match(markup, /<section class="audit-log-results" aria-label="Registrerade audithändelser">/);
});

test("Audit Log retains existing search and filter availability feedback", () => {
  const markup = render(AuditLog);
  assert.match(markup, /name="search"/);
  for (const name of ["dateRange", "action", "user"]) assert.match(markup, new RegExp(`name="${name}"`));
  assert.match(markup, /Sökning och filtrering är inte tillgängliga ännu. Inga filter har tillämpats./);
  assert.match(markup, /Hämtar granskningslogg/);
});

test("NewPayment includes a semantic back link with an arrow before the existing form", () => {
  const markup = render(NewPayment);
  assert.match(markup, /<a href="\/payments" class="new-payment-back"><svg[^>]*aria-hidden="true".*Tillbaka<\/a>/);
  assert.ok(markup.indexOf('class="new-payment-back"') < markup.indexOf('<form class="new-payment-form"'));
  assert.match(markup, /name="fromAccountId"[^>]*required/);
  assert.match(markup, /name="toIban"[^>]*required/);
  assert.match(markup, /name="amount" type="number" min="0.01" step="0.01"/);
  assert.match(markup, /name="reference"/);
});

test("Payment detail layouts still omit the optional subtitle and unavailable search", () => {
  const markup = render(PaymentsLayout, { title: "Betalningar – Detaljer", overview: null, contentClassName: "payments-details-content" });
  assert.match(markup, /<h1>Betalningar – Detaljer<\/h1><p><\/p>/);
  assert.doesNotMatch(markup, /type="search"|Skapa, granska/);
  assert.match(markup, /disabled=""[^>]*title="Notifikationer är inte tillgängliga"/);
});

test("Shared header defaults, welcome text, search and notification availability stay unchanged", () => {
  const markup = render(DashboardHeader, { user: { name: "Test User" } });
  assert.match(markup, /<h1>Översikt<\/h1><p>Välkommen, Test User!<\/p>/);
  assert.match(markup, /type="search"/);
  assert.match(markup, /disabled=""[^>]*title="Notifikationer är inte tillgängliga"/);
  const interactive = render(DashboardHeader, { subtitle: "En explicit beskrivning", onNotificationClick: () => {} });
  assert.match(interactive, /<p>En explicit beskrivning<\/p>/);
  assert.doesNotMatch(interactive, /disabled=""/);
});

test("Shared header still forwards search changes and notification clicks to existing callbacks", async () => {
  const updates = [];
  const Header = await loadComponent("components/dashboard/DashboardHeader.tsx", {
    ...react, useState: () => ["", (value) => updates.push(value)],
  });
  const searches = [];
  let notificationClicks = 0;
  const tree = Header({ onSearch: (value) => searches.push(value), onNotificationClick: () => notificationClicks++ });
  function find(element, type) {
    if (element?.type === type) return element;
    return react.Children.toArray(element?.props?.children).map((child) => find(child, type)).find(Boolean);
  }
  find(tree, "input").props.onChange({ target: { value: "betalning" } });
  find(tree, "button").props.onClick();
  assert.deepEqual(updates, ["betalning"]);
  assert.deepEqual(searches, ["betalning"]);
  assert.equal(notificationClicks, 1);
});
